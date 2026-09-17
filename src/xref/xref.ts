import type { CadDocument, Transaction } from '../document/document';
import { createDocument, LAYER0_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type { BlockRecord, DocumentData, Entity, Id, InsertEntity, LayerRecord, XrefInfo } from '../document/types';
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
  for (const b of source.data.blocks.values()) if (b.kind === 'xref' && b.xref?.documentId === host.id) return true;
  return false;
}

const byName = <T extends { id: Id; name: string }>(map: Map<Id, T>, name: string) => [...map.values()].find((r) => r.name.toLowerCase() === name.toLowerCase());

/** Copia el espacio modelo del origen dentro de la definición de referencia. */
function populate(tx: Transaction, host: CadDocument, block: BlockRecord, source: XrefSource): { ownedBlocks: Id[]; ownedLayers: Id[]; skippedOverlays: number } {
  const src = source.data;
  const prefix = block.name;
  const prev = block.xref;
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
    const rec: LayerRecord = { ...l, ...override, id, name, order: order++, linetype: l.linetype };
    tx.add('layers', rec);
    layerMap.set(l.id, id);
    ownedLayers.push(id);
  }
  // tipos de línea y estilos: se reutilizan por nombre; los que faltan se copian con prefijo
  const ltMap = new Map<Id, Id>();
  for (const lt of src.linetypes.values()) {
    const existing = byName(host.data.linetypes, lt.name) ?? byName(host.data.linetypes, `${prefix}|${lt.name}`);
    if (existing) ltMap.set(lt.id, existing.id);
    else {
      const id = newId('lt');
      tx.add('linetypes', { ...lt, id, name: `${prefix}|${lt.name}` });
      ltMap.set(lt.id, id);
    }
  }
  for (const id of ownedLayers) {
    const l = tx.doc.data.layers.get(id)!;
    const mapped = ltMap.get(l.linetype);
    if (mapped && mapped !== l.linetype && !host.data.linetypes.has(l.linetype)) tx.update('layers', id, { linetype: mapped });
  }
  const styleMap = new Map<Id, Id>();
  const copyStyles = <C extends 'textStyles' | 'dimStyles' | 'mleaderStyles' | 'tableStyles' | 'mlineStyles'>(coll: C) => {
    for (const st of src[coll].values() as IterableIterator<{ id: Id; name: string }>) {
      const existing = byName(host.data[coll] as Map<Id, { id: Id; name: string }>, st.name);
      if (existing) styleMap.set(st.id, existing.id);
      else {
        const id = newId('st');
        tx.add(coll, { ...(st as object), id, name: `${prefix}|${st.name}` } as never);
        styleMap.set(st.id, id);
      }
    }
  };
  copyStyles('textStyles');
  copyStyles('dimStyles');
  copyStyles('mleaderStyles');
  copyStyles('tableStyles');
  copyStyles('mlineStyles');
  for (const a of src.assets.values()) if (!host.data.assets.has(a.id)) tx.add('assets', a);

  // definiciones anidadas (las superpuestas del origen no se arrastran)
  const blockMap = new Map<Id, Id>();
  const ownedBlocks: Id[] = [];
  let skippedOverlays = 0;
  const skipped = new Set<Id>();
  for (const b of src.blocks.values()) {
    if (b.kind === 'xref' && b.xref?.mode === 'overlay') {
      skippedOverlays++;
      skipped.add(b.id);
      for (const id of b.xref.ownedBlocks ?? []) skipped.add(id);
    }
  }
  for (const b of src.blocks.values()) {
    if (skipped.has(b.id)) continue;
    const id = newId('blk');
    blockMap.set(b.id, id);
  }
  for (const b of src.blocks.values()) {
    const id = blockMap.get(b.id);
    if (!id) continue;
    const { xref: _x, dynamic, ...rest } = b;
    tx.add('blocks', { ...rest, id, name: `${prefix}|${b.name}`, kind: b.kind === 'xref' ? 'normal' : b.kind, dynamic, favorite: false, revision: 1 });
    ownedBlocks.push(id);
  }

  const idMap = new Map<Id, Id>();
  const copyEntity = (e: Entity, owner: Id) => {
    if (e.type === 'insert' && !blockMap.has(e.blockId)) return;
    const c = structuredClone(e) as Entity & Record<string, unknown>;
    c.owner = owner;
    c.layer = layerMap.get(e.layer) ?? LAYER0_ID;
    if (e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock') c.linetype = ltMap.get(e.linetype) ?? 'ByLayer';
    if (typeof c.style === 'string') c.style = styleMap.get(c.style) ?? c.style;
    if (c.type === 'insert') c.blockId = blockMap.get(e.type === 'insert' ? e.blockId : '')!;
    if (c.type === 'array') c.sourceBlockId = blockMap.get(c.sourceBlockId) ?? c.sourceBlockId;
    if (c.type === 'mleader' && c.content.type === 'block') c.content = { ...c.content, blockId: blockMap.get(c.content.blockId) ?? c.content.blockId };
    // las referencias entre objetos no se trasladan (asociatividad del origen)
    if (c.type === 'dimension') delete c.assoc;
    if (c.type === 'hatch') delete c.associative;
    if (c.type === 'leader') delete c.annotation;
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
  // las definiciones dinámicas anidadas referencian objetos por id: se reescriben con los nuevos
  for (const b of src.blocks.values()) {
    const id = blockMap.get(b.id);
    if (!id || !b.dynamic) continue;
    const json = JSON.stringify(b.dynamic).replace(/"([^"]+)"/g, (m, v: string) => (idMap.has(v) ? `"${idMap.get(v)}"` : m));
    tx.update('blocks', id, { dynamic: JSON.parse(json) });
  }
  return { ownedBlocks, ownedLayers, skippedOverlays };
}

function clearContent(tx: Transaction, host: CadDocument, block: BlockRecord) {
  const owners = new Set<Id>([block.id, ...(block.xref?.ownedBlocks ?? [])]);
  for (const e of [...host.data.entities.values()]) if (owners.has(e.owner)) tx.removeEntity(e.id);
  for (const id of block.xref?.ownedBlocks ?? []) if (host.data.blocks.has(id)) tx.remove('blocks', id);
}

/** Crea la definición de referencia con el contenido del origen. */
export function attachXref(tx: Transaction, host: CadDocument, source: XrefSource, opts: { fileName: string; path: string; mode: XrefInfo['mode']; source: XrefInfo['source'] }): BlockRecord {
  if (isCircular(host, source)) throw new XrefError({ es: 'Referencia circular: ese dibujo es este mismo o ya lo referencia.', en: 'Circular reference: that drawing is this one or already references it.' });
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
    xref: { path: opts.path, mode: opts.mode, status: 'loaded', layerOverrides: {}, lastLoaded: Date.now(), documentId: source.documentId, source: opts.source },
  };
  tx.add('blocks', block);
  const res = populate(tx, host, block, source);
  tx.update('blocks', block.id, { xref: { ...block.xref!, ownedBlocks: res.ownedBlocks, ownedLayers: res.ownedLayers } });
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
  const fresh = { ...block, revision: block.revision + 1, xref: { ...block.xref, ownedBlocks: [], status: 'loaded' as const, lastLoaded: Date.now(), documentId: source.documentId, error: undefined } };
  tx.put('blocks', fresh);
  const res = populate(tx, host, fresh, source);
  tx.update('blocks', blockId, { xref: { ...fresh.xref, ownedBlocks: res.ownedBlocks, ownedLayers: res.ownedLayers } });
}

/** Descarga el contenido (las inserciones quedan sin geometría hasta recargar). */
export function unloadXref(tx: Transaction, host: CadDocument, blockId: Id, status: XrefInfo['status'] = 'unloaded', error?: string): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) return;
  clearContent(tx, host, block);
  tx.update('blocks', blockId, { revision: block.revision + 1, xref: { ...block.xref, ownedBlocks: [], status, error } });
}

/** Elimina la referencia, sus inserciones, definiciones anidadas y capas propias sin uso. */
export function detachXref(tx: Transaction, host: CadDocument, blockId: Id): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) return;
  clearContent(tx, host, block);
  for (const e of [...host.data.entities.values()]) if (e.type === 'insert' && (e as InsertEntity).blockId === blockId) tx.removeEntity(e.id);
  tx.remove('blocks', blockId);
  const used = new Set([...host.data.entities.values()].map((e) => e.layer));
  for (const id of block.xref.ownedLayers ?? []) if (!used.has(id) && host.data.settings.currentLayer !== id && host.data.layers.has(id)) tx.remove('layers', id);
}

/** Convierte la referencia en bloque normal (capas «xref|capa» pasan a «xref$0$capa»). */
export function bindXref(tx: Transaction, host: CadDocument, blockId: Id): void {
  const block = host.data.blocks.get(blockId);
  if (!block?.xref) return;
  if (block.xref.status !== 'loaded') throw new XrefError({ es: 'Carga la referencia antes de unirla.', en: 'Load the reference before binding it.' });
  for (const id of block.xref.ownedLayers ?? []) {
    const l = host.data.layers.get(id);
    if (l) tx.update('layers', id, { name: l.name.replace('|', '$0$') });
  }
  for (const id of block.xref.ownedBlocks ?? []) {
    const b = host.data.blocks.get(id);
    if (b) tx.update('blocks', id, { name: b.name.replace('|', '$0$') });
  }
  const { xref: _x, ...rest } = block;
  tx.put('blocks', { ...rest, kind: 'normal', explodable: true, revision: block.revision + 1 });
}
