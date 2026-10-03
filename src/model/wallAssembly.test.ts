import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { Entity, LineEntity, MLineEntity } from '../document/types';
import { wallStyle } from './wallStyle';
import { createWallAssembly, readWallAssembly, readWallOpening, readWallSource, updateWallAssembly } from './wallAssembly';
import type { WallOpeningSpec } from '../geometry/wallOpenings';
const a: WallOpeningSpec = { id: 'a', segment: 0, offset: 2000, width: 900, type: 'single', side: 1, hingeEnd: false };
const b: WallOpeningSpec = { ...a, id: 'b', offset: 4500 };
function fixture(closed = false) {
  const doc = createDocument();
  doc.transact('wall', tx => {
    tx.add('mlineStyles', wallStyle('wall-style', 'Walls'));
    tx.addEntity<MLineEntity>({ ...entityDefaults(doc), id: 'wall', type: 'mline', vertices: closed ? [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }] : [{ x: 0, y: 0 }, { x: 10000, y: 0 }], closed, style: 'wall-style', scale: 150, justification: 'zero', meta: { userNote: 'keep' } });
  });
  const original = structuredClone(doc.entity('wall')!);
  const source = readWallSource(doc, 'wall').source;
  const assembly = doc.transact('cut', tx => createWallAssembly(tx, 'wall', source, [a, b]))!;
  return { doc, original, assembly };
}
describe('validated native wall assemblies', () => {
  it('moves one opening and preserves the other roles, IDs, order and individual properties', () => {
    const { doc, assembly } = fixture();
    const openingB = assembly.members.map(id => doc.entity(id)!).filter(e => (e.meta?.fmodelWallMember as { openingId?: string } | undefined)?.openingId === 'b');
    doc.transact('properties', tx => openingB.forEach(e => tx.updateEntity(e.id, { color: '#123456', meta: { ...e.meta, note: 'individual' } })));
    const before = openingB.map(e => structuredClone(doc.entity(e.id)!));
    doc.transact('move', tx => updateWallAssembly(tx, 'wall', assembly.source, [{ ...a, offset: 3000 }, b]));
    expect(before.map(e => doc.entity(e.id))).toEqual(before);
    expect((doc.entity('wall') as MLineEntity).vertices).toEqual([{ x: 0, y: 0 }, { x: 2550, y: 0 }]);
    expect(readWallOpening(doc, before[0].id).opening).toEqual(b);
    expect(() => readWallOpening(doc, 'wall')).toThrow();
    doc.undo(); expect((doc.entity('wall') as MLineEntity).vertices[1].x).toBe(1550);
    doc.redo(); expect((doc.entity('wall') as MLineEntity).vertices[1].x).toBe(2550);
  });
  it('restores the original closed ID/order and current properties/thickness after last deletion', () => {
    const { doc, assembly, original } = fixture(true);
    doc.transact('thickness', tx => updateWallAssembly(tx, 'wall', { ...assembly.source, scale: 200 }, [a, b]));
    doc.transact('property', tx => tx.updateEntity('wall', { color: '#654321' }));
    const thick = readWallAssembly(doc, 'wall');
    expect(thick.source.scale).toBe(200);
    doc.transact('delete all', tx => expect(updateWallAssembly(tx, 'wall', thick.source, [])).toBeNull());
    expect(doc.entity('wall')).toEqual({ ...original, scale: 200, color: '#654321' });
    expect(doc.data.groups.size).toBe(0); expect(doc.data.entities.size).toBe(1);
    doc.undo(); expect(readWallAssembly(doc, 'wall').openings).toHaveLength(2);
    doc.redo(); expect(doc.entity('wall')).toEqual({ ...original, scale: 200, color: '#654321' });
  });
  it('filters deleted IDs from mixed and empty secondary groups without changing their records or survivor order', () => {
    const { doc, assembly } = fixture();
    const removed = assembly.members.filter(id => (doc.entity(id)?.meta?.fmodelWallMember as { openingId?: string } | undefined)?.openingId === 'a');
    const survivor = assembly.members.find(id => (doc.entity(id)?.meta?.fmodelWallMember as { openingId?: string } | undefined)?.openingId === 'b')!;
    const mixed = { id: 'mixed', name: 'User group', description: 'Keep', selectable: false, members: [survivor, removed[0], 'wall', removed[1]] };
    const empty = { ...mixed, id: 'empty', members: [...removed] };
    doc.transact('groups', tx => { tx.add('groups', mixed); tx.add('groups', empty); });
    doc.transact('remove a', tx => updateWallAssembly(tx, 'wall', assembly.source, [b]));
    expect(doc.data.groups.get('mixed')).toEqual({ ...mixed, members: [survivor, 'wall'] });
    expect(doc.data.groups.get('empty')).toEqual({ ...empty, members: [] });
    doc.undo(); expect(doc.data.groups.get('mixed')).toEqual(mixed); expect(doc.data.groups.get('empty')).toEqual(empty);
    doc.redo(); expect(doc.data.groups.get('mixed')?.members).toEqual([survivor, 'wall']); expect(doc.data.groups.get('empty')?.members).toEqual([]);
  });
  it.each(['missing-member', 'foreign-member', 'duplicate-member', 'reordered', 'unselectable', 'wrong-group', 'role', 'opening-id', 'source', 'version', 'count', 'geometry', 'owner', 'style', 'clone', 'extra-assembly'] as const)('rejects %s corruption before writes', corruption => {
    const { doc, assembly } = fixture();
    let selected = 'wall';
    doc.transact('corrupt', tx => {
      const group = doc.data.groups.get(assembly.groupId)!, symbol = doc.entity(assembly.members.at(-1)!)!;
      const anchor = doc.entity('wall')!, raw = structuredClone(anchor.meta!.fmodelWallAssembly) as Record<string, unknown>;
      if (corruption === 'missing-member') tx.removeEntity(symbol.id);
      if (corruption === 'foreign-member') tx.update('groups', group.id, { members: [...group.members, 'absent'] });
      if (corruption === 'duplicate-member') tx.update('groups', group.id, { members: [...group.members.slice(0, -1), group.members[0]] });
      if (corruption === 'reordered') tx.update('groups', group.id, { members: [...group.members].reverse() });
      if (corruption === 'unselectable') tx.update('groups', group.id, { selectable: false });
      if (['wrong-group', 'role', 'opening-id'].includes(corruption)) tx.updateEntity(symbol.id, { meta: { ...symbol.meta, fmodelWallMember: { ...(symbol.meta!.fmodelWallMember as object), [corruption === 'wrong-group' ? 'groupId' : corruption === 'role' ? 'role' : 'openingId']: 'bad' } } });
      if (corruption === 'source') { (raw.source as { vertices: unknown }).vertices = [{ x: 0, y: 0 }, { x: NaN, y: 0 }]; }
      if (corruption === 'version') raw.version = 2;
      if (corruption === 'count') raw.openings = Array(201).fill(a);
      if (['source', 'version', 'count'].includes(corruption)) tx.updateEntity('wall', { meta: { ...anchor.meta, fmodelWallAssembly: raw } });
      if (corruption === 'geometry') tx.updateEntity('wall', { vertices: [{ x: 0, y: 0 }, { x: 1500, y: 0 }] } as Partial<MLineEntity>);
      if (corruption === 'owner') tx.updateEntity(symbol.id, { owner: 'missing' });
      if (corruption === 'style') tx.update('mlineStyles', 'wall-style', { fill: '#123456' });
      if (corruption === 'clone') { tx.addEntity({ ...symbol, id: 'clone' } as Entity); selected = 'clone'; }
      if (corruption === 'extra-assembly') tx.updateEntity(symbol.id, { meta: { ...symbol.meta, fmodelWallAssembly: raw } });
    });
    const before = structuredClone(doc.data);
    doc.transact('rejected', tx => {
      expect(() => updateWallAssembly(tx, selected, assembly.source, [a])).toThrow();
      expect(tx.list()).toHaveLength(0);
    });
    expect(doc.data).toEqual(before);
  });
  it('rejects impossible new geometry atomically and never guesses associations for legacy symbols', () => {
    const { doc, assembly } = fixture();
    doc.transact('invalid', tx => {
      expect(() => updateWallAssembly(tx, 'wall', assembly.source, [a, { ...b, offset: 2100 }])).toThrow();
      expect(tx.list()).toHaveLength(0);
    });
    doc.transact('legacy', tx => tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: 'legacy', type: 'line', start: { x: 0, y: 0 }, end: { x: 5, y: 5 } }));
    expect(() => readWallAssembly(doc, 'legacy')).toThrow(); expect(() => readWallOpening(doc, 'legacy')).toThrow();
  });
});
