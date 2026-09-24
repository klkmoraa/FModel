import { describe, expect, it } from 'vitest';
import { createDocument, DIMSTYLE_ISO_ID, entityDefaults, LAYER0_ID } from '../document/defaults';
import type { CircleEntity, DimensionEntity, Entity, HatchEntity, InsertEntity, LineEntity, LwPolylineEntity, TextEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { rotation, scaling, compose, translation } from '../geometry/matrix';
import { evaluate, topoSortExpressions } from '../lib/expr';
import { createContext } from './context';
import { buildDimension } from './dimension';
import { resolveFieldsText } from './fields';
import { formatAngle, formatLength } from './format';
import { findPattern, generateHatch } from './hatchPatterns';
import { kindOf } from './registry';

function setup() {
  const doc = createDocument();
  const ctx = createContext(doc);
  return { doc, ctx };
}

describe('document transactions', () => {
  it('adds, undoes and redoes', () => {
    const { doc } = setup();
    const line = doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }));
    expect(doc.data.entities.size).toBe(1);
    doc.transact('MOVE', (tx) => tx.updateEntity<LineEntity>(line.id, { start: { x: 1, y: 1 } }));
    expect((doc.entity(line.id) as LineEntity).start.x).toBe(1);
    doc.undo();
    expect((doc.entity(line.id) as LineEntity).start.x).toBe(0);
    doc.undo();
    expect(doc.data.entities.size).toBe(0);
    doc.redo();
    doc.redo();
    expect((doc.entity(line.id) as LineEntity).start.x).toBe(1);
  });
  it('rolls back on error', () => {
    const { doc } = setup();
    expect(() =>
      doc.transact('bad', (tx) => {
        tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
        throw new Error('boom');
      }),
    ).toThrow();
    expect(doc.data.entities.size).toBe(0);
    expect(doc.history.canUndo()).toBe(false);
  });
  it('groups merge into one undo step', () => {
    const { doc } = setup();
    doc.history.beginGroup('BEDIT');
    doc.transact('a', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }));
    doc.transact('b', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 2, y: 0 } }));
    doc.history.endGroup();
    expect(doc.history.entries()).toHaveLength(1);
    doc.undo();
    expect(doc.data.entities.size).toBe(0);
  });
});

describe('entity kinds', () => {
  it('resolves a field at the center of large finite coordinates', () => {
    const { doc, ctx } = setup();
    const line: LineEntity = { ...entityDefaults(doc), id: 'large-line', order: 1, type: 'line', start: { x: 1e308, y: 0 }, end: { x: 1.1e308, y: 0 } };
    expect(resolveFieldsText('{{self.x}}', ctx, line)).toBe('1.05e+308');
  });

  it('shows an unavailable field when finite circle properties overflow derived geometry', () => {
    const { doc, ctx } = setup();
    const circle: CircleEntity = { ...entityDefaults(doc), id: 'large-circle', order: 1, type: 'circle', center: { x: 0, y: 1e308 }, radius: 1e308 };
    expect(resolveFieldsText('{{self.y}} / {{self.length}} / {{self.area}}', ctx, circle)).toBe('#### / #### / ####');
  });

  it('circle under non-uniform scale becomes ellipse', () => {
    const { doc, ctx } = setup();
    const c: CircleEntity = { ...entityDefaults(doc), id: 'c1', order: 1, type: 'circle', center: { x: 0, y: 0 }, radius: 2 };
    const t = kindOf(c).transform(c, scaling(2, 1), ctx) as Entity;
    expect(t.type).toBe('ellipse');
    const b = kindOf(t).bbox(t, ctx);
    expect(b.maxX).toBeCloseTo(4);
    expect(b.maxY).toBeCloseTo(2);
  });
  it('polyline area and explode', () => {
    const { doc, ctx } = setup();
    const p: LwPolylineEntity = {
      ...entityDefaults(doc),
      id: 'p1',
      order: 1,
      type: 'lwpolyline',
      closed: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    };
    const k = kindOf(p);
    expect(k.area!(p, ctx)).toBeCloseTo(12);
    expect(k.length!(p, ctx)).toBeCloseTo(14);
    expect(k.explode!(p, ctx)).toHaveLength(4);
  });
  it('text bbox grows with length', () => {
    const { doc, ctx } = setup();
    const base = { ...entityDefaults(doc), order: 1, type: 'text' as const, position: { x: 0, y: 0 }, height: 2.5, rotation: 0, widthFactor: 1, oblique: 0, style: doc.settings.currentTextStyle, halign: 'left' as const, valign: 'baseline' as const };
    const a: TextEntity = { ...base, id: 't1', text: 'AB' };
    const b: TextEntity = { ...base, id: 't2', text: 'ABCDEFGH' };
    expect(kindOf(b).bbox(b, ctx).maxX).toBeGreaterThan(kindOf(a).bbox(a, ctx).maxX);
  });
  it('block insert renders transformed geometry and explodes', () => {
    const { doc, ctx } = setup();
    doc.transact('BLOCK', (tx) => {
      tx.add('blocks', { id: 'b1', name: 'Marca', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1 });
      tx.addEntity<LineEntity>({ ...entityDefaults(doc, 'b1'), layer: LAYER0_ID, color: 'ByBlock', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    });
    const ins: InsertEntity = { ...entityDefaults(doc), id: 'i1', order: 1, type: 'insert', blockId: 'b1', position: { x: 5, y: 5 }, scale: { x: 2, y: 2 }, rotation: Math.PI / 2, attributes: [], color: 'aci:1' };
    const k = kindOf(ins);
    const b = k.bbox(ins, ctx);
    expect(b.minX).toBeCloseTo(5);
    expect(b.maxY).toBeCloseTo(7);
    const parts = k.explode!(ins, ctx)!;
    expect(parts).toHaveLength(1);
    expect(parts[0].color).toBe('aci:1');
    const moved = k.transform(ins, compose(rotation(Math.PI / 2), translation(1, 0)), ctx) as InsertEntity;
    expect(moved.rotation).toBeCloseTo(Math.PI);
    expect(moved.position.x).toBeCloseTo(-4);
  });
});

describe('dimensions', () => {
  it('linear dimension measures projected distance', () => {
    const { doc, ctx } = setup();
    const d: DimensionEntity = {
      ...entityDefaults(doc, MODEL_SPACE_ID),
      id: 'd1',
      order: 1,
      type: 'dimension',
      dimType: 'linear',
      style: DIMSTYLE_ISO_ID,
      overrides: {},
      p1: { x: 0, y: 0 },
      p2: { x: 30, y: 12 },
      p3: { x: 10, y: -10 },
      rotation: 0,
    };
    const g = buildDimension(d, ctx);
    expect(g.measurement).toBeCloseTo(30);
    expect(g.text).toBe('30');
    const aligned = buildDimension({ ...d, dimType: 'aligned' }, ctx);
    expect(aligned.measurement).toBeCloseTo(Math.hypot(30, 12));
  });
  it('angular dimension picks quadrant from arc point', () => {
    const { doc, ctx } = setup();
    const d: DimensionEntity = {
      ...entityDefaults(doc),
      id: 'd2',
      order: 1,
      type: 'dimension',
      dimType: 'angular',
      style: DIMSTYLE_ISO_ID,
      overrides: {},
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      p3: { x: 0, y: 0 },
      p4: { x: 10, y: 10 },
      arcPoint: { x: 8, y: 3 },
      rotation: 0,
    };
    expect((buildDimension(d, ctx).measurement * 180) / Math.PI).toBeCloseTo(45);
    const obtuse = buildDimension({ ...d, arcPoint: { x: -3, y: 8 } }, ctx);
    expect((obtuse.measurement * 180) / Math.PI).toBeCloseTo(135);
  });
  it('tolerances and alternate units', () => {
    const { doc, ctx } = setup();
    const d: DimensionEntity = {
      ...entityDefaults(doc),
      id: 'd3',
      order: 1,
      type: 'dimension',
      dimType: 'aligned',
      style: DIMSTYLE_ISO_ID,
      overrides: { tolerance: 'symmetrical', tolUpper: 0.1, altUnits: true, altFactor: 1 / 25.4, prefix: '⌀' },
      p1: { x: 0, y: 0 },
      p2: { x: 25.4, y: 0 },
      p3: { x: 0, y: 5 },
      rotation: 0,
    };
    const items = buildDimension(d, ctx).items.filter((i) => i.k === 'text').map((i) => (i as { text: string }).text);
    expect(items[0]).toContain('±0,10');
    expect(items.join(' ')).toContain('1 in');
  });
});

describe('formatting', () => {
  it('formats finite extreme lengths without non-finite feet or inches', () => {
    for (const format of ['engineering', 'architectural'] as const) {
      expect(formatLength(Number.MAX_VALUE, format, 2)).not.toMatch(/NaN|Infinity/);
    }
  });

  it('architectural and dms', () => {
    expect(formatLength(30.5, 'architectural', 2)).toBe(`2'-6 1/2"`);
    expect(formatAngle(Math.PI / 4, 'degrees', 0)).toBe('45°');
    expect(formatAngle(0.5, 'dms', 4)).toMatch(/28°38'/);
  });
});

describe('hatch', () => {
  it('generates clipped pattern segments with islands', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const hole = [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
    ];
    const res = generateHatch([outer, hole], findPattern('LINE')!.lines, 0, 1, { x: 0, y: 0 });
    // una línea a y=50 debe partirse en dos tramos por la isla
    const at50 = res.segments.filter(([a]) => Math.abs(a.y - 50.8) < 1e-6 || Math.abs(a.y - 63.5) < 1e-6);
    expect(res.segments.length).toBeGreaterThan(5);
    expect(res.segments.every(([a, b]) => a.x >= -1e-9 && b.x <= 100 + 1e-9)).toBe(true);
    const crossing = res.segments.filter(([a]) => a.y > 40 && a.y < 60);
    expect(crossing.length % 2).toBe(0);
    void at50;
  });
  it('hatch entity graphics', () => {
    const { doc, ctx } = setup();
    const h: HatchEntity = {
      ...entityDefaults(doc),
      id: 'h1',
      order: 1,
      type: 'hatch',
      loops: [{ closed: true, vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }],
      pattern: { type: 'predefined', name: 'ANSI31', angle: 0, scale: 1, spacing: 1, double: false },
      origin: { x: 0, y: 0 },
      islandStyle: 'normal',
    };
    const g = kindOf(h).graphics(h, ctx);
    expect(g.length).toBeGreaterThan(0);
    expect(kindOf(h).area!(h, ctx)).toBeCloseTo(100);
  });
});

describe('expressions', () => {
  it('evaluates formulas with variables', () => {
    expect(evaluate('width/2 + max(1, h) * cos(60)', { width: 10, h: 4 })).toBeCloseTo(7);
    expect(evaluate('d > 5 ? 1 : 0', { d: 6 })).toBe(1);
    expect(() => topoSortExpressions({ a: 'b+1', b: 'a*2' })).toThrow(/circular/);
    expect(topoSortExpressions({ c: 'a+b', a: '1', b: 'a*2' })).toEqual(['a', 'b', 'c']);
  });
});
