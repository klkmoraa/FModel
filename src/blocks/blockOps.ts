import type { Vec2 } from '../geometry/vec';
import type { CadDocument, Transaction } from '../document/document';
import { unitConversion } from '../document/defaults';
import { newId } from '../document/ids';
import type { AttdefEntity, BlockRecord, DrawingUnits, Entity, Id, InsertEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';

export const INVALID_BLOCK_CHARS = /[<>/\\":;?*|=`]/;

export function validateBlockName(doc: CadDocument, name: string, exceptId?: Id): string | null {
  const n = name.trim();
  if (!n) return 'El nombre del bloque no puede estar vacío. / Block name cannot be empty.';
  if (INVALID_BLOCK_CHARS.test(n)) return 'Caracteres no válidos en el nombre. / Invalid characters in name.';
  if (n.startsWith('*')) return 'Los nombres que empiezan por * están reservados. / Names starting with * are reserved.';
  for (const b of doc.data.blocks.values()) if (b.id !== exceptId && b.name.toLowerCase() === n.toLowerCase()) return `Ya existe el bloque «${b.name}». / Block "${b.name}" already exists.`;
  return null;
}

/** ¿Insertar `childId` dentro de `parentId` crearía una referencia circular? */
export function wouldCreateCycle(doc: CadDocument, parentId: Id, childId: Id): boolean {
  if (parentId === childId) return true;
  const seen = new Set<Id>();
  const stack = [childId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of doc.entitiesOf(id)) {
      if (e.type === 'insert') stack.push(e.blockId);
      if (e.type === 'array') stack.push(e.sourceBlockId);
      if (e.type === 'mleader' && e.content.type === 'block') stack.push(e.content.blockId);
    }
  }
  return false;
}

export function blockUsage(doc: CadDocument): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const e of doc.data.entities.values()) {
    const id = e.type === 'insert' ? e.blockId : e.type === 'array' ? e.sourceBlockId : e.type === 'mleader' && e.content.type === 'block' ? e.content.blockId : null;
    if (id) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export interface CreateBlockOptions {
  name: string;
  basePoint: Vec2;
  ids: Id[];
  /** 'convert' reemplaza por una instancia; 'delete' elimina; 'retain' conserva */
  mode: 'convert' | 'delete' | 'retain';
  description?: string;
  units?: DrawingUnits;
  annotative?: boolean;
  explodable?: boolean;
  scaleUniformly?: boolean;
  category?: string;
}

/** Crea una definición a partir de objetos. Las entidades de la definición guardan sus coordenadas originales; el punto base se aplica en la inserción. */
export function createBlock(tx: Transaction, doc: CadDocument, o: CreateBlockOptions): { block: BlockRecord; insert?: InsertEntity } {
  const err = validateBlockName(doc, o.name);
  if (err) throw new Error(err);
  const blockId = newId('blk');
  const block: BlockRecord = {
    id: blockId,
    name: o.name.trim(),
    kind: 'normal',
    basePoint: o.basePoint,
    description: o.description ?? '',
    units: o.units ?? doc.settings.insUnits,
    explodable: o.explodable ?? true,
    scaleUniformly: o.scaleUniformly ?? false,
    annotative: o.annotative ?? false,
    category: o.category,
    revision: 1,
  };
  tx.add('blocks', block);
  let owner: Id = MODEL_SPACE_ID;
  const attdefs: AttdefEntity[] = [];
  for (const id of o.ids) {
    const e = doc.entity(id);
    if (!e) continue;
    owner = e.owner;
    if (e.type === 'insert' && wouldCreateCycle(doc, blockId, e.blockId)) continue;
    const { id: _i, order: _o, ...rest } = e;
    const copy = tx.addEntity({ ...structuredClone(rest), owner: blockId } as never) as Entity;
    if (copy.type === 'attdef') attdefs.push(copy);
    if (o.mode !== 'retain') tx.removeEntity(id);
  }
  let insert: InsertEntity | undefined;
  if (o.mode === 'convert') {
    const first = doc.entity(o.ids[0]) ?? null;
    insert = tx.addEntity<InsertEntity>({
      type: 'insert',
      owner,
      layer: first?.layer ?? doc.settings.currentLayer,
      color: 'ByLayer',
      linetype: 'ByLayer',
      linetypeScale: 1,
      lineweight: -1,
      transparency: 'ByLayer',
      visible: true,
      blockId,
      position: o.basePoint,
      scale: { x: 1, y: 1 },
      rotation: 0,
      attributes: attdefs.map((a) => ({ tag: a.tag, value: a.defaultValue })),
    });
  }
  return { block, insert };
}

/** Factor de escala automático entre unidades del bloque y del dibujo. */
export function autoScaleFactor(doc: CadDocument, block: BlockRecord): number {
  if (block.units === 'unitless' || doc.settings.insUnits === 'unitless') return 1;
  return unitConversion(block.units, doc.settings.insUnits);
}

export function insertBlock(tx: Transaction, doc: CadDocument, blockId: Id, owner: Id, position: Vec2, scale: Vec2 = { x: 1, y: 1 }, rotation = 0, attributes: Record<string, string> = {}): InsertEntity {
  const block = doc.data.blocks.get(blockId);
  if (!block) throw new Error('Bloque inexistente. / Block not found.');
  if (doc.data.blocks.has(owner) && wouldCreateCycle(doc, owner, blockId)) throw new Error('Referencia circular: el bloque se contendría a sí mismo. / Circular reference: block would contain itself.');
  const k = autoScaleFactor(doc, block);
  const attdefs = doc.entitiesOf(blockId).filter((e): e is AttdefEntity => e.type === 'attdef' && !e.constant);
  const s = doc.settings;
  return tx.addEntity<InsertEntity>({
    type: 'insert',
    owner,
    layer: s.currentLayer,
    color: s.currentColor,
    linetype: s.currentLinetype,
    linetypeScale: 1,
    lineweight: s.currentLineweight,
    transparency: s.currentTransparency,
    visible: true,
    blockId,
    position,
    scale: { x: scale.x * k, y: (block.scaleUniformly ? scale.x : scale.y) * k },
    rotation,
    attributes: attdefs.map((a) => ({ tag: a.tag, value: attributes[a.tag] ?? a.defaultValue })),
    annotative: block.annotative || undefined,
  });
}

/** Redefine una definición con nuevos objetos (actualiza todas las instancias). */
export function redefineBlock(tx: Transaction, doc: CadDocument, blockId: Id, entities: Entity[], basePoint?: Vec2) {
  const block = doc.data.blocks.get(blockId);
  if (!block) throw new Error('Bloque inexistente.');
  for (const e of doc.entitiesOf(blockId)) tx.removeEntity(e.id);
  for (const e of entities) {
    const { id: _i, order: _o, ...rest } = e;
    tx.addEntity({ ...structuredClone(rest), owner: blockId } as never);
  }
  tx.update('blocks', blockId, { revision: block.revision + 1, basePoint: basePoint ?? block.basePoint });
}

export function purgeUnusedBlocks(tx: Transaction, doc: CadDocument): string[] {
  const removed: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    const usage = blockUsage(doc);
    for (const b of [...doc.data.blocks.values()]) {
      if (b.kind === 'xref' || usage.get(b.id)) continue;
      if (b.favorite || b.library === 'shared') continue;
      for (const e of doc.entitiesOf(b.id)) tx.removeEntity(e.id);
      tx.remove('blocks', b.id);
      removed.push(b.name);
      changed = true;
    }
  }
  return removed;
}

export interface AttributeRow {
  handle: Id;
  block: string;
  layer: string;
  x: number;
  y: number;
  rotation: number;
  values: Record<string, string>;
}

/** Extracción de atributos (DATAEXTRACTION / ATTEXT). */
export function extractAttributes(doc: CadDocument, filter?: (b: BlockRecord) => boolean): { tags: string[]; rows: AttributeRow[] } {
  const tags = new Set<string>();
  const rows: AttributeRow[] = [];
  for (const e of doc.data.entities.values()) {
    if (e.type !== 'insert') continue;
    const b = doc.data.blocks.get(e.blockId);
    if (!b || (filter && !filter(b))) continue;
    const defs = doc.entitiesOf(b.id).filter((x): x is AttdefEntity => x.type === 'attdef');
    if (!defs.length && !e.attributes.length) continue;
    const values: Record<string, string> = {};
    for (const d of defs) {
      const v = e.attributes.find((a) => a.tag.toUpperCase() === d.tag.toUpperCase());
      values[d.tag] = v?.value ?? d.defaultValue;
      tags.add(d.tag);
    }
    rows.push({ handle: e.id, block: b.name, layer: doc.data.layers.get(e.layer)?.name ?? '', x: e.position.x, y: e.position.y, rotation: (e.rotation * 180) / Math.PI, values });
  }
  return { tags: [...tags].sort(), rows };
}

export function attributesToCsv(data: { tags: string[]; rows: AttributeRow[] }, sep = ','): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Handle', 'Block', 'Layer', 'X', 'Y', 'Rotation', ...data.tags];
  const lines = [head.join(sep)];
  for (const r of data.rows) lines.push([r.handle, r.block, r.layer, r.x.toFixed(6), r.y.toFixed(6), r.rotation.toFixed(4), ...data.tags.map((t) => r.values[t] ?? '')].map(esc).join(sep));
  return lines.join('\n');
}
