import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { Editor } from '../editor/editor';
import { registerAllCommands } from './index';
import { findCommand } from './registry';
registerAllCommands();
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());
function options(editor: Editor) { return { version: 1, documentId: editor.doc.id, documentVersion: editor.doc.version, units: 'm', linearFormat: 'decimal', linearPrecision: 2, angleFormat: 'radians', anglePrecision: 3 }; }
describe('UNITS form contract', () => {
  it('applies validated settings in one undo step without rescaling geometry', async () => {
    const editor = new Editor(createDocument({ units: 'mm' }));
    const line = editor.doc.transact('fixture', tx => tx.addEntity<LineEntity>({ ...entityDefaults(editor.doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }));
    const before = editor.doc.settings;
    await editor.runner.script('UNITS', ['', '', '', ''], [JSON.stringify(options(editor))]);
    expect(editor.doc.settings.units).toBe('m'); expect(editor.doc.settings.insUnits).toBe('m');
    expect(editor.doc.settings.anglePrecision).toBe(3); expect(editor.doc.entity(line.id)).toBe(line);
    editor.doc.undo(); expect(editor.doc.settings).toEqual(before); expect(editor.doc.entity(line.id)).toBe(line);
  });
  it('rejects stale document/version and invalid precision or enums without edits', async () => {
    const editor = new Editor(createDocument());
    for (const patch of [{ documentId: 'another-drawing' }, { documentVersion: -1 }, { linearPrecision: 9 }, { anglePrecision: 0.5 }, { units: 'invalid' }, { extra: true }]) {
      const version = editor.doc.version;
      await editor.runner.script('UNITS', ['', '', '', ''], [JSON.stringify({ ...options(editor), ...patch })]);
      expect(editor.doc.version).toBe(version);
      expect(editor.runner.log.some(entry => entry.kind === 'error')).toBe(true);
    }
  });
  it('keeps an explicit -UNITS CLI route and the headless UNITS sequence', async () => {
    expect(findCommand('-UNITS')?.name).toBe('-UNITS');
    const editor = new Editor(createDocument());
    await editor.runner.script('-UNITS', ['mm', 'decimal', '2', 'radians']);
    expect(editor.doc.settings.units).toBe('mm'); expect(editor.doc.settings.linearPrecision).toBe(2);
    await editor.runner.script('UNITS', ['cm', 'fractional', '3', 'degrees']);
    expect(editor.doc.settings.units).toBe('cm'); expect(editor.doc.settings.linearFormat).toBe('fractional');
  });
});
