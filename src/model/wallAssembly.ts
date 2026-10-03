import type { CadDocument, Transaction } from '../document/document';
import { newId } from '../document/ids';
import { MODEL_SPACE_ID, type Entity, type EntityBase, type Id, type MLineEntity } from '../document/types';
import { buildWallAssembly, type WallOpeningSpec } from '../geometry/wallOpenings';
import { nearEqual } from '../geometry/tolerance';
import type { WallPath } from '../geometry/walls';
import { isWallStyle } from './wallStyle';

export interface WallAssemblySource extends WallPath { style: Id; owner: Id }
export interface WallAssembly { source: WallAssemblySource; groupId: Id; anchorId: Id; roles: ReadonlyMap<string, Id>; members: Id[]; openings: WallOpeningSpec[] }
export class WallAssemblyError extends Error {
  readonly messageI18n = { es: 'Grupo de muro incompleto o modificado; restaura el grupo nativo antes de editar sus huecos.', en: 'Wall group is incomplete or modified; restore the native group before editing its openings.' };
  constructor() { super('Invalid or modified wall assembly'); }
}
interface MemberTag { version: 1; groupId: Id; anchorId: Id; role: string; openingId?: string }
interface AssemblyTag { version: 1; groupId: Id; source: WallAssemblySource; openings: WallOpeningSpec[] }
interface RoleGeometry { key: string; openingId?: string; shape: Record<string, unknown> }
function requireAssembly(condition: unknown): asserts condition { if (!condition) throw new WallAssemblyError(); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function geometryMatches(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && nearEqual(actual, expected);
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, i) => geometryMatches(actual[i], value));
  if (record(expected)) return record(actual) && Object.keys(expected).every(key => geometryMatches(actual[key], expected[key]));
  return actual === expected;
}
function sourceOf(wall: MLineEntity): WallAssemblySource {
  return { vertices: wall.vertices.map(p => ({ x: p.x, y: p.y })), closed: wall.closed, scale: wall.scale, justification: wall.justification, style: wall.style, owner: wall.owner };
}
function cloneSource(source: WallAssemblySource): WallAssemblySource { return { ...source, vertices: source.vertices.map(p => ({ ...p })) }; }
function validateSource(doc: CadDocument, value: unknown): asserts value is WallAssemblySource {
  requireAssembly(record(value) && keys(value, ['vertices', 'closed', 'scale', 'justification', 'style', 'owner']));
  requireAssembly(typeof value.style === 'string' && isWallStyle(doc.data.mlineStyles.get(value.style)));
  requireAssembly(typeof value.owner === 'string' && (value.owner === MODEL_SPACE_ID || doc.data.layouts.has(value.owner) || doc.data.blocks.has(value.owner)));
  requireAssembly(Array.isArray(value.vertices) && value.vertices.every(p => record(p) && keys(p, ['x', 'y'])));
  try { buildWallAssembly(value as unknown as WallAssemblySource, []); } catch { throw new WallAssemblyError(); }
}
function validateProperties(doc: CadDocument, entity: Entity): void {
  requireAssembly(doc.data.layers.has(entity.layer));
  requireAssembly(entity.linetype === 'ByLayer' || entity.linetype === 'ByBlock' || doc.data.linetypes.has(entity.linetype));
  requireAssembly(Number.isFinite(entity.linetypeScale) && entity.linetypeScale > 0 && Number.isFinite(entity.lineweight));
  requireAssembly(entity.transparency === 'ByLayer' || entity.transparency === 'ByBlock' || (typeof entity.transparency === 'number' && Number.isFinite(entity.transparency) && entity.transparency >= 0 && entity.transparency <= 90));
  requireAssembly(Number.isFinite(entity.order));
  // Other native parametric owners cannot share responsibility for these members.
  requireAssembly(entity.meta?.fmodelComponent === undefined && entity.meta?.fmodelComponentMember === undefined);
}
function memberTag(entity: Entity | undefined): MemberTag {
  const raw = entity?.meta?.fmodelWallMember;
  requireAssembly(record(raw) && keys(raw, ['version', 'groupId', 'anchorId', 'role'], ['openingId']));
  requireAssembly(raw.version === 1 && typeof raw.groupId === 'string' && typeof raw.anchorId === 'string' && typeof raw.role === 'string');
  requireAssembly(raw.openingId === undefined || typeof raw.openingId === 'string');
  return raw as unknown as MemberTag;
}
function roleGeometry(source: WallAssemblySource, openings: WallOpeningSpec[]): RoleGeometry[] {
  const result = buildWallAssembly(source, openings);
  return [
    ...result.fragments.map(f => ({ key: f.key, shape: { type: 'mline', vertices: f.vertices, closed: f.closed, scale: source.scale, justification: source.justification, style: source.style } })),
    ...result.symbols.map(symbol => { const { key, openingId, ...shape } = symbol; return { key, openingId, shape }; }),
  ];
}
/** Validates structural ownership, exact native group roles and current geometry. Properties remain editable. */
export function readWallAssembly(doc: CadDocument, memberId: Id): WallAssembly {
  const selected = doc.entity(memberId), tag = memberTag(selected), group = doc.data.groups.get(tag.groupId), anchor = doc.entity(tag.anchorId);
  requireAssembly(selected && group && group.id === tag.groupId && group.selectable === true && typeof group.name === 'string' && typeof group.description === 'string');
  requireAssembly(Array.isArray(group.members) && group.members[0] === tag.anchorId && group.members.includes(memberId));
  requireAssembly(anchor?.type === 'mline');
  const raw = anchor.meta?.fmodelWallAssembly;
  requireAssembly(record(raw) && keys(raw, ['version', 'groupId', 'source', 'openings']) && raw.version === 1 && raw.groupId === group.id);
  validateSource(doc, raw.source);
  requireAssembly(Array.isArray(raw.openings) && raw.openings.length > 0 && raw.openings.length <= 200);
  requireAssembly(raw.openings.every(o => record(o) && keys(o, ['id', 'segment', 'offset', 'width', 'type', 'side', 'hingeEnd'])));
  const source = raw.source, openings = raw.openings as WallOpeningSpec[];
  let primitives: RoleGeometry[];
  try { primitives = roleGeometry(source, openings); } catch { throw new WallAssemblyError(); }
  requireAssembly(group.members.length === primitives.length && new Set(group.members).size === primitives.length);
  const roles = new Map<string, Id>();
  for (let i = 0; i < primitives.length; i++) {
    const entity = doc.entity(group.members[i]), member = memberTag(entity), primitive = primitives[i];
    requireAssembly(entity && entity.id === group.members[i] && entity.owner === source.owner);
    requireAssembly(member.groupId === group.id && member.anchorId === anchor.id && member.role === primitive.key && member.openingId === primitive.openingId && !roles.has(member.role));
    requireAssembly(i === 0 || entity.meta?.fmodelWallAssembly === undefined);
    requireAssembly(geometryMatches(entity, primitive.shape));
    validateProperties(doc, entity);
    roles.set(member.role, entity.id);
  }
  return { source: cloneSource(source), groupId: group.id, anchorId: anchor.id, members: [...group.members], roles, openings: openings.map(o => ({ ...o })) };
}
/** Resolves a compatible independent wall or any validated associated fragment/symbol. No editability policy. */
export function readWallSource(doc: CadDocument, memberId: Id): { source: WallAssemblySource; anchorId: Id; assembly: WallAssembly | null } {
  const entity = doc.entity(memberId);
  requireAssembly(entity);
  if (entity.meta?.fmodelWallMember !== undefined || entity.meta?.fmodelWallAssembly !== undefined) {
    const assembly = readWallAssembly(doc, memberId);
    return { source: cloneSource(assembly.source), anchorId: assembly.anchorId, assembly };
  }
  requireAssembly(entity.type === 'mline');
  const source = sourceOf(entity);
  validateSource(doc, source); validateProperties(doc, entity);
  return { source, anchorId: entity.id, assembly: null };
}
/** A wall fragment never implicitly selects one of the group's openings. */
export function readWallOpening(doc: CadDocument, memberId: Id): { assembly: WallAssembly; opening: WallOpeningSpec } {
  const assembly = readWallAssembly(doc, memberId), tag = memberTag(doc.entity(memberId));
  const opening = assembly.openings.find(o => o.id === tag.openingId);
  requireAssembly(opening);
  return { assembly, opening: { ...opening } };
}
function properties(entity: Entity): Omit<EntityBase, 'id' | 'type' | 'order'> {
  const { owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, annotative, meta } = entity;
  return { owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, annotative, meta };
}
function cleanMetadata(meta: EntityBase['meta']): EntityBase['meta'] {
  if (!meta) return undefined;
  const clean = { ...meta }; delete clean.fmodelWallAssembly; delete clean.fmodelWallMember;
  return Object.keys(clean).length ? clean : undefined;
}
function metadata(meta: EntityBase['meta'], source: WallAssemblySource, openings: WallOpeningSpec[], groupId: Id, anchorId: Id, role: RoleGeometry, anchor: boolean): EntityBase['meta'] {
  const member: MemberTag = { version: 1, groupId, anchorId, role: role.key, ...(role.openingId === undefined ? {} : { openingId: role.openingId }) };
  const assembly: AssemblyTag = { version: 1, groupId, source: cloneSource(source), openings: openings.map(o => ({ ...o })) };
  return { ...cleanMetadata(meta), fmodelWallMember: member, ...(anchor ? { fmodelWallAssembly: assembly } : {}) };
}
function removeRoles(tx: Transaction, removed: Set<Id>, ownGroup: Id): void {
  for (const id of removed) tx.removeEntity(id);
  if (!removed.size) return;
  // Keep secondary native records, even empty, and retain their surviving member order.
  for (const group of tx.doc.data.groups.values()) {
    if (group.id === ownGroup) continue;
    const members = group.members.filter(id => !removed.has(id));
    if (members.length !== group.members.length) tx.update('groups', group.id, { members });
  }
}
function reconcile(tx: Transaction, anchor: Entity, source: WallAssemblySource, openings: WallOpeningSpec[], primitives: RoleGeometry[], before: WallAssembly | null): WallAssembly | null {
  if (!openings.length) {
    if (!before) return null;
    removeRoles(tx, new Set(before.members.filter(id => id !== anchor.id)), before.groupId);
    tx.put('entities', { ...properties(anchor), ...source, id: anchor.id, order: anchor.order, type: 'mline', meta: cleanMetadata(anchor.meta) });
    tx.remove('groups', before.groupId);
    return null;
  }
  const groupId = before?.groupId ?? newId('wall'), ids = primitives.map((p, i) => i === 0 ? anchor.id : before?.roles.get(p.key) ?? newId());
  for (let i = 0; i < primitives.length; i++) {
    const primitive = primitives[i], previous = tx.doc.entity(ids[i]), base = properties(previous ?? anchor);
    const entity = { ...base, ...primitive.shape, id: ids[i], meta: metadata(base.meta, source, openings, groupId, anchor.id, primitive, i === 0) };
    if (previous) tx.put('entities', { ...entity, order: previous.order } as unknown as Entity);
    else tx.addEntity(entity as never);
  }
  if (before) {
    const survivors = new Set(ids);
    removeRoles(tx, new Set(before.members.filter(id => !survivors.has(id))), groupId);
    tx.update('groups', groupId, { members: ids });
  } else tx.add('groups', { id: groupId, name: `FModel wall ${groupId}`, description: 'FModel wall assembly v1', members: ids, selectable: true });
  return readWallAssembly(tx.doc, anchor.id);
}
/** Revalidates the independent wall and source snapshot; builds everything before any write. */
export function createWallAssembly(tx: Transaction, anchorId: Id, source: WallAssemblySource, openings: WallOpeningSpec[]): WallAssembly | null {
  const current = readWallSource(tx.doc, anchorId);
  requireAssembly(!current.assembly);
  validateSource(tx.doc, source);
  requireAssembly(geometryMatches(source, current.source));
  const primitives = roleGeometry(source, openings);
  return reconcile(tx, tx.doc.entity(anchorId)!, cloneSource(source), openings, primitives, null);
}
/** Revalidates current association. Only source thickness can change; owner/style/path remain the validated source. */
export function updateWallAssembly(tx: Transaction, memberId: Id, source: WallAssemblySource, openings: WallOpeningSpec[]): WallAssembly | null {
  const before = readWallAssembly(tx.doc, memberId);
  validateSource(tx.doc, source);
  requireAssembly(geometryMatches({ ...source, scale: before.source.scale }, before.source));
  const primitives = roleGeometry(source, openings);
  return reconcile(tx, tx.doc.entity(before.anchorId)!, cloneSource(source), openings, primitives, before);
}
