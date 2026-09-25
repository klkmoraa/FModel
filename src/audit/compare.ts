import type { CollectionName, DocumentData, Entity, Id } from '../document/types';

export interface RecordDiff {
  added: number;
  removed: number;
  modified: number;
}

export interface DrawingDiff {
  /** objetos presentes solo en el dibujo actual */
  added: Id[];
  /** objetos presentes solo en la revisión base (se muestran como «fantasma») */
  removed: Entity[];
  /** objetos cuyo contenido cambió, con su estado en la base */
  modified: { id: Id; before: Entity }[];
  /** cambios en tablas (capas, estilos, bloques…) */
  records: Partial<Record<Exclude<CollectionName, 'entities'>, RecordDiff>>;
  settingsChanged: boolean;
}

/** Comparación estructural estable (independiente del orden de las claves). */
function sameRecord(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => sameRecord(v, bb[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameRecord((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Compara dos revisiones del mismo dibujo por identificador estable. El orden de dibujo
 * no cuenta como modificación (solo cambia la superposición visual).
 */
export function compareDrawings(base: DocumentData, current: DocumentData): DrawingDiff {
  const diff: DrawingDiff = { added: [], removed: [], modified: [], records: {}, settingsChanged: false };
  const strip = (e: Entity) => ({ ...e, order: 0 });
  for (const [id, e] of current.entities) {
    const b = base.entities.get(id);
    if (!b) diff.added.push(id);
    else if (!sameRecord(strip(b), strip(e))) diff.modified.push({ id, before: b });
  }
  for (const [id, e] of base.entities) if (!current.entities.has(id)) diff.removed.push(e);
  const colls: Exclude<CollectionName, 'entities'>[] = ['layers', 'linetypes', 'textStyles', 'dimStyles', 'mleaderStyles', 'tableStyles', 'mlineStyles', 'blocks', 'layouts', 'groups', 'views', 'layerStates', 'layerFilters', 'assets', 'constraints', 'parameters', 'parameterSets'];
  for (const c of colls) {
    const a = (base[c] as Map<Id, unknown> | undefined) ?? new Map<Id, unknown>();
    const b = (current[c] as Map<Id, unknown> | undefined) ?? new Map<Id, unknown>();
    const r: RecordDiff = { added: 0, removed: 0, modified: 0 };
    for (const [id, rec] of b) {
      if (!a.has(id)) r.added++;
      else if (!sameRecord(a.get(id), rec)) r.modified++;
    }
    for (const id of a.keys()) if (!b.has(id)) r.removed++;
    if (r.added || r.removed || r.modified) diff.records[c] = r;
  }
  const { modifiedAt: _m1, ...sa } = base.settings;
  const { modifiedAt: _m2, ...sb } = current.settings;
  diff.settingsChanged = !sameRecord(sa, sb);
  return diff;
}
