import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { Editor } from '../editor/editor';
import { registerAllCommands } from './index';
import { matchSettings } from './modify';

registerAllCommands();
const all = { color: true, layer: true, linetype: true, ltscale: true, lineweight: true, transparency: true, text: true, dimension: true, hatch: true, polyline: true };
beforeEach(() => Object.assign(matchSettings, all));
function fixture() {
  const doc = createDocument(), editor = new Editor(doc);
  doc.transact('fixture', tx => {
    tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: 'match-source', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, color: '#ff0000', lineweight: 0.5 });
    tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: 'match-target', type: 'line', start: { x: 20, y: 0 }, end: { x: 30, y: 0 }, color: '#0000ff', lineweight: 0.25 });
  });
  return { doc, editor };
}
describe('MATCHPROP settings', () => {
  it('copies only chosen properties and keeps a single undoable command', async () => {
    const { doc, editor } = fixture();
    const properties = Object.fromEntries(Object.keys(all).map(key => [key, key === 'color']));
    await editor.runner.script('MATCHPROP', [{ x: 0, y: 0 }, 'Settings', JSON.stringify({ version: 1, properties }), { x: 20, y: 0 }, '', '']);
    expect(doc.entity('match-target')?.color).toBe('#ff0000');
    expect(doc.entity('match-target')?.lineweight).toBe(0.25);
    doc.undo(); expect(doc.entity('match-target')?.color).toBe('#0000ff');
  });
  it('cancelling Settings preserves source and defaults and returns to destination selection', async () => {
    const { doc, editor } = fixture(), source = doc.entity('match-source');
    await editor.runner.script('MATCHPROP', [{ x: 0, y: 0 }, 'Settings', '', { x: 20, y: 0 }, '', '']);
    expect(doc.entity('match-target')?.color).toBe('#ff0000');
    expect(doc.entity('match-target')?.lineweight).toBe(0.5);
    expect(doc.entity('match-source')).toBe(source); expect(matchSettings).toEqual(all);
  });
  it('selecting no properties and malformed settings leave the drawing untouched', async () => {
    const { doc, editor } = fixture(), version = doc.version;
    const properties = Object.fromEntries(Object.keys(all).map(key => [key, false]));
    await editor.runner.script('MATCHPROP', [{ x: 0, y: 0 }, 'Settings', JSON.stringify({ version: 1, properties }), { x: 20, y: 0 }, '', '']);
    expect(doc.version).toBe(version);
    await editor.runner.script('MATCHPROP', [{ x: 0, y: 0 }, 'Settings', '{"version":1,"properties":{"color":"yes"}}', '']);
    expect(doc.version).toBe(version);
  });
});

it('does not echo the internal settings envelope or edit locked/foreign destinations', async () => {
  const { editor, doc } = fixture();
  doc.transact('target locks', tx => { tx.updateEntity('match-target', { locked: true }); tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: 'foreign-target', type: 'line', owner: 'foreign-owner', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }); });
  const version = doc.version, run = editor.command('MATCHPROP');
  editor.runner.submitEntity('match-source', { x: 0, y: 0 }); await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('selection'));
  editor.runner.submitText('Settings'); await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('string'));
  editor.runner.submitText(JSON.stringify({ version: 1, properties: all })); await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('selection'));
  editor.runner.submitSelection(['match-target', 'foreign-target']); await vi.waitFor(() => expect(editor.runner.pending?.req.kind).toBe('selection'));
  editor.runner.submitText(''); await run;
  expect(doc.version).toBe(version); expect(editor.runner.log.some(entry => entry.text.includes('"properties"'))).toBe(false);
});
