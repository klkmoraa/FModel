import type { CadDocument, Transaction } from '../document/document';
import { DEFPOINTS_LAYER_ID, LAYER0_ID, LT_CONTINUOUS_ID, TEXTSTYLE_STANDARD_ID } from '../document/defaults';
import type { Id } from '../document/types';
import { blockUsage } from '../blocks/blockOps';

export type PurgeCategory = 'layers' | 'linetypes' | 'textStyles' | 'dimStyles' | 'mleaderStyles' | 'tableStyles' | 'mlineStyles' | 'blocks' | 'groups';

export interface PurgeItem {
  category: PurgeCategory;
  id: Id;
  name: string;
}

/** Elementos con nombre que no usa ningún objeto ni estilo (PURGE). */
export function findUnused(doc: CadDocument): PurgeItem[] {
  const d = doc.data;
  const s = doc.settings;
  const usedLayers = new Set<Id>([LAYER0_ID, DEFPOINTS_LAYER_ID, s.currentLayer]);
  const usedLt = new Set<Id>([LT_CONTINUOUS_ID]);
  const usedTs = new Set<Id>([TEXTSTYLE_STANDARD_ID, s.currentTextStyle]);
  const usedDs = new Set<Id>([s.currentDimStyle]);
  const usedMls = new Set<Id>([s.currentMLeaderStyle]);
  const usedTbs = new Set<Id>([s.currentTableStyle]);
  const usedMlns = new Set<Id>([s.currentMLineStyle]);
  if (s.currentLinetype !== 'ByLayer' && s.currentLinetype !== 'ByBlock') usedLt.add(s.currentLinetype);
  for (const e of d.entities.values()) {
    usedLayers.add(e.layer);
    if (e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock') usedLt.add(e.linetype);
    const style = (e as { style?: Id }).style;
    if (style) {
      if (e.type === 'text' || e.type === 'mtext' || e.type === 'attdef') usedTs.add(style);
      if (e.type === 'dimension' || e.type === 'leader') usedDs.add(style);
      if (e.type === 'mleader') usedMls.add(style);
      if (e.type === 'table') usedTbs.add(style);
      if (e.type === 'mline') usedMlns.add(style);
    }
    if (e.type === 'viewport') e.frozenLayers.forEach((l) => usedLayers.add(l));
  }
  for (const l of d.layers.values()) usedLt.add(l.linetype);
  for (const ds of d.dimStyles.values()) usedTs.add(ds.textStyle);
  for (const ml of d.mleaderStyles.values()) usedTs.add(ml.textStyle);
  for (const t of d.tableStyles.values()) usedTs.add(t.textStyle);
  for (const m of d.mlineStyles.values()) for (const el of m.elements) if (el.linetype !== 'ByLayer' && el.linetype !== 'ByBlock') usedLt.add(el.linetype);
  const bu = blockUsage(doc);
  const items: PurgeItem[] = [];
  const push = (category: PurgeCategory, id: Id, name: string) => items.push({ category, id, name });
  for (const l of d.layers.values()) if (!usedLayers.has(l.id)) push('layers', l.id, l.name);
  for (const l of d.linetypes.values()) if (!usedLt.has(l.id)) push('linetypes', l.id, l.name);
  for (const t of d.textStyles.values()) if (!usedTs.has(t.id) && t.name !== 'Standard') push('textStyles', t.id, t.name);
  for (const t of d.dimStyles.values()) if (!usedDs.has(t.id) && t.name !== 'Standard') push('dimStyles', t.id, t.name);
  for (const t of d.mleaderStyles.values()) if (!usedMls.has(t.id) && t.name !== 'Standard') push('mleaderStyles', t.id, t.name);
  for (const t of d.tableStyles.values()) if (!usedTbs.has(t.id) && t.name !== 'Standard') push('tableStyles', t.id, t.name);
  for (const t of d.mlineStyles.values()) if (!usedMlns.has(t.id) && t.name !== 'Standard') push('mlineStyles', t.id, t.name);
  for (const b of d.blocks.values()) if (!bu.get(b.id) && b.kind !== 'xref' && !b.favorite) push('blocks', b.id, b.name);
  for (const g of d.groups.values()) if (!g.members.some((m) => d.entities.has(m))) push('groups', g.id, g.name);
  return items;
}

/** Aplica la limpieza iterativamente (bloques anidados pueden liberar otros elementos). */
export function purge(tx: Transaction, doc: CadDocument, categories: PurgeCategory[] | 'all'): PurgeItem[] {
  const removed: PurgeItem[] = [];
  for (let pass = 0; pass < 10; pass++) {
    const items = findUnused(doc).filter((i) => categories === 'all' || categories.includes(i.category));
    if (!items.length) break;
    for (const it of items) {
      if (it.category === 'blocks') for (const e of doc.entitiesOf(it.id)) tx.removeEntity(e.id);
      tx.remove(it.category, it.id);
      removed.push(it);
    }
  }
  return removed;
}
