import type { CadDocument, Transaction } from '../document/document';
import { UNIT_TO_MM } from '../document/defaults';
import type { Entity, EntityBase, Id, Loop, MLineEntity, WallNetworkAutomation } from '../document/types';
import { cleanWallFaces, type CleanupColumn, type CleanupWall } from '../geometry/wallCleanup';
import { circleFillLoop, polygonFillLoop, wallFillLoops } from '../geometry/wallFill';
import { TOL } from '../geometry/tolerance';
import { readWallSource } from './wallAssembly';
import { readComponentAssembly } from './componentAssembly';
import { isWallStyle } from './wallStyle';
import { hatchBox, hatchPolygons } from './hatchPatterns';
import { ArchitecturalError } from './architecturalDimensions';
import { markAutomationReview } from './automationReview';
const limit = () => { throw new ArchitecturalError({ es: 'Reduce la red: máximo 100 fragmentos/columnas, 5000 puntos, 10000 salidas y 2000000 operaciones.', en: 'Reduce the network: at most 100 fragments/columns, 5000 points, 10000 outputs and 2000000 operations.' }); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function properties(e: Entity): Omit<EntityBase, 'id' | 'type' | 'order'> {
  const { owner, layer, color, linetype, linetypeScale, lineweight, transparency, locked, construction, annotative } = e;
  return { owner, layer, color, linetype, linetypeScale, lineweight, transparency, locked, construction, annotative, visible: true };
}
export interface NetworkCandidate {
  entity: Entity;
  source: Id;
}
export function networkCandidates(doc: CadDocument, config: WallNetworkAutomation): {
  outputs: Map<string, NetworkCandidate>;
  hidden: Record<Id, boolean>;
  members: Id[];
} {
  const generated=new Set(Object.values(config.outputs));let baseline=0;
  for(const e of doc.data.entities.values())if(e.owner===config.owner&&!generated.has(e.id))baseline=Math.min(baseline,e.order);
  if(!Number.isFinite(baseline-2)||baseline-2===baseline)throw new ArchitecturalError({es:'Orden de dibujo fuera del rango válido.',en:'Draw order exceeds the valid range.'});
  const paths: CleanupWall[] = [], columns: CleanupColumn[] = [], fragments: MLineEntity[] = [], fills: {
    key: string;
    entity: Entity;
    loops: Loop[];
    origin: {
      x: number;
      y: number;
    };
    source: Id;
  }[] = [], seen = new Set<Id>(), sourceOf = new Map<Id, Id>(), members: Id[] = [];
  const raw = [...doc.data.entities.values()].filter(e => e.owner === config.owner && (config.hidden[e.id] ?? e.visible) && ((e.type === 'mline' && isWallStyle(doc.data.mlineStyles.get(e.style)) && !e.meta?.fmodelComponentMember) || ((e.meta?.fmodelComponent as {
    kind?: string;
  })?.kind === 'column')));
  if (raw.length > 100 || raw.reduce((n, e) => n + (e.type === 'mline' ? e.vertices.length : 1), 0) > 5000)
    limit();
  for (const entity of raw) {
    if (seen.has(entity.id))
      continue;
    if (entity.meta?.fmodelComponent) {
      const a = readComponentAssembly(doc, entity.id);
      if (a.kind !== 'column')
        continue;
      a.members.forEach(id => seen.add(id));
      members.push(...a.members);
      const e = doc.entity(a.roles.get('outline')!)!;
      let loop: Loop;
      if (e.type === 'circle') {
        columns.push({ kind: 'circle', center: e.center, radius: e.radius });
        loop = circleFillLoop(e.center, e.radius);
      }
      else if (e.type === 'lwpolyline' && e.closed) {
        columns.push({ kind: 'polygon', vertices: e.vertices });
        loop = polygonFillLoop(e.vertices);
      }
      else
        return limit();
      fills.push({ key: `column:${e.id}`, entity: e, loops: [loop], origin: e.type === 'circle' ? e.center : e.vertices[0], source: a.principalId });
    }
    else {
      const wall = readWallSource(doc, entity.id), ids = wall.assembly?.members ?? [wall.anchorId];
      ids.forEach(id => seen.add(id));
      members.push(...ids);
      for (const id of ids) {
        const e = doc.entity(id)!;
        if (e.type !== 'mline' || !(config.hidden[e.id] ?? e.visible))
          continue;
        fragments.push(e);
        sourceOf.set(e.id, wall.anchorId);
        const style = doc.data.mlineStyles.get(e.style)!;
        paths.push({ key: e.id, path: e, startCap: style.startCap === 'line', endCap: style.endCap === 'line' });
        fills.push({ key: `fill:${e.id}:0`, entity: e, loops: wallFillLoops(e), origin: e.vertices[0], source: wall.anchorId });
      }
    }
    if (paths.length + columns.length > 100 || paths.reduce((n, w) => n + w.path.vertices.length, 0) + columns.reduce((n, c) => n + (c.kind === 'circle' ? 1 : c.vertices.length), 0) > 5000)
      limit();
  }
  const hidden: Record<Id, boolean> = {};
  for (const f of fragments)
    hidden[f.id] = config.hidden[f.id] ?? f.visible;
  const outputs = new Map<string, NetworkCandidate>(), indices = new Map<Id, number>();
  if (paths.length)
    for (const segment of cleanWallFaces(paths, columns)) {
      const e = doc.entity(segment.sourceKey)!, index = indices.get(e.id) ?? 0;
      indices.set(e.id, index + 1);
      outputs.set(`face:${e.id}:${index}`, { source: sourceOf.get(e.id)!, entity: { ...properties(e), id: `preview-face-${outputs.size}`, order: baseline-1+outputs.size/10001, type: 'line', start: segment.start, end: segment.end } });
    }
  let work = 0, lines = 0, edges = 0;
  if (config.fill !== 'none')
    for (const f of fills) {
      if (outputs.size >= 10000)
        limit();
      if (config.fill === 'user') {
        const nx = -Math.sin(config.angle), ny = Math.cos(config.angle), spacing = config.spacing;
        if (spacing <= TOL.LINEAR || (f.origin.x + nx * spacing === f.origin.x && f.origin.y + ny * spacing === f.origin.y))
          limit();
        const polygons = hatchPolygons(f.loops, 'normal'), box = hatchBox(polygons), count = polygons.reduce((n, p) => n + p.length, 0);
        edges += count;
        const projections = [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]].map(([x, y]) => ((x - f.origin.x) * nx + (y - f.origin.y) * ny) / spacing);
        const n = Math.ceil(Math.max(...projections)) - Math.floor(Math.min(...projections)) + 1;
        lines += n;
        work += n * count;
        if (!Number.isSafeInteger(n) || lines > 12000 || edges > 10000 || work > 2000000)
          limit();
      }
      outputs.set(f.key, { source: f.source, entity: { ...properties(f.entity), id: `preview-fill-${outputs.size}`, order: baseline-2+outputs.size/10001, type: 'hatch', loops: f.loops, islandStyle: 'normal', origin: f.origin, pattern: { type: config.fill, name: config.fill === 'solid' ? 'SOLID' : '_USER', angle: config.angle, spacing: config.spacing, scale: 1, double: false } } });
    }
  return { outputs, hidden, members: [...new Set(members)] };
}
export function synchronizeWallNetwork(tx: Transaction, id: Id): void {
  const g = tx.doc.data.groups.get(id), a = g?.automation;
  if (!g || a?.kind !== 'wall-network')
    return;
  let candidate: ReturnType<typeof networkCandidates>;
  try {
    candidate = networkCandidates(tx.doc, a);
  }
  catch {
    markAutomationReview(tx, id, { es: 'Revisar encuentros y rellenos', en: 'Review junctions and fills' }, 100 / UNIT_TO_MM[tx.doc.settings.units]);
    return;
  }
  const outputs: Record<string, Id> = {}, snapshots: Record<Id, string> = {}, sourceForOutput: Record<Id, Id> = {};
  for (const [key, c] of candidate.outputs) {
    const oldId = a.outputs[key], old = oldId ? tx.doc.entity(oldId) : undefined;
    let e: Entity;
    const { id: _id, order: _order, ...shape } = c.entity;
    if (old && a.snapshots[old.id] === JSON.stringify(old) && old.type === shape.type) {
      e = { ...shape, id: old.id, order: old.order } as Entity;
      if (!same(e, old))
        tx.put('entities', e);
    }
    else
      e = tx.addEntity({...shape,order:c.entity.order} as never);
    outputs[key] = e.id;
    snapshots[e.id] = JSON.stringify(e);
    sourceForOutput[e.id] = c.source;
  }
  const retained = new Set(Object.values(outputs));
  for (const id of Object.values(a.outputs)) {
    const e = tx.doc.entity(id);
    if (e && !retained.has(id) && a.snapshots[id] === JSON.stringify(e))
      tx.removeEntity(id);
  }
  for (const [sourceId, visible] of Object.entries(a.hidden))
    if (!Object.hasOwn(candidate.hidden, sourceId)) {
      const e = tx.doc.entity(sourceId);
      if (e?.type === 'mline' && e.owner === a.owner && e.visible !== visible)
        tx.updateEntity(e.id, { visible });
    }
  for (const sourceId of Object.keys(candidate.hidden)) {
    const e = tx.doc.entity(sourceId)!;
    if (e.visible)
      tx.updateEntity(e.id, { visible: false });
  }
  const { status: _status, ...active } = a, next = { ...g, members: Object.values(outputs), automation: { ...active, hidden: candidate.hidden, outputs, snapshots, sourceForOutput } };
  if (!same(g, next))
    tx.put('groups', next);
}
export function disableWallNetwork(tx: Transaction, id: Id): number {
  const g = tx.doc.data.groups.get(id), a = g?.automation;
  if (!g || a?.kind !== 'wall-network')
    return 0;
  let preserved = 0;
  for (const id of Object.values(a.outputs)) {
    const e = tx.doc.entity(id);
    if (!e)
      continue;
    if (a.snapshots[id] === JSON.stringify(e))
      tx.removeEntity(id);
    else
      preserved++;
  }
  for (const [id, visible] of Object.entries(a.hidden)) {
    const e = tx.doc.entity(id);
    if (e?.type === 'mline' && e.owner === a.owner)
      tx.updateEntity(id, { visible });
  }
  tx.remove('groups', g.id);
  return preserved;
}
export function installWallNetwork(doc: CadDocument): () => void {
  return doc.addReactor((tx, changes) => {
    const owners = new Set<Id>();
    for (const c of changes) {
      if (c.coll === 'groups') {
        const before = (c.before as {
          automation?: WallNetworkAutomation;
        } | undefined)?.automation, after = (c.after as {
          automation?: WallNetworkAutomation;
        } | undefined)?.automation;
        if (before?.kind === 'wall-network' && (after?.kind !== 'wall-network' || after.owner !== before.owner))
          for (const [id, visible] of Object.entries(before.hidden)) {
            const e = doc.entity(id);
            if (e?.type === 'mline' && e.owner === before.owner && e.visible !== visible)
              tx.updateEntity(id, { visible });
          }
      }
      if (c.coll === 'mlineStyles' || c.coll === 'groups')
        for (const g of doc.data.groups.values())
          if (g.automation?.kind === 'wall-network')
            owners.add(g.automation.owner);
      if (c.coll === 'entities')
        for (const e of [c.before, c.after] as (Entity | undefined)[])
          if (e && (e.type === 'mline' || e.meta?.fmodelWallMember || e.meta?.fmodelComponentMember))
            owners.add(e.owner);
    }
    for (const g of doc.data.groups.values())
      if (g.automation?.kind === 'wall-network' && owners.has(g.automation.owner))
        synchronizeWallNetwork(tx, g.id);
  });
}
