import { describe, expect, it } from 'vitest';
import { ViewTransform } from './viewTransform';

describe('límites numéricos de la vista', () => {
  it('mantiene la escala finita al restaurar alturas extremas o inválidas', () => {
    const view = new ViewTransform();

    view.setViewHeight(1e-308);
    expect(view.scale).toBe(view.maxScale);

    view.setViewHeight(1e308);
    expect(view.scale).toBe(view.minScale);

    view.setViewHeight(Infinity);
    expect(view.scale).toBe(view.minScale);
  });

  it('ignora factores no finitos sin desplazar el centro', () => {
    const view = new ViewTransform();
    const initialCenter = { ...view.center };
    view.zoomAt({ x: 400, y: 300 }, NaN);

    expect(view.scale).toBe(4);
    expect(view.center).toEqual(initialCenter);
  });

  it('ajusta coordenadas finitas extremas sin desbordar el centro ni la matriz', () => {
    const view = new ViewTransform();
    const box = { minX: 1e308, minY: 1e308, maxX: 1e308, maxY: 1e308 };

    view.fit(box);
    expect(Number.isFinite(view.center.x)).toBe(true);
    expect(Number.isFinite(view.center.y)).toBe(true);
    expect(Object.values(view.matrix()).every(Number.isFinite)).toBe(true);

    view.zoomAt({ x: 400, y: 300 }, 2);
    expect(Object.values(view.matrix()).every(Number.isFinite)).toBe(true);

    view.setViewHeight(1e-308);
    expect(Object.values(view.matrix()).every(Number.isFinite)).toBe(true);
  });

  it('conserva la vista cuando el ancho de los límites excede el rango numérico', () => {
    const view = new ViewTransform();
    const initial = view.clone();

    view.fit({ minX: -1e308, minY: 0, maxX: 1e308, maxY: 1 });

    expect(view.center).toEqual(initial.center);
    expect(view.scale).toBe(initial.scale);
  });
});
