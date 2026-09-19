import type { Editor } from '../../editor/editor';
import type { TemplateDefinition } from '../../templates';
import type { StoredDrawing } from '../../storage/persistence';
import type { LibraryBlock } from '../../blocks/library';
import { insertLibraryBlock } from '../../blocks/library';
import { readPackage } from '../../io/native';
import { createDocumentData } from '../../document/defaults';
import { getServices } from '../../app/services';
import { tr } from '../controls';
import { askConfirm } from '../ConfirmHost';

/** Pide confirmación si el dibujo activo tiene cambios sin guardar. Resuelve true si se puede continuar. */
export async function confirmDiscard(editor: Editor): Promise<boolean> {
  if (!editor.doc.dirty) return true;
  const lang = editor.lang;
  return askConfirm(
    lang,
    tr(lang, 'Cambios sin guardar', 'Unsaved changes'),
    tr(lang, 'El dibujo actual tiene cambios sin guardar. Si continúas, se descartarán.', 'The current drawing has unsaved changes. If you continue, they will be discarded.'),
    { confirmLabel: tr(lang, 'Descartar y continuar', 'Discard and continue') },
  );
}

/** Sustituye el dibujo activo por uno vacío en milímetros (sin preguntar de nuevo en la línea de comandos). */
export function createBlankDrawing(editor: Editor): void {
  editor.doc.replaceData(createDocumentData({ units: 'mm', title: tr(editor.lang, 'Sin título', 'Untitled') }));
  editor.fileName = '';
  getServices().fileHandle = null;
  editor.emit('doc');
}

/** Carga un dibujo guardado en el navegador. Lanza si el paquete está dañado. */
export function openStoredDrawing(editor: Editor, drawing: StoredDrawing): void {
  const res = readPackage(drawing.bytes);
  editor.doc.replaceData(res.data, res.documentId);
  editor.fileName = drawing.name.replace(/\.fmodel$/i, '');
  editor.ctx.fileName = drawing.name;
  getServices().fileHandle = null;
  editor.zoomExtents();
}

export function openTemplate(editor: Editor, tpl: TemplateDefinition): void {
  editor.doc.replaceData(tpl.createDocument());
  const name = tpl.name[editor.lang];
  editor.fileName = name;
  editor.ctx.fileName = name;
  getServices().fileHandle = null;
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
