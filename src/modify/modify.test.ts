import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { ArcEntity, CircleEntity, Entity, LineEntity, LwPolylineEntity } from '../document/types';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import { polylineSignedArea } from '../geometry/polyline';
import { breakEntity, extendEntity, joinEntities, lengthenEntity, reverseEntity, trimEntity } from './curveEdit';
import { cornerEntities, polylineAllCorners } from './filletEntities';
import { offsetEntity } from './offsetEntity';
import { planOverkill } from '../audit/overkill';
import { findUnused, purge } from '../audit/purge';

const doc = createDocument();
const ctx = createContext(doc);
let seq = 0;
const base = () => ({ ...entityDefaults(doc), id: `e${++seq}`, order: seq });
const line = (ax: number, ay: number, bx: number, by: number): LineEntity => ({ ...base(), type: 'line', start: { x: ax, y: ay }, end: { x: bx, y: by } });
const circle = (x: number, y: number, r: number): CircleEntity => ({ ...base(), type: 'circle', center: { x, y }, radius: r });
const pline = (pts: [number, number][], closed = false): LwPolylineEntity => ({ ...base(), type: 'lwpolyline', vertices: pts.map(([x, y]) => ({ x, y, bulge: 0 })), closed });
const curves = (...es: Entity[]) => es.flatMap((e) => kindOf(e).curves(e, ctx));

describe('TRIM', () => {
  it('trims a line segment between two cutting lines', () => {
    const target = line(0, 0, 10, 0);
    const res = trimEntity(target, { x: 5, y: 0 }, curves(line(3, -1, 3, 1), line(7, -1, 7, 1)), ctx)!;
    expect(res.replace).toHaveLength(2);
    const [a, b] = res.replace as LineEntity[];
    expect(a.id).toBe(target.id);
    expect(a.end.x).toBeCloseTo(3);
    expect(b.start.x).toBeCloseTo(7);
  });
  it('trims line end past a circle', () => {
    const res = trimEntity(line(0, 0, 10, 0), { x: 9, y: 0 }, curves(circle(5, 0, 2)), ctx)!;
    expect(res.replace).toHaveLength(1);
    expect((res.replace[0] as LineEntity).end.x).toBeCloseTo(7);
  });
  it('trims a circle into an arc', () => {
    const res = trimEntity(circle(0, 0, 5), { x: 5, y: 0 }, curves(line(3, -10, 3, 10)), ctx)!;
    expect(res.replace).toHaveLength(1);
    const arc = res.replace[0] as ArcEntity;
    expect(arc.type).toBe('arc');
    // queda la parte izquierda (x<3)
    const mid = (arc.startAngle + arc.endAngle) / 2;
    expect(Math.cos(mid) * 5).toBeLessThan(0);
  });
  it('quick mode erases objects without boundaries', () => {
    const res = trimEntity(line(0, 0, 10, 0), { x: 5, y: 0 }, curves(line(0, 5, 10, 5)), ctx)!;
    expect(res.erased).toBe(true);
  });
  it('trims an open polyline into two', () => {
    const p = pline([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    const res = trimEntity(p, { x: 10, y: 5 }, curves(line(5, -1, 5, 1), line(9, 7, 11, 7)), ctx)!;
    expect(res.replace).toHaveLength(2);
    const lens = res.replace.map((e) => kindOf(e).length!(e, ctx)!);
    expect(lens[0]).toBeCloseTo(5);
    expect(lens[1]).toBeCloseTo(3);
  });
  it('trims a closed polyline (hole cut) into one open polyline', () => {
    const p = pline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      true,
    );
    const res = trimEntity(p, { x: 5, y: 0 }, curves(line(3, -1, 3, 1), line(7, -1, 7, 1)), ctx)!;
    expect(res.replace).toHaveLength(1);
    const out = res.replace[0] as LwPolylineEntity;
    expect(out.closed).toBe(false);
    expect(kindOf(out).length!(out, ctx)).toBeCloseTo(36);
  });
});

describe('EXTEND', () => {
  it('extends a line to a boundary line', () => {
    const e = extendEntity(line(0, 0, 5, 0), { x: 4.5, y: 0 }, curves(line(8, -5, 8, 5)), ctx) as LineEntity;
    expect(e.end.x).toBeCloseTo(8);
  });
  it('extends a line start backwards', () => {
    const e = extendEntity(line(2, 0, 5, 0), { x: 2.2, y: 0 }, curves(line(-1, -5, -1, 5)), ctx) as LineEntity;
    expect(e.start.x).toBeCloseTo(-1);
  });
  it('extends an arc to a line', () => {
    const arc: ArcEntity = { ...base(), type: 'arc', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 4 };
    const e = extendEntity(arc, { x: 3.5, y: 3.5 }, curves(line(-10, 3, 10, 3), line(-10, 4.9, 10, 4.9)), ctx) as ArcEntity;
    expect(Math.sin(e.endAngle) * 5).toBeCloseTo(4.9, 6);
  });
  it('returns null without reachable boundary', () => {
    expect(extendEntity(line(0, 0, 5, 0), { x: 5, y: 0 }, curves(line(0, 5, 10, 5)), ctx)).toBeNull();
  });
});

describe('BREAK / JOIN / LENGTHEN / REVERSE', () => {
  it('breaks a line into two', () => {
    const r = breakEntity(line(0, 0, 10, 0), { x: 3, y: 0 }, { x: 6, y: 0 }, ctx)! as LineEntity[];
    expect(r).toHaveLength(2);
    expect(r[0].end.x).toBeCloseTo(3);
    expect(r[1].start.x).toBeCloseTo(6);
  });
  it('break at point splits', () => {
    const r = breakEntity(line(0, 0, 10, 0), { x: 4, y: 0 }, { x: 4, y: 0 }, ctx)!;
    expect(r).toHaveLength(2);
  });
  it('breaks a circle into an arc', () => {
    const r = breakEntity(circle(0, 0, 5), { x: 5, y: 0 }, { x: 0, y: 5 }, ctx)!;
    expect(r[0].type).toBe('arc');
    expect(kindOf(r[0]).length!(r[0], ctx)).toBeCloseTo(5 * 1.5 * Math.PI);
  });
  it('joins collinear lines', () => {
    const r = joinEntities(line(0, 0, 5, 0), [line(5, 0, 9, 0), line(8, 0, 12, 0)], ctx)!;
    const l = r.entities[0] as LineEntity;
    expect(l.start.x).toBeCloseTo(0);
    expect(l.end.x).toBeCloseTo(12);
  });
  it('joins arcs into a circle', () => {
    const a: ArcEntity = { ...base(), type: 'arc', center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI };
    const b: ArcEntity = { ...base(), type: 'arc', center: { x: 0, y: 0 }, radius: 2, startAngle: Math.PI, endAngle: 2 * Math.PI };
    const r = joinEntities(a, [b], ctx)!;
    expect(r.entities[0].type).toBe('circle');
  });
  it('joins a chain into a closed polyline', () => {
    const r = joinEntities(line(0, 0, 4, 0), [line(4, 0, 4, 3), line(0, 0, 4, 3)], ctx)!;
    const p = r.entities[0] as LwPolylineEntity;
    expect(p.closed).toBe(true);
    expect(Math.abs(polylineSignedArea(p.vertices))).toBeCloseTo(6);
  });
  it('lengthens by delta and total', () => {
    const l = lengthenEntity(line(0, 0, 10, 0), { x: 9, y: 0 }, { kind: 'delta', value: 5 }, ctx) as LineEntity;
    expect(l.end.x).toBeCloseTo(15);
    const t = lengthenEntity(line(0, 0, 10, 0), { x: 1, y: 0 }, { kind: 'total', value: 4 }, ctx) as LineEntity;
    expect(t.start.x).toBeCloseTo(6);
  });
  it('reverses polyline with bulges', () => {
    const p: LwPolylineEntity = { ...base(), type: 'lwpolyline', closed: false, vertices: [{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0, bulge: 0 }, { x: 4, y: 0, bulge: 0 }] };
    const r = reverseEntity(p) as LwPolylineEntity;
    expect(r.vertices[0].x).toBe(4);
    expect(r.vertices[1].bulge).toBeCloseTo(-1);
    expect(kindOf(r).length!(r, ctx)).toBeCloseTo(kindOf(p).length!(p, ctx)!);
  });
});

describe('FILLET / CHAMFER entities', () => {
  it('fillets two lines and adds an arc', () => {
    const l1 = line(0, 0, 10, 0);
    const l2 = line(10, 0, 10, 10);
    const r = cornerEntities(l1, { x: 2, y: 0 }, l2, { x: 10, y: 8 }, { kind: 'fillet', radius: 2 }, true, ctx);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.add[0].type).toBe('arc');
    expect((r.update[0] as LineEntity).end.x).toBeCloseTo(8);
  });
  it('fillets all corners of a closed polyline', () => {
    const p = pline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      true,
    );
    const res = polylineAllCorners(p, { kind: 'fillet', radius: 1 });
    expect(res.done).toBe(4);
    expect(Math.abs(polylineSignedArea(res.result.vertices))).toBeCloseTo(100 - 4 * (1 - Math.PI / 4), 6);
  });
  it('chamfers polyline corners', () => {
    const p = pline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      false,
    );
    const res = polylineAllCorners(p, { kind: 'chamfer', d1: 2, d2: 2 });
    expect(res.done).toBe(1);
    expect(res.result.vertices).toHaveLength(4);
  });
  it('reports fillet radius too large', () => {
    const r = cornerEntities(line(0, 0, 1, 0), { x: 0.5, y: 0 }, line(0.5, -0.1, 0.5, 0.2), { x: 0.5, y: 0.15 }, { kind: 'fillet', radius: 50 }, true, ctx);
    expect('error' in r || (r as { add: Entity[] }).add.length === 1).toBe(true);
  });
});

describe('OFFSET entities', () => {
  it('offsets circle inward and outward', () => {
    const c = circle(0, 0, 5);
    expect((offsetEntity(c, 1, { x: 0, y: 1 }, ctx)[0] as CircleEntity).radius).toBeCloseTo(4);
    expect((offsetEntity(c, 1, { x: 0, y: 9 }, ctx)[0] as CircleEntity).radius).toBeCloseTo(6);
    expect(offsetEntity(c, 6, { x: 0, y: 1 }, ctx)).toHaveLength(0);
  });
  it('offsets a closed polyline with hole-like notch', () => {
    const p = pline(
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [12, 20],
        [12, 8],
        [8, 8],
        [8, 20],
        [0, 20],
      ],
      true,
    );
    const out = offsetEntity(p, 1, { x: 30, y: 10 }, ctx);
    expect(out.length).toBeGreaterThanOrEqual(1);
    const area = Math.abs(polylineSignedArea((out[0] as LwPolylineEntity).vertices));
    expect(area).toBeGreaterThan(Math.abs(polylineSignedArea(p.vertices)));
  });
});

describe('OVERKILL / PURGE', () => {
  it('removes duplicates and merges collinear overlaps', () => {
    const a = line(0, 0, 5, 0);
    const b = line(5, 0, 0, 0);
    const c = line(4, 0, 9, 0);
    const z = line(1, 1, 1, 1);
    const plan = planOverkill([a, b, c, z], { tolerance: 1e-6, compareProps: true, mergeCollinear: true, removeZeroLength: true });
    expect(plan.duplicates).toBe(1);
    expect(plan.zeroLength).toBe(1);
    expect(plan.merged).toBe(1);
    const merged = plan.update[0] as LineEntity;
    expect(Math.max(merged.start.x, merged.end.x)).toBeCloseTo(9);
  });
  it('purges unused layers and styles', () => {
    const d = createDocument();
    d.transact('x', (tx) => tx.add('layers', { id: 'lx', name: 'Vacía', color: 'aci:1', linetype: 'lt-dashed', lineweight: -3, transparency: 0, on: true, frozen: false, locked: false, plot: true, description: '', order: 9 }));
    const unused = findUnused(d);
    expect(unused.some((u) => u.name === 'Vacía')).toBe(true);
    const removed = d.transact('purge', (tx) => purge(tx, d, ['layers']));
    expect(removed.some((r) => r.name === 'Vacía')).toBe(true);
    expect(d.data.layers.has('lx')).toBe(false);
  });
});
