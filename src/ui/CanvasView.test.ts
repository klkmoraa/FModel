// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import { registerAllCommands } from '../commands';
import { THEME_DAY } from '../render/theme';
import { CanvasView } from './CanvasView';
registerAllCommands();
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(editor: Editor) {
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), menu = vi.fn();
  await act(async () => root.render(createElement(CanvasView, { editor, theme: THEME_DAY, onContextMenu: menu })));
  cleanup.push(async () => { await act(async () => { editor.runner.cancelAll(); root.unmount(); }); host.remove(); });
  const canvas = host.querySelector<HTMLElement>('.canvas-host')!, point = editor.ownerToScreen({ x: 0, y: 0 }); canvas.dataset.x = String(point.x); canvas.dataset.y = String(point.y);
  return { canvas, menu };
}
function pointer(host: HTMLElement, type: string, button: number, shiftKey = false) {
  const event = new MouseEvent(type, { bubbles: true, button, shiftKey, clientX: Number(host.dataset.x), clientY: Number(host.dataset.y), detail: 0 });
  Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: 'mouse' } }); host.dispatchEvent(event);
}
function mouse(host: HTMLElement, type: string, detail: number) { host.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: Number(host.dataset.x), clientY: Number(host.dataset.y), detail })); }
it('latches Shift-right gesture across modifier release without answering pending input', async () => {
  const editor = new Editor(createDocument()), done = editor.command('LINE'), pending = editor.runner.pending;
  const { canvas, menu } = await mount(editor);
  await act(async () => { pointer(canvas, 'pointerdown', 2, true); pointer(canvas, 'pointerup', 2, false); canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, shiftKey: false })); });
  expect(menu).toHaveBeenCalledOnce(); expect(editor.runner.pending).toBe(pending); expect(editor.runner.log.filter(entry => entry.kind === 'input')).toHaveLength(0);
  editor.runner.cancelAll(); await done;
});
it('arbitrates native mouse detail before pointerup, preserving single grips and prior commands', async () => {
  const editor = new Editor(createDocument());
  await editor.runner.script('TEXT', [{ x: 0, y: 0 }, '2.5', '0', 'Original', '']);
  const entity = [...editor.doc.data.entities.values()][0]; editor.selection.set([entity.id]);
  const { canvas } = await mount(editor); vi.useFakeTimers();
  await act(async () => { pointer(canvas, 'pointerdown', 0); mouse(canvas, 'mousedown', 1); pointer(canvas, 'pointerup', 0); });
  expect(editor.runner.busy).toBe(false);
  await act(async () => { vi.advanceTimersByTime(400); }); expect(editor.runner.active?.def.name).toBe('_GRIP');
  const version = editor.doc.version;
  await act(async () => { pointer(canvas, 'pointerdown', 0); mouse(canvas, 'mousedown', 2); pointer(canvas, 'pointerup', 0); mouse(canvas, 'dblclick', 2); });
  expect(editor.runner.active?.def.name).toBe('TEXTEDIT'); expect(editor.runner.pending?.req.kind).toBe('string'); expect(editor.doc.version).toBe(version);
  const active = editor.runner.active;
  await act(async () => { pointer(canvas, 'pointerdown', 0); mouse(canvas, 'mousedown', 1); pointer(canvas, 'pointerup', 0); pointer(canvas, 'pointerdown', 0); mouse(canvas, 'mousedown', 2); pointer(canvas, 'pointerup', 0); mouse(canvas, 'dblclick', 2); });
  expect(editor.runner.active).toBe(active); expect(editor.runner.pending?.req.kind).toBe('string'); expect(editor.doc.version).toBe(version);
});

it('blur retires only deferred grips and consumes a cancelled precision gesture trailing up', async () => {
  const editor = new Editor(createDocument()); await editor.runner.script('TEXT', [{ x: 0, y: 0 }, '2.5', '0', 'Original', '']); editor.selection.set([[...editor.doc.data.entities.keys()][0]]);
  const { canvas, menu } = await mount(editor); vi.useFakeTimers();
  await act(async () => { pointer(canvas, 'pointerdown', 0); mouse(canvas, 'mousedown', 1); pointer(canvas, 'pointerup', 0); window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(400); });
  expect(editor.runner.busy).toBe(false);
  const done = editor.command('LINE'), pending = editor.runner.pending;
  await act(async () => { pointer(canvas, 'pointerdown', 2, true); window.dispatchEvent(new Event('blur')); pointer(canvas, 'pointerup', 2); canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })); });
  expect(menu).not.toHaveBeenCalled(); expect(editor.runner.pending).toBe(pending); editor.runner.cancelAll(); await done;
});
