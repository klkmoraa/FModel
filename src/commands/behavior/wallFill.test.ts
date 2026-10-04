import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../../document/defaults';
import type { HatchEntity, MLineEntity } from '../../document/types';
import { Editor } from '../../editor/editor';
import * as componentAssemblies from '../../model/componentAssembly';
import { readComponentAssembly } from '../../model/componentAssembly';
import { createWallAssembly, readWallSource } from '../../model/wallAssembly';
import { hatchSegments } from '../../model/kinds/hatch';
import { loopsArea } from '../../model/kinds/polylines';
import * as patterns from '../../model/hatchPatterns';
import { wallStyle } from '../../model/wallStyle';
import { CommandHarness } from './harness';

const p = (x: number, y = 0) => ({ x, y });
let h: CommandHarness;
beforeEach(() => { h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
const state = () => ({ entities: new Map(h.doc.data.entities), groups: new Map(h.doc.data.groups), styles: new Map(h.doc.data.mlineStyles), history: [...h.doc.history.entries()], version: h.doc.version, dirty: h.doc.dirty });
const hatches = () => [...h.doc.data.entities.values()].filter((e): e is HatchEntity => e.type === 'hatch');
async function room(cut = false) {
  expect((await h.run('WALLRECT', ['Thickness', '300', p(0), p(6000, 4000)])).ok).toBe(true);
  const id = [...h.doc.data.entities.keys()][0];
  if (cut) h.doc.transact('opening fixture', tx => createWallAssembly(tx, id, readWallSource(h.doc, id).source, [{ id: 'empty', segment: 0, offset: 3000, width: 900, type: 'empty', side: 1, hingeEnd: false }]));
  return id;
}
async function pending(kind: string) { await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe(kind)); }
async function input(kind: string, value: string) { await pending(kind); const before = h.runner.pending; h.runner.submitText(value); await vi.waitFor(() => expect(h.runner.pending).not.toBe(before)); }
async function begin(ids: string[]) { h.select(...ids); const run = h.runner.execute('WALLFILL'); await pending('keyword'); return { run }; }

describe('architectural wall fill', () => {
  it('selected_material_and_dedup creates independent material snapshots with one batch undo', async () => {
    const wall = await room(true), assembly = readWallSource(h.doc, wall).assembly!;
    await h.run('COLUMN', [p(1000, 1000)], ['variant=circular', 'diameter=600']);
    const column = [...h.doc.data.groups.values()].find(g => !assembly.members.includes(g.members[0]))!.members;
    h.doc.transact('graphics', tx => tx.updateEntity(wall, { color: '#7657D5', lineweight: 35, transparency: 20, meta: { ...h.doc.entity(wall)!.meta, note: { text: 'retained' } } }));
    const before = state(); const { run } = await begin([...assembly.members, wall, ...column]);
    const preview = h.editor.preview!.entities as HatchEntity[];
    expect(preview).toHaveLength(2); expect(preview.every(e => e.type === 'hatch' && e.islandStyle === 'normal' && e.pattern.type === 'solid')).toBe(true);
    expect(loopsArea(preview[0].loops)).toBeCloseTo(5730000, 5); expect(loopsArea(preview[1].loops)).toBeCloseTo(90000 * Math.PI, 5);
    expect(h.editor.previewExcluded.size).toBe(0); expect(state()).toEqual(before);
    await input('keyword', ''); await run;
    const result = hatches(); expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ owner: before.entities.get(wall)!.owner, layer: before.entities.get(wall)!.layer, color: '#7657D5', lineweight: 35, transparency: 20, meta: { note: { text: 'retained' } } });
    expect(result[0].meta?.fmodelWallMember).toBeUndefined(); expect(result[1].meta?.fmodelComponentMember).toBeUndefined();
    expect(result.every(e => !before.entities.has(e.id) && e.order > Math.max(...[...before.entities.values()].map(e => e.order)) && e.associative === undefined)).toBe(true);
    expect(new Map([...before.entities.keys()].map(id => [id, h.doc.entity(id)]))).toEqual(before.entities); expect(h.doc.data.groups).toEqual(before.groups); expect(h.doc.data.mlineStyles).toEqual(before.styles);
    expect(h.doc.history.entries()).toHaveLength(before.history.length + 1);
    h.undo(); expect(h.doc.data.entities).toEqual(before.entities); expect(h.doc.data.groups).toEqual(before.groups); h.redo(); expect(hatches()).toEqual(result);
  });
  it('uncut closed room keeps an empty nested room in one HATCH', async () => {
    const id = await room(); h.select(id); expect((await h.run('RELLENARMUROS', [''])).ok).toBe(true);
    expect(hatches()).toHaveLength(1); expect(hatches()[0].loops).toHaveLength(2); expect(loopsArea(hatches()[0].loops)).toBeCloseTo(6000000);
  });
  it('two openings in an open wall create three disconnected material snapshots', async () => {
    await h.run('WALL', ['Thickness', '300', p(0), p(6000), '']); const id = [...h.doc.data.entities.keys()][0];
    h.doc.transact('two cuts', tx => createWallAssembly(tx, id, readWallSource(h.doc, id).source, [1500, 4500].map((offset, i) => ({ id: `cut-${i}`, segment: 0, offset, width: 900, type: 'empty', side: 1, hingeEnd: false }))));
    h.select(...readWallSource(h.doc, id).assembly!.members); expect((await h.run('WALLFILL', [''])).ok).toBe(true);
    expect(hatches()).toHaveLength(3); expect(hatches().reduce((sum, e) => sum + loopsArea(e.loops), 0)).toBeCloseTo(1260000);
  });
  it.each([['rectangular', 240000], ['l', 127500], ['t', 127500], ['cross', 127500], ['circular', 90000 * Math.PI]] as const)('native column %s uses its rotated world outline', async (variant, area) => {
    await h.run('COLUMN', [p(1000, 1000)], [`variant=${variant}`, 'width=600', 'depth=400', 'arm=150', 'diameter=600', 'rotation=30']);
    const id = [...h.doc.data.entities.keys()][0], outline = h.doc.entity(readComponentAssembly(h.doc, id).roles.get('outline')!)!;
    h.select(id); expect((await h.run('WALLFILL', [''])).ok).toBe(true); const fill = hatches()[0];
    expect(loopsArea(fill.loops)).toBeCloseTo(area, 5);
    if (outline.type === 'lwpolyline') expect(fill.loops[0].vertices.map(v => p(v.x, v.y))).toEqual(outline.vertices);
    else if (outline.type === 'circle') { expect(fill.loops[0].vertices.map(v => v.bulge)).toEqual([1, 1]); expect(fill.origin).toEqual(outline.center); }
  });
  it.each(['raw circle', 'raw polygon', 'noncolumn', 'mixed invalid'] as const)('rejects %s selection as a whole', async kind => {
    const id = await room();
    if (kind === 'noncolumn') await h.run('STAIRPLAN', [p(1000, 1000)]);
    else h.doc.transact('raw', tx => tx.addEntity({ ...entityDefaults(h.doc), type: kind === 'raw polygon' ? 'lwpolyline' : 'circle', ...(kind === 'raw polygon' ? { vertices: [p(0), p(1000), p(1000, 1000)], closed: true, constantWidth: 0 } : { center: p(1000, 1000), radius: 300 }) } as never));
    const other = [...h.doc.data.entities.keys()].find(mid => mid !== id)!; const before = state(); h.select(...(kind === 'mixed invalid' ? [id, other] : [other]));
    expect((await h.run('WALLFILL', [''])).ok).toBe(false); expect(state()).toEqual(before); expect(h.editor.preview).toBeNull();
  });
  it('native selection supports prompt selection and empty no-op', async () => {
    const id = await room(), before = state(); let run = h.runner.execute('WALLFILL'); await pending('selection'); h.runner.submitSelection([]); await run; expect(state()).toEqual(before);
    run = h.runner.execute('WALLFILL'); await pending('selection'); h.runner.submitSelection([id]); await input('keyword', ''); await run; expect(hatches()).toHaveLength(1);
  });
  it.each([['mm', 100], ['m', 0.1], ['unitless', 100]] as const)('preview_options_and_units uses physical 100mm spacing in %s and actual hatch lines', async (units, spacing) => {
    h = new CommandHarness(new Editor(createDocument({ units })));
    await h.run('COLUMN', [p(0)]); const before = state(), { run } = await begin([...h.doc.data.entities.keys()]);
    await input('keyword', 'Hatched'); await pending('keyword'); const candidate = h.editor.preview!.entities![0] as HatchEntity;
    expect(candidate.pattern).toMatchObject({ type: 'user', spacing, angle: Math.PI / 4, double: false, scale: 1 });
    const generated = hatchSegments(candidate); expect(generated.tooDense).toBe(false); expect(generated.segments.length).toBeGreaterThan(2);
    const intercepts = [...new Set(generated.segments.map(([a, b]) => { expect(b.y - a.y).toBeCloseTo(b.x - a.x, 7); return Math.round((a.y - a.x) / Math.SQRT2 / spacing); }))].sort((a, b) => a - b);
    expect(intercepts.slice(1).every((v, i) => v - intercepts[i] === 1)).toBe(true);
    await input('keyword', 'Spacing'); await input('distance', String(spacing * 2)); await input('keyword', 'Angle'); await input('angle', '0');
    await pending('keyword'); const revised = h.editor.preview!.entities![0] as HatchEntity;
    expect(revised.pattern.spacing).toBe(spacing * 2); expect(hatchSegments(revised).segments.every(([a, b]) => Math.abs(a.y - b.y) < 1e-9)).toBe(true);
    await input('keyword', 'Solid'); await pending('keyword'); expect((h.editor.preview!.entities![0] as HatchEntity).pattern.type).toBe('solid'); expect(state()).toEqual(before);
    await input('keyword', 'Hatched'); await input('keyword', ''); await run; expect(hatches()[0].pattern.type).toBe('user');
  });
  it('ordinary UTM uses a logical-source local origin and generates finite lines', async () => {
    await h.run('COLUMN', [p(1000000, 2000000)]); h.select(...h.doc.data.entities.keys()); expect((await h.run('WALLFILL', ['Hatched', ''])).ok).toBe(true);
    expect(hatches()[0].origin).toEqual(p(1000000, 2000000)); const lines = hatchSegments(hatches()[0]); expect(lines.tooDense).toBe(false); expect(lines.segments.length).toBeGreaterThan(2); expect(lines.segments.flat().every(v => Number.isFinite(v.x) && Number.isFinite(v.y))).toBe(true);
  });
  it.each(['confirmation', 'selection', 'distance', 'angle'] as const)('cancel_and_stale cancels %s without document/history writes', async stage => {
    const id = await room(), before = state(); if (stage !== 'selection') h.select(id);
    const run = h.runner.execute('WALLFILL'); await pending(stage === 'selection' ? 'selection' : 'keyword');
    if (stage === 'distance' || stage === 'angle') { await input('keyword', stage === 'distance' ? 'Spacing' : 'Angle'); await pending(stage); }
    h.runner.cancel(); await run; expect(state()).toEqual(before); expect(h.editor.preview).toBeNull();
  });
  it.each(['vertices', 'properties', 'owner', 'layer', 'style', 'group', 'member', 'units'] as const)('rejects interleaved wall %s before final apply', async change => {
    const id = await room(true), assembly = readWallSource(h.doc, id).assembly!, { run } = await begin(assembly.members);
    const e = h.doc.entity(id)!;
    if (change === 'group') h.doc.data.groups.set(assembly.groupId, { ...h.doc.data.groups.get(assembly.groupId)!, name: 'changed' });
    else if (change === 'units') h.doc.data.settings.units = 'm';
    else if (change === 'style') h.doc.data.mlineStyles.set(assembly.source.style, { ...h.doc.data.mlineStyles.get(assembly.source.style)!, name: 'changed' });
    else if (change === 'member') { const mid = assembly.members.at(-1)!; h.doc.data.entities.set(mid, { ...h.doc.entity(mid)!, locked: true }); }
    else if (change === 'layer') h.doc.data.layers.set(e.layer, { ...h.doc.data.layers.get(e.layer)!, color: '#123456' });
    else h.doc.data.entities.set(id, { ...e, ...(change === 'vertices' ? { vertices: [p(0), p(7000)] } : change === 'owner' ? { owner: 'foreign' } : { color: '#123456' }) } as typeof e);
    const changed = state(); await input('keyword', ''); await run; expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(changed); expect(h.editor.preview).toBeNull();
  });
  it('rejects an independent source user-group changed before confirmation', async () => {
    const id = await room(); h.doc.transact('user group', tx => tx.add('groups', { id: 'user', name: 'User', description: '', selectable: true, members: [id] }));
    const { run } = await begin([id]); h.doc.data.groups.set('user', { ...h.doc.data.groups.get('user')!, name: 'changed' });
    const before = state(); await input('keyword', ''); await run; expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(before); expect(h.editor.preview).toBeNull();
  });
  it('unexpected source errors reach the runner unchanged and abort without writes', async () => {
    await h.run('COLUMN', [p(0)]); const before = state(), error = new Error('Unexpected source failure');
    vi.spyOn(componentAssemblies, 'readComponentAssembly').mockImplementationOnce(() => { throw error; }); h.select(...h.doc.data.entities.keys());
    expect((await h.run('WALLFILL', [])).ok).toBe(false); expect(console.error).toHaveBeenCalledWith(error); expect(state()).toEqual(before); expect(h.editor.preview).toBeNull();
  });
  it('rejects column parameters changed during confirmation', async () => {
    await h.run('COLUMN', [p(0)]); const id = [...h.doc.data.entities.keys()][0], { run } = await begin([id]), e = h.doc.entity(id)!;
    h.doc.data.entities.set(id, { ...e, meta: { ...e.meta, fmodelComponent: { ...(e.meta!.fmodelComponent as object), parameters: { ...readComponentAssembly(h.doc, id).parameters, width: 800 } } } });
    const before = state(); await input('keyword', ''); await run; expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(before);
  });
  it.each(['locked', 'hidden', 'foreign owner'] as const)('every associated member must be selectable at selection: %s', async problem => {
    const id = await room(true), assembly = readWallSource(h.doc, id).assembly!, mid = assembly.members.at(-1)!;
    h.doc.transact('deny', tx => tx.updateEntity(mid, problem === 'locked' ? { locked: true } : problem === 'hidden' ? { visible: false } : { owner: 'foreign' }));
    const before = state(); h.select(id); expect((await h.run('WALLFILL', [])).ok).toBe(false); expect(state()).toEqual(before);
  });
  it.each(['0.000001', '1e-20'] as const)('dense or unrepresentable spacing %s rejects without solid fallback or pattern generation', async spacing => {
    const id = await room(), { run } = await begin([id]); await input('keyword', 'Spacing'); await input('distance', spacing);
    const generate = vi.spyOn(patterns, 'generateHatch'), before = state(); await input('keyword', 'Hatched'); await run;
    expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(before); expect(generate).not.toHaveBeenCalled(); expect(h.editor.preview).toBeNull();
  });
  it('large circle rejects excessive hatch work before generating patterns while solid keeps exact bulges', async () => {
    await h.run('COLUMN', [p(0)], ['variant=circular', 'diameter=1000000']); const { run } = await begin([...h.doc.data.entities.keys()]);
    expect((h.editor.preview!.entities![0] as HatchEntity).loops[0].vertices.map(v => v.bulge)).toEqual([1, 1]);
    const before = state(), generate = vi.spyOn(patterns, 'generateHatch'); await input('keyword', 'Hatched'); await run;
    expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(before); expect(generate).not.toHaveBeenCalled();
  });
  it.each(['origins', 'source points', 'output vertices', 'output hatches', 'batch edges', 'batch work'] as const)('bounds %s before a large preview or pattern generation', async limit => {
    h.doc.transact('bounded fixture', tx => {
      const style = wallStyle('fixture', 'Fixture'); tx.add('mlineStyles', style);
      const n = limit === 'origins' ? 101 : limit === 'source points' ? 100 : limit === 'output vertices' ? 52 : limit === 'output hatches' ? 6 : limit === 'batch edges' ? 14 : 5;
      for (let i = 0; i < n; i++) {
        if (limit === 'batch edges' || limit === 'batch work') continue;
        const count = limit === 'source points' ? 60 : limit === 'output vertices' ? 100 : 2;
        const vertices = count === 2 ? [p(i * 50000), p(i * 50000 + 1000000)] : Array.from({ length: count }, (_, j) => p(i * 50000 + 10000 * Math.cos(j * 2 * Math.PI / count), 10000 * Math.sin(j * 2 * Math.PI / count)));
        const e = tx.addEntity({ ...entityDefaults(h.doc), type: 'mline', vertices, closed: count > 2, scale: 300, justification: 'zero', style: style.id } as never) as MLineEntity;
        if (limit === 'output hatches') createWallAssembly(tx, e.id, readWallSource(h.doc, e.id).source, Array.from({ length: 200 }, (_, j) => ({ id: `${i}-${j}`, segment: 0, offset: 2000 + j * 4000, width: 900, type: 'empty', side: 1, hingeEnd: false })));
      }
    });
    if (limit === 'batch edges' || limit === 'batch work') for (let i = 0; i < (limit === 'batch edges' ? 14 : 5); i++) await h.run('COLUMN', [p(i * 10000)], ['variant=circular', 'diameter=6000']);
    const before = state(), generate = vi.spyOn(patterns, 'generateHatch'); h.select(...h.doc.data.entities.keys());
    expect((await h.run('WALLFILL', limit.startsWith('batch') ? ['Spacing', limit === 'batch work' ? '20' : '100', 'Hatched', ''] : [''])).ok).toBe(false);
    expect(state()).toEqual(before); expect(h.editor.preview).toBeNull(); expect(generate).not.toHaveBeenCalled();
  });
});
