import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { DimensionEntity } from '../document/types';
import type { QuickPoint } from './dimLayout';
import { quickDimensions, spaceDimensions } from './dimLayout';

const q = (x: number, y: number, id = `e${x}_${y}`): QuickPoint => ({ p: { x, y }, ref: { entityId: id, snap: 'insertion' } });

describe('cotas rápidas', () => {
  const pts = [q(0, 0), q(30, 5), q(30, 20), q(100, 0)];

  it('continuas: descarta puntos con la misma abscisa y encadena', () => {
    const dims = quickDimensions(pts, { x: 50, y: 40 }, 'continuous', true, 7);
    expect(dims.map((d) => [d.p1.x, d.p2.x])).toEqual([[0, 30], [30, 100]]);
    expect(dims.every((d) => d.p3.y === 40 && d.rotation === 0)).toBe(true);
  });

  it('línea base: desde el primer punto, separadas hacia fuera de la geometría', () => {
    const dims = quickDimensions(pts, { x: 50, y: -20 }, 'baseline', true, 7);
    expect(dims.map((d) => [d.p1.x, d.p2.x, d.p3.y])).toEqual([[0, 30, -20], [0, 100, -27]]);
  });

  it('ordenadas: una cota por punto con el eje correspondiente', () => {
    const dims = quickDimensions(pts, { x: 150, y: 10 }, 'ordinate', false, 7);
    expect(dims.every((d) => d.dimType === 'ordinate' && d.axis === 'y' && d.p2.x === 150)).toBe(true);
    expect(dims).toHaveLength(3); // dos puntos comparten Y = 0
  });

  it('con un solo punto no hay cotas lineales', () => {
    expect(quickDimensions([q(1, 1)], { x: 0, y: 5 }, 'continuous', true, 7)).toEqual([]);
  });
});

describe('espaciado de cotas', () => {
  const doc = createDocument();
  const dim = (id: string, y: number, rotation = 0): DimensionEntity => ({ ...entityDefaults(doc), id, order: 1, type: 'dimension', dimType: 'linear', style: doc.settings.currentDimStyle, overrides: {}, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, p3: { x: 5, y }, rotation });

  it('ordena por distancia a cada lado de la base e ignora cotas no paralelas', () => {
    const out = spaceDimensions(dim('b', 0), [dim('a', 3), dim('c', -9), dim('d', 20), dim('v', 5, Math.PI / 2)], 4);
    const y = Object.fromEntries(out.map((d) => [d.id, d.p3.y]));
    expect(y).toEqual({ a: 4, d: 8, c: -4 });
  });
});
