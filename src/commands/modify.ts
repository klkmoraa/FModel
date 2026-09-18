import polygonClipping from 'polygon-clipping';
import { boxFromCorners } from '../geometry/bbox';
import type { Curve } from '../geometry/curves';
import { tessellateCurve } from '../geometry/curves';
import type { Mat2D } from '../geometry/matrix';
import { compose, reflection, rotation, scaling, translation } from '../geometry/matrix';
import { intersectCurves } from '../geometry/intersect';
import { curvesToVertices, pointInPolygon, pointsSignedArea, tessellatePolyline } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { angleOf, dist, sub } from '../geometry/vec';
import type { ArrayEntity, BlockRecord, Entity, GroupRecord, Id, Loop, LwPolylineEntity, Polyline2dEntity, RegionEntity } from '../document/types';
import { newId } from '../document/ids';
import { kindOf } from '../model/registry';
import { entityVisible } from '../model/visibility';
import { stretchEntity } from '../model/stretch';
import { breakEntity, extendEntity, joinEntities, lengthenEntity, reverseEntity, trimEntity } from '../modify/curveEdit';
import { cornerEntities, polylineAllCorners } from '../modify/filletEntities';
import { distanceToEntity, OFFSETTABLE, offsetEntity } from '../modify/offsetEntity';
import { planOverkill } from '../audit/overkill';
import { purge } from '../audit/purge';
import { selectByFence, selectInBox, selectInPolygon } from '../selection/pick';
import { K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';
import {
  type ClipboardPackage,
  type LegacyClipboardPackage,
  createClipboardPackage,
  parseClipboardPackage,
  pasteClipboardPackage,
} from '../io/clipboard';

function transformed(api: CommandApi, ids: Id[], m: Mat2D | null): Entity[] {
  if (!m) return [];
  const out: Entity[] = [];
  for (const id of ids) {
    const e = api.editor.doc.entity(id);
    if (!e) continue;
    const t = kindOf(e).transform(e, m, api.editor.ctx);
    if (t) out.push(t);
  }
  return out;
}

async function selectOrFail(api: CommandApi, types?: Entity['type'][]): Promise<Id[]> {
  const ids = await api.getSelection({ prompt: L('Designe objetos', 'Select objects'), types: types as never });
  if (!ids.length) throw new CommandError(L('No se designó ningún objeto.', 'No objects were selected.'));
  return ids;
}

let erasedStack: Entity[][] = [];

const ERASE: CommandDef = {
  name: 'ERASE',
  aliases: ['E', 'BORRA', 'DEL'],
  category: 'modify',
  label: L('Borrar', 'Erase'),
  description: L('Elimina objetos del dibujo (deshacible; OOPS restaura el último borrado).', 'Removes objects from the drawing (undoable; OOPS restores the last erase).'),
  icon: 'erase',
  async run(api) {
    const ids = await selectOrFail(api);
    const removed = ids.map((id) => api.editor.doc.entity(id)!).filter(Boolean);
    api.apply('ERASE', (tx) => ids.forEach((id) => tx.removeEntity(id)));
    erasedStack = [removed, ...erasedStack].slice(0, 5);
    api.info(L(`${ids.length} objeto(s) borrado(s). Se puede deshacer.`, `${ids.length} object(s) erased. This can be undone.`));
  },
};

const OOPS: CommandDef = {
  name: 'OOPS',
  aliases: ['UY'],
  category: 'modify',
  label: L('Recuperar borrado', 'Oops'),
  description: L('Restaura los últimos objetos borrados con ERASE sin deshacer otros cambios.', 'Restores the objects last erased with ERASE without undoing other changes.'),
  run(api) {
    const last = erasedStack.shift();
    if (!last?.length) throw new CommandError(L('No hay objetos borrados que recuperar.', 'No erased objects to restore.'));
    api.apply('OOPS', (tx) => last.forEach((e) => !api.editor.doc.entity(e.id) && tx.add('entities', e)));
  },
};

async function baseAndSecond(api: CommandApi, ids: Id[], build: (base: Vec2, p: Vec2) => Mat2D | null, prompts: { second: { es: string; en: string } }, copy = false): Promise<{ base: Vec2; p: Vec2 } | null> {
  const b = await api.getPoint({ prompt: L('Precise el punto base', 'Specify base point'), keywords: [K('Displacement', 'Desplazamiento', 'Displacement', ['d'])] });
  let base: Vec2;
  if (b.kind === 'keyword') {
    const d = await api.getPoint({ prompt: L('Precise el desplazamiento (x,y)', 'Specify displacement (x,y)'), defaultValue: { x: 0, y: 0 } });
    if (d.kind !== 'point') return null;
    return { base: { x: 0, y: 0 }, p: d.p };
  }
  if (b.kind !== 'point') return null;
  base = b.p;
  const second = await api.getPoint({ prompt: L(prompts.second.es, prompts.second.en), base, rubber: 'line', allowNone: true, preview: (p) => ({ entities: transformed(api, ids, build(base, p)) }) });
  if (second.kind === 'none') return copy ? null : { base: { x: 0, y: 0 }, p: base };
  if (second.kind !== 'point') return null;
  return { base, p: second.p };
}

const MOVE: CommandDef = {
  name: 'MOVE',
  aliases: ['M', 'DESPLAZA', 'DESPLAZAR'],
  category: 'modify',
  label: L('Desplazar', 'Move'),
  description: L('Mueve objetos por punto base y segundo punto, o por desplazamiento.', 'Moves objects by base and second point, or by displacement.'),
  icon: 'move',
  async run(api) {
    const ids = await selectOrFail(api);
    const r = await baseAndSecond(api, ids, (b, p) => translation(p.x - b.x, p.y - b.y), { second: { es: 'Precise el segundo punto o use el primero como desplazamiento', en: 'Specify second point or use first point as displacement' } });
    if (!r) return;
    api.editor.transformEntities(ids, translation(r.p.x - r.base.x, r.p.y - r.base.y), 'MOVE');
  },
};

const COPY: CommandDef = {
  name: 'COPY',
  aliases: ['CO', 'CP', 'COPIA'],
  category: 'modify',
  label: L('Copiar', 'Copy'),
  description: L('Copia objetos una o varias veces; Matriz crea copias alineadas.', 'Copies objects one or more times; Array creates aligned copies.'),
  icon: 'copy',
  async run(api) {
    const ids = await selectOrFail(api);
    const b = await api.getPoint({ prompt: L('Precise el punto base', 'Specify base point') });
    if (b.kind !== 'point') return;
    for (;;) {
      const r = await api.getPoint({
        prompt: L('Precise el segundo punto', 'Specify second point'),
        base: b.p,
        rubber: 'line',
        allowNone: true,
        keywords: [K('Array', 'Matriz', 'Array', ['m', 'a']), K('Undo', 'desHacer', 'Undo', ['h', 'u'])],
        preview: (p) => ({ entities: transformed(api, ids, translation(p.x - b.p.x, p.y - b.p.y)) }),
      });
      if (r.kind === 'none') return;
      if (r.kind === 'keyword') {
        if (r.key === 'Undo') {
          api.editor.doc.undo();
          continue;
        }
        const n = await api.getNumber({ prompt: L('Número de elementos de la matriz', 'Number of items to array'), integer: true, min: 2, max: 10000, defaultValue: 3 });
        if (n.kind !== 'value') continue;
        const second = await api.getPoint({ prompt: L('Precise el segundo punto (separación)', 'Specify second point (spacing)'), base: b.p, rubber: 'line' });
        if (second.kind !== 'point') continue;
        for (let i = 1; i < n.value; i++) api.editor.transformEntities(ids, translation((second.p.x - b.p.x) * i, (second.p.y - b.p.y) * i), 'COPY', true);
        return;
      }
      api.editor.transformEntities(ids, translation(r.p.x - b.p.x, r.p.y - b.p.y), 'COPY', true);
    }
  },
};

const ROTATE: CommandDef = {
  name: 'ROTATE',
  aliases: ['RO', 'GIRA', 'GIRAR'],
  category: 'modify',
  label: L('Girar', 'Rotate'),
  description: L('Gira objetos alrededor de un punto base, con opciones Copia y Referencia.', 'Rotates objects around a base point, with Copy and Reference options.'),
  icon: 'rotate',
  async run(api) {
    const ids = await selectOrFail(api);
    const b = await api.getPoint({ prompt: L('Precise el punto base', 'Specify base point') });
    if (b.kind !== 'point') return;
    let copy = false;
    let refAngle = 0;
    for (;;) {
      const r = await api.getAngle({
        prompt: L('Precise el ángulo de rotación', 'Specify rotation angle'),
        base: b.p,
        keywords: [K('Copy', 'Copiar', 'Copy', ['c']), K('Reference', 'Referencia', 'Reference', ['r'])],
        preview: (p) => ({ entities: transformed(api, ids, rotation(angleOf(sub(p, b.p)) - refAngle, b.p)) }),
      });
      if (r.kind === 'keyword') {
        if (r.key === 'Copy') copy = true;
        else {
          const a1 = await api.getAngle({ prompt: L('Precise el ángulo de referencia', 'Specify the reference angle'), defaultValue: 0 });
          if (a1.kind !== 'value') return;
          const a2 = await api.getAngle({ prompt: L('Precise el nuevo ángulo', 'Specify the new angle'), base: b.p });
          if (a2.kind !== 'value') return;
          api.editor.transformEntities(ids, rotation(a2.value - a1.value, b.p), 'ROTATE', copy);
          return;
        }
        continue;
      }
      if (r.kind !== 'value') return;
      api.editor.transformEntities(ids, rotation(r.value - refAngle, b.p), 'ROTATE', copy);
      return;
    }
  },
};

const SCALE: CommandDef = {
  name: 'SCALE',
  aliases: ['SC', 'ESCALA'],
  category: 'modify',
  label: L('Escala', 'Scale'),
  description: L('Escala objetos uniformemente respecto a un punto base, con Copia y Referencia.', 'Scales objects uniformly around a base point, with Copy and Reference.'),
  icon: 'scale',
  async run(api) {
    const ids = await selectOrFail(api);
    const b = await api.getPoint({ prompt: L('Precise el punto base', 'Specify base point') });
    if (b.kind !== 'point') return;
    let copy = false;
    for (;;) {
      const r = await api.getDistance({
        prompt: L('Precise el factor de escala', 'Specify scale factor'),
        base: b.p,
        keywords: [K('Copy', 'Copiar', 'Copy', ['c']), K('Reference', 'Referencia', 'Reference', ['r'])],
        preview: (p) => {
          const f = dist(p, b.p);
          return f > 1e-12 ? { entities: transformed(api, ids, scaling(f, f, b.p)) } : null;
        },
      });
      if (r.kind === 'keyword') {
        if (r.key === 'Copy') copy = true;
        else {
          const l1 = await api.getDistance({ prompt: L('Longitud de referencia', 'Reference length'), defaultValue: 1 });
          if (l1.kind !== 'value') return;
          const l2 = await api.getDistance({ prompt: L('Nueva longitud', 'New length') });
          if (l2.kind !== 'value') return;
          const f = l2.value / l1.value;
          api.editor.transformEntities(ids, scaling(f, f, b.p), 'SCALE', copy);
          return;
        }
        continue;
      }
      if (r.kind !== 'value') return;
      api.editor.transformEntities(ids, scaling(r.value, r.value, b.p), 'SCALE', copy);
      return;
    }
  },
};

const MIRROR: CommandDef = {
  name: 'MIRROR',
  aliases: ['MI', 'SIMETRIA', 'SIMETRÍA'],
  category: 'modify',
  label: L('Simetría', 'Mirror'),
  description: L('Crea una copia reflejada respecto a un eje; opcionalmente borra los originales. El texto se mantiene legible.', 'Creates a mirrored copy across an axis; optionally erases originals. Text stays readable.'),
  icon: 'mirror',
  async run(api) {
    const ids = await selectOrFail(api);
    const a = await api.getPoint({ prompt: L('Precise el primer punto de la línea de simetría', 'Specify first point of mirror line') });
    if (a.kind !== 'point') return;
    const b = await api.getPoint({ prompt: L('Precise el segundo punto de la línea de simetría', 'Specify second point of mirror line'), base: a.p, rubber: 'line', preview: (p) => (dist(p, a.p) > 1e-12 ? { entities: transformed(api, ids, reflection(a.p, p)) } : null) });
    if (b.kind !== 'point') return;
    if (dist(a.p, b.p) < 1e-12) throw new CommandError(L('La línea de simetría tiene longitud cero.', 'The mirror line has zero length.'));
    const erase = await api.getKeyword({ prompt: L('¿Borrar objetos de origen?', 'Erase source objects?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'No' });
    api.editor.transformEntities(ids, reflection(a.p, b.p), 'MIRROR', !(erase.kind === 'keyword' && erase.key === 'Yes'));
  },
};

const OFFSET: CommandDef = {
  name: 'OFFSET',
  aliases: ['O', 'EQ', 'DESFASE', 'EQUIDISTA'],
  category: 'modify',
  label: L('Desfase', 'Offset'),
  description: L('Crea curvas paralelas a distancia o a través de un punto; admite múltiple, borrar origen y capa.', 'Creates parallel curves at a distance or through a point; supports multiple, erase source and layer.'),
  icon: 'offset',
  async run(api) {
    const doc = api.editor.doc;
    let through = false;
    let erase = false;
    let toCurrentLayer = false;
    let distance = doc.settings.offsetDistance;
    for (;;) {
      const r = await api.getDistance({ prompt: L('Precise la distancia de desfase', 'Specify offset distance'), defaultValue: distance, keywords: [K('Through', 'Punto a través', 'Through', ['p', 't']), K('Erase', 'Borrar', 'Erase', ['b', 'e']), K('Layer', 'Capa', 'Layer', ['c', 'l'])] });
      if (r.kind === 'value') {
        distance = r.value;
        api.apply('OFFSETDIST', (tx) => tx.setSettings({ offsetDistance: distance }));
        break;
      }
      if (r.kind !== 'keyword') return;
      if (r.key === 'Through') {
        through = true;
        break;
      }
      if (r.key === 'Erase') {
        const k = await api.getKeyword({ prompt: L('¿Borrar objeto de origen tras desfase?', 'Erase source object after offsetting?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: erase ? 'Yes' : 'No' });
        erase = k.kind === 'keyword' && k.key === 'Yes';
      }
      if (r.key === 'Layer') {
        const k = await api.getKeyword({ prompt: L('Capa del desfase', 'Offset layer'), keywords: [K('Current', 'Actual', 'Current', ['a', 'c']), K('Source', 'Origen', 'Source', ['o', 's'])], defaultValue: toCurrentLayer ? 'Current' : 'Source' });
        toCurrentLayer = k.kind === 'keyword' && k.key === 'Current';
      }
    }
    for (;;) {
      const obj = await api.getEntity({ prompt: L('Designe objeto a desplazar (Intro para salir)', 'Select object to offset (Enter to exit)'), types: [...OFFSETTABLE], allowNone: true });
      if (obj.kind !== 'entity') return;
      const e = doc.entity(obj.id)!;
      let multiple = false;
      for (;;) {
        const side = await api.getPoint({
          prompt: L(through ? 'Precise punto a través' : 'Precise punto en el lado de desfase', through ? 'Specify through point' : 'Specify point on side to offset'),
          keywords: [K('Multiple', 'Múltiple', 'Multiple', ['m']), K('Exit', 'Salir', 'Exit', ['s', 'x'])],
          preview: (p) => {
            const d = through ? distanceToEntity(e, p, api.editor.ctx) : distance;
            return { entities: offsetEntity(e, d, p, api.editor.ctx) };
          },
        });
        if (side.kind === 'keyword') {
          if (side.key === 'Exit') return;
          multiple = true;
          continue;
        }
        if (side.kind !== 'point') break;
        const d = through ? distanceToEntity(e, side.p, api.editor.ctx) : distance;
        const out = offsetEntity(multiple ? e : doc.entity(obj.id) ?? e, d, side.p, api.editor.ctx);
        if (!out.length) {
          api.warn(L('El desfase colapsa la geometría (distancia mayor que el radio o la anchura).', 'The offset collapses the geometry (distance larger than radius or width).'));
          break;
        }
        api.apply('OFFSET', (tx) => {
          for (const o of out) {
            const { id: _i, order: _o, ...rest } = o;
            tx.addEntity({ ...rest, layer: toCurrentLayer ? doc.settings.currentLayer : rest.layer } as never);
          }
          if (erase) tx.removeEntity(e.id);
        });
        if (!multiple) break;
      }
    }
  },
};

async function cuttingEdges(api: CommandApi, kind: 'trim' | 'extend'): Promise<{ curves: Curve[]; all: boolean }> {
  const r = await api.getKeyword({
    prompt: L(kind === 'trim' ? 'Modo de recorte: Rápido usa todos los objetos visibles como aristas' : 'Modo de alargamiento: Rápido usa todos los objetos visibles como contornos', kind === 'trim' ? 'Trim mode: Quick uses all visible objects as cutting edges' : 'Extend mode: Quick uses all visible objects as boundaries'),
    keywords: [K('Quick', 'Rápido', 'Quick', ['r', 'q']), K('Standard', 'Estándar', 'Standard', ['e', 's'])],
    defaultValue: 'Quick',
  });
  if (r.kind === 'keyword' && r.key === 'Standard') {
    const ids = await api.getSelection({ prompt: L(kind === 'trim' ? 'Designe aristas de corte' : 'Designe objetos de contorno', kind === 'trim' ? 'Select cutting edges' : 'Select boundary edges'), allowLocked: true, usePreselection: false });
    return { curves: ids.flatMap((id) => { const e = api.editor.doc.entity(id); return e ? kindOf(e).curves(e, api.editor.ctx) : []; }), all: false };
  }
  return { curves: [], all: true };
}

function visibleCurves(api: CommandApi, exclude?: Id): Curve[] {
  const editor = api.editor;
  const out: Curve[] = [];
  for (const id of editor.index.query(editor.inputOwner, editor.view.visibleBox(200))) {
    if (id === exclude) continue;
    const e = editor.doc.entity(id);
    if (!e || !entityVisible(editor.doc, e, editor.visibility())) continue;
    out.push(...kindOf(e).curves(e, editor.ctx));
  }
  return out;
}

async function trimOrExtend(api: CommandApi, kind: 'trim' | 'extend') {
  const edges = await cuttingEdges(api, kind);
  const editor = api.editor;
  const doc = editor.doc;
  const apply = (id: Id, pick: Vec2, invert: boolean) => {
    const e = doc.entity(id);
    if (!e) return false;
    const bounds = edges.all ? visibleCurves(api, id) : edges.curves;
    const doTrim = (kind === 'trim') !== invert;
    if (doTrim) {
      const res = trimEntity(e, pick, bounds, editor.ctx);
      if (!res) return false;
      api.apply('TRIM', (tx) => {
        if (!res.replace.length) tx.removeEntity(id);
        res.replace.forEach((r, i) => {
          if (i === 0 && r.id === id) tx.put('entities', { ...r, order: e.order });
          else {
            const { id: _i, order: _o, ...rest } = r;
            if (i === 0) tx.removeEntity(id);
            tx.addEntity(rest as never);
          }
        });
      });
      return true;
    }
    const ext = extendEntity(e, pick, bounds, editor.ctx);
    if (!ext) return false;
    api.apply('EXTEND', (tx) => tx.put('entities', ext));
    return true;
  };
  for (;;) {
    const r = await api.getEntity({
      prompt: L(kind === 'trim' ? 'Designe el objeto a recortar (Mayús: alargar) o [Borde]' : 'Designe el objeto a alargar (Mayús: recortar) o [Borde]', kind === 'trim' ? 'Select object to trim (Shift: extend) or [Fence]' : 'Select object to extend (Shift: trim) or [Fence]'),
      types: ['line', 'arc', 'circle', 'ellipse', 'lwpolyline', 'spline', 'ray', 'xline'],
      allowNone: true,
      keywords: [K('Fence', 'Borde', 'Fence', ['b', 'f']), K('Undo', 'desHacer', 'Undo', ['h', 'u'])],
    });
    if (r.kind === 'none') return;
    if (r.kind === 'keyword') {
      if (r.key === 'Undo') {
        doc.undo();
        continue;
      }
      const pts: Vec2[] = [];
      for (;;) {
        const p = await api.getPoint({ prompt: L('Precise punto del borde (Intro termina)', 'Specify fence point (Enter ends)'), base: pts[pts.length - 1], rubber: pts.length ? 'line' : 'none', allowNone: true, noSnap: true });
        if (p.kind !== 'point') break;
        pts.push(p.p);
      }
      if (pts.length < 2) continue;
      const ids = selectByFence(editor.ctx, editor.index, editor.inputOwner, pts, { types: ['line', 'arc', 'circle', 'ellipse', 'lwpolyline', 'spline'] }, editor.visibility());
      let n = 0;
      for (const id of ids) {
        const e = doc.entity(id);
        if (!e) continue;
        // punto de designación: primera intersección del borde con el objeto
        const fenceCurves: Curve[] = pts.slice(1).map((p, i) => ({ kind: 'line', a: pts[i], b: p }));
        const hit = kindOf(e).curves(e, editor.ctx).flatMap((c) => fenceCurves.flatMap((f) => intersectCurves(c, f)))[0];
        if (hit && apply(id, hit.p, false)) n++;
      }
      api.info(L(`${n} objeto(s) procesado(s) por borde.`, `${n} object(s) processed by fence.`));
      continue;
    }
    if (!apply(r.id, r.p, editor.shiftDown)) api.warn(L(kind === 'trim' ? 'Nada que recortar en ese punto.' : 'No hay contorno alcanzable en esa dirección.', kind === 'trim' ? 'Nothing to trim at that point.' : 'No reachable boundary in that direction.'));
  }
}

const TRIM: CommandDef = {
  name: 'TRIM',
  aliases: ['TR', 'RECORTA', 'RECORTAR'],
  category: 'modify',
  label: L('Recortar', 'Trim'),
  description: L('Recorta objetos en sus intersecciones (modo rápido o aristas designadas, borde, Mayús alarga).', 'Trims objects at intersections (quick or selected edges, fence, Shift extends).'),
  icon: 'trim',
  run: (api) => trimOrExtend(api, 'trim'),
};

const EXTEND: CommandDef = {
  name: 'EXTEND',
  aliases: ['EX', 'ALARGA', 'ALARGAR'],
  category: 'modify',
  label: L('Alargar', 'Extend'),
  description: L('Alarga líneas, arcos, polilíneas abiertas y arcos elípticos hasta contornos.', 'Extends lines, arcs, open polylines and elliptical arcs to boundaries.'),
  icon: 'extend',
  run: (api) => trimOrExtend(api, 'extend'),
};

async function cornerCommand(api: CommandApi, kind: 'fillet' | 'chamfer') {
  const doc = api.editor.doc;
  const s = doc.settings;
  let radius = s.filletRadius;
  let [d1, d2] = s.chamferDistances;
  let angleMode: { d1: number; angle: number } | null = null;
  let trim = true;
  let multiple = false;
  const op = () => (kind === 'fillet' ? { kind: 'fillet' as const, radius } : angleMode ? { kind: 'chamfer-angle' as const, ...angleMode } : { kind: 'chamfer' as const, d1, d2 });
  do {
    let first: { id: Id; p: Vec2 } | null = null;
    while (!first) {
      const r = await api.getEntity({
        prompt: L(kind === 'fillet' ? `Designe el primer objeto (radio ${radius})` : `Designe la primera línea (dist. ${d1}, ${d2})`, kind === 'fillet' ? `Select first object (radius ${radius})` : `Select first line (dist. ${d1}, ${d2})`),
        types: ['line', 'arc', 'circle', 'lwpolyline'],
        keywords: [
          K('Polyline', 'Polilínea', 'Polyline', ['p']),
          ...(kind === 'fillet' ? [K('Radius', 'Radio', 'Radius', ['r'])] : [K('Distance', 'Distancia', 'Distance', ['d']), K('Angle', 'Ángulo', 'Angle', ['a'])]),
          K('Trim', 'Recortar', 'Trim', ['t']),
          K('Multiple', 'Múltiple', 'Multiple', ['m']),
        ],
      });
      if (r.kind === 'entity') first = { id: r.id, p: r.p };
      else if (r.kind === 'keyword') {
        if (r.key === 'Radius') {
          const v = await api.getDistance({ prompt: L('Radio de empalme', 'Fillet radius'), defaultValue: radius, allowZero: true });
          if (v.kind === 'value') {
            radius = v.value;
            api.apply('FILLETRAD', (tx) => tx.setSettings({ filletRadius: radius }));
          }
        } else if (r.key === 'Distance') {
          const a = await api.getDistance({ prompt: L('Primera distancia de chaflán', 'First chamfer distance'), defaultValue: d1, allowZero: true });
          const b = await api.getDistance({ prompt: L('Segunda distancia de chaflán', 'Second chamfer distance'), defaultValue: a.kind === 'value' ? a.value : d2, allowZero: true });
          if (a.kind === 'value' && b.kind === 'value') {
            [d1, d2] = [a.value, b.value];
            angleMode = null;
            api.apply('CHAMFERDIST', (tx) => tx.setSettings({ chamferDistances: [d1, d2] }));
          }
        } else if (r.key === 'Angle') {
          const a = await api.getDistance({ prompt: L('Longitud del chaflán en la primera línea', 'Chamfer length on first line'), defaultValue: d1 });
          const g = await api.getAngle({ prompt: L('Ángulo del chaflán desde la primera línea', 'Chamfer angle from first line'), defaultValue: Math.PI / 4 });
          if (a.kind === 'value' && g.kind === 'value') angleMode = { d1: a.value, angle: g.value };
        } else if (r.key === 'Trim') {
          const t = await api.getKeyword({ prompt: L('Modo de recorte', 'Trim mode'), keywords: [K('Trim', 'Recortar', 'Trim', ['r', 't']), K('NoTrim', 'No recortar', 'No trim', ['n'])], defaultValue: trim ? 'Trim' : 'NoTrim' });
          trim = !(t.kind === 'keyword' && t.key === 'NoTrim');
        } else if (r.key === 'Multiple') multiple = true;
        else if (r.key === 'Polyline') {
          const p = await api.getEntity({ prompt: L('Designe polilínea 2D', 'Select 2D polyline'), types: ['lwpolyline'] });
          if (p.kind !== 'entity') return;
          const e = doc.entity(p.id) as LwPolylineEntity;
          const res = polylineAllCorners(e, op());
          api.apply(kind.toUpperCase(), (tx) => tx.put('entities', res.result));
          api.info(L(`${res.done} vértice(s) ${kind === 'fillet' ? 'empalmado(s)' : 'achaflanado(s)'}; ${res.skipped} demasiado corto(s) u omitido(s).`, `${res.done} vertex(es) ${kind === 'fillet' ? 'filleted' : 'chamfered'}; ${res.skipped} too short or skipped.`));
        }
      } else return;
    }
    const second = await api.getEntity({ prompt: L('Designe el segundo objeto (Mayús: radio 0)', 'Select second object (Shift: zero radius)'), types: ['line', 'arc', 'circle', 'lwpolyline'] });
    if (second.kind !== 'entity') return;
    const e1 = doc.entity(first.id)!;
    const e2 = doc.entity(second.id)!;
    const useOp = api.editor.shiftDown ? (kind === 'fillet' ? { kind: 'fillet' as const, radius: 0 } : { kind: 'chamfer' as const, d1: 0, d2: 0 }) : op();
    const res = cornerEntities(e1, first.p, e2, second.p, useOp, trim, api.editor.ctx);
    if ('error' in res) {
      api.warn(res.error);
      continue;
    }
    api.apply(kind.toUpperCase(), (tx) => {
      for (const u of res.update) tx.put('entities', u);
      for (const a of res.add) {
        const { id: _i, order: _o, ...rest } = a;
        tx.addEntity(rest as never);
      }
    });
  } while (multiple);
}

const FILLET: CommandDef = {
  name: 'FILLET',
  aliases: ['F', 'EMPALME'],
  category: 'modify',
  label: L('Empalme', 'Fillet'),
  description: L('Redondea la esquina entre dos objetos o todos los vértices de una polilínea.', 'Rounds the corner between two objects or all vertices of a polyline.'),
  icon: 'fillet',
  run: (api) => cornerCommand(api, 'fillet'),
};

const CHAMFER: CommandDef = {
  name: 'CHAMFER',
  aliases: ['CHA', 'CHAFLAN', 'CHAFLÁN'],
  category: 'modify',
  label: L('Chaflán', 'Chamfer'),
  description: L('Bisela la esquina entre dos líneas por distancias o distancia y ángulo.', 'Bevels the corner between two lines by distances or distance and angle.'),
  icon: 'chamfer',
  run: (api) => cornerCommand(api, 'chamfer'),
};

const STRETCH: CommandDef = {
  name: 'STRETCH',
  aliases: ['S', 'ESTIRA', 'ESTIRAR'],
  category: 'modify',
  label: L('Estirar', 'Stretch'),
  description: L('Desplaza los puntos dentro de una ventana de captura; los objetos completamente dentro se mueven.', 'Moves points inside a crossing window; fully enclosed objects move.'),
  icon: 'stretch',
  async run(api) {
    const editor = api.editor;
    const a = await api.getPoint({ prompt: L('Designe la primera esquina de la captura (o [Polígono])', 'Specify first corner of crossing window (or [cPolygon])'), noSnap: true, keywords: [K('CPolygon', 'Polígono', 'CPolygon', ['p', 'cp'])] });
    let inside: (p: Vec2) => boolean;
    let ids: Id[];
    if (a.kind === 'keyword') {
      const pts: Vec2[] = [];
      for (;;) {
        const p = await api.getPoint({ prompt: L('Vértice del polígono (Intro termina)', 'Polygon vertex (Enter ends)'), base: pts[pts.length - 1], rubber: pts.length ? 'line' : 'none', allowNone: true, noSnap: true });
        if (p.kind !== 'point') break;
        pts.push(p.p);
      }
      if (pts.length < 3) return;
      inside = (p) => pointInPolygon(p, pts);
      ids = selectInPolygon(editor.ctx, editor.index, editor.inputOwner, pts, true, undefined, editor.visibility());
    } else {
      if (a.kind !== 'point') return;
      const b = await api.getPoint({ prompt: L('Precise la esquina opuesta', 'Specify opposite corner'), base: a.p, rubber: 'rect', noSnap: true });
      if (b.kind !== 'point') return;
      const box = boxFromCorners(a.p, b.p);
      inside = (p) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
      ids = selectInBox(editor.ctx, editor.index, editor.inputOwner, box, true, undefined, editor.visibility());
    }
    ids = ids.filter((id) => editor.isSelectable(id));
    if (!ids.length) throw new CommandError(L('La ventana de captura no contiene objetos.', 'The crossing window contains no objects.'));
    const stretched = (d: Vec2) => ids.map((id) => stretchEntity(editor.doc.entity(id)!, inside, d, editor.ctx)).filter(Boolean) as Entity[];
    const base = await api.getPoint({ prompt: L('Precise el punto base', 'Specify base point') });
    if (base.kind !== 'point') return;
    const second = await api.getPoint({ prompt: L('Precise el segundo punto', 'Specify second point'), base: base.p, rubber: 'line', preview: (p) => ({ entities: stretched(sub(p, base.p)) }) });
    if (second.kind !== 'point') return;
    const out = stretched(sub(second.p, base.p));
    api.apply('STRETCH', (tx) => out.forEach((e) => tx.put('entities', e)));
    api.info(L(`${out.length} objeto(s) estirado(s).`, `${out.length} object(s) stretched.`));
  },
};

// ------------------------------------------------------------------ ARRAY

function makeArraySource(api: CommandApi, ids: Id[], basePoint: Vec2): { blockId: Id; layer: Id } {
  const doc = api.editor.doc;
  const blockId = newId('arr');
  const first = doc.entity(ids[0])!;
  api.apply('ARRAY SOURCE', (tx) => {
    const rec: BlockRecord = { id: blockId, name: `*A${blockId}`, kind: 'array', basePoint, description: 'Objetos fuente de matriz asociativa', units: doc.settings.insUnits, explodable: true, scaleUniformly: false, annotative: false, revision: 1 };
    tx.add('blocks', rec);
    for (const id of ids) {
      const e = doc.entity(id)!;
      const { id: _i, order: _o, ...rest } = e;
      tx.addEntity({ ...rest, owner: blockId } as never);
      tx.removeEntity(id);
    }
  });
  return { blockId, layer: first.layer };
}

async function arrayCommand(api: CommandApi, kind: 'rect' | 'polar' | 'path') {
  const doc = api.editor.doc;
  const ids = await selectOrFail(api);
  const ext = ids.map((id) => kindOf(doc.entity(id)!).bbox(doc.entity(id)!, api.editor.ctx)).reduce((b, x) => ({ minX: Math.min(b.minX, x.minX), minY: Math.min(b.minY, x.minY), maxX: Math.max(b.maxX, x.maxX), maxY: Math.max(b.maxY, x.maxY) }));
  const basePoint = { x: (ext.minX + ext.maxX) / 2, y: (ext.minY + ext.maxY) / 2 };
  let params: ArrayEntity['params'];
  const w = Math.max(ext.maxX - ext.minX, 1e-6);
  const h = Math.max(ext.maxY - ext.minY, 1e-6);
  if (kind === 'rect') {
    const cols = await api.getNumber({ prompt: L('Número de columnas', 'Number of columns'), integer: true, min: 1, max: 5000, defaultValue: 4 });
    if (cols.kind !== 'value') return;
    const rows = await api.getNumber({ prompt: L('Número de filas', 'Number of rows'), integer: true, min: 1, max: 5000, defaultValue: 3 });
    if (rows.kind !== 'value') return;
    const cs = await api.getDistance({ prompt: L('Distancia entre columnas', 'Spacing between columns'), defaultValue: w * 1.5, allowNegative: true });
    if (cs.kind !== 'value') return;
    const rs = await api.getDistance({ prompt: L('Distancia entre filas', 'Spacing between rows'), defaultValue: h * 1.5, allowNegative: true });
    if (rs.kind !== 'value') return;
    params = { kind: 'rect', columns: cols.value, rows: rows.value, columnSpacing: cs.value, rowSpacing: rs.value, angle: 0 };
  } else if (kind === 'polar') {
    const c = await api.getPoint({ prompt: L('Precise el punto central de la matriz', 'Specify center point of array') });
    if (c.kind !== 'point') return;
    const n = await api.getNumber({ prompt: L('Número de elementos', 'Number of items'), integer: true, min: 2, max: 5000, defaultValue: 6 });
    if (n.kind !== 'value') return;
    const fill = await api.getAngle({ prompt: L('Ángulo a llenar (+ CCW, − CW)', 'Angle to fill (+ CCW, − CW)'), defaultValue: Math.PI * 2 });
    if (fill.kind !== 'value') return;
    const rot = await api.getKeyword({ prompt: L('¿Girar elementos?', 'Rotate items?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
    params = { kind: 'polar', center: c.p, count: n.value, fillAngle: fill.value === 0 ? Math.PI * 2 : fill.value, rotateItems: !(rot.kind === 'keyword' && rot.key === 'No'), rows: 1, rowSpacing: 0 };
  } else {
    const path = await api.getEntity({ prompt: L('Designe la trayectoria', 'Select path curve'), types: ['line', 'arc', 'lwpolyline', 'spline', 'circle', 'ellipse'] });
    if (path.kind !== 'entity') return;
    const pe = doc.entity(path.id)!;
    const curves = kindOf(pe).curves(pe, api.editor.ctx);
    const pts = curves.flatMap((c, i) => tessellateCurve(c, 1e-3).slice(i ? 1 : 0));
    const closed = pe.type === 'circle' || (pe.type === 'lwpolyline' && pe.closed);
    const vertices = pe.type === 'lwpolyline' ? pe.vertices.map((v) => ({ ...v })) : pts.map((p) => ({ ...p, bulge: 0 }));
    const method = await api.getKeyword({ prompt: L('Método', 'Method'), keywords: [K('Divide', 'Dividir', 'Divide', ['d']), K('Measure', 'Medir', 'Measure', ['m'])], defaultValue: 'Divide' });
    const n = await api.getNumber({ prompt: L('Número de elementos', 'Number of items'), integer: true, min: 1, max: 5000, defaultValue: 8 });
    if (n.kind !== 'value') return;
    let spacing = 0;
    if (method.kind === 'keyword' && method.key === 'Measure') {
      const s = await api.getDistance({ prompt: L('Distancia entre elementos', 'Distance between items'), defaultValue: w * 1.5 });
      if (s.kind !== 'value') return;
      spacing = s.value;
    }
    const align = await api.getKeyword({ prompt: L('¿Alinear elementos con la trayectoria?', 'Align items to path?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
    params = { kind: 'path', path: { vertices, closed }, count: n.value, spacing, alignItems: !(align.kind === 'keyword' && align.key === 'No'), method: method.kind === 'keyword' && method.key === 'Measure' ? 'measure' : 'divide' };
  }
  const assoc = await api.getKeyword({ prompt: L('¿Matriz asociativa (editable)?', 'Associative (editable) array?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
  const src = makeArraySource(api, ids, basePoint);
  const arr = api.apply('ARRAY', (tx) =>
    tx.addEntity<ArrayEntity>({
      ...(doc.entity(ids[0]) ?? {}),
      type: 'array',
      owner: api.editor.inputOwner,
      layer: src.layer,
      color: 'ByLayer',
      linetype: 'ByLayer',
      linetypeScale: 1,
      lineweight: -1,
      transparency: 'ByLayer',
      visible: true,
      sourceBlockId: src.blockId,
      basePoint,
      params,
    } as never),
  );
  if (assoc.kind === 'keyword' && assoc.key === 'No') {
    const parts = kindOf(arr).explode!(arr, api.editor.ctx) ?? [];
    api.apply('ARRAY EXPLODE', (tx) => {
      tx.removeEntity(arr.id);
      for (const p of parts) {
        const { id: _i, order: _o, ...rest } = p;
        tx.addEntity(rest as never);
      }
      for (const e of doc.entitiesOf(src.blockId)) tx.removeEntity(e.id);
      tx.remove('blocks', src.blockId);
    });
  }
}

const ARRAYRECT: CommandDef = { name: 'ARRAYRECT', aliases: ['AR', 'MATRIZRECT'], category: 'modify', label: L('Matriz rectangular', 'Rectangular array'), description: L('Distribuye copias en filas y columnas (asociativa, editable con grips y Propiedades).', 'Distributes copies in rows and columns (associative, editable with grips and Properties).'), icon: 'array', run: (api) => arrayCommand(api, 'rect') };
const ARRAYPOLAR: CommandDef = { name: 'ARRAYPOLAR', aliases: ['MATRIZPOLAR'], category: 'modify', label: L('Matriz polar', 'Polar array'), description: L('Distribuye copias alrededor de un centro.', 'Distributes copies around a center point.'), icon: 'polararray', run: (api) => arrayCommand(api, 'polar') };
const ARRAYPATH: CommandDef = { name: 'ARRAYPATH', aliases: ['MATRIZTRAY'], category: 'modify', label: L('Matriz por trayectoria', 'Path array'), description: L('Distribuye copias a lo largo de una curva, dividiendo o midiendo.', 'Distributes copies along a curve by dividing or measuring.'), icon: 'spline', run: (api) => arrayCommand(api, 'path') };
const ARRAY: CommandDef = {
  name: 'ARRAY',
  aliases: ['MATRIZ'],
  category: 'modify',
  label: L('Matriz', 'Array'),
  description: L('Crea una matriz rectangular, polar o por trayectoria.', 'Creates a rectangular, polar or path array.'),
  icon: 'array',
  async run(api) {
    const k = await api.getKeyword({ prompt: L('Tipo de matriz', 'Array type'), keywords: [K('Rectangular', 'Rectangular', 'Rectangular', ['r']), K('Polar', 'Polar', 'Polar', ['po']), K('Path', 'Trayectoria', 'Path', ['t', 'pa'])], defaultValue: 'Rectangular' });
    if (k.kind !== 'keyword') return;
    await arrayCommand(api, k.key === 'Polar' ? 'polar' : k.key === 'Path' ? 'path' : 'rect');
  },
};

// ------------------------------------------------------------------ JOIN / BREAK / EXPLODE / PEDIT / LENGTHEN / REVERSE

const JOIN: CommandDef = {
  name: 'JOIN',
  aliases: ['J', 'JUNTAR', 'UNIR'],
  category: 'modify',
  label: L('Juntar', 'Join'),
  description: L('Une líneas colineales, arcos concéntricos o cadenas contiguas en un solo objeto.', 'Joins collinear lines, concentric arcs or contiguous chains into one object.'),
  icon: 'join',
  async run(api) {
    const src = await api.getEntity({ prompt: L('Designe el objeto de origen', 'Select source object'), types: ['line', 'arc', 'lwpolyline', 'spline', 'ellipse'] });
    if (src.kind !== 'entity') return;
    const ids = await api.getSelection({ prompt: L('Designe objetos a unir', 'Select objects to join'), types: ['line', 'arc', 'lwpolyline', 'spline', 'ellipse'], usePreselection: false });
    const doc = api.editor.doc;
    const source = doc.entity(src.id)!;
    const others = ids.filter((id) => id !== src.id).map((id) => doc.entity(id)!).filter(Boolean);
    if (!others.length) throw new CommandError(L('Designa al menos otro objeto.', 'Select at least one other object.'));
    const res = joinEntities(source, others, api.editor.ctx, Math.max(1e-7, api.editor.ownerPerPixel * 0.01));
    if (!res || !res.entities.length) throw new CommandError(res?.message ?? L('Los objetos no se pueden unir.', 'The objects cannot be joined.'));
    api.apply('JOIN', (tx) => {
      const [first] = res.entities;
      if (first.type === source.type) tx.put('entities', { ...first, id: source.id, order: source.order });
      else {
        tx.removeEntity(source.id);
        const { id: _i, order: _o, ...rest } = first;
        tx.addEntity(rest as never);
      }
      for (const id of res.consumed) tx.removeEntity(id);
    });
    api.info(res.message);
  },
};

async function breakCommand(api: CommandApi, atPoint: boolean) {
  const r = await api.getEntity({ prompt: L('Designe el objeto', 'Select object'), types: ['line', 'arc', 'circle', 'ellipse', 'lwpolyline', 'spline', 'ray', 'xline'] });
  if (r.kind !== 'entity') return;
  const doc = api.editor.doc;
  const e = doc.entity(r.id)!;
  let p1 = r.p;
  let p2: Vec2;
  if (atPoint) {
    const p = await api.getPoint({ prompt: L('Precise el punto de ruptura', 'Specify break point') });
    if (p.kind !== 'point') return;
    p1 = p.p;
    p2 = p.p;
  } else {
    const s = await api.getPoint({ prompt: L('Precise el segundo punto de ruptura', 'Specify second break point'), keywords: [K('First', 'Primer punto', 'First point', ['p', 'f'])] });
    if (s.kind === 'keyword') {
      const a = await api.getPoint({ prompt: L('Precise el primer punto de ruptura', 'Specify first break point') });
      if (a.kind !== 'point') return;
      const b = await api.getPoint({ prompt: L('Precise el segundo punto de ruptura', 'Specify second break point'), base: a.p });
      if (b.kind !== 'point') return;
      p1 = a.p;
      p2 = b.p;
    } else if (s.kind === 'point') p2 = s.p;
    else return;
  }
  const res = breakEntity(e, p1, p2, api.editor.ctx);
  if (!res) throw new CommandError(L('Este tipo de objeto no se puede partir.', 'This object type cannot be broken.'));
  api.apply(atPoint ? 'BREAKATPOINT' : 'BREAK', (tx) => {
    tx.removeEntity(e.id);
    res.forEach((x, i) => {
      if (i === 0) tx.add('entities', { ...x, id: e.id, order: e.order });
      else {
        const { id: _i, order: _o, ...rest } = x;
        tx.addEntity(rest as never);
      }
    });
  });
}

const BREAK: CommandDef = { name: 'BREAK', aliases: ['BR', 'PARTE', 'PARTIR'], category: 'modify', label: L('Partir', 'Break'), description: L('Elimina el tramo entre dos puntos de un objeto.', 'Removes the portion of an object between two points.'), icon: 'break', run: (api) => breakCommand(api, false) };
const BREAKATPOINT: CommandDef = { name: 'BREAKATPOINT', aliases: ['BPT', 'PARTIRENPUNTO'], category: 'modify', label: L('Partir en punto', 'Break at point'), description: L('Divide un objeto en dos en un punto sin eliminar geometría.', 'Splits an object in two at a point without removing geometry.'), icon: 'break', run: (api) => breakCommand(api, true) };

const EXPLODE: CommandDef = {
  name: 'EXPLODE',
  aliases: ['X', 'DESCOMP', 'DESCOMPONER'],
  category: 'modify',
  label: L('Descomponer', 'Explode'),
  description: L('Descompone bloques, polilíneas, matrices, cotas, sombreados, tablas y textos múltiples en sus componentes.', 'Breaks blocks, polylines, arrays, dimensions, hatches, tables and mtext into components.'),
  icon: 'explode',
  async run(api) {
    const ids = await selectOrFail(api);
    let n = 0;
    let skipped = 0;
    const doc = api.editor.doc;
    api.apply('EXPLODE', (tx) => {
      for (const id of ids) {
        const e = doc.entity(id);
        if (!e) continue;
        const parts = kindOf(e).explode?.(e, api.editor.ctx);
        if (!parts) {
          skipped++;
          continue;
        }
        tx.removeEntity(id);
        for (const p of parts) {
          const { id: _i, order: _o, ...rest } = p;
          tx.addEntity(rest as never);
          n++;
        }
        if (e.type === 'array') {
          const others = [...doc.data.entities.values()].some((x) => x.type === 'array' && x.id !== e.id && x.sourceBlockId === e.sourceBlockId);
          if (!others) {
            for (const be of doc.entitiesOf(e.sourceBlockId)) tx.removeEntity(be.id);
            tx.remove('blocks', e.sourceBlockId);
          }
        }
      }
    });
    api.info(L(`${n} objeto(s) resultantes; ${skipped} no descomponible(s).`, `${n} resulting object(s); ${skipped} not explodable.`));
  },
};

const PEDIT: CommandDef = {
  name: 'PEDIT',
  aliases: ['PE', 'EDITPOL'],
  category: 'modify',
  label: L('Editar polilínea', 'Edit polyline'),
  description: L('Cierra/abre, junta, cambia grosor, suaviza (ajustar/spline), elimina curvas o invierte polilíneas.', 'Closes/opens, joins, sets width, smooths (fit/spline), decurves or reverses polylines.'),
  icon: 'pedit',
  async run(api) {
    const doc = api.editor.doc;
    const r = await api.getEntity({ prompt: L('Designe polilínea (o línea/arco para convertir)', 'Select polyline (or line/arc to convert)'), types: ['lwpolyline', 'polyline2d', 'line', 'arc'] });
    if (r.kind !== 'entity') return;
    let e = doc.entity(r.id)!;
    if (e.type === 'line' || e.type === 'arc') {
      const conv = await api.getKeyword({ prompt: L('El objeto no es una polilínea. ¿Convertirlo?', 'Object is not a polyline. Convert it?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
      if (!(conv.kind === 'keyword' && conv.key === 'Yes')) return;
      const joined = joinEntities(e, [], api.editor.ctx);
      const [c] = kindOf(e).curves(e, api.editor.ctx);
      const { vertices } = curvesToVertices([c]);
      const p: LwPolylineEntity = { ...e, type: 'lwpolyline', vertices, closed: false } as unknown as LwPolylineEntity;
      void joined;
      api.apply('PEDIT CONVERT', (tx) => tx.put('entities', p));
      e = p;
    }
    for (;;) {
      e = doc.entity(e.id)!;
      const isHeavy = e.type === 'polyline2d';
      const closed = (e as LwPolylineEntity).closed;
      const opt = await api.getKeyword({
        prompt: L('Indique una opción', 'Enter an option'),
        keywords: [
          closed ? K('Open', 'Abrir', 'Open', ['a', 'o']) : K('Close', 'Cerrar', 'Close', ['c']),
          K('Join', 'Juntar', 'Join', ['j']),
          K('Width', 'Grosor', 'Width', ['g', 'w']),
          K('Fit', 'Ajustar', 'Fit', ['f']),
          K('Spline', 'Spline', 'Spline', ['s']),
          K('Decurve', 'Eliminar curvas', 'Decurve', ['e', 'd']),
          K('Reverse', 'Invertir', 'Reverse', ['i', 'r']),
        ],
        allowNone: true,
      });
      if (opt.kind !== 'keyword') return;
      const cur = e as LwPolylineEntity | Polyline2dEntity;
      switch (opt.key) {
        case 'Close':
        case 'Open':
          api.apply('PEDIT', (tx) => tx.put('entities', { ...cur, closed: opt.key === 'Close' } as Entity));
          break;
        case 'Width': {
          const w = await api.getDistance({ prompt: L('Nuevo grosor para todos los segmentos', 'New width for all segments'), allowZero: true });
          if (w.kind === 'value' && cur.type === 'lwpolyline') api.apply('PEDIT', (tx) => tx.put('entities', { ...cur, constantWidth: w.value || undefined, vertices: cur.vertices.map((v) => ({ ...v, startWidth: undefined, endWidth: undefined })) }));
          break;
        }
        case 'Fit':
        case 'Spline': {
          const smoothing = opt.key === 'Fit' ? 'fit' : 'cubic';
          api.apply('PEDIT', (tx) => tx.put('entities', { ...cur, type: 'polyline2d', smoothing, vertices: cur.vertices.map((v) => ({ ...v, bulge: 0 })) } as unknown as Entity));
          break;
        }
        case 'Decurve':
          if (isHeavy) api.apply('PEDIT', (tx) => tx.put('entities', { ...cur, type: 'lwpolyline', vertices: cur.vertices.map((v) => ({ ...v, bulge: 0 })) } as unknown as Entity));
          else api.apply('PEDIT', (tx) => tx.put('entities', { ...cur, vertices: cur.vertices.map((v) => ({ ...v, bulge: 0 })), shape: undefined } as Entity));
          break;
        case 'Reverse': {
          const rv = reverseEntity(cur);
          if (rv) api.apply('PEDIT', (tx) => tx.put('entities', rv));
          break;
        }
        case 'Join': {
          const ids = await api.getSelection({ prompt: L('Designe objetos a unir', 'Select objects to join'), types: ['line', 'arc', 'lwpolyline'], usePreselection: false });
          const others = ids.filter((id) => id !== cur.id).map((id) => doc.entity(id)!).filter(Boolean);
          const res = joinEntities(cur, others, api.editor.ctx, Math.max(1e-7, api.editor.ownerPerPixel * 0.01));
          if (!res?.entities.length) {
            api.warn(res?.message ?? L('No se pudo unir.', 'Could not join.'));
            break;
          }
          api.apply('PEDIT JOIN', (tx) => {
            tx.put('entities', { ...res.entities[0], id: cur.id, order: cur.order });
            for (const id of res.consumed) tx.removeEntity(id);
          });
          api.info(res.message);
          break;
        }
      }
    }
  },
};

const LENGTHEN: CommandDef = {
  name: 'LENGTHEN',
  aliases: ['LEN', 'LONGITUD'],
  category: 'modify',
  label: L('Longitud', 'Lengthen'),
  description: L('Cambia la longitud de líneas, arcos y polilíneas abiertas por incremento, porcentaje, total o dinámicamente.', 'Changes the length of lines, arcs and open polylines by delta, percent, total or dynamically.'),
  icon: 'lengthen',
  async run(api) {
    const doc = api.editor.doc;
    const opt = await api.getKeyword({ prompt: L('Modo', 'Mode'), keywords: [K('DElta', 'Incremento', 'DElta', ['i', 'de']), K('Percent', 'Porcentaje', 'Percent', ['p']), K('Total', 'Total', 'Total', ['t']), K('DYnamic', 'Dinámica', 'DYnamic', ['d', 'dy'])], defaultValue: 'DElta' });
    if (opt.kind !== 'keyword') return;
    let value = 0;
    if (opt.key !== 'DYnamic') {
      const v = await api.getNumber({ prompt: L(opt.key === 'Percent' ? 'Porcentaje de longitud' : opt.key === 'Total' ? 'Longitud total' : 'Incremento de longitud (negativo acorta)', opt.key === 'Percent' ? 'Percent length' : opt.key === 'Total' ? 'Total length' : 'Delta length (negative shortens)') });
      if (v.kind !== 'value') return;
      value = v.value;
    }
    for (;;) {
      const r = await api.getEntity({ prompt: L('Designe el objeto a modificar (extremo más cercano)', 'Select object to change (nearest end)'), types: ['line', 'arc', 'lwpolyline'], allowNone: true });
      if (r.kind !== 'entity') return;
      const e = doc.entity(r.id)!;
      let next: Entity | null;
      if (opt.key === 'DYnamic') {
        const p = await api.getPoint({ prompt: L('Precise el nuevo extremo', 'Specify new end point'), preview: (q) => { const x = lengthenEntity(e, r.p, { kind: 'point', to: q }, api.editor.ctx); return x ? { entities: [x] } : null; } });
        if (p.kind !== 'point') continue;
        next = lengthenEntity(e, r.p, { kind: 'point', to: p.p }, api.editor.ctx);
      } else next = lengthenEntity(e, r.p, { kind: opt.key === 'Percent' ? 'percent' : opt.key === 'Total' ? 'total' : 'delta', value }, api.editor.ctx);
      if (!next) api.warn(L('La longitud resultante no es válida para este objeto.', 'The resulting length is not valid for this object.'));
      else api.apply('LENGTHEN', (tx) => tx.put('entities', next!));
    }
  },
};

const REVERSE: CommandDef = {
  name: 'REVERSE',
  aliases: ['INVERTIR'],
  category: 'modify',
  label: L('Invertir', 'Reverse'),
  description: L('Invierte el sentido de líneas, polilíneas y splines.', 'Reverses the direction of lines, polylines and splines.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe líneas, polilíneas o splines', 'Select lines, polylines or splines'), types: ['line', 'lwpolyline', 'polyline2d', 'spline'] });
    api.apply('REVERSE', (tx) => {
      for (const id of ids) {
        const r = reverseEntity(api.editor.doc.entity(id)!);
        if (r) tx.put('entities', r);
      }
    });
  },
};

const ALIGN: CommandDef = {
  name: 'ALIGN',
  aliases: ['AL', 'ALINEAR'],
  category: 'modify',
  label: L('Alinear', 'Align'),
  description: L('Mueve, gira y opcionalmente escala objetos para hacer coincidir dos pares de puntos.', 'Moves, rotates and optionally scales objects to match two point pairs.'),
  icon: 'align',
  async run(api) {
    const ids = await selectOrFail(api);
    const s1 = await api.getPoint({ prompt: L('Precise el primer punto de origen', 'Specify first source point') });
    if (s1.kind !== 'point') return;
    const d1 = await api.getPoint({ prompt: L('Precise el primer punto de destino', 'Specify first destination point'), base: s1.p, rubber: 'line' });
    if (d1.kind !== 'point') return;
    const s2 = await api.getPoint({ prompt: L('Precise el segundo punto de origen (Intro: solo mover)', 'Specify second source point (Enter: move only)'), allowNone: true });
    if (s2.kind === 'none') {
      api.editor.transformEntities(ids, translation(d1.p.x - s1.p.x, d1.p.y - s1.p.y), 'ALIGN');
      return;
    }
    if (s2.kind !== 'point') return;
    const d2 = await api.getPoint({ prompt: L('Precise el segundo punto de destino', 'Specify second destination point'), base: s2.p, rubber: 'line' });
    if (d2.kind !== 'point') return;
    const sc = await api.getKeyword({ prompt: L('¿Escalar objetos según los puntos de alineación?', 'Scale objects based on alignment points?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'No' });
    const ang = angleOf(sub(d2.p, d1.p)) - angleOf(sub(s2.p, s1.p));
    const f = sc.kind === 'keyword' && sc.key === 'Yes' ? dist(d1.p, d2.p) / (dist(s1.p, s2.p) || 1) : 1;
    const m = compose(translation(-s1.p.x, -s1.p.y), rotation(ang), scaling(f, f), translation(d1.p.x, d1.p.y));
    api.editor.transformEntities(ids, m, 'ALIGN');
  },
};

export interface MatchSettings {
  color: boolean;
  layer: boolean;
  linetype: boolean;
  ltscale: boolean;
  lineweight: boolean;
  transparency: boolean;
  text: boolean;
  dimension: boolean;
  hatch: boolean;
  polyline: boolean;
}

export const matchSettings: MatchSettings = { color: true, layer: true, linetype: true, ltscale: true, lineweight: true, transparency: true, text: true, dimension: true, hatch: true, polyline: true };

export function matchProperties(src: Entity, dst: Entity, s: MatchSettings = matchSettings): Entity {
  let out: Entity = { ...dst };
  if (s.color) out.color = src.color;
  if (s.layer) out.layer = src.layer;
  if (s.linetype) out.linetype = src.linetype;
  if (s.ltscale) out.linetypeScale = src.linetypeScale;
  if (s.lineweight) out.lineweight = src.lineweight;
  if (s.transparency) out.transparency = src.transparency;
  if (s.text && (src.type === 'text' || src.type === 'mtext') && (out.type === 'text' || out.type === 'mtext')) out = { ...out, style: src.style, height: src.height } as Entity;
  if (s.dimension && src.type === 'dimension' && out.type === 'dimension') out = { ...out, style: src.style, overrides: { ...src.overrides } };
  if (s.hatch && src.type === 'hatch' && out.type === 'hatch') out = { ...out, pattern: { ...src.pattern }, islandStyle: src.islandStyle, background: src.background };
  if (s.polyline && src.type === 'lwpolyline' && out.type === 'lwpolyline') out = { ...out, constantWidth: src.constantWidth };
  return out;
}

const MATCHPROP: CommandDef = {
  name: 'MATCHPROP',
  aliases: ['MA', 'IGUALARPROP', 'PAINTER'],
  category: 'modify',
  label: L('Igualar propiedades', 'Match properties'),
  description: L('Copia propiedades de un objeto de origen a otros (color, capa, tipo, texto, cota, sombreado…).', 'Copies properties from a source object to others (color, layer, linetype, text, dimension, hatch…).'),
  icon: 'matchprop',
  async run(api) {
    const src = await api.getEntity({ prompt: L('Designe el objeto de origen', 'Select source object'), allowLocked: true });
    if (src.kind !== 'entity') return;
    const source = api.editor.doc.entity(src.id)!;
    for (;;) {
      const r = await api.getSelection({ prompt: L('Designe objetos de destino o [Parámetros]', 'Select destination objects or [Settings]'), keywords: [K('Settings', 'Parámetros', 'Settings', ['p', 's'])], usePreselection: false });
      if (!r.length) return;
      api.apply('MATCHPROP', (tx) => {
        for (const id of r) {
          const d = api.editor.doc.entity(id);
          if (d && id !== source.id) tx.put('entities', matchProperties(source, d));
        }
      });
      api.info(L(`Propiedades aplicadas a ${r.length} objeto(s).`, `Properties applied to ${r.length} object(s).`));
    }
  },
};

const OVERKILL: CommandDef = {
  name: 'OVERKILL',
  aliases: ['DUPLICADOS', '-OVERKILL'],
  category: 'modify',
  label: L('Eliminar duplicados', 'Delete duplicates'),
  description: L('Elimina objetos duplicados, fusiona líneas colineales solapadas y borra longitudes cero.', 'Removes duplicate objects, merges overlapping collinear lines and deletes zero lengths.'),
  icon: 'overkill',
  async run(api) {
    const ids = await selectOrFail(api);
    const tol = await api.getDistance({ prompt: L('Tolerancia numérica', 'Numeric tolerance'), defaultValue: 1e-6 });
    const props = await api.getKeyword({ prompt: L('¿Ignorar diferencias de propiedades?', 'Ignore property differences?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'No' });
    const plan = planOverkill(ids.map((id) => api.editor.doc.entity(id)!).filter(Boolean), { tolerance: tol.kind === 'value' ? tol.value : 1e-6, compareProps: !(props.kind === 'keyword' && props.key === 'Yes'), mergeCollinear: true, removeZeroLength: true });
    api.apply('OVERKILL', (tx) => {
      for (const u of plan.update) tx.put('entities', u);
      for (const id of plan.remove) tx.removeEntity(id);
    });
    api.info(L(`${plan.duplicates} duplicado(s) eliminado(s), ${plan.merged} línea(s) fusionada(s), ${plan.zeroLength} de longitud cero.`, `${plan.duplicates} duplicate(s) deleted, ${plan.merged} line(s) merged, ${plan.zeroLength} zero-length.`));
  },
};

const PURGE: CommandDef = {
  name: 'PURGE',
  aliases: ['PU', 'LIMPIA', 'LIMPIAR'],
  category: 'manage',
  label: L('Limpiar', 'Purge'),
  description: L('Elimina capas, tipos de línea, estilos, bloques y grupos sin uso (deshacible).', 'Removes unused layers, linetypes, styles, blocks and groups (undoable).'),
  icon: 'purge',
  async run(api) {
    const k = await api.getKeyword({ prompt: L('Elementos a limpiar', 'Items to purge'), keywords: [K('All', 'Todo', 'All', ['t', 'a']), K('Layers', 'Capas', 'Layers', ['c', 'la']), K('Blocks', 'Bloques', 'Blocks', ['b']), K('Linetypes', 'Tipos de línea', 'Linetypes', ['ti', 'lt']), K('Styles', 'Estilos', 'Styles', ['e', 's'])], defaultValue: 'All' });
    if (k.kind !== 'keyword') return;
    const cats = k.key === 'All' ? 'all' : k.key === 'Layers' ? (['layers'] as const) : k.key === 'Blocks' ? (['blocks'] as const) : k.key === 'Linetypes' ? (['linetypes'] as const) : (['textStyles', 'dimStyles', 'mleaderStyles', 'tableStyles', 'mlineStyles'] as const);
    const removed = api.apply('PURGE', (tx) => purge(tx, api.editor.doc, cats === 'all' ? 'all' : [...cats]));
    api.info(L(`Limpiados ${removed.length}: ${removed.map((r) => r.name).slice(0, 12).join(', ')}${removed.length > 12 ? '…' : ''}`, `Purged ${removed.length}: ${removed.map((r) => r.name).slice(0, 12).join(', ')}${removed.length > 12 ? '…' : ''}`));
  },
};

const DRAWORDER: CommandDef = {
  name: 'DRAWORDER',
  aliases: ['DR', 'ORDENAR'],
  category: 'modify',
  label: L('Orden de dibujo', 'Draw order'),
  description: L('Envía objetos al frente, al fondo, o encima/debajo de otro objeto.', 'Brings objects to front, back, or above/under another object.'),
  icon: 'draworder',
  async run(api) {
    const ids = await selectOrFail(api);
    const k = await api.getKeyword({ prompt: L('Opción de orden', 'Order option'), keywords: [K('Front', 'Delante', 'Front', ['d', 'f']), K('Back', 'Detrás', 'Back', ['t', 'b']), K('Above', 'Sobre objetos', 'Above objects', ['s', 'a']), K('Under', 'Bajo objetos', 'Under objects', ['ba', 'u'])], defaultValue: 'Back' });
    if (k.kind !== 'keyword') return;
    const doc = api.editor.doc;
    const owner = api.editor.inputOwner;
    const orders = doc.entitiesOf(owner).map((e) => e.order);
    let target = 0;
    if (k.key === 'Front') target = Math.max(...orders) + 1;
    else if (k.key === 'Back') target = Math.min(...orders) - ids.length - 1;
    else {
      const ref = await api.getEntity({ prompt: L('Designe el objeto de referencia', 'Select reference object'), allowLocked: true });
      if (ref.kind !== 'entity') return;
      const ro = doc.entity(ref.id)!.order;
      const neighbors = orders.filter((o) => (k.key === 'Above' ? o > ro : o < ro)).sort((a, b) => a - b);
      const next = k.key === 'Above' ? (neighbors[0] ?? ro + 1) : (neighbors[neighbors.length - 1] ?? ro - 1);
      target = ro + (next - ro) / (ids.length + 1);
      api.apply('DRAWORDER', (tx) => ids.forEach((id, i) => tx.updateEntity(id, { order: ro + ((next - ro) * (i + 1)) / (ids.length + 1) })));
      return;
    }
    api.apply('DRAWORDER', (tx) => ids.forEach((id, i) => tx.updateEntity(id, { order: target + i })));
  },
};

const TEXTTOFRONT: CommandDef = {
  name: 'TEXTTOFRONT',
  aliases: ['TEXTOALFRENTE'],
  category: 'modify',
  label: L('Textos y cotas al frente', 'Text and dimensions to front'),
  description: L('Trae todos los textos, cotas y directrices al frente.', 'Brings all text, dimensions and leaders to front.'),
  run(api) {
    const doc = api.editor.doc;
    const owner = api.editor.inputOwner;
    const list = doc.entitiesOf(owner);
    let top = Math.max(0, ...list.map((e) => e.order));
    api.apply('TEXTTOFRONT', (tx) => {
      for (const e of list) if (['text', 'mtext', 'dimension', 'mleader', 'leader'].includes(e.type)) tx.updateEntity(e.id, { order: ++top });
    });
  },
};

const GROUP: CommandDef = {
  name: 'GROUP',
  aliases: ['G', 'AGRUPAR'],
  category: 'modify',
  label: L('Agrupar', 'Group'),
  description: L('Crea un grupo con nombre; designar un miembro selecciona el grupo completo.', 'Creates a named group; picking a member selects the whole group.'),
  icon: 'group',
  async run(api) {
    const ids = await selectOrFail(api);
    const name = await api.getString({ prompt: L('Nombre del grupo (Intro: anónimo)', 'Group name (Enter: unnamed)'), allowSpaces: true, allowNone: true });
    const doc = api.editor.doc;
    const g: GroupRecord = { id: newId('grp'), name: name.kind === 'string' && name.value ? name.value : `*A${doc.data.groups.size + 1}`, description: '', members: ids, selectable: true };
    if ([...doc.data.groups.values()].some((x) => x.name.toLowerCase() === g.name.toLowerCase())) throw new CommandError(L(`Ya existe el grupo «${g.name}».`, `Group "${g.name}" already exists.`));
    api.apply('GROUP', (tx) => tx.add('groups', g));
    api.info(L(`Grupo «${g.name}» creado con ${ids.length} objeto(s).`, `Group "${g.name}" created with ${ids.length} object(s).`));
  },
};

const UNGROUP: CommandDef = {
  name: 'UNGROUP',
  aliases: ['DESAGRUPAR'],
  category: 'modify',
  label: L('Desagrupar', 'Ungroup'),
  description: L('Elimina los grupos a los que pertenecen los objetos designados (los objetos se conservan).', 'Removes the groups the selected objects belong to (objects are kept).'),
  icon: 'group',
  async run(api) {
    const ids = await selectOrFail(api);
    const doc = api.editor.doc;
    const groups = [...doc.data.groups.values()].filter((g) => g.members.some((m) => ids.includes(m)));
    api.apply('UNGROUP', (tx) => groups.forEach((g) => tx.remove('groups', g.id)));
    api.info(L(`${groups.length} grupo(s) eliminado(s).`, `${groups.length} group(s) removed.`));
  },
};

// ------------------------------------------------------------------ portapapeles

let clipboard: ClipboardPackage | LegacyClipboardPackage | null = null;

async function clip(api: CommandApi, cut: boolean) {
  const ids = await selectOrFail(api);
  const pkg = createClipboardPackage(api.editor.doc, ids, api.editor.ctx);
  clipboard = pkg;
  try {
    await navigator.clipboard?.writeText(JSON.stringify(pkg));
  } catch {
    /* portapapeles del sistema no disponible */
  }
  if (cut) api.apply('CUTCLIP', (tx) => ids.forEach((id) => tx.removeEntity(id)));
}

const COPYCLIP: CommandDef = { name: 'COPYCLIP', aliases: ['COPIARPP'], category: 'utility', readOnly: true, label: L('Copiar al portapapeles', 'Copy to clipboard'), description: L('Copia objetos para pegarlos en este u otro dibujo.', 'Copies objects to paste in this or another drawing.'), run: (api) => clip(api, false) };
const CUTCLIP: CommandDef = { name: 'CUTCLIP', aliases: ['CORTARPP'], category: 'utility', label: L('Cortar', 'Cut'), description: L('Corta objetos al portapapeles.', 'Cuts objects to the clipboard.'), run: (api) => clip(api, true) };
const PASTECLIP: CommandDef = {
  name: 'PASTECLIP',
  aliases: ['PEGARPP'],
  category: 'utility',
  label: L('Pegar', 'Paste'),
  description: L('Pega objetos del portapapeles en un punto de inserción.', 'Pastes clipboard objects at an insertion point.'),
  async run(api) {
    let pkg: ClipboardPackage | LegacyClipboardPackage | null = null;
    try {
      const txt = await navigator.clipboard?.readText();
      if (txt) {
        pkg = parseClipboardPackage(txt);
      }
    } catch {
      /* sin contenido compatible o permiso denegado en el navegador */
    }
    if (!pkg) {
      pkg = clipboard;
    }
    if (!pkg) throw new CommandError(L('El portapapeles no contiene objetos de FModel.', 'The clipboard has no FModel objects.'));
    const d = pkg;
    const baseX = d.base?.x ?? 0;
    const baseY = d.base?.y ?? 0;
    const moved = (p: Vec2) => d.entities.map((e) => kindOf(e).transform(e, translation(p.x - baseX, p.y - baseY), api.editor.ctx)).filter(Boolean) as Entity[];
    const p = await api.getPoint({
      prompt: L('Precise el punto de inserción', 'Specify insertion point'),
      preview: (q) => ({ entities: moved(q).map((e) => ({ ...e, owner: api.editor.inputOwner })) }),
    });
    if (p.kind !== 'point') return;
    const doc = api.editor.doc;
    const res = api.apply('PASTECLIP', (tx) => pasteClipboardPackage(doc, d, api.editor.inputOwner, p.p, tx));
    api.editor.selection.set(res.insertedIds);
    if (res.warnings.length > 0) {
      api.warn(L(`Pegado con avisos: ${res.warnings.join('; ')}`, `Pasted with warnings: ${res.warnings.join('; ')}`));
    }
  },
};

// ------------------------------------------------------------------ regiones booleanas

type Ring = [number, number][];

function entityToPolygon(api: CommandApi, e: Entity): Ring[] | null {
  let loops: Loop[] = [];
  if (e.type === 'region') loops = e.loops;
  else if (e.type === 'lwpolyline' && e.closed) loops = [{ vertices: e.vertices, closed: true }];
  else if (e.type === 'circle') loops = [{ vertices: [{ x: e.center.x + e.radius, y: e.center.y, bulge: 1 }, { x: e.center.x - e.radius, y: e.center.y, bulge: 1 }], closed: true }];
  else return null;
  const tol = Math.max(1e-4, api.editor.ownerPerPixel * 0.05);
  return loops.map((l) => tessellatePolyline(l.vertices, true, tol).map((p) => [p.x, p.y] as [number, number]));
}

async function booleanCommand(api: CommandApi, op: 'union' | 'difference' | 'intersection') {
  const doc = api.editor.doc;
  const types: Entity['type'][] = ['region', 'lwpolyline', 'circle'];
  let baseIds: Id[];
  let otherIds: Id[];
  if (op === 'difference') {
    baseIds = await api.getSelection({ prompt: L('Designe regiones de las que restar', 'Select regions to subtract from'), types: types as never });
    otherIds = await api.getSelection({ prompt: L('Designe regiones a restar', 'Select regions to subtract'), types: types as never, usePreselection: false });
  } else {
    baseIds = await api.getSelection({ prompt: L('Designe regiones', 'Select regions'), types: types as never });
    otherIds = [];
  }
  const polys = (ids: Id[]) => ids.map((id) => entityToPolygon(api, doc.entity(id)!)).filter(Boolean) as Ring[][];
  const a = polys(baseIds);
  const b = polys(otherIds);
  if (!a.length) throw new CommandError(L('Se requieren regiones, círculos o polilíneas cerradas.', 'Regions, circles or closed polylines are required.'));
  let result;
  if (op === 'union') result = polygonClipping.union(a[0] as never, ...(a.slice(1) as never[]));
  else if (op === 'intersection') result = polygonClipping.intersection(a[0] as never, ...(a.slice(1) as never[]));
  else result = polygonClipping.difference(polygonClipping.union(a[0] as never, ...(a.slice(1) as never[])) as never, ...(b as never[]));
  const src = doc.entity(baseIds[0])!;
  api.apply(op.toUpperCase(), (tx) => {
    for (const id of [...baseIds, ...otherIds]) tx.removeEntity(id);
    for (const polygon of result) {
      const loops: Loop[] = polygon.map((ring) => {
        const pts = ring.slice(0, -1).map(([x, y]) => ({ x, y, bulge: 0 }));
        return { vertices: pointsSignedArea(pts) < 0 ? pts.reverse() : pts, closed: true as const };
      });
      tx.addEntity<RegionEntity>({ type: 'region', owner: src.owner, layer: src.layer, color: src.color, linetype: src.linetype, linetypeScale: 1, lineweight: src.lineweight, transparency: src.transparency, visible: true, loops } as never);
    }
  });
  api.info(L(`Operación booleana completada: ${result.length} región(es). Los arcos se aproximan con segmentos (tolerancia de pantalla).`, `Boolean operation completed: ${result.length} region(s). Arcs are approximated by segments (screen tolerance).`));
}

const UNION: CommandDef = { name: 'UNION', aliases: ['UNI', 'UNIONREG'], category: 'modify', label: L('Unión', 'Union'), description: L('Une regiones 2D.', 'Unites 2D regions.'), icon: 'region', run: (api) => booleanCommand(api, 'union') };
const SUBTRACT: CommandDef = { name: 'SUBTRACT', aliases: ['SU', 'DIFERENCIA'], category: 'modify', label: L('Diferencia', 'Subtract'), description: L('Resta regiones 2D.', 'Subtracts 2D regions.'), icon: 'region', run: (api) => booleanCommand(api, 'difference') };
const INTERSECT: CommandDef = { name: 'INTERSECT', aliases: ['IN', 'INTERSECCION'], category: 'modify', label: L('Intersección', 'Intersect'), description: L('Intersección de regiones 2D.', 'Intersects 2D regions.'), icon: 'region', run: (api) => booleanCommand(api, 'intersection') };

export const MODIFY_COMMANDS: CommandDef[] = [ERASE, OOPS, MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, TRIM, EXTEND, FILLET, CHAMFER, STRETCH, ARRAY, ARRAYRECT, ARRAYPOLAR, ARRAYPATH, JOIN, BREAK, BREAKATPOINT, EXPLODE, PEDIT, LENGTHEN, REVERSE, ALIGN, MATCHPROP, OVERKILL, PURGE, DRAWORDER, TEXTTOFRONT, GROUP, UNGROUP, COPYCLIP, CUTCLIP, PASTECLIP, UNION, SUBTRACT, INTERSECT];

