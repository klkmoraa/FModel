import type { CadDocument } from '../document/document';
import type { PendingInput } from './runner';

export interface MatchSettings {
  color: boolean; layer: boolean; linetype: boolean; ltscale: boolean; lineweight: boolean;
  transparency: boolean; text: boolean; dimension: boolean; hatch: boolean; polyline: boolean;
}
export const MATCH_PROPERTY_FIELDS: { key: keyof MatchSettings; es: string; en: string }[] = [
  { key: 'color', es: 'Color', en: 'Color' }, { key: 'layer', es: 'Capa', en: 'Layer' },
  { key: 'linetype', es: 'Tipo de línea', en: 'Linetype' }, { key: 'ltscale', es: 'Escala de tipo de línea', en: 'Linetype scale' },
  { key: 'lineweight', es: 'Grosor de línea', en: 'Lineweight' }, { key: 'transparency', es: 'Transparencia', en: 'Transparency' },
  { key: 'text', es: 'Texto: estilo y altura', en: 'Text: style and height' }, { key: 'dimension', es: 'Cotas: estilo y ajustes', en: 'Dimensions: style and overrides' },
  { key: 'hatch', es: 'Sombreado: patrón y fondo', en: 'Hatch: pattern and background' }, { key: 'polyline', es: 'Polilínea: ancho', en: 'Polyline: width' },
];
export const matchSettings: MatchSettings = { color: true, layer: true, linetype: true, ltscale: true, lineweight: true, transparency: true, text: true, dimension: true, hatch: true, polyline: true };
export interface MatchSettingsSession { doc: CadDocument; version: number; pending: PendingInput; settings: MatchSettings }
export function parseMatchSettings(text: string): MatchSettings {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('Invalid MATCHPROP settings');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid MATCHPROP settings');
  const record = value as Record<string, unknown>, fields = record.properties;
  if (record.version !== 1 || Object.keys(record).length !== 2 || !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid MATCHPROP settings');
  const properties = fields as Record<string, unknown>;
  if (Object.keys(properties).length !== MATCH_PROPERTY_FIELDS.length || MATCH_PROPERTY_FIELDS.some(field => typeof properties[field.key] !== 'boolean')) throw new Error('Invalid MATCHPROP properties');
  return Object.fromEntries(MATCH_PROPERTY_FIELDS.map(field => [field.key, properties[field.key]])) as unknown as MatchSettings;
}
