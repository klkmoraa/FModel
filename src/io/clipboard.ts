import type { CadDocument, Transaction } from '../document/document';
import { LAYER0_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type {
  AssetRecord,
  BlockConstraint,
  BlockRecord,
  DimensionEntity,
  DimStyleRecord,
  DynAction,
  DynamicBlockDefinition,
  DynParam,
  Entity,
  HatchEntity,
  Id,
  LayerRecord,
  LinetypeRecord,
  LookupTable,
  MLeaderStyleRecord,
  MLineStyleRecord,
  TableStyleRecord,
  TextStyleRecord,
  ViewportEntity,
} from '../document/types';
import { translation } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { ModelContext } from '../model/context';
import { kindOf } from '../model/registry';
import { INPUT_LIMITS } from './limits';
import { remapDynamicBlockDef, remapDynamicInstanceState } from '../blocks/remap';
import { assertArrayExpansionLimits, assertDocumentRecord, assertDynamicBlockDefinition, assertEntityRecord, assertFiniteValues, assertPointLimits, InputValidationError } from './validation';
import { assertAssetRecord, AssetValidationError } from './assets';

export const CLIPBOARD_FORMAT = 'fmodel-clip';
export const CLIPBOARD_VERSION = 2;

export class ClipboardError extends Error {
  constructor(readonly l10n: { es: string; en: string }) {
    super(l10n.es);
  }
}

export interface ClipboardPackage {
  format: typeof CLIPBOARD_FORMAT;
  version: typeof CLIPBOARD_VERSION;
  base: Vec2;
  entities: Entity[];
  blocks?: BlockRecord[];
  blockEntities?: Entity[];
  layers?: LayerRecord[];
  linetypes?: LinetypeRecord[];
  textStyles?: TextStyleRecord[];
  dimStyles?: DimStyleRecord[];
  mleaderStyles?: MLeaderStyleRecord[];
  tableStyles?: TableStyleRecord[];
  mlineStyles?: MLineStyleRecord[];
  assets?: AssetRecord[];
}

export interface LegacyClipboardPackage {
  format: typeof CLIPBOARD_FORMAT;
  version?: 1;
  entities: Entity[];
  base?: Vec2;
}

export interface PasteClipboardResult {
  insertedIds: Id[];
  warnings: string[];
}

/** Empaqueta entidades con su cierre transitivo de dependencias para transferir entre dibujos. */
export function createClipboardPackage(doc: CadDocument, entityIds: Id[], ctx?: ModelContext): ClipboardPackage {
  const modelCtx = ctx ?? new ModelContext(doc);
  const entities = entityIds.map((id) => doc.entity(id)).filter(Boolean) as Entity[];
  if (entities.length === 0) {
    throw new ClipboardError({
      es: 'No hay objetos seleccionados para copiar.',
      en: 'No objects selected to copy.',
    });
  }

  const bboxes = entities.map((e) => kindOf(e).bbox(e, modelCtx));
  const b = bboxes.reduce(
    (acc, cur) => ({
      minX: Math.min(acc.minX, cur.minX),
      minY: Math.min(acc.minY, cur.minY),
      maxX: Math.max(acc.maxX, cur.maxX),
      maxY: Math.max(acc.maxY, cur.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const base: Vec2 = {
    x: Number.isFinite(b.minX) ? b.minX : 0,
    y: Number.isFinite(b.minY) ? b.minY : 0,
  };

  const layers = new Set<Id>();
  const linetypes = new Set<string>();
  const textStyles = new Set<Id>();
  const dimStyles = new Set<Id>();
  const mleaderStyles = new Set<Id>();
  const tableStyles = new Set<Id>();
  const mlineStyles = new Set<Id>();
  const blocks = new Map<Id, BlockRecord>();
  const blockEntities: Entity[] = [];
  const assets = new Set<Id>();

  const inspectEntity = (e: Entity) => {
    layers.add(e.layer);
    if (e.linetype && e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock') {
      linetypes.add(e.linetype);
    }
    if (e.type === 'text' || e.type === 'mtext' || e.type === 'attdef') {
      textStyles.add(e.style);
    } else if (e.type === 'dimension' || e.type === 'leader') {
      dimStyles.add(e.style);
      if (e.type === 'dimension' && e.overrides.textStyle) textStyles.add(e.overrides.textStyle);
    } else if (e.type === 'mleader') {
      mleaderStyles.add(e.style);
      if (e.overrides?.textStyle) textStyles.add(e.overrides.textStyle);
    } else if (e.type === 'table') {
      tableStyles.add(e.style);
    } else if (e.type === 'mline') {
      mlineStyles.add(e.style);
    }
    if (e.type === 'image' || e.type === 'pdfunderlay') {
      assets.add(e.assetId);
    }
    if (e.type === 'viewport') {
      for (const layerId of e.frozenLayers) layers.add(layerId);
      for (const [layerId, override] of Object.entries(e.layerOverrides)) {
        layers.add(layerId);
        if (override.linetype && override.linetype !== 'ByLayer' && override.linetype !== 'ByBlock') {
          linetypes.add(override.linetype);
        }
      }
    }
    if (e.type === 'insert') {
      visitBlock(e.blockId);
    } else if (e.type === 'array') {
      visitBlock(e.sourceBlockId);
    } else if (e.type === 'mleader') {
      if (e.content.type === 'block') visitBlock(e.content.blockId);
      if (e.overrides?.blockId) visitBlock(e.overrides.blockId);
    }
  };

  const visitBlock = (id: Id) => {
    if (blocks.has(id)) return;
    const b = doc.data.blocks.get(id);
    if (!b) return;
    blocks.set(id, b);
    for (const be of doc.entitiesOf(id)) {
      blockEntities.push(be);
      inspectEntity(be);
    }
  };

  for (const e of entities) {
    inspectEntity(e);
  }

  // Cierre transitivo completo de dependencias de capas, estilos, bloques y recursos
  let changed = true;
  while (changed) {
    const prevBlockCount = blocks.size;
    const prevLayerCount = layers.size;
    const prevLinetypeCount = linetypes.size;
    const prevTextStyleCount = textStyles.size;
    const prevDimStyleCount = dimStyles.size;
    const prevMLeaderCount = mleaderStyles.size;
    const prevTableCount = tableStyles.size;
    const prevMLineCount = mlineStyles.size;

    for (const l of layers) {
      const lr = doc.data.layers.get(l);
      if (lr?.linetype && lr.linetype !== 'ByLayer' && lr.linetype !== 'ByBlock') {
        linetypes.add(lr.linetype);
      }
    }
    for (const d of dimStyles) {
      const ds = doc.data.dimStyles.get(d);
      if (ds?.textStyle) textStyles.add(ds.textStyle);
    }
    for (const m of mleaderStyles) {
      const ms = doc.data.mleaderStyles.get(m);
      if (ms?.textStyle) textStyles.add(ms.textStyle);
      if (ms?.blockId) visitBlock(ms.blockId);
    }
    for (const t of tableStyles) {
      const ts = doc.data.tableStyles.get(t);
      if (ts?.textStyle) textStyles.add(ts.textStyle);
    }
    for (const m of mlineStyles) {
      const ms = doc.data.mlineStyles.get(m);
      if (ms?.elements) {
        for (const el of ms.elements) {
          if (el.linetype && el.linetype !== 'ByLayer' && el.linetype !== 'ByBlock') {
            linetypes.add(el.linetype);
          }
        }
      }
    }

    if (
      blocks.size === prevBlockCount &&
      layers.size === prevLayerCount &&
      linetypes.size === prevLinetypeCount &&
      textStyles.size === prevTextStyleCount &&
      dimStyles.size === prevDimStyleCount &&
      mleaderStyles.size === prevMLeaderCount &&
      tableStyles.size === prevTableCount &&
      mlineStyles.size === prevMLineCount
    ) {
      changed = false;
    }
  }

  return {
    format: CLIPBOARD_FORMAT,
    version: CLIPBOARD_VERSION,
    base,
    entities: structuredClone(entities),
    blocks: [...blocks.values()].map((b) => structuredClone(b)),
    blockEntities: blockEntities.map((be) => structuredClone(be)),
    layers: [...layers].map((id) => doc.data.layers.get(id)).filter(Boolean).map((l) => structuredClone(l!)),
    linetypes: [...linetypes].map((id) => doc.data.linetypes.get(id)).filter(Boolean).map((lt) => structuredClone(lt!)),
    textStyles: [...textStyles].map((id) => doc.data.textStyles.get(id)).filter(Boolean).map((ts) => structuredClone(ts!)),
    dimStyles: [...dimStyles].map((id) => doc.data.dimStyles.get(id)).filter(Boolean).map((ds) => structuredClone(ds!)),
    mleaderStyles: [...mleaderStyles].map((id) => doc.data.mleaderStyles.get(id)).filter(Boolean).map((ms) => structuredClone(ms!)),
    tableStyles: [...tableStyles].map((id) => doc.data.tableStyles.get(id)).filter(Boolean).map((ts) => structuredClone(ts!)),
    mlineStyles: [...mlineStyles].map((id) => doc.data.mlineStyles.get(id)).filter(Boolean).map((ms) => structuredClone(ms!)),
    assets: [...assets].map((id) => doc.data.assets.get(id)).filter(Boolean).map((a) => structuredClone(a!)),
  };
}

/** Valida los tipos y límites de una estructura de portapapeles. */
export function validateClipboardPackage(raw: unknown): ClipboardPackage | LegacyClipboardPackage {
  if (!raw || typeof raw !== 'object') {
    throw new ClipboardError({
      es: 'El contenido del portapapeles no es válido.',
      en: 'Clipboard content is invalid.',
    });
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== CLIPBOARD_FORMAT) {
    throw new ClipboardError({
      es: 'El portapapeles no contiene objetos compatibles con FModel.',
      en: 'Clipboard does not contain FModel compatible objects.',
    });
  }

  try {
    assertFiniteValues(raw);
    assertPointLimits(raw);
  } catch (err) {
    throw new ClipboardError({
      es: err instanceof Error ? err.message : 'El paquete contiene valores numéricos o límites no permitidos.',
      en: err instanceof Error ? err.message : 'The package contains invalid numerical values or disallowed limits.',
    });
  }

  if (!Array.isArray(obj.entities)) {
    throw new ClipboardError({
      es: 'El paquete de portapapeles no contiene entidades.',
      en: 'Clipboard package has no entities.',
    });
  }
  if (obj.entities.length > INPUT_LIMITS.maxEntities) {
    throw new ClipboardError({
      es: 'El portapapeles contiene demasiadas entidades.',
      en: 'Clipboard contains too many entities.',
    });
  }

  if (obj.version === 2) {
    const optionalArrays = ['blocks', 'blockEntities', 'layers', 'linetypes', 'textStyles', 'dimStyles', 'mleaderStyles', 'tableStyles', 'mlineStyles', 'assets'] as const;
    for (const field of optionalArrays) {
      if (obj[field] !== undefined && !Array.isArray(obj[field])) {
        throw new ClipboardError({
          es: `La colección «${field}» del portapapeles no es válida.`,
          en: `Clipboard collection "${field}" is invalid.`,
        });
      }
    }
    if (Array.isArray(obj.blocks) && obj.blocks.length > INPUT_LIMITS.maxBlocks) {
      throw new ClipboardError({
        es: 'El portapapeles contiene demasiados bloques.',
        en: 'Clipboard contains too many blocks.',
      });
    }
    if (Array.isArray(obj.blockEntities) && obj.blockEntities.length > INPUT_LIMITS.maxEntities) {
      throw new ClipboardError({
        es: 'El portapapeles contiene demasiadas entidades de bloque.',
        en: 'Clipboard contains too many block entities.',
      });
    }
    if (Array.isArray(obj.assets) && obj.assets.length > INPUT_LIMITS.maxAssets) {
      throw new ClipboardError({
        es: 'El portapapeles contiene demasiados recursos.',
        en: 'Clipboard contains too many assets.',
      });
    }
    const namedCollections = ['blocks', 'layers', 'linetypes', 'textStyles', 'dimStyles', 'mleaderStyles', 'tableStyles', 'mlineStyles'] as const;
    const collectionIds = new Map<string, Set<string>>();
    for (const field of namedCollections) {
      const ids = new Set<string>();
      for (const value of (obj[field] as unknown[] | undefined) ?? []) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new ClipboardError({ es: `La colección «${field}» contiene un registro inválido.`, en: `Clipboard collection "${field}" contains an invalid record.` });
        }
        const record = value as Record<string, unknown>;
        if (typeof record.id !== 'string' || !record.id.trim() || typeof record.name !== 'string' || !record.name.trim()) {
          throw new ClipboardError({ es: `La colección «${field}» contiene un registro sin identidad válida.`, en: `Clipboard collection "${field}" contains a record without a valid identity.` });
        }
        if (ids.has(record.id)) {
          throw new ClipboardError({ es: `Identificador duplicado «${record.id}» en «${field}».`, en: `Duplicate ID "${record.id}" in "${field}".` });
        }
        try {
          assertDocumentRecord(field, record);
        } catch (error) {
          if (error instanceof InputValidationError) throw new ClipboardError(error.l10n);
          throw error;
        }
        ids.add(record.id);
      }
      collectionIds.set(field, ids);
    }
    for (const asset of (obj.assets as unknown[] | undefined) ?? []) {
      try {
        assertAssetRecord(asset);
      } catch (error) {
        if (error instanceof AssetValidationError) throw new ClipboardError(error.l10n);
        throw error;
      }
    }
    const assets = new Map<string, AssetRecord>();
    for (const asset of (obj.assets as AssetRecord[] | undefined) ?? []) {
      if (assets.has(asset.id)) {
        throw new ClipboardError({ es: `Recurso duplicado «${asset.id}».`, en: `Duplicate asset "${asset.id}".` });
      }
      assets.set(asset.id, asset);
    }

    const blockIds = collectionIds.get('blocks') ?? new Set<string>();
    const blockEntityValues = (obj.blockEntities as unknown[] | undefined) ?? [];
    const blockEntityObjects = new Set(blockEntityValues);
    const entities = [...obj.entities, ...blockEntityValues];
    const entityIds = new Set<string>();
    for (const value of entities) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ClipboardError({ es: 'El portapapeles contiene una entidad inválida.', en: 'Clipboard contains an invalid entity.' });
      }
      const entity = value as Record<string, unknown>;
      try {
        assertEntityRecord(entity);
      } catch (error) {
        if (error instanceof InputValidationError) throw new ClipboardError(error.l10n);
        throw error;
      }
      if (entityIds.has(entity.id as string)) {
        throw new ClipboardError({ es: `Entidad duplicada «${entity.id}».`, en: `Duplicate entity "${entity.id}".` });
      }
      entityIds.add(entity.id as string);
      if (blockEntityObjects.has(value) && !blockIds.has(entity.owner as string)) {
        throw new ClipboardError({ es: `La entidad «${entity.id}» pertenece a un bloque inexistente.`, en: `Entity "${entity.id}" belongs to a missing block.` });
      }
      const requiredBlock = entity.type === 'insert'
        ? entity.blockId
        : entity.type === 'array'
          ? entity.sourceBlockId
          : entity.type === 'mleader' && typeof entity.content === 'object' && entity.content && (entity.content as { type?: unknown }).type === 'block'
            ? (entity.content as { blockId?: unknown }).blockId
            : undefined;
      if (requiredBlock !== undefined && (typeof requiredBlock !== 'string' || !blockIds.has(requiredBlock))) {
        throw new ClipboardError({ es: `La entidad «${entity.id}» apunta a un bloque inexistente.`, en: `Entity "${entity.id}" references a missing block.` });
      }
      if (entity.type === 'mleader' && typeof entity.overrides === 'object' && entity.overrides) {
        const overrideBlock = (entity.overrides as { blockId?: unknown }).blockId;
        if (overrideBlock !== undefined && (typeof overrideBlock !== 'string' || !blockIds.has(overrideBlock))) {
          throw new ClipboardError({ es: `La entidad «${entity.id}» apunta a un bloque inexistente.`, en: `Entity "${entity.id}" references a missing block.` });
        }
      }
      if (entity.type === 'image' || entity.type === 'pdfunderlay') {
        if (typeof entity.assetId !== 'string' || !assets.has(entity.assetId)) {
          throw new ClipboardError({ es: `La entidad «${entity.id}» apunta a un recurso inexistente.`, en: `Entity "${entity.id}" references a missing asset.` });
        }
        const asset = assets.get(entity.assetId)!;
        const validMime = entity.type === 'pdfunderlay' ? asset.mime === 'application/pdf' : asset.mime.startsWith('image/');
        if (!validMime) {
          throw new ClipboardError({ es: `La entidad «${entity.id}» usa un recurso incompatible.`, en: `Entity "${entity.id}" uses an incompatible asset.` });
        }
      }
    }
    try {
      assertArrayExpansionLimits(entities);
    } catch (error) {
      if (error instanceof InputValidationError) throw new ClipboardError(error.l10n);
      throw error;
    }
    for (const block of (obj.blocks as BlockRecord[] | undefined) ?? []) {
      if (!block.dynamic) continue;
      const ownEntityIds = new Set((blockEntityValues as Entity[])
        .filter((entity) => entity.owner === block.id)
        .map((entity) => entity.id));
      try {
        assertDynamicBlockDefinition(block.dynamic, ownEntityIds);
      } catch (error) {
        if (error instanceof InputValidationError) throw new ClipboardError(error.l10n);
        throw error;
      }
    }
    const b = obj.base as { x?: unknown; y?: unknown } | undefined;
    if (!b || typeof b.x !== 'number' || typeof b.y !== 'number' || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      throw new ClipboardError({
        es: 'El punto base del portapapeles no es válido.',
        en: 'Clipboard base point is invalid.',
      });
    }
    return obj as unknown as ClipboardPackage;
  }

  // Compatibilidad con paquete heredado v1 / sin versión
  if (obj.version !== undefined && obj.version !== 1) {
    throw new ClipboardError({
      es: `Versión de portapapeles no compatible: ${String(obj.version)}.`,
      en: `Unsupported clipboard version: ${String(obj.version)}.`,
    });
  }
  const legacyEntities = obj.entities.map((value, index) => {
    const normalized = value && typeof value === 'object' && !Array.isArray(value) && !Number.isFinite((value as Record<string, unknown>).order)
      ? { ...(value as Record<string, unknown>), order: index + 1 }
      : value;
    try {
      assertEntityRecord(normalized);
    } catch (error) {
      if (error instanceof InputValidationError) throw new ClipboardError(error.l10n);
      throw error;
    }
    return normalized;
  });
  try {
    assertArrayExpansionLimits(legacyEntities);
  } catch (error) {
    if (error instanceof InputValidationError) throw new ClipboardError(error.l10n);
    throw error;
  }
  obj.entities = legacyEntities;
  if (obj.base !== undefined && (!obj.base || typeof obj.base !== 'object' || Array.isArray(obj.base) ||
    typeof (obj.base as Record<string, unknown>).x !== 'number' || typeof (obj.base as Record<string, unknown>).y !== 'number')) {
    throw new ClipboardError({ es: 'El punto base del portapapeles no es válido.', en: 'Clipboard base point is invalid.' });
  }
  return obj as unknown as LegacyClipboardPackage;
}

/** Parsea y valida texto JSON de portapapeles. */
export function parseClipboardPackage(text: string): ClipboardPackage | LegacyClipboardPackage {
  if (text.length > INPUT_LIMITS.maxEntryBytes) {
    throw new ClipboardError({
      es: 'El contenido del portapapeles es demasiado grande.',
      en: 'Clipboard content is too large.',
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ClipboardError({
      es: 'El contenido del portapapeles no es texto JSON válido.',
      en: 'Clipboard content is not valid JSON.',
    });
  }
  return validateClipboardPackage(parsed);
}

export interface ComparisonMappings {
  mapBlock?: Map<Id, Id>;
  mapLayer?: Map<Id, Id>;
  mapLt?: Map<string, string>;
  mapTextStyle?: Map<Id, Id>;
  mapDimStyle?: Map<Id, Id>;
  mapMLeaderStyle?: Map<Id, Id>;
  mapTableStyle?: Map<Id, Id>;
  mapMLineStyle?: Map<Id, Id>;
  mapAsset?: Map<Id, Id>;
  mapDynamicParams?: Map<Id, Map<Id, Id>>;
}

function cleanEntityForComparison(e: Entity, mappings?: ComparisonMappings): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...e };
  delete copy.id;
  delete copy.owner;
  delete copy.order;

  // Normalizar asociatividad para comparación independiente de IDs locales del bloque
  if (e.type === 'dimension' && Array.isArray(e.assoc)) {
    copy.assoc = e.assoc.map((a) => ({ point: a.point, snap: a.snap }));
  }
  if (e.type === 'hatch' && Array.isArray(e.associative)) {
    copy.associative = e.associative.length > 0 ? e.associative.length : undefined;
  }

  if (mappings) {
    const {
      mapBlock,
      mapLayer,
      mapLt,
      mapTextStyle,
      mapDimStyle,
      mapMLeaderStyle,
      mapTableStyle,
      mapMLineStyle,
      mapAsset,
      mapDynamicParams,
    } = mappings;

    if (mapLayer && typeof copy.layer === 'string' && mapLayer.has(copy.layer as Id)) {
      copy.layer = mapLayer.get(copy.layer as Id);
    }

    if (mapLt && typeof copy.linetype === 'string' && mapLt.has(copy.linetype)) {
      copy.linetype = mapLt.get(copy.linetype);
    }

    if (copy.type === 'text' || copy.type === 'mtext' || copy.type === 'attdef') {
      if (mapTextStyle && typeof copy.style === 'string' && mapTextStyle.has(copy.style as Id)) {
        copy.style = mapTextStyle.get(copy.style as Id);
      }
    } else if (copy.type === 'dimension' || copy.type === 'leader') {
      if (mapDimStyle && typeof copy.style === 'string' && mapDimStyle.has(copy.style as Id)) {
        copy.style = mapDimStyle.get(copy.style as Id);
      }
    } else if (copy.type === 'mleader') {
      if (mapMLeaderStyle && typeof copy.style === 'string' && mapMLeaderStyle.has(copy.style as Id)) {
        copy.style = mapMLeaderStyle.get(copy.style as Id);
      }
      if (copy.content && typeof copy.content === 'object' && (copy.content as any).type === 'block') {
        const content = { ...(copy.content as any) };
        if (mapBlock && mapBlock.has(content.blockId as Id)) {
          content.blockId = mapBlock.get(content.blockId as Id);
        }
        copy.content = content;
      }
    } else if (copy.type === 'table') {
      if (mapTableStyle && typeof copy.style === 'string' && mapTableStyle.has(copy.style as Id)) {
        copy.style = mapTableStyle.get(copy.style as Id);
      }
    } else if (copy.type === 'mline') {
      if (mapMLineStyle && typeof copy.style === 'string' && mapMLineStyle.has(copy.style as Id)) {
        copy.style = mapMLineStyle.get(copy.style as Id);
      }
    }

    if (copy.type === 'dimension' && copy.overrides && typeof copy.overrides === 'object') {
      const overrides = { ...(copy.overrides as Record<string, unknown>) };
      if (mapTextStyle && typeof overrides.textStyle === 'string' && mapTextStyle.has(overrides.textStyle as Id)) {
        overrides.textStyle = mapTextStyle.get(overrides.textStyle as Id);
      }
      copy.overrides = overrides;
    }

    if (copy.type === 'mleader' && copy.overrides && typeof copy.overrides === 'object') {
      const overrides = { ...(copy.overrides as Record<string, unknown>) };
      if (mapTextStyle && typeof overrides.textStyle === 'string' && mapTextStyle.has(overrides.textStyle as Id)) {
        overrides.textStyle = mapTextStyle.get(overrides.textStyle as Id);
      }
      if (mapBlock && typeof overrides.blockId === 'string' && mapBlock.has(overrides.blockId as Id)) {
        overrides.blockId = mapBlock.get(overrides.blockId as Id);
      }
      copy.overrides = overrides;
    }

    if (copy.type === 'viewport') {
      if (mapLayer && Array.isArray(copy.frozenLayers)) {
        copy.frozenLayers = (copy.frozenLayers as Id[]).map((id) => mapLayer.get(id) ?? id);
      }
      if (copy.layerOverrides && typeof copy.layerOverrides === 'object') {
        const overrides: Record<Id, Record<string, unknown>> = {};
        for (const [layerId, value] of Object.entries(copy.layerOverrides as Record<Id, Record<string, unknown>>)) {
          const mappedLayerId = mapLayer?.get(layerId) ?? layerId;
          const mapped = { ...value };
          if (mapLt && typeof mapped.linetype === 'string' && mapLt.has(mapped.linetype)) {
            mapped.linetype = mapLt.get(mapped.linetype);
          }
          overrides[mappedLayerId] = mapped;
        }
        copy.layerOverrides = overrides;
      }
    }

    if (mapBlock) {
      if (copy.type === 'insert' && typeof copy.blockId === 'string') {
        const sourceBlockId = copy.blockId as Id;
        if (copy.dynamic && typeof copy.dynamic === 'object' && mapDynamicParams?.has(sourceBlockId)) {
          const dynamic = structuredClone(copy.dynamic) as { values?: Record<Id, unknown> };
          if (dynamic.values) {
            const paramMap = mapDynamicParams.get(sourceBlockId)!;
            dynamic.values = Object.fromEntries(
              Object.entries(dynamic.values).map(([id, value]) => [paramMap.get(id) ?? id, value]),
            );
          }
          copy.dynamic = dynamic;
        }
        if (mapBlock.has(sourceBlockId)) copy.blockId = mapBlock.get(sourceBlockId);
      }
      if (copy.type === 'array' && typeof copy.sourceBlockId === 'string' && mapBlock.has(copy.sourceBlockId as Id)) {
        copy.sourceBlockId = mapBlock.get(copy.sourceBlockId as Id);
      }
    }

    if (mapAsset && (copy.type === 'image' || copy.type === 'pdfunderlay') && typeof copy.assetId === 'string' && mapAsset.has(copy.assetId as Id)) {
      copy.assetId = mapAsset.get(copy.assetId as Id);
    }
  }

  return copy;
}

function canonicalJson(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((val as Record<string, unknown>)[k])}`);
  return `{${pairs.join(',')}}`;
}

interface NamedRecordLike {
  id: Id;
  name: string;
}

function namedRecordContent(record: NamedRecordLike): string {
  const { id: _id, name: _name, ...content } = record;
  return canonicalJson(content);
}

function belongsToNameFamily(name: string, base: string): boolean {
  const lower = name.toLowerCase();
  const lowerBase = base.toLowerCase();
  if (lower === lowerBase) return true;
  if (!lower.startsWith(`${lowerBase} (`) || !lower.endsWith(')')) return false;
  const suffix = Number(lower.slice(lowerBase.length + 2, -1));
  return Number.isInteger(suffix) && suffix >= 2;
}

function findEquivalentNamedRecord<T extends NamedRecordLike>(records: Iterable<T>, source: T): T | undefined {
  const signature = namedRecordContent(source);
  for (const record of records) {
    if (belongsToNameFamily(record.name, source.name) && namedRecordContent(record) === signature) return record;
  }
  return undefined;
}

function nextNamedRecordName<T extends NamedRecordLike>(records: Iterable<T>, base: string): string {
  const names = new Set([...records].map((record) => record.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let i = 2;
  while (names.has(`${base} (${i})`.toLowerCase())) i++;
  return `${base} (${i})`;
}

function entitiesMatch(
  existingEntities: Entity[],
  pkgEntities: Entity[],
  mappings?: ComparisonMappings,
): boolean {
  if (existingEntities.length !== pkgEntities.length) return false;
  const serialize = (e: Entity, m?: ComparisonMappings) => {
    const cleaned = cleanEntityForComparison(e, m);
    return canonicalJson(cleaned);
  };
  const existingSerialized = existingEntities.map((e) => serialize(e)).sort();
  const pkgSerialized = pkgEntities.map((e) => serialize(e, mappings)).sort();

  for (let i = 0; i < existingSerialized.length; i++) {
    if (existingSerialized[i] !== pkgSerialized[i]) return false;
  }
  return true;
}

/** Construye correspondencia biyectiva entre entidades empaquetadas y existentes según su firma canónica. */
function buildEntityMatchMap(
  existingEntities: Entity[],
  pkgEntities: Entity[],
  mappings?: ComparisonMappings,
): Map<Id, Id> | null {
  const serialize = (e: Entity, m?: ComparisonMappings) => canonicalJson(cleanEntityForComparison(e, m));
  const existingBySig = new Map<string, Id[]>();
  for (const e of existingEntities) {
    const s = serialize(e);
    const list = existingBySig.get(s) ?? [];
    list.push(e.id);
    existingBySig.set(s, list);
  }

  const matchMap = new Map<Id, Id>();
  for (const p of pkgEntities) {
    const s = serialize(p, mappings);
    const list = existingBySig.get(s);
    if (!list || list.length === 0) return null;
    const matchedId = list.shift()!;
    matchMap.set(p.id, matchedId);
  }

  return matchMap;
}

/** Verifica referencias asociativas después de establecer la correspondencia entre entidades. */
function entityAssociationsMatch(
  existingEntities: Entity[],
  pkgEntities: Entity[],
  entityMatchMap: Map<Id, Id>,
): boolean {
  const existingById = new Map(existingEntities.map((entity) => [entity.id, entity]));
  const normalizeDimensionAssoc = (entity: DimensionEntity, isPkg: boolean) =>
    (entity.assoc ?? [])
      .map((assoc) => ({
        ...assoc,
        entityId: isPkg ? (entityMatchMap.get(assoc.entityId) ?? assoc.entityId) : assoc.entityId,
      }))
      .sort((a, b) => `${a.point}:${a.snap}:${a.entityId}`.localeCompare(`${b.point}:${b.snap}:${b.entityId}`));
  const normalizeHatchAssoc = (entity: HatchEntity, isPkg: boolean) =>
    (entity.associative ?? [])
      .map((id) => (isPkg ? (entityMatchMap.get(id) ?? id) : id))
      .sort();

  for (const pkgEntity of pkgEntities) {
    const existingId = entityMatchMap.get(pkgEntity.id);
    const existingEntity = existingId ? existingById.get(existingId) : undefined;
    if (!existingEntity || existingEntity.type !== pkgEntity.type) return false;
    if (pkgEntity.type === 'dimension' && existingEntity.type === 'dimension') {
      if (canonicalJson(normalizeDimensionAssoc(existingEntity, false)) !== canonicalJson(normalizeDimensionAssoc(pkgEntity, true))) {
        return false;
      }
    }
    if (pkgEntity.type === 'hatch' && existingEntity.type === 'hatch') {
      if (canonicalJson(normalizeHatchAssoc(existingEntity, false)) !== canonicalJson(normalizeHatchAssoc(pkgEntity, true))) {
        return false;
      }
    }
  }

  return true;
}

/** Construye un mapa biyectivo de parámetros dinámicos por identidad semántica local (nombre + tipo). */
function buildDynamicParamMap(
  existingDyn: DynamicBlockDefinition,
  pkgDyn: DynamicBlockDefinition,
): Map<Id, Id> | null {
  const existingParams = existingDyn.parameters ?? [];
  const pkgParams = pkgDyn.parameters ?? [];
  if (existingParams.length !== pkgParams.length) return null;

  const used = new Set<Id>();
  const paramMap = new Map<Id, Id>();
  for (const p of pkgParams) {
    const match = existingParams.find((ep) => !used.has(ep.id) && ep.name === p.name && ep.type === p.type);
    if (!match) return null;
    used.add(match.id);
    paramMap.set(p.id, match.id);
  }
  return paramMap;
}

/** Compara si dos definiciones dinámicas de bloque son funcionalmente equivalentes. */
function dynamicDefsMatch(
  existingDyn: DynamicBlockDefinition,
  pkgDyn: DynamicBlockDefinition,
  entityMatchMap: Map<Id, Id>,
): boolean {
  // 1. Mapear parámetros por tipo y nombre
  const existingParams = existingDyn.parameters ?? [];
  const pkgParams = pkgDyn.parameters ?? [];
  const paramMap = buildDynamicParamMap(existingDyn, pkgDyn);
  if (!paramMap) return false;

  const normParams = (params: DynParam[], isPkg: boolean) => {
    return params
      .map((p) => {
        const copy = structuredClone(p) as unknown as Record<string, unknown>;
        if (isPkg && paramMap.has(p.id)) {
          copy.id = paramMap.get(p.id);
        }
        if (copy.type === 'visibility' && Array.isArray((copy as any).states)) {
          (copy as any).states = ((copy as any).states as { name: string; visible: Id[] }[]).map((st) => ({
            name: st.name,
            visible: (st.visible ?? []).map((id) => (isPkg ? (entityMatchMap.get(id) ?? id) : id)).sort(),
          }));
        }
        return canonicalJson(copy);
      })
      .sort();
  };

  const existingNormParams = normParams(existingParams, false);
  const pkgNormParams = normParams(pkgParams, true);
  for (let i = 0; i < existingNormParams.length; i++) {
    if (existingNormParams[i] !== pkgNormParams[i]) return false;
  }

  // 2. Normalizar acciones
  const existingActions = existingDyn.actions ?? [];
  const pkgActions = pkgDyn.actions ?? [];
  if (existingActions.length !== pkgActions.length) return false;

  const normActions = (actions: DynAction[], isPkg: boolean) => {
    return actions
      .map((act) => {
        const copy = structuredClone(act) as unknown as Record<string, unknown>;
        delete copy.id;
        if (isPkg && typeof copy.paramId === 'string' && paramMap.has(copy.paramId as Id)) {
          copy.paramId = paramMap.get(copy.paramId as Id);
        }
        if (Array.isArray(copy.selection)) {
          copy.selection = (copy.selection as Id[]).map((id) => (isPkg ? (entityMatchMap.get(id) ?? id) : id)).sort();
        }
        if (copy.type === 'polarstretch' && Array.isArray((copy as any).rotateOnly)) {
          (copy as any).rotateOnly = ((copy as any).rotateOnly as Id[])
            .map((id) => (isPkg ? (entityMatchMap.get(id) ?? id) : id))
            .sort();
        }
        return canonicalJson(copy);
      })
      .sort();
  };

  const existingNormActions = normActions(existingActions, false);
  const pkgNormActions = normActions(pkgActions, true);
  for (let i = 0; i < existingNormActions.length; i++) {
    if (existingNormActions[i] !== pkgNormActions[i]) return false;
  }

  // 3. Normalizar restricciones (constraints)
  const existingConstraints = existingDyn.constraints ?? [];
  const pkgConstraints = pkgDyn.constraints ?? [];
  if (existingConstraints.length !== pkgConstraints.length) return false;

  const normConstraints = (constraints: BlockConstraint[], isPkg: boolean) => {
    return constraints
      .map((c) => {
        const copy = structuredClone(c) as unknown as Record<string, unknown>;
        delete copy.id;
        if (Array.isArray(copy.refs)) {
          copy.refs = (copy.refs as { entityId: Id; part: string }[])
            .map((r) => ({
              entityId: isPkg ? (entityMatchMap.get(r.entityId) ?? r.entityId) : r.entityId,
              part: r.part,
            }))
            .sort((a, b) => `${a.entityId}:${a.part}`.localeCompare(`${b.entityId}:${b.part}`));
        }
        return canonicalJson(copy);
      })
      .sort();
  };

  const existingNormConstraints = normConstraints(existingConstraints, false);
  const pkgNormConstraints = normConstraints(pkgConstraints, true);
  for (let i = 0; i < existingNormConstraints.length; i++) {
    if (existingNormConstraints[i] !== pkgNormConstraints[i]) return false;
  }

  // 4. Normalizar tablas de consulta (lookups)
  const existingLookups = existingDyn.lookups ?? [];
  const pkgLookups = pkgDyn.lookups ?? [];
  if (existingLookups.length !== pkgLookups.length) return false;

  const normLookups = (lookups: LookupTable[], isPkg: boolean) => {
    return lookups
      .map((l) => {
        const copy = structuredClone(l) as unknown as Record<string, unknown>;
        delete copy.id;
        if (isPkg && Array.isArray(copy.inputs)) {
          copy.inputs = (copy.inputs as Id[]).map((id) => paramMap.get(id) ?? id);
        }
        return canonicalJson(copy);
      })
      .sort();
  };

  const existingNormLookups = normLookups(existingLookups, false);
  const pkgNormLookups = normLookups(pkgLookups, true);
  for (let i = 0; i < existingNormLookups.length; i++) {
    if (existingNormLookups[i] !== pkgNormLookups[i]) return false;
  }

  // 5. Variables de usuario
  const existingVars = existingDyn.variables ?? [];
  const pkgVars = pkgDyn.variables ?? [];
  if (existingVars.length !== pkgVars.length) return false;
  const existingNormVars = existingVars.map((v) => canonicalJson(v)).sort();
  const pkgNormVars = pkgVars.map((v) => canonicalJson(v)).sort();
  for (let i = 0; i < existingNormVars.length; i++) {
    if (existingNormVars[i] !== pkgNormVars[i]) return false;
  }

  // 6. Orden visible de propiedades personalizadas
  const existingPropertyOrder = existingDyn.propertyOrder ?? [];
  const pkgPropertyOrder = (pkgDyn.propertyOrder ?? []).map((id) => paramMap.get(id) ?? id);
  if (canonicalJson(existingPropertyOrder) !== canonicalJson(pkgPropertyOrder)) return false;

  return true;
}

/** Comprueba si una definición de bloque existente es geométricamente y paramétricamente equivalente a una empaquetada. */
function isBlockEquivalent(
  doc: CadDocument,
  existingBlockId: Id,
  pkgBlock: BlockRecord,
  pkgBlockEntities: Entity[],
  mappings?: ComparisonMappings,
): boolean {
  const existing = doc.data.blocks.get(existingBlockId);
  if (!existing) return false;
  if (existing.kind !== pkgBlock.kind) return false;
  if (existing.basePoint.x !== pkgBlock.basePoint.x || existing.basePoint.y !== pkgBlock.basePoint.y) return false;
  if (existing.units !== pkgBlock.units) return false;
  if (Boolean(existing.annotative) !== Boolean(pkgBlock.annotative)) return false;
  if (Boolean(existing.scaleUniformly) !== Boolean(pkgBlock.scaleUniformly)) return false;
  if (Boolean(existing.explodable) !== Boolean(pkgBlock.explodable)) return false;
  if (Boolean(existing.dynamic) !== Boolean(pkgBlock.dynamic)) return false;

  const existingEntities = doc.entitiesOf(existingBlockId);
  const pkgEntities = pkgBlockEntities.filter((e) => e.owner === pkgBlock.id);
  if (!entitiesMatch(existingEntities, pkgEntities, mappings)) return false;

  const entityMatchMap = buildEntityMatchMap(existingEntities, pkgEntities, mappings);
  if (!entityMatchMap || !entityAssociationsMatch(existingEntities, pkgEntities, entityMatchMap)) return false;

  if (existing.dynamic && pkgBlock.dynamic) {
    return dynamicDefsMatch(existing.dynamic, pkgBlock.dynamic, entityMatchMap);
  }

  return true;
}

/** Ordena bloques de forma topológica para que las dependencias anidadas se procesen antes de los bloques contenedores. */
function sortBlocksTopologically(blocks: BlockRecord[], blockEntities: Entity[]): BlockRecord[] {
  const deps = new Map<Id, Set<Id>>();
  for (const b of blocks) {
    deps.set(b.id, new Set());
  }
  for (const e of blockEntities) {
    const parent = deps.get(e.owner);
    if (!parent) continue;
    if (e.type === 'insert' && deps.has(e.blockId)) {
      parent.add(e.blockId);
    } else if (e.type === 'array' && deps.has(e.sourceBlockId)) {
      parent.add(e.sourceBlockId);
    } else if (e.type === 'mleader' && e.content.type === 'block' && deps.has(e.content.blockId)) {
      parent.add(e.content.blockId);
    }
  }

  const result: BlockRecord[] = [];
  const visited = new Set<Id>();
  const visiting = new Set<Id>();

  const visit = (b: BlockRecord) => {
    if (visited.has(b.id)) return;
    if (visiting.has(b.id)) return;
    visiting.add(b.id);
    const bDeps = deps.get(b.id);
    if (bDeps) {
      for (const depId of bDeps) {
        const depBlock = blocks.find((x) => x.id === depId);
        if (depBlock) visit(depBlock);
      }
    }
    visiting.delete(b.id);
    visited.add(b.id);
    result.push(b);
  };

  for (const b of blocks) {
    visit(b);
  }
  return result;
}


function remapEntityOverrides(
  entity: Entity,
  mapTextStyle: Map<Id, Id>,
  mapBlock: Map<Id, Id>,
  doc: CadDocument,
) {
  if (entity.type === 'dimension' && entity.overrides.textStyle) {
    const textStyle = mapTextStyle.get(entity.overrides.textStyle)
      ?? (doc.data.textStyles.has(entity.overrides.textStyle) ? entity.overrides.textStyle : undefined);
    const overrides = { ...entity.overrides };
    if (textStyle) overrides.textStyle = textStyle;
    else delete overrides.textStyle;
    entity.overrides = overrides;
  }
  if (entity.type === 'mleader' && entity.overrides) {
    const overrides = { ...entity.overrides };
    if (overrides.textStyle) {
      const textStyle = mapTextStyle.get(overrides.textStyle)
        ?? (doc.data.textStyles.has(overrides.textStyle) ? overrides.textStyle : undefined);
      if (textStyle) overrides.textStyle = textStyle;
      else delete overrides.textStyle;
    }
    if (overrides.blockId) {
      const blockId = mapBlock.get(overrides.blockId)
        ?? (doc.data.blocks.has(overrides.blockId) ? overrides.blockId : undefined);
      if (blockId) overrides.blockId = blockId;
      else delete overrides.blockId;
    }
    entity.overrides = overrides;
  }
}

function remapViewportReferences(
  viewport: ViewportEntity,
  mapLayer: Map<Id, Id>,
  mapLt: Map<string, string>,
  doc: CadDocument,
) {
  viewport.frozenLayers = viewport.frozenLayers
    .map((id) => mapLayer.get(id) ?? (doc.data.layers.has(id) ? id : null))
    .filter((id): id is Id => id !== null);

  const overrides: ViewportEntity['layerOverrides'] = {};
  for (const [sourceLayerId, value] of Object.entries(viewport.layerOverrides)) {
    const layerId = mapLayer.get(sourceLayerId) ?? (doc.data.layers.has(sourceLayerId) ? sourceLayerId : undefined);
    if (!layerId) continue;
    const mapped = { ...value };
    if (mapped.linetype) {
      const linetype = mapLt.get(mapped.linetype)
        ?? (doc.data.linetypes.has(mapped.linetype) ? mapped.linetype : undefined);
      if (linetype) mapped.linetype = linetype;
      else delete mapped.linetype;
    }
    overrides[layerId] = mapped;
  }
  viewport.layerOverrides = overrides;
}

/**
 * Pega un paquete de portapapeles en el documento destino dentro del espacio/propietario indicado,
 * resolviendo colisiones, remapeando identificadores y conservando dependencias de bloques,
 * estilos, capas y recursos binarios.
 */
export function pasteClipboardPackage(
  doc: CadDocument,
  pkgInput: ClipboardPackage | LegacyClipboardPackage,
  owner: Id,
  targetPoint: Vec2,
  existingTx?: Transaction,
): PasteClipboardResult {
  const validPkg = validateClipboardPackage(pkgInput);
  const modelCtx = new ModelContext(doc);

  const pkg = validPkg as ClipboardPackage;

  // Si no hay base precalculada (paquetes v1), calcularla al vuelo
  let baseX = pkg.base?.x;
  let baseY = pkg.base?.y;
  if (baseX === undefined || baseY === undefined || !Number.isFinite(baseX) || !Number.isFinite(baseY)) {
    if (pkg.entities.length > 0) {
      const bboxes = pkg.entities.map((e) => kindOf(e).bbox(e, modelCtx));
      const b = bboxes.reduce(
        (acc, cur) => ({
          minX: Math.min(acc.minX, cur.minX),
          minY: Math.min(acc.minY, cur.minY),
        }),
        { minX: Infinity, minY: Infinity },
      );
      baseX = Number.isFinite(b.minX) ? b.minX : 0;
      baseY = Number.isFinite(b.minY) ? b.minY : 0;
    } else {
      baseX = 0;
      baseY = 0;
    }
  }

  if (!Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y)) {
    throw new ClipboardError({
      es: 'El punto de inserción contiene coordenadas no finitas.',
      en: 'Insertion point contains non-finite coordinates.',
    });
  }

  const dx = targetPoint.x - baseX;
  const dy = targetPoint.y - baseY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    throw new ClipboardError({
      es: 'El desplazamiento de pegado excede el rango numérico admitido.',
      en: 'Paste offset exceeds the supported numeric range.',
    });
  }
  const tMat = translation(dx, dy);
  try {
    for (const entity of pkg.entities) {
      const moved = kindOf(entity).transform(entity, tMat, modelCtx);
      if (moved) assertFiniteValues(moved);
    }
  } catch (error) {
    if (error instanceof InputValidationError) {
      throw new ClipboardError({
        es: 'El pegado produciría valores numéricos no finitos.',
        en: 'Pasting would produce non-finite numeric values.',
      });
    }
    throw error;
  }

  const warnings: string[] = [];
  const insertedIds: Id[] = [];

  const executePaste = (tx: Transaction): PasteClipboardResult => {
    const mapLt = new Map<string, string>();
    const mapLayer = new Map<Id, Id>();
    const mapTextStyle = new Map<Id, Id>();
    const mapDimStyle = new Map<Id, Id>();
    const mapMLeaderStyle = new Map<Id, Id>();
    const mapTableStyle = new Map<Id, Id>();
    const mapMLineStyle = new Map<Id, Id>();
    const mapAsset = new Map<Id, Id>();
    const mapBlock = new Map<Id, Id>();
    const dynamicParamMaps = new Map<Id, Map<Id, Id>>();
    const reusedBlocks = new Set<Id>();

    // 1. Tipos de línea
    for (const lt of pkg.linetypes ?? []) {
      const equivalent = findEquivalentNamedRecord(doc.data.linetypes.values(), lt);
      if (equivalent) {
        mapLt.set(lt.id, equivalent.id);
      } else {
        const id = newId('lt');
        const name = nextNamedRecordName(doc.data.linetypes.values(), lt.name);
        tx.add('linetypes', { ...lt, id, name });
        mapLt.set(lt.id, id);
      }
    }

    // 2. Estilos de texto
    for (const ts of pkg.textStyles ?? []) {
      const equivalent = findEquivalentNamedRecord(doc.data.textStyles.values(), ts);
      if (equivalent) {
        mapTextStyle.set(ts.id, equivalent.id);
      } else {
        const id = newId('ts');
        const name = nextNamedRecordName(doc.data.textStyles.values(), ts.name);
        tx.add('textStyles', { ...ts, id, name });
        mapTextStyle.set(ts.id, id);
      }
    }

    // 3. Estilos de cota
    for (const ds of pkg.dimStyles ?? []) {
      const textStyle = mapTextStyle.get(ds.textStyle)
        ?? (doc.data.textStyles.has(ds.textStyle) ? ds.textStyle : doc.settings.currentTextStyle);
      const candidate = { ...ds, textStyle };
      const equivalent = findEquivalentNamedRecord(doc.data.dimStyles.values(), candidate);
      if (equivalent) {
        mapDimStyle.set(ds.id, equivalent.id);
      } else {
        const id = newId('ds');
        const name = nextNamedRecordName(doc.data.dimStyles.values(), ds.name);
        tx.add('dimStyles', { ...candidate, id, name });
        mapDimStyle.set(ds.id, id);
      }
    }

    // 4. Estilos de directriz múltiple. blockId se completa después de resolver bloques.
    const newlyAddedMLeaderStyles = new Set<Id>();
    for (const ms of pkg.mleaderStyles ?? []) {
      const textStyle = mapTextStyle.get(ms.textStyle)
        ?? (doc.data.textStyles.has(ms.textStyle) ? ms.textStyle : doc.settings.currentTextStyle);
      const { blockId: sourceBlockId, ...restMs } = ms;
      const candidate = { ...restMs, textStyle };
      const equivalent = sourceBlockId
        ? undefined
        : findEquivalentNamedRecord(
            [...doc.data.mleaderStyles.values()].filter((style) => !style.blockId),
            candidate,
          );
      if (equivalent) {
        mapMLeaderStyle.set(ms.id, equivalent.id);
      } else {
        const id = newId('mls');
        const name = nextNamedRecordName(doc.data.mleaderStyles.values(), ms.name);
        tx.add('mleaderStyles', { ...candidate, id, name });
        mapMLeaderStyle.set(ms.id, id);
        newlyAddedMLeaderStyles.add(id);
      }
    }

    // 5. Estilos de tabla
    for (const ts of pkg.tableStyles ?? []) {
      const textStyle = mapTextStyle.get(ts.textStyle)
        ?? (doc.data.textStyles.has(ts.textStyle) ? ts.textStyle : doc.settings.currentTextStyle);
      const candidate = { ...ts, textStyle };
      const equivalent = findEquivalentNamedRecord(doc.data.tableStyles.values(), candidate);
      if (equivalent) {
        mapTableStyle.set(ts.id, equivalent.id);
      } else {
        const id = newId('tbs');
        const name = nextNamedRecordName(doc.data.tableStyles.values(), ts.name);
        tx.add('tableStyles', { ...candidate, id, name });
        mapTableStyle.set(ts.id, id);
      }
    }

    // 6. Estilos de multilínea
    for (const ms of pkg.mlineStyles ?? []) {
      const elements = ms.elements?.map((el) => {
        if (el.linetype && el.linetype !== 'ByLayer' && el.linetype !== 'ByBlock') {
          const remappedLt = mapLt.get(el.linetype) ?? (doc.data.linetypes.has(el.linetype) ? el.linetype : 'ByLayer');
          return { ...el, linetype: remappedLt };
        }
        return { ...el };
      }) ?? [];
      const candidate = { ...ms, elements };
      const equivalent = findEquivalentNamedRecord(doc.data.mlineStyles.values(), candidate);
      if (equivalent) {
        mapMLineStyle.set(ms.id, equivalent.id);
      } else {
        const id = newId('mlns');
        const name = nextNamedRecordName(doc.data.mlineStyles.values(), ms.name);
        tx.add('mlineStyles', { ...candidate, id, name });
        mapMLineStyle.set(ms.id, id);
      }
    }

    // 7. Capas
    for (const l of pkg.layers ?? []) {
      if (l.id === LAYER0_ID || l.name === '0') {
        mapLayer.set(l.id, LAYER0_ID);
        continue;
      }
      const linetype = mapLt.get(l.linetype) ?? (doc.data.linetypes.has(l.linetype) ? l.linetype : 'ByLayer');
      const candidate = { ...l, linetype };
      const equivalent = findEquivalentNamedRecord(doc.data.layers.values(), candidate);
      if (equivalent) {
        mapLayer.set(l.id, equivalent.id);
      } else {
        const id = newId('layer');
        const name = nextNamedRecordName(doc.data.layers.values(), l.name);
        tx.add('layers', { ...candidate, id, name });
        mapLayer.set(l.id, id);
      }
    }

    // 8. Recursos binarios (assets)
    for (const a of pkg.assets ?? []) {
      const existing = [...doc.data.assets.values()].find((x) => {
        if (a.dataUrl) return x.dataUrl === a.dataUrl;
        if (a.path) return x.path === a.path && x.mime === a.mime && x.size === a.size;
        return !x.dataUrl && !x.path && x.name === a.name && x.mime === a.mime && x.size === a.size;
      });
      if (existing) {
        mapAsset.set(a.id, existing.id);
      } else {
        const id = newId('asset');
        tx.add('assets', { ...a, id });
        mapAsset.set(a.id, id);
      }
    }

    // 9. Definiciones de bloque
    const allPkgBlockEntities = pkg.blockEntities ?? [];
    const orderedBlocks = sortBlocksTopologically(pkg.blocks ?? [], allPkgBlockEntities);
    const blockEntityMap = new Map<Id, Id>();
    for (const be of allPkgBlockEntities) {
      blockEntityMap.set(be.id, newId());
    }

    const compMappings: ComparisonMappings = {
      mapBlock,
      mapLayer,
      mapLt,
      mapTextStyle,
      mapDimStyle,
      mapMLeaderStyle,
      mapTableStyle,
      mapMLineStyle,
      mapAsset,
      mapDynamicParams: dynamicParamMaps,
    };

    for (const b of orderedBlocks) {
      const equivalent = [...doc.data.blocks.values()].find(
        (candidate) =>
          belongsToNameFamily(candidate.name, b.name)
          && isBlockEquivalent(doc, candidate.id, b, allPkgBlockEntities, compMappings),
      );
      if (equivalent) {
        // Bloque equivalente ya existente: reutilizar, incluso si ya fue renombrado por una colisión previa.
        mapBlock.set(b.id, equivalent.id);
        if (b.dynamic && equivalent.dynamic) {
          const paramMap = buildDynamicParamMap(equivalent.dynamic, b.dynamic);
          if (paramMap) dynamicParamMaps.set(b.id, paramMap);
        }
        reusedBlocks.add(b.id);
      } else {
        const name = nextNamedRecordName(doc.data.blocks.values(), b.name);
        const id = newId('blk');
        mapBlock.set(b.id, id);

        const dynamicDef = b.dynamic ? remapDynamicBlockDef(b.dynamic, blockEntityMap) : undefined;
        if (b.dynamic) {
          dynamicParamMaps.set(b.id, new Map(b.dynamic.parameters.map((param) => [param.id, param.id])));
        }
        tx.add('blocks', { ...structuredClone(b), id, name, dynamic: dynamicDef, revision: 1 });
      }
    }

    // Remapear blockId de mleaderStyles recién agregados tras conocer el mapa de bloques
    for (const ms of pkg.mleaderStyles ?? []) {
      if (ms.blockId) {
        const destMlsId = mapMLeaderStyle.get(ms.id);
        if (destMlsId && newlyAddedMLeaderStyles.has(destMlsId)) {
          const remappedBlockId = mapBlock.get(ms.blockId) ?? (doc.data.blocks.has(ms.blockId) ? ms.blockId : undefined);
          if (remappedBlockId) {
            tx.update('mleaderStyles', destMlsId, { blockId: remappedBlockId });
          }
        }
      }
    }

    // 10. Entidades internas de los bloques (sólo para bloques nuevos no reutilizados)
    for (const be of allPkgBlockEntities) {
      if (reusedBlocks.has(be.owner)) continue;

      const newOwner = mapBlock.get(be.owner);
      if (!newOwner) continue;

      const clone = structuredClone(be);
      clone.id = blockEntityMap.get(be.id)!;
      clone.owner = newOwner;
      clone.layer = mapLayer.get(be.layer) ?? (doc.data.layers.has(be.layer) ? be.layer : LAYER0_ID);

      if (clone.linetype !== 'ByLayer' && clone.linetype !== 'ByBlock') {
        clone.linetype = mapLt.get(clone.linetype) ?? (doc.data.linetypes.has(clone.linetype) ? clone.linetype : 'ByLayer');
      }

      if (clone.type === 'text' || clone.type === 'mtext' || clone.type === 'attdef') {
        clone.style = mapTextStyle.get(clone.style) ?? (doc.data.textStyles.has(clone.style) ? clone.style : doc.settings.currentTextStyle);
      } else if (clone.type === 'dimension' || clone.type === 'leader') {
        clone.style = mapDimStyle.get(clone.style) ?? (doc.data.dimStyles.has(clone.style) ? clone.style : doc.settings.currentDimStyle);
      } else if (clone.type === 'mleader') {
        clone.style = mapMLeaderStyle.get(clone.style) ?? (doc.data.mleaderStyles.has(clone.style) ? clone.style : doc.settings.currentMLeaderStyle);
        if (clone.content.type === 'block') {
          clone.content.blockId = mapBlock.get(clone.content.blockId) ?? clone.content.blockId;
        }
      } else if (clone.type === 'table') {
        clone.style = mapTableStyle.get(clone.style) ?? (doc.data.tableStyles.has(clone.style) ? clone.style : doc.settings.currentTableStyle);
      } else if (clone.type === 'mline') {
        clone.style = mapMLineStyle.get(clone.style) ?? (doc.data.mlineStyles.has(clone.style) ? clone.style : doc.settings.currentMLineStyle);
      } else if (clone.type === 'insert') {
        const sourceBlockId = clone.blockId;
        remapDynamicInstanceState(clone, dynamicParamMaps.get(sourceBlockId));
        clone.blockId = mapBlock.get(sourceBlockId) ?? sourceBlockId;
      } else if (clone.type === 'array') {
        clone.sourceBlockId = mapBlock.get(clone.sourceBlockId) ?? clone.sourceBlockId;
      } else if (clone.type === 'image' || clone.type === 'pdfunderlay') {
        clone.assetId = mapAsset.get(clone.assetId) ?? clone.assetId;
      }

      remapEntityOverrides(clone, mapTextStyle, mapBlock, doc);
      if (clone.type === 'viewport') remapViewportReferences(clone, mapLayer, mapLt, doc);

      // Asociatividad de cotas dentro del bloque
      if (clone.type === 'dimension' && clone.assoc) {
        const mappedAssoc = clone.assoc
          .map((a) => {
            if (blockEntityMap.has(a.entityId)) {
              return { ...a, entityId: blockEntityMap.get(a.entityId)! };
            }
            return null;
          })
          .filter(Boolean);
        if (mappedAssoc.length > 0) {
          clone.assoc = mappedAssoc as DimensionEntity['assoc'];
        } else {
          delete (clone as Partial<DimensionEntity>).assoc;
        }
      }

      if (clone.type === 'leader' && clone.annotation) {
        clone.annotation = blockEntityMap.get(clone.annotation);
      }

      // Asociatividad de sombreados (hatch) dentro del bloque
      if (clone.type === 'hatch' && clone.associative) {
        const mappedAssoc = clone.associative.map((id) => blockEntityMap.get(id)).filter(Boolean) as Id[];
        if (mappedAssoc.length > 0) {
          clone.associative = mappedAssoc;
        } else {
          delete (clone as Partial<HatchEntity>).associative;
        }
      }

      const { order: _o, ...rest } = clone;
      tx.addEntity(rest as never);
    }

    // 11. Entidades de nivel superior
    const topEntityMap = new Map<Id, Id>();
    for (const e of pkg.entities) {
      topEntityMap.set(e.id, newId());
    }

    for (const e of pkg.entities) {
      const moved = kindOf(e).transform(e, tMat, modelCtx) as Entity | null;
      if (!moved) {
        warnings.push(`No se pudo transformar la entidad ${e.type} (${e.id}).`);
        continue;
      }
      const clone = structuredClone(moved);
      const newIdVal = topEntityMap.get(e.id)!;
      clone.id = newIdVal;
      clone.owner = owner;

      // Capa
      if (mapLayer.has(e.layer)) {
        clone.layer = mapLayer.get(e.layer)!;
      } else if (doc.data.layers.has(e.layer)) {
        clone.layer = e.layer;
      } else {
        clone.layer = doc.settings.currentLayer;
      }

      // Tipo de línea
      if (clone.linetype !== 'ByLayer' && clone.linetype !== 'ByBlock') {
        clone.linetype = mapLt.get(clone.linetype) ?? (doc.data.linetypes.has(clone.linetype) ? clone.linetype : 'ByLayer');
      }

      // Estilos
      if (clone.type === 'text' || clone.type === 'mtext' || clone.type === 'attdef') {
        clone.style = mapTextStyle.get(clone.style) ?? (doc.data.textStyles.has(clone.style) ? clone.style : doc.settings.currentTextStyle);
      } else if (clone.type === 'dimension' || clone.type === 'leader') {
        clone.style = mapDimStyle.get(clone.style) ?? (doc.data.dimStyles.has(clone.style) ? clone.style : doc.settings.currentDimStyle);
      } else if (clone.type === 'mleader') {
        clone.style = mapMLeaderStyle.get(clone.style) ?? (doc.data.mleaderStyles.has(clone.style) ? clone.style : doc.settings.currentMLeaderStyle);
        if (clone.content.type === 'block') {
          clone.content.blockId = mapBlock.get(clone.content.blockId) ?? clone.content.blockId;
        }
      } else if (clone.type === 'table') {
        clone.style = mapTableStyle.get(clone.style) ?? (doc.data.tableStyles.has(clone.style) ? clone.style : doc.settings.currentTableStyle);
      } else if (clone.type === 'mline') {
        clone.style = mapMLineStyle.get(clone.style) ?? (doc.data.mlineStyles.has(clone.style) ? clone.style : doc.settings.currentMLineStyle);
      } else if (clone.type === 'insert') {
        const sourceBlockId = clone.blockId;
        remapDynamicInstanceState(clone, dynamicParamMaps.get(sourceBlockId));
        clone.blockId = mapBlock.get(sourceBlockId) ?? sourceBlockId;
        if (!doc.data.blocks.has(clone.blockId)) {
          warnings.push(`Definición de bloque no encontrada para inserción: ${clone.blockId}`);
        }
      } else if (clone.type === 'array') {
        clone.sourceBlockId = mapBlock.get(clone.sourceBlockId) ?? clone.sourceBlockId;
        if (!doc.data.blocks.has(clone.sourceBlockId)) {
          warnings.push(`Bloque fuente de matriz no encontrado: ${clone.sourceBlockId}`);
        }
      } else if (clone.type === 'image' || clone.type === 'pdfunderlay') {
        clone.assetId = mapAsset.get(clone.assetId) ?? clone.assetId;
        if (!doc.data.assets.has(clone.assetId)) {
          warnings.push(`Recurso de imagen/PDF no encontrado: ${clone.assetId}`);
        }
      }

      remapEntityOverrides(clone, mapTextStyle, mapBlock, doc);
      if (clone.type === 'viewport') remapViewportReferences(clone, mapLayer, mapLt, doc);

      // Asociatividad de cotas
      if (clone.type === 'dimension' && clone.assoc) {
        const mappedAssoc = clone.assoc
          .map((a) => {
            if (topEntityMap.has(a.entityId)) {
              return { ...a, entityId: topEntityMap.get(a.entityId)! };
            }
            return null;
          })
          .filter(Boolean);
        if (mappedAssoc.length > 0) {
          clone.assoc = mappedAssoc as DimensionEntity['assoc'];
        } else {
          delete (clone as Partial<DimensionEntity>).assoc;
        }
      }

      if (clone.type === 'leader' && clone.annotation) {
        clone.annotation = topEntityMap.get(clone.annotation);
      }

      // Asociatividad de sombreados (hatch)
      if (clone.type === 'hatch' && clone.associative) {
        const mappedAssoc = clone.associative.map((id) => topEntityMap.get(id)).filter(Boolean) as Id[];
        if (mappedAssoc.length > 0) {
          clone.associative = mappedAssoc;
        } else {
          delete (clone as Partial<HatchEntity>).associative;
        }
      }

      const { order: _o, ...rest } = clone;
      tx.addEntity(rest as never);
      insertedIds.push(newIdVal);
    }

    return { insertedIds, warnings };
  };

  if (existingTx) {
    return executePaste(existingTx);
  }
  return doc.transact('PASTECLIP', executePaste);
}
