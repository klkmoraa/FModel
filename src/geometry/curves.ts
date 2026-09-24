import { angleInSweep, angleToParam, normAngle, TAU } from './angle';
import type { BBox } from './bbox';
import { boxFromPoints, emptyBox, expandPoint } from './bbox';
import type { Mat2D } from './matrix';
import { applyToPoint, applyToVector, determinant, isSimilarity, uniformScale } from './matrix';
import type { SplineData } from './spline';
import {
  reverseSpline,
  splineDerivative,
  splineDomain,
  splinePoint,
  splitSpline,
  TessellationLimitError,
  tessellateSpline,
} from './spline';
import { clamp, TOL } from './tolerance';
import type { Vec2 } from './vec';
import { add, cross, dist, dot, len, normalize, perp, scale, sub } from './vec';

/**
 * Primitivas de curva del núcleo. Toda entidad CAD con geometría lineal se
 * descompone en estas curvas para intersecciones, snaps, recorte y offset.
 *
 * Parámetro `t`:
 *  - line, arc, ellipse, spline, poly: normalizado a [0, 1].
 *  - ray: distancia desde el origen, [0, ∞).
 *  - xline: distancia con signo, (-∞, ∞).
 */
export interface LineCurve {
  kind: 'line';
  a: Vec2;
  b: Vec2;
}
export interface RayCurve {
  kind: 'ray';
  o: Vec2;
  d: Vec2;
}
export interface XLineCurve {
  kind: 'xline';
  o: Vec2;
  d: Vec2;
}
/** Arco con barrido con signo: θ(t) = a0 + sweep·t. |sweep| = 2π es un círculo completo. */
export interface ArcCurve {
  kind: 'arc';
  c: Vec2;
  r: number;
  a0: number;
  sweep: number;
}
/** Elipse: P(θ) = c + major·cosθ + minor·sinθ, minor = perp(major)·ratio, θ = a0 + sweep·t. */
export interface EllipseCurve {
  kind: 'ellipse';
  c: Vec2;
  major: Vec2;
  ratio: number;
  a0: number;
  sweep: number;
}
export interface SplineCurve {
  kind: 'spline';
  s: SplineData;
}
export interface PolyCurve {
  kind: 'poly';
  pts: Vec2[];
}

export type Curve = LineCurve | RayCurve | XLineCurve | ArcCurve | EllipseCurve | SplineCurve | PolyCurve;

export interface CurveLengthProfile {
  readonly curve: Curve;
  readonly samples: readonly { p: Vec2; t: number }[];
  readonly cumulativeLengths: readonly number[];
  readonly totalLength: number;
}

export const lineCurve = (a: Vec2, b: Vec2): LineCurve => ({ kind: 'line', a, b });
export const arcCurve = (c: Vec2, r: number, a0: number, sweep: number): ArcCurve => ({ kind: 'arc', c, r, a0, sweep });
export const circleCurve = (c: Vec2, r: number): ArcCurve => ({ kind: 'arc', c, r, a0: 0, sweep: TAU });

export function isBounded(c: Curve): boolean {
  return c.kind !== 'ray' && c.kind !== 'xline';
}

export function isClosedCurve(c: Curve): boolean {
  if (c.kind === 'arc' || c.kind === 'ellipse') return Math.abs(c.sweep) >= TAU - 1e-12;
  if (c.kind === 'poly') return c.pts.length > 2 && dist(c.pts[0], c.pts[c.pts.length - 1]) <= TOL.LINEAR;
  if (c.kind === 'spline') return dist(curveStart(c), curveEnd(c)) <= TOL.LINEAR;
  return false;
}

export function paramRange(c: Curve): [number, number] {
  if (c.kind === 'ray') return [0, Infinity];
  if (c.kind === 'xline') return [-Infinity, Infinity];
  return [0, 1];
}

function ellipseMinor(e: EllipseCurve): Vec2 {
  return scale(perp(e.major), e.ratio);
}

export function ellipsePointAtAngle(e: EllipseCurve, theta: number): Vec2 {
  const mn = ellipseMinor(e);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: e.c.x + e.major.x * c + mn.x * s, y: e.c.y + e.major.y * c + mn.y * s };
}

function interpolateSegment(a: Vec2, b: Vec2, t: number): Vec2 {
  const xSpan = b.x - a.x;
  const ySpan = b.y - a.y;
  return {
    x: Number.isFinite(xSpan) ? a.x + xSpan * t : a.x * (1 - t) + b.x * t,
    y: Number.isFinite(ySpan) ? a.y + ySpan * t : a.y * (1 - t) + b.y * t,
  };
}

export function curvePoint(c: Curve, t: number): Vec2 {
  switch (c.kind) {
    case 'line':
      return interpolateSegment(c.a, c.b, t);
    case 'ray':
    case 'xline':
      return { x: c.o.x + c.d.x * t, y: c.o.y + c.d.y * t };
    case 'arc': {
      const th = c.a0 + c.sweep * t;
      return { x: c.c.x + c.r * Math.cos(th), y: c.c.y + c.r * Math.sin(th) };
    }
    case 'ellipse':
      return ellipsePointAtAngle(c, c.a0 + c.sweep * t);
    case 'spline': {
      const [u0, u1] = splineDomain(c.s);
      return splinePoint(c.s, u0 + (u1 - u0) * clamp(t, 0, 1));
    }
    case 'poly': {
      const n = c.pts.length - 1;
      if (n <= 0) return c.pts[0] ?? { x: 0, y: 0 };
      const f = clamp(t, 0, 1) * n;
      const i = Math.min(n - 1, Math.floor(f));
      const lt = f - i;
      const a = c.pts[i];
      const b = c.pts[i + 1];
      return interpolateSegment(a, b, lt);
    }
  }
}

/** Derivada dP/dt. */
export function curveDerivative(c: Curve, t: number): Vec2 {
  switch (c.kind) {
    case 'line':
      return sub(c.b, c.a);
    case 'ray':
    case 'xline':
      return c.d;
    case 'arc': {
      const th = c.a0 + c.sweep * t;
      return { x: -c.r * Math.sin(th) * c.sweep, y: c.r * Math.cos(th) * c.sweep };
    }
    case 'ellipse': {
      const th = c.a0 + c.sweep * t;
      const mn = ellipseMinor(c);
      return {
        x: (-c.major.x * Math.sin(th) + mn.x * Math.cos(th)) * c.sweep,
        y: (-c.major.y * Math.sin(th) + mn.y * Math.cos(th)) * c.sweep,
      };
    }
    case 'spline': {
      const [u0, u1] = splineDomain(c.s);
      const d = splineDerivative(c.s, u0 + (u1 - u0) * clamp(t, 0, 1));
      return scale(d, u1 - u0);
    }
    case 'poly': {
      const n = c.pts.length - 1;
      if (n <= 0) return { x: 1, y: 0 };
      const i = Math.min(n - 1, Math.max(0, Math.floor(clamp(t, 0, 1) * n)));
      return scale(sub(c.pts[i + 1], c.pts[i]), n);
    }
  }
}

export function curveTangent(c: Curve, t: number): Vec2 {
  if (c.kind === 'line') return unitDisplacement(c.a, c.b);
  if (c.kind === 'ray' || c.kind === 'xline') {
    const magnitude = Math.max(Math.abs(c.d.x), Math.abs(c.d.y));
    return magnitude ? normalize({ x: c.d.x / magnitude, y: c.d.y / magnitude }) : { x: 0, y: 0 };
  }
  if (c.kind === 'poly' && c.pts.length > 1) {
    const n = c.pts.length - 1;
    const i = Math.min(n - 1, Math.max(0, Math.floor(clamp(t, 0, 1) * n)));
    return unitDisplacement(c.pts[i], c.pts[i + 1]);
  }
  return normalize(curveDerivative(c, t));
}

export const curveStart = (c: Curve): Vec2 => curvePoint(c, 0);
export const curveEnd = (c: Curve): Vec2 => (c.kind === 'ray' || c.kind === 'xline' ? c.o : curvePoint(c, 1));

export function curveLength(c: Curve): number {
  switch (c.kind) {
    case 'line':
      return dist(c.a, c.b);
    case 'ray':
    case 'xline':
      return Infinity;
    case 'arc':
      return Math.abs(c.sweep) * c.r;
    case 'ellipse':
    case 'spline': {
      const pts = tessellateCurve(c, 1e-4);
      let l = 0;
      for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
      return l;
    }
    case 'poly': {
      let l = 0;
      for (let i = 1; i < c.pts.length; i++) l += dist(c.pts[i - 1], c.pts[i]);
      return l;
    }
  }
}

/** Precalcula los tramos muestreados y sus longitudes acumuladas para consultas repetidas. */
export function curveLengthProfile(c: Curve, tol = 1e-4): CurveLengthProfile {
  const samples = tessellateWithParams(c, tol);
  const cumulativeLengths = [0];
  for (let i = 1; i < samples.length; i++) {
    cumulativeLengths.push(cumulativeLengths[i - 1] + dist(samples[i - 1].p, samples[i].p));
  }
  return { curve: c, samples, cumulativeLengths, totalLength: cumulativeLengths[cumulativeLengths.length - 1] ?? 0 };
}

/** Parámetro al recorrer una longitud de arco desde el inicio. */
export function paramAtLength(c: Curve, length: number, cachedProfile?: CurveLengthProfile): number {
  if (c.kind === 'line') {
    const l = dist(c.a, c.b);
    return l === 0 ? 0 : length / l;
  }
  if (c.kind === 'arc') return length / (Math.abs(c.sweep) * c.r || 1);
  if (c.kind === 'ray' || c.kind === 'xline') return length;
  if (Number.isNaN(length)) return 1;
  const profile = cachedProfile?.curve === c ? cachedProfile : curveLengthProfile(c);
  const { samples, cumulativeLengths, totalLength } = profile;
  if (length > totalLength || samples.length < 2) return 1;
  let lo = 1;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cumulativeLengths[mid] >= length) hi = mid;
    else lo = mid + 1;
  }
  const before = cumulativeLengths[lo - 1];
  const seg = cumulativeLengths[lo] - before;
  const f = seg === 0 ? 0 : (length - before) / seg;
  return samples[lo - 1].t + (samples[lo].t - samples[lo - 1].t) * f;
}

export function curveBBox(c: Curve): BBox {
  switch (c.kind) {
    case 'line':
      return boxFromPoints([c.a, c.b]);
    case 'ray':
    case 'xline':
      return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
    case 'arc': {
      const b = boxFromPoints([curvePoint(c, 0), curvePoint(c, 1)]);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        if (angleInSweep(a, c.a0, c.sweep, 1e-12)) {
          expandPoint(b, { x: c.c.x + c.r * Math.cos(a), y: c.c.y + c.r * Math.sin(a) });
        }
      }
      return b;
    }
    case 'ellipse': {
      const b = boxFromPoints([curvePoint(c, 0), curvePoint(c, 1)]);
      const mn = ellipseMinor(c);
      // extremos: dX/dθ = 0 → tanθ = mn.x/major.x ; dY/dθ = 0 → tanθ = mn.y/major.y
      const cands = [Math.atan2(mn.x, c.major.x), Math.atan2(mn.y, c.major.y)];
      for (const a of cands) {
        for (const th of [a, a + Math.PI]) {
          if (angleInSweep(th, c.a0, c.sweep, 1e-12)) expandPoint(b, ellipsePointAtAngle(c, th));
        }
      }
      return b;
    }
    case 'spline': {
      // La envolvente convexa de los puntos de control acota la curva; afinamos con teselado.
      return boxFromPoints(tessellateCurve(c, 1e-3));
    }
    case 'poly':
      return c.pts.length ? boxFromPoints(c.pts) : emptyBox();
  }
}

function finiteSamples(samples: { p: Vec2; t: number }[]): { p: Vec2; t: number }[] {
  return samples.every(({ p, t }) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(t)) ? samples : [];
}

export function tessellateWithParams(c: Curve, tol: number = TOL.TESSELLATION, maxSamples = Infinity): { p: Vec2; t: number }[] {
  if ((!Number.isSafeInteger(maxSamples) && maxSamples !== Infinity) || maxSamples < 1) throw new RangeError('Invalid curve tessellation sample limit.');
  const assertSampleBudget = (count: number) => {
    if (count > maxSamples) throw new TessellationLimitError();
  };
  switch (c.kind) {
    case 'line':
      assertSampleBudget(2);
      return finiteSamples([
        { p: c.a, t: 0 },
        { p: c.b, t: 1 },
      ]);
    case 'ray':
    case 'xline':
      assertSampleBudget(2);
      return finiteSamples([
        { p: c.o, t: 0 },
        { p: add(c.o, c.d), t: 1 },
      ]);
    case 'arc':
    case 'ellipse': {
      const r = c.kind === 'arc' ? c.r : Math.max(len(c.major), len(c.major) * c.ratio);
      const segs = arcSegments(r, Math.abs(c.sweep), tol);
      if (!segs) return [];
      assertSampleBudget(segs + 1);
      const out: { p: Vec2; t: number }[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const p = curvePoint(c, t);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
        out.push({ p, t });
      }
      return out;
    }
    case 'spline': {
      const [u0, u1] = splineDomain(c.s);
      const span = u1 - u0 || 1;
      return finiteSamples(tessellateSpline(c.s, tol, maxSamples).map((q) => ({ p: q.p, t: (q.u - u0) / span })));
    }
    case 'poly': {
      assertSampleBudget(c.pts.length);
      const n = c.pts.length - 1;
      return finiteSamples(c.pts.map((p, i) => ({ p, t: n > 0 ? i / n : 0 })));
    }
  }
}

export function tessellateCurve(c: Curve, tol: number = TOL.TESSELLATION, maxSamples = Infinity): Vec2[] {
  return tessellateWithParams(c, tol, maxSamples).map((s) => s.p);
}

/** Número de segmentos para que la flecha cordal no exceda `tol`. */
export function arcSegments(r: number, sweep: number, tol: number): number {
  if (!Number.isFinite(r) || !Number.isFinite(sweep) || !Number.isFinite(tol) || r < 0 || sweep < 0 || tol < 0) return 0;
  if (r <= tol) return Math.max(2, Math.min(4096, Math.ceil(sweep / (Math.PI / 4))));
  const maxAngle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / r)));
  const n = Math.ceil(sweep / Math.max(maxAngle, 1e-4));
  return Math.max(2, Math.min(4096, n));
}

function scaledDisplacement(from: Vec2, to: Vec2): { x: number; y: number; scale: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Number.isFinite(dx) && Number.isFinite(dy)) {
    const scale = Math.max(Math.abs(dx), Math.abs(dy));
    return scale ? { x: dx / scale, y: dy / scale, scale } : { x: 0, y: 0, scale: 0 };
  }
  const scale = Math.max(Math.abs(from.x), Math.abs(from.y), Math.abs(to.x), Math.abs(to.y));
  return { x: to.x / scale - from.x / scale, y: to.y / scale - from.y / scale, scale };
}

function unitDisplacement(from: Vec2, to: Vec2): Vec2 {
  const d = scaledDisplacement(from, to);
  if (d.scale * Math.hypot(d.x, d.y) <= TOL.LINEAR) return { x: 0, y: 0 };
  return normalize({ x: d.x, y: d.y });
}

/** Parámetro del punto de la curva más cercano a p (dentro del dominio). */
export function closestParam(c: Curve, p: Vec2): number {
  switch (c.kind) {
    case 'line': {
      const d = scaledDisplacement(c.a, c.b);
      if (!d.scale) return 0;
      const q = scaledDisplacement(c.a, p);
      if (!q.scale) return 0;
      const projection = q.x * d.x + q.y * d.y;
      if (!projection) return 0;
      return clamp((q.scale / d.scale) * (projection / (d.x * d.x + d.y * d.y)), 0, 1);
    }
    case 'ray':
    case 'xline': {
      const directionScale = Math.max(Math.abs(c.d.x), Math.abs(c.d.y));
      if (!directionScale) return 0;
      const displacement = scaledDisplacement(c.o, p);
      if (!displacement.scale) return 0;
      const dx = c.d.x / directionScale;
      const dy = c.d.y / directionScale;
      const projection = displacement.x * dx + displacement.y * dy;
      if (!projection) return 0;
      const t = (displacement.scale / directionScale) * (projection / (dx * dx + dy * dy));
      return c.kind === 'ray' ? Math.max(0, t) : t;
    }
    case 'arc': {
      if (Math.abs(c.sweep) >= TAU - 1e-12) {
        const a = Math.atan2(p.y - c.c.y, p.x - c.c.x);
        return normAngle((a - c.a0) * Math.sign(c.sweep)) / TAU;
      }
      const a = Math.atan2(p.y - c.c.y, p.x - c.c.x);
      if (angleInSweep(a, c.a0, c.sweep)) return clamp(angleToParam(a, c.a0, c.sweep), 0, 1);
      return dist(p, curvePoint(c, 0)) <= dist(p, curvePoint(c, 1)) ? 0 : 1;
    }
    default:
      return numericClosest(c, p);
  }
}

function numericClosest(c: Curve, p: Vec2): number {
  const samples = tessellateWithParams(c, 1e-3);
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const d = dist(samples[i].p, p);
    if (d < bestD) {
      bestD = d;
      bestT = samples[i].t;
    }
    if (i > 0) {
      const a = samples[i - 1];
      const b = samples[i];
      const ab = sub(b.p, a.p);
      const l2 = dot(ab, ab);
      if (l2 > 0) {
        const f = clamp(dot(sub(p, a.p), ab) / l2, 0, 1);
        const q = add(a.p, scale(ab, f));
        const dq = dist(q, p);
        if (dq < bestD) {
          bestD = dq;
          bestT = a.t + (b.t - a.t) * f;
        }
      }
    }
  }
  // refinamiento de Newton sobre f(t) = (P(t)-p)·P'(t)
  let t = bestT;
  for (let k = 0; k < 16; k++) {
    const pt = curvePoint(c, t);
    const d1 = curveDerivative(c, t);
    const h = 1e-6;
    const d2 = scale(sub(curveDerivative(c, Math.min(1, t + h)), curveDerivative(c, Math.max(0, t - h))), 1 / (2 * h));
    const diff = sub(pt, p);
    const f = dot(diff, d1);
    const fp = dot(d1, d1) + dot(diff, d2);
    if (Math.abs(fp) < 1e-15) break;
    const nt = clamp(t - f / fp, 0, 1);
    if (Math.abs(nt - t) < 1e-12) {
      t = nt;
      break;
    }
    t = nt;
  }
  return dist(curvePoint(c, t), p) <= bestD + 1e-12 ? t : bestT;
}

export function closestPoint(c: Curve, p: Vec2): Vec2 {
  return curvePoint(c, closestParam(c, p));
}

export function distanceToCurve(c: Curve, p: Vec2): number {
  return dist(closestPoint(c, p), p);
}

/** Sub-curva entre t0 y t1 (t0 < t1 conserva la dirección). */
export function subCurve(c: Curve, t0: number, t1: number): Curve {
  switch (c.kind) {
    case 'line':
      return { kind: 'line', a: curvePoint(c, t0), b: curvePoint(c, t1) };
    case 'ray':
    case 'xline':
      if (Number.isFinite(t0) && Number.isFinite(t1)) return { kind: 'line', a: curvePoint(c, t0), b: curvePoint(c, t1) };
      if (Number.isFinite(t0)) return { kind: 'ray', o: curvePoint(c, t0), d: c.d };
      if (Number.isFinite(t1)) return { kind: 'ray', o: curvePoint(c, t1), d: scale(c.d, -1) };
      return c;
    case 'arc':
      return { kind: 'arc', c: c.c, r: c.r, a0: c.a0 + c.sweep * t0, sweep: c.sweep * (t1 - t0) };
    case 'ellipse':
      return { ...c, a0: c.a0 + c.sweep * t0, sweep: c.sweep * (t1 - t0) };
    case 'spline': {
      const [u0, u1] = splineDomain(c.s);
      const ua = u0 + (u1 - u0) * t0;
      const ub = u0 + (u1 - u0) * t1;
      let s: SplineData | null = c.s;
      const [, right] = splitSpline(s, ua);
      s = right;
      if (!s) return { kind: 'poly', pts: [curvePoint(c, t0), curvePoint(c, t1)] };
      const [su0, su1] = splineDomain(s);
      const ubLocal = su0 + ((ub - ua) / (u1 - ua || 1)) * (su1 - su0);
      const [left] = splitSpline(s, ubLocal);
      return { kind: 'spline', s: left ?? s };
    }
    case 'poly': {
      const n = c.pts.length - 1;
      const pts: Vec2[] = [curvePoint(c, t0)];
      for (let i = 1; i < n; i++) {
        const ti = i / n;
        if (ti > t0 + 1e-12 && ti < t1 - 1e-12) pts.push(c.pts[i]);
      }
      pts.push(curvePoint(c, t1));
      return { kind: 'poly', pts };
    }
  }
}

export function reverseCurve(c: Curve): Curve {
  switch (c.kind) {
    case 'line':
      return { kind: 'line', a: c.b, b: c.a };
    case 'ray':
    case 'xline':
      return { ...c, d: scale(c.d, -1) };
    case 'arc':
      return { kind: 'arc', c: c.c, r: c.r, a0: c.a0 + c.sweep, sweep: -c.sweep };
    case 'ellipse':
      return { ...c, a0: c.a0 + c.sweep, sweep: -c.sweep };
    case 'spline':
      return { kind: 'spline', s: reverseSpline(c.s) };
    case 'poly':
      return { kind: 'poly', pts: [...c.pts].reverse() };
  }
}

export function transformCurve(c: Curve, m: Mat2D): Curve {
  switch (c.kind) {
    case 'line':
      return { kind: 'line', a: applyToPoint(m, c.a), b: applyToPoint(m, c.b) };
    case 'ray':
    case 'xline':
      return { kind: c.kind, o: applyToPoint(m, c.o), d: normalize(applyToVector(m, c.d)) };
    case 'arc': {
      if (isSimilarity(m)) {
        const center = applyToPoint(m, c.c);
        const p0 = applyToPoint(m, { x: c.c.x + c.r * Math.cos(c.a0), y: c.c.y + c.r * Math.sin(c.a0) });
        const a0 = Math.atan2(p0.y - center.y, p0.x - center.x);
        const mirror = determinant(m) < 0;
        return { kind: 'arc', c: center, r: c.r * uniformScale(m), a0, sweep: mirror ? -c.sweep : c.sweep };
      }
      const e: EllipseCurve = { kind: 'ellipse', c: c.c, major: { x: c.r, y: 0 }, ratio: 1, a0: c.a0, sweep: c.sweep };
      return transformCurve(e, m);
    }
    case 'ellipse': {
      // Transformar dos diámetros conjugados y recuperar los ejes principales.
      const mn = ellipseMinor(c);
      const center = applyToPoint(m, c.c);
      const u = applyToVector(m, c.major);
      const w = applyToVector(m, mn);
      const { major, ratio, phase } = principalAxes(u, w);
      // Segundo semidiámetro en la fase principal; su orientación decide si hay espejo.
      const q = add(scale(u, -Math.sin(phase)), scale(w, Math.cos(phase)));
      const mirror = cross(major, q) < 0;
      return {
        kind: 'ellipse',
        c: center,
        major,
        ratio,
        a0: mirror ? phase - c.a0 : c.a0 - phase,
        sweep: mirror ? -c.sweep : c.sweep,
      };
    }
    case 'spline':
      return {
        kind: 'spline',
        s: {
          ...c.s,
          ctrl: c.s.ctrl.map((p) => applyToPoint(m, p)),
          fit: c.s.fit?.map((p) => applyToPoint(m, p)),
        },
      };
    case 'poly':
      return { kind: 'poly', pts: c.pts.map((p) => applyToPoint(m, p)) };
  }
}

/**
 * Dados dos semidiámetros conjugados u (θ=0) y w (θ=π/2) de P(θ)=u·cosθ+w·sinθ,
 * devuelve el semieje mayor, la razón menor/mayor y la fase φ tal que
 * P(θ) = major·cos(θ-φ) + minor·sin(θ-φ)·s, con s=±1 según orientación.
 */
export function principalAxes(u: Vec2, w: Vec2): { major: Vec2; ratio: number; phase: number } {
  // |P|² = A cos² + B sin² + 2C sinθcosθ
  const A = dot(u, u);
  const B = dot(w, w);
  const C = dot(u, w);
  const phase = 0.5 * Math.atan2(2 * C, A - B);
  const p0 = add(scale(u, Math.cos(phase)), scale(w, Math.sin(phase)));
  const p1 = add(scale(u, Math.cos(phase + Math.PI / 2)), scale(w, Math.sin(phase + Math.PI / 2)));
  const l0 = len(p0);
  const l1 = len(p1);
  if (l0 >= l1) return { major: p0, ratio: l0 === 0 ? 1 : l1 / l0, phase };
  return { major: p1, ratio: l1 === 0 ? 1 : l0 / l1, phase: phase + Math.PI / 2 };
}

/** Ángulo excéntrico de un punto sobre la elipse (sin validar pertenencia). */
export function ellipseAngleOfPoint(e: EllipseCurve, p: Vec2): number {
  const d = sub(p, e.c);
  const L = len(e.major);
  const ux = e.major.x / L;
  const uy = e.major.y / L;
  const x = (d.x * ux + d.y * uy) / L;
  const y = (-d.x * uy + d.y * ux) / (L * e.ratio);
  return Math.atan2(y, x);
}

export function curveMidpoint(c: Curve): Vec2 {
  if (c.kind === 'line') return { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 };
  if (c.kind === 'arc') return curvePoint(c, 0.5);
  if (!isBounded(c)) return (c as RayCurve).o;
  return curvePoint(c, paramAtLength(c, curveLength(c) / 2));
}
