// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { registerAllCommands } from '../../commands';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { Ribbon } from '../Ribbon';
import { PanelSheet } from '../phone/PhoneChrome';
import { ToolPalettesPanel } from './ToolPalettesPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('cleanup and restore native access in ES/EN ribbon, keyboard palette and focused phone architecture sheet', async () => {
  registerAllCommands(); const editor = new Editor(createDocument());
  const host = document.createElement('div'), canvas = document.createElement('div'); canvas.className = 'canvas-host'; canvas.tabIndex = 0;
  document.body.append(host, canvas); const root = createRoot(host);
  try {
    for (const lang of ['es', 'en'] as const) {
      editor.setPrefs({ lang }); const tab = lang === 'es' ? 'Arquitectura' : 'Architecture';
      for (const [command, es, en, kind] of [['WALLCLEAN', 'Limpiar muros', 'Clean walls', 'selection'], ['WALLRESTORE', 'Restaurar muros', 'Restore walls', 'keyword']] as const) {
        const label = lang === 'es' ? es : en;
        await act(async () => root.render(createElement(ToolPalettesPanel, { editor })));
        await act(async () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(e => e.textContent === tab)!.click());
        const tile = host.querySelector<HTMLElement>(`[title="${label}"]`)!; expect(tile).toBeTruthy(); tile.focus();
        await act(async () => tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
        expect(editor.runner.active?.def.name).toBe(command); expect(editor.runner.pending?.req.kind).toBe(kind); await act(async () => editor.key('Escape'));
        await act(async () => root.render(createElement(Ribbon, { editor, onUi: () => {} })));
        await act(async () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(e => e.textContent === tab)!.click());
        await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(e => e.textContent === label)!.click());
        expect(editor.runner.active?.def.name).toBe(command); await act(async () => editor.key('Escape'));
        await act(async () => root.render(createElement(PanelSheet, { editor, panel: 'architecture', onPanel: () => {}, onClose: () => root.render(null), onUi: () => {} })));
        const text = host.querySelector('[role="group"] [class="panel__hint"]')?.textContent;
        if (lang === 'en') expect(host.textContent).toContain('Axis and Parallel: select walls only.');
        expect(text).toBeTruthy();
        await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(e => e.textContent === label)!.click());
        expect(editor.runner.active?.def.name).toBe(command); expect(host.querySelector('[role="dialog"]')).toBeNull();
        await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))); expect(document.activeElement).toBe(canvas);
        await act(async () => editor.key('Escape')); expect(editor.runner.busy).toBe(false); expect(editor.preview).toBeNull();
      }
    }
    expect(editor.doc.data.entities.size).toBe(0); expect(editor.doc.history.entries()).toHaveLength(0);
  } finally { await act(async () => { editor.key('Escape'); root.unmount(); }); host.remove(); canvas.remove(); }
});
