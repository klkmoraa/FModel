import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../../document/defaults';
import type { CircleEntity } from '../../document/types';
import { curveBBox } from '../../geometry/curves';
import { createContext } from '../context';
import { circleKind } from './basic';

describe('finite input overflow characterization', () => {
  it('shows a non-finite circle box can be derived from finite entity values', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    const circle: CircleEntity = {
      ...entityDefaults(doc),
      id: 'large-circle',
      order: 1,
      type: 'circle',
      center: { x: 0, y: 1e308 },
      radius: 1e308,
    };

    const bounds = circleKind.bbox(circle, ctx);
    const curveBounds = curveBBox(circleKind.curves(circle, ctx)[0]);

    expect(Number.isFinite(circle.center.y)).toBe(true);
    expect(Number.isFinite(circle.radius)).toBe(true);
    expect(bounds.maxY).toBe(Infinity);
    expect(curveBounds.maxY).toBe(Infinity);
  });
});
