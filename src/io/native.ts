import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { COLLECTIONS } from '../document/document';
import { createDocumentData } from '../document/defaults';
import type { AssetRecord, CollectionName, DocumentData, DocumentSettings, Id } from '../document/types';

/**
 * Formato nativo FModel 2D CAD.
 *
 * - `.fmodel`  paquete ZIP: `document.json` + `assets/<id>` binarios (portable, compartible).
 * - `.fmodel.json`  JSON plano con recursos embebidos como data URL (depuración).
 *
 * `format` identifica el archivo y `version` permite migraciones hacia delante.
 * Nunca se escriben coordenadas en píxeles: todo va en unidades de dibujo.
 */
export const FORMAT = 'fmodel-2dcad';
export const FORMAT_VERSION = 3;

export interface NativeFile {
  format: typeof FORMAT;
  version: number;
  generator: string;
  savedAt: string;
  documentId: Id;
  settings: DocumentSettings;
  collections: Partial<Record<CollectionName, unknown[]>>;
}

type Migration = (f: NativeFile) => NativeFile;

/** Migraciones: índice i convierte de la versión i+1 a la i+2. */
const MIGRATIONS: Migration[] = [
  // v1 → v2: layouts sin márgenes, capas sin transparencia
  (f) => {
    const layouts = (f.collections.layouts ?? []) as { page: { margins?: unknown } }[];
    for (const l of layouts) if (!l.page.margins) l.page.margins = { top: 10, right: 10, bottom: 10, left: 20 };
    const layers = (f.collections.layers ?? []) as { transparency?: number }[];
    for (const l of layers) if (l.transparency === undefined) l.transparency = 0;
    return { ...f, version: 2 };
  },
  // v2 → v3: bloques con revisión y entidades con orden
  (f) => {
    const blocks = (f.collections.blocks ?? []) as { revision?: number }[];
    for (const b of blocks) if (b.revision === undefined) b.revision = 1;
    let i = 0;
    for (const e of (f.collections.entities ?? []) as { order?: number }[]) if (e.order === undefined) e.order = ++i;
    return { ...f, version: 3 };
  },
];

export function toNativeFile(data: DocumentData, documentId: Id, opts: { embedAssets?: boolean } = {}): NativeFile {
  const collections: Partial<Record<CollectionName, unknown[]>> = {};
  for (const c of COLLECTIONS) {
    let values = [...(data[c] as Map<Id, unknown>).values()];
    if (c === 'assets' && !opts.embedAssets) values = (values as AssetRecord[]).map(({ dataUrl: _d, ...rest }) => rest);
    collections[c] = values;
  }
  return { format: FORMAT, version: FORMAT_VERSION, generator: 'FModel 2D CAD', savedAt: new Date().toISOString(), documentId, settings: { ...data.settings, modifiedAt: Date.now() }, collections };
}

export class NativeFormatError extends Error {}

export function fromNativeFile(input: unknown): { data: DocumentData; documentId: Id; warnings: string[] } {
  const warnings: string[] = [];
  const f = input as NativeFile;
  if (!f || f.format !== FORMAT) throw new NativeFormatError('No es un archivo FModel 2D CAD válido (falta el identificador de formato). / Not a valid FModel 2D CAD file.');
  if (typeof f.version !== 'number' || f.version < 1) throw new NativeFormatError('Versión de archivo desconocida. / Unknown file version.');
  if (f.version > FORMAT_VERSION) throw new NativeFormatError(`El archivo es de una versión más reciente (${f.version}) que esta aplicación (${FORMAT_VERSION}). Actualiza FModel. / File is newer than this app.`);
  let file = structuredClone(f);
  while (file.version < FORMAT_VERSION) {
    const m = MIGRATIONS[file.version - 1];
    if (!m) break;
    file = m(file);
    warnings.push(`Migrado a formato v${file.version}.`);
  }
  const base = createDocumentData();
  const data: DocumentData = { ...base, settings: { ...base.settings, ...file.settings, id: 'settings' } };
  for (const c of COLLECTIONS) {
    const list = file.collections[c];
    if (!list) continue;
    const map = new Map<Id, never>();
    for (const rec of list as { id?: Id }[]) {
      if (!rec || typeof rec.id !== 'string') {
        warnings.push(`Registro sin ID ignorado en ${c}.`);
        continue;
      }
      map.set(rec.id, rec as never);
    }
    (data as unknown as Record<string, Map<Id, never>>)[c] = map;
  }
  // referencias mínimas garantizadas
  if (!data.layers.size) data.layers = base.layers;
  if (!data.layers.has(data.settings.currentLayer)) data.settings.currentLayer = [...data.layers.keys()][0];
  if (!data.linetypes.size) data.linetypes = base.linetypes;
  if (!data.textStyles.size) data.textStyles = base.textStyles;
  if (!data.dimStyles.size) data.dimStyles = base.dimStyles;
  if (!data.mleaderStyles.size) data.mleaderStyles = base.mleaderStyles;
  if (!data.tableStyles.size) data.tableStyles = base.tableStyles;
  if (!data.mlineStyles.size) data.mlineStyles = base.mlineStyles;
  if (!data.layouts.size) data.layouts = base.layouts;
  return { data, documentId: file.documentId, warnings };
}

function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}

/** Paquete ZIP portable `.fmodel`. */
export function writePackage(data: DocumentData, documentId: Id): Uint8Array {
  const file = toNativeFile(data, documentId, { embedAssets: false });
  const entries: Record<string, Uint8Array> = { 'document.json': strToU8(JSON.stringify(file)) };
  for (const a of data.assets.values()) if (a.dataUrl) entries[`assets/${a.id}`] = dataUrlToBytes(a.dataUrl);
  entries['README.txt'] = strToU8('FModel 2D CAD package. document.json holds the drawing (units in drawing space); assets/ holds embedded images and PDFs.\n');
  return zipSync(entries, { level: 6 });
}

export function readPackage(bytes: Uint8Array): ReturnType<typeof fromNativeFile> {
  // ZIP (PK\x03\x04) o JSON
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const json = files['document.json'];
    if (!json) throw new NativeFormatError('El paquete no contiene document.json. / Package missing document.json.');
    const parsed = JSON.parse(strFromU8(json));
    const res = fromNativeFile(parsed);
    for (const a of res.data.assets.values()) {
      const bin = files[`assets/${a.id}`];
      if (bin) res.data.assets.set(a.id, { ...a, dataUrl: bytesToDataUrl(bin, a.mime) });
      else if (!a.dataUrl && !a.path) res.warnings.push(`Recurso «${a.name}» no encontrado en el paquete.`);
    }
    return res;
  }
  const text = strFromU8(bytes);
  return fromNativeFile(JSON.parse(text));
}

export function writeDebugJson(data: DocumentData, documentId: Id): string {
  return JSON.stringify(toNativeFile(data, documentId, { embedAssets: true }), null, 2);
}
