// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { registerAllCommands } from '../../commands';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { Ribbon } from '../Ribbon';
import { RIBBON } from '../ribbonConfig';
import { ToolPalettesPanel } from './ToolPalettesPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it.each([['en', 'Architecture', 'Fill walls'], ['es', 'Arquitectura', 'Rellenar muros']] as const)('wall fill ribbon and real palette route the command in %s', async (lang, tabLabel, label) => {
  registerAllCommands(); const editor = new Editor(createDocument()); editor.setPrefs({ lang });
  const tabs = RIBBON.flatMap(t => t.groups.flatMap(g => g.tools)).filter(t => t.cmd === 'WALLFILL'); expect(tabs).toHaveLength(1); expect(tabs[0].label[lang]).toBe(label);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(ToolPalettesPanel, { editor })));
    await act(async () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(e => e.textContent === tabLabel)!.click());
    const action = [...host.querySelectorAll<HTMLElement>('.palette-tile')].find(e => e.getAttribute('title') === label)!; expect(action).toBeTruthy();
    await act(async () => action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(editor.runner.active?.def.name).toBe('WALLFILL'); expect(editor.runner.pending?.req.kind).toBe('selection');
    await act(async () => editor.key('Escape')); expect(editor.preview).toBeNull(); expect(editor.runner.busy).toBe(false);
    await act(async () => root.render(createElement(Ribbon, { editor, onUi: () => {} })));
    await act(async () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(e => e.textContent === tabLabel)!.click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(e => e.textContent === label)!.click());
    expect(editor.runner.active?.def.name).toBe('WALLFILL'); expect(editor.runner.pending?.req.kind).toBe('selection');
    await act(async () => editor.key('Escape')); expect(editor.preview).toBeNull(); expect(editor.runner.busy).toBe(false);
  } finally { await act(async () => { editor.key('Escape'); root.unmount(); }); host.remove(); }
});
