import { UNIT_TO_MM } from '../document/defaults';
import type { DrawingUnits } from '../document/types';
import { buildComponent } from '../geometry/architecture/components';
import { COMPONENT_DEFINITIONS, componentDefinition, invalid, requireLayout } from '../geometry/architecture/schema';
import type { ComponentField, ComponentKind, ComponentParameters } from '../geometry/architecture/types';
export const COMPONENT_CATALOG = COMPONENT_DEFINITIONS;
export { ComponentError } from '../geometry/architecture/schema';
/** Presentation only: inactive fields remain validated and saved for future variants. */
export function visibleComponentFields(kind: ComponentKind, parameters: ComponentParameters): ComponentField[] {
  return componentDefinition(kind).fields.filter(field => !field.visibleWhen || field.visibleWhen.values.includes(String(parameters[field.visibleWhen.key])));
}
/** Length defaults are physical mm converted anew for the active document. Angles remain radians. */
export function componentDefaults(kind: ComponentKind, units: DrawingUnits): ComponentParameters {
  const definition = componentDefinition(kind), result = { ...definition.physicalDefaults };
  requireLayout(Number.isFinite(UNIT_TO_MM[units]), 'Unidad desconocida.', 'Unknown drawing unit.');
  for (const field of definition.fields) if (field.unit === 'length') result[field.key] = (result[field.key] as number) / UNIT_TO_MM[units];
  return result;
}
const numeric = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(mm|cm|m|in)?$/i;
/** Strict literal boundary shared by command prompts and future catalogue forms; angles entered in degrees. */
export function parseComponentField(field: ComponentField, units: DrawingUnits, text: string): number | string | boolean {
  if (field.type === 'enum') { const choice = field.choices!.find(c => c.value === text.toLowerCase()); if (!choice) invalid(`Opción inválida: ${field.label.es}.`, `Invalid option: ${field.label.en}.`, [field.key]); return choice.value; }
  if (field.type === 'boolean') { if (text === 'true') return true; if (text === 'false') return false; invalid('Usa true o false.', 'Use true or false.', [field.key]); }
  const match = numeric.exec(text); requireLayout(!!match && (field.unit === 'length' || !match![2]), `Número inválido: ${field.label.es}.`, `Invalid number: ${field.label.en}.`, [field.key]);
  let value = Number(match![1]);
  if (match![2]) value *= UNIT_TO_MM[match![2].toLowerCase() as 'mm' | 'cm' | 'm' | 'in'] / UNIT_TO_MM[units];
  if (field.unit === 'angle') value *= Math.PI / 180;
  requireLayout(Number.isFinite(value), `Número inválido: ${field.label.es}.`, `Invalid number: ${field.label.en}.`, [field.key]); return value;
}
/** Named literals only. Bare dimensional values use drawing units; suffixes are physical lengths. */
export function parseComponentArguments(kind: ComponentKind, units: DrawingUnits, args: string[] = []): { parameters: ComponentParameters; rotation: number } {
  const parameters = componentDefaults(kind, units), definition = componentDefinition(kind), seen = new Set<string>(); let rotation = 0;
  for (const argument of args) {
    const match = /^([A-Za-z][A-Za-z0-9]*)=([^=\s]+)$/.exec(argument); requireLayout(!!match, 'Usa clave=valor sin expresiones.', 'Use key=value without expressions.');
    const key = match![1].toLowerCase(), value = match![2]; requireLayout(!seen.has(key), 'Parámetro repetido.', 'Duplicate parameter.', [definition.fields.find(f => f.key.toLowerCase() === key)?.key ?? key]); seen.add(key);
    if (key === 'rotation') { rotation = parseComponentField({ key, label: { es: 'Giro', en: 'Rotation' }, type: 'number', unit: 'angle' }, units, value) as number; continue; }
    const field = definition.fields.find(f => f.key.toLowerCase() === key); requireLayout(!!field, `Parámetro desconocido: ${key}.`, `Unknown parameter: ${key}.`, [key]);
    parameters[field!.key] = parseComponentField(field!, units, value);
  }
  buildComponent(kind, parameters); return { parameters, rotation };
}
