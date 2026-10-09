import type { CadDocument, Transaction } from '../document/document';
import { entityDefaults } from '../document/defaults';
import type { DimensionEntity, Entity, Id, WallDimensionsAutomation } from '../document/types';
import { add, sub, scale, perp, dist, dot, type Vec2 } from '../geometry/vec';
import { linearTol } from '../geometry/tolerance';
import { wallFaces } from '../geometry/walls';
import { polygonFillLoop } from '../geometry/wallFill';
import { readWallSource } from './wallAssembly';
import { markAutomationReview } from './automationReview';
export class ArchitecturalError extends Error {
  constructor(readonly messageI18n: {
    es: string;
    en: string;
  }) { super(messageI18n.es); }
}
export const failArchitecture = () => { throw new ArchitecturalError({ es: 'Selecciona un muro nativo o contorno cerrado recto, válido y del mismo espacio.', en: 'Select a valid native wall or straight closed boundary in the same space.' }); };
export function ringArea(points: readonly Vec2[]): number {
  const base = points[0];
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = sub(points[i], base), b = sub(points[(i + 1) % points.length], base);
    twice += a.x * b.y - a.y * b.x;
  }
  return twice / 2;
}
export function roomBoundary(doc: CadDocument, id: Id): Vec2[] {
  const e = doc.entity(id);
  if (!e)
    return failArchitecture();
  let points: Vec2[];
  if (e.type === 'lwpolyline' && e.closed && e.vertices.length <= 5000 && e.vertices.every(v => !v.bulge))
    points = e.vertices.map(p => ({ x: p.x, y: p.y }));
  else {
    const { source } = readWallSource(doc, id);
    if (!source.closed || source.vertices.length > 5000)
      return failArchitecture();
    points = wallFaces(source).sort((a, b) => Math.abs(ringArea(a)) - Math.abs(ringArea(b)))[0];
  }
  polygonFillLoop(points);
  if (!Number.isFinite(ringArea(points)))
    return failArchitecture();
  return points;
}
export function dimensionCandidates(doc: CadDocument, config: WallDimensionsAutomation): Map<string, DimensionEntity> {
  const out = new Map<string, DimensionEntity>();
  if (!doc.data.dimStyles.has(config.style) || !doc.data.layers.has(config.layer))
    return failArchitecture();
  for (const sourceId of config.sources) {
    const entity = doc.entity(sourceId);
    if (!entity)
      continue;
    if (entity.owner !== config.owner)
      return failArchitecture();
    const boundary = entity.type === 'lwpolyline';
    const wall = boundary ? null : readWallSource(doc, sourceId), closed = boundary || wall!.source.closed;
    const points = closed ? roomBoundary(doc, sourceId) : wall!.source.vertices;
    if (points.length > 5000)
      return failArchitecture();
    const exterior = closed && ringArea(points) < 0 ? 1 : -1;
    for (let segment = 0; segment < points.length - (closed ? 0 : 1); segment++) {
      const a = points[segment], b = points[(segment + 1) % points.length], length = dist(a, b), direction = scale(sub(b, a), 1 / length), normal = scale(perp(direction), exterior);
      const tol = linearTol(Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), length));
      if (!Number.isFinite(length) || length <= tol)
        return failArchitecture();
      const cuts = [{ at: 0, key: 'start' }, { at: length, key: 'end' }];
      for (const opening of wall?.assembly?.openings ?? [])
        if (opening.segment === segment) {
          const center = add(wall!.source.vertices[segment], scale(direction, opening.offset)), at = dot(sub(center, a), direction);
          cuts.push({ at: at - opening.width / 2, key: `${opening.id}:a` }, { at: at + opening.width / 2, key: `${opening.id}:b` });
        }
      cuts.sort((a, b) => a.at - b.at);
      const unique = cuts.filter((c, i) => i === 0 || c.at - cuts[i - 1].at > tol);
      if (unique[0].at < -tol || unique.at(-1)!.at > length + tol)
        return failArchitecture();
      const create = (from: number, to: number, offset: number, key: string) => {
        const p1 = add(a, scale(direction, from)), p2 = add(a, scale(direction, to)), p3 = add(p1, scale(normal, offset));
        if (![p1, p2, p3].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
          return failArchitecture();
        out.set(JSON.stringify([sourceId, segment, key]), { ...entityDefaults(doc, config.owner), id: `preview-dim-${out.size}`, order: doc.nextOrder(config.owner) + out.size, type: 'dimension', layer: config.layer, style: config.style, dimType: 'aligned', p1, p2, p3, rotation: Math.atan2(direction.y, direction.x), overrides: { overallScale: 1, textHeight: config.height, textFill:'background', arrowSize: config.height * 0.65, textGap: config.height * 0.2, extLineOffset: config.height * 0.25, extLineExtension: config.height * 0.5, arrow1: 'architectural', arrow2: 'architectural' } });
        if (out.size > 1000)
          throw new ArchitecturalError({ es: 'Máximo 1000 cotas por lote.', en: 'At most 1000 dimensions per batch.' });
      };
      for (let i = 0; i < unique.length - 1; i++)
        create(unique[i].at, unique[i + 1].at, config.offset, `${unique[i].key}/${unique[i + 1].key}`);
      if (unique.length > 2)
        create(0, length, config.offset + config.height * 4, 'total');
    }
  }
  return out;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function synchronizeWallDimensions(tx: Transaction, groupId: Id): void {
  const group = tx.doc.data.groups.get(groupId), config = group?.automation;
  if (!group || config?.kind !== 'wall-dimensions')
    return;
  let candidates: Map<string, DimensionEntity>;
  try {
    candidates = dimensionCandidates(tx.doc, config);
    for (const [key, shape] of candidates) {
      const oldId = config.outputs[key], old = oldId ? tx.doc.entity(oldId) : undefined;
      if (old?.type === 'dimension') {
        const p = add(shape.p3, sub(old.p3, config.bases[old.id] ?? old.p3));
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
          return failArchitecture();
      }
    }
  }
  catch {
    markAutomationReview(tx, groupId, { es: 'Revisar cotas del plano', en: 'Review plan dimensions' }, config.height);
    return;
  }
  const outputs: Record<string, Id> = {}, bases: Record<Id, Vec2> = {}, snapshots: Record<Id, string> = {};
  for (const [key, shape] of candidates) {
    const oldId = config.outputs[key], old = oldId ? tx.doc.entity(oldId) : undefined, base = shape.p3;
    let next: Entity;
    if (old?.type === 'dimension') {
      const p3 = add(base, sub(old.p3, config.bases[old.id] ?? old.p3));
      if (!Number.isFinite(p3.x) || !Number.isFinite(p3.y))
        throw new ArchitecturalError({ es: 'Desplazamiento de cota no representable.', en: 'Dimension offset cannot be represented.' });
      next = { ...old, p1: shape.p1, p2: shape.p2, p3, rotation: shape.rotation };
      if (!same(old, next))
        tx.put('entities', next);
    }
    else {
      const { id: _id, order: _order, ...rest } = shape;
      next = tx.addEntity(rest);
    }
    outputs[key] = next.id;
    bases[next.id] = base;
    snapshots[next.id] = JSON.stringify(next);
  }
  for (const oldId of Object.values(config.outputs))
    if (!Object.values(outputs).includes(oldId)) {
      const e = tx.doc.entity(oldId);
      if (e && config.snapshots[oldId] === JSON.stringify(e))
        tx.removeEntity(oldId);
    }
  const sources = config.sources.filter(id => tx.doc.entity(id));
  if (!sources.length) {
    tx.remove('groups', groupId);
    return;
  }
  const { status: _status, ...active } = config, next = { ...group, description: 'FModel automatic dimensions v1', members: Object.values(outputs), automation: { ...active, sources, outputs, bases, snapshots } };
  if (!same(group, next))
    tx.put('groups', next);
}
export function installArchitecturalDimensions(doc: CadDocument): () => void {
  return doc.addReactor((tx, changes) => {
    const changed = new Set(changes.filter(c => c.coll === 'entities').map(c => c.id));
    const groups = new Set(changes.filter(c => c.coll === 'groups').map(c => c.id));
    const styles = changes.some(c => c.coll === 'mlineStyles' || c.coll === 'dimStyles');
    for (const g of doc.data.groups.values())
      if (g.automation?.kind === 'wall-dimensions' && (styles || groups.size > 0 || g.automation.sources.some(id => changed.has(id))))
        synchronizeWallDimensions(tx, g.id);
  });
}
