import { describe, expect, it } from 'vitest';
import { createDocument, DIMSTYLE_ISO_ID, entityDefaults } from '../document/defaults';
import type { CircleEntity, DimensionEntity, LineEntity } from '../document/types';
import { createContext } from '../model/context';
import { buildDimension } from '../model/dimension';
import { assocPoint, installDimensionAssociativity } from './assoc';

describe('associative dimensions', () => {
  it('follows line endpoints when the line is stretched and undo restores both', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    installDimensionAssociativity(doc, ctx);
    const line = doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }));
    const dim = doc.transact('DIM', (tx) =>
      tx.addEntity<DimensionEntity>({
        ...entityDefaults(doc),
        type: 'dimension',
        dimType: 'aligned',
        style: DIMSTYLE_ISO_ID,
        overrides: {},
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        p3: { x: 5, y: 5 },
        rotation: 0,
        assoc: [
          { point: 'p1', entityId: line.id, snap: 'endpoint-start' },
          { point: 'p2', entityId: line.id, snap: 'endpoint-end' },
        ],
      }),
    );
    doc.transact('STRETCH', (tx) => tx.updateEntity<LineEntity>(line.id, { end: { x: 25, y: 0 } }));
    const after = doc.entity(dim.id) as DimensionEntity;
    expect(after.p2.x).toBeCloseTo(25);
    expect(buildDimension(after, ctx).measurement).toBeCloseTo(25);
    doc.undo();
    expect((doc.entity(dim.id) as DimensionEntity).p2.x).toBeCloseTo(10);
    expect((doc.entity(line.id) as LineEntity).end.x).toBeCloseTo(10);
  });

  it('radius dimension follows circle center and rigid moves drag the dimension line', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    installDimensionAssociativity(doc, ctx);
    const c = doc.transact('C', (tx) => tx.addEntity<CircleEntity>({ ...entityDefaults(doc), type: 'circle', center: { x: 0, y: 0 }, radius: 5 }));
    const d = doc.transact('D', (tx) =>
      tx.addEntity<DimensionEntity>({
        ...entityDefaults(doc),
        type: 'dimension',
        dimType: 'radial',
        style: DIMSTYLE_ISO_ID,
        overrides: {},
        center: { x: 0, y: 0 },
        p1: { x: 5, y: 0 },
        p2: { x: 0, y: 0 },
        p3: { x: 8, y: 0 },
        rotation: 0,
        assoc: [
          { point: 'center', entityId: c.id, snap: 'center' },
          { point: 'p1', entityId: c.id, snap: 'nearest', index: 0 },
        ],
      }),
    );
    doc.transact('MOVE', (tx) => tx.updateEntity<CircleEntity>(c.id, { center: { x: 100, y: 50 } }));
    const after = doc.entity(d.id) as DimensionEntity;
    expect(after.center!.x).toBeCloseTo(100);
    expect(after.p3.x).toBeCloseTo(108);
    doc.transact('R', (tx) => tx.updateEntity<CircleEntity>(c.id, { radius: 9 }));
    expect(buildDimension(doc.entity(d.id) as DimensionEntity, ctx).measurement).toBeCloseTo(9);
    doc.transact('DEL', (tx) => tx.removeEntity(c.id));
    expect((doc.entity(d.id) as DimensionEntity).assoc).toBeUndefined();
  });

  it('propaga una cadena de cotas más larga que seis dependencias y la deshace completa', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    installDimensionAssociativity(doc, ctx);
    const line = doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(doc), id: 'base', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 },
    }));
    for (let i = 8; i >= 1; i--) {
      doc.transact('DIM', (tx) => tx.addEntity<DimensionEntity>({
        ...entityDefaults(doc), id: `d${i}`, type: 'dimension', dimType: 'linear', style: DIMSTYLE_ISO_ID,
        overrides: {}, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, p3: { x: 5, y: 50 }, rotation: 0,
        assoc: [{ point: 'p1', entityId: i === 1 ? line.id : `d${i - 1}`, snap: 'endpoint-start' }],
      }));
    }

    const expectChain = () => {
      for (let i = 2; i <= 8; i++) {
        const predecessor = doc.entity(`d${i - 1}`)!;
        const expected = assocPoint(predecessor, { point: 'p1', entityId: predecessor.id, snap: 'endpoint-start' }, ctx)!;
        const actual = (doc.entity(`d${i}`) as DimensionEntity).p1;
        expect(actual.x, `d${i}.p1.x`).toBeCloseTo(expected.x);
        expect(actual.y, `d${i}.p1.y`).toBeCloseTo(expected.y);
      }
    };

    doc.transact('MOVE', (tx) => tx.updateEntity<LineEntity>(line.id, { start: { x: 2, y: 0 } }));
    expectChain();
    doc.undo();
    expect((doc.entity(line.id) as LineEntity).start.x).toBe(0);
    expectChain();
    doc.redo();
    expect((doc.entity(line.id) as LineEntity).start.x).toBe(2);
    expectChain();
  });
});
