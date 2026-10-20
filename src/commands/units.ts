import { requestUi } from '../app/services';
import type { CadDocument } from '../document/document';
import type { AngleFormat, DrawingUnits, UnitFormat } from '../document/types';
import { K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

export const DRAWING_UNITS = ['unitless', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'] as const;
export const LINEAR_FORMATS = ['decimal', 'architectural', 'engineering', 'fractional', 'scientific'] as const;
export const ANGLE_FORMATS = ['degrees', 'dms', 'grads', 'radians', 'surveyor'] as const;
export interface UnitsSession { doc: CadDocument; version: number }
export interface UnitsOptions {
  version: 1; documentId: string; documentVersion: number; units: DrawingUnits;
  linearFormat: UnitFormat; linearPrecision: number; angleFormat: AngleFormat; anglePrecision: number;
}
export function parseUnitsOptions(text: string): UnitsOptions {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('Invalid UNITS settings');
  const v = JSON.parse(text) as UnitsOptions;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 8 || v.version !== 1 ||
      typeof v.documentId !== 'string' || !v.documentId.length || v.documentId.length > 256 ||
      !Number.isInteger(v.documentVersion) || v.documentVersion < 0 ||
      !DRAWING_UNITS.includes(v.units) || !LINEAR_FORMATS.includes(v.linearFormat) || !ANGLE_FORMATS.includes(v.angleFormat) ||
      ![v.linearPrecision, v.anglePrecision].every(p => Number.isInteger(p) && p >= 0 && p <= 8)) throw new Error('Invalid UNITS settings');
  return v;
}
async function runUnitsCli(api: CommandApi) {
    const s = api.editor.doc.settings;
    const u = await api.getKeyword({ prompt: L('Unidades de inserción', 'Insertion units'), keywords: ['unitless', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'].map((x) => K(x, x, x)), defaultValue: s.units });
    const f = await api.getKeyword({ prompt: L('Formato lineal', 'Linear format'), keywords: [K('decimal', 'Decimal', 'Decimal', ['d']), K('architectural', 'Arquitectónico', 'Architectural', ['a']), K('engineering', 'Ingeniería', 'Engineering', ['i', 'e']), K('fractional', 'Fraccionario', 'Fractional', ['f']), K('scientific', 'Científico', 'Scientific', ['c', 's'])], defaultValue: s.linearFormat });
    const p = await api.getNumber({ prompt: L('Precisión lineal (0–8)', 'Linear precision (0–8)'), integer: true, min: 0, max: 8, defaultValue: s.linearPrecision });
    const af = await api.getKeyword({ prompt: L('Formato angular', 'Angle format'), keywords: [K('degrees', 'Grados decimales', 'Decimal degrees', ['g', 'd']), K('dms', 'GMS', 'DMS', ['dms']), K('grads', 'Centesimales', 'Grads', ['c']), K('radians', 'Radianes', 'Radians', ['r']), K('surveyor', 'Topográfico', 'Surveyor', ['t', 's'])], defaultValue: s.angleFormat });
    api.apply('UNITS', (tx) =>
      tx.setSettings({
        units: (u.kind === 'keyword' ? u.key : s.units) as DrawingUnits,
        insUnits: (u.kind === 'keyword' ? u.key : s.insUnits) as DrawingUnits,
        linearFormat: f.kind === 'keyword' ? (f.key as typeof s.linearFormat) : s.linearFormat,
        linearPrecision: p.kind === 'value' ? p.value : s.linearPrecision,
        angleFormat: af.kind === 'keyword' ? (af.key as typeof s.angleFormat) : s.angleFormat,
      }),
    );
}
export const UNITS: CommandDef = {
  name: 'UNITS', aliases: ['UN', 'UNIDADES'], category: 'utility',
  label: L('Unidades del dibujo', 'Drawing units'),
  description: L('Configura unidades, formatos y precisión sin reescalar objetos.', 'Sets units, formats and precision without rescaling objects.'),
  async run(api, args) {
    if (args?.length) {
      let value: UnitsOptions;
      try { if (args.length !== 1) throw new Error(); value = parseUnitsOptions(args[0]); }
      catch { throw new CommandError(L('Ajustes de unidades no válidos.', 'Invalid drawing unit settings.')); }
      const doc = api.editor.doc;
      if (value.documentId !== doc.id || value.documentVersion !== doc.version) throw new CommandError(L('El dibujo cambió. Vuelve a abrir Unidades.', 'The drawing changed. Reopen Drawing units.'));
      api.apply('UNITS', tx => tx.setSettings({ units: value.units, insUnits: value.units, linearFormat: value.linearFormat, linearPrecision: value.linearPrecision, angleFormat: value.angleFormat, anglePrecision: value.anglePrecision }));
    } else if (typeof window === 'undefined') await runUnitsCli(api);
    else requestUi('units', { doc: api.editor.doc, version: api.editor.doc.version } satisfies UnitsSession);
  },
};
export const UNITS_CLI: CommandDef = { ...UNITS, name: '-UNITS', aliases: [], run: runUnitsCli };
