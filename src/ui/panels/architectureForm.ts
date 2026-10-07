import { COMPONENT_CATALOG, ComponentError, componentDefaults, parseComponentArguments, parseComponentField } from '../../app/componentCatalog';
import type { DrawingUnits } from '../../document/types';
import type { Editor } from '../../editor/editor';
import type { ComponentKind } from '../../geometry/architecture/types';

export interface ComponentFormState {
  kind: ComponentKind;
  units: DrawingUnits;
  docId: string;
  values: Record<string, string>;
  rotationText: string;
}

/** Schema angles are radians; literal command arguments and controls display degrees. */
export function componentFormValues(kind: ComponentKind, units: DrawingUnits): Record<string, string> {
  const defaults = componentDefaults(kind, units);
  return Object.fromEntries(COMPONENT_CATALOG.find(c => c.kind === kind)!.fields.map(field => [field.key,
    field.unit === 'angle' ? String(Number(((defaults[field.key] as number) * 180 / Math.PI).toPrecision(15))) : String(defaults[field.key]),
  ]));
}

export function validateComponentForm(kind: ComponentKind, units: DrawingUnits, values: Record<string, string>, rotationText: string) {
  const fields = COMPONENT_CATALOG.find(c => c.kind === kind)!.fields;
  // Parse each literal first so even empty input reports its actual field key.
  for (const field of fields) parseComponentField(field, units, values[field.key]?.trim() ?? '');
  const args = [...fields.map(field => `${field.key}=${values[field.key].trim()}`), `rotation=${rotationText.trim()}`];
  parseComponentField({ key: 'rotation', label: { es: 'Giro', en: 'Rotation' }, type: 'number', unit: 'angle' }, units, rotationText.trim());
  return { args, ...parseComponentArguments(kind, units, args) };
}

export function newComponentForm(kind: ComponentKind, units: DrawingUnits, docId: string): ComponentFormState {
  return { kind, units, docId, values: componentFormValues(kind, units), rotationText: '0' };
}

/** Document entity versions are deliberately absent: placement preserves chosen fields. */
export function refreshComponentForm(state: ComponentFormState, kind: ComponentKind, units: DrawingUnits, docId: string): ComponentFormState {
  return state.kind === kind && state.units === units && state.docId === docId ? state : newComponentForm(kind, units, docId);
}

export function assertComponentContext(editor: Editor, state: ComponentFormState): void {
  if (state.docId !== editor.doc.id || state.units !== editor.doc.settings.units) {
    throw new ComponentError({ es: 'El dibujo o sus unidades cambiaron. Revisa las medidas actualizadas.', en: 'The drawing or its units changed. Review the refreshed dimensions.' });
  }
}

export function startComponentPlacement(editor: Editor, state: ComponentFormState) {
  assertComponentContext(editor, state);
  const result = validateComponentForm(state.kind, state.units, state.values, state.rotationText);
  void editor.command(COMPONENT_CATALOG.find(c => c.kind === state.kind)!.command, result.args);
  return result;
}
