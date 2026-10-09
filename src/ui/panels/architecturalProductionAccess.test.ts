// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CommandHarness } from '../../commands/behavior/harness';
import { ArchitecturePanel } from './ArchitecturePanel';
import { Ribbon } from '../Ribbon';
import { ToolPalettesPanel } from './ToolPalettesPanel';
(globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;
const actions = [['WALLDIM', 'Cotas del plano', 'Plan dimensions', 'selection'], ['ROOMDATA', 'Datos de habitación', 'Room data', 'selection'], ['ROOMSCHEDULE', 'Cuadro de áreas', 'Room schedule', 'point'], ['MATERIALSCHEDULE', 'Cuadro de materiales', 'Material schedule', 'point'], ['WALLAUTO', 'Muros automáticos', 'Automatic walls', 'keyword'], ['WALLMOVE', 'Mover muro nativo', 'Move native wall', 'entity'], ['WALLERASE', 'Borrar muro nativo', 'Erase native wall', 'entity'], ['SHEETSET', 'Hojas desde marcos', 'Sheets from frames', 'selection']] as const;
it.each(['es', 'en'] as const)('architectural production native access in %s', async (lang) => {
  const h = new CommandHarness(), editor = h.editor;
  editor.setPrefs({ lang });
  await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 4000, y: 3000 }]);
  h.select(...h.doc.data.entities.keys());
  await h.run('ROOMDATA', ['Sala', 'Loseta', 'Pintura', '2700', '']);
  editor.selection.clear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host), tab = lang === 'es' ? 'Arquitectura' : 'Architecture';
  const verify = async (command: string, kind: string) => { expect(editor.runner.active?.def.name).toBe(command); expect(editor.runner.pending?.req.kind).toBe(kind); await act(async () => editor.key('Escape')); expect(editor.runner.busy).toBe(false); };
  try {
    for (const surface of ['panel', 'ribbon', 'palette']) {
      await act(async () => root.render(surface === 'panel' ? createElement(ArchitecturePanel, { editor }) : surface === 'ribbon' ? createElement(Ribbon, { editor, onUi: () => { } }) : createElement(ToolPalettesPanel, { editor })));
      if (surface !== 'panel')
        await act(async () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(e => e.textContent === tab)!.click());
      for (const [command, es, en, kind] of actions) {
        const label = lang === 'es' ? es : en;
        await act(async () => {
          if (surface === 'palette')
            host.querySelector<HTMLElement>(`.palette-tile[title="${label}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          else
            [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label)!.click();
        });
        await verify(command, kind);
      }
    }
  }
  finally {
    await act(async () => { editor.key('Escape'); root.unmount(); });
    host.remove();
  }
});
