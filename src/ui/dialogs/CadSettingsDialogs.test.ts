// @vitest-environment jsdom
import { act, createElement as h, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { registerAllCommands } from '../../commands';
import { matchSettings } from '../../commands/matchPropertiesSettings';
import { MatchSettingsDialog } from './MatchSettingsDialog';
import { UnitsDialog } from './UnitsDialog';
registerAllCommands();
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of cleanups.splice(0)) await clean(); });
function fixture() { const editor = new Editor(createDocument()); editor.setPrefs({ lang: 'en' }); const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), close = vi.fn(); cleanups.push(async () => { await act(async () => { editor.runner.cancelAll(); root.unmount(); }); host.remove(); }); return { editor, host, root, close }; }
it('keeps MATCHPROP Settings pending in StrictMode and cancels without changes', async () => {
  const { editor, host, root, close } = fixture();
  const done = editor.runner.run({ name: 'MATCH_SETTINGS_UI_TEST', aliases: [], category: 'utility', readOnly: true, label: { es: 'Ajustes', en: 'Settings' }, description: { es: '', en: '' }, async run(api) { await api.getString({ prompt: { es: 'Ajustes', en: 'Settings' }, allowNone: true }); } });
  const pending = editor.runner.pending, version = editor.doc.version, initial = { ...matchSettings };
  await act(async () => root.render(h(StrictMode, null, h(MatchSettingsDialog, { editor, payload: { doc: editor.doc, version, pending, settings: initial }, onClose: close }))));
  expect(editor.runner.pending).toBe(pending); expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(10);
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'None')!.click());
  expect([...host.querySelectorAll<HTMLInputElement>('input')].every(input => !input.checked)).toBe(true);
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Cancel')!.click()); await done;
  expect(editor.doc.version).toBe(version); expect(matchSettings).toEqual(initial); expect(close).toHaveBeenCalledOnce();
});
it('UNITS is a browser form, cancels without edits, and applies a complete undoable draft', async () => {
  const { editor, host, root, close } = fixture(), ui = vi.fn(); window.addEventListener('fmodel:ui', ui);
  await editor.command('UNITS'); expect(editor.runner.busy).toBe(false); expect(ui).toHaveBeenCalledOnce(); window.removeEventListener('fmodel:ui', ui);
  const version = editor.doc.version, payload = { doc: editor.doc, version };
  await act(async () => root.render(h(UnitsDialog, { editor, payload, onClose: close })));
  expect(editor.doc.version).toBe(version);
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Cancel')!.click()); expect(editor.doc.version).toBe(version);
  const units = host.querySelector('select')!; await act(async () => { units.value = 'm'; units.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Apply')!.click());
  expect(editor.doc.settings.units).toBe('m'); editor.doc.undo(); expect(editor.doc.settings.units).toBe('mm');
});
it('UNITS disables an invalid precision draft and a stale same-id drawing', async () => {
  const { editor, host, root, close } = fixture();
  await act(async () => root.render(h(UnitsDialog, { editor, payload: { doc: editor.doc, version: editor.doc.version }, onClose: close })));
  const input = host.querySelector('input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '9'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(host.querySelector<HTMLButtonElement>('.btn--primary')!.disabled).toBe(true);
  await act(async () => editor.doc.replaceData(createDocument().data, editor.doc.id));
  expect(host.querySelector('[role=alert]')?.textContent).toContain('drawing changed');
  expect(host.querySelector<HTMLButtonElement>('.btn--primary')!.disabled).toBe(true);
});
