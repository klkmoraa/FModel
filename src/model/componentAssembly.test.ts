import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import { componentDefaults } from '../app/componentCatalog';
import { createComponentAssembly, updateComponentAssembly } from './componentAssembly';
const state = { kind: 'column' as const, parameters: componentDefaults('column', 'mm'), insertion: { x: 0, y: 0 }, rotation: 0 };
describe('component assembly prevalidation', () => {
  it.each(['owner', 'layer', 'linetype'] as const)('rejects missing %s before writing any native record', key => {
    const doc = createDocument();
    doc.transact('attempt invalid component', tx => {
      expect(() => createComponentAssembly(tx, state, { ...entityDefaults(doc), [key]: 'missing' }, doc.settings.currentTextStyle)).toThrow();
      expect(tx.list()).toHaveLength(0);
    });
    expect(doc.data.entities.size).toBe(0); expect(doc.data.groups.size).toBe(0);
  });
  it('retains an additional group record when all its component roles are removed', () => {
    const doc = createDocument(), stair = { ...state, kind: 'stairplan' as const, parameters: componentDefaults('stairplan', 'mm') };
    const assembly = doc.transact('stair', tx => createComponentAssembly(tx, stair, entityDefaults(doc), doc.settings.currentTextStyle));
    const removed = assembly.roles.get('tread-15')!;
    const group = { id: 'user-empty', name: 'Keep this group', description: 'Original description', selectable: false, members: [removed] };
    doc.transact('additional group', tx => tx.add('groups', group));
    doc.transact('shrink', tx => updateComponentAssembly(tx, assembly.principalId, { ...stair, parameters: { ...stair.parameters, steps: 8 } }));
    expect(doc.entity(removed)).toBeUndefined(); expect(doc.data.groups.get(group.id)).toEqual({ ...group, members: [] });
    doc.undo(); expect(doc.data.groups.get(group.id)).toEqual(group); expect(doc.entity(removed)).toBeDefined();
    doc.redo(); expect(doc.data.groups.get(group.id)).toEqual({ ...group, members: [] }); expect(doc.entity(removed)).toBeUndefined();
  });
});
