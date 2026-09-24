import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, DimensionEntity, Id, LineEntity } from '../document/types';
import { createContext } from '../model/context';
import { SpatialIndex } from './spatialIndex';

describe('SpatialIndex', () => {
  it('keeps a partially overflowing box out of RBush while retaining its candidate', () => {
    const doc = createDocument();
    const circle = doc.transact('TEST', (tx) => tx.addEntity<CircleEntity>({
      ...entityDefaults(doc),
      id: 'large-circle',
      order: 1,
      type: 'circle',
      center: { x: 0, y: 1e308 },
      radius: 1e308,
    }));
    const ctx = createContext(doc);
    const index = new SpatialIndex(ctx);

    expect(index.query(circle.owner, { minX: -1, minY: -1, maxX: 1, maxY: 1 })).toContain(circle.id);
    expect(index.extents(circle.owner).maxY).toBe(-Infinity);
    expect(index.count(circle.owner)).toBe(1);

    const added = doc.transact('TEST', (tx) => tx.addEntity<CircleEntity>({
      ...entityDefaults(doc), id: 'added-large-circle', order: 2, type: 'circle',
      center: { x: 3, y: 1e308 }, radius: 1e308,
    }));
    expect(index.query(circle.owner, { minX: -1, minY: -1, maxX: 1, maxY: 1 })).toContain(added.id);
    expect(index.extents(circle.owner).maxY).toBe(-Infinity);
    expect(index.count(circle.owner)).toBe(2);

    index.dispose();
    ctx.dispose();
  });

  it('reindexes annotative geometry after the active scale changes', () => {
    const doc = createDocument();
    const dimension = doc.transact('TEST', (tx) =>
      tx.addEntity<DimensionEntity>({
        ...entityDefaults(doc),
        id: 'annotative-dimension',
        order: 1,
        type: 'dimension',
        dimType: 'linear',
        style: 'ds-annotative',
        overrides: {},
        p1: { x: 0, y: 0 },
        p2: { x: 1, y: 0 },
        p3: { x: 0, y: -10 },
        rotation: 0,
      }),
    );
    const ctx = createContext(doc);
    const index = new SpatialIndex(ctx);
    const owner = dimension.owner;

    // This is the editor's update order: the settings transaction emits before
    // the active evaluation context receives the selected annotation scale.
    doc.transact('CANNOSCALE', (tx) => tx.setSettings({ annotationScale: 0.1 }));
    ctx.annotationScale = 0.1;

    const expandedRegion = { minX: 40, minY: -11, maxX: 41, maxY: -9 };
    expect(index.query(owner, expandedRegion)).toContain(dimension.id);

    ctx.annotationScale = 1;
    expect(index.query(owner, expandedRegion)).not.toContain(dimension.id);

    ctx.annotationScale = 0.1;
    expect(index.query(owner, expandedRegion)).toContain(dimension.id);

    index.dispose();
    ctx.dispose();
  });

  it('releases owner trees after their last entity is removed', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    const index = new SpatialIndex(ctx);
    const entity = doc.transact('TEST', (tx) =>
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, 'temporary-owner' as Id),
        id: 'temporary-line',
        order: 1,
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
      }),
    );

    doc.transact('ERASE', (tx) => tx.removeEntity(entity.id));

    const owners = (index as unknown as { owners: Map<Id, unknown> }).owners;
    expect(owners.has('temporary-owner')).toBe(false);

    index.dispose();
    ctx.dispose();
  });
});
