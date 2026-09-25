import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { DimensionEntity, LineEntity } from '../document/types';
import { createContext } from '../model/context';
import { dimensionBreakPoints } from './dimBreaks';

describe('cortes automáticos de cota', () => {
  const doc = createDocument();
  const ctx = createContext(doc);
  const d = entityDefaults(doc);
  const dim: DimensionEntity = { ...d, id: 'd', order: 1, type: 'dimension', dimType: 'linear', style: doc.settings.currentDimStyle, overrides: {}, p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, p3: { x: 50, y: 20 }, rotation: 0 };
  const line = (id: string, ax: number, ay: number, bx: number, by: number): LineEntity => ({ ...d, id, order: 1, type: 'line', start: { x: ax, y: ay }, end: { x: bx, y: by } });

  it('corta donde una línea cruza, pero no donde toca la punta ni es colineal', () => {
    const crossing = line('a', 50, -10, 50, 40);
    const atTip = line('b', 100, -10, 100, 40); // colineal con la línea de extensión y en la punta
    const breaks = dimensionBreakPoints(dim, ctx, [dim, crossing, atTip]);
    expect(breaks).toEqual([{ p: { x: 50, y: 20 } }]);
  });
});
