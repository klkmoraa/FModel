import { TAU } from '../../geometry/angle';
import { closestParam, curveLength, curveLengthProfile, curvePoint, curveTangent, isBounded, paramAtLength } from '../../geometry/curves';
import type { PolyVertex } from '../../geometry/polyline';
import type { Vec2 } from '../../geometry/vec';
import { add, angleOf, dist, isFiniteVec, len, normalize, perp, scale, sub } from '../../geometry/vec';
import { INPUT_LIMITS } from '../../io/limits';
import type {
  Entity,
  Id,
  InsertEntity,
  LwPolylineEntity,
  PointEntity,
  RayEntity,
  XLineEntity,
} from '../../document/types';
import { kindOf } from '../../model/registry';
import { add as addEntity, addMany, fail, K, L, make } from '../helpers';
import type { CommandApi, CommandDef } from '../types';
import { nearestCurve } from './shared';

// ============================================================================ POINT

export const POINT: CommandDef = {
  name: 'POINT',
  aliases: ['PO', 'PUNTO'],
  category: 'draw',
  label: L('Punto', 'Point'),
  description: L('Crea objetos punto (múltiples hasta Esc/Intro). El estilo se define con PTYPE.', 'Creates point objects (multiple until Esc/Enter). Style set with PTYPE.'),
  icon: 'point',
  async run(api) {
    for (;;) {
      const r = await api.getPoint({ prompt: L('Precise un punto', 'Specify a point'), allowNone: true });
      if (r.kind !== 'point') return;
      addEntity<PointEntity>(api, 'POINT', { type: 'point', position: r.p });
    }
  },
};

// ============================================================================ RAY

const directionBetween = (from: Vec2, to: Vec2): Vec2 => curveTangent({ kind: 'line', a: from, b: to }, 0);

export const RAY: CommandDef = {
  name: 'RAY',
  aliases: ['RAYO'],
  category: 'draw',
  label: L('Rayo', 'Ray'),
  description: L('Crea líneas semiinfinitas de construcción desde un punto inicial.', 'Creates semi-infinite construction lines from a start point.'),
  icon: 'ray',
  async run(api) {
    const s = await api.getPoint({ prompt: L('Precise el punto inicial', 'Specify start point') });
    if (s.kind !== 'point') return;
    for (;;) {
      const t = await api.getPoint({
        prompt: L('Precise el punto a través', 'Specify through point'),
        base: s.p,
        allowNone: true,
        preview: (p) => {
          const direction = directionBetween(s.p, p);
          return len(direction) ? { entities: [make<RayEntity>(api, { type: 'ray', origin: s.p, direction })] } : null;
        },
      });
      if (t.kind !== 'point') return;
      const direction = directionBetween(s.p, t.p);
      if (!len(direction)) continue;
      addEntity<RayEntity>(api, 'RAY', { type: 'ray', origin: s.p, direction });
    }
  },
};

// ============================================================================ XLINE

export const XLINE: CommandDef = {
  name: 'XLINE',
  aliases: ['XL', 'LINEAX'],
  category: 'draw',
  label: L('Línea auxiliar', 'Construction line'),
  description: L('Crea líneas infinitas de construcción: por puntos, horizontal, vertical, ángulo, bisectriz o desfase.', 'Creates infinite construction lines: through points, horizontal, vertical, angle, bisect or offset.'),
  icon: 'xline',
  async run(api) {
    const xl = (o: Vec2, d: Vec2) => make<XLineEntity>(api, { type: 'xline', origin: o, direction: normalize(d) });
    const addX = (o: Vec2, d: Vec2) => addEntity<XLineEntity>(api, 'XLINE', { type: 'xline', origin: o, direction: normalize(d), construction: false });
    const r = await api.getPoint({
      prompt: L('Precise un punto', 'Specify a point'),
      keywords: [K('Hor', 'Hor', 'Hor', ['h']), K('Ver', 'Ver', 'Ver', ['v']), K('Ang', 'Ang', 'Ang', ['a']), K('Bisect', 'Bisectriz', 'Bisect', ['b']), K('Offset', 'Desfase', 'Offset', ['d', 'o'])],
    });
    const repeatThrough = async (dir: Vec2) => {
      for (;;) {
        const t = await api.getPoint({ prompt: L('Precise el punto a través', 'Specify through point'), allowNone: true, preview: (p) => ({ entities: [xl(p, dir)] }) });
        if (t.kind !== 'point') return;
        addX(t.p, dir);
      }
    };
    if (r.kind === 'point') {
      for (;;) {
        const t = await api.getPoint({ prompt: L('Precise el punto a través', 'Specify through point'), base: r.p, allowNone: true, preview: (p) => {
          const direction = directionBetween(r.p, p);
          return len(direction) ? { entities: [xl(r.p, direction)] } : null;
        } });
        if (t.kind !== 'point') return;
        const direction = directionBetween(r.p, t.p);
        if (len(direction)) addX(r.p, direction);
      }
    }
    if (r.kind !== 'keyword') return;
    if (r.key === 'Hor') return repeatThrough({ x: 1, y: 0 });
    if (r.key === 'Ver') return repeatThrough({ x: 0, y: 1 });
    if (r.key === 'Ang') {
      const a = await api.getAngle({ prompt: L('Indique el ángulo de la línea auxiliar', 'Enter angle of xline') });
      if (a.kind !== 'value') return;
      return repeatThrough({ x: Math.cos(a.value), y: Math.sin(a.value) });
    }
    if (r.key === 'Bisect') {
      const v = await api.getPoint({ prompt: L('Precise el vértice del ángulo', 'Specify angle vertex point') });
      if (v.kind !== 'point') return;
      const s = await api.getPoint({ prompt: L('Precise el punto inicial del ángulo', 'Specify angle start point'), base: v.p, rubber: 'line' });
      if (s.kind !== 'point') return;
      const initial = directionBetween(v.p, s.p);
      if (!len(initial)) fail('El primer lado del ángulo debe tener longitud.', 'The first angle side must have length.');
      for (;;) {
        const e = await api.getPoint({ prompt: L('Precise el punto final del ángulo', 'Specify angle end point'), base: v.p, rubber: 'line', allowNone: true, preview: (p) => {
          const next = directionBetween(v.p, p);
          if (!len(next)) return null;
          const d = add(initial, next);
          return { entities: [xl(v.p, len(d) > 1e-12 ? d : perp(initial))] };
        } });
        if (e.kind !== 'point') return;
        const next = directionBetween(v.p, e.p);
        if (!len(next)) {
          api.warn(L('El segundo lado del ángulo debe tener longitud.', 'The second angle side must have length.'));
          continue;
        }
        const d = add(initial, next);
        addX(v.p, len(d) > 1e-12 ? d : perp(initial));
      }
    }
    // Desfase
    const dist0 = await api.getDistance({ prompt: L('Precise la distancia de desfase', 'Specify offset distance'), defaultValue: api.editor.doc.settings.offsetDistance });
    if (dist0.kind !== 'value') return;
    for (;;) {
      const obj = await api.getEntity({ prompt: L('Designe un objeto lineal', 'Select a line object'), types: ['line', 'xline', 'ray', 'lwpolyline'] });
      if (obj.kind !== 'entity') return;
      const c = nearestCurve(api, obj.id, obj.p);
      if (!c || (c.kind !== 'line' && c.kind !== 'ray' && c.kind !== 'xline')) {
        api.warn(L('Se requiere una curva recta.', 'A straight curve is required.'));
        continue;
      }
      const side = await api.getPoint({ prompt: L('Precise el lado de desfase', 'Specify side to offset') });
      if (side.kind !== 'point') return;
      const d = curveTangent(c, 0);
      if (!len(d)) {
        api.warn(L('El segmento no tiene dirección.', 'The segment has no direction.'));
        continue;
      }
      const n = perp(d);
      const foot = curvePoint(c, closestParam(c, side.p));
      const delta = sub(side.p, foot);
      const s = Math.sign((n.x ? delta.x * n.x : 0) + (n.y ? delta.y * n.y : 0)) || 1;
      addX(add(c.kind === 'line' ? c.a : c.o, scale(n, s * dist0.value)), d);
    }
  },
};

// ============================================================================ REVCLOUD

export function revcloudVertices(poly: Vec2[], closed: boolean, arcLen: number, ccwOutward: boolean): PolyVertex[] | null {
  const out: PolyVertex[] = [];
  const n = poly.length;
  if (n < 2 || !Number.isFinite(arcLen) || arcLen <= 0 || poly.some((p) => !isFiniteVec(p))) return null;
  const segs = closed ? n : n - 1;
  // orientación del contorno para abombar hacia fuera
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i].x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * poly[i].y;
  if (!Number.isFinite(area)) return null;
  const sign = (area >= 0 ? -1 : 1) * (ccwOutward ? 1 : -1);
  const bulge = Math.tan((sign * (Math.PI * 0.6)) / 4);
  for (let i = 0; i < segs; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const L0 = dist(a, b);
    const k = Math.max(1, Math.round(L0 / arcLen));
    if (!Number.isFinite(k) || out.length + k + (closed ? 0 : 1) > INPUT_LIMITS.maxPointsPerEntity) return null;
    for (let j = 0; j < k; j++) {
      const p = { x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k };
      if (!isFiniteVec(p)) return null;
      out.push({ x: p.x, y: p.y, bulge });
    }
  }
  if (!closed) out.push({ ...poly[n - 1], bulge: 0 });
  return out;
}

export const REVCLOUD: CommandDef = {
  name: 'REVCLOUD',
  aliases: ['NUBEREV', 'NR'],
  category: 'draw',
  label: L('Nube de revisión', 'Revision cloud'),
  description: L('Crea nubes de revisión rectangulares, poligonales o a partir de un objeto.', 'Creates rectangular, polygonal or object-based revision clouds.'),
  icon: 'revcloud',
  async run(api) {
    const view = api.editor.view;
    let arcLen = Math.max(1e-6, (Math.min(view.width, view.height) / view.scale) * 0.03);
    let mode: 'Rectangular' | 'Polygonal' = 'Rectangular';
    for (;;) {
      const r = await api.getPoint({
        prompt: L('Precise el primer punto', 'Specify first point'),
        keywords: [K('Arc length', 'Longitud de arco', 'Arc length', ['l', 'a']), K('Object', 'Objeto', 'Object', ['o']), K('Rectangular', 'Rectangular', 'Rectangular', ['r']), K('Polygonal', 'Poligonal', 'Polygonal', ['p'])],
      });
      if (r.kind === 'keyword') {
        if (r.key === 'Arc length') {
          const v = await api.getDistance({ prompt: L('Longitud de arco mínima', 'Minimum arc length'), defaultValue: arcLen });
          if (v.kind === 'value') arcLen = v.value;
        } else if (r.key === 'Rectangular' || r.key === 'Polygonal') mode = r.key;
        else {
          const obj = await api.getEntity({ prompt: L('Designe un objeto', 'Select object'), types: ['lwpolyline', 'circle', 'ellipse', 'spline', 'line', 'arc'] });
          if (obj.kind !== 'entity') return;
          const e = api.editor.doc.entity(obj.id)!;
          const curves = kindOf(e).curves(e, api.editor.ctx);
          const pts: Vec2[] = [];
          for (const c of curves) {
            const profile = c.kind === 'ellipse' || c.kind === 'poly' || c.kind === 'spline' ? curveLengthProfile(c) : undefined;
            const total = profile?.totalLength ?? curveLength(c);
            const k = Math.max(2, Math.round(total / arcLen));
            if (!Number.isFinite(k) || k > INPUT_LIMITS.maxPointsPerEntity - pts.length) {
              fail('La nube de revisión excede el límite de vértices.', 'The revision cloud exceeds the vertex limit.');
            }
            for (let j = 0; j < k; j++) {
              const p = curvePoint(c, paramAtLength(c, (total * j) / k, profile));
              if (!isFiniteVec(p)) fail('La nube de revisión contiene geometría no representable.', 'The revision cloud contains unrepresentable geometry.');
              pts.push(p);
            }
          }
          const closed = e.type === 'circle' || e.type === 'ellipse' || (e.type === 'lwpolyline' && e.closed);
          const vertices = revcloudVertices(pts, closed, 1e12, true);
          if (!vertices) fail('La nube de revisión excede el límite de vértices o contiene geometría no representable.', 'The revision cloud exceeds the vertex limit or contains unrepresentable geometry.');
          const { id: _i, order: _o, ...rest } = make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices, closed, layer: e.layer, color: e.color, shape: { kind: 'revcloud', arcLength: arcLen, style: 'normal' } });
          api.apply('REVCLOUD', (tx) => {
            tx.removeEntity(e.id);
            tx.addEntity(rest as never);
          });
          return;
        }
        continue;
      }
      if (r.kind !== 'point') return;
      const cloud = (pts: Vec2[], closed: boolean) => {
        const vertices = revcloudVertices(pts, closed, arcLen, true);
        return vertices ? make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices, closed }) : null;
      };
      const addCloud = (pts: Vec2[]) => {
        const entity = cloud(pts, true);
        if (!entity) fail('La nube de revisión excede el límite de vértices o contiene geometría no representable.', 'The revision cloud exceeds the vertex limit or contains unrepresentable geometry.');
        addEntity<LwPolylineEntity>(api, 'REVCLOUD', { ...entity, id: undefined, order: undefined, shape: { kind: 'revcloud', arcLength: arcLen, style: 'normal' } } as never);
      };
      if (mode === 'Rectangular') {
        const o = await api.getPoint({ prompt: L('Precise la esquina opuesta', 'Specify opposite corner'), base: r.p, rubber: 'rect', preview: (p) => {
          const entity = cloud([r.p, { x: p.x, y: r.p.y }, p, { x: r.p.x, y: p.y }], true);
          return entity ? { entities: [entity] } : null;
        } });
        if (o.kind !== 'point') return;
        const pts = [r.p, { x: o.p.x, y: r.p.y }, o.p, { x: r.p.x, y: o.p.y }];
        addCloud(pts);
        return;
      }
      const pts = [r.p];
      for (;;) {
        const n = await api.getPoint({ prompt: L('Precise el punto siguiente', 'Specify next point'), base: pts[pts.length - 1], rubber: 'line', allowNone: true, preview: (p) => {
          const entity = cloud([...pts, p], true);
          return entity ? { entities: [entity] } : null;
        } });
        if (n.kind !== 'point') break;
        pts.push(n.p);
      }
      if (pts.length < 3) fail('La nube poligonal necesita al menos tres puntos.', 'A polygonal cloud needs at least three points.');
      addCloud(pts);
      return;
    }
  },
};

// ============================================================================ DIVIDE / MEASURE

async function divideOrMeasure(api: CommandApi, measure: boolean) {
  const obj = await api.getEntity({ prompt: L(measure ? 'Designe el objeto a medir' : 'Designe el objeto a dividir', measure ? 'Select object to measure' : 'Select object to divide'), types: ['line', 'arc', 'circle', 'ellipse', 'lwpolyline', 'polyline2d', 'spline'] });
  if (obj.kind !== 'entity') return;
  const e = api.editor.doc.entity(obj.id)!;
  const curves = kindOf(e).curves(e, api.editor.ctx).filter(isBounded);
  const curveProfiles = curves.map((c) => c.kind === 'ellipse' || c.kind === 'poly' || c.kind === 'spline' ? curveLengthProfile(c) : null);
  const curveLengths = curves.map((c, i) => curveProfiles[i]?.totalLength ?? curveLength(c));
  const total = curveLengths.reduce((s, length) => s + length, 0);
  if (!Number.isFinite(total)) fail('La longitud del objeto no es representable.', 'The object length is not representable.');
  let blockId: Id | null = null;
  let align = false;
  const ask = async (): Promise<number | null> => {
    const r = measure
      ? await api.getDistance({ prompt: L('Precise la longitud del segmento', 'Specify length of segment'), keywords: [K('Block', 'Bloque', 'Block', ['b'])], base: null })
      : await api.getNumber({ prompt: L('Indique el número de segmentos', 'Enter the number of segments'), integer: true, min: 2, max: 32767, keywords: [K('Block', 'Bloque', 'Block', ['b'])] });
    if (r.kind === 'keyword') {
      const name = await api.getString({ prompt: L('Nombre del bloque a insertar', 'Enter name of block to insert') });
      if (name.kind !== 'string') return null;
      const blk = api.editor.doc.findByName('blocks', name.value);
      if (!blk) fail(`No existe el bloque «${name.value}».`, `Block "${name.value}" not found.`);
      blockId = blk.id;
      const al = await api.getKeyword({ prompt: L('¿Alinear el bloque con el objeto?', 'Align block with object?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
      align = al.kind === 'keyword' && al.key === 'Yes';
      return ask();
    }
    return r.kind === 'value' ? r.value : null;
  };
  const v = await ask();
  if (v === null) return;
  if (!Number.isFinite(v) || v <= 0) fail('La distancia o cantidad debe ser positiva.', 'The distance or count must be positive.');
  const closed = (e.type === 'circle' || (e.type === 'ellipse' && Math.abs(e.endParam - e.startParam) >= TAU - 1e-9) || ((e.type === 'lwpolyline' || e.type === 'polyline2d') && e.closed));
  const count = measure ? Math.max(0, Math.ceil((total - 1e-9) / v) - 1) : v - 1 + Number(closed);
  if (!Number.isSafeInteger(count) || count > INPUT_LIMITS.maxEntities - api.editor.doc.data.entities.size) {
    fail('La operación excede el límite de entidades del dibujo.', 'The operation exceeds the drawing entity limit.');
  }
  const distances: number[] = [];
  if (measure) {
    for (let i = 1; i <= count; i++) {
      const s = i * v;
      if (s >= total - 1e-9) break;
      distances.push(s);
    }
  } else {
    for (let i = 1; i < v; i++) distances.push((total * i) / v);
    if (closed) distances.unshift(0);
  }
  const entities: Entity[] = [];
  let curveIndex = 0;
  let curveStart = 0;
  for (const s of distances) {
    while (curveIndex < curves.length - 1 && curveStart + curveLengths[curveIndex] < s - 1e-12) {
      curveStart += curveLengths[curveIndex];
      curveIndex++;
    }
    const c = curves[curveIndex];
    if (!c || curveStart + curveLengths[curveIndex] < s - 1e-12) continue;
    const t = paramAtLength(c, s - curveStart, curveProfiles[curveIndex] ?? undefined);
    const p = curvePoint(c, t);
    if (!isFiniteVec(p)) fail('La operación produciría un punto no representable.', 'The operation would create an unrepresentable point.');
    if (blockId) {
      const rot = align ? angleOf(curveTangent(c, t)) : 0;
      entities.push(make<InsertEntity>(api, { type: 'insert', blockId, position: p, scale: { x: 1, y: 1 }, rotation: rot, attributes: [] }));
    } else entities.push(make<PointEntity>(api, { type: 'point', position: p }));
  }
  addMany(api, measure ? 'MEASURE' : 'DIVIDE', entities);
  api.info(L(`${entities.length} marcas creadas sobre una longitud de ${total.toFixed(4)}.`, `${entities.length} markers created along a length of ${total.toFixed(4)}.`));
}

export const DIVIDE: CommandDef = {
  name: 'DIVIDE',
  aliases: ['DIV', 'DIVIDIR', 'GRADUA'],
  category: 'draw',
  label: L('Dividir', 'Divide'),
  description: L('Coloca puntos o bloques a intervalos iguales a lo largo de un objeto.', 'Places points or blocks at equal intervals along an object.'),
  icon: 'divide',
  run: (api) => divideOrMeasure(api, false),
};

export const MEASURE: CommandDef = {
  name: 'MEASURE',
  aliases: ['ME', 'MEDIR'],
  category: 'draw',
  label: L('Medir (graduar)', 'Measure'),
  description: L('Coloca puntos o bloques a una distancia fija a lo largo de un objeto.', 'Places points or blocks at a fixed distance along an object.'),
  icon: 'measure',
  run: (api) => divideOrMeasure(api, true),
};

export const CONSTRUCTION_COMMANDS: CommandDef[] = [POINT, RAY, XLINE, REVCLOUD, DIVIDE, MEASURE];
