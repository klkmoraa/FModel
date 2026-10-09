import type { DocumentData, Entity } from './types';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const point = (v: unknown) => obj(v) && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y);
const dict = (v: unknown, check: (v: unknown) => boolean) => obj(v) && Object.keys(v).length <= 10000 && Object.entries(v).every(([k, x]) => k.length > 0 && k.length <= 1024 && check(x));
const lang = (v: unknown) => v === 'es' || v === 'en';
export function validArchitectureAutomation(v: unknown): boolean {
  if (!obj(v) || v.version !== 1 || !id(v.owner) || !lang(v.language) || (v.status !== undefined && v.status !== 'review') ||
    !dict(v.outputs, id) || !dict(v.snapshots, x => typeof x === 'string' && x.length <= 1000000))
    return false;
  if (v.kind === 'wall-dimensions')
    return Array.isArray(v.sources) && v.sources.length > 0 && v.sources.length <= 100 && v.sources.every(id) && new Set(v.sources).size === v.sources.length && positive(v.offset) && positive(v.height) && id(v.style) && id(v.layer) && dict(v.bases, point);
  if (v.kind === 'wall-network')
    return (v.fill === 'none' || v.fill === 'solid' || v.fill === 'user') && positive(v.spacing) && typeof v.angle === 'number' && Number.isFinite(v.angle) && dict(v.hidden, x => typeof x === 'boolean') && dict(v.sourceForOutput, id);
  return false;
}
export function validRoomAnnotations(e: Record<string, unknown>): boolean {
  if (e.room !== undefined) {
    const r = e.room;
    if (!['mline', 'lwpolyline'].includes(String(e.type)) || !obj(r) || r.version !== 1 || !id(r.name) ||
      ![r.floorMaterial, r.wallMaterial].every(x => typeof x === 'string' && x.length <= 256) || !positive(r.height))
      return false;
  }
  if (e.roomLabel !== undefined) {
    const r = e.roomLabel;
    if (e.type !== 'text' || !obj(r) || r.version !== 1 || !id(r.sourceId) || !point(r.base) || !lang(r.language))
      return false;
  }
  if (e.roomSchedule !== undefined) {
    const r = e.roomSchedule;
    if (e.type !== 'table' || !obj(r) || r.version !== 1 || !lang(r.language) || (r.mode !== 'rooms' && r.mode !== 'materials') || (r.status !== undefined && r.status !== 'review'))
      return false;
  }
  return true;
}
export function detachProductionLinks<E extends Entity>(e: E): E {
  const copy = { ...e };
  delete copy.room;
  if (copy.type === 'text')
    delete copy.roomLabel;
  if (copy.type === 'table')
    delete copy.roomSchedule;
  return copy;
}
export function repairArchitectureAutomation(data: DocumentData): string[] {
  const warnings: string[] = [];
  for (const [id, e] of data.entities)
    if (e.type === 'text' && e.roomLabel) {
      const source = data.entities.get(e.roomLabel.sourceId);
      if (!source?.room || source.owner !== e.owner) {
        const { roomLabel: _r, ...rest } = e;
        data.entities.set(id, rest);
        warnings.push('Etiqueta de habitación desvinculada; texto conservado. / Room label detached; text preserved.');
      }
    }
  for (const [id, e] of data.entities)
    if (e.type === 'table' && e.roomSchedule && e.columnWidths.length !== (e.roomSchedule.mode === 'rooms' ? 6 : 3)) {
      const { roomSchedule: _r, ...rest } = e;
      data.entities.set(id, rest);
      warnings.push('Cuadro de habitaciones desvinculado; contenido conservado. / Room schedule detached; contents preserved.');
    }
  for (const [id, g] of data.groups)
    if (g.automation) {
      const a = g.automation, owner = a.owner === '*model' || data.layouts.has(a.owner) || data.blocks.has(a.owner);
      const generated = Object.values(a.outputs), ids = new Set(generated);
      const broken = !owner || ids.size !== generated.length || g.members.length !== generated.length || generated.some(id => !g.members.includes(id) || !data.entities.has(id) || data.entities.get(id)?.owner !== a.owner || !Object.hasOwn(a.snapshots, id)) ||
        (a.kind === 'wall-dimensions' && (!data.layers.has(a.layer) || !data.dimStyles.has(a.style) || a.sources.some(id => !data.entities.has(id) || data.entities.get(id)?.owner !== a.owner || (data.entities.get(id)?.type !== 'mline' && data.entities.get(id)?.type !== 'lwpolyline')) || generated.some(id => id !== a.outputs.$review && (data.entities.get(id)?.type !== 'dimension' || !Object.hasOwn(a.bases, id))))) ||
        (a.kind === 'wall-network' && (Object.keys(a.hidden).some(id => data.entities.get(id)?.type !== 'mline' || data.entities.get(id)?.owner !== a.owner) || Object.entries(a.sourceForOutput).some(([id, source]) => !ids.has(id) || !data.entities.has(source) || data.entities.get(source)?.owner !== a.owner) || generated.some(id => id !== a.outputs.$review && ((data.entities.get(id)?.type !== 'line' && data.entities.get(id)?.type !== 'hatch') || !Object.hasOwn(a.sourceForOutput, id)))));
      if (broken) {
        if (a.kind === 'wall-network')
          for (const [id, visible] of Object.entries(a.hidden)) {
            const e = data.entities.get(id);
            if (e?.type === 'mline' && e.owner === a.owner)
              data.entities.set(id, { ...e, visible });
          }
        const { automation: _a, ...rest } = g;
        data.groups.set(id, rest);
        warnings.push('Automatización desvinculada; geometría conservada. / Automation detached; geometry preserved.');
      }
    }
  return warnings;
}
