import { TAU } from '../../geometry/angle';
import {
  arcFrom3Points,
  arcStartCenterAngle,
  arcStartCenterEnd,
  arcStartEndDirection,
  arcStartEndRadius,
  circleFrom3Points,
  circlesTTR,
  regularPolygon,
} from '../../geometry/construct';
import type { ArcCurve } from '../../geometry/curves';
import { curveDerivative, curvePoint } from '../../geometry/curves';
import type { PolyVertex } from '../../geometry/polyline';
import { polylineSegments, sweepToBulge } from '../../geometry/polyline';
import { splineFromControl, splineThroughPoints } from '../../geometry/spline';
import type { Vec2 } from '../../geometry/vec';
import { add, angleOf, dist, len, mid, normalize, perp, scale, sub } from '../../geometry/vec';
import type {
  ArcEntity,
  CircleEntity,
  EllipseEntity,
  Id,
  LineEntity,
  LwPolylineEntity,
  SplineEntity,
} from '../../document/types';
import { add as addEntity, CLOSE_KW, fail, K, L, make, UNDO_KW } from '../helpers';
import type { CommandDef } from '../types';
import { arcEntityFrom, nearestCurve } from './shared';

// ============================================================================ LINE

export const LINE: CommandDef = {
  name: 'LINE',
  aliases: ['L', 'LINEA', 'LÍNEA'],
  category: 'draw',
  label: L('Línea', 'Line'),
  description: L('Crea segmentos de línea rectos encadenados.', 'Creates chained straight line segments.'),
  help: L('Designa puntos con el ratón, escribe coordenadas (x,y · @dx,dy · @d<ángulo) o una distancia en la dirección del cursor. Opciones: Deshacer, Cerrar. Intro termina.', 'Pick points, type coordinates (x,y · @dx,dy · @d<angle) or a distance along the cursor direction. Options: Undo, Close. Enter ends.'),
  icon: 'line',
  async run(api) {
    let first = await api.getPoint({ prompt: L('Precise el primer punto', 'Specify start point'), allowNone: true });
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

export const PLINE: CommandDef = {
  name: 'PLINE',
  aliases: ['PL', 'POLILINEA'],
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

export const CIRCLE: CommandDef = {
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

// ============================================================================ ARC

export const ARC: CommandDef = {
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

export const RECTANG: CommandDef = {
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

export const POLYGON: CommandDef = {
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
    addEntity<LwPolylineEntity>(api, 'POLYGON', { type: 'lwpolyline', vertices: pts.map((p) => ({ ...p, bulge: 0 })), closed: true, shape: { kind: 'polygon', sides, center: center, radius: rr.value, rotation: rot, inscribed } });
  },
};

// ============================================================================ ELLIPSE

export const ELLIPSE: CommandDef = {
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

export const SPLINE: CommandDef = {
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

// ============================================================================ DONUT

export const DONUT: CommandDef = {
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

export const CURVE_COMMANDS: CommandDef[] = [LINE, PLINE, CIRCLE, ARC, RECTANG, POLYGON, ELLIPSE, SPLINE, DONUT];
