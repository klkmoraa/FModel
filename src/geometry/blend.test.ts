import { describe, expect, it } from 'vitest';
import { arcCurve, curveDerivative, curvePoint, lineCurve } from './curves';
import { blendSpline, curveEndData } from './blend';
import { cross, len, normalize } from './vec';

const splineCurve = (s: NonNullable<ReturnType<typeof blendSpline>>) => ({ kind: 'spline' as const, s });

describe('curvas de enlace (BLEND)', () => {
  const a = lineCurve({ x: 0, y: 0 }, { x: 10, y: 0 });
  const b = lineCurve({ x: 20, y: 10 }, { x: 20, y: 20 });

  it('tangente: empieza y termina en los extremos con la dirección de cada objeto', () => {
    const ea = curveEndData(a, true)!;
    const eb = curveEndData(b, false)!;
    const s = blendSpline(ea, eb, 'tangent')!;
    const c = splineCurve(s);
    expect(curvePoint(c, 0)).toEqual({ x: 10, y: 0 });
    const end = curvePoint(c, 1);
    expect(end.x).toBeCloseTo(20, 12);
    expect(end.y).toBeCloseTo(10, 12);
    const t0 = normalize(curveDerivative(c, 0));
    const t1 = normalize(curveDerivative(c, 1));
    expect(t0.x).toBeCloseTo(1, 9);
    expect(t1.y).toBeCloseTo(1, 9);
  });

  it('suave: iguala la curvatura del arco en la unión', () => {
    const arc = arcCurve({ x: 0, y: 5 }, 5, -Math.PI / 2, Math.PI / 2);
    const ea = curveEndData(arc, true)!;
    expect(ea.k).toBeCloseTo(1 / 5, 4);
    const s = blendSpline(ea, curveEndData(b, false)!, 'smooth')!;
    expect(s.degree).toBe(5);
    const c = splineCurve(s);
    // curvatura medida con puntos (la derivada de spline es por diferencias finitas)
    const h = 1e-3;
    const [p0, p1, p2, p3] = [0, h, 2 * h, 3 * h].map((t) => curvePoint(c, t));
    const d1 = { x: (-3 * p0.x + 4 * p1.x - p2.x) / (2 * h), y: (-3 * p0.y + 4 * p1.y - p2.y) / (2 * h) };
    const d2 = { x: (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) / (h * h), y: (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) / (h * h) };
    expect(cross(d1, d2) / len(d1) ** 3).toBeCloseTo(1 / 5, 3);
    // y en el extremo de una spline también se mide bien
    expect(curveEndData(c, false)!.k).toBeCloseTo(-1 / 5, 3);
  });

  it('el inicio de un objeto se toma en sentido inverso', () => {
    const e = curveEndData(a, false)!;
    expect(e.p).toEqual({ x: 0, y: 0 });
    expect(e.t.x).toBeCloseTo(-1, 12);
  });

  it('no enlaza puntos coincidentes', () => {
    const e = curveEndData(a, true)!;
    expect(blendSpline(e, e, 'tangent')).toBeNull();
  });
});
