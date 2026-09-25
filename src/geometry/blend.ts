import type { Curve } from './curves';
import { curveDerivative, curvePoint } from './curves';
import type { SplineData } from './spline';
import type { Vec2 } from './vec';
import { add, cross, dist, len, normalize, perp, scale } from './vec';

/**
 * Curvas de enlace (BLEND) entre extremos de dos objetos.
 * - Tangente (G1): Bézier cúbica; la curva sale y llega con la dirección de los objetos.
 * - Suave (G2): Bézier quíntica; además iguala la curvatura en ambos extremos.
 * Se devuelven como B-spline sujeta (nudos de Bézier), representable en DXF sin pérdida.
 */

export interface BlendEnd {
  p: Vec2;
  /** dirección unitaria hacia fuera del objeto (prolongándolo más allá de su extremo) */
  t: Vec2;
  /** curvatura con signo respecto a la normal izquierda de `t` al prolongar el objeto */
  k: number;
}

/** Datos de extremo de una curva: `atEnd` elige el final (t = 1) o el inicio (t = 0). */
export function curveEndData(c: Curve, atEnd: boolean): BlendEnd | null {
  const t = atEnd ? 1 : 0;
  const d1 = curveDerivative(c, t);
  const l = len(d1);
  if (!(l > 1e-12) || !Number.isFinite(l)) return null;
  const dir = scale(d1, 1 / l);
  const kappa = c.kind === 'line' || c.kind === 'poly' ? 0 : c.kind === 'arc' ? Math.sign(c.sweep) / c.r : sampledCurvature(c, atEnd);
  return atEnd ? { p: curvePoint(c, 1), t: dir, k: kappa } : { p: curvePoint(c, 0), t: scale(dir, -1), k: -kappa };
}

/** Curvatura en un extremo por diferencias de segundo orden sobre puntos (vale para splines). */
function sampledCurvature(c: Curve, atEnd: boolean): number {
  const h = 1e-3;
  const s = atEnd ? -1 : 1;
  const [p0, p1, p2, p3] = [0, 1, 2, 3].map((i) => curvePoint(c, atEnd ? 1 - i * h : i * h));
  // fórmulas unilaterales de segundo orden
  const d1 = scale(add(add(scale(p0, -3), scale(p1, 4)), scale(p2, -1)), s / (2 * h));
  const d2 = scale(add(add(add(scale(p0, 2), scale(p1, -5)), scale(p2, 4)), scale(p3, -1)), 1 / (h * h));
  const l = len(d1);
  return l > 1e-12 ? cross(d1, d2) / (l * l * l) : 0;
}

export type BlendMode = 'tangent' | 'smooth';

export function blendSpline(a: BlendEnd, b: BlendEnd, mode: BlendMode): SplineData | null {
  const d = dist(a.p, b.p);
  if (!(d > 1e-12) || !Number.isFinite(d)) return null;
  const ta = normalize(a.t);
  const tb = normalize(b.t);
  if (mode === 'tangent') {
    const h = d / 3;
    return { degree: 3, ctrl: [a.p, add(a.p, scale(ta, h)), add(b.p, scale(tb, h)), b.p], knots: [0, 0, 0, 0, 1, 1, 1, 1] };
  }
  // B(t) quíntica: B'(0) = 5(P1−P0), B''(0) = 20(P2 − 2P1 + P0); se pide |B'(0)| = 5h y
  // curvatura k ⇒ P2 = P0 + 2h·t + (5/4)·k·h²·n, con n la normal izquierda de t.
  const h = d / 5;
  const bend = (k: number) => (5 / 4) * k * h * h;
  const p1 = add(a.p, scale(ta, h));
  const p2 = add(add(a.p, scale(ta, 2 * h)), scale(perp(ta), bend(a.k)));
  const p4 = add(b.p, scale(tb, h));
  const p3 = add(add(b.p, scale(tb, 2 * h)), scale(perp(tb), bend(b.k)));
  return { degree: 5, ctrl: [a.p, p1, p2, p3, p4, b.p], knots: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1] };
}
