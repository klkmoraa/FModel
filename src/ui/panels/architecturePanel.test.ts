// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { registerAllCommands } from '../../commands';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { readComponentAssembly } from '../../model/componentAssembly';
import { ArchitecturePanel } from './ArchitecturePanel';
import { PanelSheet } from '../phone/PhoneChrome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let editor: Editor, host: HTMLDivElement, canvas: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  registerAllCommands(); editor = new Editor(createDocument({ units: 'm' })); editor.setPrefs({ lang: 'en' });
  host = document.createElement('div'); canvas = document.createElement('div'); canvas.className = 'canvas-host'; canvas.tabIndex = 0;
  document.body.append(canvas, host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { editor.key('Escape'); root.unmount(); }); host.remove(); canvas.remove(); });
const control = (name: string) => host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${name}"]`)!;
async function change(name: string, value: string) {
  const input = control(name);
  const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}
async function click(text: string) { await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!.click()); }
const renderPanel = () => act(async () => root.render(createElement(ArchitecturePanel, { editor })));

it('invalid Place/Edit retains fields and errors without starting the real runner', async () => {
  await renderPanel(); await change('Width · m', 'Infinity');
  await click('Place'); expect(editor.runner.busy).toBe(false); expect(control('Width · m').getAttribute('aria-invalid')).toBe('true');
  await click('Edit component'); expect(editor.runner.busy).toBe(false); expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  expect(editor.doc.data.entities.size).toBe(0);
});
it('a filtered-out family cannot place and clearing search restores its configured dimensions', async () => {
  await renderPanel(); await change('Width · m', '0.8'); await change('Search components', 'no-such-component');
  expect(Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Place')?.disabled).toBe(true);
  expect(editor.runner.busy).toBe(false); await change('Search components', ''); expect(control('Width · m').value).toBe('0.8');
});
it('valid placement restores canvas focus, uses native rotation and preserves fields after mutation', async () => {
  await renderPanel(); await change('Width · m', '600mm'); await change('Rotation · °', '90'); control('Width · m').focus();
  await click('Place'); await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  expect(document.activeElement).toBe(canvas); expect(editor.runner.pending?.req.kind).toBe('point');
  await act(async () => { editor.runner.submitPoint({ x: 1, y: 2 }); });
  const assembly = readComponentAssembly(editor.doc, [...editor.doc.data.entities.keys()][0]);
  expect(assembly.parameters.width).toBe(0.6); expect(assembly.rotation).toBeCloseTo(Math.PI / 2);
  expect(control('Width · m').value).toBe('600mm');
  await act(async () => { editor.doc.transact('units', tx => tx.setSettings({ units: 'mm' })); });
  expect(control('Width · mm').value).toBe('400');
});
it('the SVG miniature applies native rigid rotation without writing drawing entities', async () => {
  await renderPanel(); await change('Width · m', '0.6'); await change('Rotation · °', '90');
  const outline = host.querySelector('svg [data-role="outline"]')!;
  const points = outline.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
  expect(points[1][0]).toBeCloseTo(0); expect(points[1][1]).toBeCloseTo(0.6);
  expect(editor.doc.data.entities.size).toBe(0);
});
it('phone sheet has no input autofocus, keeps invalid actions open and restores values after valid close/cancel/reopen', async () => {
  const phone = () => createElement(PanelSheet, { editor, panel: 'architecture', onPanel: () => {}, onClose: () => root.render(null), onUi: () => {} });
  canvas.focus(); await act(async () => root.render(phone())); expect(document.activeElement).toBe(canvas);
  await change('Width · m', 'Infinity'); await click('Place'); await click('Edit component'); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  await change('Width · m', '0.9'); await click('Place'); expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { editor.key('Escape'); }); await act(async () => root.render(phone()));
  expect(control('Width · m').value).toBe('0.9');
  await click('Edit component'); expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(editor.runner.active?.def.name).toBe('COMPONENTEDIT');
  await act(async () => { editor.key('Escape'); }); expect(editor.doc.data.entities.size).toBe(0);
});
it('an actual replacement document refreshes the cached form while close/reopen alone does not', async () => {
  await renderPanel(); await change('Width · m', '0.9'); await act(async () => root.render(null));
  editor.doc = createDocument({ units: 'm' }); await renderPanel(); expect(control('Width · m').value).toBe('0.4');
});
it('changing the drawing units resets outdated field errors with the refreshed defaults', async () => {
  await renderPanel(); await change('Width · m', 'Infinity'); await click('Place');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => editor.doc.transact('units', tx => tx.setSettings({ units: 'mm' })));
  expect(control('Width · mm').value).toBe('400');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(control('Width · mm').hasAttribute('aria-invalid')).toBe(false);
});
it('variant visibility retains hidden dimensions and native picker uses the same active fields', async () => {
  await renderPanel(); await change('Width · m', '0.8'); await change('Variant', 'circular');
  expect(control('Width · m')).toBeNull(); expect(control('Diameter · m').value).toBe('0.4');
  await click('Place'); await act(async () => editor.runner.submitKeyword('Parameters'));
  expect(editor.runner.pending?.req.keywords?.map(k => k.key)).toEqual(['variant', 'diameter']);
  await act(async () => editor.key('Escape')); await change('Variant', 'rectangular');
  expect(control('Width · m').value).toBe('0.8');
});
it('selection summary rejects altered native geometry through the assembly reader', async () => {
  await renderPanel(); await click('Place'); await act(async () => editor.runner.submitPoint({ x: 0, y: 0 }));
  const member = [...editor.doc.data.entities.keys()][0];
  await act(async () => { editor.selection.set([member]); });
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Selected component: Column');
  await act(async () => editor.doc.transact('alter geometry', tx => tx.updateEntity(member, { vertices: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }] })));
  expect(host.querySelector('[role="status"]')).toBeNull();
});
it('opening lifecycle actions start native commands and field Escape reaches the phone sheet while dimensions persist', async () => {
  const phone = () => createElement(PanelSheet, { editor, panel: 'architecture', onPanel: () => {}, onClose: () => root.render(null), onUi: () => {} });
  await act(async () => root.render(phone()));
  await change('Width · m', '0.9');
  const input = control('Width · m'); input.focus();
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => root.render(phone())); expect(control('Width · m').value).toBe('0.9');
  await click('Move opening');
  expect(editor.runner.active?.def.name).toBe('OPENINGMOVE');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
it('wall utility actions route through native prompts and close the phone sheet', async () => {
  const phone = () => createElement(PanelSheet, { editor, panel: 'architecture', onPanel: () => {}, onClose: () => root.render(null), onUi: () => {} });
  await act(async () => root.render(phone()));
  expect(host.querySelector('[role="group"][aria-label="Wall tools"]')?.textContent).toContain('Wall axis');
  expect(host.querySelector('[role="group"][aria-label="Wall tools"]')?.textContent).toContain('Parallel wall');
  await click('Wall axis');
  expect(editor.runner.active?.def.name).toBe('WALLAXIS');
  expect(editor.runner.pending?.req.kind).toBe('entity');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(document.activeElement).toBe(canvas);
  await act(async () => editor.key('Escape'));
  await act(async () => root.render(phone()));
  await click('Parallel wall');
  expect(editor.runner.active?.def.name).toBe('WALLOFFSET');
  expect(editor.runner.pending?.req.kind).toBe('entity');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(document.activeElement).toBe(canvas);
  await act(async () => editor.key('Escape'));
  expect(editor.doc.data.entities.size).toBe(0);
});

it.each([['en', 'Fill walls', 'Wall tools'], ['es', 'Rellenar muros', 'Herramientas de muro']] as const)('wall fill action routes the native flow and restores focus in %s', async (lang, label, group) => {
  editor.setPrefs({ lang });
  const phone = () => createElement(PanelSheet, { editor, panel: 'architecture', onPanel: () => {}, onClose: () => root.render(null), onUi: () => {} });
  await act(async () => root.render(phone()));
  expect(host.querySelector(`[role="group"][aria-label="${group}"]`)?.textContent).toContain(label);
  await click(label); expect(editor.runner.active?.def.name).toBe('WALLFILL'); expect(editor.runner.pending?.req.kind).toBe('selection');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); }); expect(document.activeElement).toBe(canvas);
  await act(async () => editor.key('Escape')); expect(editor.runner.busy).toBe(false); expect(editor.preview).toBeNull(); expect(editor.doc.data.entities.size).toBe(0);
});
