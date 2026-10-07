import type { CadDocument, Transaction } from '../document/document';
import { newId } from '../document/ids';
import type { Entity, Id, LineEntity, MLineEntity } from '../document/types';
import type { CleanupSegment } from '../geometry/wallCleanup';

const RECORD = 'fmodelWallCleanup';
const SOURCE = 'fmodelWallCleanupSource';
const OUTPUT = 'fmodelWallCleanupOutput';
interface Link { version: 1; selfId: Id; anchorId: Id; batchId: Id }
interface SourceSnapshot { id: Id; visible: boolean; shape: string }
interface OutputSnapshot { id: Id; snapshot: string }
export interface WallCleanupRecord { version: 1; selfId: Id; batchId: Id; groupId: Id; sources: SourceSnapshot[]; outputs: OutputSnapshot[] }
export class WallCleanupRecordError extends Error {
  readonly messageI18n = { es: 'Registro de limpieza inválido; no se cambió el dibujo. Recupera una versión nativa válida.', en: 'Invalid cleanup record; the drawing was not changed. Recover a valid native version.' };
  constructor() { super('Invalid wall cleanup record'); }
}
function requireRecord(value: unknown): asserts value { if (!value) throw new WallCleanupRecordError(); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string, unknown>, fields: string[]) { return Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)); }
function id(value: unknown): value is Id { return typeof value === 'string' && value.length > 0 && value.length <= 256; }
function link(value: unknown): value is Link {
  return object(value) && exact(value, ['version', 'selfId', 'anchorId', 'batchId']) && value.version === 1 && id(value.selfId) && id(value.anchorId) && id(value.batchId);
}
function sameLink(value: unknown, entityId: Id, record: WallCleanupRecord) {
  return link(value) && value.selfId === entityId && value.anchorId === record.selfId && value.batchId === record.batchId;
}
function shape(entity: MLineEntity) {
  return JSON.stringify({ type: entity.type, owner: entity.owner, vertices: entity.vertices, closed: entity.closed, scale: entity.scale, justification: entity.justification, style: entity.style });
}
function outputSnapshot(entity: Entity) {
  const meta = { ...entity.meta }; delete meta[OUTPUT];
  return JSON.stringify({ ...entity, meta: Object.keys(meta).length ? meta : undefined });
}
function without(meta: Entity['meta'], ...fields: string[]) {
  const clean = { ...meta }; for (const field of fields) delete clean[field];
  return Object.keys(clean).length ? clean : undefined;
}
function point(value: unknown): boolean { return object(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y); }
function snapshotValue(text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new WallCleanupRecordError(); }
  requireRecord(object(value)); return value;
}
export function hasWallCleanup(entity: Entity | undefined): boolean {
  return !!entity?.meta && [RECORD, SOURCE, OUTPUT].some(key => entity.meta![key] !== undefined);
}
/** Strict records are validated when used, rather than changing the opaque native meta schema. */
export function readWallCleanupRecord(doc: CadDocument, anchorId: Id): WallCleanupRecord {
  const anchor = doc.entity(anchorId), raw = anchor?.meta?.[RECORD];
  requireRecord(anchor?.type === 'mline' && object(raw) && exact(raw, ['version', 'selfId', 'batchId', 'groupId', 'sources', 'outputs']));
  requireRecord(raw.version === 1 && raw.selfId === anchorId && id(raw.batchId) && id(raw.groupId));
  requireRecord(Array.isArray(raw.sources) && raw.sources.length > 0 && raw.sources.length <= 100 && Array.isArray(raw.outputs) && raw.outputs.length <= 10000);
  requireRecord(raw.sources.every(s => object(s) && exact(s, ['id', 'visible', 'shape']) && id(s.id) && typeof s.visible === 'boolean' && typeof s.shape === 'string' && s.shape.length <= 1000000));
  requireRecord(raw.outputs.every(s => object(s) && exact(s, ['id', 'snapshot']) && id(s.id) && typeof s.snapshot === 'string' && s.snapshot.length <= 100000));
  const record = raw as unknown as WallCleanupRecord;
  const ids = [...record.sources, ...record.outputs].map(s => s.id);
  requireRecord(new Set(ids).size === ids.length && record.sources[0].id === anchorId);
  let points = 0;
  for (const source of record.sources) {
    const stored = snapshotValue(source.shape);
    requireRecord(exact(stored, ['type', 'owner', 'vertices', 'closed', 'scale', 'justification', 'style']) && stored.type === 'mline' && id(stored.owner) && id(stored.style) && typeof stored.closed === 'boolean' && typeof stored.scale === 'number' && Number.isFinite(stored.scale) && stored.scale > 0 && ['top', 'zero', 'bottom'].includes(stored.justification as string));
    requireRecord(Array.isArray(stored.vertices) && stored.vertices.length >= 2 && stored.vertices.length <= 5000 && stored.vertices.every(point));
    points += stored.vertices.length; requireRecord(points <= 5000);
  }
  for (const output of record.outputs) {
    const stored = snapshotValue(output.snapshot);
    requireRecord(stored.type === 'line' && stored.id === output.id && id(stored.owner) && id(stored.layer) && point(stored.start) && point(stored.end) && typeof stored.order === 'number' && Number.isFinite(stored.order));
  }
  // Deleted sources are never recreated. A replaced/corrupt source cannot authorize any writes.
  for (const source of record.sources) {
    const entity = doc.entity(source.id); if (!entity) continue;
    requireRecord(entity.type === 'mline' && sameLink(entity.meta?.[SOURCE], entity.id, record));
  }
  return structuredClone(record);
}
export function wallCleanupRecords(doc: CadDocument, selected?: readonly Id[]): WallCleanupRecord[] {
  const anchors: Id[] = [], cache = new Map<Id, WallCleanupRecord>();
  const read = (id: Id) => { let record = cache.get(id); if (!record) { record = readWallCleanupRecord(doc, id); cache.set(id, record); } return record; };
  if (selected) {
    requireRecord(selected.length <= 10000);
    const batches = new Set<Id>();
    for (const selectedId of selected) {
      const entity = doc.entity(selectedId), raw = entity?.meta?.[OUTPUT] ?? entity?.meta?.[SOURCE];
      requireRecord(entity && link(raw) && raw.selfId === selectedId);
      const record = read(raw.anchorId);
      requireRecord(sameLink(raw, selectedId, record) && (entity.meta?.[OUTPUT] !== undefined ? record.outputs : record.sources).some(s => s.id === selectedId));
      batches.add(record.batchId);
    }
    for (const entity of doc.data.entities.values()) if (entity.meta?.[RECORD] !== undefined) {
      const raw = entity.meta[RECORD];
      // Copied/imported records never become anchors for someone else's batch.
      if (object(raw) && batches.has(raw.batchId as Id)) anchors.push(entity.id);
    }
  } else for (const entity of doc.data.entities.values()) if (entity.meta?.[RECORD] !== undefined) anchors.push(entity.id);
  // Reject aggregate record sizes before parsing their geometry snapshots.
  requireRecord(anchors.length <= 100);
  let sourceCount = 0, outputCount = 0;
  for (const anchorId of anchors) {
    const raw = doc.entity(anchorId)?.meta?.[RECORD];
    requireRecord(object(raw) && Array.isArray(raw.sources) && Array.isArray(raw.outputs));
    sourceCount += raw.sources.length; outputCount += raw.outputs.length;
    requireRecord(sourceCount <= 100 && outputCount <= 10000);
  }
  const records = anchors.map(read);
  requireRecord(records.length <= 100 && records.reduce((sum, r) => sum + r.sources.length, 0) <= 100 && records.reduce((sum, r) => sum + r.outputs.length, 0) <= 10000);
  const sources = records.flatMap(r => r.sources.map(s => s.id)), outputs = records.flatMap(r => r.outputs.map(s => s.id));
  requireRecord(new Set([...sources, ...outputs]).size === sources.length + outputs.length);
  return records;
}
export interface CleanupRestoration { reveal: Entity[]; detach: Entity[]; remove: Id[]; preserved: Id[]; editedSources: Id[]; records: WallCleanupRecord[] }
/** Erased/ungrouped outputs do not prevent recovery. Ambiguous/edited outputs remain untouched. */
export function prepareWallRestoration(doc: CadDocument, records: WallCleanupRecord[]): CleanupRestoration {
  const reveal: Entity[] = [], detach: Entity[] = [], remove: Id[] = [], preserved: Id[] = [], editedSources: Id[] = [];
  for (const requested of records) {
    const record = readWallCleanupRecord(doc, requested.selfId);
    requireRecord(JSON.stringify(record) === JSON.stringify(requested));
    for (const source of record.sources) {
      const entity = doc.entity(source.id); if (!entity) continue;
      // Intact reciprocal identity authorizes visibility recovery even after a saved group MOVE.
      // Restore never writes stored source geometry or properties over the current entity.
      if (entity.type === 'mline' && shape(entity) !== source.shape) editedSources.push(source.id);
      reveal.push({ ...entity, visible: source.visible, meta: without(entity.meta, SOURCE, RECORD) });
    }
    for (const output of record.outputs) {
      const entity = doc.entity(output.id); if (!entity) continue;
      if (sameLink(entity.meta?.[OUTPUT], entity.id, record) && outputSnapshot(entity) === output.snapshot) remove.push(entity.id);
      else {
        preserved.push(entity.id);
        if (sameLink(entity.meta?.[OUTPUT], entity.id, record)) detach.push({ ...entity, meta: without(entity.meta, OUTPUT) });
      }
    }
  }
  return { reveal, detach, remove, preserved, editedSources, records };
}
export function createWallCleanup(tx: Transaction, walls: readonly (readonly MLineEntity[])[], segments: readonly CleanupSegment[]): Id[] {
  requireRecord(walls.length > 0 && walls.length <= 100 && walls.reduce((n, w) => n + w.length, 0) <= 100 && segments.length > 0 && segments.length <= 10000);
  const bySource = new Map<Id, { entity: MLineEntity; anchorId: Id }>();
  for (const wall of walls) for (const entity of wall) {
    requireRecord(!bySource.has(entity.id) && !hasWallCleanup(entity) && JSON.stringify(tx.doc.entity(entity.id)) === JSON.stringify(entity));
    bySource.set(entity.id, { entity, anchorId: entity.id });
  }
  requireRecord(segments.every(s => bySource.has(s.sourceKey) && [s.start.x, s.start.y, s.end.x, s.end.y].every(Number.isFinite)));
  const batchId = newId('cleanup'), groupId = newId('cleanup-group'), records = new Map<Id, WallCleanupRecord>();
  // Every hidden fragment carries its own recovery anchor. Erasing another original
  // must not strand surviving fragments; original native group ownership stays intact.
  for (const { entity } of bySource.values()) records.set(entity.id, { version: 1, selfId: entity.id, batchId, groupId, sources: [{ id: entity.id, visible: entity.visible, shape: shape(entity) }], outputs: [] });
  const ids: Id[] = [];
  for (const segment of segments) {
    const source = bySource.get(segment.sourceKey)!, entityId = newId(), record = records.get(source.anchorId)!;
    const { owner, layer, color, linetype, linetypeScale, lineweight, transparency, locked, construction, annotative } = source.entity;
    const meta = Object.fromEntries(Object.entries(source.entity.meta ?? {}).filter(([key]) => !/^fmodel(?:Wall|Component)/.test(key)));
    const entity: LineEntity = { owner, layer, color, linetype, linetypeScale, lineweight, transparency, locked, construction, annotative, visible: true, id: entityId, order: tx.doc.nextOrder(owner), type: 'line', start: { ...segment.start }, end: { ...segment.end }, meta: Object.keys(meta).length ? structuredClone(meta) : undefined };
    record.outputs.push({ id: entityId, snapshot: outputSnapshot(entity) });
    entity.meta = { ...entity.meta, [OUTPUT]: { version: 1, selfId: entityId, anchorId: record.selfId, batchId } };
    tx.add('entities', entity); ids.push(entityId);
  }
  for (const record of records.values()) for (const source of record.sources) {
    const entity = tx.doc.entity(source.id)!;
    tx.updateEntity(source.id, { visible: false, meta: { ...entity.meta, [SOURCE]: { version: 1, selfId: source.id, anchorId: record.selfId, batchId }, ...(source.id === record.selfId ? { [RECORD]: record } : {}) } });
  }
  tx.add('groups', { id: groupId, name: `FModel cleanup ${batchId}`, description: 'FModel wall cleanup v1', selectable: true, members: ids });
  return ids;
}
export function restoreWallCleanup(tx: Transaction, records: WallCleanupRecord[], canDetach: (entity: Entity) => boolean = () => true): CleanupRestoration {
  const result = prepareWallRestoration(tx.doc, records), removed = new Set(result.remove);
  const obsoleteMembers = new Set([...removed, ...records.flatMap(r => r.outputs.filter(s => !tx.doc.entity(s.id)).map(s => s.id))]);
  for (const entity of result.reveal) tx.put('entities', entity);
  for (const entity of result.detach) if (canDetach(entity)) tx.put('entities', entity);
  for (const entityId of removed) tx.removeEntity(entityId);
  // Remove only owned output members, including secondary user groups; keep added/foreign members.
  for (const group of tx.doc.data.groups.values()) {
    const members = group.members.filter(entityId => !obsoleteMembers.has(entityId));
    if (members.length === group.members.length) continue;
    if (!members.length && records.some(r => r.groupId === group.id && group.name === `FModel cleanup ${r.batchId}`) && group.description === 'FModel wall cleanup v1' && group.selectable === true) tx.remove('groups', group.id);
    else tx.update('groups', group.id, { members });
  }
  return result;
}
