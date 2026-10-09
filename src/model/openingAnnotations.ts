import type { CadDocument, Transaction } from '../document/document';
import { entityDefaults, UNIT_TO_MM } from '../document/defaults';
import { detachOpeningAnnotation, validOpeningAnnotations } from '../document/openingAnnotations';
import type { DrawingUnits, Entity, Id, TableCell, TableEntity, TextEntity } from '../document/types';
import { add, sub, scale, perp, dist, type Vec2 } from '../geometry/vec';
import { wallOffsets } from '../geometry/walls';
import type { WallOpeningSpec } from '../geometry/wallOpenings';
import { readWallAssembly } from './wallAssembly';

type OpeningType = WallOpeningSpec['type'];
const ORDER: OpeningType[] = ['single', 'double', 'fixed', 'sliding', 'empty'];
const LABELS = {
  single: { es: 'Puerta sencilla', en: 'Single door' }, double: { es: 'Puerta doble', en: 'Double door' },
  fixed: { es: 'Ventana fija', en: 'Fixed window' }, sliding: { es: 'Hueco corredizo', en: 'Sliding opening' }, empty: { es: 'Hueco sin símbolo', en: 'Empty opening' },
};
export class OpeningAnnotationError extends Error {
  constructor(readonly messageI18n: { es: string; en: string }) { super(messageI18n.es); }
}
export interface OpeningAnnotationPlacement { anchorId: Id; openingId: string; code: string; center: Vec2; normal: Vec2; faceOffset: number; side: number; rotation: number }
export interface OpeningAnnotationSnapshot { rows: { type: OpeningType; width: number; count: number; code: string }[]; openings: OpeningAnnotationPlacement[] }
const groupKey = (type: OpeningType, width: number) => `${type}:${width}`;
export function collectOpeningAnnotations(doc: CadDocument, owner: Id): OpeningAnnotationSnapshot {
  const visited = new Set<Id>(), groups = new Map<string, { type: OpeningType; width: number; count: number; code: string }>();
  const placements: (OpeningAnnotationPlacement & { key: string })[] = [];
  let walls = 0;
  for (const entity of doc.data.entities.values()) {
    if (entity.owner !== owner || visited.has(entity.id) || (entity.meta?.fmodelWallAssembly === undefined && entity.meta?.fmodelWallMember === undefined)) continue;
    if (++walls > 100) throw new OpeningAnnotationError({ es: 'Máximo 100 muros asociados por cuadro.', en: 'At most 100 associated walls per schedule.' });
    const assembly = readWallAssembly(doc, entity.id);
    assembly.members.forEach(id => visited.add(id));
    for (const opening of assembly.openings) {
      if (placements.length >= 1000) throw new OpeningAnnotationError({ es: 'Máximo 1000 huecos por cuadro.', en: 'At most 1000 openings per schedule.' });
      const key = groupKey(opening.type, opening.width), existing = groups.get(key);
      if (existing) existing.count++; else groups.set(key, { type: opening.type, width: opening.width, count: 1, code: '' });
      const vertices = assembly.source.vertices, a = vertices[opening.segment], b = vertices[(opening.segment + 1) % vertices.length];
      const direction = scale(sub(b, a), 1 / dist(a, b)), normal = perp(direction), side = -opening.side;
      let rotation = Math.atan2(direction.y, direction.x);
      if (rotation > Math.PI / 2) rotation -= Math.PI; else if (rotation <= -Math.PI / 2) rotation += Math.PI;
      placements.push({ key, anchorId: assembly.anchorId, openingId: opening.id, code: '', center: add(a, scale(direction, opening.offset)), normal, side,
        faceOffset: wallOffsets(assembly.source)[side > 0 ? 0 : 1], rotation });
    }
  }
  const rows = [...groups.values()].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.width - b.width), indices = { P: 0, V: 0, H: 0 };
  for (const row of rows) { const prefix = row.type === 'single' || row.type === 'double' ? 'P' : row.type === 'fixed' ? 'V' : 'H'; row.code = `${prefix}-${String(++indices[prefix]).padStart(2, '0')}`; }
  return { rows, openings: placements.map(({ key, ...placement }) => ({ ...placement, code: groups.get(key)!.code })) };
}
export function openingScheduleCells(snapshot: OpeningAnnotationSnapshot, lang: 'es' | 'en', units: DrawingUnits): TableCell[][] {
  const unit = units === 'unitless' ? (lang === 'es' ? 'unidades' : 'units') : units;
  const title = lang === 'es' ? 'Cuadro de huecos' : 'Opening schedule';
  const headers = lang === 'es' ? ['Clave', 'Tipo', `Ancho (${unit})`, 'Cantidad'] : ['Code', 'Type', `Width (${unit})`, 'Quantity'];
  return [[{ text: title, colSpan: 4 }, { text: '', merged: true }, { text: '', merged: true }, { text: '', merged: true }], headers.map(text => ({ text })),
    ...snapshot.rows.map(row => [row.code, LABELS[row.type][lang], String(row.width), String(row.count)].map(text => ({ text })))];
}
export function openingTagPosition(opening: OpeningAnnotationPlacement, height: number): Vec2 {
  const point = add(opening.center, scale(opening.normal, opening.faceOffset + opening.side * height * 1.5));
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new OpeningAnnotationError({ es: 'Posición de etiqueta fuera del rango válido.', en: 'Tag position exceeds the valid range.' });
  return point;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function synchronizeOpeningAnnotations(tx: Transaction, tableId: Id, snapshot?: OpeningAnnotationSnapshot | null): void {
  const doc = tx.doc, table = doc.entity(tableId);
  if (table?.type !== 'table' || !table.openingSchedule) return;
  const link = table.openingSchedule, config = link.tags;
  let points: Vec2[];
  try {
    if (snapshot === null) throw new Error('source');
    if (!validOpeningAnnotations(table as unknown as Record<string, unknown>) || table.columnWidths.length !== 4 ||
      (config && (!doc.data.textStyles.has(config.style) || !doc.data.layers.has(config.layer)))) throw new Error('association');
    snapshot ??= collectOpeningAnnotations(doc, table.owner);
    points = config ? snapshot.openings.map(o => openingTagPosition(o, config.height)) : [];
  } catch {
    if (link.status !== 'review' || !table.cells[0]?.[0]?.text.includes(link.language === 'es' ? 'Revisar' : 'Review')) {
      const cells = structuredClone(table.cells);
      if (cells[0]?.[0]) cells[0][0].text = link.language === 'es' ? 'Cuadro de huecos · Revisar huecos' : 'Opening schedule · Review openings';
      tx.updateEntity<TableEntity>(table.id, { cells, openingSchedule: { ...link, status: 'review' } });
    }
    for (const entity of doc.data.entities.values()) if (entity.type === 'text' && entity.openingTag?.scheduleId === tableId && !doc.entity(entity.openingTag.anchorId)) tx.put('entities', detachOpeningAnnotation(entity));
    return;
  }
  const cells = openingScheduleCells(snapshot, link.language, doc.settings.units), { status: _status, ...currentLink } = link;
  const rowHeights = cells.map((_, i) => table.rowHeights[i] ?? table.rowHeights[2] ?? 10 / UNIT_TO_MM[doc.settings.units]);
  if (!same(cells, table.cells) || !same(rowHeights, table.rowHeights) || link.status) tx.updateEntity<TableEntity>(table.id, { cells, rowHeights, openingSchedule: currentLink, titleRow: true, headerRow: true });
  if (!config) return;
  const texts = new Map<string, TextEntity>(), key = (anchorId: Id, openingId: string) => JSON.stringify([anchorId, openingId]);
  for (const entity of doc.data.entities.values()) {
    if (entity.type !== 'text' || entity.openingTag?.scheduleId !== tableId) continue;
    const k = key(entity.openingTag.anchorId, entity.openingTag.openingId);
    if (entity.owner !== table.owner || texts.has(k)) tx.put('entities', detachOpeningAnnotation(entity)); else texts.set(k, entity);
  }
  snapshot.openings.forEach((opening, i) => {
    const k = key(opening.anchorId, opening.openingId), previous = texts.get(k), base = points[i]; texts.delete(k);
    const openingTag = { version: 1 as const, scheduleId: tableId, anchorId: opening.anchorId, openingId: opening.openingId, base };
    if (previous) {
      const position = add(base, sub(previous.position, previous.openingTag!.base));
      if (![position.x, position.y].every(Number.isFinite)) return;
      const next = { ...previous, text: opening.code, position, ...(previous.alignPoint ? { alignPoint: position } : {}), openingTag };
      if (!same(next, previous)) tx.put('entities', next);
    } else tx.addEntity<TextEntity>({ ...entityDefaults(doc, table.owner), type: 'text', layer: config.layer, style: config.style, text: opening.code, height: config.height, position: base, rotation: opening.rotation, widthFactor: 1, oblique: 0, halign: 'center', valign: 'middle', openingTag });
  });
  for (const text of texts.values()) tx.removeEntity(text.id);
}
export function installOpeningAnnotations(doc: CadDocument): () => void {
  return doc.addReactor((tx, changes) => {
    const owners = new Set<Id>(), schedules = new Set<Id>();
    for (const change of changes) {
      if (change.coll === 'groups' || change.coll === 'mlineStyles' || (change.coll === 'settings' && (change.before as { units?: string })?.units !== (change.after as { units?: string })?.units)) {
        for (const entity of doc.data.entities.values()) if (entity.type === 'table' && entity.openingSchedule) owners.add(entity.owner);
      }
      if (change.coll !== 'entities') continue;
      const before = change.before as Entity | undefined, after = change.after as Entity | undefined;
      for (const entity of [before, after]) if (entity?.meta?.fmodelWallAssembly !== undefined || entity?.meta?.fmodelWallMember !== undefined) owners.add(entity.owner);
      if (after?.type === 'table' && after.openingSchedule && !same(after.openingSchedule, before?.type === 'table' ? before.openingSchedule : undefined)) schedules.add(after.id);
      if (before?.type === 'table' && before.openingSchedule && (after?.type !== 'table' || !after.openingSchedule)) {
        for (const entity of doc.data.entities.values()) if (entity.type === 'text' && entity.openingTag?.scheduleId === before.id) tx.put('entities', detachOpeningAnnotation(entity));
      }
    }
    // One validated recount per affected owner, shared by all its schedules.
    const snapshots = new Map<Id, OpeningAnnotationSnapshot | null>();
    for (const table of doc.data.entities.values()) {
      if (table.type !== 'table' || !table.openingSchedule || (!owners.has(table.owner) && !schedules.has(table.id))) continue;
      if (!snapshots.has(table.owner)) { try { snapshots.set(table.owner, collectOpeningAnnotations(doc, table.owner)); } catch { snapshots.set(table.owner, null); } }
      synchronizeOpeningAnnotations(tx, table.id, snapshots.get(table.owner));
    }
  });
}
