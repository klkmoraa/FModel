// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CommandHarness } from '../../commands/behavior/harness';
import { createWallAssembly, readWallSource } from '../../model/wallAssembly';
import { Ribbon } from '../Ribbon';
import { ArchitecturePanel } from './ArchitecturePanel';
import { ToolPalettesPanel } from './ToolPalettesPanel';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it.each([['es', 'Arquitectura', 'Cuadro de huecos'], ['en', 'Architecture', 'Opening schedule']] as const)('opening schedule native access in %s from panel, ribbon and palette', async (lang, tab, label) => {
  const h = new CommandHarness(), editor = h.editor; editor.setPrefs({ lang });
  await h.run('WALL', [{ x: 0, y: 0 }, { x: 5000, y: 0 }, '']);
  const id = [...h.doc.data.entities.keys()][0], source = readWallSource(h.doc, id).source;
  h.doc.transact('opening', tx => createWallAssembly(tx, id, source, [{ id: 'door', segment: 0, offset: 2000, width: 900, type: 'single', side: 1, hingeEnd: false }]));
  const host = document.createElement('div'), canvas = document.createElement('div'); canvas.className = 'canvas-host'; canvas.tabIndex = 0; document.body.append(host, canvas);
  const root = createRoot(host);
  const click = async (name: string) => { await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)!.click()); };
  const verify = async () => { expect(editor.runner.active?.def.name).toBe('OPENINGSCHEDULE'); expect(editor.runner.pending?.req.kind).toBe('point'); await act(async () => editor.key('Escape')); expect(editor.runner.busy).toBe(false); expect([...h.doc.data.entities.values()].some(e => e.type === 'table')).toBe(false); };
  try {
    await act(async () => root.render(createElement(ArchitecturePanel, { editor }))); await click(label); await verify();
    await act(async () => root.render(createElement(Ribbon, { editor, onUi: () => {} })));
    await act(async () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(e => e.textContent === tab)!.click()); await click(label); await verify();
    await act(async () => root.render(createElement(ToolPalettesPanel, { editor })));
    await act(async () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(e => e.textContent === tab)!.click());
    await act(async () => host.querySelector<HTMLElement>(`.palette-tile[title="${label}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))); await verify();
  } finally { await act(async () => { editor.key('Escape'); root.unmount(); }); host.remove(); canvas.remove(); }
});
