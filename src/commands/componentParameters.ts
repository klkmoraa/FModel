import { COMPONENT_CATALOG, parseComponentField } from '../app/componentCatalog';
import { buildComponent } from '../geometry/architecture/components';
import { ComponentError } from '../geometry/architecture/schema';
import type { ComponentKind, ComponentParameters } from '../geometry/architecture/types';
import { K, L } from './helpers';
import { CommandError } from './types';
import type { CommandApi } from './types';
export function componentFailure(error: unknown): never { if (error instanceof ComponentError) throw new CommandError(error.l10n); throw error; }
export async function changeComponentField(api: CommandApi, kind: ComponentKind, parameters: ComponentParameters, key?: string): Promise<ComponentParameters> {
  const definition = COMPONENT_CATALOG.find(c => c.kind === kind)!;
  if (!key) {
    const selected = await api.getKeyword({ prompt: L('Parámetro a cambiar', 'Parameter to change'), allowNone: true, keywords: definition.fields.map(f => K(f.key, f.label.es, f.label.en)) });
    if (selected.kind === 'none') return parameters; key = selected.key;
  }
  const field = definition.fields.find(f => f.key === key)!;
  let value: string | undefined;
  if (field.type === 'enum') { const result = await api.getKeyword({ prompt: field.label, allowNone: true, keywords: field.choices!.map(c => K(c.value, c.label.es, c.label.en)) }); if (result.kind === 'keyword') value = result.key; }
  else if (field.type === 'boolean') { const result = await api.getKeyword({ prompt: field.label, allowNone: true, keywords: [K('true', 'Sí', 'Yes'), K('false', 'No', 'No')] }); if (result.kind === 'keyword') value = result.key; }
  else {
    const current = parameters[field.key] as number, units = field.unit === 'angle' ? (api.lang === 'es' ? 'grados' : 'degrees') : field.unit === 'length' ? api.editor.doc.settings.units : '';
    // String request intentionally bypasses the runner expression evaluator: identical literal contract to named args.
    const result = await api.getString({ prompt: L(`${field.label.es} · ${units}`, `${field.label.en} · ${units}`), allowNone: true, defaultValue: String(field.unit === 'angle' ? current * 180 / Math.PI : current) }); if (result.kind === 'string') value = result.value;
  }
  if (value === undefined) return parameters;
  try { const result = { ...parameters, [field.key]: parseComponentField(field, api.editor.doc.settings.units, value) }; buildComponent(kind, result); return result; } catch (error) { return componentFailure(error); }
}
