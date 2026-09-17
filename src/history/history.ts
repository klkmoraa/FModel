import type { CollectionName, Id } from '../document/types';

/** Cambio atómico sobre un registro. before/after undefined = no existía / eliminado. */
export interface ChangeRecord {
  coll: CollectionName | 'settings';
  id: Id;
  before: unknown;
  after: unknown;
}

/** Etiqueta de las transacciones de encuadre de viewport, que se fusionan si son seguidas. */
export const VIEWPORT_VIEW_LABEL = 'VPVIEW';
const COALESCE_MS = 1200;

export interface HistoryEntry {
  id: number;
  label: string;
  changes: ChangeRecord[];
  timestamp: number;
  /** Etiqueta de grupo (p. ej. sesión del Editor de bloques) */
  group?: string;
}

export interface HistoryTarget {
  applyChanges(changes: ChangeRecord[], direction: 'undo' | 'redo', label: string): void;
}

/**
 * Historial transaccional desacoplado de la interfaz. Cada transacción confirmada
 * es una entrada; los grupos fusionan varias transacciones en un único paso de
 * deshacer (UNDO Inicio/Fin).
 */
export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private seq = 0;
  private groupStack: { label: string; start: number }[] = [];
  private listeners = new Set<() => void>();
  limit = 1000;

  constructor(private target: HistoryTarget) {}

  push(label: string, changes: ChangeRecord[]): HistoryEntry | null {
    if (!changes.length) return null;
    // navegación continua dentro de un viewport: un único paso de deshacer por gesto
    const last = this.undoStack[this.undoStack.length - 1];
    const floor = this.groupStack[this.groupStack.length - 1]?.start ?? 0;
    if (label === VIEWPORT_VIEW_LABEL && last?.label === label && this.undoStack.length > floor && Date.now() - last.timestamp < COALESCE_MS) {
      last.changes = mergeChanges([...last.changes, ...changes]);
      last.timestamp = Date.now();
      this.redoStack = [];
      this.emit();
      return last;
    }
    const entry: HistoryEntry = { id: ++this.seq, label, changes, timestamp: Date.now(), group: this.groupStack[0]?.label };
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this.redoStack = [];
    this.emit();
    return entry;
  }

  beginGroup(label: string): void {
    this.groupStack.push({ label, start: this.undoStack.length });
  }

  /**
   * Fusiona las transacciones del grupo en una sola entrada. Los grupos anidados (p. ej. un
   * comando dentro de una sesión del Editor de bloques) también se fusionan, de modo que dentro
   * de la sesión cada comando se deshace en un paso y al cerrarla todo queda en uno.
   */
  endGroup(): void {
    const g = this.groupStack.pop();
    if (!g) return;
    const entries = this.undoStack.splice(g.start);
    if (!entries.length) return;
    const merged = mergeChanges(entries.flatMap((e) => e.changes));
    if (merged.length) this.undoStack.push({ id: ++this.seq, label: g.label, changes: merged, timestamp: Date.now(), group: this.groupStack[0]?.label });
    this.emit();
  }

  /** Cancela el grupo abierto deshaciendo sus transacciones sin dejarlas en rehacer. */
  abortGroup(): void {
    const g = this.groupStack.pop();
    if (!g) return;
    const entries = this.undoStack.splice(g.start);
    for (let i = entries.length - 1; i >= 0; i--) this.target.applyChanges(entries[i].changes, 'undo', entries[i].label);
    this.emit();
  }

  get inGroup(): boolean {
    return this.groupStack.length > 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  peekUndo(): HistoryEntry | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }
  peekRedo(): HistoryEntry | undefined {
    return this.redoStack[this.redoStack.length - 1];
  }
  entries(): readonly HistoryEntry[] {
    return this.undoStack;
  }

  undo(): HistoryEntry | null {
    // dentro de un grupo abierto no se deshace más allá de su inicio
    const g = this.groupStack[this.groupStack.length - 1];
    if (g && this.undoStack.length <= g.start) return null;
    const e = this.undoStack.pop();
    if (!e) return null;
    this.target.applyChanges(e.changes, 'undo', e.label);
    this.redoStack.push(e);
    this.emit();
    return e;
  }

  redo(): HistoryEntry | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    this.target.applyChanges(e.changes, 'redo', e.label);
    this.undoStack.push(e);
    this.emit();
    return e;
  }

  /** Deshace hasta (e incluyendo) la entrada con id dado. */
  undoTo(id: number): void {
    while (this.undoStack.length && this.undoStack[this.undoStack.length - 1].id >= id) this.undo();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

/** Fusiona cambios consecutivos sobre el mismo registro: conserva el primer before y el último after. */
export function mergeChanges(changes: ChangeRecord[]): ChangeRecord[] {
  const map = new Map<string, ChangeRecord>();
  for (const c of changes) {
    const key = `${c.coll}\u0000${c.id}`;
    const prev = map.get(key);
    if (prev) prev.after = c.after;
    else map.set(key, { ...c });
  }
  return [...map.values()].filter((c) => c.before !== c.after);
}
