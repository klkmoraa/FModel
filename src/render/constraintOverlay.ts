import { drawingConstraintState, isSpaceOwner, type DrawingConstraintState } from '../constraints/drawing';
import type { Editor } from '../editor/editor';
import { drawConstraintMarkers } from './authoringOverlay';
import type { RenderTheme } from './theme';

/** Estado de restricciones del espacio actual, recalculado solo cuando cambia el dibujo. */
let cache: { key: string; state: DrawingConstraintState } | null = null;

function stateFor(editor: Editor): DrawingConstraintState {
  const key = `${editor.doc.id}|${editor.doc.version}|${editor.space}`;
  if (cache?.key !== key) cache = { key, state: drawingConstraintState(editor.doc.data, editor.space) };
  return cache.state;
}

/**
 * Marcas de las restricciones del dibujo en el espacio actual: glifos geométricos y cotas
 * de restricción con su fórmula y valor. No forman parte del dibujo ni se trazan.
 */
export function drawDrawingConstraints(g: CanvasRenderingContext2D, editor: Editor, theme: RenderTheme) {
  if (!editor.prefs.constraintBar || !editor.doc.data.constraints.size || !isSpaceOwner(editor.doc.data, editor.space)) return;
  const state = stateFor(editor);
  if (!state.constraints.length) return;
  drawConstraintMarkers(g, theme, {
    constraints: state.constraints,
    conflicts: state.conflicts,
    entity: (id) => editor.doc.entity(id),
    toScreen: (p) => editor.ownerToScreen(p),
    value: (c) => state.scope.values.get(c.name) ?? null,
    freedom: state.freedom,
    viewport: { width: editor.view.width, height: editor.view.height },
  });
}
