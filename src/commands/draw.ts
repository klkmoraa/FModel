import { TAU } from '../geometry/angle';
import { detectBoundary } from '../geometry/boundary';
import {
  arcFrom3Points,
  arcStartCenterAngle,
  arcStartCenterEnd,
  arcStartEndDirection,
  arcStartEndRadius,
  circleFrom3Points,
  circlesTTR,
  regularPolygon,
} from '../geometry/construct';
import type { ArcCurve, Curve } from '../geometry/curves';
import { curveDerivative, curveLength, curvePoint, curveTangent, isBounded, paramAtLength } from '../geometry/curves';
import type { PolyVertex } from '../geometry/polyline';
import { polylineSegments, sweepToBulge } from '../geometry/polyline';
import { splineFromControl, splineThroughPoints } from '../geometry/spline';
import type { Vec2 } from '../geometry/vec';
import { add, angleOf, dist, len, mid, normalize, perp, polar, scale, sub } from '../geometry/vec';
import type {
  ArcEntity,
  CircleEntity,
  EllipseEntity,
  Entity,
  HatchEntity,
  Id,
  InsertEntity,
  LineEntity,
  Loop,
  LwPolylineEntity,
  MLeaderEntity,
  MLineEntity,
  MTextAttachment,
  MTextEntity,
  PointEntity,
  RayEntity,
  RegionEntity,
  SplineEntity,
  TableEntity,
  TextEntity,
  WipeoutEntity,
  XLineEntity,
} from '../document/types';
import { kindOf } from '../model/registry';
import { entityVisible } from '../model/visibility';
import { HATCH_PATTERNS } from '../model/hatchPatterns';
import { add as addEntity, addMany, CLOSE_KW, fail, K, L, make, UNDO_KW } from './helpers';
import type { CommandApi, CommandDef } from './types';

const tolOf = (api: CommandApi) => api.editor.ownerPerPixel * 0.5;

function arcEntityFrom(api: CommandApi, a: ArcCurve): ArcEntity {
  const start = a.sweep >= 0 ? a.a0 : a.a0 + a.sweep;
  return make<ArcEntity>(api, { type: 'arc', center: a.c, radius: a.r, startAngle: start, endAngle: start + Math.abs(a.sweep) });
}

// ============================================================================ LINE

const LINE: CommandDef = {
  name: 'LINE',
  aliases: ['L', 'LINEA', 'LÍNEA'],
  category: 'draw',
  label: L('Línea', 'Line'),
  description: L('Crea segmentos de línea rectos encadenados.', 'Creates chained straight line segments.'),
  help: L('Designa puntos con el ratón, escribe coordenadas (x,y · @dx,dy · @d<ángulo) o una distancia en la dirección del cursor. Opciones: Deshacer, Cerrar. Intro termina.', 'Pick points, type coordinates (x,y · @dx,dy · @d<angle) or a distance along the cursor direction. Options: Undo, Close. Enter ends.'),
  icon: 'line',
  async run(api) {
    let first = await api.getPoint({ prompt: L('Precise el primer punto', 'Specify first point'), allowNone: true });
    if (first.kind === 'none') {
      if (!api.lastPoint) return;
      first = { kind: 'point', p: api.lastPoint };
    }
    if (first.kind !== 'point') return;
    const chainStart = first.p;
    const points: Vec2[] = [first.p];
    const created: Id[] = [];
    for (;;) {
      const start = points[points.length - 1];
      const keywords = [UNDO_KW, ...(created.length >= 2 ? [CLOSE_KW] : [])];
      const r = await api.getPoint({
        prompt: L('Precise el punto siguiente', 'Specify next point'),
        base: start,
        rubber: 'line',
        keywords,
        allowNone: true,
        preview: (p) => ({ entities: [make<LineEntity>(api, { type: 'line', start, end: p })] }),
      });
      if (r.kind === 'none') break;
      if (r.kind === 'keyword') {
        if (r.key === 'Undo') {
          const last = created.pop();
          if (last) {
            api.apply('LINE', (tx) => tx.removeEntity(last));
            points.pop();
          } else api.warn(L('No hay segmentos para deshacer.', 'No segments to undo.'));
          continue;
        }
        if (r.key === 'Close') {
          addEntity<LineEntity>(api, 'LINE', { type: 'line', start, end: chainStart });
          api.lastPoint = chainStart;
          break;
        }
        continue;
      }
      if (dist(start, r.p) <= 1e-12) {
        api.warn(L('Punto coincidente: se ignoró un segmento de longitud cero.', 'Coincident point: a zero-length segment was ignored.'));
        continue;
      }
      created.push(addEntity<LineEntity>(api, 'LINE', { type: 'line', start, end: r.p }).id);
      points.push(r.p);
    }
  },
};

// ============================================================================ PLINE

const PLINE: CommandDef = {
  name: 'PLINE',
  aliases: ['PL', 'POL', 'POLILINEA'],
  category: 'draw',
  label: L('Polilínea', 'Polyline'),
  description: L('Crea una polilínea 2D de segmentos rectos y de arco con grosor opcional.', 'Creates a 2D polyline of line and arc segments with optional width.'),
  help: L('Opciones: Arco (tangente continua), Línea, Cerrar, Grosor, Mitad del grosor, Longitud, Deshacer. En modo arco: Centro, Dirección, Radio, Segundo punto, Ángulo.', 'Options: Arc (tangent continuous), Line, Close, Width, Halfwidth, Length, Undo. Arc mode: CEnter, Direction, Radius, Second pt, Angle.'),
  icon: 'pline',
  async run(api) {
    const first = await api.getPoint({ prompt: L('Precise el punto inicial', 'Specify start point') });
    if (first.kind !== 'point') return;
    const verts: PolyVertex[] = [{ x: first.p.x, y: first.p.y, bulge: 0 }];
    let arcMode = false;
    let startWidth = 0;
    let endWidth = 0;
    let entityId: Id | null = null;
    const tangentAtEnd = (): Vec2 | null => {
      if (verts.length < 2) return null;
      const segs = polylineSegments(verts, false);
      const last = segs[segs.length - 1];
      return normalize(curveDerivative(last, 1));
    };
    const sync = (closed = false) => {
      const props = { vertices: verts.map((v) => ({ ...v })), closed, constantWidth: startWidth === endWidth && startWidth > 0 ? startWidth : undefined };
      if (verts.length < 2) {
        if (entityId) {
          const id = entityId;
          api.apply('PLINE', (tx) => tx.removeEntity(id));
          entityId = null;
        }
        return;
      }
      if (!entityId) entityId = addEntity<LwPolylineEntity>(api, 'PLINE', { type: 'lwpolyline', ...props }).id;
      else {
        const id = entityId;
        api.apply('PLINE', (tx) => tx.updateEntity<LwPolylineEntity>(id, props));
      }
    };
    const previewWith = (extra: PolyVertex[]) => make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: [...verts.slice(-1).map((v) => ({ ...v })), ...extra], closed: false });
    for (;;) {
      const last = verts[verts.length - 1];
      const lp = { x: last.x, y: last.y };
      if (!arcMode) {
        const r = await api.getPoint({
          prompt: L('Precise el punto siguiente', 'Specify next point'),
          base: lp,
          rubber: 'line',
          allowNone: true,
          keywords: [K('Arc', 'Arco', 'Arc', ['a']), ...(verts.length > 2 ? [CLOSE_KW] : []), K('Halfwidth', 'Mitad grosor', 'Halfwidth', ['m', 'h']), K('Length', 'lonGitud', 'Length', ['g', 'l']), UNDO_KW, K('Width', 'Grosor', 'Width', ['g', 'w'])],
          preview: (p) => ({ entities: [previewWith([{ x: p.x, y: p.y, bulge: 0 }])] }),
        });
        if (r.kind === 'none') break;
        if (r.kind === 'keyword') {
          if (r.key === 'Arc') arcMode = true;
          else if (r.key === 'Close') {
            verts[verts.length - 1].bulge = 0;
            sync(true);
            return;
          } else if (r.key === 'Undo') {
            if (verts.length > 1) verts.pop();
            if (verts.length) verts[verts.length - 1].bulge = 0;
            sync();
          } else if (r.key === 'Width' || r.key === 'Halfwidth') {
            const k = r.key === 'Halfwidth' ? 2 : 1;
            const s = await api.getDistance({ prompt: L('Grosor inicial', 'Starting width'), base: lp, defaultValue: startWidth / k, allowZero: true });
            if (s.kind === 'value') startWidth = s.value * k;
            const e = await api.getDistance({ prompt: L('Grosor final', 'Ending width'), base: lp, defaultValue: startWidth / k, allowZero: true });
            if (e.kind === 'value') endWidth = e.value * k;
            verts[verts.length - 1].startWidth = startWidth;
            verts[verts.length - 1].endWidth = endWidth;
          } else if (r.key === 'Length') {
            const d = await api.getDistance({ prompt: L('Longitud de la línea', 'Length of line'), base: lp });
            if (d.kind !== 'value') continue;
            const t = tangentAtEnd() ?? { x: 1, y: 0 };
            const p = add(lp, scale(t, d.value));
            verts.push({ x: p.x, y: p.y, bulge: 0, startWidth: endWidth, endWidth });
            sync();
          }
          continue;
        }
        verts[verts.length - 1].bulge = 0;
        verts[verts.length - 1].startWidth = startWidth;
        verts[verts.length - 1].endWidth = endWidth;
        verts.push({ x: r.p.x, y: r.p.y, bulge: 0 });
        startWidth = endWidth;
        sync();
        continue;
      }
      // ------------------------- modo arco
      const dir = tangentAtEnd() ?? { x: 1, y: 0 };
      const r = await api.getPoint({
        prompt: L('Precise el punto final del arco', 'Specify endpoint of arc'),
        base: lp,
        allowNone: true,
        keywords: [K('Angle', 'Ángulo', 'Angle', ['a']), K('CEnter', 'Centro', 'CEnter', ['ce', 'c']), ...(verts.length > 2 ? [CLOSE_KW] : []), K('Direction', 'Dirección', 'Direction', ['d']), K('Line', 'Línea', 'Line', ['l']), K('Radius', 'Radio', 'Radius', ['r']), K('Second', 'Segundo pto', 'Second pt', ['s']), UNDO_KW],
        preview: (p) => {
          const arc = arcStartEndDirection(lp, p, dir);
          if (!arc) return null;
          return { entities: [make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: [{ ...last, bulge: sweepToBulge(arc.sweep) }, { x: p.x, y: p.y, bulge: 0 }], closed: false })] };
        },
      });
      if (r.kind === 'none') break;
      const pushArc = (arc: ArcCurve | null) => {
        if (!arc || Math.abs(arc.sweep) < 1e-9) {
          api.warn(L('No se pudo construir el arco con esos datos.', 'Could not build an arc from that input.'));
          return;
        }
        const end = curvePoint(arc, 1);
        verts[verts.length - 1].bulge = sweepToBulge(arc.sweep);
        verts.push({ x: end.x, y: end.y, bulge: 0 });
        sync();
      };
      if (r.kind === 'keyword') {
        switch (r.key) {
          case 'Line':
            arcMode = false;
            break;
          case 'Close': {
            const arc = arcStartEndDirection(lp, verts[0], dir);
            if (arc) verts[verts.length - 1].bulge = sweepToBulge(arc.sweep);
            sync(true);
            return;
          }
          case 'Undo':
            if (verts.length > 1) verts.pop();
            verts[verts.length - 1].bulge = 0;
            sync();
            break;
          case 'CEnter': {
            const c = await api.getPoint({ prompt: L('Precise el centro del arco', 'Specify center point of arc'), base: lp, rubber: 'line' });
            if (c.kind !== 'point') break;
            const e = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify endpoint of arc'), base: c.p, rubber: 'line', preview: (p) => ({ entities: [arcEntityFrom(api, arcStartCenterEnd(lp, c.p, p))] }) });
            if (e.kind === 'point') pushArc(arcStartCenterEnd(lp, c.p, e.p));
            break;
          }
          case 'Radius': {
            const rad = await api.getDistance({ prompt: L('Precise el radio del arco', 'Specify radius of arc'), base: lp });
            if (rad.kind !== 'value') break;
            const e = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify endpoint of arc'), base: lp, rubber: 'line' });
            if (e.kind === 'point') pushArc(arcStartEndRadius(lp, e.p, rad.value));
            break;
          }
          case 'Second': {
            const s = await api.getPoint({ prompt: L('Precise el segundo punto del arco', 'Specify second point on arc'), base: lp, rubber: 'line' });
            if (s.kind !== 'point') break;
            const e = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify end point of arc'), base: s.p, preview: (p) => {
              const a = arcFrom3Points(lp, s.p, p);
              return a ? { entities: [arcEntityFrom(api, a)] } : null;
            } });
            if (e.kind === 'point') pushArc(arcFrom3Points(lp, s.p, e.p));
            break;
          }
          case 'Direction': {
            const d = await api.getPoint({ prompt: L('Precise la dirección tangente', 'Specify tangent direction'), base: lp, rubber: 'line' });
            if (d.kind !== 'point') break;
            const e = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify endpoint of arc'), base: lp, preview: (p) => {
              const a = arcStartEndDirection(lp, p, sub(d.p, lp));
              return a ? { entities: [arcEntityFrom(api, a)] } : null;
            } });
            if (e.kind === 'point') pushArc(arcStartEndDirection(lp, e.p, sub(d.p, lp)));
            break;
          }
          case 'Angle': {
            const a = await api.getAngle({ prompt: L('Precise el ángulo incluido', 'Specify included angle') });
            if (a.kind !== 'value') break;
            const e = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify endpoint of arc'), base: lp, rubber: 'line' });
            if (e.kind !== 'point') break;
            const chord = dist(lp, e.p);
            const inc = a.value;
            const r2 = chord / (2 * Math.sin(Math.abs(inc) / 2));
            const m = mid(lp, e.p);
            const h = Math.sqrt(Math.max(0, r2 * r2 - (chord / 2) ** 2));
            const n = perp(normalize(sub(e.p, lp)));
            const center = add(m, scale(n, (inc > 0 ? 1 : -1) * (Math.abs(inc) > Math.PI ? -h : h)));
            pushArc(arcStartCenterAngle(lp, center, inc));
            break;
          }
        }
        continue;
      }
      pushArc(arcStartEndDirection(lp, r.p, dir));
    }
  },
};

// ============================================================================ CIRCLE

const CIRCLE: CommandDef = {
  name: 'CIRCLE',
  aliases: ['C', 'CI', 'CIRCULO', 'CÍRCULO'],
  category: 'draw',
  label: L('Círculo', 'Circle'),
  description: L('Crea un círculo por centro y radio/diámetro, 2 puntos, 3 puntos o tangente-tangente-radio.', 'Creates a circle by center and radius/diameter, 2 points, 3 points or tangent-tangent-radius.'),
  icon: 'circle',
  async run(api) {
    const r = await api.getPoint({ prompt: L('Precise el centro del círculo', 'Specify center point for circle'), keywords: [K('3P', '3P', '3P'), K('2P', '2P', '2P'), K('Ttr', 'Ttr (tangente tangente radio)', 'Ttr (tan tan radius)', ['t'])] });
    const circle = (center: Vec2, radius: number) => make<CircleEntity>(api, { type: 'circle', center, radius });
    if (r.kind === 'point') {
      const center = r.p;
      const rad = await api.getDistance({
        prompt: L('Precise el radio del círculo', 'Specify radius of circle'),
        base: center,
        keywords: [K('Diameter', 'Diámetro', 'Diameter', ['d'])],
        defaultValue: api.editor.doc.settings.filletRadius || undefined,
        preview: (p) => ({ entities: [circle(center, Math.max(1e-9, dist(center, p)))] }),
      });
      let radius: number | null = null;
      if (rad.kind === 'value') radius = rad.value;
      else if (rad.kind === 'keyword') {
        const d = await api.getDistance({ prompt: L('Precise el diámetro del círculo', 'Specify diameter of circle'), base: center, preview: (p) => ({ entities: [circle(center, Math.max(1e-9, dist(center, p) / 2))] }) });
        if (d.kind === 'value') radius = d.value / 2;
      }
      if (radius && radius > 0) addEntity<CircleEntity>(api, 'CIRCLE', { type: 'circle', center, radius });
      return;
    }
    if (r.kind !== 'keyword') return;
    if (r.key === '2P') {
      const a = await api.getPoint({ prompt: L('Precise el primer extremo del diámetro', 'Specify first end point of diameter') });
      if (a.kind !== 'point') return;
      const b = await api.getPoint({ prompt: L('Precise el segundo extremo del diámetro', 'Specify second end point of diameter'), base: a.p, rubber: 'line', preview: (p) => ({ entities: [circle(mid(a.p, p), Math.max(1e-9, dist(a.p, p) / 2))] }) });
      if (b.kind === 'point' && dist(a.p, b.p) > 1e-12) addEntity<CircleEntity>(api, 'CIRCLE', { type: 'circle', center: mid(a.p, b.p), radius: dist(a.p, b.p) / 2 });
      return;
    }
    if (r.key === '3P') {
      const a = await api.getPoint({ prompt: L('Precise el primer punto del círculo', 'Specify first point on circle') });
      if (a.kind !== 'point') return;
      const b = await api.getPoint({ prompt: L('Precise el segundo punto del círculo', 'Specify second point on circle'), base: a.p, rubber: 'line' });
      if (b.kind !== 'point') return;
      const c = await api.getPoint({
        prompt: L('Precise el tercer punto del círculo', 'Specify third point on circle'),
        preview: (p) => {
          const cc = circleFrom3Points(a.p, b.p, p);
          return cc ? { entities: [circle(cc.center, cc.radius)] } : null;
        },
      });
      if (c.kind !== 'point') return;
      const cc = circleFrom3Points(a.p, b.p, c.p);
      if (!cc) fail('Los tres puntos son colineales: no definen un círculo.', 'The three points are collinear: they do not define a circle.');
      addEntity<CircleEntity>(api, 'CIRCLE', { type: 'circle', center: cc.center, radius: cc.radius });
      return;
    }
    if (r.key === 'Ttr') {
      const e1 = await api.getEntity({ prompt: L('Designe un punto en el objeto para la primera tangente', 'Specify point on object for first tangent'), types: ['line', 'circle', 'arc', 'lwpolyline'] });
      if (e1.kind !== 'entity') return;
      const e2 = await api.getEntity({ prompt: L('Designe un punto en el objeto para la segunda tangente', 'Specify point on object for second tangent'), types: ['line', 'circle', 'arc', 'lwpolyline'] });
      if (e2.kind !== 'entity') return;
      const rad = await api.getDistance({ prompt: L('Precise el radio del círculo', 'Specify radius of circle') });
      if (rad.kind !== 'value') return;
      const c1 = nearestCurve(api, e1.id, e1.p);
      const c2 = nearestCurve(api, e2.id, e2.p);
      if (!c1 || !c2) return;
      const sols = circlesTTR(c1, e1.p, c2, e2.p, rad.value);
      if (!sols.length) fail('No existe un círculo tangente a ambos objetos con ese radio.', 'No circle with that radius is tangent to both objects.');
      addEntity<CircleEntity>(api, 'CIRCLE', { type: 'circle', center: sols[0].center, radius: rad.value });
    }
  },
};

export function nearestCurve(api: CommandApi, id: Id, p: Vec2): Curve | null {
  const e = api.editor.doc.entity(id);
  if (!e) return null;
  let best: Curve | null = null;
  let bd = Infinity;
  for (const c of kindOf(e).curves(e, api.editor.ctx)) {
    const t = c.kind === 'line' ? Math.min(1, Math.max(0, ((p.x - c.a.x) * (c.b.x - c.a.x) + (p.y - c.a.y) * (c.b.y - c.a.y)) / Math.max(1e-30, (c.b.x - c.a.x) ** 2 + (c.b.y - c.a.y) ** 2))) : 0;
    const d = c.kind === 'line' ? dist(curvePoint(c, t), p) : c.kind === 'arc' ? Math.abs(dist(c.c, p) - c.r) : Infinity;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

// ============================================================================ ARC

const ARC: CommandDef = {
  name: 'ARC',
  aliases: ['A', 'ARCO'],
  category: 'draw',
  label: L('Arco', 'Arc'),
  description: L('Crea un arco por 3 puntos, inicio-centro-fin, inicio-centro-ángulo, inicio-fin-radio o inicio-fin-dirección.', 'Creates an arc by 3 points, start-center-end, start-center-angle, start-end-radius or start-end-direction.'),
  icon: 'arc',
  async run(api) {
    const r0 = await api.getPoint({ prompt: L('Precise el punto inicial del arco', 'Specify start point of arc'), keywords: [K('Center', 'Centro', 'Center', ['c', 'ce'])] });
    const addArc = (a: ArcCurve | null) => {
      if (!a || a.r <= 1e-12) fail('Los datos no definen un arco válido.', 'The input does not define a valid arc.');
      const e = arcEntityFrom(api, a!);
      addEntity<ArcEntity>(api, 'ARC', { type: 'arc', center: e.center, radius: e.radius, startAngle: e.startAngle, endAngle: e.endAngle });
    };
    const pv = (a: ArcCurve | null) => (a && a.r > 1e-12 ? { entities: [arcEntityFrom(api, a)] } : null);
    if (r0.kind === 'keyword') {
      const c = await api.getPoint({ prompt: L('Precise el centro del arco', 'Specify center point of arc') });
      if (c.kind !== 'point') return;
      const s = await api.getPoint({ prompt: L('Precise el punto inicial del arco', 'Specify start point of arc'), base: c.p, rubber: 'line' });
      if (s.kind !== 'point') return;
      const e = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify end point of arc'), base: c.p, rubber: 'line', preview: (p) => pv(arcStartCenterEnd(s.p, c.p, p)) });
      if (e.kind === 'point') addArc(arcStartCenterEnd(s.p, c.p, e.p));
      return;
    }
    if (r0.kind !== 'point') return;
    const start = r0.p;
    const r1 = await api.getPoint({ prompt: L('Precise el segundo punto del arco', 'Specify second point of arc'), base: start, rubber: 'line', keywords: [K('Center', 'Centro', 'Center', ['c', 'ce']), K('End', 'Final', 'End', ['f', 'e'])] });
    if (r1.kind === 'point') {
      const e = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify end point of arc'), preview: (p) => pv(arcFrom3Points(start, r1.p, p)) });
      if (e.kind === 'point') addArc(arcFrom3Points(start, r1.p, e.p));
      return;
    }
    if (r1.kind !== 'keyword') return;
    if (r1.key === 'Center') {
      const c = await api.getPoint({ prompt: L('Precise el centro del arco', 'Specify center point of arc'), base: start, rubber: 'line' });
      if (c.kind !== 'point') return;
      const e = await api.getPoint({
        prompt: L('Precise el punto final del arco', 'Specify end point of arc'),
        base: c.p,
        rubber: 'line',
        keywords: [K('Angle', 'Ángulo', 'Angle', ['a']), K('chord Length', 'Longitud de cuerda', 'chord Length', ['l'])],
        preview: (p) => pv(arcStartCenterEnd(start, c.p, p)),
      });
      if (e.kind === 'point') addArc(arcStartCenterEnd(start, c.p, e.p));
      else if (e.kind === 'keyword' && e.key === 'Angle') {
        const a = await api.getAngle({ prompt: L('Precise el ángulo incluido', 'Specify included angle'), base: c.p });
        if (a.kind === 'value') addArc(arcStartCenterAngle(start, c.p, a.value));
      } else if (e.kind === 'keyword') {
        const l = await api.getDistance({ prompt: L('Precise la longitud de la cuerda', 'Specify length of chord') });
        if (l.kind !== 'value') return;
        const rr = dist(start, c.p);
        if (l.value > 2 * rr) fail('La cuerda es mayor que el diámetro.', 'The chord is longer than the diameter.');
        addArc(arcStartCenterAngle(start, c.p, 2 * Math.asin(l.value / (2 * rr))));
      }
      return;
    }
    const end = await api.getPoint({ prompt: L('Precise el punto final del arco', 'Specify end point of arc'), base: start, rubber: 'line' });
    if (end.kind !== 'point') return;
    const o = await api.getPoint({
      prompt: L('Precise el centro del arco', 'Specify center point of arc'),
      keywords: [K('Angle', 'Ángulo', 'Angle', ['a']), K('Direction', 'Dirección', 'Direction', ['d']), K('Radius', 'Radio', 'Radius', ['r'])],
      preview: (p) => pv(arcStartCenterEnd(start, p, end.p)),
    });
    if (o.kind === 'point') addArc(arcStartCenterEnd(start, o.p, end.p));
    else if (o.kind === 'keyword') {
      if (o.key === 'Radius') {
        const rr = await api.getDistance({ prompt: L('Precise el radio del arco', 'Specify radius of arc'), allowNegative: true });
        if (rr.kind === 'value') addArc(arcStartEndRadius(start, end.p, rr.value));
      } else if (o.key === 'Direction') {
        const d = await api.getPoint({ prompt: L('Precise la dirección tangente en el inicio', 'Specify tangent direction at start'), base: start, rubber: 'line', preview: (p) => pv(arcStartEndDirection(start, end.p, sub(p, start))) });
        if (d.kind === 'point') addArc(arcStartEndDirection(start, end.p, sub(d.p, start)));
      } else {
        const a = await api.getAngle({ prompt: L('Precise el ángulo incluido', 'Specify included angle') });
        if (a.kind !== 'value') return;
        const chord = dist(start, end.p);
        const rr = chord / (2 * Math.sin(Math.abs(a.value) / 2));
        const m = mid(start, end.p);
        const h = Math.sqrt(Math.max(0, rr * rr - (chord / 2) ** 2));
        const n = perp(normalize(sub(end.p, start)));
        const center = add(m, scale(n, Math.sign(a.value) * (Math.abs(a.value) > Math.PI ? -h : h)));
        addArc(arcStartCenterAngle(start, center, a.value));
      }
    }
  },
};

// ============================================================================ RECTANG

export function rectangleVertices(c1: Vec2, c2: Vec2, rotation: number, fillet: number, chamfer: [number, number]): PolyVertex[] {
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const toLocal = (p: Vec2) => ({ x: (p.x - c1.x) * cos - (p.y - c1.y) * sin, y: (p.x - c1.x) * sin + (p.y - c1.y) * cos });
  const l2 = toLocal(c2);
  const w = l2.x;
  const h = l2.y;
  const toWorld = (x: number, y: number): Vec2 => ({ x: c1.x + x * Math.cos(rotation) - y * Math.sin(rotation), y: c1.y + x * Math.sin(rotation) + y * Math.cos(rotation) });
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const aw = Math.abs(w);
  const ah = Math.abs(h);
  const sx = Math.sign(w) || 1;
  const sy = Math.sign(h) || 1;
  const ccw = sx * sy > 0;
  const out: PolyVertex[] = [];
  if (fillet > 0 && 2 * fillet <= Math.min(aw, ah) + 1e-9) {
    const b = sweepToBulge((ccw ? 1 : -1) * (Math.PI / 2));
    const f = fillet;
    const pts = [
      [f * sx, 0],
      [w - f * sx, 0],
      [w, f * sy],
      [w, h - f * sy],
      [w - f * sx, h],
      [f * sx, h],
      [0, h - f * sy],
      [0, f * sy],
    ];
    pts.forEach(([x, y], i) => {
      const p = toWorld(x, y);
      out.push({ x: p.x, y: p.y, bulge: i % 2 === 1 ? b : 0 });
    });
    return out;
  }
  if ((chamfer[0] > 0 || chamfer[1] > 0) && chamfer[0] + chamfer[1] <= Math.min(aw, ah) * 2) {
    const [d1, d2] = chamfer;
    const pts = [
      [d1 * sx, 0],
      [w - d2 * sx, 0],
      [w, d1 * sy],
      [w, h - d2 * sy],
      [w - d1 * sx, h],
      [d2 * sx, h],
      [0, h - d1 * sy],
      [0, d2 * sy],
    ];
    for (const [x, y] of pts) {
      const p = toWorld(x, y);
      out.push({ x: p.x, y: p.y, bulge: 0 });
    }
    return out;
  }
  for (const [x, y] of corners) {
    const p = toWorld(x, y);
    out.push({ x: p.x, y: p.y, bulge: 0 });
  }
  return out;
}

const RECTANG: CommandDef = {
  name: 'RECTANG',
  aliases: ['REC', 'RECTANGLE', 'RECTANGULO'],
  category: 'draw',
  label: L('Rectángulo', 'Rectangle'),
  description: L('Crea una polilínea rectangular paramétrica con empalme, chaflán, grosor y rotación opcionales.', 'Creates a parametric rectangular polyline with optional fillet, chamfer, width and rotation.'),
  icon: 'rect',
  async run(api) {
    let fillet = 0;
    let chamfer: [number, number] = [0, 0];
    let width = 0;
    let rotation = 0;
    let c1: Vec2 | null = null;
    while (!c1) {
      const r = await api.getPoint({
        prompt: L('Precise la primera esquina', 'Specify first corner point'),
        keywords: [K('Chamfer', 'Chaflán', 'Chamfer', ['c']), K('Fillet', 'Empalme', 'Fillet', ['e', 'f']), K('Width', 'Grosor', 'Width', ['g', 'w'])],
      });
      if (r.kind === 'point') c1 = r.p;
      else if (r.kind === 'keyword') {
        if (r.key === 'Fillet') {
          const v = await api.getDistance({ prompt: L('Radio de empalme', 'Fillet radius'), defaultValue: fillet, allowZero: true });
          if (v.kind === 'value') {
            fillet = v.value;
            chamfer = [0, 0];
          }
        } else if (r.key === 'Chamfer') {
          const a = await api.getDistance({ prompt: L('Primera distancia de chaflán', 'First chamfer distance'), defaultValue: chamfer[0], allowZero: true });
          const b = await api.getDistance({ prompt: L('Segunda distancia de chaflán', 'Second chamfer distance'), defaultValue: a.kind === 'value' ? a.value : chamfer[1], allowZero: true });
          if (a.kind === 'value' && b.kind === 'value') {
            chamfer = [a.value, b.value];
            fillet = 0;
          }
        } else {
          const v = await api.getDistance({ prompt: L('Grosor de línea', 'Line width'), defaultValue: width, allowZero: true });
          if (v.kind === 'value') width = v.value;
        }
      } else return;
    }
    const first = c1;
    const build = (p: Vec2) => rectangleVertices(first, p, rotation, fillet, chamfer);
    for (;;) {
      const r = await api.getPoint({
        prompt: L('Precise la otra esquina', 'Specify other corner point'),
        base: first,
        keywords: [K('Area', 'Área', 'Area', ['a']), K('Dimensions', 'Cotas', 'Dimensions', ['c', 'd']), K('Rotation', 'Rotación', 'Rotation', ['r'])],
        preview: (p) => ({ entities: [make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: build(p), closed: true })] }),
      });
      if (r.kind === 'keyword') {
        if (r.key === 'Rotation') {
          const a = await api.getAngle({ prompt: L('Precise el ángulo de rotación', 'Specify rotation angle'), base: first, defaultValue: rotation });
          if (a.kind === 'value') rotation = a.value;
          continue;
        }
        if (r.key === 'Dimensions' || r.key === 'Area') {
          let w: number;
          let h: number;
          if (r.key === 'Area') {
            const area = await api.getNumber({ prompt: L('Área del rectángulo', 'Area of rectangle'), min: 1e-12 });
            if (area.kind !== 'value') continue;
            const lw = await api.getDistance({ prompt: L('Longitud', 'Length') });
            if (lw.kind !== 'value') continue;
            w = lw.value;
            h = area.value / lw.value;
          } else {
            const lw = await api.getDistance({ prompt: L('Precise la longitud del rectángulo', 'Specify length for rectangle') });
            if (lw.kind !== 'value') continue;
            const lh = await api.getDistance({ prompt: L('Precise la anchura del rectángulo', 'Specify width for rectangle') });
            if (lh.kind !== 'value') continue;
            w = lw.value;
            h = lh.value;
          }
          const q = await api.getPoint({ prompt: L('Designe el cuadrante (orientación)', 'Pick quadrant for orientation'), base: first });
          if (q.kind !== 'point') continue;
          const loc = { x: (q.p.x - first.x) * Math.cos(-rotation) - (q.p.y - first.y) * Math.sin(-rotation), y: (q.p.x - first.x) * Math.sin(-rotation) + (q.p.y - first.y) * Math.cos(-rotation) };
          const sx = loc.x < 0 ? -1 : 1;
          const sy = loc.y < 0 ? -1 : 1;
          const other = { x: first.x + sx * w * Math.cos(rotation) - sy * h * Math.sin(rotation), y: first.y + sx * w * Math.sin(rotation) + sy * h * Math.cos(rotation) };
          createRect(other);
          return;
        }
        continue;
      }
      if (r.kind !== 'point') return;
      createRect(r.p);
      return;
    }
    function createRect(other: Vec2) {
      const w = Math.abs((other.x - first.x) * Math.cos(rotation) + (other.y - first.y) * Math.sin(rotation));
      const h = Math.abs(-(other.x - first.x) * Math.sin(rotation) + (other.y - first.y) * Math.cos(rotation));
      if (w < 1e-12 || h < 1e-12) fail('El rectángulo tiene anchura o altura cero.', 'The rectangle has zero width or height.');
      addEntity<LwPolylineEntity>(api, 'RECTANG', {
        type: 'lwpolyline',
        vertices: build(other),
        closed: true,
        constantWidth: width > 0 ? width : undefined,
        shape: { kind: 'rectangle', width: w, height: h, rotation, corner: first, fillet: fillet || undefined, chamfer: chamfer[0] || chamfer[1] ? chamfer : undefined },
      });
    }
  },
};

// ============================================================================ POLYGON

const POLYGON: CommandDef = {
  name: 'POLYGON',
  aliases: ['POL', 'POLIGONO', 'POLÍGONO'],
  category: 'draw',
  label: L('Polígono', 'Polygon'),
  description: L('Crea un polígono regular inscrito, circunscrito o por arista.', 'Creates a regular polygon inscribed, circumscribed or by edge.'),
  icon: 'polygon',
  async run(api) {
    const n = await api.getNumber({ prompt: L('Número de lados', 'Enter number of sides'), integer: true, min: 3, max: 1024, defaultValue: 6 });
    if (n.kind !== 'value') return;
    const sides = n.value;
    const c = await api.getPoint({ prompt: L('Precise el centro del polígono', 'Specify center of polygon'), keywords: [K('Edge', 'Lado', 'Edge', ['l', 'e'])] });
    const poly = (pts: Vec2[]) => make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: pts.map((p) => ({ ...p, bulge: 0 })), closed: true });
    if (c.kind === 'keyword') {
      const a = await api.getPoint({ prompt: L('Precise el primer extremo del lado', 'Specify first endpoint of edge') });
      if (a.kind !== 'point') return;
      const edgePoly = (p: Vec2) => {
        const L0 = dist(a.p, p);
        const R = L0 / (2 * Math.sin(Math.PI / sides));
        const midp = mid(a.p, p);
        const apo = L0 / (2 * Math.tan(Math.PI / sides));
        const center = add(midp, scale(perp(normalize(sub(p, a.p))), apo));
        const rot = angleOf(sub(a.p, center));
        return { pts: regularPolygon(center, R, sides, rot, true), center, R, rot };
      };
      const b = await api.getPoint({ prompt: L('Precise el segundo extremo del lado', 'Specify second endpoint of edge'), base: a.p, rubber: 'line', preview: (p) => (dist(a.p, p) > 1e-12 ? { entities: [poly(edgePoly(p).pts)] } : null) });
      if (b.kind !== 'point') return;
      const res = edgePoly(b.p);
      addEntity<LwPolylineEntity>(api, 'POLYGON', { type: 'lwpolyline', vertices: res.pts.map((p) => ({ ...p, bulge: 0 })), closed: true, shape: { kind: 'polygon', sides, center: res.center, radius: res.R, rotation: res.rot, inscribed: true } });
      return;
    }
    if (c.kind !== 'point') return;
    const mode = await api.getKeyword({ prompt: L('Indique una opción', 'Enter an option'), keywords: [K('Inscribed', 'Inscrito en el círculo', 'Inscribed in circle', ['i']), K('Circumscribed', 'Circunscrito alrededor del círculo', 'Circumscribed about circle', ['c'])], defaultValue: 'Inscribed' });
    if (mode.kind !== 'keyword') return;
    const inscribed = mode.key === 'Inscribed';
    const center = c.p;
    const rr = await api.getDistance({ prompt: L('Precise el radio del círculo', 'Specify radius of circle'), base: center, preview: (p) => (dist(center, p) > 1e-12 ? { entities: [poly(regularPolygon(center, dist(center, p), sides, angleOf(sub(p, center)), inscribed))] } : null) });
    if (rr.kind !== 'value') return;
    const rot = rr.p ? angleOf(sub(rr.p, center)) : inscribed ? Math.PI / 2 : Math.PI / 2 - Math.PI / sides;
    const pts = regularPolygon(center, rr.value, sides, rot, inscribed);
    addEntity<LwPolylineEntity>(api, 'POLYGON', { type: 'lwpolyline', vertices: pts.map((p) => ({ ...p, bulge: 0 })), closed: true, shape: { kind: 'polygon', sides, center, radius: rr.value, rotation: rot, inscribed } });
  },
};

// ============================================================================ ELLIPSE

const ELLIPSE: CommandDef = {
  name: 'ELLIPSE',
  aliases: ['EL', 'ELIPSE'],
  category: 'draw',
  label: L('Elipse', 'Ellipse'),
  description: L('Crea una elipse o arco elíptico por ejes o por centro.', 'Creates an ellipse or elliptical arc by axis or center.'),
  icon: 'ellipse',
  async run(api) {
    let arcMode = false;
    let center: Vec2;
    let majorEnd: Vec2;
    let r = await api.getPoint({ prompt: L('Precise el extremo del eje de la elipse', 'Specify axis endpoint of ellipse'), keywords: [K('Arc', 'Arco', 'Arc', ['a']), K('Center', 'Centro', 'Center', ['c'])] });
    if (r.kind === 'keyword' && r.key === 'Arc') {
      arcMode = true;
      r = await api.getPoint({ prompt: L('Precise el extremo del eje del arco elíptico', 'Specify axis endpoint of elliptical arc'), keywords: [K('Center', 'Centro', 'Center', ['c'])] });
    }
    const ell = (c: Vec2, major: Vec2, ratio: number, s = 0, e = TAU) => make<EllipseEntity>(api, { type: 'ellipse', center: c, majorAxis: major, ratio: Math.max(1e-6, Math.min(1, ratio)), startParam: s, endParam: e });
    if (r.kind === 'keyword') {
      const c = await api.getPoint({ prompt: L('Precise el centro de la elipse', 'Specify center of ellipse') });
      if (c.kind !== 'point') return;
      const a = await api.getPoint({ prompt: L('Precise el extremo del eje', 'Specify endpoint of axis'), base: c.p, rubber: 'line' });
      if (a.kind !== 'point') return;
      center = c.p;
      majorEnd = a.p;
    } else if (r.kind === 'point') {
      const p1 = r.p;
      const p2 = await api.getPoint({ prompt: L('Precise el otro extremo del eje', 'Specify other endpoint of axis'), base: p1, rubber: 'line' });
      if (p2.kind !== 'point') return;
      center = mid(p1, p2.p);
      majorEnd = p2.p;
    } else return;
    const axis = sub(majorEnd, center);
    const L0 = len(axis);
    if (L0 < 1e-12) fail('El eje tiene longitud cero.', 'The axis has zero length.');
    const u = normalize(axis);
    const other = await api.getDistance({
      prompt: L('Precise la distancia al otro eje', 'Specify distance to other axis'),
      base: center,
      keywords: [K('Rotation', 'Rotación', 'Rotation', ['r'])],
      preview: (p) => {
        const d = Math.abs((p.x - center.x) * -u.y + (p.y - center.y) * u.x);
        return d > 1e-12 ? { entities: [d > L0 ? ell(center, scale(perp(u), d), L0 / d) : ell(center, axis, d / L0)] } : null;
      },
    });
    let d: number;
    if (other.kind === 'keyword') {
      const rot = await api.getAngle({ prompt: L('Precise la rotación alrededor del eje mayor', 'Specify rotation around major axis') });
      if (rot.kind !== 'value') return;
      d = L0 * Math.abs(Math.cos(rot.value));
    } else if (other.kind === 'value') {
      d = other.p ? Math.abs((other.p.x - center.x) * -u.y + (other.p.y - center.y) * u.x) : other.value;
    } else return;
    if (d < 1e-12) fail('La elipse degenera en una línea.', 'The ellipse degenerates into a line.');
    let major = axis;
    let ratio = d / L0;
    if (d > L0) {
      major = scale(perp(u), d);
      ratio = L0 / d;
    }
    if (!arcMode) {
      addEntity<EllipseEntity>(api, 'ELLIPSE', { type: 'ellipse', center, majorAxis: major, ratio, startParam: 0, endParam: TAU });
      return;
    }
    const paramAt = (p: Vec2) => {
      const Lm = len(major);
      const um = normalize(major);
      const x = ((p.x - center.x) * um.x + (p.y - center.y) * um.y) / Lm;
      const y = ((p.x - center.x) * -um.y + (p.y - center.y) * um.x) / (Lm * ratio);
      return Math.atan2(y, x);
    };
    const s = await api.getPoint({ prompt: L('Precise el ángulo inicial', 'Specify start angle'), base: center, rubber: 'line' });
    if (s.kind !== 'point') return;
    const sp = paramAt(s.p);
    const e = await api.getPoint({ prompt: L('Precise el ángulo final', 'Specify end angle'), base: center, rubber: 'line', preview: (p) => ({ entities: [ell(center, major, ratio, sp, paramAt(p))] }) });
    if (e.kind !== 'point') return;
    addEntity<EllipseEntity>(api, 'ELLIPSE', { type: 'ellipse', center, majorAxis: major, ratio, startParam: sp, endParam: paramAt(e.p) });
  },
};

// ============================================================================ SPLINE

const SPLINE: CommandDef = {
  name: 'SPLINE',
  aliases: ['SPL'],
  category: 'draw',
  label: L('Spline', 'Spline'),
  description: L('Crea una spline NURBS por puntos de ajuste o vértices de control.', 'Creates a NURBS spline through fit points or control vertices.'),
  icon: 'spline',
  async run(api) {
    let method: 'fit' | 'cv' = 'fit';
    let degree = 3;
    let r = await api.getPoint({ prompt: L('Precise el primer punto', 'Specify first point'), keywords: [K('Method', 'Método', 'Method', ['m']), K('Degree', 'Grado', 'Degree', ['g', 'd'])] });
    while (r.kind === 'keyword') {
      if (r.key === 'Method') {
        const m = await api.getKeyword({ prompt: L('Método de creación', 'Creation method'), keywords: [K('Fit', 'Ajuste', 'Fit', ['a', 'f']), K('CV', 'VC', 'CV', ['vc', 'cv'])], defaultValue: method === 'fit' ? 'Fit' : 'CV' });
        if (m.kind === 'keyword') method = m.key === 'CV' ? 'cv' : 'fit';
      } else {
        const d = await api.getNumber({ prompt: L('Grado', 'Degree'), integer: true, min: 1, max: 10, defaultValue: degree });
        if (d.kind === 'value') degree = d.value;
      }
      r = await api.getPoint({ prompt: L('Precise el primer punto', 'Specify first point'), keywords: [K('Method', 'Método', 'Method', ['m']), K('Degree', 'Grado', 'Degree', ['g', 'd'])] });
    }
    if (r.kind !== 'point') return;
    const pts: Vec2[] = [r.p];
    const build = (points: Vec2[], closed: boolean) => {
      if (points.length < 2) return null;
      const pp = closed ? [...points, points[0]] : points;
      return method === 'fit' ? { ...splineThroughPoints(pp, degree), closed } : { ...splineFromControl(points, degree, closed) };
    };
    for (;;) {
      const r2 = await api.getPoint({
        prompt: L('Precise el punto siguiente', 'Enter next point'),
        base: pts[pts.length - 1],
        rubber: 'line',
        allowNone: true,
        keywords: [UNDO_KW, ...(pts.length > 2 ? [CLOSE_KW] : [])],
        preview: (p) => {
          const s = build([...pts, p], false);
          return s ? { entities: [make<SplineEntity>(api, { type: 'spline', spline: s, method, fitTolerance: 0 })] } : null;
        },
      });
      if (r2.kind === 'none') break;
      if (r2.kind === 'keyword') {
        if (r2.key === 'Undo') {
          if (pts.length > 1) pts.pop();
          continue;
        }
        const s = build(pts, true);
        if (s) addEntity<SplineEntity>(api, 'SPLINE', { type: 'spline', spline: s, method, fitTolerance: 0 });
        return;
      }
      pts.push(r2.p);
    }
    const s = build(pts, false);
    if (!s) fail('Una spline necesita al menos dos puntos.', 'A spline needs at least two points.');
    addEntity<SplineEntity>(api, 'SPLINE', { type: 'spline', spline: s, method, fitTolerance: 0 });
  },
};

// ============================================================================ POINT / RAY / XLINE

const POINT: CommandDef = {
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

const RAY: CommandDef = {
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
        preview: (p) => (dist(p, s.p) > 1e-12 ? { entities: [make<RayEntity>(api, { type: 'ray', origin: s.p, direction: normalize(sub(p, s.p)) })] } : null),
      });
      if (t.kind !== 'point') return;
      if (dist(t.p, s.p) < 1e-12) continue;
      addEntity<RayEntity>(api, 'RAY', { type: 'ray', origin: s.p, direction: normalize(sub(t.p, s.p)) });
    }
  },
};

const XLINE: CommandDef = {
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
        const t = await api.getPoint({ prompt: L('Precise el punto a través', 'Specify through point'), base: r.p, allowNone: true, preview: (p) => (dist(p, r.p) > 1e-12 ? { entities: [xl(r.p, sub(p, r.p))] } : null) });
        if (t.kind !== 'point') return;
        if (dist(t.p, r.p) > 1e-12) addX(r.p, sub(t.p, r.p));
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
      for (;;) {
        const e = await api.getPoint({ prompt: L('Precise el punto final del ángulo', 'Specify angle end point'), base: v.p, rubber: 'line', allowNone: true, preview: (p) => ({ entities: [xl(v.p, add(normalize(sub(s.p, v.p)), normalize(sub(p, v.p))))] }) });
        if (e.kind !== 'point') return;
        const d = add(normalize(sub(s.p, v.p)), normalize(sub(e.p, v.p)));
        addX(v.p, len(d) > 1e-12 ? d : perp(normalize(sub(s.p, v.p))));
      }
    }
    // Desfase
    const dist0 = await api.getDistance({ prompt: L('Precise la distancia de desfase', 'Specify offset distance'), defaultValue: api.editor.doc.settings.offsetDistance });
    if (dist0.kind !== 'value') return;
    for (;;) {
      const obj = await api.getEntity({ prompt: L('Designe un objeto lineal', 'Select a line object'), types: ['line', 'xline', 'ray', 'lwpolyline'] });
      if (obj.kind !== 'entity') return;
      const c = nearestCurve(api, obj.id, obj.p);
      if (!c || c.kind !== 'line') {
        api.warn(L('Se requiere un segmento recto.', 'A straight segment is required.'));
        continue;
      }
      const side = await api.getPoint({ prompt: L('Precise el lado de desfase', 'Specify side to offset') });
      if (side.kind !== 'point') return;
      const d = normalize(sub(c.b, c.a));
      const n = perp(d);
      const s = Math.sign((side.p.x - c.a.x) * n.x + (side.p.y - c.a.y) * n.y) || 1;
      addX(add(c.a, scale(n, s * dist0.value)), d);
    }
  },
};

// ============================================================================ REVCLOUD

export function revcloudVertices(poly: Vec2[], closed: boolean, arcLen: number, ccwOutward: boolean): PolyVertex[] {
  const out: PolyVertex[] = [];
  const n = poly.length;
  const segs = closed ? n : n - 1;
  // orientación del contorno para abombar hacia fuera
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i].x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * poly[i].y;
  const sign = (area >= 0 ? -1 : 1) * (ccwOutward ? 1 : -1);
  const bulge = Math.tan((sign * (Math.PI * 0.6)) / 4);
  for (let i = 0; i < segs; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const L0 = dist(a, b);
    const k = Math.max(1, Math.round(L0 / arcLen));
    for (let j = 0; j < k; j++) {
      const p = { x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k };
      out.push({ x: p.x, y: p.y, bulge });
    }
  }
  if (!closed) out.push({ ...poly[n - 1], bulge: 0 });
  return out;
}

const REVCLOUD: CommandDef = {
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
          const pts = curves.flatMap((c, i) => {
            const total = curveLength(c);
            const k = Math.max(2, Math.round(total / arcLen));
            return Array.from({ length: k }, (_, j) => curvePoint(c, paramAtLength(c, (total * j) / k))).slice(i > 0 ? 0 : 0);
          });
          const closed = e.type === 'circle' || e.type === 'ellipse' || (e.type === 'lwpolyline' && e.closed);
          api.apply('REVCLOUD', (tx) => {
            tx.removeEntity(e.id);
            const { id: _i, order: _o, ...rest } = make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: revcloudVertices(pts, closed, 1e12, true).map((v) => ({ ...v })), closed, layer: e.layer, color: e.color, shape: { kind: 'revcloud', arcLength: arcLen, style: 'normal' } });
            tx.addEntity(rest as never);
          });
          return;
        }
        continue;
      }
      if (r.kind !== 'point') return;
      const cloud = (pts: Vec2[], closed: boolean) => make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: revcloudVertices(pts, closed, arcLen, true), closed });
      if (mode === 'Rectangular') {
        const o = await api.getPoint({ prompt: L('Precise la esquina opuesta', 'Specify opposite corner'), base: r.p, rubber: 'rect', preview: (p) => ({ entities: [cloud([r.p, { x: p.x, y: r.p.y }, p, { x: r.p.x, y: p.y }], true)] }) });
        if (o.kind !== 'point') return;
        const pts = [r.p, { x: o.p.x, y: r.p.y }, o.p, { x: r.p.x, y: o.p.y }];
        addEntity<LwPolylineEntity>(api, 'REVCLOUD', { ...cloud(pts, true), id: undefined, order: undefined, shape: { kind: 'revcloud', arcLength: arcLen, style: 'normal' } } as never);
        return;
      }
      const pts = [r.p];
      for (;;) {
        const n = await api.getPoint({ prompt: L('Precise el punto siguiente', 'Specify next point'), base: pts[pts.length - 1], rubber: 'line', allowNone: true, preview: (p) => ({ entities: [cloud([...pts, p], true)] }) });
        if (n.kind !== 'point') break;
        pts.push(n.p);
      }
      if (pts.length < 3) fail('La nube poligonal necesita al menos tres puntos.', 'A polygonal cloud needs at least three points.');
      addEntity<LwPolylineEntity>(api, 'REVCLOUD', { ...cloud(pts, true), id: undefined, order: undefined, shape: { kind: 'revcloud', arcLength: arcLen, style: 'normal' } } as never);
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
  const total = curves.reduce((s, c) => s + curveLength(c), 0);
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
  const closed = (e.type === 'circle' || (e.type === 'ellipse' && Math.abs(e.endParam - e.startParam) >= TAU - 1e-9) || ((e.type === 'lwpolyline' || e.type === 'polyline2d') && e.closed));
  const distances: number[] = [];
  if (measure) {
    for (let s = v; s < total - 1e-9; s += v) distances.push(s);
  } else {
    for (let i = 1; i < v; i++) distances.push((total * i) / v);
    if (closed) distances.unshift(0);
  }
  const entities: Entity[] = [];
  for (const s of distances) {
    let acc = 0;
    for (const c of curves) {
      const l = curveLength(c);
      if (acc + l >= s - 1e-12) {
        const t = paramAtLength(c, s - acc);
        const p = curvePoint(c, t);
        if (blockId) {
          const rot = align ? angleOf(curveTangent(c, t)) : 0;
          entities.push(make<InsertEntity>(api, { type: 'insert', blockId, position: p, scale: { x: 1, y: 1 }, rotation: rot, attributes: [] }));
        } else entities.push(make<PointEntity>(api, { type: 'point', position: p }));
        break;
      }
      acc += l;
    }
  }
  addMany(api, measure ? 'MEASURE' : 'DIVIDE', entities);
  api.info(L(`${entities.length} marcas creadas sobre una longitud de ${total.toFixed(4)}.`, `${entities.length} markers created along a length of ${total.toFixed(4)}.`));
}

const DIVIDE: CommandDef = {
  name: 'DIVIDE',
  aliases: ['DIV', 'DIVIDIR', 'GRADUA'],
  category: 'draw',
  label: L('Dividir', 'Divide'),
  description: L('Coloca puntos o bloques a intervalos iguales a lo largo de un objeto.', 'Places points or blocks at equal intervals along an object.'),
  icon: 'divide',
  run: (api) => divideOrMeasure(api, false),
};

const MEASURE: CommandDef = {
  name: 'MEASURE',
  aliases: ['ME', 'MEDIR'],
  category: 'draw',
  label: L('Medir (graduar)', 'Measure'),
  description: L('Coloca puntos o bloques a una distancia fija a lo largo de un objeto.', 'Places points or blocks at a fixed distance along an object.'),
  icon: 'measure',
  run: (api) => divideOrMeasure(api, true),
};

// ============================================================================ TEXT / MTEXT

const TEXT: CommandDef = {
  name: 'TEXT',
  aliases: ['DT', 'DTEXT', 'TEXTO'],
  category: 'annotate',
  label: L('Texto de una línea', 'Single-line text'),
  description: L('Crea textos de una línea con justificación, altura y rotación; Intro crea la línea siguiente.', 'Creates single-line text with justification, height and rotation; Enter starts the next line.'),
  icon: 'text',
  async run(api) {
    const s = api.editor.doc.settings;
    let halign: TextEntity['halign'] = 'left';
    let valign: TextEntity['valign'] = 'baseline';
    let start: Vec2 | null = null;
    while (!start) {
      const r = await api.getPoint({ prompt: L('Precise el punto inicial del texto', 'Specify start point of text'), keywords: [K('Justify', 'Justificar', 'Justify', ['j']), K('Style', 'Estilo', 'Style', ['e', 's'])] });
      if (r.kind === 'point') start = r.p;
      else if (r.kind === 'keyword' && r.key === 'Justify') {
        const j = await api.getKeyword({
          prompt: L('Opción de justificación', 'Justification option'),
          keywords: [K('Left', 'Izquierda', 'Left', ['iz', 'l']), K('Center', 'Centro', 'Center', ['c']), K('Right', 'Derecha', 'Right', ['d', 'r']), K('Middle', 'Medio', 'Middle', ['m']), K('TL', 'SI', 'TL', ['si', 'tl']), K('TC', 'SC', 'TC', ['sc', 'tc']), K('TR', 'SD', 'TR', ['sd', 'tr']), K('ML', 'MI', 'ML', ['mi', 'ml']), K('MC', 'MC', 'MC'), K('MR', 'MD', 'MR', ['md', 'mr']), K('BL', 'II', 'BL', ['ii', 'bl']), K('BC', 'IC', 'BC', ['ic', 'bc']), K('BR', 'ID', 'BR', ['id', 'br'])],
        });
        if (j.kind !== 'keyword') continue;
        const map: Record<string, [TextEntity['halign'], TextEntity['valign']]> = { Left: ['left', 'baseline'], Center: ['center', 'baseline'], Right: ['right', 'baseline'], Middle: ['middle', 'middle'], TL: ['left', 'top'], TC: ['center', 'top'], TR: ['right', 'top'], ML: ['left', 'middle'], MC: ['center', 'middle'], MR: ['right', 'middle'], BL: ['left', 'bottom'], BC: ['center', 'bottom'], BR: ['right', 'bottom'] };
        [halign, valign] = map[j.key];
      } else if (r.kind === 'keyword') {
        const st = await api.getString({ prompt: L('Nombre del estilo de texto', 'Enter style name'), defaultValue: api.editor.doc.data.textStyles.get(s.currentTextStyle)?.name });
        if (st.kind === 'string') {
          const found = api.editor.doc.findByName('textStyles', st.value);
          if (found) api.apply('TEXTSTYLE', (tx) => tx.setSettings({ currentTextStyle: found.id }));
          else api.warn(L(`No existe el estilo «${st.value}».`, `Style "${st.value}" not found.`));
        }
      } else return;
    }
    const style = api.editor.doc.data.textStyles.get(s.currentTextStyle);
    let height = style && style.height > 0 ? style.height : s.textHeight;
    const annot = style?.annotative ? 1 / (api.editor.ctx.annotationScale || 1) : 1;
    if (!style || style.height <= 0) {
      const h = await api.getDistance({ prompt: L('Precise la altura', 'Specify height'), base: start, defaultValue: s.textHeight });
      if (h.kind === 'value') height = h.value;
      else if (h.kind !== 'none') return;
      if (height !== s.textHeight) api.apply('TEXTSIZE', (tx) => tx.setSettings({ textHeight: height }));
    }
    const rot = await api.getAngle({ prompt: L('Precise el ángulo de rotación del texto', 'Specify rotation angle of text'), base: start, defaultValue: 0 });
    const rotation = rot.kind === 'value' ? rot.value : 0;
    let pos = start;
    for (;;) {
      const t = await api.getString({ prompt: L('Escriba el texto (Intro vacío termina)', 'Enter text (empty Enter ends)'), allowSpaces: true, allowNone: true });
      if (t.kind !== 'string' || !t.value) return;
      addEntity<TextEntity>(api, 'TEXT', { type: 'text', position: pos, text: t.value, height: height * annot, rotation, widthFactor: style?.widthFactor ?? 1, oblique: style?.oblique ?? 0, style: s.currentTextStyle, halign, valign, annotative: style?.annotative || undefined });
      pos = { x: pos.x + Math.sin(rotation) * height * annot * (5 / 3), y: pos.y - Math.cos(rotation) * height * annot * (5 / 3) };
    }
  },
};

const MTEXT: CommandDef = {
  name: 'MTEXT',
  aliases: ['T', 'MT', 'TEXTOM'],
  category: 'annotate',
  label: L('Texto de líneas múltiples', 'Multiline text'),
  description: L('Crea un párrafo de texto con ancho de ajuste, justificación y formato básico.', 'Creates a paragraph of text with wrap width, justification and basic formatting.'),
  icon: 'mtext',
  async run(api) {
    const s = api.editor.doc.settings;
    const style = api.editor.doc.data.textStyles.get(s.currentTextStyle);
    const annot = style?.annotative ? 1 / (api.editor.ctx.annotationScale || 1) : 1;
    let height = (style && style.height > 0 ? style.height : s.textHeight) * annot;
    let attachment: MTextAttachment = 1;
    let rotation = 0;
    const a = await api.getPoint({ prompt: L('Precise la primera esquina', 'Specify first corner') });
    if (a.kind !== 'point') return;
    let width = 0;
    for (;;) {
      const b = await api.getPoint({
        prompt: L('Precise la esquina opuesta', 'Specify opposite corner'),
        base: a.p,
        rubber: 'rect',
        keywords: [K('Height', 'Altura', 'Height', ['a', 'h']), K('Justify', 'Justificar', 'Justify', ['j']), K('Rotation', 'Rotación', 'Rotation', ['r']), K('Width', 'Anchura', 'Width', ['n', 'w'])],
      });
      if (b.kind === 'point') {
        width = Math.abs(b.p.x - a.p.x);
        break;
      }
      if (b.kind !== 'keyword') return;
      if (b.key === 'Height') {
        const h = await api.getDistance({ prompt: L('Precise la altura', 'Specify height'), defaultValue: height });
        if (h.kind === 'value') height = h.value;
      } else if (b.key === 'Rotation') {
        const r = await api.getAngle({ prompt: L('Precise el ángulo de rotación', 'Specify rotation angle'), defaultValue: rotation });
        if (r.kind === 'value') rotation = r.value;
      } else if (b.key === 'Width') {
        const w = await api.getDistance({ prompt: L('Precise la anchura', 'Specify width'), base: a.p, allowZero: true });
        if (w.kind === 'value') {
          width = w.value;
          break;
        }
      } else {
        const j = await api.getKeyword({ prompt: L('Justificación', 'Justification'), keywords: ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'].map((k) => K(k, k, k)) });
        if (j.kind === 'keyword') attachment = (['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'].indexOf(j.key) + 1) as MTextAttachment;
      }
    }
    const text = await api.getString({ prompt: L('Escriba el texto (use \\P para párrafo)', 'Enter text (use \\P for paragraph)'), allowSpaces: true, multiline: true });
    if (text.kind !== 'string' || !text.value.trim()) return;
    addEntity<MTextEntity>(api, 'MTEXT', { type: 'mtext', position: a.p, width, height, rotation, style: s.currentTextStyle, attachment, lineSpacing: 1, contents: text.value.replace(/\r?\n/g, '\\P'), annotative: style?.annotative || undefined });
  },
};

// ============================================================================ MLEADER

const MLEADER: CommandDef = {
  name: 'MLEADER',
  aliases: ['MLD', 'DIRECTRIZM'],
  category: 'annotate',
  label: L('Directriz múltiple', 'Multileader'),
  description: L('Crea una directriz múltiple con punta de flecha, rellano y texto.', 'Creates a multileader with arrowhead, landing and text.'),
  icon: 'mleader',
  async run(api) {
    const s = api.editor.doc.settings;
    const style = api.editor.doc.data.mleaderStyles.get(s.currentMLeaderStyle)!;
    const S = style.annotative ? 1 / (api.editor.ctx.annotationScale || 1) : style.overallScale || 1;
    const arrow = await api.getPoint({ prompt: L('Precise la ubicación de la punta de flecha', 'Specify leader arrowhead location') });
    if (arrow.kind !== 'point') return;
    const verts: Vec2[] = [arrow.p];
    let landing: Vec2 | null = null;
    while (!landing) {
      const r = await api.getPoint({
        prompt: L(verts.length > 1 ? 'Precise el punto siguiente o Intro para el rellano' : 'Precise la ubicación del rellano', verts.length > 1 ? 'Specify next point or Enter for landing' : 'Specify leader landing location'),
        base: verts[verts.length - 1],
        rubber: 'line',
        allowNone: verts.length > 1,
        preview: (p) => ({
          entities: [make<MLeaderEntity>(api, { type: 'mleader', style: style.id, leaders: [{ vertices: [...verts] }], landing: p, doglegLength: style.doglegLength * S, direction: p.x >= verts[verts.length - 1].x ? 1 : -1, content: { type: 'none' } })],
        }),
      });
      if (r.kind === 'point') {
        if (verts.length + 1 >= Math.max(2, style.maxLeaderPoints)) landing = r.p;
        else verts.push(r.p);
      } else if (r.kind === 'none') landing = verts.pop()!;
      else return;
    }
    const direction: 1 | -1 = landing.x >= verts[verts.length - 1].x ? 1 : -1;
    const text = await api.getString({ prompt: L('Escriba el texto de la directriz', 'Enter leader text'), allowSpaces: true, multiline: true, allowNone: true });
    const content = text.kind === 'string' && text.value ? { type: 'mtext' as const, text: text.value.replace(/\r?\n/g, '\\P'), height: style.textHeight * (style.annotative ? 1 : S), attachment: 4 as MTextAttachment, width: 0, frame: style.textFrame } : { type: 'none' as const };
    addEntity<MLeaderEntity>(api, 'MLEADER', { type: 'mleader', style: style.id, leaders: [{ vertices: verts }], landing, doglegLength: style.doglegLength * S, direction, content, annotative: style.annotative || undefined });
  },
};

// ============================================================================ TABLE

const TABLE: CommandDef = {
  name: 'TABLE',
  aliases: ['TB', 'TABLA'],
  category: 'annotate',
  label: L('Tabla', 'Table'),
  description: L('Inserta una tabla con filas, columnas, título y encabezado según el estilo de tabla.', 'Inserts a table with rows, columns, title and header per table style.'),
  icon: 'table',
  async run(api) {
    const cols = await api.getNumber({ prompt: L('Número de columnas', 'Number of columns'), integer: true, min: 1, max: 200, defaultValue: 4 });
    if (cols.kind !== 'value') return;
    const rows = await api.getNumber({ prompt: L('Número de filas de datos', 'Number of data rows'), integer: true, min: 1, max: 2000, defaultValue: 4 });
    if (rows.kind !== 'value') return;
    const s = api.editor.doc.settings;
    const style = api.editor.doc.data.tableStyles.get(s.currentTableStyle)!;
    const colW = style.data.textHeight * 10;
    const rowH = (h: number) => h * 1.8 + style.cellMargin * 2;
    const nRows = rows.value + 2;
    const rowHeights = [rowH(style.title.textHeight), rowH(style.header.textHeight), ...Array.from({ length: rows.value }, () => rowH(style.data.textHeight))];
    const cells = Array.from({ length: nRows }, (_, r) =>
      Array.from({ length: cols.value }, (_, c) => (r === 0 ? (c === 0 ? { text: api.t(L('Título', 'Title')), colSpan: cols.value } : { text: '', merged: true }) : r === 1 ? { text: `${api.t(L('Encabezado', 'Header'))} ${c + 1}` } : { text: '' })),
    );
    const build = (p: Vec2) => make<TableEntity>(api, { type: 'table', position: p, rotation: 0, style: style.id, rowHeights, columnWidths: Array.from({ length: cols.value }, () => colW), cells, titleRow: true, headerRow: true });
    const ins = await api.getPoint({ prompt: L('Precise el punto de inserción (esquina superior izquierda)', 'Specify insertion point (top-left corner)'), preview: (p) => ({ entities: [build(p)] }) });
    if (ins.kind !== 'point') return;
    const t = build(ins.p);
    addEntity<TableEntity>(api, 'TABLE', { ...t, id: undefined, order: undefined } as never);
  },
};

// ============================================================================ MLINE

const MLINE: CommandDef = {
  name: 'MLINE',
  aliases: ['ML', 'LINEAM'],
  category: 'draw',
  label: L('Multilínea', 'Multiline'),
  description: L('Dibuja líneas paralelas múltiples según el estilo de multilínea, con escala y justificación.', 'Draws multiple parallel lines per multiline style, with scale and justification.'),
  icon: 'mline',
  async run(api) {
    const s = api.editor.doc.settings;
    let justification: MLineEntity['justification'] = 'zero';
    let scaleV = 20;
    let first: Vec2 | null = null;
    while (!first) {
      const r = await api.getPoint({ prompt: L(`Precise el punto inicial (just. ${justification}, escala ${scaleV})`, `Specify start point (just. ${justification}, scale ${scaleV})`), keywords: [K('Justification', 'Justificación', 'Justification', ['j']), K('Scale', 'Escala', 'Scale', ['e', 's'])] });
      if (r.kind === 'point') first = r.p;
      else if (r.kind === 'keyword' && r.key === 'Scale') {
        const v = await api.getNumber({ prompt: L('Escala de multilínea', 'Multiline scale'), defaultValue: scaleV });
        if (v.kind === 'value') scaleV = v.value;
      } else if (r.kind === 'keyword') {
        const j = await api.getKeyword({ prompt: L('Tipo de justificación', 'Justification type'), keywords: [K('Top', 'Superior', 'Top', ['s', 't']), K('Zero', 'Cero', 'Zero', ['c', 'z']), K('Bottom', 'Inferior', 'Bottom', ['i', 'b'])] });
        if (j.kind === 'keyword') justification = j.key.toLowerCase() as MLineEntity['justification'];
      } else return;
    }
    const verts = [first];
    const build = (pts: Vec2[], closed = false) => make<MLineEntity>(api, { type: 'mline', vertices: pts, closed, style: s.currentMLineStyle, scale: scaleV, justification });
    let id: Id | null = null;
    for (;;) {
      const r = await api.getPoint({ prompt: L('Precise el punto siguiente', 'Specify next point'), base: verts[verts.length - 1], rubber: 'line', allowNone: true, keywords: [UNDO_KW, ...(verts.length > 2 ? [CLOSE_KW] : [])], preview: (p) => ({ entities: [build([verts[verts.length - 1], p])] }) });
      if (r.kind === 'none') return;
      if (r.kind === 'keyword') {
        if (r.key === 'Undo' && verts.length > 1) verts.pop();
        if (r.key === 'Close' && id) {
          const cid = id;
          api.apply('MLINE', (tx) => tx.updateEntity<MLineEntity>(cid, { closed: true }));
          return;
        }
      } else verts.push(r.p);
      if (verts.length >= 2) {
        if (!id) id = addEntity<MLineEntity>(api, 'MLINE', { ...build([...verts]), id: undefined, order: undefined } as never).id;
        else {
          const cid = id;
          api.apply('MLINE', (tx) => tx.updateEntity<MLineEntity>(cid, { vertices: [...verts] }));
        }
      }
    }
  },
};

// ============================================================================ WIPEOUT

const WIPEOUT: CommandDef = {
  name: 'WIPEOUT',
  aliases: ['COBERTURA'],
  category: 'draw',
  label: L('Cobertura', 'Wipeout'),
  description: L('Crea un área poligonal que oculta los objetos de debajo con el color de fondo.', 'Creates a polygonal area that masks underlying objects with the background color.'),
  icon: 'wipeout',
  async run(api) {
    const r = await api.getPoint({ prompt: L('Precise el primer punto', 'Specify first point'), keywords: [K('Frames', 'Marcos', 'Frames', ['m', 'f'])] });
    if (r.kind === 'keyword') {
      const on = await api.getKeyword({ prompt: L('Mostrar marcos', 'Show frames'), keywords: [K('On', 'Act', 'On', ['a', 'on']), K('Off', 'Des', 'Off', ['d', 'off'])] });
      if (on.kind !== 'keyword') return;
      api.apply('WIPEOUT', (tx) => {
        for (const e of api.editor.doc.data.entities.values()) if (e.type === 'wipeout') tx.updateEntity<WipeoutEntity>(e.id, { frame: on.key === 'On' });
      });
      return;
    }
    if (r.kind !== 'point') return;
    const pts = [r.p];
    for (;;) {
      const n = await api.getPoint({ prompt: L('Precise el punto siguiente', 'Specify next point'), base: pts[pts.length - 1], rubber: 'line', allowNone: true, preview: (p) => ({ entities: [make<WipeoutEntity>(api, { type: 'wipeout', vertices: [...pts, p], frame: true })] }) });
      if (n.kind !== 'point') break;
      pts.push(n.p);
    }
    if (pts.length < 3) fail('La cobertura necesita al menos tres puntos.', 'A wipeout needs at least three points.');
    addEntity<WipeoutEntity>(api, 'WIPEOUT', { type: 'wipeout', vertices: pts, frame: true });
  },
};

// ============================================================================ HATCH / BOUNDARY / REGION

async function pickBoundaries(api: CommandApi, promptHatch: boolean): Promise<Loop[][] | null> {
  const results: Loop[][] = [];
  for (;;) {
    const r = await api.getPoint({ prompt: L('Designe un punto interno', 'Pick internal point'), allowNone: true, noSnap: true, keywords: promptHatch ? [K('Select', 'Seleccionar objetos', 'Select objects', ['s'])] : [] });
    if (r.kind === 'none') break;
    if (r.kind === 'keyword') {
      const ids = await api.getSelection({ prompt: L('Designe objetos cerrados', 'Select closed objects'), types: ['lwpolyline', 'circle', 'ellipse', 'spline', 'region', 'polyline2d'], usePreselection: false });
      for (const id of ids) {
        const e = api.editor.doc.entity(id)!;
        const loop = closedLoopOf(api, e);
        if (loop) results.push([loop]);
      }
      break;
    }
    if (r.kind !== 'point') return null;
    const editor = api.editor;
    const box = editor.view.visibleBox();
    const m = editor.ownerToSpace;
    const curves: Curve[] = [];
    for (const id of editor.index.query(editor.inputOwner, m ? { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity } : box)) {
      const e = editor.doc.entity(id);
      if (!e || !entityVisible(editor.doc, e, editor.visibility()) || e.type === 'hatch' || e.type === 'text' || e.type === 'mtext') continue;
      curves.push(...kindOf(e).curves(e, editor.ctx));
    }
    const res = detectBoundary(curves, r.p, Math.max(1e-7, editor.ownerPerPixel * 0.05));
    if (!res) {
      api.warn(L('No se encontró un contorno cerrado válido alrededor del punto. Comprueba huecos entre objetos o amplía la vista.', 'No valid closed boundary found around the point. Check for gaps between objects or zoom out.'));
      continue;
    }
    results.push([{ vertices: res.outer, closed: true }, ...res.islands.map((v) => ({ vertices: v, closed: true as const }))]);
    api.setPreview({ entities: results.map((loops) => make<HatchEntity>(api, { type: 'hatch', loops, pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal', transparency: 70 })) });
  }
  return results;
}

export function closedLoopOf(api: CommandApi, e: Entity): Loop | null {
  if (e.type === 'lwpolyline' && e.closed) return { vertices: e.vertices.map((v) => ({ ...v })), closed: true };
  if (e.type === 'circle') return { vertices: [{ x: e.center.x + e.radius, y: e.center.y, bulge: 1 }, { x: e.center.x - e.radius, y: e.center.y, bulge: 1 }], closed: true };
  if (e.type === 'region') return e.loops[0] ?? null;
  const curves = kindOf(e).curves(e, api.editor.ctx);
  if (!curves.length) return null;
  const pts = curves.flatMap((c) => [curvePoint(c, 0), ...Array.from({ length: 63 }, (_, i) => curvePoint(c, (i + 1) / 64))]);
  if (dist(pts[0], curvePoint(curves[curves.length - 1], 1)) > 1e-6) return null;
  return { vertices: pts.map((p) => ({ ...p, bulge: 0 })), closed: true };
}

export const hatchDefaults = { pattern: 'ANSI31', scale: 1, angle: 0, type: 'predefined' as HatchEntity['pattern']['type'] };

const HATCH: CommandDef = {
  name: 'HATCH',
  aliases: ['H', 'BH', 'SOMBREADO', 'SOMB'],
  category: 'draw',
  label: L('Sombreado', 'Hatch'),
  description: L('Rellena áreas cerradas con patrón, sólido o degradado; detecta contornos e islas.', 'Fills closed areas with pattern, solid or gradient; detects boundaries and islands.'),
  help: L('Designa puntos internos (se detectan contornos e islas en la vista actual) o Selecciona objetos cerrados. Opciones: Patrón, Escala, Ángulo, Sólido, Islas.', 'Pick internal points (boundaries and islands detected in the current view) or Select closed objects. Options: Pattern, Scale, Angle, Solid, Islands.'),
  icon: 'hatch',
  async run(api) {
    let islandStyle: HatchEntity['islandStyle'] = 'normal';
    for (;;) {
      const opt = await api.getKeyword({
        prompt: L(`Patrón ${hatchDefaults.type === 'solid' ? 'SOLID' : hatchDefaults.pattern} · escala ${hatchDefaults.scale} · ángulo ${Math.round((hatchDefaults.angle * 180) / Math.PI)}°. Intro para designar áreas`, `Pattern ${hatchDefaults.type === 'solid' ? 'SOLID' : hatchDefaults.pattern} · scale ${hatchDefaults.scale} · angle ${Math.round((hatchDefaults.angle * 180) / Math.PI)}°. Enter to pick areas`),
        keywords: [K('Pattern', 'Patrón', 'Pattern', ['p']), K('Scale', 'Escala', 'Scale', ['e', 's']), K('Angle', 'Ángulo', 'Angle', ['a']), K('Solid', 'Sólido', 'Solid', ['so']), K('Islands', 'Islas', 'Islands', ['i'])],
        allowNone: true,
      });
      if (opt.kind === 'none') break;
      if (opt.key === 'Pattern') {
        const p = await api.getString({ prompt: L(`Nombre del patrón (${HATCH_PATTERNS.map((x) => x.name).slice(0, 8).join(', ')}…)`, `Pattern name (${HATCH_PATTERNS.map((x) => x.name).slice(0, 8).join(', ')}…)`), defaultValue: hatchDefaults.pattern });
        if (p.kind === 'string') {
          const found = HATCH_PATTERNS.find((x) => x.name === p.value.toUpperCase());
          if (found) {
            hatchDefaults.pattern = found.name;
            hatchDefaults.type = 'predefined';
          } else api.warn(L(`Patrón desconocido «${p.value}».`, `Unknown pattern "${p.value}".`));
        }
      } else if (opt.key === 'Scale') {
        const v = await api.getNumber({ prompt: L('Escala del patrón', 'Pattern scale'), defaultValue: hatchDefaults.scale, min: 1e-9 });
        if (v.kind === 'value') hatchDefaults.scale = v.value;
      } else if (opt.key === 'Angle') {
        const v = await api.getAngle({ prompt: L('Ángulo del patrón', 'Pattern angle'), defaultValue: hatchDefaults.angle });
        if (v.kind === 'value') hatchDefaults.angle = v.value;
      } else if (opt.key === 'Solid') hatchDefaults.type = 'solid';
      else {
        const s = await api.getKeyword({ prompt: L('Detección de islas', 'Island detection'), keywords: [K('Normal', 'Normal', 'Normal', ['n']), K('Outer', 'Exterior', 'Outer', ['e', 'o']), K('Ignore', 'Ignorar', 'Ignore', ['i'])] });
        if (s.kind === 'keyword') islandStyle = s.key.toLowerCase() as HatchEntity['islandStyle'];
      }
    }
    const areas = await pickBoundaries(api, true);
    api.setPreview(null);
    if (!areas?.length) return;
    addMany(
      api,
      'HATCH',
      areas.map((loops) =>
        make<HatchEntity>(api, {
          type: 'hatch',
          loops,
          pattern: { type: hatchDefaults.type, name: hatchDefaults.type === 'solid' ? 'SOLID' : hatchDefaults.pattern, angle: hatchDefaults.angle, scale: hatchDefaults.scale, spacing: 5, double: false },
          origin: { x: 0, y: 0 },
          islandStyle,
        }),
      ),
    );
  },
};

const BOUNDARY: CommandDef = {
  name: 'BOUNDARY',
  aliases: ['BO', 'CONTORNO', 'BPOLY'],
  category: 'draw',
  label: L('Contorno', 'Boundary'),
  description: L('Crea polilíneas o regiones cerradas a partir de un área delimitada por objetos.', 'Creates closed polylines or regions from an area enclosed by objects.'),
  icon: 'boundary',
  async run(api) {
    const type = await api.getKeyword({ prompt: L('Tipo de objeto', 'Object type'), keywords: [K('Polyline', 'Polilínea', 'Polyline', ['p']), K('Region', 'Región', 'Region', ['r'])], defaultValue: 'Polyline' });
    if (type.kind !== 'keyword') return;
    const areas = await pickBoundaries(api, false);
    api.setPreview(null);
    if (!areas?.length) return;
    const ents: Entity[] = [];
    for (const loops of areas) {
      if (type.key === 'Region') ents.push(make<RegionEntity>(api, { type: 'region', loops }));
      else for (const l of loops) ents.push(make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: l.vertices, closed: true }));
    }
    addMany(api, 'BOUNDARY', ents);
    api.info(L(`BOUNDARY creó ${ents.length} objeto(s).`, `BOUNDARY created ${ents.length} object(s).`));
  },
};

const REGION: CommandDef = {
  name: 'REGION',
  aliases: ['REG', 'REGION'],
  category: 'draw',
  label: L('Región', 'Region'),
  description: L('Convierte objetos cerrados en regiones 2D.', 'Converts closed objects into 2D regions.'),
  icon: 'region',
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe objetos cerrados', 'Select closed objects'), types: ['lwpolyline', 'circle', 'ellipse', 'spline', 'polyline2d'] });
    let n = 0;
    api.apply('REGION', (tx) => {
      for (const id of ids) {
        const e = api.editor.doc.entity(id)!;
        const loop = closedLoopOf(api, e);
        if (!loop) continue;
        const { id: _i, order: _o, ...rest } = make<RegionEntity>(api, { type: 'region', loops: [loop], layer: e.layer, color: e.color });
        tx.addEntity(rest as never);
        tx.removeEntity(id);
        n++;
      }
    });
    api.info(L(`${n} región(es) creada(s); ${ids.length - n} objeto(s) no cerrado(s) omitido(s).`, `${n} region(s) created; ${ids.length - n} non-closed object(s) skipped.`));
  },
};

const DONUT: CommandDef = {
  name: 'DONUT',
  aliases: ['DO', 'ARANDELA'],
  category: 'draw',
  label: L('Arandela', 'Donut'),
  description: L('Crea anillos rellenos como polilíneas con grosor.', 'Creates filled rings as width polylines.'),
  icon: 'donut',
  async run(api) {
    const inner = await api.getDistance({ prompt: L('Diámetro interior', 'Inside diameter'), defaultValue: 5, allowZero: true });
    if (inner.kind !== 'value') return;
    const outer = await api.getDistance({ prompt: L('Diámetro exterior', 'Outside diameter'), defaultValue: 10 });
    if (outer.kind !== 'value') return;
    if (outer.value <= inner.value) fail('El diámetro exterior debe ser mayor que el interior.', 'Outside diameter must exceed inside diameter.');
    const w = (outer.value - inner.value) / 2;
    const rMid = (outer.value + inner.value) / 4;
    const donut = (c: Vec2) => make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: [{ x: c.x - rMid, y: c.y, bulge: 1 }, { x: c.x + rMid, y: c.y, bulge: 1 }], closed: true, constantWidth: w });
    for (;;) {
      const c = await api.getPoint({ prompt: L('Precise el centro', 'Specify center'), allowNone: true, preview: (p) => ({ entities: [donut(p)] }) });
      if (c.kind !== 'point') return;
      addEntity<LwPolylineEntity>(api, 'DONUT', { ...donut(c.p), id: undefined, order: undefined } as never);
    }
  },
};

export const DRAW_COMMANDS: CommandDef[] = [LINE, PLINE, CIRCLE, ARC, RECTANG, POLYGON, ELLIPSE, SPLINE, POINT, RAY, XLINE, REVCLOUD, DIVIDE, MEASURE, TEXT, MTEXT, MLEADER, TABLE, MLINE, WIPEOUT, HATCH, BOUNDARY, REGION, DONUT];
