import type { DynamicBlockDefinition, DynamicInstanceState } from '../../document/types';
import type { DxfRecord, Pair } from './parser';

/**
 * Datos propios de FModel dentro de un DXF para conservar los bloques dinámicos en la ida y
 * vuelta. Otros programas los ignoran (XDATA con APPID registrado y XRECORD en un diccionario
 * propio) y siguen viendo las variantes estáticas.
 */
export const FMODEL_APPID = 'FMODEL';
export const FMODEL_DYN_DICT = 'FMODEL_DYNAMIC_BLOCKS';
export const DYN_SCHEMA = 1;
const DEF_MARK = 'FMODEL_DYNAMIC';
const INST_MARK = 'DYNINSTANCE';
const HANDLE_PREFIX = '@H:';

/** Trozos de como máximo `size` caracteres (120 × 2 bytes UTF-8 < 255 bytes por cadena DXF). */
export function chunkText(s: string, size = 120): string[] {
  if (!s) return [''];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** Copia profunda sustituyendo las cadenas que el mapa conoce (IDs ↔ handles). */
export function remapStrings<T>(value: T, map: (s: string) => string | undefined): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return map(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

export function encodeDefinition(def: DynamicBlockDefinition, idToHandle: (id: string) => string | undefined): string {
  const { validation: _v, ...rest } = def;
  return JSON.stringify(remapStrings(rest, (id) => {
    const h = idToHandle(id);
    return h ? `${HANDLE_PREFIX}${h}` : undefined;
  }));
}

/**
 * Sustituye cada `@H:<handle>` por el ID nuevo. Las referencias sin objeto equivalente se
 * quitan de las listas (selecciones, estados de visibilidad) o quedan vacías, y se cuentan.
 */
export function decodeDefinition(json: string, handleToId: (h: string) => string | undefined): { def: DynamicBlockDefinition; missing: number } {
  let missing = 0;
  const resolve = (s: string) => (s.startsWith(HANDLE_PREFIX) ? (handleToId(s.slice(HANDLE_PREFIX.length)) ?? null) : s);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = resolve(v);
      if (r === null) missing++;
      return r ?? '';
    }
    if (Array.isArray(v)) {
      return v
        .filter((x) => !(typeof x === 'string' && resolve(x) === null && ++missing))
        .map(walk);
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { def: walk(JSON.parse(json)) as DynamicBlockDefinition, missing };
}

export function xrecordBody(blockName: string, json: string): Pair[] {
  return [[280, '1'], [1, DEF_MARK], [90, String(DYN_SCHEMA)], [2, blockName], ...chunkText(json).map((c): Pair => [3, c])];
}

export function readXrecord(rec: DxfRecord): { blockName: string; json: string } | null {
  if (rec.type !== 'XRECORD' || !rec.pairs.some(([c, v]) => c === 1 && v.trim() === DEF_MARK)) return null;
  const version = Number(rec.pairs.find(([c]) => c === 90)?.[1]);
  if (version !== DYN_SCHEMA) throw new Error(`versión de datos dinámicos desconocida (${version})`);
  const blockName = rec.pairs.find(([c]) => c === 2)?.[1].trim() ?? '';
  const json = rec.pairs.filter(([c]) => c === 3).map(([, v]) => v).join('');
  try {
    JSON.parse(json);
  } catch {
    throw new Error('JSON de definición dinámica dañado');
  }
  return { blockName, json };
}

export function instanceXdata(baseName: string, state: DynamicInstanceState | undefined): Pair[] {
  return [[1001, FMODEL_APPID], [1000, INST_MARK], [1070, String(DYN_SCHEMA)], [1000, baseName], ...chunkText(JSON.stringify(state ?? { values: {} })).map((c): Pair => [1000, c])];
}

export function readInstanceXdata(pairs: Pair[]): { baseName: string; state: DynamicInstanceState } | null {
  const start = pairs.findIndex(([c, v]) => c === 1001 && v.trim() === FMODEL_APPID);
  if (start < 0) return null;
  const own: Pair[] = [];
  for (let i = start + 1; i < pairs.length && pairs[i][0] !== 1001; i++) own.push(pairs[i]);
  if (own[0]?.[1].trim() !== INST_MARK || Number(own.find(([c]) => c === 1070)?.[1]) !== DYN_SCHEMA) return null;
  const strings = own.filter(([c]) => c === 1000).slice(1);
  const baseName = strings[0]?.[1].trim();
  if (!baseName) return null;
  try {
    return { baseName, state: JSON.parse(strings.slice(1).map(([, v]) => v).join('')) as DynamicInstanceState };
  } catch {
    return null;
  }
}
