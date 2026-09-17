import { describe, expect, it } from 'vitest';
import { LOUPE_RADIUS, loupeCenter } from './loupe';

describe('lupa táctil', () => {
  it('se sitúa sobre el dedo cuando hay sitio', () => {
    const c = loupeCenter({ x: 200, y: 300 }, 400, 600);
    expect(c.x).toBe(200);
    expect(c.y).toBeLessThan(300 - LOUPE_RADIUS);
  });

  it('baja al otro lado si no cabe arriba', () => {
    const c = loupeCenter({ x: 200, y: 30 }, 400, 600);
    expect(c.y).toBeGreaterThan(30 + LOUPE_RADIUS);
  });

  it('nunca se sale del lienzo', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 400, y: 600 }, { x: -20, y: 590 }]) {
      const c = loupeCenter(p, 400, 600);
      expect(c.x).toBeGreaterThanOrEqual(LOUPE_RADIUS);
      expect(c.x).toBeLessThanOrEqual(400 - LOUPE_RADIUS);
      expect(c.y).toBeGreaterThanOrEqual(LOUPE_RADIUS);
      expect(c.y).toBeLessThanOrEqual(600 - LOUPE_RADIUS);
    }
  });
});
