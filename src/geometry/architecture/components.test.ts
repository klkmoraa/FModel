import { describe, expect, it } from 'vitest';
import { buildComponent } from './components';
import type { ComponentParameters, ComponentPrimitive } from './types';
const col = { variant: 'rectangular', width: 400, depth: 400, arm: 150, diameter: 400 };
const stair = { variant: 'straight', width: 1000, tread: 280, steps: 16, landing: 1000, innerRadius: 1000, turn: Math.PI / 2 };
const rects = (a: ComponentPrimitive[]) => a.filter(p => p.type === 'lwpolyline');
const role = (a: ComponentPrimitive[], k: string) => a.find(p => p.key === k)!;
describe('construction geometry', () => {
  it.each([['rectangular', 4], ['l', 6], ['t', 8], ['cross', 12]] as const)('column %s has its actual orthogonal outline', (variant, n) => {
    const a = buildComponent('column', { ...col, variant });
    expect(a).toHaveLength(1); const q = a[0]; expect(q.type).toBe('lwpolyline');
    if (q.type === 'lwpolyline') { expect(q.vertices).toHaveLength(n); expect(q.closed).toBe(true); expect(Math.max(...q.vertices.map(v => v.x))).toBe(400); expect(Math.max(...q.vertices.map(v => v.y))).toBe(400); }
  });
  it('circular column remains a native circle', () => expect(buildComponent('column', { ...col, variant: 'circular' })).toEqual([{ key: 'outline', type: 'circle', center: { x: 200, y: 200 }, radius: 200 }]));
  it('grid 4 by 3 has seven axes, fourteen bubbles and numeric/letter labels', () => {
    const a = buildComponent('axisgrid', { columns: 4, rows: 3, spacingX: 4000, spacingY: 4000, margin: 500, bubble: 150 });
    expect(a.filter(p => p.type === 'line')).toHaveLength(7); expect(a.filter(p => p.type === 'circle')).toHaveLength(14);
    expect(a.filter(p => p.type === 'text').map(p => p.text)).toEqual(['1', '1', '2', '2', '3', '3', '4', '4', 'A', 'A', 'B', 'B', 'C', 'C']);
    expect(role(a, 'axis-x-3')).toMatchObject({ start: { x: 12000, y: -500 }, end: { x: 12000, y: 8500 } });
  });
  it.each(['straight', 'l', 'u', 'curved'])('%s plan has sixteen distinct treads', variant => {
    const a = buildComponent('stairplan', { ...stair, variant });
    expect(a.filter(p => p.key.startsWith('tread-'))).toHaveLength(16);
    if (variant === 'straight') expect(role(a, 'tread-15')).toMatchObject({ start: { x: 0, y: 4200 }, end: { x: 1000, y: 4200 } });
    if (variant === 'l') expect(role(a, 'tread-15')).toMatchObject({ start: { x: 2960, y: 2240 }, end: { x: 2960, y: 3240 } });
    if (variant === 'u') expect(role(a, 'tread-15')).toMatchObject({ start: { x: 2000, y: 280 }, end: { x: 3000, y: 280 } });
    if (variant === 'curved') { expect(a.filter(p => p.type === 'arc').map(p => p.radius)).toEqual([1000, 2000]); expect(role(a, 'tread-0')).toMatchObject({ start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 } }); }
  });
  it('stair section rises sixteen times 170 with real risers and a slab underside', () => {
    const a = buildComponent('stairsection', { tread: 280, rise: 170, steps: 16, slab: 150 });
    expect(a.filter(p => p.key.startsWith('riser-'))).toHaveLength(16); expect(a.filter(p => p.key.startsWith('tread-'))).toHaveLength(16);
    expect(role(a, 'tread-15')).toMatchObject({ end: { x: 4480, y: 2720 } }); expect(role(a, 'slab')).toMatchObject({ end: { x: 4480, y: 2570 } });
  });
  it.each(['plan', 'elevation'])('escalator %s derives horizontal span from height and slope', view => {
    const a = buildComponent('escalator', { view, width: 1200, height: 3000, angle: Math.PI / 6, platform: 1000 });
    const q = role(a, 'run'); expect(q.type).toBe('line'); if (q.type === 'line') expect(q.end.x - q.start.x).toBeCloseTo(5196.152422706632);
    if (view === 'elevation') { expect(q).toMatchObject({ start: { x: 1000, y: 0 }, end: { y: 3000 } }); if (q.type === 'line') expect(q.end.x).toBeCloseTo(6196.152422706633); }
  });
  it('lift doorway is open in both shaft and cabin with cabin inside walls', () => {
    const a = buildComponent('liftplan', { width: 2200, depth: 2200, cabinWidth: 1600, cabinDepth: 1600, door: 900, wall: 150 });
    const cabin = role(a, 'cabin'); expect(cabin.type).toBe('lwpolyline'); if (cabin.type === 'lwpolyline') { expect(cabin.closed).toBe(false); expect(cabin.vertices[0]).toEqual({ x: 1550, y: 300 }); expect(cabin.vertices.at(-1)).toEqual({ x: 650, y: 300 }); }
    expect(role(a, 'shaft')).toMatchObject({ closed: false });
  });
  it.each(['single', 'double'])('door elevation %s has distinct frame and leaves', variant => {
    const a = buildComponent('doorelevation', { variant, width: 900, height: 2100, frame: 50 });
    expect(rects(a)).toHaveLength(variant === 'single' ? 3 : 4); expect(role(a, 'leaf-0')).toMatchObject({ vertices: [{ x: 50, y: 0 }, { x: variant === 'single' ? 850 : 450, y: 0 }, { x: variant === 'single' ? 850 : 450, y: 2050 }, { x: 50, y: 2050 }] });
  });
  it('door section distinguishes threshold, frame and leaf at height 2100', () => { const a = buildComponent('doorsection', { height: 2100, wall: 200, frame: 50, threshold: 20 }); expect(role(a, 'frame')).toMatchObject({ vertices: [{ x: 0, y: 2050 }, { x: 200, y: 2050 }, { x: 200, y: 2100 }, { x: 0, y: 2100 }] }); expect(role(a, 'threshold')).toMatchObject({ type: 'lwpolyline' }); expect(role(a, 'leaf')).toMatchObject({ type: 'lwpolyline' }); });
  it('window elevation has two real panes and optional opening diagonals', () => {
    const p = { width: 1200, height: 1200, frame: 50, columns: 2, rows: 1, opening: true }; const a = buildComponent('windowelevation', p);
    expect(role(a, 'pane-0-0')).toMatchObject({ vertices: [{ x: 50, y: 50 }, { x: 575, y: 50 }, { x: 575, y: 1150 }, { x: 50, y: 1150 }] });
    expect(a.filter(q => q.key.startsWith('opening-'))).toHaveLength(4); expect(buildComponent('windowelevation', { ...p, opening: false }).filter(q => q.type === 'line')).toHaveLength(0);
  });
  it('window section reaches sill+height and has projecting sill', () => { const a = buildComponent('windowsection', { height: 1200, sill: 900, wall: 200, frame: 50, projection: 60 }); expect(role(a, 'sill')).toMatchObject({ vertices: [{ x: -60, y: 850 }, { x: 260, y: 850 }, { x: 260, y: 900 }, { x: -60, y: 900 }] }); expect(role(a, 'frame-top')).toMatchObject({ vertices: [{ x: 0, y: 2050 }, { x: 200, y: 2050 }, { x: 200, y: 2100 }, { x: 0, y: 2100 }] }); });
  it('bay section projects 500 and has real lower and upper slabs', () => { const a = buildComponent('baywindowsection', { depth: 500, height: 1200, sill: 900, wall: 200, slab: 150 }); expect(role(a, 'slab-top')).toMatchObject({ vertices: [{ x: 0, y: 2100 }, { x: 700, y: 2100 }, { x: 700, y: 2250 }, { x: 0, y: 2250 }] }); expect(role(a, 'glazing')).toMatchObject({ start: { x: 700, y: 900 }, end: { x: 700, y: 2100 } }); });
  it('curtain wall produces fifteen panes bounded by real mullions', () => { const a = buildComponent('curtainwall', { width: 6000, height: 3000, columns: 5, rows: 3, mullion: 50 }); expect(a.filter(q => q.key.startsWith('pane-'))).toHaveLength(15); expect(role(a, 'pane-4-2')).toMatchObject({ vertices: [{ x: 4810, y: 2016.6666666666667 }, { x: 5950, y: 2016.6666666666667 }, { x: 5950, y: 2950 }, { x: 4810, y: 2950 }] }); });
  it('partition length 6000 uses six panels and five internal joints', () => { const a = buildComponent('glasspartition', { length: 6000, thickness: 80, panel: 1000 }); expect(a.filter(q => q.key.startsWith('joint-'))).toHaveLength(5); expect(role(a, 'face-back')).toMatchObject({ start: { x: 0, y: 80 }, end: { x: 6000, y: 80 } }); });
  it.each(['plan', 'elevation'])('banister %s spaces posts no more than 1000', view => { const a = buildComponent('banister', { view, length: 4500, height: 1000, spacing: 1000, thickness: 40 }); const posts = rects(a).filter(q => q.key.startsWith('post-')); expect(posts).toHaveLength(6); expect(posts.map(q => q.vertices[0].x)).toEqual([0, 900, 1800, 2700, 3600, 4460]); });
  it.each([['column', { ...col, width: Infinity }], ['column', { ...col, variant: 'l', arm: 400 }], ['stairplan', { ...stair, steps: 1.5 }], ['stairsection', { tread: 280, rise: 170, steps: 16, slab: 99999 }], ['axisgrid', { columns: 201, rows: 3, spacingX: 4000, spacingY: 4000, margin: 500, bubble: 150 }], ['liftplan', { width: 2200, depth: 2200, cabinWidth: 2100, cabinDepth: 1600, door: 900, wall: 150 }], ['windowelevation', { width: 1200, height: 1200, frame: 700, columns: 2, rows: 1, opening: false }], ['curtainwall', { width: 6000, height: 3000, columns: 200, rows: 200, mullion: 0.01 }], ['glasspartition', { length: 6000, thickness: 80, panel: 1e-8 }], ['banister', { view: 'plan', length: 4000, height: 1000, spacing: 1e-8, thickness: 40 }]] as const)('rejects unsafe layout %s before geometry', (kind, p) => expect(() => buildComponent(kind, p as ComponentParameters)).toThrow());
});
