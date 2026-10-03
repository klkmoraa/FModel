import { describe, expect, it } from 'vitest';
import { buildWallAssembly, type WallOpeningSpec } from './wallOpenings';
import type { WallPath } from './walls';
const path: WallPath = { vertices: [{ x: 0, y: 0 }, { x: 10000, y: 0 }], closed: false, scale: 150, justification: 'zero' };
const cut = (id: string, offset: number, extra: Partial<WallOpeningSpec> = {}): WallOpeningSpec => ({ id, segment: 0, offset, width: 900, type: 'single', side: 1, hingeEnd: false, ...extra });
const room: WallPath = { ...path, vertices: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], closed: true };
describe('wall opening geometry', () => {
  it('cuts ordered intervals from the full source and retains stable roles after width edits', () => {
    const g = buildWallAssembly(path, [cut('b', 7000), cut('a', 2000)]);
    expect(g.fragments.map(f => f.vertices.map(p => p.x))).toEqual([[0, 1550], [2450, 6550], [7450, 10000]]);
    const edited = buildWallAssembly(path, [cut('a', 2000, { width: 1200 }), cut('b', 7000)]);
    expect(edited.fragments.map(f => f.vertices.map(p => p.x))).toEqual([[0, 1400], [2600, 6550], [7450, 10000]]);
    expect(edited.symbols.filter(s => s.openingId === 'b')).toEqual(g.symbols.filter(s => s.openingId === 'b'));
  });
  it('walks closed paths between cuts without closing across openings', () => {
    const g = buildWallAssembly(room, [cut('a', 2000), cut('b', 2000, { segment: 1 })]);
    expect(g.fragments.map(f => f.vertices)).toEqual([
      [{ x: 2450, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 1550 }],
      [{ x: 6000, y: 2450 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }, { x: 0, y: 0 }, { x: 1550, y: 0 }],
    ]);
    expect(g.fragments.every(f => !f.closed)).toBe(true);
    expect(buildWallAssembly(room, []).fragments).toEqual([{ key: 'wall:anchor', vertices: room.vertices, closed: true }]);
  });
  it.each(['zero', 'top', 'bottom'] as const)('puts jambs and double quarter arcs on actual %s faces', justification => {
    const g = buildWallAssembly({ ...path, justification }, [cut('a', 2000, { type: 'double' })]);
    const arcs = g.symbols.filter(s => s.type === 'arc');
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) {
      expect(arc.radius).toBe(450);
      expect((arc.endAngle - arc.startAngle + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI / 2);
      expect(arc.center.y).toBe(justification === 'top' ? 0 : justification === 'bottom' ? 150 : 75);
    }
    const jamb = g.symbols[0];
    expect(jamb.type === 'line' && [jamb.start.y, jamb.end.y]).toEqual(justification === 'top' ? [0, -150] : justification === 'bottom' ? [150, 0] : [75, -75]);
  });
  it.each(['single', 'double', 'sliding', 'fixed', 'empty'] as const)('builds bounded nondegenerate %s symbols for every orientation', type => {
    for (const side of [1, -1] as const) for (const hingeEnd of [true, false]) {
      const symbols = buildWallAssembly(path, [cut('a', 2000, { type, side, hingeEnd })]).symbols;
      expect(symbols.length).toBe(type === 'double' ? 6 : type === 'empty' ? 2 : type === 'sliding' ? 7 : 4);
      expect(new Set(symbols.map(s => s.key)).size).toBe(symbols.length);
      for (const s of symbols) if (s.type === 'arc') expect((s.endAngle - s.startAngle + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI / 2);
    }
  });
  it.each([
    [cut('a', 2000), cut('b', 2900)], [cut('a', 2000), cut('b', 2800)],
    [cut('a', 450)], [cut('a', 9900)], [cut('a', NaN)], [cut('a', 2000, { width: Infinity })],
    [cut('a', 2000, { segment: 0.5 })], [cut('a', 2000, { width: 0 })],
    [cut('a', 2000), cut('a', 7000)], [cut('a', 2000, { side: 0 as 1 })],
  ])('rejects impossible cuts before returning geometry: %j', (...openings) => expect(() => buildWallAssembly(path, openings)).toThrow());
  it('respects miter face clearance and hard input limits', () => {
    expect(() => buildWallAssembly(room, [cut('a', 500)])).toThrow();
    expect(() => buildWallAssembly(path, Array.from({ length: 201 }, (_, i) => cut(String(i), i * 2000)))).toThrow();
    expect(() => buildWallAssembly({ ...path, vertices: Array.from({ length: 501 }, (_, i) => ({ x: i * 1000, y: 0 })) }, [])).toThrow();
    expect(() => buildWallAssembly({ ...path, scale: NaN }, [])).toThrow();
    expect(() => buildWallAssembly({ ...path, vertices: [{ x: 0, y: 0 }, { x: Infinity, y: 0 }] }, [])).toThrow();
  });
});
