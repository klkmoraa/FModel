import type { CadDocument, Transaction } from '../document/document';
import { LAYER0_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type {
  AssetRecord,
  BlockRecord,
  DimensionEntity,
  DimStyleRecord,
  Entity,
  HatchEntity,
  Id,
  InsertEntity,
  LayerRecord,
  LinetypeRecord,
  MLeaderEntity,
  MLeaderStyleRecord,
  MLineEntity,
  MLineStyleRecord,
  TableEntity,
  TableStyleRecord,
  TextStyleRecord,
} from '../document/types';
import { translation } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { ModelContext } from '../model/context';
import { kindOf } from '../model/registry';
import { INPUT_LIMITS } from './limits';
import { assertFiniteValues, assertPointLimits } from './validation';

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
    } else if (e.type === 'mleader') {
      mleaderStyles.add(e.style);
    } else if (e.type === 'table') {
      tableStyles.add(e.style);
    } else if (e.type === 'mline') {
      mlineStyles.add(e.style);
    }
    if (e.type === 'image' || e.type === 'pdfunderlay') {
      assets.add(e.assetId);
    }
    if (e.type === 'insert') {
      visitBlock(e.blockId);
    } else if (e.type === 'array') {
      visitBlock(e.sourceBlockId);
    } else if (e.type === 'mleader' && e.content.type === 'block') {
      visitBlock(e.content.blockId);
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

  assertFiniteValues(raw);
  assertPointLimits(raw);

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
    if (obj.blocks && Array.isArray(obj.blocks) && obj.blocks.length > INPUT_LIMITS.maxBlocks) {
      throw new ClipboardError({
        es: 'El portapapeles contiene demasiados bloques.',
        en: 'Clipboard contains too many blocks.',
      });
    }
    if (obj.assets && Array.isArray(obj.assets) && obj.assets.length > INPUT_LIMITS.maxAssets) {
      throw new ClipboardError({
        es: 'El portapapeles contiene demasiados recursos.',
        en: 'Clipboard contains too many assets.',
      });
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
  return obj as unknown as LegacyClipboardPackage;
}

/** Parsea y valida texto JSON de portapapeles. */
export function parseClipboardPackage(text: string): ClipboardPackage | LegacyClipboardPackage {
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

/** Comprueba si una definición de bloque existente es geométricamente equivalente a una empaquetada. */
function isBlockEquivalent(
  doc: CadDocument,
  existingBlockId: Id,
  pkgBlock: BlockRecord,
  pkgBlockEntities: Entity[],
): boolean {
  const existing = doc.data.blocks.get(existingBlockId);
  if (!existing) return false;
  if (existing.kind !== pkgBlock.kind) return false;
  if (existing.basePoint.x !== pkgBlock.basePoint.x || existing.basePoint.y !== pkgBlock.basePoint.y) return false;

  const existingEntities = doc.entitiesOf(existingBlockId);
  const pkgEntities = pkgBlockEntities.filter((e) => e.owner === pkgBlock.id);
  if (existingEntities.length !== pkgEntities.length) return false;

  // Comparar tipos de entidades
  const existingTypes = existingEntities.map((e) => e.type).sort();
  const pkgTypes = pkgEntities.map((e) => e.type).sort();
  for (let i = 0; i < existingTypes.length; i++) {
    if (existingTypes[i] !== pkgTypes[i]) return false;
  }
  return true;
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

  const isV2 = validPkg.version === 2;
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

  const dx = targetPoint.x - baseX;
  const dy = targetPoint.y - baseY;
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
    const reusedBlocks = new Set<Id>();

    // 1. Tipos de línea
    for (const lt of pkg.linetypes ?? []) {
      const existing = doc.findByName('linetypes', lt.name);
      if (existing) {
        mapLt.set(lt.id, existing.id);
      } else {
        const id = newId('lt');
        tx.add('linetypes', { ...lt, id });
        mapLt.set(lt.id, id);
      }
    }

    // 2. Estilos de texto
    for (const ts of pkg.textStyles ?? []) {
      const existing = doc.findByName('textStyles', ts.name);
      if (existing) {
        mapTextStyle.set(ts.id, existing.id);
      } else {
        const id = newId('ts');
        tx.add('textStyles', { ...ts, id });
        mapTextStyle.set(ts.id, id);
      }
    }

    // 3. Estilos de cota
    for (const ds of pkg.dimStyles ?? []) {
      const existing = doc.findByName('dimStyles', ds.name);
      if (existing) {
        mapDimStyle.set(ds.id, existing.id);
      } else {
        const id = newId('ds');
        const textStyle = mapTextStyle.get(ds.textStyle) ?? ds.textStyle;
        tx.add('dimStyles', { ...ds, id, textStyle });
        mapDimStyle.set(ds.id, id);
      }
    }

    // 4. Estilos de directriz múltiple
    for (const ms of pkg.mleaderStyles ?? []) {
      const existing = doc.findByName('mleaderStyles', ms.name);
      if (existing) {
        mapMLeaderStyle.set(ms.id, existing.id);
      } else {
        const id = newId('mls');
        const textStyle = mapTextStyle.get(ms.textStyle) ?? ms.textStyle;
        tx.add('mleaderStyles', { ...ms, id, textStyle });
        mapMLeaderStyle.set(ms.id, id);
      }
    }

    // 5. Estilos de tabla
    for (const ts of pkg.tableStyles ?? []) {
      const existing = doc.findByName('tableStyles', ts.name);
      if (existing) {
        mapTableStyle.set(ts.id, existing.id);
      } else {
        const id = newId('tbs');
        const textStyle = mapTextStyle.get(ts.textStyle) ?? ts.textStyle;
        tx.add('tableStyles', { ...ts, id, textStyle });
        mapTableStyle.set(ts.id, id);
      }
    }

    // 6. Estilos de multilínea
    for (const ms of pkg.mlineStyles ?? []) {
      const existing = doc.findByName('mlineStyles', ms.name);
      if (existing) {
        mapMLineStyle.set(ms.id, existing.id);
      } else {
        const id = newId('mls');
        tx.add('mlineStyles', { ...ms, id });
        mapMLineStyle.set(ms.id, id);
      }
    }

    // 7. Capas
    for (const l of pkg.layers ?? []) {
      if (l.id === LAYER0_ID || l.name === '0') {
        mapLayer.set(l.id, LAYER0_ID);
        continue;
      }
      const existing = doc.findByName('layers', l.name);
      if (existing) {
        mapLayer.set(l.id, existing.id);
      } else {
        const id = newId('layer');
        const linetype = mapLt.get(l.linetype) ?? (doc.data.linetypes.has(l.linetype) ? l.linetype : 'ByLayer');
        tx.add('layers', { ...l, id, linetype });
        mapLayer.set(l.id, id);
      }
    }

    // 8. Recursos binarios (assets)
    for (const a of pkg.assets ?? []) {
      const existing = [...doc.data.assets.values()].find(
        (x) => (a.dataUrl && x.dataUrl === a.dataUrl) || (x.name === a.name && x.size === a.size),
      );
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
    for (const b of pkg.blocks ?? []) {
      const existing = doc.findByName('blocks', b.name);
      if (existing && isBlockEquivalent(doc, existing.id, b, allPkgBlockEntities)) {
        // Bloque equivalente ya existente: reutilizar
        mapBlock.set(b.id, existing.id);
        reusedBlocks.add(b.id);
      } else {
        let name = b.name;
        if (existing) {
          let i = 2;
          while (doc.findByName('blocks', `${b.name} (${i})`)) i++;
          name = `${b.name} (${i})`;
        }
        const id = newId('blk');
        mapBlock.set(b.id, id);
        tx.add('blocks', { ...structuredClone(b), id, name, revision: 1 });
      }
    }

    // 10. Entidades internas de los bloques (sólo para bloques nuevos no reutilizados)
    const blockEntityMap = new Map<Id, Id>();
    for (const be of allPkgBlockEntities) {
      if (!reusedBlocks.has(be.owner)) {
        blockEntityMap.set(be.id, newId());
      }
    }

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
        clone.blockId = mapBlock.get(clone.blockId) ?? clone.blockId;
      } else if (clone.type === 'array') {
        clone.sourceBlockId = mapBlock.get(clone.sourceBlockId) ?? clone.sourceBlockId;
      } else if (clone.type === 'image' || clone.type === 'pdfunderlay') {
        clone.assetId = mapAsset.get(clone.assetId) ?? clone.assetId;
      }

      const { order: _o, ...rest } = clone;
      tx.addEntity(rest as never);
    }

    // 11. Entidades de nivel superior
    const topEntityMap = new Map<Id, Id>();
    for (const e of pkg.entities) {
      topEntityMap.set(e.id, newId());
    }

    const tMat = translation(dx, dy);

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
        clone.blockId = mapBlock.get(clone.blockId) ?? clone.blockId;
        if (!doc.data.blocks.has(clone.blockId)) {
          warnings.push(`Definición de bloque no encontrada para inserción: ${clone.blockId}`);
        }
      } else if (clone.type === 'array') {
        clone.sourceBlockId = mapBlock.get(clone.sourceBlockId) ?? clone.sourceBlockId;
      } else if (clone.type === 'image' || clone.type === 'pdfunderlay') {
        clone.assetId = mapAsset.get(clone.assetId) ?? clone.assetId;
        if (!doc.data.assets.has(clone.assetId)) {
          warnings.push(`Recurso de imagen/PDF no encontrado: ${clone.assetId}`);
        }
      }

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
