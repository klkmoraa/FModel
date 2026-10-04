import { beforeEach, expect, it, vi } from 'vitest';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { readWallSource } from '../../model/wallAssembly';
import { CommandHarness } from './harness';

const p = (x: number, y = 0) => ({ x, y });
let h: CommandHarness;
beforeEach(() => { h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
async function source() {
  expect((await h.run('WALL', [p(0), p(6000), ''])).ok).toBe(true);
  return [...h.doc.data.entities.values()].find(e => e.type === 'mline')!.id;
}
async function begin(name: string, id: string) {
  const running = h.runner.execute(name);
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity'));
  h.runner.submitEntity(id, p(2000));
  return { running };
}
async function input(kind: string, value: string | { x: number; y: number }) {
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe(kind));
  const pending = h.runner.pending;
  if (typeof value === 'string') h.runner.submitText(value); else h.runner.submitPoint(value);
  await vi.waitFor(() => expect(h.runner.pending).not.toBe(pending));
}
function state() { return { entities: new Map(h.doc.data.entities), styles: new Map(h.doc.data.mlineStyles), groups: new Map(h.doc.data.groups), history: [...h.doc.history.entries()], version: h.doc.version, dirty: h.doc.dirty }; }

it('extracts a full physical axis from an associated source without changing its group', async () => {
  const id = await source();
  h.doc.transact('reference face', tx => tx.updateEntity(id, { justification: 'top', color: '#7657D5', lineweight: 35, meta: { note: 'retain' } }));
  const door = await begin('WALLDOOR', id);
  await input('point', p(3000)); await input('point', 'Type'); await input('keyword', 'Empty'); await input('point', ''); await door.running;
  const association = readWallSource(h.doc, id).assembly!;
  const before = state(); const member = association.members.at(-1)!;
  const run = await begin('EJEMURO', member);
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  expect(h.editor.preview?.entities?.[0]).toMatchObject({ type: 'lwpolyline', vertices: [p(0, -75), p(6000, -75)] });
  expect(state()).toEqual(before);
  await input('keyword', ''); await run.running;
  const added = [...h.doc.data.entities.values()].filter(e => !before.entities.has(e.id));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ type: 'lwpolyline', vertices: [p(0, -75), p(6000, -75)], closed: false });
  expect(added[0]).toMatchObject({ owner: before.entities.get(id)!.owner, layer: before.entities.get(id)!.layer, color: '#7657D5', lineweight: 35, meta: { note: 'retain' } });
  expect(added[0].id).not.toBe(id); expect(added[0].order).toBeGreaterThan(before.entities.get(id)!.order);
  expect(added[0].meta?.fmodelWallMember).toBeUndefined();
  expect(added[0].meta?.fmodelWallAssembly).toBeUndefined();
  expect(new Map([...before.entities.keys()].map(key => [key, h.doc.entity(key)]))).toEqual(before.entities);
  expect(h.doc.data.groups).toEqual(before.groups);
  h.undo(); expect(state().entities).toEqual(before.entities);
  h.redo(); expect(h.doc.entity(added[0].id)).toEqual(added[0]);
});

it.each([['mm', 1000], ['m', 1], ['unitless', 1000]] as const)('parallel wall defaults to physical 1000 gap in %s', async (units, gap) => {
  h = new CommandHarness(new Editor(createDocument({ units })));
  const id = await source(); const thickness = units === 'm' ? 0.15 : 150;
  const run = await begin('PARALELAMURO', id);
  await input('distance', '');
  await input('point', 'Left');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  expect(h.editor.preview?.entities?.[0]).toMatchObject({ type: 'mline', vertices: [p(0, gap + thickness), p(6000, gap + thickness)], scale: thickness });
  await input('keyword', ''); await run.running;
  expect([...h.doc.data.entities.values()].find(e => e.type === 'mline' && e.id !== id)).toMatchObject({ vertices: [p(0, gap + thickness), p(6000, gap + thickness)], justification: 'zero' });
});

it('changes gap, thickness and side before an atomic insertion', async () => {
  const id = await source(), before = state(); const run = await begin('WALLOFFSET', id);
  await input('distance', '0'); await input('point', p(2000, -800));
  await input('keyword', 'Gap'); await input('distance', '1000');
  await input('keyword', 'Thickness'); await input('distance', '300');
  await input('keyword', 'Left');
  await vi.waitFor(() => expect(h.editor.preview?.entities?.[0]).toMatchObject({ vertices: [p(0, 1225), p(6000, 1225)], scale: 300 }));
  expect(state()).toEqual(before);
  await input('keyword', ''); await run.running;
  const added = [...h.doc.data.entities.values()].filter(e => !before.entities.has(e.id));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ type: 'mline', vertices: [p(0, 1225), p(6000, 1225)], scale: 300 });
  expect(h.doc.entity(id)).toEqual(before.entities.get(id));
  h.undo(); expect(h.doc.data.entities).toEqual(before.entities); h.redo(); expect(h.doc.entity(added[0].id)).toEqual(added[0]);
});

it.each([['WALLAXIS', 1], ['WALLAXIS', 2], ['WALLOFFSET', 1], ['WALLOFFSET', 2], ['WALLOFFSET', 3], ['WALLOFFSET', 4], ['WALLOFFSET', 5]] as const)('%s cancels pending stage %s without writes', async (name, stage) => {
  const id = await source(), before = state(); const run = h.runner.execute(name);
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity'));
  if (stage > 1) { h.runner.submitEntity(id, p(0)); if (name === 'WALLOFFSET') { await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('distance')); if (stage > 2) { h.runner.submitText(''); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('point')); if (stage > 3) { h.runner.submitText('Left'); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); if (stage > 4) { h.runner.submitText('Gap'); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('distance')); } } } } else await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); }
  h.runner.cancel(); await run;
  expect(state()).toEqual(before); expect(h.editor.preview).toBeNull(); expect(h.doc.history.inGroup).toBe(false);
});

it.each(['geometry', 'layer', 'owner', 'style', 'association'] as const)('rejects %s changed after selection without writing', async change => {
  const id = await source(), run = await begin('WALLAXIS', id);
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  const old = h.doc.entity(id)!;
  h.doc.data.entities.set(id, { ...old, ...(change === 'geometry' ? { vertices: [p(0), p(7000)] } : change === 'layer' ? { layer: 'foreign' } : change === 'owner' ? { owner: 'foreign' } : change === 'style' ? { style: 'foreign' } : { meta: { fmodelWallMember: { groupId: 'foreign' } } }) } as typeof old);
  const before = state(); await input('keyword', ''); await run.running;
  expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(before); expect(h.editor.preview).toBeNull();
});
it('axis point is ambiguous and a locked secondary member blocks an associated copy', async () => {
  const id = await source();
  const run = await begin('WALLOFFSET', id);
  await input('distance', '0'); await input('point', p(2000, 0));
  await run.running;
  expect(h.runner.log.at(-1)?.kind).toBe('error');
  expect([...h.doc.data.entities.values()].filter(e => e.type === 'mline')).toHaveLength(1);
  const door = await begin('WALLDOOR', id);
  await input('point', p(3000)); await input('point', ''); await door.running;
  const members = readWallSource(h.doc, id).assembly!.members;
  h.doc.transact('lock secondary', tx => tx.updateEntity(members.at(-1)!, { locked: true }));
  const before = state(); const denied = await begin('WALLOFFSET', id);
  await denied.running;
  expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(before);
});
it.each(['member property', 'group', 'layer visibility', 'style definition'] as const)('associated wall rejects interleaved %s change before apply', async change => {
  const id = await source();
  const door = await begin('WALLDOOR', id); await input('point', p(3000)); await input('point', ''); await door.running;
  const assembly = readWallSource(h.doc, id).assembly!, memberId = assembly.members.at(-1)!;
  const run = await begin('WALLOFFSET', memberId);
  await input('distance', '1000'); await input('point', 'Left');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  if (change === 'member property') h.doc.data.entities.set(memberId, { ...h.doc.entity(memberId)!, color: '#7657D5' });
  else if (change === 'group') h.doc.data.groups.set(assembly.groupId, { ...h.doc.data.groups.get(assembly.groupId)!, name: 'interleaved' });
  else if (change === 'layer visibility') {
    const layer = h.doc.entity(memberId)!.layer;
    h.doc.data.layers.set(layer, { ...h.doc.data.layers.get(layer)!, on: false });
  } else {
    const style = assembly.source.style, original = h.doc.data.mlineStyles.get(style)!;
    h.doc.data.mlineStyles.set(style, { ...original, name: 'interleaved' });
  }
  const before = state(); await input('keyword', ''); await run.running;
  expect(h.runner.log.at(-1)?.kind).toBe('error'); expect(state()).toEqual(before); expect(h.editor.preview).toBeNull();
});
it('parallel copy of an associated cut remains empty and accepts a later native opening', async () => {
  const id = await source();
  const originalDoor = await begin('WALLDOOR', id); await input('point', p(3000)); await input('point', ''); await originalDoor.running;
  const original = readWallSource(h.doc, id).assembly!;
  const run = await begin('WALLOFFSET', original.members.at(-1)!);
  await input('distance', '1000'); await input('point', 'Left'); await input('keyword', ''); await run.running;
  const copy = [...h.doc.data.entities.values()].find(e => e.type === 'mline' && !original.members.includes(e.id))!;
  expect(copy.meta?.fmodelWallAssembly).toBeUndefined(); expect(copy.meta?.fmodelWallMember).toBeUndefined();
  expect(readWallSource(h.doc, copy.id).assembly).toBeNull();
  const nextDoor = await begin('WALLDOOR', copy.id);
  await input('point', p(3000, 1150)); await input('point', ''); await nextDoor.running;
  expect(readWallSource(h.doc, copy.id).assembly?.openings).toHaveLength(1);
  expect(readWallSource(h.doc, id).assembly).toEqual(original);
});
