import type { DocumentData, Entity } from './types';
import { detachProductionLinks } from './architectureAutomation';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function validOpeningAnnotations(entity: Record<string, unknown>): boolean {
  const schedule = entity.openingSchedule, tag = entity.openingTag;
  if (schedule !== undefined && (entity.type !== 'table' || !record(schedule) || schedule.version !== 1 || (schedule.language !== 'es' && schedule.language !== 'en') ||
    (schedule.status !== undefined && schedule.status !== 'review') ||
    (schedule.tags !== undefined && (!record(schedule.tags) || !finite(schedule.tags.height) || schedule.tags.height <= 0 || !id(schedule.tags.style) || !id(schedule.tags.layer))))) return false;
  if (tag !== undefined && (entity.type !== 'text' || !record(tag) || tag.version !== 1 || !id(tag.scheduleId) || !id(tag.anchorId) || !id(tag.openingId) ||
    !record(tag.base) || !finite(tag.base.x) || !finite(tag.base.y))) return false;
  return true;
}
export function detachOpeningAnnotation<E extends Entity>(entity: E): E {
  entity = detachProductionLinks(entity);
  if (entity.type === 'table' && entity.openingSchedule !== undefined) { const { openingSchedule: _link, ...rest } = entity; return rest as E; }
  if (entity.type === 'text' && entity.openingTag !== undefined) { const { openingTag: _link, ...rest } = entity; return rest as E; }
  return entity;
}
/** Preserve visible contents while removing references that cannot be resolved. */
export function repairOpeningAnnotations(data: DocumentData): string[] {
  const warnings: string[] = [];
  const detach = (entityId: string, entity: Entity) => {
    data.entities.set(entityId, detachOpeningAnnotation(entity));
    warnings.push(`Asociación de huecos desvinculada en «${entityId}»; contenido conservado. / Opening association detached in "${entityId}"; contents preserved.`);
  };
  // Resolve schedules first: native entity order has no referential meaning.
  for (const [entityId, entity] of data.entities) {
    if (entity.type === 'table' && entity.openingSchedule) {
      const config = entity.openingSchedule.tags;
      if (entity.columnWidths.length !== 4 || (config !== undefined && (!data.layers.has(config.layer) || !data.textStyles.has(config.style)))) detach(entityId, entity);
    }
  }
  for (const [entityId, entity] of data.entities) {
    if (entity.type === 'text' && entity.openingTag) {
      const link = entity.openingTag, table = data.entities.get(link.scheduleId), anchor = data.entities.get(link.anchorId);
      const source = anchor?.meta?.fmodelWallAssembly;
      let broken = table?.type !== 'table' || !table.openingSchedule?.tags || table.owner !== entity.owner || anchor?.type !== 'mline' || anchor.owner !== entity.owner || source === undefined;
      // A damaged/cleaned wall remains recoverable. A readable identity list
      // can still conclusively disprove an opening reference without model imports.
      if (record(source) && Array.isArray(source.openings) && source.openings.every(o => record(o) && id(o.id))) {
        broken ||= !source.openings.some(o => (o as Record<string, unknown>).id === link.openingId);
      }
      const member = anchor?.meta?.fmodelWallMember;
      if (record(member) && id(member.anchorId)) broken ||= member.anchorId !== link.anchorId;
      if (broken) detach(entityId, entity);
    }
  }
  return warnings;
}
