import { normAngleSigned, TAU } from './angle';
import type { ArcCurve, Curve } from './curves';
import { closestParam, curvePoint } from './curves';
import { intersectCurves } from './intersect';
import { offsetCurve, setCurveEndpoint } from './offset';
import type { Vec2 } from './vec';
import { add, cross, dist, dot, normalize, scale, sub } from './vec';

export type FilletInput = Curve & { kind: 'line' | 'arc' };

export interface FilletResult {
  /** Curva 1 recortada/extendida hasta el punto de tangencia (null si se elimina) */
  c1: FilletInput | null;
  c2: FilletInput | null;
  /** Arco de empalme (null con radio 0) */
  arc: ArcCurve | null;
  t1: Vec2;
  t2: Vec2;
}

/** Parámetro "desenrollado" sobre la extensión (ángulo con signo para arcos, t para líneas). */
function extParam(c: FilletInput, p: Vec2): number {
  if (c.kind === 'line') {
    const d = sub(c.b, c.a);
    const l2 = dot(d, d) || 1;
    return dot(sub(p, c.a), d) / l2;
  }
  const ang = Math.atan2(p.y - c.c.y, p.x - c.c.x);
  return normAngleSigned(ang - c.a0) * Math.sign(c.sweep || 1);
}

function footOnExtended(c: FilletInput, p: Vec2): Vec2 {
  if (c.kind === 'line') {
    const d = sub(c.b, c.a);
    const l2 = dot(d, d) || 1;
    return add(c.a, scale(d, dot(sub(p, c.a), d) / l2));
  }
  const dir = normalize(sub(p, c.c));
  return add(c.c, scale(dir, c.r));
}

/**
 * Recorta c conservando el lado indicado por `pick` respecto al punto `x` (intersección).
 * Resultado: curva desde el extremo conservado hasta `tangent`.
 */
function trimToward(c: FilletInput, x: Vec2, pick: Vec2, tangent: Vec2): FilletInput | null {
  const tx = extParam(c, x);
  const tp = extParam(c, pick);
  const keepPositive = tp > tx; // lado del parámetro que se conserva
  if (c.kind === 'line') {
    const ta = 0;
    const tb = 1;
    const farT = keepPositive ? Math.max(ta, tb) : Math.min(ta, tb);
    const far = curvePoint(c, farT);
    if (dist(far, tangent) < 1e-12) return null;
    return keepPositive ? { kind: 'line', a: tangent, b: far } : { kind: 'line', a: far, b: tangent };
  }
  // arco: conservar extremo del lado del pick
  const startSide = extParam(c, curvePoint(c, 0));
  const endSide = extParam(c, curvePoint(c, 1));
  const keepEnd = keepPositive ? endSide >= startSide : endSide < startSide;
  const trimmed = keepEnd ? setCurveEndpoint(c, 'start', tangent) : setCurveEndpoint(c, 'end', tangent);
  return trimmed as FilletInput;
}

/** Empalme entre dos líneas/arcos. Devuelve null si no es posible. */
export function filletCurves(c1: FilletInput, p1: Vec2, c2: FilletInput, p2: Vec2, radius: number): FilletResult | null {
  const xs = intersectCurves(c1, c2, { extend1: true, extend2: true });
  // Líneas paralelas: semicírculo
  if (!xs.length && c1.kind === 'line' && c2.kind === 'line') return filletParallel(c1, p1, c2, p2);
  if (!xs.length) {
    if (radius <= 0) return null;
  }
  const x = xs.length ? xs.reduce((best, h) => (dist(h.p, p1) + dist(h.p, p2) < dist(best.p, p1) + dist(best.p, p2) ? h : best)).p : null;

  if (radius <= 1e-12) {
    if (!x) return null;
    return { c1: trimToward(c1, x, p1, x), c2: trimToward(c2, x, p2, x), arc: null, t1: x, t2: x };
  }

  let best: { center: Vec2; t1: Vec2; t2: Vec2; score: number } | null = null;
  for (const s1 of [1, -1]) {
    for (const s2 of [1, -1]) {
      const o1 = offsetCurve(c1, s1 * radius) as FilletInput | null;
      const o2 = offsetCurve(c2, s2 * radius) as FilletInput | null;
      if (!o1 || !o2) continue;
      for (const h of intersectCurves(o1, o2, { extend1: true, extend2: true })) {
        const center = h.p;
        const t1 = footOnExtended(c1, center);
        const t2 = footOnExtended(c2, center);
        if (x) {
          const side1 = Math.sign(extParam(c1, p1) - extParam(c1, x));
          const side2 = Math.sign(extParam(c2, p2) - extParam(c2, x));
          const ok1 = Math.sign(extParam(c1, t1) - extParam(c1, x)) === side1 || dist(t1, x) < 1e-9;
          const ok2 = Math.sign(extParam(c2, t2) - extParam(c2, x)) === side2 || dist(t2, x) < 1e-9;
          if (!ok1 || !ok2) continue;
        }
        const score = dist(t1, p1) + dist(t2, p2);
        if (!best || score < best.score) best = { center, t1, t2, score };
      }
    }
  }
  if (!best) return null;
  const { center, t1, t2 } = best;
  const ref = x ?? add(scale(add(t1, t2), 0.5), { x: 0, y: 0 });
  const nc1 = trimToward(c1, ref, p1, t1);
  const nc2 = trimToward(c2, ref, p2, t2);
  const a0 = Math.atan2(t1.y - center.y, t1.x - center.x);
  const a1 = Math.atan2(t2.y - center.y, t2.x - center.x);
  let sweep = normAngleSigned(a1 - a0);
  // El arco corto es el correcto para el empalme tangente
  if (Math.abs(sweep) > Math.PI + 1e-9) sweep = sweep > 0 ? sweep - TAU : sweep + TAU;
  return { c1: nc1, c2: nc2, arc: { kind: 'arc', c: center, r: radius, a0, sweep }, t1, t2 };
}

function filletParallel(l1: FilletInput & { kind: 'line' }, p1: Vec2, l2: FilletInput & { kind: 'line' }, p2: Vec2): FilletResult | null {
  const dir = normalize(sub(l1.b, l1.a));
  const foot = footOnExtended(l2, l1.a);
  const gap = dist(l1.a, foot);
  if (gap < 1e-12) return null;
  const r = gap / 2;
  // El semicírculo se coloca en el extremo de la primera línea más cercano a su designación.
  const t1 = dist(l1.a, p1) <= dist(l1.b, p1) ? l1.a : l1.b;
  const other1 = t1 === l1.a ? l1.b : l1.a;
  const out = normalize(sub(t1, other1));
  const t2 = footOnExtended(l2, t1);
  const center = scale(add(t1, t2), 0.5);
  const a0 = Math.atan2(t1.y - center.y, t1.x - center.x);
  const sweep = cross(sub(t1, center), out) > 0 ? Math.PI : -Math.PI;
  const far2 = dot(sub(l2.a, t2), out) < dot(sub(l2.b, t2), out) ? l2.a : l2.b;
  void p2;
  void dir;
  const nc2: FilletInput = { kind: 'line', a: far2, b: t2 };
  return { c1: l1, c2: nc2, arc: { kind: 'arc', c: center, r, a0, sweep }, t1, t2 };
}

export interface ChamferResult {
  c1: FilletInput | null;
  c2: FilletInput | null;
  line: Curve | null;
}

/** Chaflán por dos distancias entre dos líneas. */
export function chamferLines(l1: FilletInput & { kind: 'line' }, p1: Vec2, l2: FilletInput & { kind: 'line' }, p2: Vec2, d1: number, d2: number): ChamferResult | null {
  const xs = intersectCurves(l1, l2, { extend1: true, extend2: true });
  if (!xs.length) return null;
  const x = xs[0].p;
  const u1 = keepDirection(l1, x, p1);
  const u2 = keepDirection(l2, x, p2);
  const q1 = add(x, scale(u1, d1));
  const q2 = add(x, scale(u2, d2));
  if (d1 <= 1e-12 && d2 <= 1e-12) {
    return { c1: trimToward(l1, x, p1, x), c2: trimToward(l2, x, p2, x), line: null };
  }
  return {
    c1: trimToward(l1, x, p1, q1),
    c2: trimToward(l2, x, p2, q2),
    line: { kind: 'line', a: q1, b: q2 },
  };
}

/** Chaflán por distancia y ángulo (medido desde la primera línea). */
export function chamferLinesAngle(l1: FilletInput & { kind: 'line' }, p1: Vec2, l2: FilletInput & { kind: 'line' }, p2: Vec2, d1: number, angle: number): ChamferResult | null {
  const xs = intersectCurves(l1, l2, { extend1: true, extend2: true });
  if (!xs.length) return null;
  const x = xs[0].p;
  const u1 = keepDirection(l1, x, p1);
  const u2 = keepDirection(l2, x, p2);
  const corner = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
  const third = Math.PI - corner - angle;
  if (third <= 1e-9) return null;
  const d2 = (d1 * Math.sin(angle)) / Math.sin(third);
  return chamferLines(l1, p1, l2, p2, d1, d2);
}

function keepDirection(l: FilletInput & { kind: 'line' }, x: Vec2, pick: Vec2): Vec2 {
  const d = normalize(sub(l.b, l.a));
  const s = dot(sub(pick, x), d) >= 0 ? 1 : -1;
  return scale(d, s);
}

/** Parámetro sobre la curva original más cercano a p (reexportado para comandos). */
export const paramOn = (c: Curve, p: Vec2): number => closestParam(c, p);
