import type { CadDocument } from '../document/document';
import { LAYER0_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type { BlockRecord, Entity, Id, LayerRecord, LinetypeRecord, TextStyleRecord } from '../document/types';

/**
 * Biblioteca compartida de bloques (entre dibujos del mismo navegador). Cada paquete
 * es autocontenido: definición, entidades, bloques anidados y capas/tipos de línea/estilos usados.
 */
export interface LibraryBlock {
  id: string;
  name: string;
  category?: string;
  savedAt: number;
  thumbnail?: string;
  package: BlockPackage;
}

export interface BlockPackage {
  format: 'fmodel-block';
  version: 1;
  root: Id;
  blocks: BlockRecord[];
  entities: Entity[];
  layers: LayerRecord[];
  linetypes: LinetypeRecord[];
  textStyles: TextStyleRecord[];
}

const KEY = 'fmodel.cad.blocklibrary.v1';

export function loadLibrary(): LibraryBlock[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LibraryBlock[];
  } catch {
    return [];
  }
}

function saveLibrary(items: LibraryBlock[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    throw new Error('No hay espacio de almacenamiento local para la biblioteca. / Local storage full.');
  }
}

export function removeFromLibrary(id: string): LibraryBlock[] {
  const items = loadLibrary().filter((b) => b.id !== id);
  saveLibrary(items);
  return items;
}

/** Empaqueta un bloque con sus dependencias. */
export function packageBlock(doc: CadDocument, blockId: Id): BlockPackage {
  const blocks = new Map<Id, BlockRecord>();
  const entities: Entity[] = [];
  const layers = new Set<Id>();
  const linetypes = new Set<Id>();
  const styles = new Set<Id>();
  const visit = (id: Id) => {
    if (blocks.has(id)) return;
    const b = doc.data.blocks.get(id);
    if (!b) return;
    blocks.set(id, b);
    for (const e of doc.entitiesOf(id)) {
      entities.push(e);
      layers.add(e.layer);
      if (e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock') linetypes.add(e.linetype);
      const st = (e as { style?: string }).style;
      if (st) styles.add(st);
      if (e.type === 'insert') visit(e.blockId);
      if (e.type === 'array') visit(e.sourceBlockId);
    }
  };
  visit(blockId);
  for (const l of layers) {
    const lr = doc.data.layers.get(l);
    if (lr) linetypes.add(lr.linetype);
  }
  return {
    format: 'fmodel-block',
    version: 1,
    root: blockId,
    blocks: [...blocks.values()],
    entities,
    layers: [...layers].map((id) => doc.data.layers.get(id)).filter(Boolean) as LayerRecord[],
    linetypes: [...linetypes].map((id) => doc.data.linetypes.get(id)).filter(Boolean) as LinetypeRecord[],
    textStyles: [...styles].map((id) => doc.data.textStyles.get(id)).filter(Boolean) as TextStyleRecord[],
  };
}

export function saveToLibrary(doc: CadDocument, blockId: Id, thumbnail?: string): LibraryBlock {
  const b = doc.data.blocks.get(blockId);
  if (!b) throw new Error('Bloque inexistente.');
  const items = loadLibrary().filter((x) => x.name.toLowerCase() !== b.name.toLowerCase());
  const item: LibraryBlock = { id: newId('lib'), name: b.name, category: b.category, savedAt: Date.now(), thumbnail, package: packageBlock(doc, blockId) };
  items.push(item);
  saveLibrary(items);
  return item;
}

/**
 * Importa un paquete: reasigna IDs, fusiona capas/estilos por nombre y resuelve
 * conflictos de nombre de bloque añadiendo un sufijo. Devuelve el nombre final.
 */
export function importBlockPackage(doc: CadDocument, pkg: BlockPackage): string {
  return doc.transact('BLOCK IMPORT', (tx) => {
    const idMap = new Map<Id, Id>();
    const mapLayer = new Map<Id, Id>();
    const mapLt = new Map<Id, Id>();
    const mapStyle = new Map<Id, Id>();
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
      if (existing) mapStyle.set(s.id, existing.id);
      else {
        const id = newId('ts');
        tx.add('textStyles', { ...s, id });
        mapStyle.set(s.id, id);
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
    // remapear referencias internas de dinámicos (ids de entidades)
    const entityMap = new Map<Id, Id>();
    for (const e of pkg.entities) entityMap.set(e.id, newId());
    for (const b of pkg.blocks) {
      const nb = doc.data.blocks.get(idMap.get(b.id)!);
      if (nb?.dynamic) {
        const json = JSON.stringify(nb.dynamic).replace(/"([^"]+)"/g, (m, s: string) => (entityMap.has(s) ? `"${entityMap.get(s)}"` : m));
        tx.update('blocks', nb.id, { dynamic: JSON.parse(json) });
      }
    }
    for (const e of pkg.entities) {
      const clone = structuredClone(e) as Entity & { style?: string; blockId?: Id; sourceBlockId?: Id };
      clone.id = entityMap.get(e.id)!;
      clone.owner = idMap.get(e.owner) ?? e.owner;
      clone.layer = mapLayer.get(e.layer) ?? LAYER0_ID;
      if (clone.linetype !== 'ByLayer' && clone.linetype !== 'ByBlock') clone.linetype = mapLt.get(clone.linetype) ?? 'ByLayer';
      if (clone.style && mapStyle.has(clone.style)) clone.style = mapStyle.get(clone.style);
      if (clone.type === 'insert') clone.blockId = idMap.get(clone.blockId!) ?? clone.blockId!;
      if (clone.type === 'array') clone.sourceBlockId = idMap.get(clone.sourceBlockId!) ?? clone.sourceBlockId!;
      const { order: _o, ...rest } = clone;
      tx.addEntity(rest as never);
    }
    return rootName;
  });
}

export function importLibraryBlock(doc: CadDocument, item: LibraryBlock): string {
  return importBlockPackage(doc, item.package);
}
