import type { CadDocument } from '../document/document';
import { LAYER0_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type {
  AssetRecord,
  BlockRecord,
  DimStyleRecord,
  Entity,
  Id,
  LayerRecord,
  LinetypeRecord,
  MLeaderStyleRecord,
  MLineStyleRecord,
  TableStyleRecord,
  TextStyleRecord,
} from '../document/types';
import { remapDynamicBlockDef } from './remap';
import { validateBlockPackage } from './libraryArchive';

/**
 * Paquetes de bloque de la biblioteca (entre dibujos del mismo navegador). Cada paquete
 * es autocontenido: definición, entidades, bloques anidados y capas/tipos de línea/estilos usados.
 */
export interface BlockPackage {
  format: 'fmodel-block';
  version: 1;
  root: Id;
  blocks: BlockRecord[];
  entities: Entity[];
  layers: LayerRecord[];
  linetypes: LinetypeRecord[];
  textStyles: TextStyleRecord[];
  /** Dependencias añadidas de forma opcional para conservar paquetes v1 anteriores. */
  dimStyles?: DimStyleRecord[];
  mleaderStyles?: MLeaderStyleRecord[];
  tableStyles?: TableStyleRecord[];
  mlineStyles?: MLineStyleRecord[];
  assets?: AssetRecord[];
}

export type LibrarySourceKind = 'fmodel' | 'dxf' | 'dwg' | 'fmodellib';

export interface LibraryBlock {
  id: string;
  name: string;
  categoryId: string;
  tags: string[];
  description?: string;
  source?: { kind: LibrarySourceKind; file?: string; importedAt: number };
  /** tiene parámetros dinámicos (insignia y filtro) */
  dynamic: boolean;
  savedAt: number;
  thumbnail?: string;
  package: BlockPackage;
}

export function makeLibraryBlock(pkg: BlockPackage, meta: { name: string; categoryId: string; tags: string[]; description?: string; thumbnail?: string; source?: LibraryBlock['source']; id?: string }): LibraryBlock {
  const root = pkg.blocks.find((b) => b.id === pkg.root);
  return {
    id: meta.id ?? newId('lib'),
    name: meta.name,
    categoryId: meta.categoryId,
    tags: meta.tags,
    description: meta.description ?? root?.description ?? '',
    source: meta.source,
    dynamic: !!root?.dynamic,
    savedAt: Date.now(),
    thumbnail: meta.thumbnail,
    package: pkg,
  };
}

/**
 * Trae un bloque de la biblioteca al dibujo y devuelve el nombre con el que insertarlo. Si ya se
 * trajo esa misma versión, reutiliza la definición en vez de duplicarla.
 */
export function insertLibraryBlock(doc: CadDocument, item: LibraryBlock): string {
  const existing = [...doc.data.blocks.values()].find((b) => b.libraryItem === item.id && b.librarySavedAt === item.savedAt);
  if (existing) return existing.name;
  const pkg = { ...item.package, blocks: item.package.blocks.map((b) => (b.id === item.package.root ? { ...b, name: item.name } : b)) };
  const name = importBlockPackage(doc, pkg);
  const b = doc.findByName('blocks', name)!;
  doc.transact('BLOCK LIBRARY LINK', (tx) => tx.update('blocks', b.id, { libraryItem: item.id, librarySavedAt: item.savedAt }));
  return name;
}

/** Empaqueta un bloque con sus dependencias. */
export function packageBlock(doc: CadDocument, blockId: Id): BlockPackage {
  const blocks = new Map<Id, BlockRecord>();
  const entities: Entity[] = [];
  const layers = new Set<Id>();
  const linetypes = new Set<Id>();
  const textStyles = new Set<Id>();
  const dimStyles = new Set<Id>();
  const mleaderStyles = new Set<Id>();
  const tableStyles = new Set<Id>();
  const mlineStyles = new Set<Id>();
  const assets = new Set<Id>();
  const visit = (id: Id) => {
    if (blocks.has(id)) return;
    const b = doc.data.blocks.get(id);
    if (!b) return;
    blocks.set(id, b);
    for (const e of doc.entitiesOf(id)) {
      entities.push(e);
      layers.add(e.layer);
      if (e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock') linetypes.add(e.linetype);
      if (e.type === 'text' || e.type === 'mtext' || e.type === 'attdef') textStyles.add(e.style);
      if (e.type === 'dimension' || e.type === 'leader') dimStyles.add(e.style);
      if (e.type === 'dimension' && e.overrides.textStyle) textStyles.add(e.overrides.textStyle);
      if (e.type === 'mleader') {
        mleaderStyles.add(e.style);
        if (e.overrides?.textStyle) textStyles.add(e.overrides.textStyle);
      }
      if (e.type === 'table') tableStyles.add(e.style);
      if (e.type === 'mline') mlineStyles.add(e.style);
      if (e.type === 'image' || e.type === 'pdfunderlay') assets.add(e.assetId);
      if (e.type === 'insert') visit(e.blockId);
      if (e.type === 'array') visit(e.sourceBlockId);
      if (e.type === 'mleader') {
        if (e.content.type === 'block') visit(e.content.blockId);
        if (e.overrides?.blockId) visit(e.overrides.blockId);
      }
    }
  };
  visit(blockId);
  // Cerrar dependencias transitivas: estilos → texto/tipos de línea/bloques.
  while (true) {
    const before = [blocks.size, layers.size, linetypes.size, textStyles.size, dimStyles.size, mleaderStyles.size, tableStyles.size, mlineStyles.size].join(':');
    for (const l of layers) {
      const lr = doc.data.layers.get(l);
      if (lr) linetypes.add(lr.linetype);
    }
    for (const id of dimStyles) {
      const style = doc.data.dimStyles.get(id);
      if (style?.textStyle) textStyles.add(style.textStyle);
    }
    for (const id of mleaderStyles) {
      const style = doc.data.mleaderStyles.get(id);
      if (style?.textStyle) textStyles.add(style.textStyle);
      if (style?.blockId) visit(style.blockId);
    }
    for (const id of tableStyles) {
      const style = doc.data.tableStyles.get(id);
      if (style?.textStyle) textStyles.add(style.textStyle);
    }
    for (const id of mlineStyles) {
      const style = doc.data.mlineStyles.get(id);
      for (const element of style?.elements ?? []) {
        if (element.linetype !== 'ByLayer' && element.linetype !== 'ByBlock') linetypes.add(element.linetype);
      }
    }
    const after = [blocks.size, layers.size, linetypes.size, textStyles.size, dimStyles.size, mleaderStyles.size, tableStyles.size, mlineStyles.size].join(':');
    if (before === after) break;
  }
  return {
    format: 'fmodel-block',
    version: 1,
    root: blockId,
    blocks: [...blocks.values()],
    entities,
    layers: [...layers].map((id) => doc.data.layers.get(id)).filter(Boolean) as LayerRecord[],
    linetypes: [...linetypes].map((id) => doc.data.linetypes.get(id)).filter(Boolean) as LinetypeRecord[],
    textStyles: [...textStyles].map((id) => doc.data.textStyles.get(id)).filter(Boolean).map((style) => structuredClone(style!)),
    dimStyles: [...dimStyles].map((id) => doc.data.dimStyles.get(id)).filter(Boolean).map((style) => structuredClone(style!)),
    mleaderStyles: [...mleaderStyles].map((id) => doc.data.mleaderStyles.get(id)).filter(Boolean).map((style) => structuredClone(style!)),
    tableStyles: [...tableStyles].map((id) => doc.data.tableStyles.get(id)).filter(Boolean).map((style) => structuredClone(style!)),
    mlineStyles: [...mlineStyles].map((id) => doc.data.mlineStyles.get(id)).filter(Boolean).map((style) => structuredClone(style!)),
    assets: [...assets].map((id) => doc.data.assets.get(id)).filter(Boolean).map((asset) => structuredClone(asset!)),
  };
}

/**
 * Importa un paquete: reasigna IDs, fusiona capas/estilos por nombre y resuelve
 * conflictos de nombre de bloque añadiendo un sufijo. Devuelve el nombre final.
 */
export function importBlockPackage(doc: CadDocument, pkg: BlockPackage): string {
  validateBlockPackage(pkg);
  return doc.transact('BLOCK IMPORT', (tx) => {
    const idMap = new Map<Id, Id>();
    const mapLayer = new Map<Id, Id>();
    const mapLt = new Map<Id, Id>();
    const mapTextStyle = new Map<Id, Id>();
    const mapDimStyle = new Map<Id, Id>();
    const mapMLeaderStyle = new Map<Id, Id>();
    const mapTableStyle = new Map<Id, Id>();
    const mapMLineStyle = new Map<Id, Id>();
    const mapAsset = new Map<Id, Id>();
    for (const lt of pkg.linetypes) {
      const existing = doc.findByName('linetypes', lt.name);
      if (existing) mapLt.set(lt.id, existing.id);
      else {
        const id = newId('lt');
        tx.add('linetypes', { ...lt, id });
        mapLt.set(lt.id, id);
      }
    }
    for (const l of pkg.layers) {
      if (l.id === LAYER0_ID || l.name === '0') {
        mapLayer.set(l.id, LAYER0_ID);
        continue;
      }
      const existing = doc.findByName('layers', l.name);
      if (existing) mapLayer.set(l.id, existing.id);
      else {
        const id = newId('layer');
        tx.add('layers', { ...l, id, linetype: mapLt.get(l.linetype) ?? l.linetype });
        mapLayer.set(l.id, id);
      }
    }
    for (const s of pkg.textStyles) {
      const existing = doc.findByName('textStyles', s.name);
      if (existing) mapTextStyle.set(s.id, existing.id);
      else {
        const id = newId('ts');
        tx.add('textStyles', { ...s, id });
        mapTextStyle.set(s.id, id);
      }
    }
    let rootName = '';
    for (const b of pkg.blocks) {
      let name = b.name;
      const existing = doc.findByName('blocks', name);
      if (existing) {
        let i = 2;
        while (doc.findByName('blocks', `${b.name} (${i})`)) i++;
        name = `${b.name} (${i})`;
      }
      const id = newId('blk');
      idMap.set(b.id, id);
      if (b.id === pkg.root) rootName = name;
      tx.add('blocks', { ...structuredClone(b), id, name, revision: 1 });
    }
    for (const style of pkg.dimStyles ?? []) {
      const existing = doc.findByName('dimStyles', style.name);
      const id = existing?.id ?? newId('ds');
      mapDimStyle.set(style.id, id);
      if (!existing) tx.add('dimStyles', { ...structuredClone(style), id, textStyle: mapTextStyle.get(style.textStyle) ?? style.textStyle });
    }
    for (const style of pkg.mleaderStyles ?? []) {
      const existing = doc.findByName('mleaderStyles', style.name);
      const id = existing?.id ?? newId('mls');
      mapMLeaderStyle.set(style.id, id);
      if (!existing) tx.add('mleaderStyles', {
        ...structuredClone(style),
        id,
        textStyle: mapTextStyle.get(style.textStyle) ?? style.textStyle,
        ...(style.blockId ? { blockId: idMap.get(style.blockId) ?? style.blockId } : {}),
      });
    }
    for (const style of pkg.tableStyles ?? []) {
      const existing = doc.findByName('tableStyles', style.name);
      const id = existing?.id ?? newId('tbs');
      mapTableStyle.set(style.id, id);
      if (!existing) tx.add('tableStyles', { ...structuredClone(style), id, textStyle: mapTextStyle.get(style.textStyle) ?? style.textStyle });
    }
    for (const style of pkg.mlineStyles ?? []) {
      const existing = doc.findByName('mlineStyles', style.name);
      const id = existing?.id ?? newId('mlns');
      mapMLineStyle.set(style.id, id);
      if (!existing) tx.add('mlineStyles', {
        ...structuredClone(style),
        id,
        elements: style.elements.map((element) => ({ ...element, linetype: mapLt.get(element.linetype) ?? element.linetype })),
      });
    }
    for (const asset of pkg.assets ?? []) {
      const existing = [...doc.data.assets.values()].find((candidate) => candidate.mime === asset.mime && candidate.dataUrl === asset.dataUrl);
      const id = existing?.id ?? newId('asset');
      mapAsset.set(asset.id, id);
      if (!existing) tx.add('assets', { ...structuredClone(asset), id });
    }
    // remapear referencias internas de dinámicos (ids de entidades)
    const entityMap = new Map<Id, Id>();
    for (const e of pkg.entities) entityMap.set(e.id, newId());
    for (const b of pkg.blocks) {
      const nb = doc.data.blocks.get(idMap.get(b.id)!);
      if (nb?.dynamic) {
        const dyn = remapDynamicBlockDef(nb.dynamic, entityMap);
        tx.update('blocks', nb.id, { dynamic: dyn });
      }
    }
    for (const e of pkg.entities) {
      const clone = structuredClone(e) as Entity & { style?: string; blockId?: Id; sourceBlockId?: Id };
      clone.id = entityMap.get(e.id)!;
      clone.owner = idMap.get(e.owner) ?? e.owner;
      clone.layer = mapLayer.get(e.layer) ?? LAYER0_ID;
      if (clone.linetype !== 'ByLayer' && clone.linetype !== 'ByBlock') clone.linetype = mapLt.get(clone.linetype) ?? 'ByLayer';
      if (clone.type === 'text' || clone.type === 'mtext' || clone.type === 'attdef') {
        clone.style = mapTextStyle.get(clone.style) ?? clone.style;
      } else if (clone.type === 'dimension' || clone.type === 'leader') {
        clone.style = mapDimStyle.get(clone.style) ?? clone.style;
        if (clone.type === 'dimension') {
          clone.assoc = clone.assoc?.map((ref) => ({ ...ref, entityId: entityMap.get(ref.entityId) ?? ref.entityId }));
          if (clone.overrides.textStyle) clone.overrides.textStyle = mapTextStyle.get(clone.overrides.textStyle) ?? clone.overrides.textStyle;
        }
        if (clone.type === 'leader' && clone.annotation) clone.annotation = entityMap.get(clone.annotation) ?? clone.annotation;
      } else if (clone.type === 'mleader') {
        clone.style = mapMLeaderStyle.get(clone.style) ?? clone.style;
        if (clone.overrides?.textStyle) clone.overrides.textStyle = mapTextStyle.get(clone.overrides.textStyle) ?? clone.overrides.textStyle;
        if (clone.overrides?.blockId) clone.overrides.blockId = idMap.get(clone.overrides.blockId) ?? clone.overrides.blockId;
      } else if (clone.type === 'table') {
        clone.style = mapTableStyle.get(clone.style) ?? clone.style;
      } else if (clone.type === 'mline') {
        clone.style = mapMLineStyle.get(clone.style) ?? clone.style;
      }
      if (clone.type === 'insert') clone.blockId = idMap.get(clone.blockId!) ?? clone.blockId!;
      if (clone.type === 'array') clone.sourceBlockId = idMap.get(clone.sourceBlockId!) ?? clone.sourceBlockId!;
      if (clone.type === 'mleader' && clone.content.type === 'block') {
        clone.content.blockId = idMap.get(clone.content.blockId) ?? clone.content.blockId;
      }
      if (clone.type === 'hatch') clone.associative = clone.associative?.map((id) => entityMap.get(id) ?? id);
      if ((clone.type === 'image' || clone.type === 'pdfunderlay') && mapAsset.has(clone.assetId)) clone.assetId = mapAsset.get(clone.assetId)!;
      const { order: _o, ...rest } = clone;
      tx.addEntity(rest as never);
    }
    return rootName;
  });
}
