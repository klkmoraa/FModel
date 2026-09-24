import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { COLLECTIONS } from '../document/document';
import { createDocumentData, UNIT_TO_MM } from '../document/defaults';
import type { AssetRecord, CollectionName, DocumentData, DocumentSettings, DrawingUnits, Id } from '../document/types';
import { assertInputBytes, assertZipLimits, assertZipOutputEntries } from './limits';
import { INPUT_LIMITS } from './limits';
import { assertArrayExpansionLimits, assertDocumentRecord, assertDocumentSettings, assertDynamicBlockDefinition, assertEntityRecord, assertFiniteValues, assertPointLimits, ENTITY_TYPES, InputValidationError } from './validation';
import { assertAssetRecord, AssetValidationError } from './assets';

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

function maxNativeCollectionSize(collection: CollectionName): number {
  return collection === 'entities' ? INPUT_LIMITS.maxEntities :
    collection === 'blocks' ? INPUT_LIMITS.maxBlocks :
      collection === 'assets' ? INPUT_LIMITS.maxAssets : INPUT_LIMITS.maxBlocks;
}

type Migration = (f: NativeFile) => NativeFile;

export { ENTITY_TYPES } from './validation';

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
    const records = data[c] as Map<Id, unknown>;
    if (records.size > maxNativeCollectionSize(c)) {
      throw new NativeFormatError(`La colección ${c} es demasiado grande. / Collection ${c} is too large.`);
    }
    let values = [...records.values()];
    if (c === 'assets' && !opts.embedAssets) values = (values as AssetRecord[]).map(({ dataUrl: _d, ...rest }) => rest);
    collections[c] = values;
  }
  assertNativeInput(() => assertArrayExpansionLimits([...data.entities.values()]));
  return { format: FORMAT, version: FORMAT_VERSION, generator: 'FModel 2D CAD', savedAt: new Date().toISOString(), documentId, settings: { ...data.settings, modifiedAt: Date.now() }, collections };
}

export class NativeFormatError extends Error {}

function isDrawingUnits(value: unknown): value is DrawingUnits {
  return typeof value === 'string' && Object.hasOwn(UNIT_TO_MM, value);
}

function isSafeAssetId(id: string): boolean {
  const normalized = id.trimEnd();
  if (normalized === '.' || normalized === '..' || id.includes('/') || id.includes('\\')) return false;
  for (let i = 0; i < id.length; i++) {
    const code = id.charCodeAt(i);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

function assertNativeAsset(asset: unknown): asserts asset is AssetRecord {
  try {
    assertAssetRecord(asset);
  } catch (error) {
    if (error instanceof AssetValidationError) throw new NativeFormatError(`${error.l10n.es} / ${error.l10n.en}`);
    throw error;
  }
}

function assertNativeInput(validate: () => void): void {
  try {
    validate();
  } catch (error) {
    if (error instanceof InputValidationError) throw new NativeFormatError(error.message);
    throw error;
  }
}

export function fromNativeFile(input: unknown): { data: DocumentData; documentId: Id; warnings: string[] } {
  const warnings: string[] = [];
  const f = input as NativeFile;
  if (!f || f.format !== FORMAT) throw new NativeFormatError('No es un archivo FModel 2D CAD válido (falta el identificador de formato). / Not a valid FModel 2D CAD file.');
  if (!Number.isInteger(f.version) || f.version < 1) throw new NativeFormatError('Versión de archivo desconocida. / Unknown file version.');
  if (f.version > FORMAT_VERSION) throw new NativeFormatError(`El archivo es de una versión más reciente (${f.version}) que esta aplicación (${FORMAT_VERSION}). Actualiza FModel. / File is newer than this app.`);
  if (typeof f.documentId !== 'string' || !f.documentId.trim()) throw new NativeFormatError('El archivo no tiene una identidad de documento válida. / The file has no valid document identity.');
  if (!f.collections || typeof f.collections !== 'object' || Array.isArray(f.collections)) throw new NativeFormatError('El archivo no contiene colecciones válidas. / The file has no valid collections.');
  if (!f.settings || typeof f.settings !== 'object' || Array.isArray(f.settings)) throw new NativeFormatError('El archivo no contiene ajustes válidos. / The file has no valid settings.');
  if ((f.settings.units !== undefined && !isDrawingUnits(f.settings.units)) || (f.settings.insUnits !== undefined && !isDrawingUnits(f.settings.insUnits))) {
    throw new NativeFormatError('El archivo contiene unidades de dibujo inválidas. / The file contains invalid drawing units.');
  }
  for (const c of COLLECTIONS) {
    const list = f.collections[c];
    if (list !== undefined && !Array.isArray(list)) throw new NativeFormatError(`La colección ${c} no es válida. / Collection ${c} is invalid.`);
    const maximum = maxNativeCollectionSize(c);
    if (list && list.length > maximum) throw new NativeFormatError(`La colección ${c} es demasiado grande. / Collection ${c} is too large.`);
  }
  assertNativeInput(() => {
    assertFiniteValues(f);
    assertPointLimits(f.collections.entities);
  });
  for (const asset of f.collections.assets ?? []) assertNativeAsset(asset);
  for (const entity of f.collections.entities ?? []) {
    if (!entity || typeof entity !== 'object') throw new NativeFormatError('El archivo contiene una entidad inválida. / The file contains an invalid entity.');
    const record = entity as { id?: unknown; type?: unknown; owner?: unknown; layer?: unknown };
    if (typeof record.id !== 'string' || !record.id.trim() || typeof record.owner !== 'string' || !record.owner.trim() || typeof record.layer !== 'string' || !record.layer.trim() || typeof record.type !== 'string' || !ENTITY_TYPES.has(record.type)) {
      throw new NativeFormatError('El archivo contiene una entidad inválida. / The file contains an invalid entity.');
    }
  }
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
      if (!rec || typeof rec.id !== 'string' || !rec.id.trim()) throw new NativeFormatError(`Registro sin ID válido en ${c}. / Record without a valid ID in ${c}.`);
      if (c === 'assets' && !isSafeAssetId(rec.id)) throw new NativeFormatError('El recurso tiene un ID inseguro para el paquete ZIP. / Asset ID is unsafe for the ZIP package.');
      if (map.has(rec.id)) throw new NativeFormatError(`Identificador duplicado «${rec.id}» en ${c}. / Duplicate ID "${rec.id}" in ${c}.`);
      map.set(rec.id, rec as never);
    }
    (data as unknown as Record<string, Map<Id, never>>)[c] = map;
  }
  // referencias mínimas garantizadas
  if (!data.layers.size) data.layers = base.layers;
  if (!data.linetypes.size) data.linetypes = base.linetypes;
  if (!data.textStyles.size) data.textStyles = base.textStyles;
  if (!data.dimStyles.size) data.dimStyles = base.dimStyles;
  if (!data.mleaderStyles.size) data.mleaderStyles = base.mleaderStyles;
  if (!data.tableStyles.size) data.tableStyles = base.tableStyles;
  if (!data.mlineStyles.size) data.mlineStyles = base.mlineStyles;
  if (!data.layouts.size) data.layouts = base.layouts;
  assertNativeInput(() => {
    assertDocumentSettings(data.settings);
    for (const collection of COLLECTIONS) {
      if (collection === 'entities' || collection === 'assets') continue;
      for (const record of (data[collection] as Map<Id, unknown>).values()) assertDocumentRecord(collection, record);
    }
  });

  const repairSetting = <K extends 'currentLayer' | 'currentTextStyle' | 'currentDimStyle' | 'currentMLeaderStyle' | 'currentTableStyle' | 'currentMLineStyle'>(
    key: K,
    map: Map<Id, unknown>,
    fallback: Id,
  ) => {
    if (map.has(data.settings[key])) return;
    warnings.push(`Se reparó la referencia «${key}» de los ajustes. / Repaired settings reference "${key}".`);
    data.settings[key] = fallback;
  };
  repairSetting('currentLayer', data.layers, [...data.layers.keys()][0]);
  repairSetting('currentTextStyle', data.textStyles, [...data.textStyles.keys()][0]);
  repairSetting('currentDimStyle', data.dimStyles, [...data.dimStyles.keys()][0]);
  repairSetting('currentMLeaderStyle', data.mleaderStyles, [...data.mleaderStyles.keys()][0]);
  repairSetting('currentTableStyle', data.tableStyles, [...data.tableStyles.keys()][0]);
  repairSetting('currentMLineStyle', data.mlineStyles, [...data.mlineStyles.keys()][0]);
  if (data.settings.currentLinetype !== 'ByLayer' && data.settings.currentLinetype !== 'ByBlock' && !data.linetypes.has(data.settings.currentLinetype)) {
    data.settings.currentLinetype = 'ByLayer';
    warnings.push('Se reparó el tipo de línea actual. / Repaired current linetype.');
  }

  for (const [id, layer] of data.layers) {
    if (!data.linetypes.has(layer.linetype)) {
      data.layers.set(id, { ...layer, linetype: [...data.linetypes.keys()][0] });
      warnings.push(`Se reparó el tipo de línea de la capa «${layer.name}». / Repaired linetype for layer "${layer.name}".`);
    }
  }
  for (const [id, style] of data.dimStyles) {
    if (!data.textStyles.has(style.textStyle)) {
      data.dimStyles.set(id, { ...style, textStyle: data.settings.currentTextStyle });
      warnings.push(`Se reparó el estilo de texto de «${style.name}». / Repaired text style for "${style.name}".`);
    }
  }
  for (const [id, style] of data.mleaderStyles) {
    let next = style;
    if (!data.textStyles.has(style.textStyle)) {
      next = { ...next, textStyle: data.settings.currentTextStyle };
      warnings.push(`Se reparó el estilo de texto de «${style.name}». / Repaired text style for "${style.name}".`);
    }
    if (next.blockId && !data.blocks.has(next.blockId)) {
      throw new NativeFormatError(`El estilo «${style.name}» apunta a un bloque inexistente. / Style "${style.name}" references a missing block.`);
    }
    if (next !== style) data.mleaderStyles.set(id, next);
  }
  for (const [id, style] of data.tableStyles) {
    if (!data.textStyles.has(style.textStyle)) {
      data.tableStyles.set(id, { ...style, textStyle: data.settings.currentTextStyle });
      warnings.push(`Se reparó el estilo de texto de «${style.name}». / Repaired text style for "${style.name}".`);
    }
  }
  for (const [id, style] of data.mlineStyles) {
    let repaired = false;
    const elements = style.elements.map((element) => {
      if (element.linetype === 'ByLayer' || element.linetype === 'ByBlock' || data.linetypes.has(element.linetype)) return element;
      repaired = true;
      return { ...element, linetype: 'ByLayer' };
    });
    if (repaired) {
      data.mlineStyles.set(id, { ...style, elements });
      warnings.push(`Se repararon tipos de línea de «${style.name}». / Repaired linetypes for "${style.name}".`);
    }
  }

  const owners = new Set<Id>(['*model', ...data.layouts.keys(), ...data.blocks.keys()]);
  for (const [entityId, original] of data.entities) {
    assertNativeInput(() => assertEntityRecord(original));
    let entity = original;
    if (!owners.has(entity.owner)) throw new NativeFormatError(`La entidad «${entity.id}» tiene un propietario inexistente. / Entity "${entity.id}" has a missing owner.`);
    if (!data.layers.has(entity.layer)) throw new NativeFormatError(`La entidad «${entity.id}» apunta a una capa inexistente. / Entity "${entity.id}" references a missing layer.`);
    if (entity.linetype !== 'ByLayer' && entity.linetype !== 'ByBlock' && !data.linetypes.has(entity.linetype)) {
      entity = { ...entity, linetype: 'ByLayer' };
      warnings.push(`Se reparó el tipo de línea de «${entity.id}». / Repaired linetype for "${entity.id}".`);
    }
    if ((entity.type === 'text' || entity.type === 'mtext' || entity.type === 'attdef') && !data.textStyles.has(entity.style)) {
      entity = { ...entity, style: data.settings.currentTextStyle };
      warnings.push(`Se reparó el estilo de «${entity.id}». / Repaired style for "${entity.id}".`);
    } else if ((entity.type === 'dimension' || entity.type === 'leader') && !data.dimStyles.has(entity.style)) {
      entity = { ...entity, style: data.settings.currentDimStyle };
      warnings.push(`Se reparó el estilo de «${entity.id}». / Repaired style for "${entity.id}".`);
    } else if (entity.type === 'mleader' && !data.mleaderStyles.has(entity.style)) {
      entity = { ...entity, style: data.settings.currentMLeaderStyle };
      warnings.push(`Se reparó el estilo de «${entity.id}». / Repaired style for "${entity.id}".`);
    } else if (entity.type === 'table' && !data.tableStyles.has(entity.style)) {
      entity = { ...entity, style: data.settings.currentTableStyle };
      warnings.push(`Se reparó el estilo de «${entity.id}». / Repaired style for "${entity.id}".`);
    } else if (entity.type === 'mline' && !data.mlineStyles.has(entity.style)) {
      entity = { ...entity, style: data.settings.currentMLineStyle };
      warnings.push(`Se reparó el estilo de «${entity.id}». / Repaired style for "${entity.id}".`);
    }
    if (entity.type === 'insert' && !data.blocks.has(entity.blockId)) throw new NativeFormatError(`La inserción «${entity.id}» apunta a un bloque inexistente. / Insert "${entity.id}" references a missing block.`);
    if (entity.type === 'array' && !data.blocks.has(entity.sourceBlockId)) throw new NativeFormatError(`La matriz «${entity.id}» apunta a un bloque inexistente. / Array "${entity.id}" references a missing block.`);
    if (entity.type === 'mleader') {
      if (entity.content.type === 'block' && !data.blocks.has(entity.content.blockId)) {
        throw new NativeFormatError(`La directriz «${entity.id}» apunta a un bloque inexistente. / Multileader "${entity.id}" references a missing block.`);
      }
      if (entity.overrides?.blockId && !data.blocks.has(entity.overrides.blockId)) {
        throw new NativeFormatError(`La directriz «${entity.id}» apunta a un bloque inexistente. / Multileader "${entity.id}" references a missing block.`);
      }
      if (entity.overrides?.textStyle && !data.textStyles.has(entity.overrides.textStyle)) {
        const overrides = { ...entity.overrides };
        delete overrides.textStyle;
        entity = { ...entity, overrides };
        warnings.push(`Se reparó una sobrescritura de «${entity.id}». / Repaired an override on "${entity.id}".`);
      }
    }
    if (entity.type === 'dimension') {
      let changed = false;
      const overrides = { ...entity.overrides };
      if (overrides.textStyle && !data.textStyles.has(overrides.textStyle)) {
        delete overrides.textStyle;
        changed = true;
      }
      const assoc = entity.assoc?.filter((ref) => data.entities.get(ref.entityId)?.owner === entity.owner);
      if (assoc?.length !== entity.assoc?.length) changed = true;
      if (changed) {
        entity = { ...entity, overrides, assoc: assoc?.length ? assoc : undefined };
        warnings.push(`Se repararon referencias asociativas de «${entity.id}». / Repaired associative references for "${entity.id}".`);
      }
    }
    if (entity.type === 'hatch' && entity.associative) {
      const associative = entity.associative.filter((id) => data.entities.get(id)?.owner === entity.owner);
      if (associative.length !== entity.associative.length) {
        entity = { ...entity, associative: associative.length ? associative : undefined };
        warnings.push(`Se repararon contornos asociativos de «${entity.id}». / Repaired associative boundaries for "${entity.id}".`);
      }
    }
    if (entity.type === 'leader' && entity.annotation && data.entities.get(entity.annotation)?.owner !== entity.owner) {
      entity = { ...entity, annotation: undefined };
      warnings.push(`Se reparó la anotación de «${entity.id}». / Repaired annotation for "${entity.id}".`);
    }
    if (entity.type === 'viewport') {
      const frozenLayers = entity.frozenLayers.filter((id) => data.layers.has(id));
      const layerOverrides = Object.fromEntries(Object.entries(entity.layerOverrides)
        .filter(([id]) => data.layers.has(id))
        .map(([id, override]) => {
          if (!override.linetype || override.linetype === 'ByLayer' || override.linetype === 'ByBlock' || data.linetypes.has(override.linetype)) return [id, override];
          const next = { ...override };
          delete next.linetype;
          return [id, next];
        }));
      if (frozenLayers.length !== entity.frozenLayers.length || Object.keys(layerOverrides).length !== Object.keys(entity.layerOverrides).length || JSON.stringify(layerOverrides) !== JSON.stringify(entity.layerOverrides)) {
        entity = { ...entity, frozenLayers, layerOverrides };
        warnings.push(`Se repararon referencias de viewport «${entity.id}». / Repaired viewport references for "${entity.id}".`);
      }
    }
    if (entity.type === 'image' || entity.type === 'pdfunderlay') {
      const asset = data.assets.get(entity.assetId);
      if (!asset) throw new NativeFormatError(`La entidad «${entity.id}» apunta a un recurso inexistente. / Entity "${entity.id}" references a missing asset.`);
      const validMime = entity.type === 'pdfunderlay' ? asset.mime === 'application/pdf' : asset.mime.startsWith('image/');
      if (!validMime) throw new NativeFormatError(`La entidad «${entity.id}» usa un recurso de tipo incompatible. / Entity "${entity.id}" uses an incompatible asset type.`);
      if (entity.type === 'pdfunderlay' && (!Number.isInteger(entity.page) || entity.page < 1 || (asset.pages !== undefined && entity.page > asset.pages))) {
        throw new NativeFormatError(`El calco «${entity.id}» apunta a una página no válida. / Underlay "${entity.id}" references an invalid page.`);
      }
    }
    if (entity !== original) data.entities.set(entityId, entity);
  }

  for (const block of data.blocks.values()) {
    if (!block.dynamic) continue;
    const entityIds = new Set([...data.entities.values()].filter((entity) => entity.owner === block.id).map((entity) => entity.id));
    assertNativeInput(() => assertDynamicBlockDefinition(block.dynamic, entityIds));
  }

  for (const [id, group] of data.groups) {
    const members = group.members.filter((member) => data.entities.has(member));
    if (members.length !== group.members.length) {
      data.groups.set(id, { ...group, members });
      warnings.push(`Se reparó el grupo «${group.name}». / Repaired group "${group.name}".`);
    }
  }
  for (const [id, view] of data.views) {
    let next = view;
    if (!owners.has(view.space)) next = { ...next, space: '*model' };
    if (next.layerState && !data.layerStates.has(next.layerState)) next = { ...next, layerState: undefined };
    if (next !== view) {
      data.views.set(id, next);
      warnings.push(`Se reparó la vista «${view.name}». / Repaired view "${view.name}".`);
    }
  }
  for (const [id, state] of data.layerStates) {
    let changed = !data.layers.has(state.currentLayer);
    const layers: typeof state.layers = {};
    for (const [layerId, snapshot] of Object.entries(state.layers)) {
      const current = data.layers.get(layerId);
      if (!current) {
        changed = true;
        continue;
      }
      if (!data.linetypes.has(snapshot.linetype)) {
        layers[layerId] = { ...snapshot, linetype: current.linetype };
        changed = true;
      } else {
        layers[layerId] = snapshot;
      }
    }
    if (changed) {
      data.layerStates.set(id, {
        ...state,
        currentLayer: data.layers.has(state.currentLayer) ? state.currentLayer : data.settings.currentLayer,
        layers,
      });
      warnings.push(`Se reparó el estado de capas «${state.name}». / Repaired layer state "${state.name}".`);
    }
  }
  for (const [id, filter] of data.layerFilters) {
    if (!filter.layers) continue;
    const layers = filter.layers.filter((layerId) => data.layers.has(layerId));
    if (layers.length !== filter.layers.length) {
      data.layerFilters.set(id, { ...filter, layers });
      warnings.push(`Se reparó el filtro de capas «${filter.name}». / Repaired layer filter "${filter.name}".`);
    }
  }
  assertNativeInput(() => assertArrayExpansionLimits([...data.entities.values()]));
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

function parseNativeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new NativeFormatError('El archivo contiene JSON dañado. / The file contains corrupted JSON.');
  }
}

/** Paquete ZIP portable `.fmodel`. */
export function writePackage(data: DocumentData, documentId: Id): Uint8Array {
  const file = toNativeFile(data, documentId, { embedAssets: false });
  const entries: Record<string, Uint8Array> = { 'document.json': strToU8(JSON.stringify(file)) };
  for (const a of data.assets.values()) {
    assertNativeAsset(a);
    if (!isSafeAssetId(a.id)) throw new NativeFormatError('El recurso tiene un ID inseguro para el paquete ZIP. / Asset ID is unsafe for the ZIP package.');
    if (a.dataUrl) entries[`assets/${a.id}`] = dataUrlToBytes(a.dataUrl);
  }
  entries['README.txt'] = strToU8('FModel 2D CAD package. document.json holds the drawing (units in drawing space); assets/ holds embedded images and PDFs.\n');
  assertZipOutputEntries(entries, 'archivo');
  const bytes = zipSync(entries, { level: 6 });
  assertZipLimits(bytes, 'archivo');
  return bytes;
}

export function readPackage(bytes: Uint8Array): ReturnType<typeof fromNativeFile> {
  assertInputBytes(bytes, 'archivo');
  // ZIP (PK\x03\x04) o JSON
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    assertZipLimits(bytes, 'paquete');
    let files: ReturnType<typeof unzipSync>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new NativeFormatError('El paquete FModel está dañado. / The FModel package is corrupted.');
    }
    const json = files['document.json'];
    if (!json) throw new NativeFormatError('El paquete no contiene document.json. / Package missing document.json.');
    const parsed = parseNativeJson(json);
    const res = fromNativeFile(parsed);
    for (const a of res.data.assets.values()) {
      const bin = files[`assets/${a.id}`];
      if (bin) {
        const embedded = { ...a, dataUrl: bytesToDataUrl(bin, a.mime) };
        assertNativeAsset(embedded);
        res.data.assets.set(a.id, embedded);
      }
      else if (!a.dataUrl && !a.path) res.warnings.push(`Recurso «${a.name}» no encontrado en el paquete.`);
    }
    return res;
  }
  return fromNativeFile(parseNativeJson(bytes));
}

export function writeDebugJson(data: DocumentData, documentId: Id): string {
  return JSON.stringify(toNativeFile(data, documentId, { embedAssets: true }), null, 2);
}
