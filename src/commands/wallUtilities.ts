import type { Entity, Id, LwPolylineEntity, MLineEntity } from '../document/types';
import { linearTol } from '../geometry/tolerance';
import { parallelWall, wallCenterAxis, WallUtilityError } from '../geometry/wallUtilities';
import { cross, dist, dot, sub, type Vec2 } from '../geometry/vec';
import { readWallSource, WallAssemblyError } from '../model/wallAssembly';
import { insertEntity, physicalSize, wallProperties } from './architectureHelpers';
import { K, L, fail } from './helpers';
import { CommandError, type CommandApi, type CommandDef } from './types';

const unavailable = L('Selecciona un muro compatible: todos los miembros deben estar en el espacio activo, visibles y desbloqueados.', 'Select a compatible wall: all members must be in the active space, visible and unlocked.');
const changed = L('El muro, su grupo o sus propiedades cambiaron; vuelve a seleccionarlo.', 'The wall, group or its properties changed; select it again.');
const left = K('Left', 'Izquierda', 'Left', ['i', 'l', 'izquierda']);
const right = K('Right', 'Derecha', 'Right', ['d', 'r', 'derecha']);
const gap = K('Gap', 'Distancia', 'Gap', ['distancia', 'g']);
const thickness = K('Thickness', 'Espesor', 'Thickness', ['espesor', 't']);

function domain<T>(fn: () => T): T {
  try { return fn(); }
  catch (error) {
    if (error instanceof WallUtilityError || error instanceof WallAssemblyError) fail(error.messageI18n.es, error.messageI18n.en);
    throw error;
  }
}
function checked(api: CommandApi, id: Id) {
  return domain(() => {
    const wall = readWallSource(api.editor.doc, id);
    for (const member of wall.assembly?.members ?? [id]) {
      if (api.editor.doc.entity(member)?.owner !== api.editor.inputOwner || !api.editor.isSelectable(member)) fail(unavailable.es, unavailable.en);
    }
    return wall;
  });
}
function clean(entity: Entity) {
  const props = wallProperties(entity), meta = { ...props.meta };
  for (const key of Object.keys(meta)) if (/^fmodel(?:Wall|Component)/.test(key)) delete meta[key];
  return { ...props, meta: Object.keys(meta).length ? meta : undefined };
}
function signature(api: CommandApi, id: Id) {
  const wall = checked(api, id), doc = api.editor.doc, anchor = doc.entity(wall.anchorId)!;
  const members = (wall.assembly?.members ?? [wall.anchorId]).map(mid => doc.entity(mid));
  const layers = members.map(member => doc.data.layers.get(member!.layer));
  return JSON.stringify({ source: wall.source, anchorId: wall.anchorId, assembly: wall.assembly ? { ...wall.assembly, roles: [...wall.assembly.roles] } : null,
    members, layers, group: wall.assembly && doc.data.groups.get(wall.assembly.groupId), style: doc.data.mlineStyles.get(wall.source.style), anchor });
}
function select(api: CommandApi) {
  return api.getEntity({ prompt: L('Selecciona un muro o miembro asociado', 'Select a wall or associated member'), types: ['mline', 'line', 'arc'] });
}
function preview(api: CommandApi, entity: Entity) { api.setPreview({ entities: [entity] }); }
function revalidate(api: CommandApi, id: Id, original: string) {
  if (signature(api, id) !== original) fail(changed.es, changed.en);
}
function axisEntity(api: CommandApi, anchor: Entity, vertices: Vec2[], closed: boolean): LwPolylineEntity {
  return { ...clean(anchor), id: 'preview-wall-axis', order: Number.MAX_SAFE_INTEGER, type: 'lwpolyline', vertices: vertices.map(p => ({ ...p, bulge: 0, startWidth: 0, endWidth: 0 })), closed, constantWidth: 0 };
}
function wallEntity(anchor: Entity, path: MLineEntity): MLineEntity {
  return { ...clean(anchor), id: 'preview-parallel-wall', order: Number.MAX_SAFE_INTEGER, type: 'mline', vertices: path.vertices, closed: path.closed, scale: path.scale, justification: 'zero', style: path.style };
}
/** Side of nearest physical center segment; first segment wins ties. */
function sideAt(center: Vec2[], closed: boolean, point: Vec2): 1 | -1 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) fail('Indica un punto finito para el lado.', 'Choose a finite side point.');
  let nearest = Infinity, signed = 0;
  for (let i = 0; i < center.length - (closed ? 0 : 1); i++) {
    const a = center[i], delta = sub(center[(i + 1) % center.length], a), length = dist(a, center[(i + 1) % center.length]);
    const t = Math.max(0, Math.min(1, dot(sub(point, a), delta) / (length * length)));
    const foot = { x: a.x + delta.x * t, y: a.y + delta.y * t }, distance = dist(point, foot);
    if (distance < nearest) { nearest = distance; signed = cross(delta, sub(point, a)) / length; }
  }
  const scale = Math.max(...center.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))), nearest);
  if (Math.abs(signed) <= linearTol(scale)) fail('Indica un punto claramente a un lado del eje físico.', 'Choose a point clearly to one side of the physical axis.');
  return signed > 0 ? 1 : -1;
}

export const WALL_UTILITIES: CommandDef[] = [
  {
    name: 'WALLAXIS', aliases: ['EJEMURO'], category: 'draw', icon: 'wall', label: L('Eje de muro', 'Wall axis'),
    description: L('Extrae el eje físico completo de un muro.', 'Extract the complete physical wall center axis.'),
    help: L('Selecciona un muro o miembro de un grupo íntegro; Intro crea una polilínea independiente, Esc descarta. Los huecos del origen se conservan.', 'Select a wall or intact group member; Enter creates an independent polyline, Esc cancels. Source openings remain intact.'),
    async run(api) {
      const selected = await select(api); if (selected.kind !== 'entity') return;
      const wall = checked(api, selected.id), original = signature(api, selected.id), anchor = api.editor.doc.entity(wall.anchorId)!;
      const axis = domain(() => wallCenterAxis(wall.source));
      const entity = axisEntity(api, anchor, axis.vertices, axis.closed); preview(api, entity);
      const response = await api.getKeyword({ prompt: L('Intro crea el eje · Esc cancela', 'Enter creates axis · Esc cancels'), allowNone: true });
      if (response.kind !== 'none') return;
      revalidate(api, selected.id, original);
      api.apply('WALLAXIS', tx => insertEntity(tx, entity));
    },
  },
  {
    name: 'WALLOFFSET', aliases: ['PARALELAMURO'], category: 'draw', icon: 'wall', label: L('Muro paralelo', 'Parallel wall'),
    description: L('Crea un muro vacío a distancia libre de las caras.', 'Create an empty wall at a clear face-to-face distance.'),
    help: L('Selecciona el muro, indica distancia libre (1000 mm por defecto), lado y confirma con Intro. Distancia/Espesor/Izquierda/Derecha ajustan la vista previa. El nuevo muro no copia huecos ni asociación; Esc cancela.', 'Select wall, enter clear gap (1000 mm default), choose side and confirm with Enter. Gap/Thickness/Left/Right update preview. The new wall copies no openings or association; Esc cancels.'),
    async run(api) {
      const selected = await select(api); if (selected.kind !== 'entity') return;
      const wall = checked(api, selected.id), original = signature(api, selected.id), anchor = api.editor.doc.entity(wall.anchorId)!;
      const center = domain(() => wallCenterAxis(wall.source));
      let clearance = physicalSize(api, 1000), width = wall.source.scale, side: 1 | -1 | null = null;
      const build = (direction: 1 | -1) => domain(() => wallEntity(anchor, { ...wall.source, ...parallelWall(wall.source, clearance, direction, width) } as MLineEntity));
      const distance = await api.getDistance({ prompt: L('Distancia libre entre caras en unidades del dibujo', 'Clear face-to-face gap in drawing units'), defaultValue: clearance, allowZero: true });
      if (distance.kind !== 'value') return; clearance = distance.value;
      // Cursor movement changes only a binary side at this stage; validate each
      // candidate once, then reuse it until a gap/thickness prompt changes values.
      const sideCandidates = new Map<1 | -1, MLineEntity>();
      for (;;) {
        const r = await api.getPoint({ prompt: L('Punto a un lado del eje o Izquierda/Derecha', 'Point beside axis or Left/Right'), noSnap: true, noOrtho: true, keywords: [left, right],
          preview: point => {
            try {
              const direction = sideAt(center.vertices, center.closed, point);
              let candidate = sideCandidates.get(direction);
              if (!candidate) { candidate = build(direction); sideCandidates.set(direction, candidate); }
              return { entities: [candidate] };
            }
            catch (error) { if (error instanceof CommandError) return null; throw error; }
          } });
        if (r.kind === 'keyword') { side = r.key === 'Left' ? 1 : -1; break; }
        if (r.kind !== 'point') return;
        side = sideAt(center.vertices, center.closed, r.p); break;
      }
      for (;;) {
        const candidate = build(side); preview(api, candidate);
        const r = await api.getKeyword({ prompt: L('Intro crea muro vacío · Distancia/Espesor/Izquierda/Derecha', 'Enter creates empty wall · Gap/Thickness/Left/Right'), allowNone: true, keywords: [gap, thickness, left, right] });
        if (r.kind === 'none') { revalidate(api, selected.id, original); api.apply('WALLOFFSET', tx => insertEntity(tx, candidate)); return; }
        if (r.key === 'Left' || r.key === 'Right') side = r.key === 'Left' ? 1 : -1;
        else if (r.key === 'Gap') {
          const value = await api.getDistance({ prompt: L('Distancia libre en unidades del dibujo', 'Clear gap in drawing units'), defaultValue: clearance, allowZero: true });
          if (value.kind === 'value') clearance = value.value;
        } else if (r.key === 'Thickness') {
          const value = await api.getDistance({ prompt: L('Espesor en unidades del dibujo', 'Thickness in drawing units'), defaultValue: width });
          if (value.kind === 'value') width = value.value;
        }
      }
    },
  },
];
