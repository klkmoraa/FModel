import { beforeEach, expect, it, vi } from 'vitest';
import { readWallOpening, readWallSource } from '../../model/wallAssembly';
import { buildWallAssembly } from '../../geometry/wallOpenings';
import { CommandHarness } from './harness';
const p = (x: number, y = 0) => ({ x, y });
let h: CommandHarness;
beforeEach(() => { h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
async function selected(name: string, id: string, steps: Array<string | { x: number; y: number } | { entity: string }>) {
  const run = h.runner.execute(name);
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity'));
  h.runner.submitEntity(id, p(0));
  for (const step of steps) {
    await vi.waitFor(() => expect(h.runner.pending).not.toBeNull());
    if (typeof step === 'string') h.runner.submitText(step); else if ('entity' in step) h.runner.submitEntity(step.entity, p(0)); else h.runner.submitPoint(step);
  }
  await run;
  return h.runner.log.filter(x => x.kind === 'error');
}
async function wall() { await h.run('WALL', [p(0), p(10000), '']); return [...h.doc.data.entities.values()].find(e => e.type === 'mline')!.id; }
async function door(wallId: string, center: number) {
  expect(await selected('WALLDOOR', wallId, [p(center), ''])).toEqual([]);
  const assembly = readWallSource(h.doc, wallId).assembly!;
  return assembly.members.find(id => h.doc.entity(id)?.meta?.fmodelWallMember && (h.doc.entity(id)!.meta!.fmodelWallMember as { openingId?: string }).openingId === assembly.openings.at(-1)!.id)!;
}
it('two doors, move repairs old gap, edit and mirror retain role IDs and atomic history', async () => {
  const id = await wall(), a = await door(id, 2000), b = await door(id, 7000);
  const old = readWallOpening(h.doc, a), other = readWallOpening(h.doc, b), before = new Map(h.doc.data.entities);
  expect(old.assembly.openings).toHaveLength(2);
  expect(await selected('MOVERHUECO', a, [p(3500), ''])).toEqual([]);
  const moved = readWallOpening(h.doc, a); expect(moved.opening.offset).toBe(3500); expect(readWallOpening(h.doc, b).opening).toEqual(other.opening);
  const fragments = buildWallAssembly(moved.assembly.source, moved.assembly.openings).fragments;
  expect(fragments.some(f => f.vertices.some(v => v.x === 1550))).toBe(false);
  h.undo(); expect(h.doc.data.entities).toEqual(before); h.redo();
  expect(await selected('EDITARHUECO', a, ['Width', '1200', 'Type', 'Double', ''])).toEqual([]);
  expect(readWallOpening(h.doc, a).opening).toMatchObject({ width: 1200, type: 'double' });
  expect(await selected('REFLEJARHUECO', a, ['Ambos', ''])).toEqual([]);
  expect(readWallOpening(h.doc, a).opening).toMatchObject({ side: -1, hingeEnd: true });
});
it('copy same/other wall, delete one and last restores principal properties and thickness', async () => {
  const id = await wall(), a = await door(id, 2000);
  expect(await selected('COPIARHUECO', a, [{ entity: id }, p(5000), ''])).toEqual([]);
  let assembly = readWallSource(h.doc, id).assembly!; expect(assembly.openings).toHaveLength(2);
  const copyId = assembly.members.find(mid => (h.doc.entity(mid)?.meta?.fmodelWallMember as { openingId?: string })?.openingId === assembly.openings[1].id)!;
  expect(await selected('BORRARHUECO', copyId, [''])).toEqual([]);
  expect(readWallSource(h.doc, id).assembly?.openings).toHaveLength(1);
  expect(await selected('ESPESORMURO', id, ['250', ''])).toEqual([]);
  expect(readWallSource(h.doc, id).source.scale).toBe(250);
  const props = h.doc.entity(id)!;
  expect(await selected('BORRARHUECO', a, [''])).toEqual([]);
  expect(readWallSource(h.doc, id).assembly).toBeNull();
  expect(h.doc.entity(id)).toMatchObject({ id, order: props.order, layer: props.layer, scale: 250, vertices: [p(0), p(10000)] });
});
it('cancel and locked member or malformed association refuse without writes', async () => {
  const id = await wall(), a = await door(id, 2000), before = new Map(h.doc.data.entities);
  const pending = h.runner.execute('OPENINGMOVE'); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity'));
  h.runner.submitEntity(a, p(0)); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('point'));
  h.runner.cancel(); await pending; expect(h.doc.data.entities).toEqual(before); expect(h.editor.preview).toBeNull();
  const member = readWallOpening(h.doc, a).assembly.members.at(-1)!;
  h.doc.transact('lock', tx => tx.updateEntity(member, { locked: true }));
  const locked = new Map(h.doc.data.entities);
  expect((await selected('BORRARHUECO', a, [])).length).toBeGreaterThan(0);
  expect(h.doc.data.entities).toEqual(locked);
});
it.each([['mm', 900, 1200], ['m', 0.9, 1.2], ['unitless', 900, 1200]] as const)('physical opening defaults in %s and explicit symbol-only selection', async (units, doorWidth, windowWidth) => {
  h = new CommandHarness(new (await import('../../editor/editor')).Editor((await import('../../document/defaults')).createDocument({ units })));
  await h.run('WALL', [p(0), p(units === 'm' ? 10 : 10000), '']);
  const id = [...h.doc.data.entities.keys()][0], center = units === 'm' ? 2 : 2000;
  const a = await door(id, center); expect(readWallOpening(h.doc, a).opening.width).toBeCloseTo(doorWidth);
  expect(await selected('WALLWINDOW', id, [p(units === 'm' ? 7 : 7000), ''])).toEqual([]);
  expect(readWallSource(h.doc, id).assembly!.openings[1].width).toBeCloseTo(windowWidth);
  const snapshot = new Map(h.doc.data.entities);
  expect((await selected('OPENINGDELETE', id, [])).length).toBeGreaterThan(0);
  expect(h.doc.data.entities).toEqual(snapshot);
});
it('copy to another wall leaves source untouched and preview exclusion clears on cancellation', async () => {
  const id = await wall(), symbol = await door(id, 2000);
  await h.run('WALL', [p(0, 3000), p(10000, 3000), '']);
  const target = [...h.doc.data.entities.values()].find(e => e.type === 'mline' && e.id !== id && e.vertices[0].y === 3000)!.id;
  const sourceBefore = new Map(readWallSource(h.doc, id).assembly!.members.map(mid => [mid, h.doc.entity(mid)]));
  const run = h.runner.execute('OPENINGCOPY');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity')); h.runner.submitEntity(symbol, p(0));
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity')); h.runner.submitEntity(target, p(0));
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('point')); h.runner.submitPoint(p(7000, 3000));
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  expect(h.editor.preview?.hideIds).toEqual([target]);
  expect(h.doc.entity(target)?.type).toBe('mline'); h.runner.cancel(); await run;
  expect(h.editor.previewExcluded.size).toBe(0); expect(readWallSource(h.doc, target).assembly).toBeNull();
  expect(new Map([...sourceBefore.keys()].map(mid => [mid, h.doc.entity(mid)]))).toEqual(sourceBefore);
  expect(await selected('OPENINGCOPY', symbol, [{ entity: target }, p(7000, 3000), ''])).toEqual([]);
  expect(readWallSource(h.doc, target).assembly?.openings[0]).toMatchObject({ width: 900, offset: 7000 });
  expect(new Map([...sourceBefore.keys()].map(mid => [mid, h.doc.entity(mid)]))).toEqual(sourceBefore);
});
it('corrupt associated member and a locked secondary member reject atomically', async () => {
  const id = await wall(), symbol = await door(id, 2000), assembly = readWallOpening(h.doc, symbol).assembly;
  h.doc.transact('foreign role', tx => tx.updateEntity(assembly.members.at(-1)!, { meta: { ...h.doc.entity(assembly.members.at(-1)!)!.meta, fmodelWallMember: { version: 1, groupId: 'wrong', anchorId: id, role: 'wrong' } } }));
  const before = new Map(h.doc.data.entities);
  expect((await selected('OPENINGEDIT', symbol, [])).length).toBeGreaterThan(0);
  expect(h.doc.data.entities).toEqual(before);
});
