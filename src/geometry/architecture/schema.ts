import { TOL } from '../tolerance';
import type { ComponentDefinition, ComponentField, ComponentKind, ComponentLabel, ComponentParameters } from './types';
const label = (es: string, en: string): ComponentLabel => ({ es, en });
const length = (key: string, es: string, en: string): ComponentField => ({ key, label: label(es, en), type: 'number', min: TOL.LINEAR, unit: 'length' });
const count = (key: string, es: string, en: string, min = 1): ComponentField => ({ key, label: label(es, en), type: 'integer', min, max: 200, unit: 'count' });
const choice = (key: string, es: string, en: string, choices: [string, string, string][]): ComponentField => ({ key, label: label(es, en), type: 'enum', unit: 'none', choices: choices.map(([value, es, en]) => ({ value, label: label(es, en) })) });
const angle = (key: string, es: string, en: string, min: number, max: number): ComponentField => ({ key, label: label(es, en), type: 'number', unit: 'angle', min: min * Math.PI / 180, max: max * Math.PI / 180 });
const view = choice('view', 'Vista', 'View', [['plan', 'Planta', 'Plan'], ['elevation', 'Alzado', 'Elevation']]);
const w = length('width', 'Ancho', 'Width'), h = length('height', 'Alto', 'Height'), d = length('depth', 'Fondo', 'Depth'), f = length('frame', 'Marco', 'Frame'), wall = length('wall', 'Pared', 'Wall'), sill = length('sill', 'Antepecho', 'Sill'), slab = length('slab', 'Losa', 'Slab'), steps = count('steps', 'Peldaños', 'Steps', 2), tread = length('tread', 'Huella', 'Tread'), columns = count('columns', 'Columnas', 'Columns'), rows = count('rows', 'Filas', 'Rows'), len = length('length', 'Largo', 'Length');
const def = (kind: ComponentKind, es: string, en: string, category: ComponentLabel, fields: ComponentField[], physicalDefaults: ComponentParameters): ComponentDefinition => ({ kind, command: kind.toUpperCase(), label: label(es, en), category, fields, physicalDefaults });
const structure = label('Estructura', 'Structure'), circulation = label('Circulación', 'Circulation'), openings = label('Huecos', 'Openings'), facades = label('Fachadas y protección', 'Facades and protection');
const visible = (field: ComponentField, key: string, values: string[]): ComponentField => ({ ...field, visibleWhen: { key, values } });
/** Physical lengths are millimetres; angles are radians throughout the domain/schema. */
export const COMPONENT_DEFINITIONS: readonly ComponentDefinition[] = [
  def('column', 'Columna', 'Column', structure, [choice('variant', 'Variante', 'Variant', [['rectangular', 'Rectangular', 'Rectangular'], ['circular', 'Circular', 'Circular'], ['l', 'L', 'L'], ['t', 'T', 'T'], ['cross', 'Cruz', 'Cross']]), visible(w, 'variant', ['rectangular', 'l', 't', 'cross']), visible(d, 'variant', ['rectangular', 'l', 't', 'cross']), visible(length('arm', 'Brazo', 'Arm'), 'variant', ['l', 't', 'cross']), visible(length('diameter', 'Diámetro', 'Diameter'), 'variant', ['circular'])], { variant: 'rectangular', width: 400, depth: 400, arm: 150, diameter: 400 }),
  def('axisgrid', 'Retícula', 'Axis grid', structure, [columns, rows, length('spacingX', 'Separación X', 'X spacing'), length('spacingY', 'Separación Y', 'Y spacing'), length('margin', 'Margen', 'Margin'), length('bubble', 'Radio de burbuja', 'Bubble radius')], { columns: 4, rows: 3, spacingX: 4000, spacingY: 4000, margin: 500, bubble: 150 }),
  def('stairplan', 'Escalera en planta', 'Stair plan', circulation, [choice('variant', 'Variante', 'Variant', [['straight', 'Recta', 'Straight'], ['l', 'L', 'L'], ['u', 'U', 'U'], ['curved', 'Curva', 'Curved']]), w, visible(tread, 'variant', ['straight', 'l', 'u']), steps, visible(length('landing', 'Descanso', 'Landing'), 'variant', ['l', 'u']), visible(length('innerRadius', 'Radio interior', 'Inner radius'), 'variant', ['curved']), visible(angle('turn', 'Giro de tramo curvo', 'Curved flight turn', 15, 270), 'variant', ['curved'])], { variant: 'straight', width: 1000, tread: 280, steps: 16, landing: 1000, innerRadius: 1000, turn: Math.PI / 2 }),
  def('stairsection', 'Escalera en sección', 'Stair section', circulation, [tread, length('rise', 'Contrahuella', 'Rise'), steps, slab], { tread: 280, rise: 170, steps: 16, slab: 150 }),
  def('escalator', 'Escalera mecánica', 'Escalator', circulation, [view, w, h, angle('angle', 'Ángulo', 'Angle', 10, 60), length('platform', 'Plataforma', 'Platform')], { view: 'plan', width: 1200, height: 3000, angle: Math.PI / 6, platform: 1000 }),
  def('liftplan', 'Elevador', 'Lift', circulation, [w, d, length('cabinWidth', 'Ancho de cabina', 'Cabin width'), length('cabinDepth', 'Fondo de cabina', 'Cabin depth'), length('door', 'Puerta', 'Door'), wall], { width: 2200, depth: 2200, cabinWidth: 1600, cabinDepth: 1600, door: 900, wall: 150 }),
  def('doorelevation', 'Puerta en alzado', 'Door elevation', openings, [choice('variant', 'Hojas', 'Leaves', [['single', 'Una hoja', 'Single'], ['double', 'Dos hojas', 'Double']]), w, h, f], { variant: 'single', width: 900, height: 2100, frame: 50 }),
  def('doorsection', 'Puerta en sección', 'Door section', openings, [h, wall, f, length('threshold', 'Umbral', 'Threshold')], { height: 2100, wall: 200, frame: 50, threshold: 20 }),
  def('windowelevation', 'Ventana en alzado', 'Window elevation', openings, [w, h, f, columns, rows, { key: 'opening', label: label('Diagonales de apertura', 'Opening diagonals'), type: 'boolean', unit: 'none' }], { width: 1200, height: 1200, frame: 50, columns: 2, rows: 1, opening: false }),
  def('windowsection', 'Ventana en sección', 'Window section', openings, [h, sill, wall, f, length('projection', 'Vuelo de alféizar', 'Sill projection')], { height: 1200, sill: 900, wall: 200, frame: 50, projection: 60 }),
  def('baywindowsection', 'Ventana saliente en sección', 'Bay window section', openings, [d, h, sill, wall, slab], { depth: 500, height: 1200, sill: 900, wall: 200, slab: 150 }),
  def('curtainwall', 'Muro cortina', 'Curtain wall', facades, [w, h, columns, rows, length('mullion', 'Montante', 'Mullion')], { width: 6000, height: 3000, columns: 5, rows: 3, mullion: 50 }),
  def('glasspartition', 'Mampara', 'Glass partition', facades, [len, length('thickness', 'Espesor', 'Thickness'), length('panel', 'Largo máximo de panel', 'Maximum panel length')], { length: 6000, thickness: 80, panel: 1000 }),
  def('banister', 'Barandal', 'Banister', facades, [view, len, visible(h, 'view', ['elevation']), length('spacing', 'Separación máxima de postes', 'Maximum post spacing'), length('thickness', 'Espesor', 'Thickness')], { view: 'plan', length: 4000, height: 1000, spacing: 1000, thickness: 40 }),
];
export class ComponentError extends Error {
  constructor(public readonly l10n: ComponentLabel, public readonly fieldKeys: readonly string[] = []) { super(l10n.es); }
}
export function invalid(es: string, en: string, fieldKeys: readonly string[] = []): never { throw new ComponentError(label(es, en), fieldKeys); }
export function requireLayout(condition: boolean, es = 'Las medidas no caben en la pieza.', en = 'The dimensions do not fit the component.', fieldKeys: readonly string[] = []) { if (!condition) invalid(es, en, fieldKeys); }
export function componentDefinition(kind: ComponentKind): ComponentDefinition {
  const definition = COMPONENT_DEFINITIONS.find(d => d.kind === kind);
  if (!definition) invalid('Familia desconocida.', 'Unknown component family.');
  return definition;
}
export function validateParameters(kind: ComponentKind, parameters: ComponentParameters): void {
  const fields = componentDefinition(kind).fields;
  requireLayout(!!parameters && typeof parameters === 'object' && !Array.isArray(parameters), 'Parámetros inválidos.', 'Invalid parameters.');
  const missing = fields.filter(f => !Object.hasOwn(parameters, f.key)).map(f => f.key), unknown = Object.keys(parameters).filter(k => !fields.some(f => f.key === k));
  requireLayout(!missing.length && !unknown.length, 'Campos desconocidos o ausentes.', 'Unknown or missing fields.', [...missing, ...unknown]);
  for (const field of fields) {
    const value = parameters[field.key];
    const valid = field.type === 'enum' ? typeof value === 'string' && field.choices!.some(c => c.value === value)
      : field.type === 'boolean' ? typeof value === 'boolean'
      : typeof value === 'number' && Number.isFinite(value) && (field.type !== 'integer' || Number.isInteger(value)) && (field.unit !== 'length' || value > TOL.LINEAR) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max);
    requireLayout(valid, `Valor inválido: ${field.label.es}.`, `Invalid value: ${field.label.en}.`, [field.key]);
  }
}
