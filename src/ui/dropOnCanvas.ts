import type { Vec2 } from '../geometry/vec';
import { insertLibraryBlock } from '../blocks/library';
import { loadLibrary } from '../blocks/libraryStore';
import type { Editor } from '../editor/editor';
import type { PaletteItem } from './panels/ToolPalettesPanel';
import { runPaletteItem } from './panels/ToolPalettesPanel';

/** Lo que se puede arrastrar al lienzo: herramientas de paleta, bloques del dibujo o de la biblioteca. */
export type DropPayload = PaletteItem | { kind: 'library-block'; id: string };

/**
 * Suelta algo en el lienzo en el punto `at` (ya con referencias a objetos): los bloques se
 * insertan ahí con su escala y rotación; los sombreados usan el punto interior; el resto de
 * herramientas se ejecuta como con un clic. Una orden en curso se cancela antes.
 */
export async function dropOnCanvas(editor: Editor, item: DropPayload, at: Vec2): Promise<void> {
  if (editor.runner.busy) {
    editor.runner.cancel();
    for (let i = 0; i < 50 && editor.runner.busy; i++) await new Promise((r) => setTimeout(r, 2));
  }
  if (item.kind === 'library-block') {
    const libItem = (await loadLibrary()).find((b) => b.id === item.id);
    if (!libItem) {
      editor.runner.message('error', { es: 'Ese bloque ya no está en la biblioteca.', en: 'That block is no longer in the library.' });
      return;
    }
    await runPaletteItem(editor, { kind: 'block', name: insertLibraryBlock(editor.doc, libItem) }, at);
    return;
  }
  await runPaletteItem(editor, item, at);
}
