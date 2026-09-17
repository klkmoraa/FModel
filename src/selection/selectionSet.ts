import type { CadDocument } from '../document/document';
import type { Id } from '../document/types';

/**
 * Conjunto de selección ordenado (conserva el orden de designación para comandos
 * como MATCHPROP o ALIGN). Se limpia automáticamente de IDs eliminados.
 */
export class SelectionSet {
  private ids: Id[] = [];
  private listeners = new Set<() => void>();
  /** selección anterior (opción "P" / Previous) */
  previous: Id[] = [];
  version = 0;

  constructor(private doc: CadDocument) {
    doc.subscribe(() => {
      const before = this.ids.length;
      this.ids = this.ids.filter((id) => doc.data.entities.has(id));
      if (this.ids.length !== before) this.emit();
    });
  }

  get list(): readonly Id[] {
    return this.ids;
  }
  get size(): number {
    return this.ids.length;
  }
  has(id: Id): boolean {
    return this.ids.includes(id);
  }

  set(ids: Iterable<Id>) {
    const next = [...new Set(ids)].filter((id) => this.doc.data.entities.has(id));
    if (next.length === this.ids.length && next.every((id, i) => id === this.ids[i])) return;
    if (this.ids.length) this.previous = this.ids;
    this.ids = next;
    this.emit();
  }

  add(ids: Iterable<Id>) {
    const add = [...ids].filter((id) => !this.ids.includes(id) && this.doc.data.entities.has(id));
    if (!add.length) return;
    this.ids = [...this.ids, ...add];
    this.emit();
  }

  remove(ids: Iterable<Id>) {
    const rm = new Set(ids);
    const next = this.ids.filter((id) => !rm.has(id));
    if (next.length === this.ids.length) return;
    this.ids = next;
    this.emit();
  }

  toggle(id: Id) {
    if (this.has(id)) this.remove([id]);
    else this.add([id]);
  }

  clear() {
    if (!this.ids.length) return;
    this.previous = this.ids;
    this.ids = [];
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }
}

/** Expande una selección a grupos completos (PICKSTYLE). */
export function expandGroups(doc: CadDocument, ids: Id[]): Id[] {
  const out = new Set(ids);
  for (const g of doc.data.groups.values()) {
    if (!g.selectable) continue;
    if (g.members.some((m) => out.has(m))) for (const m of g.members) out.add(m);
  }
  return [...out];
}
