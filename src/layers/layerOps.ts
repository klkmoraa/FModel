import type { CadDocument, Transaction } from '../document/document';
import { DEFPOINTS_LAYER_ID, LAYER0_ID, LT_CONTINUOUS_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type { Id, LayerFilterRecord, LayerRecord, LayerStateRecord } from '../document/types';

/** Caracteres no válidos en nombres de capa (compatibilidad DXF/DWG). */
export const INVALID_NAME_CHARS = /[<>/\\":;?*|=`]/;

export function validateLayerName(doc: CadDocument, name: string, exceptId?: Id): { ok: true } | { ok: false; es: string; en: string } {
  const n = name.trim();
  if (!n) return { ok: false, es: 'El nombre no puede estar vacío.', en: 'Name cannot be empty.' };
  if (n.length > 255) return { ok: false, es: 'El nombre supera 255 caracteres.', en: 'Name exceeds 255 characters.' };
  if (INVALID_NAME_CHARS.test(n)) return { ok: false, es: 'El nombre contiene caracteres no válidos: < > / \\ " : ; ? * | = `', en: 'Name contains invalid characters: < > / \\ " : ; ? * | = `' };
  for (const l of doc.data.layers.values()) {
    if (l.id !== exceptId && l.name.toLowerCase() === n.toLowerCase()) return { ok: false, es: `Ya existe la capa «${l.name}».`, en: `Layer "${l.name}" already exists.` };
  }
  return { ok: true };
}

export function layerUsage(doc: CadDocument): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const e of doc.data.entities.values()) m.set(e.layer, (m.get(e.layer) ?? 0) + 1);
  return m;
}

export function uniqueLayerName(doc: CadDocument, base: string): string {
  let name = base;
  let i = 1;
  while ([...doc.data.layers.values()].some((l) => l.name.toLowerCase() === name.toLowerCase())) name = `${base}${++i > 1 ? i : ''}`;
  return name;
}

export function createLayer(tx: Transaction, doc: CadDocument, props: Partial<LayerRecord> = {}): LayerRecord {
  const name = props.name ?? uniqueLayerName(doc, 'Capa1');
  const v = validateLayerName(doc, name);
  if (!v.ok) throw new Error(v.es);
  const layer: LayerRecord = {
    id: newId('layer'),
    name,
    color: 'aci:7',
    linetype: LT_CONTINUOUS_ID,
    lineweight: -3,
    transparency: 0,
    on: true,
    frozen: false,
    locked: false,
    plot: true,
    description: '',
    order: Math.max(0, ...[...doc.data.layers.values()].map((l) => l.order)) + 1,
    ...props,
  };
  tx.add('layers', layer);
  return layer;
}

export function canDeleteLayer(doc: CadDocument, id: Id): { ok: true } | { ok: false; es: string; en: string } {
  if (id === LAYER0_ID || id === DEFPOINTS_LAYER_ID) return { ok: false, es: 'Las capas 0 y Defpoints no se pueden eliminar.', en: 'Layers 0 and Defpoints cannot be deleted.' };
  if (doc.settings.currentLayer === id) return { ok: false, es: 'No se puede eliminar la capa actual.', en: 'The current layer cannot be deleted.' };
  const used = layerUsage(doc).get(id) ?? 0;
  if (used) return { ok: false, es: `La capa contiene ${used} objeto(s). Muévelos o usa LAYMRG para fusionarla.`, en: `The layer holds ${used} object(s). Move them or use LAYMRG to merge it.` };
  return { ok: true };
}

/** Fusiona capas en una destino moviendo sus objetos (LAYMRG). */
export function mergeLayers(tx: Transaction, doc: CadDocument, sources: Id[], target: Id): number {
  let n = 0;
  for (const e of [...doc.data.entities.values()]) {
    if (sources.includes(e.layer)) {
      tx.updateEntity(e.id, { layer: target });
      n++;
    }
  }
  for (const s of sources) if (s !== target && s !== LAYER0_ID && s !== DEFPOINTS_LAYER_ID) tx.remove('layers', s);
  return n;
}

export function purgeEmptyLayers(tx: Transaction, doc: CadDocument): string[] {
  const usage = layerUsage(doc);
  const removed: string[] = [];
  for (const l of [...doc.data.layers.values()]) {
    if (l.id === LAYER0_ID || l.id === DEFPOINTS_LAYER_ID || l.id === doc.settings.currentLayer) continue;
    if (usage.get(l.id)) continue;
    const inViewportOverrides = [...doc.data.entities.values()].some((e) => e.type === 'viewport' && (e.frozenLayers.includes(l.id) || l.id in e.layerOverrides));
    if (inViewportOverrides) continue;
    tx.remove('layers', l.id);
    removed.push(l.name);
  }
  return removed;
}

/** LAYISO: deja visibles solo las capas dadas (apaga o bloquea el resto) y guarda el estado previo. */
export function isolateLayers(tx: Transaction, doc: CadDocument, keep: Id[], mode: 'off' | 'lock'): void {
  const state = captureLayerState(doc, '__LAYISO__', 'Estado previo a LAYISO');
  const prev = [...doc.data.layerStates.values()].find((s) => s.name === '__LAYISO__');
  tx.put('layerStates', { ...state, id: prev?.id ?? state.id });
  for (const l of doc.data.layers.values()) {
    if (keep.includes(l.id)) tx.update('layers', l.id, { on: true, frozen: false, locked: false });
    else tx.update('layers', l.id, mode === 'off' ? { on: false } : { locked: true });
  }
  if (!keep.includes(doc.settings.currentLayer) && keep.length) tx.setSettings({ currentLayer: keep[0] });
}

export function unisolateLayers(tx: Transaction, doc: CadDocument): boolean {
  const s = [...doc.data.layerStates.values()].find((x) => x.name === '__LAYISO__');
  if (!s) return false;
  restoreLayerState(tx, doc, s);
  tx.remove('layerStates', s.id);
  return true;
}

export function captureLayerState(doc: CadDocument, name: string, description = ''): LayerStateRecord {
  const layers: LayerStateRecord['layers'] = {};
  for (const l of doc.data.layers.values()) layers[l.id] = { on: l.on, frozen: l.frozen, locked: l.locked, plot: l.plot, color: l.color, linetype: l.linetype, lineweight: l.lineweight, transparency: l.transparency };
  return { id: newId('lstate'), name, description, layers, currentLayer: doc.settings.currentLayer };
}

export function restoreLayerState(tx: Transaction, doc: CadDocument, state: LayerStateRecord) {
  for (const [id, props] of Object.entries(state.layers)) if (doc.data.layers.has(id)) tx.update('layers', id, props);
  if (doc.data.layers.has(state.currentLayer)) tx.setSettings({ currentLayer: state.currentLayer });
}

/** Comodines estilo AutoCAD: * ? # @ . ~ (negación al inicio). */
export function wildcardMatch(pattern: string, text: string): boolean {
  const p = pattern.trim();
  if (!p) return true;
  return p.split(',').some((part) => {
    let q = part.trim();
    let negate = false;
    if (q.startsWith('~')) {
      negate = true;
      q = q.slice(1);
    }
    const re = new RegExp(
      `^${q
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/#/g, '\\d')
        .replace(/@/g, '[A-Za-z]')}$`,
      'i',
    );
    return re.test(text) !== negate;
  });
}

export function layerMatchesFilter(doc: CadDocument, l: LayerRecord, f: LayerFilterRecord, usage: Map<Id, number>): boolean {
  if (f.layers) return f.layers.includes(l.id);
  const r = f.rule;
  if (r.name && !wildcardMatch(r.name, l.name)) return false;
  if (r.color && l.color !== r.color) return false;
  if (r.on !== undefined && l.on !== r.on) return false;
  if (r.frozen !== undefined && l.frozen !== r.frozen) return false;
  if (r.locked !== undefined && l.locked !== r.locked) return false;
  if (r.used !== undefined && !!usage.get(l.id) !== r.used) return false;
  void doc;
  return true;
}
