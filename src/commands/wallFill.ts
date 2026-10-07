import type { Entity, HatchEntity, Id, Loop, MLineEntity } from '../document/types';
import { circleFillLoop, polygonFillLoop, wallFillLoops, WallFillError } from '../geometry/wallFill';
import { WallUtilityError } from '../geometry/wallUtilities';
import { ComponentError } from '../geometry/architecture/schema';
import { TOL } from '../geometry/tolerance';
import { readComponentAssembly } from '../model/componentAssembly';
import { readWallSource, requireUncleanedWall, WallAssemblyError } from '../model/wallAssembly';
import { hatchBox, hatchPolygons } from '../model/hatchPatterns';
import { insertEntity, physicalSize, wallProperties } from './architectureHelpers';
import { K, L, fail } from './helpers';
import type { CommandApi, CommandDef } from './types';

const unavailable = L('Selecciona muros compatibles o columnas nativas; todos sus miembros deben estar en el espacio activo, visibles y desbloqueados.', 'Select compatible walls or native columns; all their members must be in the active space, visible and unlocked.');
const changed = L('El origen, sus propiedades o las unidades cambiaron; vuelve a seleccionar para rellenar.', 'The source, its properties or drawing units changed; select again to fill.');
const limit = L('Reduce el lote: máximo 100 orígenes, 5000 puntos de origen, 10000 vértices y 1000 rellenos.', 'Reduce the batch: at most 100 sources, 5000 source points, 10000 vertices and 1000 fills.');
const dense = L('Rayado demasiado denso o espaciado no representable; aumenta Espaciado o reduce el lote/contorno.', 'Hatching is too dense or spacing is not representable; increase Spacing or reduce the batch/contour.');
const keywords = [K('Solid', 'Sólido', 'Solid', ['solido', 'sólido']), K('Hatched', 'Rayado', 'Hatched', ['rayado']), K('Spacing', 'Espaciado', 'Spacing', ['espaciado']), K('Angle', 'Ángulo', 'Angle', ['angulo', 'ángulo'])];
interface Source { anchor: Entity; members: Id[]; loops: Loop[][]; origin: { x: number; y: number }; signature: string }
interface Options { type: 'solid' | 'user'; spacing: number; angle: number }
function domain<T>(fn: () => T): T {
  try { return fn(); }
  catch (error) {
    if (error instanceof WallFillError || error instanceof WallUtilityError || error instanceof WallAssemblyError) fail(error.messageI18n.es, error.messageI18n.en);
    if (error instanceof ComponentError) fail(error.l10n.es, error.l10n.en);
    throw error;
  }
}
function selectable(api: CommandApi, ids: readonly Id[]) {
  domain(() => { for (const id of ids) requireUncleanedWall(api.editor.doc, id); });
  for (const id of ids) if (api.editor.doc.entity(id)?.owner !== api.editor.inputOwner || !api.editor.isSelectable(id)) fail(unavailable.es, unavailable.en);
}
function clean(anchor: Entity) {
  const props = wallProperties(anchor);
  const meta = Object.fromEntries(Object.entries(props.meta ?? {}).filter(([key]) => !/^fmodel(?:Wall|Component)/.test(key)));
  return { ...props, meta: Object.keys(meta).length ? structuredClone(meta) : undefined };
}
function snapshot(api: CommandApi, members: Id[], group?: Id, style?: Id) {
  const doc = api.editor.doc;
  return JSON.stringify({ members: members.map(id => doc.entity(id)), layers: members.map(id => doc.data.layers.get(doc.entity(id)!.layer)),
    group: group && doc.data.groups.get(group), sourceGroups: [...doc.data.groups.values()].filter(g => g.members.some(id => members.includes(id))), style: style && doc.data.mlineStyles.get(style), units: doc.settings.units });
}
/** Cheap batch bounds before native assembly builders or material validation. */
function sourceBounds(api: CommandApi, ids: Id[]) {
  const origins = new Map<Id, number>();
  for (const id of ids) {
    const e = api.editor.doc.entity(id); if (!e) fail(unavailable.es, unavailable.en);
    const wallTag = e.meta?.fmodelWallMember as { anchorId?: Id } | undefined;
    const componentTag = e.meta?.fmodelComponentMember as { principal?: Id } | undefined;
    const anchorId = wallTag?.anchorId ?? componentTag?.principal ?? id;
    if (origins.has(anchorId)) continue;
    const anchor = api.editor.doc.entity(anchorId);
    const source = anchor?.meta?.fmodelWallAssembly as { source?: { vertices?: unknown[] } } | undefined;
    const count = source?.source?.vertices?.length ?? (anchor && 'vertices' in anchor ? anchor.vertices.length : 2);
    origins.set(anchorId, count);
    if (origins.size > 100 || [...origins.values()].reduce((sum, n) => sum + n, 0) > 5000) fail(limit.es, limit.en);
  }
}
function readSource(api: CommandApi, id: Id): Source {
  return domain(() => {
    const doc = api.editor.doc, selected = doc.entity(id)!;
    if (selected.meta?.fmodelComponentMember !== undefined || selected.meta?.fmodelComponent !== undefined) {
      const assembly = readComponentAssembly(doc, id); if (assembly.kind !== 'column') fail(unavailable.es, unavailable.en);
      selectable(api, assembly.members);
      const outline = doc.entity(assembly.roles.get('outline')!)!, anchor = doc.entity(assembly.principalId)!;
      if (outline.type === 'circle') return { anchor, members: assembly.members, loops: [[circleFillLoop(outline.center, outline.radius)]], origin: { ...outline.center }, signature: snapshot(api, assembly.members, assembly.groupId) };
      if (outline.type !== 'lwpolyline' || !outline.closed) fail(unavailable.es, unavailable.en);
      return { anchor, members: assembly.members, loops: [[polygonFillLoop(outline.vertices)]], origin: { x: outline.vertices[0].x, y: outline.vertices[0].y }, signature: snapshot(api, assembly.members, assembly.groupId) };
    }
    const wall = readWallSource(doc, id), members = wall.assembly?.members ?? [wall.anchorId];
    selectable(api, members);
    const fragments = wall.assembly ? members.map(mid => doc.entity(mid)!).filter((e): e is MLineEntity => e.type === 'mline') : [doc.entity(wall.anchorId) as MLineEntity];
    if (fragments.length > 1000) fail(limit.es, limit.en);
    return { anchor: doc.entity(wall.anchorId)!, members, loops: fragments.map(fragment => wallFillLoops(fragment)), origin: { ...wall.source.vertices[0] }, signature: snapshot(api, members, wall.assembly?.groupId, wall.source.style) };
  });
}
/** Match generateHatch's projected family range without generating any pattern lines. */
function preflight(entities: HatchEntity[]) {
  let totalLines = 0, totalEdges = 0, totalWork = 0;
  for (const entity of entities) {
    const spacing = entity.pattern.spacing, angle = entity.pattern.angle, origin = entity.origin;
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    if (!Number.isFinite(spacing) || spacing <= TOL.LINEAR || !Number.isFinite(angle) ||
      (origin.x + nx * spacing === origin.x && origin.y + ny * spacing === origin.y)) fail(dense.es, dense.en);
    const polygons = hatchPolygons(entity.loops, 'normal'), box = hatchBox(polygons), edges = polygons.reduce((sum, polygon) => sum + polygon.length, 0);
    totalEdges += edges;
    if (totalEdges > 10000) fail(dense.es, dense.en);
    const projections = [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]].map(([x, y]) => ((x - origin.x) * nx + (y - origin.y) * ny) / spacing);
    const lo = Math.floor(Math.min(...projections)), hi = Math.ceil(Math.max(...projections));
    if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || !Number.isSafeInteger(hi - lo + 1)) fail(dense.es, dense.en);
    const lines = hi - lo + 1;
    totalLines += lines; totalWork += lines * edges;
    if (totalLines > 12000 || !Number.isSafeInteger(totalWork) || totalWork > 2000000) fail(dense.es, dense.en);
  }
}
function candidates(sources: Source[], options: Options): HatchEntity[] {
  const entities = sources.flatMap(source => source.loops.map((loops, index): HatchEntity => ({ ...clean(source.anchor), type: 'hatch', id: `preview-wall-fill-${source.anchor.id}-${index}`, order: Number.MAX_SAFE_INTEGER,
    loops: structuredClone(loops), islandStyle: 'normal', origin: { ...source.origin }, pattern: { type: options.type, name: options.type === 'solid' ? 'SOLID' : '_USER', angle: options.angle, spacing: options.spacing, scale: 1, double: false } })));
  if (options.type === 'user') preflight(entities);
  return entities;
}

export const WALL_FILL: CommandDef = {
  name: 'WALLFILL', aliases: ['RELLENARMUROS'], category: 'draw', icon: 'hatch', label: L('Rellenar muros', 'Fill walls'),
  description: L('Rellena el material de muros y columnas nativas sin ocupar habitaciones ni huecos.', 'Fill native wall and column material while keeping rooms and openings empty.'),
  help: L('Preselecciona o selecciona muros compatibles/columnas nativas. Intro crea un lote de HATCH independientes; Esc descarta. Sólido por defecto; Rayado usa líneas a 45° y Espaciado 100 mm (0.1 m; sin unidad: 100). Espaciado escrito en unidades del dibujo y Ángulo en grados. Conserva el origen, sus grupos y huecos; no es asociativo. Tras editar el origen, deshaz/borra el relleno anterior y vuelve a rellenar.', 'Preselect or select compatible walls/native columns. Enter creates one batch of independent HATCH snapshots; Esc cancels. Solid by default; Hatched uses 45° lines and Spacing 100 mm (0.1 m; unitless: 100). Typed Spacing uses drawing units and Angle uses degrees. Source, groups and openings remain intact; fills are not associative. After editing the source, undo/delete the old fill and fill again.'),
  async run(api) {
    // getSelection filters preselection; validate the complete intent before that filter.
    selectable(api, api.editor.selection.list);
    const ids = await api.getSelection({ prompt: L('Selecciona muros o columnas nativas · Intro termina selección', 'Select native walls or columns · Enter finishes selection') });
    if (!ids.length) return;
    selectable(api, ids); sourceBounds(api, ids);
    const sources = new Map<Id, Source>();
    let vertices = 0, outputs = 0;
    for (const id of ids) {
      if ([...sources.values()].some(source => source.members.includes(id))) continue;
      const source = readSource(api, id); sources.set(source.anchor.id, source);
      vertices += source.loops.flat().reduce((sum, loop) => sum + loop.vertices.length, 0); outputs += source.loops.length;
      if (vertices > 10000 || outputs > 1000) fail(limit.es, limit.en);
    }
    const batch = [...sources.values()], options: Options = { type: 'solid', spacing: physicalSize(api, 100), angle: Math.PI / 4 };
    for (;;) {
      const entities = candidates(batch, options); api.setPreview({ entities });
      const response = await api.getKeyword({ prompt: L('Intro crea rellenos · Sólido/Rayado/Espaciado/Ángulo · Esc descarta', 'Enter creates fills · Solid/Hatched/Spacing/Angle · Esc cancels'), allowNone: true, keywords });
      if (response.kind === 'none') {
        for (const source of batch) if (readSource(api, source.anchor.id).signature !== source.signature) fail(changed.es, changed.en);
        api.apply('WALLFILL', tx => { for (const entity of entities) insertEntity(tx, entity); }); return;
      }
      if (response.key === 'Solid' || response.key === 'Hatched') options.type = response.key === 'Solid' ? 'solid' : 'user';
      else if (response.key === 'Spacing') {
        const r = await api.getDistance({ prompt: L('Espaciado positivo en unidades del dibujo', 'Positive spacing in drawing units'), defaultValue: options.spacing });
        if (r.kind === 'value') { if (!Number.isFinite(r.value) || r.value <= 0) fail(dense.es, dense.en); options.spacing = r.value; }
      } else if (response.key === 'Angle') {
        const r = await api.getAngle({ prompt: L('Ángulo del rayado en grados', 'Hatching angle in degrees'), defaultValue: options.angle });
        if (r.kind === 'value') { if (!Number.isFinite(r.value)) fail(dense.es, dense.en); options.angle = r.value; }
      }
    }
  },
};
