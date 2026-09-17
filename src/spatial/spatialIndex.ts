import RBush from 'rbush';
import type { BBox } from '../geometry/bbox';
import { emptyBox, expandBox, isEmptyBox } from '../geometry/bbox';
import type { DocChangeEvent } from '../document/document';
import type { Entity, Id } from '../document/types';
import type { ModelContext } from '../model/context';
import { kindOf } from '../model/registry';

interface Item {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: Id;
}

class OwnerIndex {
  tree = new RBush<Item>(9);
  items = new Map<Id, Item>();
  unbounded = new Set<Id>();
}

/**
 * Índice espacial R-tree por espacio propietario (modelo, cada layout, cada bloque).
 * Se mantiene con los eventos del documento. Las entidades infinitas (rayo, xline)
 * se guardan aparte y siempre se devuelven como candidatas.
 */
export class SpatialIndex {
  private owners = new Map<Id, OwnerIndex>();
  private unsubscribe: () => void;
  private lastBlocksVersion: number;
  version = 0;

  constructor(private ctx: ModelContext) {
    this.rebuild();
    this.lastBlocksVersion = ctx.blocksVersion;
    this.unsubscribe = ctx.doc.subscribe((e) => this.onChange(e));
  }

  dispose() {
    this.unsubscribe();
  }

  private ownerIndex(owner: Id): OwnerIndex {
    let o = this.owners.get(owner);
    if (!o) {
      o = new OwnerIndex();
      this.owners.set(owner, o);
    }
    return o;
  }

  rebuild() {
    this.owners.clear();
    const groups = new Map<Id, Item[]>();
    for (const e of this.ctx.doc.data.entities.values()) {
      const item = this.itemFor(e);
      if (!item) continue;
      if (!Number.isFinite(item.minX) || !Number.isFinite(item.maxX)) {
        this.ownerIndex(e.owner).unbounded.add(e.id);
        continue;
      }
      let g = groups.get(e.owner);
      if (!g) groups.set(e.owner, (g = []));
      g.push(item);
    }
    for (const [owner, items] of groups) {
      const oi = this.ownerIndex(owner);
      oi.tree.load(items);
      for (const it of items) oi.items.set(it.id, it);
    }
    this.version++;
  }

  private itemFor(e: Entity): Item | null {
    try {
      const b = kindOf(e).bbox(e, this.ctx);
      if (isEmptyBox(b)) return null;
      return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, id: e.id };
    } catch {
      return null;
    }
  }

  private remove(owner: Id, id: Id) {
    const oi = this.owners.get(owner);
    if (!oi) return;
    const it = oi.items.get(id);
    if (it) {
      oi.tree.remove(it);
      oi.items.delete(id);
    }
    oi.unbounded.delete(id);
  }

  private insert(e: Entity) {
    const item = this.itemFor(e);
    if (!item) return;
    const oi = this.ownerIndex(e.owner);
    if (!Number.isFinite(item.minX) || !Number.isFinite(item.maxX)) {
      oi.unbounded.add(e.id);
      return;
    }
    oi.tree.insert(item);
    oi.items.set(e.id, item);
  }

  private onChange(ev: DocChangeEvent) {
    if (ev.source === 'load' || ev.source === 'reset') {
      this.lastBlocksVersion = this.ctx.blocksVersion;
      this.rebuild();
      return;
    }
    const blocksChanged = this.ctx.blocksVersion !== this.lastBlocksVersion;
    this.lastBlocksVersion = this.ctx.blocksVersion;
    // cambios de estilos o tablas afectan cajas de textos, cotas e inserciones
    if (blocksChanged && ev.changes.some((c) => c.coll !== 'entities')) {
      this.rebuild();
      return;
    }
    for (const c of ev.changes) {
      if (c.coll !== 'entities') continue;
      const before = c.before as Entity | undefined;
      const after = c.after as Entity | undefined;
      if (before) this.remove(before.owner, before.id);
      if (after) this.insert(after);
    }
    if (blocksChanged) {
      const dependents: Id[] = [];
      for (const e of this.ctx.doc.data.entities.values()) if (e.type === 'insert' || e.type === 'array' || e.type === 'mleader') dependents.push(e.id);
      this.refresh(dependents);
    }
    this.version++;
  }

  /** Reindexa entidades concretas (p. ej. inserciones cuyo bloque cambió). */
  refresh(ids: Iterable<Id>) {
    for (const id of ids) {
      const e = this.ctx.doc.entity(id);
      if (!e) continue;
      this.remove(e.owner, id);
      this.insert(e);
    }
    this.version++;
  }

  query(owner: Id, box: BBox): Id[] {
    const oi = this.owners.get(owner);
    if (!oi) return [];
    const res = oi.tree.search(box).map((i) => i.id);
    for (const id of oi.unbounded) res.push(id);
    return res;
  }

  bboxOf(owner: Id, id: Id): BBox | undefined {
    return this.owners.get(owner)?.items.get(id);
  }

  /** Extensión de un espacio (sin geometría infinita). */
  extents(owner: Id, filter?: (id: Id) => boolean): BBox {
    const oi = this.owners.get(owner);
    const b = emptyBox();
    if (!oi) return b;
    if (!filter) {
      const all = oi.tree.toJSON() as { minX: number; minY: number; maxX: number; maxY: number; height?: number };
      if (oi.items.size) return { minX: all.minX, minY: all.minY, maxX: all.maxX, maxY: all.maxY };
      return b;
    }
    for (const it of oi.items.values()) if (filter(it.id)) expandBox(b, it);
    return b;
  }

  count(owner: Id): number {
    const oi = this.owners.get(owner);
    return oi ? oi.items.size + oi.unbounded.size : 0;
  }
}
