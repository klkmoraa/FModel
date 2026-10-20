// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { HatchEntity, InsertEntity, LineEntity, LwPolylineEntity, MTextEntity, TextEntity, ViewportEntity } from '../document/types';
import { registerAllCommands } from '../commands';
import { editDoubleClickedEntity } from './doubleClick';
import { rowsForType } from '../ui/panels/propertyDefs';
import { applyPropertyRow } from '../ui/panels/propertyFields';
import { Editor } from './editor';
registerAllCommands();
const editors: Editor[] = [];
afterEach(async () => { for (const editor of editors.splice(0)) editor.runner.cancelAll(); await Promise.resolve(); vi.restoreAllMocks(); });
function fixture() { const editor = new Editor(createDocument()); editors.push(editor); editor.setViewportSize(800, 600); editor.view.scale = 20; return editor; }
async function annotation(type: 'text' | 'mtext') { const editor = fixture(); await editor.runner.script(type.toUpperCase(), type === 'text' ? [{ x: 0, y: 0 }, '2.5', '0', 'Original', ''] : [{ x: 0, y: 0 }, { x: 20, y: -10 }, 'Original']); const entity = [...editor.doc.data.entities.values()][0] as TextEntity | MTextEntity; return { editor, entity }; }
it.each(['text', 'mtext'] as const)('double-click edits exact %s through existing editor and preserves undo', async type => {
  const { editor, entity } = await annotation(type), screen = editor.ownerToScreen({ x: 1, y: 0 });
  expect(editor.doubleClick(screen)).toBe(true);
  await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('string'));
  editor.runner.submitText('Changed'); await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('entity')); editor.runner.submitText('');
  await vi.waitFor(() => expect(editor.runner.busy).toBe(false));
  expect(editor.doc.entity(entity.id)).toMatchObject(type === 'text' ? { text: 'Changed' } : { contents: 'Changed' });
  editor.doc.undo(); expect(editor.doc.entity(entity.id)).toEqual(entity);
});
it('opens useful hatch properties with exact preselection and leaves geometry untouched', () => {
  const editor = fixture(); const hatch = editor.doc.transact('fixture', tx => tx.addEntity<HatchEntity>({ ...entityDefaults(editor.doc), type: 'hatch', loops: [{ vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], closed: true }], pattern: { type: 'solid', name: 'SOLID', scale: 1, angle: 0, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal' }));
  const version = editor.doc.version, ui = vi.fn(); window.addEventListener('fmodel:ui', ui);
  expect(editor.doubleClick(editor.ownerToScreen({ x: 0, y: 5 }))).toBe(true);
  expect(editor.selection.list).toEqual([hatch.id]); expect(ui.mock.calls[0][0].detail.ui).toBe('panel:properties'); expect(editor.doc.version).toBe(version); window.removeEventListener('fmodel:ui', ui);
});
it('starts block editing from the exact reference and Escape cancels before opening a session', async () => {
  const editor = fixture(), doc = editor.doc;
  doc.transact('block fixture', tx => { tx.add('blocks', { id: 'dbl-block', name: 'DoubleClick', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1 }); tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', owner: 'dbl-block', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }); tx.addEntity<InsertEntity>({ ...entityDefaults(doc), type: 'insert', blockId: 'dbl-block', position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, attributes: [] }); });
  const version = doc.version; expect(editor.doubleClick(editor.ownerToScreen({ x: 5, y: 0 }))).toBe(true);
  await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('keyword')); editor.key('Escape'); await vi.waitFor(() => expect(editor.runner.busy).toBe(false));
  expect(editor.blockEdit).toBeNull(); expect(doc.version).toBe(version);
});
it('does not interrupt an active command or edit a locked object', async () => {
  const { editor, entity } = await annotation('text'); const done = editor.command('LINE'), pending = editor.runner.pending;
  expect(editor.doubleClick(editor.ownerToScreen({ x: 1, y: 0 }))).toBe(false); expect(editor.runner.pending).toBe(pending); editor.runner.cancelAll(); await done;
  editor.doc.transact('lock', tx => tx.updateEntity(entity.id, { locked: true }));
  expect(editor.doubleClick(editor.ownerToScreen({ x: 1, y: 0 }))).toBe(false);
});
it('retains layout viewport activation priority', () => {
  const editor = fixture(), layout = [...editor.doc.data.layouts.keys()][0];
  editor.doc.transact('viewport', tx => tx.addEntity<ViewportEntity>({ ...entityDefaults(editor.doc), id: 'double-vp', type: 'viewport', owner: layout, center: { x: 0, y: 0 }, width: 20, height: 20, viewCenter: { x: 0, y: 0 }, scale: 1, viewTwist: 0, displayLocked: false, on: true, frozenLayers: [], layerOverrides: {} }));
  editor.setSpace(layout); expect(editor.doubleClick(editor.view.toScreen({ x: 0, y: 0 }))).toBe(true); expect(editor.activeViewportId).toBe('double-vp'); expect(editor.runner.busy).toBe(false);
});

it('hatch inspector exposes and applies pattern scale with undo', () => {
  const editor = fixture(), doc = editor.doc;
  const hatch = doc.transact('fixture', tx => tx.addEntity<HatchEntity>({ ...entityDefaults(doc), type: 'hatch', loops: [{ vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true }], pattern: { type: 'predefined', name: 'ANSI31', scale: 1, angle: 0, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal' }));
  expect(rowsForType('hatch').map(row => row.key)).toEqual(expect.arrayContaining(['ptype', 'pname', 'pscale', 'pangle', 'background']));
  applyPropertyRow(editor, [hatch], rowsForType('hatch').find(row => row.key === 'pscale')!, 2);
  expect((doc.entity(hatch.id) as HatchEntity).pattern.scale).toBe(2); doc.undo(); expect(doc.entity(hatch.id)).toEqual(hatch);
});
it('dispatches a native component to its lifecycle editor and rejects an incomplete group', async () => {
  const editor = fixture(); await editor.runner.script('STAIRPLAN', [{ x: 0, y: 0 }]);
  const group = [...editor.doc.data.groups.values()][0], member = editor.doc.entity(group.members[0])!;
  const version = editor.doc.version;
  expect(editDoubleClickedEntity(editor, member, { x: 0, y: 0 })).toBe(true);
  await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('keyword')); expect(editor.runner.active?.def.name).toBe('COMPONENTEDIT');
  editor.key('Escape'); await vi.waitFor(() => expect(editor.runner.busy).toBe(false)); expect(editor.doc.version).toBe(version);
  editor.doc.transact('remove member', tx => tx.removeEntity(group.members[1]));
  expect(editDoubleClickedEntity(editor, member, { x: 0, y: 0 })).toBe(false); expect(editor.runner.busy).toBe(false);
});
it('opens native wall thickness rather than generic properties', async () => {
  const editor = fixture(); await editor.runner.script('WALL', [{ x: 0, y: 0 }, { x: 10000, y: 0 }, '']);
  const wall = [...editor.doc.data.entities.values()].find(e => e.type === 'mline')!;
  expect(editDoubleClickedEntity(editor, wall, { x: 1000, y: 0 })).toBe(true);
  await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('distance')); expect(editor.runner.active?.def.name).toBe('WALLTHICKNESS');
});
it('rejects xrefs, hidden layers and foreign owners without invoking an editor', async () => {
  const { editor, entity } = await annotation('text'); const version = editor.doc.version;
  expect(editDoubleClickedEntity(editor, { ...entity, owner: 'foreign' }, { x: 0, y: 0 })).toBe(false);
  editor.doc.transact('hidden', tx => tx.update('layers', entity.layer, { on: false }));
  expect(editDoubleClickedEntity(editor, entity, { x: 0, y: 0 })).toBe(false);
  expect(editDoubleClickedEntity(editor, { ...entity, type: 'insert', blockId: 'absent' } as unknown as InsertEntity, { x: 0, y: 0 })).toBe(false);
  expect(editor.runner.busy).toBe(false); expect(editor.doc.version).toBe(version + 1);
});

it('edits a linked room label through shipped ROOMDATA with exact source and one undo', async () => {
  const editor = fixture(), doc = editor.doc;
  const source = doc.transact('room fixture', tx => tx.addEntity<LwPolylineEntity>({ ...entityDefaults(doc), type: 'lwpolyline', vertices: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], closed: true }));
  editor.selection.set([source.id]); await editor.runner.script('ROOMDATA', ['Original room', '', '', '2700', '']);
  const label = [...doc.data.entities.values()].find((e): e is TextEntity => e.type === 'text' && !!e.roomLabel)!;
  const before = doc.entity(source.id), labelBefore = doc.entity(label.id);
  expect(editDoubleClickedEntity(editor, label, label.position)).toBe(true);
  await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('string'));
  expect(editor.runner.active?.def.name).toBe('ROOMDATA');
  for (const value of ['Changed room', '', '', '3000', '']) {
    await vi.waitFor(() => expect(editor.runner.pending).not.toBeNull()); editor.runner.submitText(value);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  }
  await vi.waitFor(() => expect(editor.runner.busy).toBe(false));
  expect(doc.entity(source.id)?.room?.name).toBe('Changed room'); expect((doc.entity(label.id) as TextEntity).text).toContain('Changed room');
  doc.undo(); expect(doc.entity(source.id)).toEqual(before); expect(doc.entity(label.id)).toEqual(labelBefore);
});
it('opens the exact native wall room through a visible network member and respects explicit hiding', async () => {
  const editor = fixture(), doc = editor.doc;
  await editor.runner.script('WALLRECT', [{ x: 0, y: 0 }, { x: 4000, y: 3000 }]);
  const source = [...doc.data.entities.values()].find(e => e.type === 'mline')!;
  editor.selection.set([source.id]); await editor.runner.script('ROOMDATA', ['Native room', '', '', '2700', '']);
  await editor.runner.script('WALLAUTO', ['Solid', '']);
  const label = [...doc.data.entities.values()].find((e): e is TextEntity => e.type === 'text' && e.roomLabel?.sourceId === source.id)!;
  expect(doc.entity(source.id)?.visible).toBe(false); expect(editor.isSelectable(source.id)).toBe(false);
  const version = doc.version;
  expect(editDoubleClickedEntity(editor, label, label.position)).toBe(true);
  await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('string'));
  expect(editor.runner.active?.def.name).toBe('ROOMDATA');
  editor.runner.cancelAll(); await vi.waitFor(() => expect(editor.runner.busy).toBe(false)); expect(doc.version).toBe(version);
  editor.hidden.add(source.id); expect(editDoubleClickedEntity(editor, label, label.position)).toBe(false); editor.hidden.clear();
  editor.isolated = new Set([label.id]); expect(editDoubleClickedEntity(editor, label, label.position)).toBe(false); editor.isolated = null;
  const layout = [...doc.data.layouts.keys()][0];
  doc.transact('viewport visibility', tx => {
    tx.add('layers', { ...doc.data.layers.get(source.layer)!, id: 'room-label-visible-layer', name: 'Room label visible' });
    tx.updateEntity(label.id, { layer: 'room-label-visible-layer' });
    tx.addEntity<ViewportEntity>({ ...entityDefaults(doc), id: 'room-check-viewport', type: 'viewport', owner: layout, center: { x: 0, y: 0 }, width: 100, height: 100, viewCenter: { x: 0, y: 0 }, scale: 1, viewTwist: 0, displayLocked: false, on: true, frozenLayers: [source.layer], layerOverrides: {} });
  });
  editor.setSpace(layout); editor.activateViewport('room-check-viewport');
  const visibleLabel = doc.entity(label.id) as TextEntity;
  expect(editor.isSelectable(visibleLabel.id)).toBe(true);
  const frozenVersion = doc.version;
  expect(editDoubleClickedEntity(editor, visibleLabel, visibleLabel.position)).toBe(false); expect(editor.runner.busy).toBe(false); expect(doc.version).toBe(frozenVersion);
});
