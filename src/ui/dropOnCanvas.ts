import type { Vec2 } from '../geometry/vec';
import { insertLibraryBlock } from '../blocks/library';
import { loadLibrary } from '../blocks/libraryStore';
import type { Editor } from '../editor/editor';
import { runPaletteItem } from './panels/ToolPalettesPanel';
import { isPaletteItem, type PaletteItem } from './paletteData';

/** Lo que se puede arrastrar al lienzo: herramientas de paleta, bloques del dibujo o de la biblioteca. */
export type DropPayload = PaletteItem | { kind: 'library-block'; id: string };

export function isDropPayload(value: unknown): value is DropPayload {
  if (isPaletteItem(value)) return true;
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === 'library-block' &&
    typeof (value as { id?: unknown }).id === 'string' && !!(value as { id: string }).id.trim();
}

export function parseDropPayload(raw: string): DropPayload | null {
  if (raw.length > 1_000_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isDropPayload(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Suelta algo en el lienzo en el punto `at` (ya con referencias a objetos): los bloques se
 * insertan ahí con su escala y rotación; los sombreados usan el punto interior; el resto de
 * herramientas se ejecuta como con un clic. Una orden en curso se cancela antes.
 */
export async function dropOnCanvas(editor: Editor, item: unknown, at: Vec2): Promise<void> {
  if (!isDropPayload(item)) return;
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
