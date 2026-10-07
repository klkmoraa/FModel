import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImportCenterView } from '../ui/welcome/ImportCenterView';
import { HelpDialog } from '../ui/dialogs/HelpDialog';
import { LibraryCatalogView } from '../ui/welcome/LibraryCatalogView';
import { LibraryView } from '../ui/panels/LibraryView';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import { DEFAULT_CATEGORIES } from '../blocks/libraryCategories';
import { loadLibrary, resetLibraryForTests } from '../blocks/libraryStore';
import { taskManager } from '../app/tasks';
import { FEATURES } from '../app/features';
import { HEAVY_OPS } from '../workers/heavyOps';
import { FILE_COMMANDS, openBytes } from './file';
import { LIBRARY_COMMANDS, buildImportSession } from './library';
import type { CommandApi } from './types';

// Only the compile-time capability is replaced; commands, tasks and imports are real.
vi.mock('../lib/capabilities', () => ({ DWG_ENABLED: false }));

beforeEach(() => { taskManager._clear(); resetLibraryForTests(); });
afterEach(() => vi.unstubAllGlobals());

function state(editor: Editor) {
  return { data: editor.doc.data, id: editor.doc.id, version: editor.doc.version, dirty: editor.doc.dirty,
    history: editor.doc.history.entries(), fileName: editor.fileName };
}

describe('public native/DXF entry points', () => {
  it('rejects DWG OPEN before reader work and preserves the drawing and history', async () => {
    const editor = new Editor(createDocument({ title: 'Original' }));
    editor.fileName = 'original';
    editor.doc.dirty = true;
    const original = state(editor);
    const api = { editor, signal: new AbortController().signal, info: vi.fn() } as unknown as CommandApi;
    await expect(openBytes(api, 'input.DWG', new TextEncoder().encode('AC1032'))).rejects.toThrow(/DWG.*DXF.*DWG.*DXF/);
    expect(state(editor)).toEqual(original);
    expect(taskManager.getTasks()).toEqual([]);
    expect(api.info).not.toHaveBeenCalled();
  });

  it('rejects DWG LIBRARYIMPORT before heavy work and preserves stored blocks', async () => {
    const original = await loadLibrary();
    await expect(buildImportSession({ name: 'input.dwg', bytes: new TextEncoder().encode('AC1032') }, DEFAULT_CATEGORIES)).rejects.toThrow(/DWG.*DXF.*DWG.*DXF/);
    expect(await loadLibrary()).toEqual(original);
    expect(taskManager.getTasks()).toEqual([]);
  });

  it('rejects direct worker and fallback DWG operations with the same actionable error', async () => {
    for (const op of ['parseDwg', 'readDwg'] as const) {
      await expect(HEAVY_OPS[op]({ bytes: new Uint8Array([1]) })).rejects.toThrow(/DWG.*DXF.*DWG.*DXF/);
    }
  });

  it('rendered public welcome, library and help match accepted formats in both languages', () => {
    const editor = new Editor(createDocument());
    for (const lang of ['es', 'en'] as const) {
      editor.setPrefs({ lang });
      const welcome = renderToStaticMarkup(createElement(ImportCenterView, { editor, onOpenWorkspace: () => {} }));
      expect(welcome).toContain('accept=".fmodel,.json,.dxf,.fmodellib"');
      expect(welcome).not.toContain('DWG');
      const help = renderToStaticMarkup(createElement(HelpDialog, { editor, onClose: () => {}, initialTab: 'about' }));
      expect(help).toContain(lang === 'es' ? 'conviértelo a DXF' : 'convert it to DXF');
      expect(help).not.toContain(lang === 'es' ? 'lectura experimental de DWG' : 'experimental DWG reading');
      const library = renderToStaticMarkup(createElement(LibraryCatalogView, { editor, onOpenWorkspace: () => {} }));
      expect(library).not.toContain('DWG');
      const panel = renderToStaticMarkup(createElement(LibraryView, { editor, query: '' }));
      expect(panel).not.toContain('DWG');
    }
  });

  it('public command pickers and bilingual descriptions accept native/DXF formats', async () => {
    const picker = vi.fn(async (_options: unknown) => { throw new DOMException('Cancelled', 'AbortError'); });
    vi.stubGlobal('window', { showOpenFilePicker: picker });
    const editor = new Editor(createDocument());
    const api = { editor, signal: new AbortController().signal } as unknown as CommandApi;
    const open = FILE_COMMANDS.find(c => c.name === 'OPEN')!;
    const library = LIBRARY_COMMANDS.find(c => c.name === 'LIBRARYIMPORT')!;
    await open.run(api);
    await library.run(api);
    expect(picker.mock.calls.map(call => call[0])).toEqual([
      { types: [{ description: 'FModel / DXF', accept: { 'application/x-fmodel': ['.fmodel'], 'application/json': ['.json'], 'application/dxf': ['.dxf'] } }], multiple: false },
      { types: [{ description: 'DXF / FModel library', accept: { 'application/octet-stream': ['.dxf', '.fmodellib'] } }], multiple: false },
    ]);
    for (const command of [open, library]) for (const lang of ['es', 'en'] as const) {
      expect(command.description?.[lang]).toContain('DXF');
      expect(command.description?.[lang]).not.toContain('DWG');
    }
    expect(FEATURES.find(f => /DWG reading/.test(f.name.en))?.status).toBe('not-committed');
    expect(FEATURES.find(f => /AutoCAD dynamic blocks/.test(f.name.en))?.name.en).not.toContain('DWG');
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
    expect(JSON.stringify(manifest.file_handlers)).not.toMatch(/dwg|application\/acad/i);
  });
});
