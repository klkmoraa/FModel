import { beforeEach, expect, it, vi } from 'vitest';
import type { LineEntity, MLineEntity } from '../../document/types';
import { createWallAssembly, readWallAssembly, readWallSource } from '../../model/wallAssembly';
import { readComponentAssembly } from '../../model/componentAssembly';
import { prepareWallRestoration, wallCleanupRecords } from '../../model/wallCleanup';
import { CommandHarness } from './harness';

const p = (x: number, y = 0) => ({ x, y });
let h: CommandHarness;
beforeEach(() => { h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
const state = () => ({ entities: new Map(h.doc.data.entities), groups: new Map(h.doc.data.groups), history: [...h.doc.history.entries()], version: h.doc.version, dirty: h.doc.dirty });
const outputs = () => [...h.doc.data.entities.values()].filter((e): e is LineEntity => e.type === 'line' && e.meta?.fmodelWallCleanupOutput !== undefined);
async function pending(kind: string) { await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe(kind)); }
async function enter() { await pending('keyword'); h.runner.submitText(''); }
async function fixture() {
  await h.run('WALL', ['Thickness', '300', p(0), p(6000), '']);
  const anchor = [...h.doc.data.entities.keys()][0];
  const assembly = h.doc.transact('door fixture', tx => createWallAssembly(tx, anchor, readWallSource(h.doc, anchor).source, [{ id: 'door', segment: 0, offset: 4000, width: 900, type: 'single', side: 1, hingeEnd: false }]))!;
  await h.run('WALL', ['Thickness', '200', p(2000), p(2000, 2500), '']);
  const branch = [...h.doc.data.entities.values()].find(e => e.type === 'mline' && !assembly.members.includes(e.id))!.id;
  await h.run('COLUMN', [p(500, -200)], ['width=400', 'depth=400']);
  const column = [...h.doc.data.entities.values()].find(e => e.meta?.fmodelComponent)!;
  const columnMembers = readComponentAssembly(h.doc, column.id).members;
  h.doc.transact('secondary group', tx => tx.add('groups', { id: 'user', name: 'User', description: 'keep', selectable: true, members: [anchor, branch] }));
  return { anchor, assembly, branch, columnMembers, ids: [...assembly.members, branch, ...columnMembers] };
}
async function clean(ids: string[]) { h.select(...ids); expect((await h.run('LIMPIARMUROS', [''])).ok).toBe(true); return outputs(); }

it('previews a T + native column + door wall, restores IDs/groups/parameters and supports native editing and atomic undo/redo', async () => {
  const { anchor, assembly, branch, columnMembers, ids } = await fixture(), before = state();
  h.select(...ids); const run = h.runner.execute('WALLCLEAN'); await pending('keyword');
  const fragments = [...assembly.members, branch].filter(id => h.doc.entity(id)?.type === 'mline');
  expect([...h.editor.previewExcluded].sort()).toEqual(fragments.sort());
  expect(h.editor.preview!.entities!.every(e => e.type === 'line')).toBe(true); expect(state()).toEqual(before);
  const preview = h.editor.preview!.entities as LineEntity[];
  // The T's internal head disappears and the main faces stop at the native column.
  expect(preview.some(e => e.start.y === 0 && e.end.y === 0 && Math.min(e.start.x, e.end.x) >= 1900 && Math.max(e.start.x, e.end.x) <= 2100)).toBe(false);
  expect(preview.some(e => e.start.y === -150 && e.end.y === -150 && Math.min(e.start.x, e.end.x) < 700 && Math.max(e.start.x, e.end.x) > 700)).toBe(false);
  await enter(); await run; const cleaned = state(), lines = outputs();
  expect(lines.length).toBeGreaterThan(4); expect(h.doc.history.entries()).toHaveLength(before.history.length + 1);
  expect(fragments.every(id => !h.doc.entity(id)!.visible)).toBe(true);
  for (const id of [...assembly.members.filter(id => !fragments.includes(id)), ...columnMembers]) expect(h.doc.entity(id)).toEqual(before.entities.get(id));
  for (const [id, group] of before.groups) expect(h.doc.data.groups.get(id)).toEqual(group);
  const resultGroup = [...h.doc.data.groups.values()].find(g => !before.groups.has(g.id))!;
  expect(resultGroup.members.sort()).toEqual(lines.map(e => e.id).sort());
  expect(() => readWallSource(h.doc, anchor)).toThrow(/Invalid/);
  expect((await h.run('WALLFILL', [])).errors.join(' ')).toMatch(/RESTAURARMUROS|WALLRESTORE/);
  h.undo(); expect(h.doc.data.entities).toEqual(before.entities); expect(h.doc.data.groups).toEqual(before.groups);
  h.redo(); expect(h.doc.data.entities).toEqual(cleaned.entities); const beforeRestore = state();
  h.select(lines[0].id); const restore = h.runner.execute('RESTAURARMUROS'); await pending('keyword');
  expect(new Set(h.editor.previewExcluded)).toEqual(new Set(lines.map(e => e.id))); expect(state()).toEqual(beforeRestore);
  await enter(); await restore; expect(h.doc.data.entities).toEqual(before.entities); expect(h.doc.data.groups).toEqual(before.groups);
  expect(readWallAssembly(h.doc, anchor).source).toEqual(assembly.source);
  h.undo(); expect(h.doc.data.entities).toEqual(cleaned.entities); h.redo(); expect(h.doc.data.entities).toEqual(before.entities);
  h.clearSelection(); let edit = h.runner.execute('WALLTHICKNESS'); await pending('entity'); h.runner.submitEntity(anchor, p(1000)); await pending('distance'); h.runner.submitText('250'); await enter(); await edit;
  expect(readWallAssembly(h.doc, anchor).source.scale).toBe(250);
  const symbol = assembly.members.find(id => h.doc.entity(id)?.type === 'arc')!;
  edit = h.runner.execute('OPENINGEDIT'); await pending('entity'); h.runner.submitEntity(symbol, p(4000)); await pending('keyword'); h.runner.submitText('Width'); await pending('distance'); h.runner.submitText('1000'); await enter(); await edit;
  expect(readWallAssembly(h.doc, anchor).openings[0].width).toBe(1000);
});

it('cancel and stale cleanup/restoration never write, including layer and unit changes', async () => {
  const { ids } = await fixture();
  for (const stage of ['selection', 'preview'] as const) {
    if (stage === 'preview') h.select(...ids); else h.clearSelection();
    const before = state(), run = h.runner.execute('WALLCLEAN');
    await pending(stage === 'preview' ? 'keyword' : 'selection'); h.runner.cancel(); await run; expect(state()).toEqual(before); expect(h.editor.preview).toBeNull();
  }
  for (const change of ['layer', 'units'] as const) {
    h.select(...ids); const run = h.runner.execute('WALLCLEAN'); await pending('keyword');
    if (change === 'units') h.doc.data.settings.units = 'm';
    else { const layer = h.doc.data.layers.get(h.doc.entity(ids[0])!.layer)!; h.doc.data.layers.set(layer.id, { ...layer, color: '#123456' }); }
    const before = state(); await enter(); await run; expect(state()).toEqual(before); expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(h.editor.preview).toBeNull();
  }
  await clean(ids); const before = state(); let run = h.runner.execute('WALLRESTORE'); await pending('keyword'); h.runner.cancel(); await run; expect(state()).toEqual(before);
  run = h.runner.execute('WALLRESTORE'); await pending('keyword'); const layer = h.doc.data.layers.get(h.doc.entity(ids[0])!.layer)!; h.doc.data.layers.set(layer.id, { ...layer, locked: true });
  const locked = state(); await enter(); await run; expect(state()).toEqual(locked); expect(h.runner.log.at(-1)?.kind).toBe('error');
});

it('All recovers erased/ungrouped outputs; modified and foreign outputs and group additions survive', async () => {
  const { anchor, ids } = await fixture(), originals = state(), lines = await clean(ids);
  const modified = lines[0], foreign = lines[1], erased = lines.slice(2);
  h.doc.transact('user edits', tx => {
    tx.updateEntity<LineEntity>(modified.id, { end: p(123, 456), color: '#123456' });
    tx.updateEntity(foreign.id, { meta: { ...foreign.meta, fmodelWallCleanupOutput: { ...(foreign.meta!.fmodelWallCleanupOutput as object), anchorId: 'someone-else' } } });
    for (const line of erased) tx.removeEntity(line.id);
    const group = [...h.doc.data.groups.values()].find(g => g.description === 'FModel wall cleanup v1')!;
    tx.update('groups', group.id, { members: [modified.id, foreign.id, anchor] });
  });
  const edited = h.doc.entity(modified.id)!, unrelated = h.doc.entity(foreign.id)!; h.clearSelection();
  expect((await h.run('WALLRESTORE', ['All', ''])).ok).toBe(true);
  for (const [id, entity] of originals.entities) expect(h.doc.entity(id)).toEqual(entity);
  expect(h.doc.entity(modified.id)).toEqual({ ...edited, meta: undefined }); expect(h.doc.entity(foreign.id)).toEqual(unrelated);
  expect([...h.doc.data.groups.values()].some(g => g.members.includes(anchor) && g.members.includes(foreign.id))).toBe(true);
  expect(h.runner.log.some(entry => /propiedad ambigua|ambiguously owned/.test(entry.text))).toBe(true);
  // Recover even when every output and the output-only group have gone.
  h.doc.undo(); h.doc.undo(); h.doc.undo(); await clean(ids);
  h.doc.transact('erase and ungroup all', tx => { for (const line of outputs()) tx.removeEntity(line.id); for (const group of h.doc.data.groups.values()) if (group.description === 'FModel wall cleanup v1') tx.remove('groups', group.id); });
  h.clearSelection(); expect((await h.run('WALLRESTORE', ['Todos', ''])).ok).toBe(true); expect(h.doc.data.entities).toEqual(originals.entities); expect(h.doc.data.groups).toEqual(originals.groups);
});

it('copied tags and corrupt references reject atomically; edited native geometry is revealed without overwrites', async () => {
  const { anchor, ids } = await fixture(), lines = await clean(ids), copiedId = 'copied';
  h.doc.transact('copy output tag', tx => tx.add('entities', { ...lines[0], id: copiedId }));
  h.select(copiedId); let before = state(); expect((await h.run('WALLRESTORE', [''])).ok).toBe(false); expect(state()).toEqual(before);
  h.doc.transact('copy anchor tag', tx => tx.add('entities', { ...h.doc.entity(anchor)!, id: 'copied-anchor' }));
  h.clearSelection(); before = state(); expect((await h.run('WALLRESTORE', ['All', ''])).ok).toBe(false); expect(state()).toEqual(before);
  h.doc.undo();
  const source = h.doc.entity(anchor) as MLineEntity;
  h.doc.transact('changed native geometry', tx => tx.updateEntity<MLineEntity>(anchor, { vertices: source.vertices.map((p, i) => ({ ...p, x: p.x + (i ? 100 : 0) })) }));
  const edited = h.doc.entity(anchor)!; const records = wallCleanupRecords(h.doc), ownRecord = records.find(r => r.selfId === anchor)!;
  const restoration = prepareWallRestoration(h.doc, [ownRecord]); expect(restoration.editedSources).toContain(anchor); expect(restoration.reveal.find(e => e.id === anchor)).toMatchObject({ visible: true, vertices: (edited as MLineEntity).vertices });
  h.select(lines[0].id); expect((await h.run('WALLRESTORE', [''])).ok).toBe(true); expect(h.doc.entity(anchor)).toMatchObject({ visible: true, vertices: (edited as MLineEntity).vertices });
  expect(h.runner.log.some(entry => /geometría actual|current geometry/.test(entry.text))).toBe(true); h.undo();
  h.doc.transact('corrupt source backlink', tx => tx.updateEntity(anchor, { meta: { ...edited.meta, fmodelWallCleanupSource: { version: 1, selfId: anchor, anchorId: 'foreign', batchId: ownRecord.batchId } } }));
  h.clearSelection(); before = state(); expect((await h.run('WALLRESTORE', ['All', ''])).ok).toBe(false); expect(state()).toEqual(before);
});
