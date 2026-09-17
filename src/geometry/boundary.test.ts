import { describe, expect, it } from 'vitest';
import { detectBoundary } from './boundary';
import type { Curve } from './curves';
import { polylineSignedArea } from './polyline';

const L = (ax: number, ay: number, bx: number, by: number): Curve => ({ kind: 'line', a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('boundary detection', () => {
  it('finds the rectangle around a point', () => {
    const r = detectBoundary([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0)], { x: 5, y: 5 })!;
    expect(r).toBeTruthy();
    expect(polylineSignedArea(r.outer)).toBeCloseTo(100);
    expect(r.islands).toHaveLength(0);
  });
  it('splits by crossing line and picks correct half', () => {
    const r = detectBoundary([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0), L(4, -2, 4, 12)], { x: 7, y: 5 })!;
    expect(polylineSignedArea(r.outer)).toBeCloseTo(60);
  });
  it('overlapping lines extending past corners still close', () => {
    const r = detectBoundary([L(-2, 0, 12, 0), L(10, -2, 10, 12), L(12, 10, -2, 10), L(0, 12, 0, -2)], { x: 5, y: 5 })!;
    expect(polylineSignedArea(r.outer)).toBeCloseTo(100);
  });
  it('detects island circle and arcs in boundary', () => {
    const circle: Curve = { kind: 'arc', c: { x: 5, y: 5 }, r: 2, a0: 0, sweep: Math.PI * 2 };
    const r = detectBoundary([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0), circle], { x: 1, y: 5 })!;
    expect(r).toBeTruthy();
    expect(polylineSignedArea(r.outer)).toBeCloseTo(100);
    expect(r.islands).toHaveLength(1);
    expect(Math.abs(polylineSignedArea(r.islands[0]))).toBeCloseTo(Math.PI * 4, 6);
    // dentro del círculo, el contorno es el propio círculo
    const inner = detectBoundary([L(0, 0, 10, 0), L(10, 0, 10, 10), L(10, 10, 0, 10), L(0, 10, 0, 0), circle], { x: 5, y: 5 })!;
    expect(polylineSignedArea(inner.outer)).toBeCloseTo(Math.PI * 4, 6);
  });
  it('returns null for open geometry', () => {
    expect(detectBoundary([L(0, 0, 10, 0), L(10, 0, 10, 10)], { x: 5, y: 5 })).toBeNull();
  });
});
