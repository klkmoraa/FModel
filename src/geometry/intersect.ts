import { angleInSweep, angleToParam, TAU } from './angle';
import { boxesIntersect, inflate } from './bbox';
import type { ArcCurve, Curve, EllipseCurve } from './curves';
import {
  curveBBox,
  curveDerivative,
  curvePoint,
  ellipseAngleOfPoint,
  isBounded,
  tessellateWithParams,
} from './curves';
import { TOL } from './tolerance';
import type { Vec2 } from './vec';
import { cross, dist, dot, len, sub } from './vec';

export interface Hit {
  p: Vec2;
  /** parámetro sobre la primera curva */
  t1: number;
  /** parámetro sobre la segunda curva */
  t2: number;
}

export interface IntersectOptions {
  /** Trata la primera curva como extendida (línea infinita, círculo completo, elipse completa). */
  extend1?: boolean;
  extend2?: boolean;
  tol?: number;
}

interface LineLike {
  p: Vec2;
  d: Vec2;
  tmin: number;
  tmax: number;
}

function asLineLike(c: Curve, extend: boolean): LineLike | null {
  if (c.kind === 'line') return { p: c.a, d: sub(c.b, c.a), tmin: extend ? -Infinity : 0, tmax: extend ? Infinity : 1 };
  if (c.kind === 'ray') return { p: c.o, d: c.d, tmin: extend ? -Infinity : 0, tmax: Infinity };
  if (c.kind === 'xline') return { p: c.o, d: c.d, tmin: -Infinity, tmax: Infinity };
  return null;
}

const inRange = (t: number, lo: number, hi: number, eps: number) => t >= lo - eps && t <= hi + eps;

function lineLineHits(a: LineLike, b: LineLike, tol: number): { t1: number; t2: number; p: Vec2 }[] {
  const den = cross(a.d, b.d);
  const la = len(a.d);
  const lb = len(b.d);
  if (Math.abs(den) <= TOL.ANGULAR * la * lb) return [];
  const w = sub(b.p, a.p);
  const t1 = cross(w, b.d) / den;
  const t2 = cross(w, a.d) / den;
  const e1 = la > 0 ? tol / la : 0;
  const e2 = lb > 0 ? tol / lb : 0;
  if (!inRange(t1, a.tmin, a.tmax, e1) || !inRange(t2, b.tmin, b.tmax, e2)) return [];
  const clampT = (t: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, t));
  const ct1 = Number.isFinite(a.tmin) || Number.isFinite(a.tmax) ? clampT(t1, a.tmin, a.tmax) : t1;
  const ct2 = Number.isFinite(b.tmin) || Number.isFinite(b.tmax) ? clampT(t2, b.tmin, b.tmax) : t2;
  return [{ t1: ct1, t2: ct2, p: { x: a.p.x + a.d.x * t1, y: a.p.y + a.d.y * t1 } }];
}

function lineCircle(l: LineLike, c: Vec2, r: number, tol: number): { t: number; p: Vec2 }[] {
  const f = sub(l.p, c);
  const A = dot(l.d, l.d);
  if (A === 0) return [];
  const B = 2 * dot(f, l.d);
  const C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  const out: { t: number; p: Vec2 }[] = [];
  // tangencia con tolerancia: distancia del centro a la recta ≈ r
  const distToLine = Math.abs(cross(f, l.d)) / Math.sqrt(A);
  if (disc < 0) {
    if (Math.abs(distToLine - r) <= tol) disc = 0;
    else return out;
  }
  const sq = Math.sqrt(Math.max(0, disc));
  // tangencia: criterio geométrico (distancia centro-recta ≈ radio), independiente de |d|
  const tangent = Math.abs(distToLine - r) <= Math.max(tol, r * 1e-12);
  const ts = tangent ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  const e = tol / Math.sqrt(A);
  for (const t of ts) {
    if (inRange(t, l.tmin, l.tmax, e)) out.push({ t, p: { x: l.p.x + l.d.x * t, y: l.p.y + l.d.y * t } });
  }
  return out;
}

function arcParam(a: ArcCurve, p: Vec2, extend: boolean, tol: number): number | null {
  const ang = Math.atan2(p.y - a.c.y, p.x - a.c.x);
  const full = Math.abs(a.sweep) >= TAU - 1e-12;
  const angTol = a.r > 0 ? tol / a.r : 0;
  if (!extend && !full && !angleInSweep(ang, a.a0, a.sweep, angTol)) return null;
  let t = angleToParam(ang, a.a0, a.sweep);
  if (full) t = ((t % 1) + 1) % 1;
  else if (!extend) t = Math.min(1, Math.max(0, t));
  return t;
}

function circleCircle(c1: Vec2, r1: number, c2: Vec2, r2: number, tol: number): Vec2[] {
  const d = dist(c1, c2);
  if (d <= tol && Math.abs(r1 - r2) <= tol) return []; // coincidentes: infinitas, se ignoran
  if (d > r1 + r2 + tol || d < Math.abs(r1 - r2) - tol || d === 0) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const ux = (c2.x - c1.x) / d;
  const uy = (c2.y - c1.y) / d;
  const px = c1.x + a * ux;
  const py = c1.y + a * uy;
  if (h2 <= tol * tol * 1e-2 || Math.abs(d - (r1 + r2)) <= tol || Math.abs(d - Math.abs(r1 - r2)) <= tol) {
    return [{ x: px, y: py }];
  }
  const h = Math.sqrt(h2);
  return [
    { x: px - h * uy, y: py + h * ux },
    { x: px + h * uy, y: py - h * ux },
  ];
}

function ellipseParam(e: EllipseCurve, p: Vec2, extend: boolean, tol: number): number | null {
  const th = ellipseAngleOfPoint(e, p);
  const full = Math.abs(e.sweep) >= TAU - 1e-12;
  const scaleR = Math.max(len(e.major) * e.ratio, 1e-12);
  if (!extend && !full && !angleInSweep(th, e.a0, e.sweep, tol / scaleR)) return null;
  let t = angleToParam(th, e.a0, e.sweep);
  if (full) t = ((t % 1) + 1) % 1;
  else if (!extend) t = Math.min(1, Math.max(0, t));
  return t;
}

function lineEllipse(l: LineLike, e: EllipseCurve, extendE: boolean, tol: number): Hit[] {
  // Transformar al marco donde la elipse es el círculo unitario.
  const L = len(e.major);
  if (L === 0 || e.ratio === 0) return [];
  const ux = e.major.x / L;
  const uy = e.major.y / L;
  const toLocal = (q: Vec2): Vec2 => {
    const dx = q.x - e.c.x;
    const dy = q.y - e.c.y;
    return { x: (dx * ux + dy * uy) / L, y: (-dx * uy + dy * ux) / (L * e.ratio) };
  };
  const lp = toLocal(l.p);
  const ld = { x: (l.d.x * ux + l.d.y * uy) / L, y: (-l.d.x * uy + l.d.y * ux) / (L * e.ratio) };
  const hits = lineCircle({ p: lp, d: ld, tmin: l.tmin, tmax: l.tmax }, { x: 0, y: 0 }, 1, tol / (L * e.ratio));
  const out: Hit[] = [];
  for (const h of hits) {
    const wp = { x: l.p.x + l.d.x * h.t, y: l.p.y + l.d.y * h.t };
    const t2 = ellipseParam(e, wp, extendE, tol);
    if (t2 !== null) out.push({ p: wp, t1: h.t, t2 });
  }
  return out;
}

function swap(hits: Hit[]): Hit[] {
  return hits.map((h) => ({ p: h.p, t1: h.t2, t2: h.t1 }));
}

function fullCopy(c: Curve): Curve {
  if (c.kind === 'arc') return { ...c, sweep: c.sweep >= 0 ? TAU : -TAU };
  if (c.kind === 'ellipse') return { ...c, sweep: c.sweep >= 0 ? TAU : -TAU };
  return c;
}

/** Intersecciones entre dos curvas. */
export function intersectCurves(c1: Curve, c2: Curve, opts: IntersectOptions = {}): Hit[] {
  const tol = opts.tol ?? 1e-9;
  const e1 = !!opts.extend1;
  const e2 = !!opts.extend2;
  const l1 = asLineLike(c1, e1);
  const l2 = asLineLike(c2, e2);

  if (l1 && l2) return lineLineHits(l1, l2, tol).map((h) => ({ p: h.p, t1: h.t1, t2: h.t2 }));

  if (l1 && c2.kind === 'arc') {
    const out: Hit[] = [];
    for (const h of lineCircle(l1, c2.c, c2.r, tol)) {
      const t2 = arcParam(c2, h.p, e2, tol);
      if (t2 !== null) out.push({ p: h.p, t1: h.t, t2 });
    }
    return out;
  }
  if (c1.kind === 'arc' && l2) return swap(intersectCurves(c2, c1, { extend1: e2, extend2: e1, tol }));

  if (c1.kind === 'arc' && c2.kind === 'arc') {
    const out: Hit[] = [];
    for (const p of circleCircle(c1.c, c1.r, c2.c, c2.r, tol)) {
      const t1 = arcParam(c1, p, e1, tol);
      const t2 = arcParam(c2, p, e2, tol);
      if (t1 !== null && t2 !== null) out.push({ p, t1, t2 });
    }
    return out;
  }

  if (l1 && c2.kind === 'ellipse') return lineEllipse(l1, c2, e2, tol);
  if (c1.kind === 'ellipse' && l2) return swap(lineEllipse(l2, c1, e1, tol));

  // Caso general numérico (elipse-arco, elipse-elipse, splines, polilíneas teseladas)
  const a = e1 ? fullCopy(c1) : c1;
  const b = e2 ? fullCopy(c2) : c2;
  if (!isBounded(a) || !isBounded(b)) {
    return numericWithUnbounded(a, b, tol, c1, c2, e1, e2);
  }
  if (!boxesIntersect(inflate(curveBBox(a), tol), inflate(curveBBox(b), tol))) return [];
  const hits = numericIntersect(a, b, tol);
  return hits.map((h) => ({
    p: h.p,
    t1: remapParam(c1, a, h.t1, e1),
    t2: remapParam(c2, b, h.t2, e2),
  }));
}

function remapParam(orig: Curve, used: Curve, t: number, extended: boolean): number {
  if (!extended || orig === used) return t;
  const p = curvePoint(used, t);
  if (orig.kind === 'arc') return arcParam(orig, p, true, 1e-9) ?? t;
  if (orig.kind === 'ellipse') return ellipseParam(orig, p, true, 1e-9) ?? t;
  return t;
}

function numericWithUnbounded(a: Curve, b: Curve, tol: number, o1: Curve, o2: Curve, e1: boolean, e2: boolean): Hit[] {
  // Recorta la curva no acotada a la caja de la otra (ampliada) y resuelve con segmentos.
  const bounded = isBounded(a) ? a : b;
  const unb = isBounded(a) ? b : a;
  const box = inflate(curveBBox(bounded), Math.max(1, tol));
  const l = asLineLike(unb, true)!;
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) + dist(l.p, { x: box.minX, y: box.minY });
  const tlo = Math.max(l.tmin, -diag * 2);
  const thi = Math.min(l.tmax, diag * 2);
  const seg: Curve = {
    kind: 'line',
    a: { x: l.p.x + l.d.x * tlo, y: l.p.y + l.d.y * tlo },
    b: { x: l.p.x + l.d.x * thi, y: l.p.y + l.d.y * thi },
  };
  const hits = numericIntersect(seg, bounded, tol).map((h) => ({ p: h.p, tu: tlo + (thi - tlo) * h.t1, tb: h.t2 }));
  return hits.map((h) =>
    bounded === a
      ? { p: h.p, t1: remapParam(o1, a, h.tb, e1), t2: h.tu }
      : { p: h.p, t1: h.tu, t2: remapParam(o2, b, h.tb, e2) },
  );
}

/** Intersección por teselado + refinamiento de Newton sobre F(t1,t2) = P1(t1) − P2(t2). */
export function numericIntersect(a: Curve, b: Curve, tol = 1e-9): Hit[] {
  const sa = tessellateWithParams(a, 1e-3);
  const sb = tessellateWithParams(b, 1e-3);
  const raw: Hit[] = [];
  for (let i = 1; i < sa.length; i++) {
    const p0 = sa[i - 1];
    const p1 = sa[i];
    const minX = Math.min(p0.p.x, p1.p.x) - 1e-6;
    const maxX = Math.max(p0.p.x, p1.p.x) + 1e-6;
    const minY = Math.min(p0.p.y, p1.p.y) - 1e-6;
    const maxY = Math.max(p0.p.y, p1.p.y) + 1e-6;
    for (let j = 1; j < sb.length; j++) {
      const q0 = sb[j - 1];
      const q1 = sb[j];
      if (Math.max(q0.p.x, q1.p.x) < minX || Math.min(q0.p.x, q1.p.x) > maxX) continue;
      if (Math.max(q0.p.y, q1.p.y) < minY || Math.min(q0.p.y, q1.p.y) > maxY) continue;
      const hits = lineLineHits(
        { p: p0.p, d: sub(p1.p, p0.p), tmin: 0, tmax: 1 },
        { p: q0.p, d: sub(q1.p, q0.p), tmin: 0, tmax: 1 },
        1e-7,
      );
      for (const h of hits) {
        raw.push({ p: h.p, t1: p0.t + (p1.t - p0.t) * h.t1, t2: q0.t + (q1.t - q0.t) * h.t2 });
      }
    }
  }
  const refined: Hit[] = [];
  for (const h of raw) {
    let t1 = h.t1;
    let t2 = h.t2;
    for (let k = 0; k < TOL.NEWTON_MAX_ITER; k++) {
      const P = curvePoint(a, t1);
      const Q = curvePoint(b, t2);
      const F = sub(P, Q);
      if (Math.hypot(F.x, F.y) < tol * 1e-3) break;
      const dA = curveDerivative(a, t1);
      const dB = curveDerivative(b, t2);
      // [dA  -dB] [δ1 δ2]ᵀ = -F
      const det = dA.x * -dB.y - -dB.x * dA.y;
      if (Math.abs(det) < 1e-18) break;
      const d1 = (-F.x * -dB.y - -dB.x * -F.y) / det;
      const d2 = (dA.x * -F.y - -F.x * dA.y) / det;
      t1 = Math.min(1, Math.max(0, t1 + d1));
      t2 = Math.min(1, Math.max(0, t2 + d2));
    }
    const P = curvePoint(a, t1);
    const Q = curvePoint(b, t2);
    const good = dist(P, Q) <= Math.max(tol * 10, 1e-7) ? { p: P, t1, t2 } : h;
    if (!refined.some((r) => dist(r.p, good.p) <= Math.max(tol * 100, 1e-6))) refined.push(good);
  }
  return refined;
}

/** Intersecciones de una curva consigo misma (para detección de autointersecciones en polilíneas). */
export function selfIntersections(segments: Curve[], closed: boolean, tol = 1e-9): { i: number; j: number; hit: Hit }[] {
  const out: { i: number; j: number; hit: Hit }[] = [];
  const n = segments.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (closed && i === 0 && j === n - 1);
      const hits = intersectCurves(segments[i], segments[j], { tol });
      for (const h of hits) {
        if (adjacent) {
          // ignorar el vértice compartido
          const sharedEnd = j === i + 1 ? h.t1 >= 1 - 1e-9 && h.t2 <= 1e-9 : h.t1 <= 1e-9 && h.t2 >= 1 - 1e-9;
          if (sharedEnd) continue;
        }
        out.push({ i, j, hit: h });
      }
    }
  }
  return out;
}
