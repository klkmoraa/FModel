import { normAngle, TAU } from './angle';
import type { ArcCurve, Curve } from './curves';
import { closestPoint, curvePoint } from './curves';
import { intersectCurves } from './intersect';
import { offsetCurve } from './offset';
import type { Vec2 } from './vec';
import { add, cross, dist, len, mid, normalize, perp, scale, sub } from './vec';

/** Circunferencia por tres puntos. */
export function circleFrom3Points(a: Vec2, b: Vec2, c: Vec2): { center: Vec2; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-14) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { center, radius: dist(center, a) };
}

/** Arco que empieza en a, pasa por b y termina en c. */
export function arcFrom3Points(a: Vec2, b: Vec2, c: Vec2): ArcCurve | null {
  const circ = circleFrom3Points(a, b, c);
  if (!circ) return null;
  const { center, radius } = circ;
  const a0 = Math.atan2(a.y - center.y, a.x - center.x);
  const am = Math.atan2(b.y - center.y, b.x - center.x);
  const a1 = Math.atan2(c.y - center.y, c.x - center.x);
  const ccw = cross(sub(b, a), sub(c, b)) > 0;
  let sweep = normAngle(a1 - a0);
  if (!ccw) sweep = sweep - TAU;
  // verificar que el punto medio esté en el barrido
  const dm = ccw ? normAngle(am - a0) : normAngle(a0 - am);
  if (dm > Math.abs(sweep)) sweep = ccw ? sweep - TAU : sweep + TAU;
  return { kind: 'arc', c: center, r: radius, a0, sweep };
}

/** Arco inicio-centro-fin (CCW). */
export function arcStartCenterEnd(start: Vec2, center: Vec2, end: Vec2, ccw = true): ArcCurve {
  const r = dist(start, center);
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(end.y - center.y, end.x - center.x);
  const sweep = ccw ? normAngle(a1 - a0) || TAU : -(normAngle(a0 - a1) || TAU);
  return { kind: 'arc', c: center, r, a0, sweep };
}

/** Arco inicio-fin-dirección tangente en el inicio. */
export function arcStartEndDirection(start: Vec2, end: Vec2, dir: Vec2): ArcCurve | null {
  const chord = sub(end, start);
  const n = perp(normalize(dir));
  const denom = 2 * (n.x * chord.x + n.y * chord.y);
  if (Math.abs(denom) < 1e-14) return null;
  const r = (chord.x * chord.x + chord.y * chord.y) / denom;
  const center = add(start, scale(n, r));
  const ccw = r > 0;
  return arcStartCenterEnd(start, center, end, ccw);
}

/** Arco inicio-fin-radio (arco menor, CCW desde el inicio). */
export function arcStartEndRadius(start: Vec2, end: Vec2, radius: number): ArcCurve | null {
  const d = dist(start, end);
  const r = Math.abs(radius);
  if (d > 2 * r + 1e-12 || d < 1e-14) return null;
  const m = mid(start, end);
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) ** 2));
  const n = perp(normalize(sub(end, start)));
  // radio positivo: arco menor CCW; negativo: arco mayor
  const center = radius > 0 ? add(m, scale(n, h)) : sub(m, scale(n, h));
  return arcStartCenterEnd(start, center, end, true);
}

/** Arco inicio-centro-ángulo incluido (positivo CCW). */
export function arcStartCenterAngle(start: Vec2, center: Vec2, angle: number): ArcCurve {
  return { kind: 'arc', c: center, r: dist(start, center), a0: Math.atan2(start.y - center.y, start.x - center.x), sweep: angle };
}

/** Circunferencias tangentes a dos curvas con radio dado (TTR). Devuelve candidatas ordenadas por cercanía a las designaciones. */
export function circlesTTR(c1: Curve, p1: Vec2, c2: Curve, p2: Vec2, r: number): { center: Vec2; radius: number }[] {
  const out: { center: Vec2; radius: number; score: number }[] = [];
  for (const s1 of [1, -1]) {
    for (const s2 of [1, -1]) {
      const o1 = offsetCurve(c1, s1 * r);
      const o2 = offsetCurve(c2, s2 * r);
      if (!o1 || !o2) continue;
      for (const h of intersectCurves(o1, o2, { extend1: true, extend2: true })) {
        const t1 = closestPoint(c1.kind === 'line' ? { kind: 'xline', o: c1.a, d: normalize(sub(c1.b, c1.a)) } : c1, h.p);
        const t2 = closestPoint(c2.kind === 'line' ? { kind: 'xline', o: c2.a, d: normalize(sub(c2.b, c2.a)) } : c2, h.p);
        out.push({ center: h.p, radius: r, score: dist(t1, p1) + dist(t2, p2) });
      }
    }
  }
  out.sort((a, b) => a.score - b.score);
  return out.filter((c, i) => out.findIndex((o) => dist(o.center, c.center) < 1e-9) === i);
}

/** Puntos de tangencia desde un punto exterior a una circunferencia. */
export function tangentPointsFromPoint(p: Vec2, center: Vec2, r: number): Vec2[] {
  const d = dist(p, center);
  if (d < r - 1e-12) return [];
  if (Math.abs(d - r) <= 1e-12) return [p];
  const a = Math.atan2(p.y - center.y, p.x - center.x);
  const b = Math.acos(r / d);
  return [
    { x: center.x + r * Math.cos(a + b), y: center.y + r * Math.sin(a + b) },
    { x: center.x + r * Math.cos(a - b), y: center.y + r * Math.sin(a - b) },
  ];
}

/** Pie de la perpendicular desde p a una curva extendida. */
export function perpendicularFoot(c: Curve, p: Vec2): Vec2[] {
  if (c.kind === 'line') {
    const d = sub(c.b, c.a);
    const l2 = d.x * d.x + d.y * d.y;
    if (l2 === 0) return [];
    const t = ((p.x - c.a.x) * d.x + (p.y - c.a.y) * d.y) / l2;
    return [add(c.a, scale(d, t))];
  }
  if (c.kind === 'arc') {
    const v = sub(p, c.c);
    const l = len(v);
    if (l < 1e-14) return [];
    const u = scale(v, 1 / l);
    return [add(c.c, scale(u, c.r)), sub(c.c, scale(u, c.r))];
  }
  return [closestPoint(c, p)];
}

/** Polígono regular: vértices. */
export function regularPolygon(center: Vec2, radius: number, sides: number, rotation: number, inscribed: boolean): Vec2[] {
  // Inscrito: `rotation` apunta a un vértice. Circunscrito: apunta al punto medio de un lado.
  const r = inscribed ? radius : radius / Math.cos(Math.PI / sides);
  const offset = inscribed ? 0 : Math.PI / sides;
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + offset + (i * TAU) / sides;
    pts.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  }
  return pts;
}

export function pointOnCurveAt(c: Curve, t: number): Vec2 {
  return curvePoint(c, t);
}
