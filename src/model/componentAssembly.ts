import type { CadDocument, Transaction } from '../document/document';
import { newId } from '../document/ids';
import type { Entity, EntityBase, Id } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { buildComponent } from '../geometry/architecture/components';
import { transformComponent } from '../geometry/architecture/primitives';
import { ComponentError, componentDefinition, requireLayout } from '../geometry/architecture/schema';
import type { ComponentKind, ComponentParameters, ComponentPrimitive } from '../geometry/architecture/types';
import { nearEqual } from '../geometry/tolerance';
import type { Vec2 } from '../geometry/vec';
export interface ComponentState { kind: ComponentKind; parameters: ComponentParameters; insertion: Vec2; rotation: number }
export interface ComponentAssembly extends ComponentState { groupId: Id; principalId: Id; owner: Id; members: Id[]; roles: ReadonlyMap<string, Id> }
export type ComponentProperties = Omit<EntityBase, 'id' | 'type' | 'order'>;
function validateProperties(doc: CadDocument, properties: ComponentProperties, textStyle: Id) {
  requireLayout(properties.owner === MODEL_SPACE_ID || doc.data.layouts.has(properties.owner) || doc.data.blocks.has(properties.owner));
  requireLayout(doc.data.layers.has(properties.layer) && doc.data.textStyles.has(textStyle));
  requireLayout(properties.linetype === 'ByLayer' || properties.linetype === 'ByBlock' || doc.data.linetypes.has(properties.linetype));
  requireLayout(Number.isFinite(properties.linetypeScale) && properties.linetypeScale > 0 && Number.isFinite(properties.lineweight));
  requireLayout(properties.transparency === 'ByLayer' || properties.transparency === 'ByBlock' || (typeof properties.transparency === 'number' && Number.isFinite(properties.transparency) && properties.transparency >= 0 && properties.transparency <= 90));
}
interface MemberTag { version: 1; group: Id; principal: Id; role: string }
interface AssemblyTag extends ComponentState { version: 1; group: Id }
function invalidAssembly(): never { throw new ComponentError({ es: 'Pieza incompleta o información paramétrica inválida; restaura el grupo nativo.', en: 'Incomplete component or invalid parametric data; restore the native group.' }); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function memberTag(entity: Entity | undefined): MemberTag {
  const tag = entity?.meta?.fmodelComponentMember;
  if (!record(tag) || tag.version !== 1 || typeof tag.group !== 'string' || typeof tag.principal !== 'string' || typeof tag.role !== 'string') invalidAssembly();
  return tag as unknown as MemberTag;
}
function statePrimitives(state: ComponentState) { return transformComponent(buildComponent(state.kind, state.parameters), state.insertion, state.rotation); }
function geometry(p: ComponentPrimitive, textStyle: Id): Record<string, unknown> {
  const { key: _key, ...shape } = p;
  return p.type === 'text' ? { ...shape, style: textStyle, alignPoint: p.position, halign: 'center', valign: 'middle', widthFactor: 1, oblique: 0 } : shape;
}
/** Standard base properties only; never carry another entity's geometry/schema fields. */
export function componentProperties(e: Entity): ComponentProperties {
  const { owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, annotative, meta } = e;
  return { owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, annotative, meta };
}
/** Preview entities use precisely the same builder/transformation as committed entities, with no document mutation. */
export function componentPreviewEntities(state: ComponentState, properties: ComponentProperties, textStyle: Id): Entity[] {
  return statePrimitives(state).map((p, index) => ({ ...properties, ...geometry(p, textStyle), id: `component-preview-${p.key}`, order: index } as unknown as Entity));
}
function closeGeometry(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && nearEqual(actual, expected);
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((v, i) => closeGeometry(actual[i], v));
  if (record(expected)) return record(actual) && Object.keys(expected).every(k => closeGeometry(actual[k], expected[k]));
  return actual === expected;
}
/** Validates the member, canonical principal, full group ownership/roles, parameters and native geometry before returning state. Throws ComponentError. */
export function readComponentAssembly(doc: CadDocument, memberId: Id): ComponentAssembly {
  const member = doc.entity(memberId), tag = memberTag(member), group = doc.data.groups.get(tag.group), principal = doc.entity(tag.principal), raw = principal?.meta?.fmodelComponent;
  if (!member || !group || !group.selectable || !group.members.includes(memberId) || group.members[0] !== tag.principal || !principal || !record(raw) || raw.version !== 1 || raw.group !== group.id || !record(raw.insertion) || !record(raw.parameters) || typeof raw.kind !== 'string' || typeof raw.rotation !== 'number') invalidAssembly();
  const state: ComponentState = { kind: raw!.kind as ComponentKind, parameters: raw!.parameters as ComponentParameters, insertion: raw!.insertion as unknown as Vec2, rotation: raw!.rotation as number };
  componentDefinition(state.kind);
  validateProperties(doc, componentProperties(principal!), doc.settings.currentTextStyle);
  const primitives = statePrimitives(state), roles = new Map<string, Id>();
  if (group!.members.length !== primitives.length || new Set(group!.members).size !== primitives.length) invalidAssembly();
  for (let i = 0; i < primitives.length; i++) {
    const e = doc.entity(group!.members[i]), t = memberTag(e), p = primitives[i];
    if (!e || e.id !== group!.members[i] || e.owner !== principal!.owner || t.group !== group!.id || t.principal !== principal!.id || t.role !== p.key || roles.has(t.role) || !closeGeometry(e, geometry(p, e.type === 'text' ? e.style : doc.settings.currentTextStyle))) invalidAssembly();
    validateProperties(doc, componentProperties(e!), e!.type === 'text' ? e!.style : doc.settings.currentTextStyle);
    if (e!.type === 'lwpolyline' && (e!.vertices.some(v => (v.bulge ?? 0) !== 0 || (v.startWidth ?? 0) !== 0 || (v.endWidth ?? 0) !== 0) || (e!.constantWidth ?? 0) !== 0)) invalidAssembly();
    if (i > 0 && e!.meta?.fmodelComponent !== undefined) invalidAssembly();
    if (!doc.data.layers.has(e!.layer) || (e!.type === 'text' && !doc.data.textStyles.has(e!.style))) invalidAssembly();
    roles.set(t.role, e!.id);
  }
  return { ...state, parameters: { ...state.parameters }, insertion: { ...state.insertion }, groupId: group!.id, principalId: principal!.id, owner: principal!.owner, members: [...group!.members], roles };
}
function metadata(meta: EntityBase['meta'], state: ComponentState, group: Id, principal: Id, role: string, anchor: boolean) {
  const clean = { ...meta }; delete clean.fmodelComponent; delete clean.fmodelComponentMember;
  return { ...clean, fmodelComponentMember: { version: 1, group, principal, role } satisfies MemberTag, ...(anchor ? { fmodelComponent: { ...state, parameters: { ...state.parameters }, insertion: { ...state.insertion }, version: 1, group } satisfies AssemblyTag } : {}) };
}
/** Call inside one CommandApi.apply/CadDocument.transact. Builds and validates everything before any entity/group write. */
export function createComponentAssembly(tx: Transaction, state: ComponentState, properties: ComponentProperties, textStyle: Id): ComponentAssembly {
  const primitives = statePrimitives(state), groupId = newId('component'), ids = primitives.map(() => newId());
  validateProperties(tx.doc, properties, textStyle);
  const members = primitives.map((p, i) => tx.addEntity({ ...properties, ...geometry(p, textStyle), id: ids[i], meta: metadata(properties.meta, state, groupId, ids[0], p.key, i === 0) } as never).id);
  tx.add('groups', { id: groupId, name: `FModel ${state.kind} ${groupId}`, description: `FModel component v1: ${state.kind}`, members, selectable: true });
  return readComponentAssembly(tx.doc, members[0]);
}
/** Revalidates current membership; surviving role IDs/orders/properties and text style remain unchanged. New roles inherit principal properties/current text style. */
export function updateComponentAssembly(tx: Transaction, memberId: Id, state: ComponentState): ComponentAssembly {
  const before = readComponentAssembly(tx.doc, memberId); requireLayout(state.kind === before.kind);
  const primitives = statePrimitives(state), principal = tx.doc.entity(before.principalId)!, ids = primitives.map(p => before.roles.get(p.key) ?? newId()), principalId = ids[0];
  // All state/geometry validation happens before this first write.
  const survivors = new Set(ids);
  for (let i = 0; i < primitives.length; i++) {
    const p = primitives[i], previous = tx.doc.entity(ids[i]), properties = componentProperties(previous ?? principal), style = previous?.type === 'text' ? previous.style : tx.doc.settings.currentTextStyle;
    const entity = { ...properties, ...geometry(p, style), id: ids[i], meta: metadata(properties.meta, state, before.groupId, principalId, p.key, i === 0) };
    if (previous) tx.put('entities', { ...entity, order: previous.order } as unknown as Entity); else tx.addEntity(entity as never);
  }
  const removed = new Set(before.members.filter(id => !survivors.has(id)));
  for (const id of removed) tx.removeEntity(id);
  // A user group may also contain component members; keep its surviving membership coherent.
  if (removed.size) for (const group of tx.doc.data.groups.values()) {
    if (group.id === before.groupId) continue;
    const members = group.members.filter(id => !removed.has(id));
    if (members.length !== group.members.length) tx.update('groups', group.id, { members });
  }
  tx.update('groups', before.groupId, { members: ids });
  return readComponentAssembly(tx.doc, principalId);
}
