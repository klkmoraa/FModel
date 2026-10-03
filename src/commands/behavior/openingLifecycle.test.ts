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
  const old = readWallOpening(h.doc, a), other = readWallOpening(h.doc, b), before = new Map(h.doc.data.entities), otherIds = new Map(other.assembly.roles);
  expect(old.assembly.openings).toHaveLength(2);
  expect(await selected('MOVERHUECO', a, [p(3500), ''])).toEqual([]);
  const moved = readWallOpening(h.doc, a); expect(moved.opening.offset).toBe(3500); expect(readWallOpening(h.doc, b).opening).toEqual(other.opening);
  for (const [role, id] of otherIds) if (role.includes(JSON.stringify(other.opening.id))) expect(readWallOpening(h.doc, b).assembly.roles.get(role)).toBe(id);
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
it.each(['locked', 'hidden layer', 'foreign owner', 'changed source'] as const)('independent WALLTHICKNESS revalidates %s immediately before confirmation', async change => {
  const id = await wall();
  const run = h.runner.execute('WALLTHICKNESS');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity')); h.runner.submitEntity(id, p(0));
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('distance')); h.runner.submitText('250');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  const current = h.doc.entity(id)!;
  // Simulate an interleaved editor/import state without placing its write in this command's open history group.
  if (change === 'hidden layer') h.doc.data.layers.set(current.layer, { ...h.doc.data.layers.get(current.layer)!, on: false });
  else h.doc.data.entities.set(id, { ...current, ...(change === 'locked' ? { locked: true } : change === 'foreign owner' ? { owner: 'foreign' } : { vertices: [p(0), p(12000)] }) } as typeof current);
  const before = { entities: new Map(h.doc.data.entities), layers: new Map(h.doc.data.layers), styles: new Map(h.doc.data.mlineStyles), groups: new Map(h.doc.data.groups), history: [...h.doc.history.entries()], version: h.doc.version };
  h.runner.submitText(''); await run;
  expect(h.runner.log.at(-1)?.kind).toBe('error');
  expect({ entities: h.doc.data.entities, layers: h.doc.data.layers, styles: h.doc.data.mlineStyles, groups: h.doc.data.groups, history: h.doc.history.entries(), version: h.doc.version }).toEqual(before);
  expect(h.editor.preview).toBeNull(); expect(h.editor.previewExcluded.size).toBe(0);
});
type Stage = { kind: 'entity' | 'point' | 'keyword' | 'distance'; input?: string | { x: number; y: number } | 'source' | 'symbol' };
const stage = (kind: Stage['kind'], input?: Stage['input']): Stage => ({ kind, input });
const cancellationFlows: Record<string, Stage[]> = {
  WALLDOOR: [stage('entity', 'source'), stage('point', p(3000)), stage('point', 'Width'), stage('distance', '1000'), stage('point', 'Type'), stage('keyword', 'Double'), stage('point', 'Side'), stage('point', 'Hinge'), stage('point')],
  WALLWINDOW: [stage('entity', 'source'), stage('point', p(5000)), stage('point', 'Width'), stage('distance', '1100'), stage('point', 'Type'), stage('keyword', 'Sliding'), stage('point')],
  OPENINGMOVE: [stage('entity', 'symbol'), stage('point', p(3500)), stage('point')],
  OPENINGCOPY: [stage('entity', 'symbol'), stage('entity', 'source'), stage('point', p(5000)), stage('keyword')],
  OPENINGEDIT: [stage('entity', 'symbol'), stage('keyword', 'Width'), stage('distance', '1000'), stage('keyword', 'Type'), stage('keyword', 'Double'), stage('keyword', 'Side'), stage('keyword', 'Hinge'), stage('keyword')],
  OPENINGMIRROR: [stage('entity', 'symbol'), stage('keyword', 'Axis'), stage('keyword', 'Center'), stage('keyword', 'Both'), stage('keyword')],
  OPENINGDELETE: [stage('entity', 'symbol'), stage('keyword')],
  WALLTHICKNESS: [stage('entity', 'source'), stage('distance', '250'), stage('keyword')],
};
it.each(Object.entries(cancellationFlows))('%s cancels every pending input stage without entities, styles, groups or history writes', async (name, flow) => {
  const id = await wall(), symbol = await door(id, 2000);
  for (let cancelAt = 0; cancelAt < flow.length; cancelAt++) {
    const before = { entities: new Map(h.doc.data.entities), styles: new Map(h.doc.data.mlineStyles), groups: new Map(h.doc.data.groups), history: [...h.doc.history.entries()], version: h.doc.version, dirty: h.doc.dirty };
    const run = h.runner.execute(name);
    for (let i = 0; i <= cancelAt; i++) {
      const request = flow[i];
      await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe(request.kind));
      if (i === cancelAt) break;
      const value = request.input;
      if (request.kind === 'entity') h.runner.submitEntity(value === 'source' ? id : symbol, p(0));
      else if (typeof value === 'string') h.runner.submitText(value);
      else if (value) h.runner.submitPoint(value);
      else throw Error(`missing input at ${name} stage ${i}`);
    }
    h.runner.cancel(); await run;
    expect({ entities: h.doc.data.entities, styles: h.doc.data.mlineStyles, groups: h.doc.data.groups, history: h.doc.history.entries(), version: h.doc.version, dirty: h.doc.dirty }).toEqual(before);
    expect(h.editor.preview).toBeNull(); expect(h.editor.previewExcluded.size).toBe(0);
    expect(h.doc.history.inGroup).toBe(false);
  }
}, 30000);
