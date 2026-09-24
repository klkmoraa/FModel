import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../../document/defaults';
import { MAX_ARRAY_INSTANCE_COUNT } from '../../document/arrayLimits';
import { MODEL_SPACE_ID } from '../../document/types';
import type { ArrayEntity, CircleEntity, InsertEntity, LineEntity } from '../../document/types';
import { isEmptyBox } from '../../geometry/bbox';
import { planSheet, plotExtents } from '../../output/plot';
import { SpatialIndex } from '../../spatial/spatialIndex';
import { createContext } from '../context';
import { arrayKind, arrayTransforms, insertKind } from './insert';

type PrimitiveEntitySeed = Pick<LineEntity, 'type' | 'start' | 'end'> | Pick<CircleEntity, 'type' | 'center' | 'radius'>;

function expectUnboundedBounds(box: { minX: number; minY: number; maxX: number; maxY: number }) {
  expect(box).toEqual({ minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity });
}

function addBlockEntity(entity: PrimitiveEntitySeed, id = 'block') {
  const doc = createDocument();
  doc.transact('BLOCK', (tx) => {
    tx.add('blocks', { id, name: id, kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1 });
    if (entity.type === 'line') {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc, id), id: 'source', order: 1, ...entity });
    } else {
      tx.addEntity<CircleEntity>({ ...entityDefaults(doc, id), id: 'source', order: 1, ...entity });
    }
  });
  return { doc, ctx: createContext(doc), id };
}

describe('insert and array derived bounds', () => {
  it('places path array items correctly across multiple segments', () => {
    const doc = createDocument();
    const array: ArrayEntity = {
      ...entityDefaults(doc),
      id: 'array',
      order: 1,
      type: 'array',
      sourceBlockId: 'source',
      basePoint: { x: 0, y: 0 },
      params: {
        kind: 'path',
        path: { vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: false },
        count: 3,
        spacing: 0,
        alignItems: false,
        method: 'divide',
      },
    };

    expect(arrayTransforms(array).map(({ e, f }) => ({ x: e, y: f }))).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('marks the block cache unbounded when finite primitive values overflow its box', () => {
    const { ctx } = addBlockEntity({
      type: 'circle',
      center: { x: 0, y: 1e308 },
      radius: 1e308,
    });

    const bounds = ctx.blockCache('block').bbox;

    expect(isEmptyBox(bounds)).toBe(false);
    expectUnboundedBounds(bounds);
  });

  it('marks the insert unbounded when an extreme scale overflows one bbox axis', () => {
    const { doc, ctx, id } = addBlockEntity({
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 1e307, y: 1 },
    });
    const insert: InsertEntity = {
      ...entityDefaults(doc),
      id: 'insert',
      order: 2,
      type: 'insert',
      blockId: id,
      position: { x: 0, y: 0 },
      scale: { x: 1e308, y: 1 },
      rotation: 0,
      attributes: [],
    };

    const bounds = insertKind.bbox(insert, ctx);

    expect(isEmptyBox(bounds)).toBe(false);
    expectUnboundedBounds(bounds);
  });

  it('marks the whole array unbounded when one copy overflows one bbox axis', () => {
    const { doc, ctx, id } = addBlockEntity({
      type: 'circle',
      center: { x: 0, y: 0 },
      radius: 1e307,
    });
    const array: ArrayEntity = {
      ...entityDefaults(doc),
      id: 'array',
      order: 2,
      type: 'array',
      sourceBlockId: id,
      basePoint: { x: 0, y: 0 },
      params: { kind: 'rect', columns: 2, rows: 1, columnSpacing: 1.7e308, rowSpacing: 0, angle: 0 },
    };

    const bounds = arrayKind.bbox(array, ctx);

    expect(isEmptyBox(bounds)).toBe(false);
    expectUnboundedBounds(bounds);
  });

  it('clamps array count grips to the shared expansion budget', () => {
    const { doc, ctx, id } = addBlockEntity({ type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    const array: ArrayEntity = {
      ...entityDefaults(doc), id: 'array', order: 2, type: 'array', sourceBlockId: id, basePoint: { x: 0, y: 0 },
      params: { kind: 'rect', columns: 2, rows: 1, columnSpacing: 1, rowSpacing: 0, angle: 0 },
    };

    const changed = arrayKind.moveGrip(array, 'colcount', { x: 1e100, y: 0 }, ctx);

    expect(changed?.type).toBe('array');
    if (changed?.type === 'array' && changed.params.kind === 'rect') expect(changed.params.columns).toBe(MAX_ARRAY_INSTANCE_COUNT);
  });

  it('keeps inserts and arrays as spatial candidates and skips their unbounded boxes in plot extents', () => {
    const { doc, ctx, id } = addBlockEntity({
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 1e307, y: 1 },
    });
    const insert: InsertEntity = {
      ...entityDefaults(doc),
      id: 'insert',
      order: 2,
      type: 'insert',
      blockId: id,
      position: { x: 0, y: 0 },
      scale: { x: 1e308, y: 1 },
      rotation: 0,
      attributes: [],
    };
    const array: ArrayEntity = {
      ...entityDefaults(doc),
      id: 'array',
      order: 3,
      type: 'array',
      sourceBlockId: id,
      basePoint: { x: 0, y: 0 },
      params: { kind: 'rect', columns: 2, rows: 1, columnSpacing: 1.7e308, rowSpacing: 0, angle: 0 },
    };
    doc.transact('ADD', (tx) => {
      tx.addEntity(insert);
      tx.addEntity(array);
    });

    const index = new SpatialIndex(ctx);
    const query = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
    expect(index.query(MODEL_SPACE_ID, query)).toEqual(expect.arrayContaining([insert.id, array.id]));
    expect(index.bboxOf(MODEL_SPACE_ID, insert.id)).toBeUndefined();
    expect(index.bboxOf(MODEL_SPACE_ID, array.id)).toBeUndefined();

    expect(isEmptyBox(plotExtents({ doc, ctx }, MODEL_SPACE_ID))).toBe(true);
    const plan = planSheet({ doc, ctx }, MODEL_SPACE_ID);
    expect(plan.warnings).toContain('No hay objetos trazables en el área seleccionada.');
    expect(Object.values(plan.base).every(Number.isFinite)).toBe(true);
    index.dispose();
    ctx.dispose();
  });
});
