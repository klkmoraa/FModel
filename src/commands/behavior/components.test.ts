import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import type { DrawingUnits } from '../../document/types';
import { COMPONENT_CATALOG, componentDefaults, parseComponentArguments } from '../../app/componentCatalog';
import { COMPONENT_COMMANDS } from '../components';
import { readComponentAssembly } from '../../model/componentAssembly';
import { allCommands, findCommand } from '../registry';
import { CommandHarness } from './harness';
const point = { x: 10, y: 20 };
const kinds = ['column', 'axisgrid', 'stairplan', 'stairsection', 'escalator', 'liftplan', 'doorelevation', 'doorsection', 'windowelevation', 'windowsection', 'baywindowsection', 'curtainwall', 'glasspartition', 'banister'] as const;
describe('construction command behavior', () => {
  let h: CommandHarness;
  beforeEach(() => { h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  it.each(kinds)('%s constructs native selectable assembly with one undo and redo', async kind => {
    const result = await h.run(kind.toUpperCase(), [point]); expect(result.ok).toBe(true); expect(h.doc.data.groups.size).toBe(1);
    const group = [...h.doc.data.groups.values()][0]; expect(group.selectable).toBe(true); expect(group.members.length).toBe(h.doc.data.entities.size);
    const state = readComponentAssembly(h.doc, group.members.at(-1)!); expect(state.kind).toBe(kind); expect(state.insertion).toEqual(point);
    h.undo(); expect(h.doc.data.entities.size).toBe(0); expect(h.doc.data.groups.size).toBe(0); h.redo(); expect(h.doc.data.groups.get(group.id)).toEqual(group);
  });
  it('all constructors and edit have bilingual help and collision-free Spanish aliases', () => {
    expect(COMPONENT_COMMANDS).toHaveLength(15); expect(COMPONENT_CATALOG).toHaveLength(14);
    for (const command of COMPONENT_COMMANDS) { expect(findCommand(command.name)?.run).toBe(command.run); expect(command.help?.es).toBeTruthy(); expect(command.help?.en).toBeTruthy(); for (const alias of command.aliases) { expect(findCommand(alias)?.run).toBe(command.run); expect(allCommands().filter(c => [c.name, ...c.aliases].includes(alias))).toHaveLength(1); } }
  });
  it.each([['mm', 400], ['m', 0.4], ['unitless', 400]] as const)('defaults, dimensions and physical arguments in %s', async (units, expected) => {
    h = new CommandHarness(new Editor(createDocument({ units }))); await h.run('COLUMN', [point]); const q = [...h.doc.data.entities.values()][0]; expect(q.type).toBe('lwpolyline'); if (q.type === 'lwpolyline') expect(q.vertices[1].x - q.vertices[0].x).toBeCloseTo(expected);
    expect(componentDefaults('column', units).width).toBe(expected);
    const parsed = parseComponentArguments('column', units, ['width=2m', 'depth=7', 'rotation=90']); expect(parsed.parameters.width).toBe(units === 'm' ? 2 : 2000); expect(parsed.parameters.depth).toBe(7); expect(parsed.rotation).toBe(Math.PI / 2);
    expect(parseComponentArguments('column', units, ['width=4in']).parameters.width).toBeCloseTo(units === 'm' ? 0.1016 : 101.6);
  });
  it.each(['unknown=1', 'width=NaN', 'width=Infinity', 'width=0', 'width=1x', 'width=1+2', 'rotation=90mm', 'width=1 width=2'])('bad arguments %s leave entities/groups/styles/history intact', async arg => {
    const before = h.snapshot(); const result = await h.run('COLUMN', [], arg.split(' ')); expect(result.ok).toBe(false); expect(h.snapshot()).toEqual(before); expect(h.doc.data.groups.size).toBe(0); expect(h.doc.data.textStyles.size).toBe(3);
  });
  it.each(kinds)('%s initial Enter and Escape leave no mutation or style', async kind => {
    const before = h.snapshot(); await h.run(kind.toUpperCase(), ['']); expect(h.snapshot()).toEqual(before);
    const pending = h.run(kind.toUpperCase(), []); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('point')); expect(h.doc.data.entities.size).toBe(0); h.runner.cancel(); await pending; expect(h.editor.preview).toBeNull(); expect(h.snapshot()).toEqual(before);
  });
  it('parameters and rotation before placement preview and commit the same transformed shape', async () => {
    await h.run('COLUMN', ['Parameters', 'width', '800', 'Rotation', '90', point]); const q = [...h.doc.data.entities.values()][0]; expect(q.type).toBe('lwpolyline'); if (q.type === 'lwpolyline') { expect(q.vertices[0]).toEqual(point); expect(q.vertices[1].x).toBeCloseTo(10); expect(q.vertices[1].y).toBeCloseTo(820); }
  });
  it('editing pending parameters is immutable then preserves role IDs, orders and per-member properties', async () => {
    await h.run('STAIRPLAN', [point]); const g = [...h.doc.data.groups.values()][0], selected = g.members[3];
    h.doc.transact('properties', tx => tx.updateEntity(selected, { color: '#123456', lineweight: 35, transparency: 20, meta: { ...h.doc.entity(selected)!.meta, note: 'keep' } }));
    const before = new Map(h.doc.data.entities); h.select(selected);
    const pending = h.run('COMPONENTEDIT', ['steps', '18']); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); expect(h.doc.data.entities).toEqual(before); h.runner.submitText(''); await pending;
    for (const [id, e] of before) expect(h.doc.entity(id)).toMatchObject({ id, order: e.order, color: e.color, lineweight: e.lineweight, transparency: e.transparency });
    expect(h.doc.entity(selected)?.meta?.note).toBe('keep'); expect(readComponentAssembly(h.doc, selected).parameters.steps).toBe(18);
    h.undo(); expect(h.doc.data.entities).toEqual(before); h.redo(); h.select(selected); await h.run('COMPONENTEDIT', ['steps', '8', '']); expect(readComponentAssembly(h.doc, selected).members).toHaveLength(9); expect(h.doc.entity(selected)?.id).toBe(selected);
  });
  it('editing rejects a copied member, missing group/member, invalid parameters and metadata ownership', async () => {
    await h.run('WINDOWELEVATION', [point]); const g = [...h.doc.data.groups.values()][0], anchor = h.doc.entity(g.members[0])!;
    const copy = h.doc.transact('clone', tx => tx.addEntity({ ...anchor, id: undefined, order: undefined } as never));
    h.select(copy.id); const before = new Map(h.doc.data.entities); expect((await h.run('COMPONENTEDIT', [])).ok).toBe(false); expect(h.doc.data.entities).toEqual(before);
    h.doc.transact('missing', tx => tx.removeEntity(g.members[1])); h.select(anchor.id); const incomplete = new Map(h.doc.data.entities); expect((await h.run('COMPONENTEDIT', [])).ok).toBe(false); expect(h.doc.data.entities).toEqual(incomplete); h.undo();
    h.doc.transact('corrupt', tx => tx.updateEntity(anchor.id, { meta: { ...anchor.meta, fmodelComponent: { ...(anchor.meta!.fmodelComponent as object), parameters: { width: Infinity } } } })); h.select(anchor.id); expect((await h.run('COMPONENTEDIT', [])).ok).toBe(false); h.undo();
    h.doc.transact('foreign owner', tx => tx.updateEntity(g.members[1], { owner: 'foreign' })); h.select(anchor.id); expect((await h.run('COMPONENTEDIT', [])).ok).toBe(false); h.undo();
    h.doc.transact('missing group', tx => tx.remove('groups', g.id)); h.select(anchor.id); expect((await h.run('COMPONENTEDIT', [])).ok).toBe(false);
  });
  it('cancelling edit after changing parameters preserves exact native data', async () => { await h.run('COLUMN', [point]); const before = h.snapshot(), member = [...h.doc.data.entities.keys()][0]; h.select(member); const pending = h.run('COMPONENTEDIT', ['width', '800']); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); h.runner.cancel(); await pending; expect(h.snapshot()).toEqual(before); });
  it.each([['stairplan', ['steps=1.5']], ['windowelevation', ['opening=yes']], ['escalator', ['angle=9']], ['stairplan', ['turn=271']]] as const)('strict typed arguments for %s', (kind, args) => expect(() => parseComponentArguments(kind, 'mm' as DrawingUnits, [...args])).toThrow());
  it('ordinary entities cannot masquerade as components', () => { expect(() => readComponentAssembly(h.doc, 'missing')).toThrow(); });
  it('edit preview shows changed geometry while committed IDs remain untouched and cancellation clears it', async () => {
    await h.run('COLUMN', [point]); const member = [...h.doc.data.entities.keys()][0], before = h.snapshot(); h.select(member);
    const pending = h.run('COMPONENTEDIT', ['width', '800']);
    await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
    expect(h.doc.data.entities).toEqual(before.entities);
    const preview = h.editor.preview?.entities?.[0]; expect(preview?.type).toBe('lwpolyline');
    if (preview?.type === 'lwpolyline') expect(preview.vertices[1]).toEqual({ x: 810, y: 20 });
    h.runner.cancel(); await pending; expect(h.editor.preview).toBeNull(); expect(h.snapshot()).toEqual(before);
  });
  it('rejects a component member whose imported polyline has a foreign bulge', async () => {
    await h.run('COLUMN', [point]); const entity = [...h.doc.data.entities.values()][0];
    if (entity.type !== 'lwpolyline') throw Error('fixture');
    h.doc.transact('bulged member', tx => tx.updateEntity(entity.id, { vertices: entity.vertices.map((v, i) => i ? v : { ...v, bulge: 1 }) }));
    const before = h.snapshot(); h.select(entity.id); expect((await h.run('COMPONENTEDIT', [''])).ok).toBe(false); expect(h.snapshot()).toEqual(before);
  });

  it.each(['version', 'principal', 'role', 'group', 'selectable', 'geometry'])('rejects corrupt %s before any edit mutation', async problem => {
    await h.run('STAIRPLAN', [point], ['variant=curved']); const group = [...h.doc.data.groups.values()][0], entity = h.doc.entity(group.members[1])!;
    h.doc.transact('corrupt component', tx => {
      if (problem === 'selectable') tx.update('groups', group.id, { selectable: false });
      else if (problem === 'geometry' && entity.type === 'arc') tx.updateEntity(entity.id, { radius: 99 });
      else tx.updateEntity(entity.id, { meta: { ...entity.meta, fmodelComponentMember: { ...(entity.meta!.fmodelComponentMember as object), [problem]: problem === 'version' ? 2 : 'wrong' } } });
    });
    const before = h.snapshot(); h.select(entity.id); expect((await h.run('COMPONENTEDIT', [''])).ok).toBe(false); expect(h.snapshot()).toEqual(before);
  });
  it('one edit changes rotation, then undo restores geometry and redo preserves IDs', async () => {
    await h.run('COLUMN', [point]); const before = new Map(h.doc.data.entities), id = [...before.keys()][0]; h.select(id);
    expect((await h.run('COMPONENTEDIT', ['Rotation', '90', 'width', '800', ''])).ok).toBe(true);
    const e = h.doc.entity(id)!; expect(e.type).toBe('lwpolyline'); if (e.type === 'lwpolyline') { expect(e.vertices[1].x).toBeCloseTo(10); expect(e.vertices[1].y).toBeCloseTo(820); }
    expect(readComponentAssembly(h.doc, id).rotation).toBe(Math.PI / 2); h.undo(); expect(h.doc.data.entities).toEqual(before); h.redo(); expect(h.doc.entity(id)).toEqual(e);
  });
  it('changing document units creates fresh physical defaults and preserves current native properties', async () => {
    h.doc.transact('settings', tx => tx.setSettings({ units: 'm', currentColor: '#123456', currentLineweight: 35, currentTransparency: 20 }));
    await h.run('AXISGRID', [point]);
    const assembly = readComponentAssembly(h.doc, [...h.doc.data.entities.keys()][0]); expect(assembly.parameters.spacingX).toBe(4);
    for (const e of h.doc.data.entities.values()) { expect(e).toMatchObject({ color: '#123456', lineweight: 35, transparency: 20 }); if (e.type === 'text') expect(e.style).toBe(h.doc.settings.currentTextStyle); }
  });

  it('shrinking a component removes deleted roles from every additional group in one undo step', async () => {
    await h.run('STAIRPLAN', [point]);
    const assembly = readComponentAssembly(h.doc, [...h.doc.data.entities.keys()][0]);
    const retained = assembly.roles.get('tread-0')!, removed = assembly.roles.get('tread-15')!;
    await h.run('LINE', [{ x: -100, y: 0 }, { x: -100, y: 100 }, '']);
    const unrelated = [...h.doc.data.entities.values()].find(e => !assembly.members.includes(e.id))!;
    h.doc.transact('user groups', tx => {
      tx.add('groups', { id: 'user-mixed', name: 'User assembly', description: 'Retain this description', selectable: true, members: [removed, unrelated.id, retained] });
      tx.add('groups', { id: 'user-second', name: 'Second group', description: 'Also retained', selectable: false, members: [retained, removed, unrelated.id] });
      tx.add('groups', { id: 'user-unaffected', name: 'Unchanged', description: '', selectable: true, members: [unrelated.id] });
    });
    const beforeEntities = new Map(h.doc.data.entities), beforeGroups = new Map(h.doc.data.groups);
    h.select(assembly.principalId); expect((await h.run('COMPONENTEDIT', ['steps', '8', ''])).ok).toBe(true);
    expect(h.doc.entity(removed)).toBeUndefined(); expect(h.doc.entity(unrelated.id)).toEqual(unrelated);
    expect(h.doc.entity(retained)).toEqual(beforeEntities.get(retained));
    expect(h.doc.data.groups.get('user-mixed')).toEqual({ ...beforeGroups.get('user-mixed'), members: [unrelated.id, retained] });
    expect(h.doc.data.groups.get('user-second')).toEqual({ ...beforeGroups.get('user-second'), members: [retained, unrelated.id] });
    expect(h.doc.data.groups.get('user-unaffected')).toBe(beforeGroups.get('user-unaffected'));
    for (const group of h.doc.data.groups.values()) expect(group.members.every(id => h.doc.data.entities.has(id))).toBe(true);
    const afterEntities = new Map(h.doc.data.entities), afterGroups = new Map(h.doc.data.groups);
    h.undo(); expect(h.doc.data.entities).toEqual(beforeEntities); expect(h.doc.data.groups).toEqual(beforeGroups);
    h.redo(); expect(h.doc.data.entities).toEqual(afterEntities); expect(h.doc.data.groups).toEqual(afterGroups);
  });

});
