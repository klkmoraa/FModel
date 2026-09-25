import { describe, expect, it } from 'vitest';
import { arcCurve, circleCurve, lineCurve } from './curves';
import type { Curve } from './curves';
import { massProperties } from './massprops';
import { polylineSegments } from './polyline';

const rect = (x0: number, y0: number, b: number, h: number, cw = false): Curve[] => {
  const pts = [
    { x: x0, y: y0 },
    { x: x0 + b, y: y0 },
    { x: x0 + b, y: y0 + h },
    { x: x0, y: y0 + h },
  ];
  if (cw) pts.reverse();
  return pts.map((p, i) => lineCurve(p, pts[(i + 1) % 4]));
};

describe('propiedades de masa (MASSPROP)', () => {
  it('rectángulo: área, centroide e inercias de manual, en cualquier sentido', () => {
    for (const cw of [false, true]) {
      const m = massProperties([rect(2, 3, 6, 4, cw)])!;
      expect(m.area).toBeCloseTo(24, 12);
      expect(m.perimeter).toBeCloseTo(20, 12);
      expect(m.centroid.x).toBeCloseTo(5, 12);
      expect(m.centroid.y).toBeCloseTo(5, 12);
      expect(m.ixx).toBeCloseTo((6 * 4 ** 3) / 12, 10);
      expect(m.iyy).toBeCloseTo((4 * 6 ** 3) / 12, 10);
      expect(m.ixy).toBeCloseTo(0, 10);
      expect(m.ixxOrigin).toBeCloseTo(m.ixx + 24 * 25, 9);
      expect(m.principal.i1).toBeCloseTo(72, 10);
      expect(m.principal.i2).toBeCloseTo(32, 10);
      expect(m.exact).toBe(true);
    }
  });

  it('círculo y anillo con hueco restado por anidamiento', () => {
    const c = massProperties([[circleCurve({ x: 10, y: -4 }, 3)]])!;
    expect(c.area).toBeCloseTo(Math.PI * 9, 12);
    expect(c.ixx).toBeCloseTo((Math.PI * 3 ** 4) / 4, 10);
    expect(c.centroid.x).toBeCloseTo(10, 12);
    const ring = massProperties([[circleCurve({ x: 0, y: 0 }, 5)], [circleCurve({ x: 0, y: 0 }, 2)]])!;
    expect(ring.area).toBeCloseTo(Math.PI * (25 - 4), 11);
    expect(ring.iyy).toBeCloseTo((Math.PI * (5 ** 4 - 2 ** 4)) / 4, 9);
  });

  it('triángulo rectángulo: producto de inercia negativo y ejes principales', () => {
    const b = 6;
    const h = 3;
    const pts = [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: 0, y: h }];
    const m = massProperties([pts.map((p, i) => lineCurve(p, pts[(i + 1) % 3]))])!;
    expect(m.area).toBeCloseTo((b * h) / 2, 12);
    expect(m.ixy).toBeCloseTo(-(b * b * h * h) / 72, 10);
    expect(m.principal.i1 + m.principal.i2).toBeCloseTo(m.ixx + m.iyy, 10);
  });

  it('semicírculo de polilínea con arco: centroide 4r/3π', () => {
    const r = 5;
    const segs = polylineSegments([{ x: r, y: 0, bulge: 1 }, { x: -r, y: 0 }], true);
    const m = massProperties([segs])!;
    expect(m.area).toBeCloseTo((Math.PI * r * r) / 2, 10);
    expect(m.centroid.y).toBeCloseTo((4 * r) / (3 * Math.PI), 10);
  });

  it('coordenadas georreferenciadas no pierden precisión', () => {
    const m = massProperties([rect(512345.25, 2154321.5, 12, 8)])!;
    expect(m.area).toBeCloseTo(96, 8);
    expect(m.ixx).toBeCloseTo((12 * 8 ** 3) / 12, 6);
  });

  it('un arco abierto no forma región: área nula', () => {
    expect(massProperties([[arcCurve({ x: 0, y: 0 }, 1, 0, 0)]])).toBeNull();
    expect(massProperties([])).toBeNull();
  });
});
