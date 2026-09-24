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

const finiteItem = (item: Item): boolean =>
  Number.isFinite(item.minX) && Number.isFinite(item.minY) &&
  Number.isFinite(item.maxX) && Number.isFinite(item.maxY);

class OwnerIndex {
  tree = new RBush<Item>(9);
  items = new Map<Id, Item>();
  unbounded = new Set<Id>();
}

interface ContextSnapshot {
  documentVersion: number;
  blocksVersion: number;
  annotationScale: number;
  sheetName: string;
  fileName: string;
  measureText: ModelContext['measureText'];
  dynamicEvaluator: ModelContext['dynamicEvaluator'];
}

interface CachedContextIndex {
  snapshot: ContextSnapshot;
  owners: Map<Id, OwnerIndex>;
}

const MAX_CACHED_CONTEXTS = 4;

/**
 * Índice espacial R-tree por espacio propietario (modelo, cada layout, cada bloque).
 * Se mantiene con los eventos del documento. Las entidades infinitas (rayo, xline)
 * se guardan aparte y siempre se devuelven como candidatas.
 */
export class SpatialIndex {
  private owners = new Map<Id, OwnerIndex>();
  private unsubscribe: () => void;
  private lastBlocksVersion = -1;
  private contextSnapshot: ContextSnapshot | null = null;
  private cachedContexts: CachedContextIndex[] = [];
  version = 0;

  constructor(private ctx: ModelContext) {
    this.rebuild();
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
    this.cachedContexts = [];
    const previousContext = this.contextSnapshot;
    if (
      previousContext &&
      previousContext.documentVersion === this.ctx.doc.version &&
      previousContext.blocksVersion === this.ctx.blocksVersion &&
      !this.sameContext(previousContext, this.captureContext())
    ) {
      // These values affect field text and annotative geometry but can change
      // without a document event. Clear block geometry caches before measuring.
      this.ctx.invalidateBlocks();
    }

    this.buildCurrentIndex();
  }

  private buildCurrentIndex() {
    this.owners = new Map();
    const groups = new Map<Id, Item[]>();
    for (const e of this.ctx.doc.data.entities.values()) {
      const item = this.itemFor(e);
      if (!item) continue;
      if (!finiteItem(item)) {
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
    this.lastBlocksVersion = this.ctx.blocksVersion;
    this.contextSnapshot = this.captureContext();
    this.version++;
  }

  private captureContext(): ContextSnapshot {
    return {
      documentVersion: this.ctx.doc.version,
      blocksVersion: this.ctx.blocksVersion,
      annotationScale: this.ctx.annotationScale,
      sheetName: this.ctx.sheetName,
      fileName: this.ctx.fileName,
      measureText: this.ctx.measureText,
      dynamicEvaluator: this.ctx.dynamicEvaluator,
    };
  }

  /** Compara las entradas que determinan una caja; ignora blocksVersion del cache. */
  private sameContext(a: ContextSnapshot, b: ContextSnapshot): boolean {
    return (
      a.documentVersion === b.documentVersion &&
      a.annotationScale === b.annotationScale &&
      a.sheetName === b.sheetName &&
      a.fileName === b.fileName &&
      a.measureText === b.measureText &&
      a.dynamicEvaluator === b.dynamicEvaluator
    );
  }

  private rememberContext(snapshot: ContextSnapshot, owners: Map<Id, OwnerIndex>) {
    this.cachedContexts = this.cachedContexts.filter((entry) => !this.sameContext(entry.snapshot, snapshot));
    this.cachedContexts.unshift({ snapshot, owners });
    if (this.cachedContexts.length > MAX_CACHED_CONTEXTS) this.cachedContexts.length = MAX_CACHED_CONTEXTS;
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
    if (!oi.items.size && !oi.unbounded.size) this.owners.delete(owner);
  }

  private insert(e: Entity) {
    const item = this.itemFor(e);
    if (!item) return;
    const oi = this.ownerIndex(e.owner);
    if (!finiteItem(item)) {
      oi.unbounded.add(e.id);
      return;
    }
    oi.tree.insert(item);
    oi.items.set(e.id, item);
  }

  private onChange(ev: DocChangeEvent) {
    // Any document edit invalidates indexes cached for other evaluation contexts.
    this.cachedContexts = [];
    if (ev.source === 'load' || ev.source === 'reset') {
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
    this.contextSnapshot = this.captureContext();
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
    this.ensureFresh();
    const oi = this.owners.get(owner);
    if (!oi) return [];
    const res = oi.tree.search(box).map((i) => i.id);
    for (const id of oi.unbounded) res.push(id);
    return res;
  }

  bboxOf(owner: Id, id: Id): BBox | undefined {
    this.ensureFresh();
    return this.owners.get(owner)?.items.get(id);
  }

  /** Extensión de un espacio (sin geometría infinita). */
  extents(owner: Id, filter?: (id: Id) => boolean): BBox {
    this.ensureFresh();
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
    this.ensureFresh();
    const oi = this.owners.get(owner);
    return oi ? oi.items.size + oi.unbounded.size : 0;
  }

  private ensureFresh() {
    const snapshot = this.contextSnapshot;
    if (!snapshot) return;
    const current = this.captureContext();
    if (snapshot.blocksVersion === current.blocksVersion && this.sameContext(snapshot, current)) return;

    // A document edit or external block-cache invalidation cannot reuse older
    // boxes. Context-only changes are common while rendering viewports, so keep
    // a small LRU of those indexes and restore a matching one when available.
    if (snapshot.documentVersion !== current.documentVersion || snapshot.blocksVersion !== current.blocksVersion) {
      this.cachedContexts = [];
      this.buildCurrentIndex();
      return;
    }

    this.rememberContext(snapshot, this.owners);
    this.ctx.invalidateBlocks();
    const refreshed = this.captureContext();
    const cachedIndex = this.cachedContexts.findIndex((entry) => this.sameContext(entry.snapshot, refreshed));
    if (cachedIndex >= 0) {
      this.owners = this.cachedContexts[cachedIndex].owners;
      this.cachedContexts.splice(cachedIndex, 1);
      this.lastBlocksVersion = this.ctx.blocksVersion;
      this.contextSnapshot = refreshed;
      this.version++;
      return;
    }
    this.buildCurrentIndex();
  }
}
