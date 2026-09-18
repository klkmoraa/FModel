import type { Editor } from '../../editor/editor';
import type { TemplateDefinition } from '../../templates';
import type { StoredDrawing } from '../../storage/persistence';
import type { LibraryBlock } from '../../blocks/library';
import { insertLibraryBlock } from '../../blocks/library';
import { readPackage } from '../../io/native';
import { tr } from '../controls';

/** Pide confirmación si el dibujo activo tiene cambios sin guardar. Devuelve true si se puede continuar. */
export function confirmDiscard(editor: Editor): boolean {
  if (!editor.doc.dirty) return true;
  return window.confirm(
    tr(editor.lang, 'Hay cambios sin guardar en el dibujo actual. ¿Descartarlos?', 'Unsaved changes in current drawing. Discard them?'),
  );
}

/** Carga un dibujo guardado en el navegador. Lanza si el paquete está dañado. */
export function openStoredDrawing(editor: Editor, drawing: StoredDrawing): void {
  const res = readPackage(drawing.bytes);
  editor.doc.replaceData(res.data, res.documentId);
  editor.fileName = drawing.name.replace(/\.fmodel$/i, '');
  editor.zoomExtents();
}

export function openTemplate(editor: Editor, tpl: TemplateDefinition): void {
  editor.doc.replaceData(tpl.createDocument());
  editor.fileName = tpl.name[editor.lang];
  editor.zoomExtents();
}

/** Registra el bloque en el dibujo activo y arranca el comando INSERT. */
export function insertBlock(editor: Editor, block: LibraryBlock): void {
  const name = insertLibraryBlock(editor.doc, block);
  editor.command('INSERT', [name]);
}

/** Ruta a un recurso de /public respetando el `base` de Vite (GitHub Pages sirve bajo subcarpeta). */
export function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
