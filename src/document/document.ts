import type { ChangeRecord } from '../history/history';
import { History, mergeChanges } from '../history/history';
import { newId } from './ids';
import type {
  CollectionName,
  DocumentData,
  DocumentSettings,
  Entity,
  Id,
  RecordOf,
} from './types';

export interface DocChangeEvent {
  label: string;
  source: 'transaction' | 'undo' | 'redo' | 'load' | 'reset';
  changes: ChangeRecord[];
}

export type Reactor = (tx: Transaction, changes: ChangeRecord[]) => void;

export const COLLECTIONS: CollectionName[] = [
  'entities',
  'layers',
  'linetypes',
  'textStyles',
  'dimStyles',
  'mleaderStyles',
  'tableStyles',
  'mlineStyles',
  'blocks',
  'layouts',
  'groups',
  'views',
  'layerStates',
  'layerFilters',
  'assets',
  'constraints',
  'parameters',
  'parameterSets',
];

export class TransactionError extends Error {}

/**
 * Transacción sobre el documento. Aplica los cambios inmediatamente (los comandos
 * leen su propio estado) y registra el valor previo la primera vez que toca un
 * registro. `rollback()` restaura; `commit()` publica al historial.
 */
export class Transaction {
  readonly changes = new Map<string, ChangeRecord>();
  private pending = new Map<string, ChangeRecord>();
  private done = false;

  constructor(
    readonly doc: CadDocument,
    public label: string,
  ) {}

  get active(): boolean {
    return !this.done;
  }

  private touch(coll: CollectionName | 'settings', id: Id, before: unknown, after: unknown) {
    if (this.done) throw new TransactionError(`La transacción «${this.label}» ya terminó`);
    const key = `${coll}\u0000${id}`;
    const prev = this.changes.get(key);
    if (prev) prev.after = after;
    else this.changes.set(key, { coll, id, before, after });
    const pending = this.pending.get(key);
    if (pending) pending.after = after;
    else this.pending.set(key, { coll, id, before, after });
  }

  get<C extends CollectionName>(coll: C, id: Id): RecordOf<C> | undefined {
    return this.doc.get(coll, id);
  }

  add<C extends CollectionName>(coll: C, record: RecordOf<C>): RecordOf<C> {
    const map = this.doc.data[coll] as Map<Id, RecordOf<C>>;
    const id = (record as { id: Id }).id;
    if (map.has(id)) throw new TransactionError(`Registro duplicado ${coll}/${id}`);
    this.touch(coll, id, undefined, record);
    map.set(id, record);
    return record;
  }

  /** Inserta o reemplaza. */
  put<C extends CollectionName>(coll: C, record: RecordOf<C>): RecordOf<C> {
    const map = this.doc.data[coll] as Map<Id, RecordOf<C>>;
    const id = (record as { id: Id }).id;
    this.touch(coll, id, map.get(id), record);
    map.set(id, record);
    return record;
  }

  update<C extends CollectionName>(coll: C, id: Id, patch: Partial<RecordOf<C>> | ((r: RecordOf<C>) => RecordOf<C>)): RecordOf<C> {
    const map = this.doc.data[coll] as Map<Id, RecordOf<C>>;
    const cur = map.get(id);
    if (!cur) throw new TransactionError(`No existe ${coll}/${id}`);
    const next = typeof patch === 'function' ? patch(cur) : ({ ...cur, ...patch } as RecordOf<C>);
    if (next === cur) return cur;
    this.touch(coll, id, cur, next);
    map.set(id, next);
    return next;
  }

  remove<C extends CollectionName>(coll: C, id: Id): void {
    const map = this.doc.data[coll] as Map<Id, RecordOf<C>>;
    const cur = map.get(id);
    if (!cur) return;
    this.touch(coll, id, cur, undefined);
    map.delete(id);
  }

  setSettings(patch: Partial<DocumentSettings>): DocumentSettings {
    const cur = this.doc.data.settings;
    const next = { ...cur, ...patch };
    this.touch('settings', 'settings', cur, next);
    this.doc.data.settings = next;
    return next;
  }

  /** Atajo para entidades: asigna id y orden si faltan. */
  addEntity<E extends Entity>(e: Omit<E, 'id' | 'order'> & Partial<Pick<E, 'id' | 'order'>>): E {
    const id = e.id ?? newId();
    const order = e.order ?? this.doc.nextOrder(e.owner);
    const full = { ...e, id, order } as E;
    this.add('entities', full as Entity);
    return full;
  }

  updateEntity<E extends Entity>(id: Id, patch: Partial<E> | ((r: E) => E)): E {
    return this.update('entities', id, patch as never) as E;
  }

  removeEntity(id: Id): void {
    this.remove('entities', id);
  }

  list(): ChangeRecord[] {
    return [...this.changes.values()];
  }

  rollback(): void {
    if (this.done) return;
    this.doc.restore(this.list());
    this.done = true;
    this.doc.endTransaction(this, false);
  }

  commit(): ChangeRecord[] {
    if (this.done) return [];
    // Cada mutación, incluso de un registro ya tocado, debe propagarse a los reactores.
    if (this.doc.reactors.length) {
      for (let pass = 0; this.pending.size; pass++) {
        if (pass >= 128) throw new TransactionError('La actualización asociativa no converge / Associative update did not converge');
        const fresh = [...this.pending.values()];
        this.pending.clear();
        for (const r of this.doc.reactors) r(this, fresh);
      }
    }
    this.done = true;
    const changes = mergeChanges(this.list());
    this.doc.endTransaction(this, true, changes);
    return changes;
  }
}

export class CadDocument {
  /** identidad estable del dibujo (se conserva al guardar y abrir) */
  id: Id;
  data: DocumentData;
  readonly history: History;
  readonly reactors: Reactor[] = [];
  private listeners = new Set<(e: DocChangeEvent) => void>();
  private active: Transaction | null = null;
  private maxOrder = new Map<Id, number>();
  /** Se incrementa en cada cambio; útil para memoización. */
  version = 0;
  private _dirty = false;
  private cleanEpoch = 0;

  constructor(data: DocumentData, id: Id = newId('doc')) {
    this.id = id;
    this.data = data;
    this.history = new History({
      applyChanges: (changes, direction, label) => {
        // Expresado como transición desde el estado actual al estado destino.
        const transition =
          direction === 'undo'
            ? changes.map((c) => ({ ...c, before: c.after, after: c.before }))
            : changes.map((c) => ({ ...c }));
        this.restore(transition.map((c) => ({ ...c, before: c.after })));
        this.emit({ label, source: direction, changes: transition });
      },
      captureAbortState: (label) => {
        const dirty = this.dirty;
        const cleanEpoch = this.cleanEpoch;
        return () => {
          // Un guardado durante el grupo cambió la referencia limpia: revertirlo sí deja cambios pendientes.
          if (this.cleanEpoch !== cleanEpoch || this.dirty === dirty) return;
          this._dirty = dirty;
          this.emit({ label, source: 'transaction', changes: [] }, false);
        };
      },
    });
    this.rebuildOrder();
  }

  get settings(): DocumentSettings {
    return this.data.settings;
  }

  get dirty(): boolean {
    return this._dirty;
  }

  set dirty(value: boolean) {
    this._dirty = value;
    if (!value) this.cleanEpoch++;
  }

  get<C extends CollectionName>(coll: C, id: Id): RecordOf<C> | undefined {
    return (this.data[coll] as Map<Id, RecordOf<C>>).get(id);
  }

  all<C extends CollectionName>(coll: C): IterableIterator<RecordOf<C>> {
    return (this.data[coll] as Map<Id, RecordOf<C>>).values();
  }

  entity(id: Id): Entity | undefined {
    return this.data.entities.get(id);
  }

  /** Entidades de un espacio/bloque en orden de dibujo. */
  entitiesOf(owner: Id): Entity[] {
    const out: Entity[] = [];
    for (const e of this.data.entities.values()) if (e.owner === owner) out.push(e);
    out.sort((a, b) => a.order - b.order);
    return out;
  }

  nextOrder(owner: Id): number {
    const n = (this.maxOrder.get(owner) ?? 0) + 1;
    this.maxOrder.set(owner, n);
    return n;
  }

  private rebuildOrder() {
    this.maxOrder.clear();
    for (const e of this.data.entities.values()) {
      if ((this.maxOrder.get(e.owner) ?? -Infinity) < e.order) this.maxOrder.set(e.owner, e.order);
    }
  }

  get inTransaction(): boolean {
    return !!this.active;
  }

  begin(label: string): Transaction {
    if (this.active) throw new TransactionError(`Ya hay una transacción activa: «${this.active.label}»`);
    this.active = new Transaction(this, label);
    return this.active;
  }

  /** Ejecuta `fn` dentro de una transacción; confirma al terminar o revierte si lanza. */
  transact<T>(label: string, fn: (tx: Transaction) => T): T {
    if (this.active) {
      // Transacción anidada: se integra en la activa
      return fn(this.active);
    }
    const tx = this.begin(label);
    try {
      const result = fn(tx);
      tx.commit();
      return result;
    } catch (err) {
      tx.rollback();
      throw err;
    }
  }

  get activeTransaction(): Transaction | null {
    return this.active;
  }

  /** Uso interno: fin de transacción. */
  endTransaction(tx: Transaction, committed: boolean, changes: ChangeRecord[] = []) {
    if (this.active === tx) this.active = null;
    if (!committed) {
      this.emit({ label: tx.label, source: 'transaction', changes: tx.list().map((c) => ({ ...c, before: c.after, after: c.before })) }, false);
      return;
    }
    if (!changes.length) return;
    this.history.push(tx.label, changes);
    for (const c of changes) {
      if (c.coll === 'entities' && c.after) {
        const e = c.after as Entity;
        if ((this.maxOrder.get(e.owner) ?? -Infinity) < e.order) this.maxOrder.set(e.owner, e.order);
      }
    }
    this.emit({ label: tx.label, source: 'transaction', changes });
  }

  /** Aplica el estado `before` de cada cambio (rollback / undo). */
  restore(changes: ChangeRecord[]) {
    for (const c of changes) {
      if (c.coll === 'settings') {
        this.data.settings = c.before as DocumentSettings;
        continue;
      }
      const map = this.data[c.coll] as Map<Id, unknown>;
      if (c.before === undefined) map.delete(c.id);
      else map.set(c.id, c.before);
    }
  }

  subscribe(fn: (e: DocChangeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: DocChangeEvent, markDirty = true) {
    this.version++;
    if (markDirty && e.source !== 'load') this.dirty = true;
    if (e.source === 'load' || e.source === 'reset') this.rebuildOrder();
    for (const l of this.listeners) l(e);
  }

  /** Sustituye todo el contenido (abrir, recuperar). No es deshacible. */
  /**
   * Sustituye el contenido del documento. `id` conserva la identidad del archivo abierto
   * (versiones, recuperación y detección de referencias circulares dependen de ella);
   * sin `id` se trata de un dibujo nuevo con identidad propia.
   */
  replaceData(data: DocumentData, id: Id = newId('doc')) {
    this.id = id;
    this.data = data;
    this.history.clear();
    this.emit({ label: 'load', source: 'load', changes: [] });
    this.dirty = false;
  }

  undo() {
    if (this.active) this.active.rollback();
    return this.history.undo();
  }

  redo() {
    if (this.active) return null;
    return this.history.redo();
  }

  addReactor(r: Reactor): () => void {
    this.reactors.push(r);
    return () => {
      const i = this.reactors.indexOf(r);
      if (i >= 0) this.reactors.splice(i, 1);
    };
  }

  findByName<C extends 'layers' | 'linetypes' | 'textStyles' | 'dimStyles' | 'mleaderStyles' | 'tableStyles' | 'mlineStyles' | 'blocks' | 'layouts' | 'groups' | 'views' | 'layerStates'>(
    coll: C,
    name: string,
  ): RecordOf<C> | undefined {
    const lower = name.toLowerCase();
    for (const r of this.all(coll)) if ((r as { name: string }).name.toLowerCase() === lower) return r;
    return undefined;
  }
}
