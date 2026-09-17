import type { CadDocument } from '../document/document';
import type { Entity, Id, LayerRecord, ViewportEntity } from '../document/types';

export interface VisibilityOptions {
  /** ocultación temporal (HIDEOBJECTS) */
  hidden?: ReadonlySet<Id>;
  /** aislamiento temporal (ISOLATEOBJECTS): si existe, solo estos */
  isolated?: ReadonlySet<Id> | null;
  /** viewport de papel activo (congelación por viewport) */
  viewport?: ViewportEntity | null;
  /** capas del bloque anfitrión (capa 0 hereda) */
  hostLayer?: LayerRecord;
  /** trazado: capas no trazables se omiten */
  plotting?: boolean;
  /** construcción: se omite al trazar */
}

export function layerVisible(layer: LayerRecord | undefined, opts: VisibilityOptions = {}): boolean {
  if (!layer) return true;
  if (!layer.on || layer.frozen) return false;
  if (opts.plotting && !layer.plot) return false;
  if (opts.viewport && opts.viewport.frozenLayers.includes(layer.id)) return false;
  return true;
}

export function entityVisible(doc: CadDocument, e: Entity, opts: VisibilityOptions = {}): boolean {
  if (!e.visible) return false;
  if (opts.plotting && e.construction) return false;
  if (opts.hidden?.has(e.id)) return false;
  if (opts.isolated && !opts.isolated.has(e.id)) return false;
  const layer = doc.data.layers.get(e.layer);
  if (layer && layer.name === '0' && opts.hostLayer) return layerVisible(opts.hostLayer, opts);
  return layerVisible(layer, opts);
}

/** Una entidad es editable si no está bloqueada ni en capa bloqueada. */
export function entityEditable(doc: CadDocument, e: Entity): boolean {
  if (e.locked) return false;
  const layer = doc.data.layers.get(e.layer);
  return !layer?.locked;
}
