// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { PointPrecisionDialog } from './PointPrecisionDialog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => Promise<void>)[] = [];
async function mount() {
  const editor = new Editor(createDocument()); editor.setPrefs({ lang: 'en' });
  const done = editor.runner.run({ name: 'MENU_POINT_TEST', aliases: [], category: 'utility', readOnly: true,
    label: { es: 'Punto', en: 'Point' }, description: { es: 'Punto', en: 'Point' }, async run(api) { await api.getPoint({ prompt: { es: 'Punto', en: 'Point' } }); } });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), close = vi.fn();
  await act(async () => root.render(createElement(PointPrecisionDialog, { editor, onClose: close })));
  cleanups.push(async () => { await act(async () => { editor.runner.cancelAll(); await done; root.unmount(); }); host.remove(); });
  return { editor, host, close };
}
afterEach(async () => { for (const clean of cleanups.splice(0)) await clean(); });
it('chooses one-shot snap without answering the pending point or editing drawing/preferences', async () => {
  const { editor, host, close } = await mount(), request = editor.runner.pending, prefs = structuredClone(editor.prefs.snap), version = editor.doc.version;
  const midpoint = [...host.querySelectorAll('button')].find(button => button.textContent?.startsWith('Midpoint'))!;
  await act(async () => midpoint.click());
  expect(editor.osnapOverride).toEqual(['midpoint']); expect(editor.runner.pending).toBe(request);
  expect(editor.prefs.snap).toEqual(prefs); expect(editor.doc.version).toBe(version); expect(close).toHaveBeenCalledOnce();
});
it('Escape closes only the menu and leaves the point request unchanged', async () => {
  const { editor, host, close } = await mount(), request = editor.runner.pending;
  await act(async () => host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(close).toHaveBeenCalledOnce(); expect(editor.runner.pending).toBe(request); expect(editor.runner.busy).toBe(true);
});
it('starts FROM through the same runner pipeline without applying a point', async () => {
  const { editor, host, close } = await mount();
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('From a reference'))!.click());
  expect(editor.runner.pending?.req.prompt.en).toContain('base'); expect(editor.doc.version).toBe(0); expect(close).toHaveBeenCalledOnce();
});
