import type { CadDocument, Transaction } from '../document/document';
import { createDocument, LAYER0_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type { ArrayEntity, BlockRecord, DocumentData, Entity, Id, InsertEntity, LayerRecord, XrefInfo } from '../document/types';
import { remapDynamicBlockDef } from '../blocks/remap';
import { MODEL_SPACE_ID } from '../document/types';
import { decodeDxfBytes, importDxfIntoDocument } from '../io/dxf/importDxf';
import { readPackage } from '../io/native';

/** Dibujo de origen ya leído (FModel nativo o DXF convertido). */
export interface XrefSource {
  data: DocumentData;
  documentId: Id;
  warnings: string[];
}

export class XrefError extends Error {
  constructor(readonly l10n: { es: string; en: string }) {
    super(l10n.es);
  }
}

/** Lee un archivo de referencia: .fmodel/.json nativo o .dxf. */
export function readXrefSource(bytes: Uint8Array, fileName: string): XrefSource {
  if (/\.dxf$/i.test(fileName)) {
    const tmp = createDocument();
    const rep = importDxfIntoDocument(tmp, decodeDxfBytes(bytes), { replace: true });
    return { data: tmp.data, documentId: `dxf:${fileName.toLowerCase()}`, warnings: rep.warnings };
  }
  const res = readPackage(bytes);
  return { data: res.data, documentId: res.documentId, warnings: res.warnings };
}

/** Nombre de definición a partir del nombre de archivo, único en el anfitrión. */
export function xrefBlockName(host: CadDocument, fileName: string): string {
  const base = fileName.replace(/\.(fmodel(\.json)?|json|dxf)$/i, '').replace(/[|<>/\\":;?*=,`]/g, '_').trim() || 'Referencia';
  let name = base;
  let i = 2;
  while (host.findByName('blocks', name)) name = `${base} (${i++})`;
  return name;
}

/**
 * Detecta referencias circulares: el origen es el propio anfitrión o contiene (en cualquier
 * nivel ya resuelto) una referencia al anfitrión.
 */
export function isCircular(host: CadDocument, source: XrefSource): boolean {
  if (source.documentId === host.id) return true;
  for (const b of source.data.blocks.values()) {
    if (b.xref?.documentId === host.id) return true;
  }
  return false;
}

const byName = <T extends { id: Id; name: string }>(map: Map<Id, T>, name: string) => [...map.values()].find((r) => r.name.toLowerCase() === name.toLowerCase());

interface PopulateResult {
  ownedBlocks: Id[];
  ownedLayers: Id[];
  ownedLinetypes: Id[];
  ownedTextStyles: Id[];
  ownedDimStyles: Id[];
  ownedMLeaderStyles: Id[];
  ownedTableStyles: Id[];
  ownedMLineStyles: Id[];
  ownedAssets: Id[];
  skippedOverlays: number;
}

/** Copia el espacio modelo del origen dentro de la definición de referencia usando mapas separados por dominio. */
function populate(tx: Transaction, host: CadDocument, block: BlockRecord, source: XrefSource): PopulateResult {
  const src = source.data;
  const prefix = block.name;
  const prev = block.xref;

  // 1. Tipos de línea (dominio: linetypes)
  const ltMap = new Map<string, string>();
  const ownedLinetypes: Id[] = [];
  for (const lt of src.linetypes.values()) {
    const existingHost = byName(host.data.linetypes, lt.name);
    const existingPrefixed = byName(host.data.linetypes, `${prefix}|${lt.name}`);
    const existing = existingHost ?? existingPrefixed;
    if (existing) {
      ltMap.set(lt.id, existing.id);
      ltMap.set(lt.name, existing.name);
      if (existing.id === existingPrefixed?.id || prev?.ownedLinetypes?.includes(existing.id)) {
        ownedLinetypes.push(existing.id);
      }
    } else {
      const id = newId('lt');
      const name = `${prefix}|${lt.name}`;
      tx.add('linetypes', { ...lt, id, name });
      ltMap.set(lt.id, id);
      ltMap.set(lt.name, name);
      ownedLinetypes.push(id);
    }
  }

  // 2. Capas (dominio: layers)
  const layerMap = new Map<Id, Id>();
  const ownedLayers: Id[] = [];
  let order = Math.max(0, ...[...host.data.layers.values()].map((l) => l.order)) + 1;
  for (const l of src.layers.values()) {
    if (l.name === '0') {
      layerMap.set(l.id, LAYER0_ID);
      continue;
    }
    const name = `${prefix}|${l.name}`;
    const existing = byName(host.data.layers, name);
    if (existing) {
      // VISRETAIN: las propiedades cambiadas en el anfitrión se conservan
      layerMap.set(l.id, existing.id);
      ownedLayers.push(existing.id);
      continue;
    }
    const override = prev?.layerOverrides[l.name];
    const id = newId('lay');
    const mappedLt = l.linetype && l.linetype !== 'ByLayer' && l.linetype !== 'ByBlock'
      ? (ltMap.get(l.linetype) ?? (host.data.linetypes.has(l.linetype) ? l.linetype : 'ByLayer'))
      : l.linetype;
    const rec: LayerRecord = { ...l, ...override, id, name, order: order++, linetype: mappedLt };
    tx.add('layers', rec);
    layerMap.set(l.id, id);
    ownedLayers.push(id);
  }

  // 3. Estilos de texto (dominio: textStyles)
  const textStyleMap = new Map<Id, Id>();
  const ownedTextStyles: Id[] = [];
  for (const ts of src.textStyles.values()) {
    const existingHost = byName(host.data.textStyles, ts.name);
    const existingPrefixed = byName(host.data.textStyles, `${prefix}|${ts.name}`);
    const existing = existingHost ?? existingPrefixed;
    if (existing) {
      textStyleMap.set(ts.id, existing.id);
      if (existing.id === existingPrefixed?.id || prev?.ownedTextStyles?.includes(existing.id)) {
        ownedTextStyles.push(existing.id);
      }
    } else {
      const id = newId('ts');
      const name = `${prefix}|${ts.name}`;
      tx.add('textStyles', { ...ts, id, name });
      textStyleMap.set(ts.id, id);
      ownedTextStyles.push(id);
    }
  }

  // 4. Estilos de cota (dominio: dimStyles)
  const dimStyleMap = new Map<Id, Id>();
  const ownedDimStyles: Id[] = [];
  for (const ds of src.dimStyles.values()) {
    const existingHost = byName(host.data.dimStyles, ds.name);
    const existingPrefixed = byName(host.data.dimStyles, `${prefix}|${ds.name}`);
    const existing = existingHost ?? existingPrefixed;
    if (existing) {
      dimStyleMap.set(ds.id, existing.id);
      if (existing.id === existingPrefixed?.id || prev?.ownedDimStyles?.includes(existing.id)) {
        ownedDimStyles.push(existing.id);
      }
    } else {
      const id = newId('ds');
      const name = `${prefix}|${ds.name}`;
      const textStyle = textStyleMap.get(ds.textStyle) ?? (host.data.textStyles.has(ds.textStyle) ? ds.textStyle : host.settings.currentTextStyle);
      tx.add('dimStyles', { ...ds, id, name, textStyle });
      dimStyleMap.set(ds.id, id);
      ownedDimStyles.push(id);
    }
  }

  // 5. Estilos de tabla (dominio: tableStyles)
  const tableStyleMap = new Map<Id, Id>();
  const ownedTableStyles: Id[] = [];
  for (const ts of src.tableStyles.values()) {
    const existingHost = byName(host.data.tableStyles, ts.name);
    const existingPrefixed = byName(host.data.tableStyles, `${prefix}|${ts.name}`);
    const existing = existingHost ?? existingPrefixed;
    if (existing) {
      tableStyleMap.set(ts.id, existing.id);
      if (existing.id === existingPrefixed?.id || prev?.ownedTableStyles?.includes(existing.id)) {
        ownedTableStyles.push(existing.id);
      }
    } else {
      const id = newId('tbs');
      const name = `${prefix}|${ts.name}`;
      const textStyle = textStyleMap.get(ts.textStyle) ?? (host.data.textStyles.has(ts.textStyle) ? ts.textStyle : host.settings.currentTextStyle);
      tx.add('tableStyles', { ...ts, id, name, textStyle });
      tableStyleMap.set(ts.id, id);
      ownedTableStyles.push(id);
    }
  }

  // 6. Estilos de multilínea (dominio: mlineStyles)
  const mlineStyleMap = new Map<Id, Id>();
  const ownedMLineStyles: Id[] = [];
  for (const ms of src.mlineStyles.values()) {
    const existingHost = byName(host.data.mlineStyles, ms.name);
    const existingPrefixed = byName(host.data.mlineStyles, `${prefix}|${ms.name}`);
    const existing = existingHost ?? existingPrefixed;
    if (existing) {
      mlineStyleMap.set(ms.id, existing.id);
      if (existing.id === existingPrefixed?.id || prev?.ownedMLineStyles?.includes(existing.id)) {
        ownedMLineStyles.push(existing.id);
      }
    } else {
      const id = newId('mlns');
      const name = `${prefix}|${ms.name}`;
      const elements = ms.elements?.map((el) => ({
        ...el,
        linetype: el.linetype && el.linetype !== 'ByLayer' && el.linetype !== 'ByBlock' ? (ltMap.get(el.linetype) ?? el.linetype) : el.linetype,
      })) ?? [];
      tx.add('mlineStyles', { ...ms, id, name, elements });
      mlineStyleMap.set(ms.id, id);
      ownedMLineStyles.push(id);
    }
  }

  // 7. Definiciones de bloque (dominio: blocks)
  const blockMap = new Map<Id, Id>();
  const ownedBlocks: Id[] = [];
  let skippedOverlays = 0;
  const skipped = new Set<Id>();
  for (const b of src.blocks.values()) {
    if (b.xref?.mode === 'overlay') {
      skippedOverlays++;
      skipped.add(b.id);
      for (const id of b.xref.ownedBlocks ?? []) skipped.add(id);
    }
  }
  for (const b of src.blocks.values()) {
    if (skipped.has(b.id)) continue;
    const existing = byName(host.data.blocks, `${prefix}|${b.name}`);
    const id = existing?.id ?? newId('blk');
    blockMap.set(b.id, id);
  }
  for (const b of src.blocks.values()) {
    const id = blockMap.get(b.id);
    if (!id) continue;
    const { xref: x, dynamic, ...rest } = b;
    // Preservar metadatos de xref anidado para mantener detección de ciclos transitivos
    const nestedXref = x ? { ...x, ownedBlocks: x.ownedBlocks?.map((bid) => blockMap.get(bid) ?? bid) } : undefined;
    const blockData = {
      ...rest,
      id,
      name: `${prefix}|${b.name}`,
      kind: b.kind === 'xref' ? 'normal' : b.kind,
      dynamic,
      xref: nestedXref,
      favorite: false,
      revision: (host.data.blocks.get(id)?.revision ?? 0) + 1,
    };
    if (host.data.blocks.has(id)) {
      tx.put('blocks', blockData);
    } else {
      tx.add('blocks', blockData);
    }
    ownedBlocks.push(id);
  }

  // 8. Estilos de directriz múltiple (dominio: mleaderStyles) — tras mapear bloques
  const mleaderStyleMap = new Map<Id, Id>();
  const ownedMLeaderStyles: Id[] = [];
  for (const ms of src.mleaderStyles.values()) {
    const existingHost = byName(host.data.mleaderStyles, ms.name);
    const existingPrefixed = byName(host.data.mleaderStyles, `${prefix}|${ms.name}`);
    const existing = existingHost ?? existingPrefixed;
    if (existing) {
      mleaderStyleMap.set(ms.id, existing.id);
      if (existing.id === existingPrefixed?.id || prev?.ownedMLeaderStyles?.includes(existing.id)) {
        ownedMLeaderStyles.push(existing.id);
      }
    } else {
      const id = newId('mls');
      const name = `${prefix}|${ms.name}`;
      const textStyle = textStyleMap.get(ms.textStyle) ?? (host.data.textStyles.has(ms.textStyle) ? ms.textStyle : host.settings.currentTextStyle);
      const blockId = ms.blockId ? (blockMap.get(ms.blockId) ?? ms.blockId) : undefined;
      tx.add('mleaderStyles', { ...ms, id, name, textStyle, blockId });
      mleaderStyleMap.set(ms.id, id);
      ownedMLeaderStyles.push(id);
    }
  }

  // 9. Recursos binarios (dominio: assets) — resolución por contenido vs ID con rigor de clipboard
  const assetMap = new Map<Id, Id>();
  const ownedAssets: Id[] = [];
  for (const a of src.assets.values()) {
    const existing = [...host.data.assets.values()].find((x) => {
      if (a.dataUrl && x.dataUrl) return x.dataUrl === a.dataUrl;
      if (a.path && x.path) return x.path === a.path && x.mime === a.mime && x.size === a.size;
      return !x.dataUrl && !x.path && x.name === a.name && x.mime === a.mime && x.size === a.size;
    });
    if (existing) {
      assetMap.set(a.id, existing.id);
      if (prev?.ownedAssets?.includes(existing.id)) {
        ownedAssets.push(existing.id);
      }
    } else {
      const id = newId('asset');
      tx.add('assets', { ...a, id });
      assetMap.set(a.id, id);
      ownedAssets.push(id);
    }
  }

  // 10. Copia de entidades con remapeo tipado por dominio (dominio: entities)
  const idMap = new Map<Id, Id>();
  const copyEntity = (e: Entity, owner: Id) => {
    if (e.type === 'insert' && !blockMap.has(e.blockId)) return;
    const c = structuredClone(e) as Entity & Record<string, unknown>;
    c.owner = owner;
    c.layer = layerMap.get(e.layer) ?? LAYER0_ID;
    if (e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock') {
      c.linetype = ltMap.get(e.linetype) ?? (host.data.linetypes.has(e.linetype) ? e.linetype : 'ByLayer');
    }

    if (c.type === 'text' || c.type === 'mtext' || c.type === 'attdef') {
      if (typeof c.style === 'string') c.style = textStyleMap.get(c.style) ?? c.style;
    } else if (c.type === 'dimension') {
      if (typeof c.style === 'string') c.style = dimStyleMap.get(c.style) ?? c.style;
      if (c.overrides && typeof c.overrides === 'object') {
        const ov = { ...(c.overrides as Record<string, unknown>) };
        if (typeof ov.textStyle === 'string') ov.textStyle = textStyleMap.get(ov.textStyle) ?? ov.textStyle;
        c.overrides = ov;
      }
      delete c.assoc;
    } else if (c.type === 'leader') {
      if (typeof c.style === 'string') c.style = dimStyleMap.get(c.style) ?? c.style;
      delete c.annotation;
    } else if (c.type === 'mleader') {
      if (typeof c.style === 'string') c.style = mleaderStyleMap.get(c.style) ?? c.style;
      if (c.content && typeof c.content === 'object' && c.content.type === 'block') {
        const cnt = { ...c.content };
        cnt.blockId = blockMap.get(cnt.blockId) ?? cnt.blockId;
        c.content = cnt;
      }
      if (c.overrides && typeof c.overrides === 'object') {
        const ov = { ...(c.overrides as Record<string, unknown>) };
        if (typeof ov.textStyle === 'string') ov.textStyle = textStyleMap.get(ov.textStyle) ?? ov.textStyle;
        if (typeof ov.blockId === 'string') ov.blockId = blockMap.get(ov.blockId) ?? ov.blockId;
        c.overrides = ov;
      }
    } else if (c.type === 'table') {
      if (typeof c.style === 'string') c.style = tableStyleMap.get(c.style) ?? c.style;
    } else if (c.type === 'mline') {
      if (typeof c.style === 'string') c.style = mlineStyleMap.get(c.style) ?? c.style;
    } else if (c.type === 'image' || c.type === 'pdfunderlay') {
      if (typeof c.assetId === 'string') c.assetId = assetMap.get(c.assetId) ?? c.assetId;
    } else if (c.type === 'viewport') {
      if (Array.isArray(c.frozenLayers)) {
        c.frozenLayers = c.frozenLayers.map((layId: Id) => layerMap.get(layId) ?? layId);
      }
      if (c.layerOverrides && typeof c.layerOverrides === 'object') {
        const remappedOverrides: Record<Id, Record<string, unknown>> = {};
        for (const [layId, ov] of Object.entries(c.layerOverrides as Record<Id, Record<string, unknown>>)) {
          const mappedLayId = layerMap.get(layId as Id) ?? (layId as Id);
          const mappedOv = { ...ov };
          if (typeof mappedOv.linetype === 'string' && ltMap.has(mappedOv.linetype)) {
            mappedOv.linetype = ltMap.get(mappedOv.linetype);
          }
          remappedOverrides[mappedLayId] = mappedOv;
        }
        c.layerOverrides = remappedOverrides;
      }
    }

    if (c.type === 'insert') {
      c.blockId = blockMap.get(e.type === 'insert' ? e.blockId : '')!;
    }
    if (c.type === 'array') {
      c.sourceBlockId = blockMap.get(c.sourceBlockId) ?? c.sourceBlockId;
    }
    if (c.type === 'hatch') {
      delete c.associative;
    }

    const { id: oldId, order, ...rest } = c;
    const id = newId();
    idMap.set(oldId, id);
    tx.addEntity({ ...rest, id, order } as never);
  };

  for (const b of src.blocks.values()) {
    const id = blockMap.get(b.id);
    if (!id) continue;
    for (const e of [...src.entities.values()].filter((x) => x.owner === b.id).sort((x, y) => x.order - y.order)) copyEntity(e, id);
  }
  for (const e of [...src.entities.values()].filter((x) => x.owner === MODEL_SPACE_ID).sort((x, y) => x.order - y.order)) copyEntity(e, block.id);

  // 11. Bloques dinámicos anidados: remapeo tipado de referencias internas (BLK-001)
  for (const b of src.blocks.values()) {
    const id = blockMap.get(b.id);
    if (!id || !b.dynamic) continue;
    const dyn = remapDynamicBlockDef(b.dynamic, idMap);
    tx.update('blocks', id, { dynamic: dyn });
  }

  return {
    ownedBlocks,
    ownedLayers,
    ownedLinetypes,
    ownedTextStyles,
    ownedDimStyles,
    ownedMLeaderStyles,
    ownedTableStyles,
    ownedMLineStyles,
    ownedAssets,
    skippedOverlays,
  };
}

function clearContent(tx: Transaction, host: CadDocument, block: BlockRecord) {
  const owners = new Set<Id>([block.id, ...(block.xref?.ownedBlocks ?? [])]);
  for (const e of Array.from(host.data.entities.values())) if (owners.has(e.owner)) tx.removeEntity(e.id);
}

/** Crea la definición de referencia con el contenido del origen. */
export function attachXref(
  tx: Transaction,
  host: CadDocument,
  source: XrefSource,
  opts: { fileName: string; path: string; mode: XrefInfo['mode']; source: XrefInfo['source'] },
): BlockRecord {
  if (isCircular(host, source)) {
    throw new XrefError({ es: 'Referencia circular: ese dibujo es este mismo o ya lo referencia.', en: 'Circular reference: that drawing is this one or already references it.' });
  }
  const name = xrefBlockName(host, opts.fileName);
  const block: BlockRecord = {
    id: newId('xref'),
    name,
    kind: 'xref',
    basePoint: { x: 0, y: 0 },
    description: opts.path,
    units: source.data.settings.units,
    explodable: false,
    scaleUniformly: false,
    annotative: false,
    revision: 1,
    xref: {
      path: opts.path,
      mode: opts.mode,
      status: 'loaded',
      layerOverrides: {},
      lastLoaded: Date.now(),
      documentId: source.documentId,
      source: opts.source,
    },
  };
  tx.add('blocks', block);
  const res = populate(tx, host, block, source);
  tx.update('blocks', block.id, {
    xref: {
      ...block.xref!,
      ownedBlocks: res.ownedBlocks,
      ownedLayers: res.ownedLayers,
      ownedLinetypes: res.ownedLinetypes,
      ownedTextStyles: res.ownedTextStyles,
      ownedDimStyles: res.ownedDimStyles,
      ownedMLeaderStyles: res.ownedMLeaderStyles,
      ownedTableStyles: res.ownedTableStyles,
      ownedMLineStyles: res.ownedMLineStyles,
      ownedAssets: res.ownedAssets,
    },
  });
  return tx.doc.data.blocks.get(block.id)!;
}

/** Vuelve a leer el origen conservando las propiedades locales de sus capas. */
export function reloadXref(tx: Transaction, host: CadDocument, blockId: Id, source: XrefSource): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) throw new XrefError({ es: 'No es una referencia externa.', en: 'Not an external reference.' });
  if (isCircular(host, source)) {
    tx.update('blocks', blockId, { xref: { ...block.xref, status: 'circular', error: 'circular' } });
    throw new XrefError({ es: `«${block.name}» crearía una referencia circular.`, en: `"${block.name}" would create a circular reference.` });
  }
  clearContent(tx, host, block);
  const fresh: BlockRecord = {
    ...block,
    revision: block.revision + 1,
    xref: {
      ...block.xref,
      ownedBlocks: [],
      status: 'loaded',
      lastLoaded: Date.now(),
      documentId: source.documentId,
      error: undefined,
    },
  };
  tx.put('blocks', fresh);
  const res = populate(tx, host, fresh, source);

  // Limpiar bloques poseídos que ya no existan en el nuevo origen y no estén usados por el anfitrión
  const usedBlocks = new Set<Id>();
  for (const e of host.data.entities.values()) {
    if (e.type === 'insert' && typeof e.blockId === 'string') usedBlocks.add(e.blockId);
    if (e.type === 'array' && typeof e.sourceBlockId === 'string') usedBlocks.add(e.sourceBlockId);
    if (e.type === 'mleader') {
      if (e.content?.type === 'block' && typeof e.content.blockId === 'string') usedBlocks.add(e.content.blockId);
      if (e.overrides?.blockId && typeof e.overrides.blockId === 'string') usedBlocks.add(e.overrides.blockId);
    }
  }
  for (const mls of host.data.mleaderStyles.values()) if (mls.blockId) usedBlocks.add(mls.blockId);
  for (const oldBlkId of block.xref.ownedBlocks ?? []) {
    if (!res.ownedBlocks.includes(oldBlkId) && !usedBlocks.has(oldBlkId) && host.data.blocks.has(oldBlkId)) {
      tx.remove('blocks', oldBlkId);
    }
  }

  // Limpiar assets que ya no existan en el nuevo origen y no estén en uso
  const usedAssets = new Set<Id>();
  for (const e of host.data.entities.values()) {
    if ((e.type === 'image' || e.type === 'pdfunderlay') && typeof e.assetId === 'string') usedAssets.add(e.assetId);
  }
  for (const oldAstId of block.xref.ownedAssets ?? []) {
    if (!res.ownedAssets.includes(oldAstId) && !usedAssets.has(oldAstId) && host.data.assets.has(oldAstId)) {
      tx.remove('assets', oldAstId);
    }
  }

  tx.update('blocks', blockId, {
    xref: {
      ...fresh.xref!,
      ownedBlocks: res.ownedBlocks,
      ownedLayers: res.ownedLayers,
      ownedLinetypes: res.ownedLinetypes,
      ownedTextStyles: res.ownedTextStyles,
      ownedDimStyles: res.ownedDimStyles,
      ownedMLeaderStyles: res.ownedMLeaderStyles,
      ownedTableStyles: res.ownedTableStyles,
      ownedMLineStyles: res.ownedMLineStyles,
      ownedAssets: res.ownedAssets,
    },
  });
}

/** Marca la referencia como no disponible conservando intacto su snapshot geométrico visible. */
export function markXrefUnavailable(
  tx: Transaction,
  host: CadDocument,
  blockId: Id,
  status: 'not-found' | 'unresolved' = 'not-found',
  error?: string,
): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) return;
  tx.update('blocks', blockId, { xref: { ...block.xref, status, error } });
}

/** Cambia la ruta de origen de la referencia y opcionalmente la recarga si se proporciona el nuevo origen. */
export function repathXref(
  tx: Transaction,
  host: CadDocument,
  blockId: Id,
  newPath: string,
  source?: XrefSource,
  sourceKind: 'file' | 'library' = 'file',
): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) throw new XrefError({ es: 'No es una referencia externa.', en: 'Not an external reference.' });
  tx.update('blocks', blockId, { xref: { ...block.xref, path: newPath, source: sourceKind } });
  if (source) {
    reloadXref(tx, host, blockId, source);
  }
}

/** Descarga intencionalmente el contenido (las inserciones quedan sin geometría hasta recargar). */
export function unloadXref(tx: Transaction, host: CadDocument, blockId: Id, status: XrefInfo['status'] = 'unloaded', error?: string): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) return;
  clearContent(tx, host, block);
  for (const id of block.xref?.ownedBlocks ?? []) if (host.data.blocks.has(id)) tx.remove('blocks', id);
  tx.update('blocks', blockId, { revision: block.revision + 1, xref: { ...block.xref, ownedBlocks: [], status, error } });
}

/** Elimina la referencia, sus inserciones, definiciones anidadas y recursos propios sin uso por el anfitrión. */
export function detachXref(tx: Transaction, host: CadDocument, blockId: Id): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) return;

  // 1. Quitar contenido geométrico
  clearContent(tx, host, block);

  // 2. Quitar inserciones y matrices del anfitrión que apunten a la referencia principal
  for (const e of Array.from(host.data.entities.values())) {
    if (e.type === 'insert' && (e as InsertEntity).blockId === blockId) tx.removeEntity(e.id);
    if (e.type === 'array' && (e as ArrayEntity).sourceBlockId === blockId) tx.removeEntity(e.id);
  }
  tx.remove('blocks', blockId);

  // 3. Limpieza de estilos compuestos y entidades dependientes en orden topológico

  // 3a. Estilos de cota
  if (block.xref.ownedDimStyles?.length) {
    const usedDs = new Set<Id>();
    for (const e of host.data.entities.values()) {
      if ((e.type === 'dimension' || e.type === 'leader') && typeof e.style === 'string') usedDs.add(e.style);
    }
    if (host.data.settings.currentDimStyle) usedDs.add(host.data.settings.currentDimStyle);
    for (const id of block.xref.ownedDimStyles) {
      if (!usedDs.has(id) && host.data.dimStyles.has(id)) tx.remove('dimStyles', id);
    }
  }

  // 3b. Estilos de directriz múltiple
  if (block.xref.ownedMLeaderStyles?.length) {
    const usedMls = new Set<Id>();
    for (const e of host.data.entities.values()) if (e.type === 'mleader' && typeof e.style === 'string') usedMls.add(e.style);
    if (host.data.settings.currentMLeaderStyle) usedMls.add(host.data.settings.currentMLeaderStyle);
    for (const id of block.xref.ownedMLeaderStyles) {
      if (!usedMls.has(id) && host.data.mleaderStyles.has(id)) tx.remove('mleaderStyles', id);
    }
  }

  // 3c. Estilos de tabla
  if (block.xref.ownedTableStyles?.length) {
    const usedTbs = new Set<Id>();
    for (const e of host.data.entities.values()) if (e.type === 'table' && typeof e.style === 'string') usedTbs.add(e.style);
    if (host.data.settings.currentTableStyle) usedTbs.add(host.data.settings.currentTableStyle);
    for (const id of block.xref.ownedTableStyles) {
      if (!usedTbs.has(id) && host.data.tableStyles.has(id)) tx.remove('tableStyles', id);
    }
  }

  // 3d. Estilos de multilínea
  if (block.xref.ownedMLineStyles?.length) {
    const usedMln = new Set<Id>();
    for (const e of host.data.entities.values()) if (e.type === 'mline' && typeof e.style === 'string') usedMln.add(e.style);
    if (host.data.settings.currentMLineStyle) usedMln.add(host.data.settings.currentMLineStyle);
    for (const id of block.xref.ownedMLineStyles) {
      if (!usedMln.has(id) && host.data.mlineStyles.has(id)) tx.remove('mlineStyles', id);
    }
  }

  // 3e. Capas
  const usedLayers = new Set([...host.data.entities.values()].map((e) => e.layer));
  for (const id of block.xref.ownedLayers ?? []) {
    if (!usedLayers.has(id) && host.data.settings.currentLayer !== id && host.data.layers.has(id)) {
      tx.remove('layers', id);
    }
  }

  // 3f. Estilos de texto (revisados tras eliminar dimStyles, mleaderStyles y tableStyles no usados)
  if (block.xref.ownedTextStyles?.length) {
    const usedTs = new Set<Id>();
    for (const e of host.data.entities.values()) {
      if ('style' in e && typeof e.style === 'string') usedTs.add(e.style);
      if (e.type === 'dimension' && e.overrides?.textStyle) usedTs.add(e.overrides.textStyle);
      if (e.type === 'mleader' && e.overrides?.textStyle) usedTs.add(e.overrides.textStyle);
    }
    for (const ds of host.data.dimStyles.values()) if (ds.textStyle) usedTs.add(ds.textStyle);
    for (const mls of host.data.mleaderStyles.values()) if (mls.textStyle) usedTs.add(mls.textStyle);
    for (const tbs of host.data.tableStyles.values()) if (tbs.textStyle) usedTs.add(tbs.textStyle);
    if (host.data.settings.currentTextStyle) usedTs.add(host.data.settings.currentTextStyle);
    for (const id of block.xref.ownedTextStyles) {
      if (!usedTs.has(id) && host.data.textStyles.has(id)) {
        tx.remove('textStyles', id);
      }
    }
  }

  // 3g. Tipos de línea (revisados tras eliminar capas y mlineStyles no usados)
  if (block.xref.ownedLinetypes?.length) {
    const usedLt = new Set<string>();
    for (const e of host.data.entities.values()) if (e.linetype) usedLt.add(e.linetype);
    for (const l of host.data.layers.values()) if (l.linetype) usedLt.add(l.linetype);
    for (const ms of host.data.mlineStyles.values()) {
      for (const el of ms.elements ?? []) if (el.linetype) usedLt.add(el.linetype);
    }
    if (host.data.settings.currentLinetype) usedLt.add(host.data.settings.currentLinetype);
    for (const id of block.xref.ownedLinetypes) {
      const lt = host.data.linetypes.get(id);
      if (lt && !usedLt.has(lt.id) && !usedLt.has(lt.name)) {
        tx.remove('linetypes', id);
      }
    }
  }

  // 3h. Recursos binarios (assets)
  if (block.xref.ownedAssets?.length) {
    const usedAssets = new Set<Id>();
    for (const e of host.data.entities.values()) {
      if ((e.type === 'image' || e.type === 'pdfunderlay') && typeof e.assetId === 'string') usedAssets.add(e.assetId);
    }
    for (const id of block.xref.ownedAssets) {
      if (!usedAssets.has(id) && host.data.assets.has(id)) {
        tx.remove('assets', id);
      }
    }
  }

  // 3i. Bloques anidados (ownedBlocks): solo se eliminan si NO están en uso por el anfitrión
  if (block.xref.ownedBlocks?.length) {
    const usedBlocks = new Set<Id>();
    for (const e of host.data.entities.values()) {
      if (e.type === 'insert' && typeof e.blockId === 'string') usedBlocks.add(e.blockId);
      if (e.type === 'array' && typeof e.sourceBlockId === 'string') usedBlocks.add(e.sourceBlockId);
      if (e.type === 'mleader') {
        if (e.content?.type === 'block' && typeof e.content.blockId === 'string') usedBlocks.add(e.content.blockId);
        if (e.overrides?.blockId && typeof e.overrides.blockId === 'string') usedBlocks.add(e.overrides.blockId);
      }
    }
    for (const mls of host.data.mleaderStyles.values()) {
      if (mls.blockId) usedBlocks.add(mls.blockId);
    }
    for (const id of block.xref.ownedBlocks) {
      if (!usedBlocks.has(id) && host.data.blocks.has(id)) {
        tx.remove('blocks', id);
      }
    }
  }
}

function uniqueBindName(existingNames: Set<string>, name: string): string {
  if (!name.includes('|')) return name;
  let candidate = name.replaceAll('|', '$0$');
  let i = 1;
  while (existingNames.has(candidate.toLowerCase())) {
    candidate = name.replace(/\|/g, () => `$${i}$`);
    i++;
  }
  existingNames.add(candidate.toLowerCase());
  return candidate;
}

/** Convierte la referencia en bloque normal (capas y estilos «xref|nombre» pasan a «xref$0$nombre»). */
export function bindXref(tx: Transaction, host: CadDocument, blockId: Id): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) return;
  if (block.xref.status === 'unloaded') throw new XrefError({ es: 'Carga la referencia antes de unirla.', en: 'Load the reference before binding it.' });

  const existingLayers = new Set([...host.data.layers.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedLayers ?? []) {
    const l = host.data.layers.get(id);
    if (l) tx.update('layers', id, { name: uniqueBindName(existingLayers, l.name) });
  }

  const existingBlocks = new Set([...host.data.blocks.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedBlocks ?? []) {
    const b = host.data.blocks.get(id);
    if (b) {
      const newName = uniqueBindName(existingBlocks, b.name);
      tx.update('blocks', id, { name: newName, kind: 'normal', explodable: true, xref: undefined, revision: b.revision + 1 });
    }
  }

  const existingLt = new Set([...host.data.linetypes.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedLinetypes ?? []) {
    const lt = host.data.linetypes.get(id);
    if (lt) tx.update('linetypes', id, { name: uniqueBindName(existingLt, lt.name) });
  }

  const existingTs = new Set([...host.data.textStyles.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedTextStyles ?? []) {
    const ts = host.data.textStyles.get(id);
    if (ts) tx.update('textStyles', id, { name: uniqueBindName(existingTs, ts.name) });
  }

  const existingDs = new Set([...host.data.dimStyles.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedDimStyles ?? []) {
    const ds = host.data.dimStyles.get(id);
    if (ds) tx.update('dimStyles', id, { name: uniqueBindName(existingDs, ds.name) });
  }

  const existingMls = new Set([...host.data.mleaderStyles.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedMLeaderStyles ?? []) {
    const mls = host.data.mleaderStyles.get(id);
    if (mls) tx.update('mleaderStyles', id, { name: uniqueBindName(existingMls, mls.name) });
  }

  const existingTbs = new Set([...host.data.tableStyles.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedTableStyles ?? []) {
    const ts = host.data.tableStyles.get(id);
    if (ts) tx.update('tableStyles', id, { name: uniqueBindName(existingTbs, ts.name) });
  }

  const existingMln = new Set([...host.data.mlineStyles.values()].map((x) => x.name.toLowerCase()));
  for (const id of block.xref.ownedMLineStyles ?? []) {
    const ms = host.data.mlineStyles.get(id);
    if (ms) tx.update('mlineStyles', id, { name: uniqueBindName(existingMln, ms.name) });
  }

  const { xref: _x, ...rest } = block;
  tx.put('blocks', { ...rest, kind: 'normal', explodable: true, revision: block.revision + 1 });
}
