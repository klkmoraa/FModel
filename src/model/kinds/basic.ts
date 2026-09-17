import { angleInSweep, TAU } from '../../geometry/angle';
import { boxFromPoints } from '../../geometry/bbox';
import { arcFrom3Points } from '../../geometry/construct';
import type { ArcCurve, EllipseCurve } from '../../geometry/curves';
import { curveBBox, curveLength, curvePoint, ellipsePointAtAngle, transformCurve } from '../../geometry/curves';
import { isSimilarity } from '../../geometry/matrix';
import type { Vec2 } from '../../geometry/vec';
import { add, dist, len, mid, normalize, scale, sub } from '../../geometry/vec';
import type { ArcEntity, CircleEntity, EllipseEntity, LineEntity, PointEntity, RayEntity, XLineEntity } from '../../document/types';
import { curvesItem, strokePath } from '../graphics';
import type { EntityKind, GripDef, SnapPointDef } from '../registry';
import { registerKind } from '../registry';
import { arcOf, baseProps, circleOf, ellipseOf, tp, transformDir } from './common';

const INFINITE_BOX = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

export const pointKind: EntityKind<PointEntity> = {
  type: 'point',
  curves: () => [],
  bbox: (e) => boxFromPoints([e.position]),
  graphics: (e, ctx) => [{ k: 'point', x: e.position.x, y: e.position.y, mode: ctx.doc.settings.pointDisplay.mode, size: ctx.doc.settings.pointDisplay.size }],
  transform: (e, m) => ({ ...e, position: tp(m, e.position) }),
  snapPoints: (e) => [{ type: 'node', p: e.position }],
  grips: (e) => [{ id: 'p', p: e.position, shape: 'square' }],
  moveGrip: (e, _g, to) => ({ ...e, position: to }),
};

export const lineKind: EntityKind<LineEntity> = {
  type: 'line',
  curves: (e) => [{ kind: 'line', a: e.start, b: e.end }],
  bbox: (e) => boxFromPoints([e.start, e.end]),
  graphics: (e) => [strokePath([{ t: 'M', x: e.start.x, y: e.start.y }, { t: 'L', x: e.end.x, y: e.end.y }])],
  transform: (e, m) => ({ ...e, start: tp(m, e.start), end: tp(m, e.end) }),
  snapPoints: (e) => [
    { type: 'endpoint', p: e.start },
    { type: 'endpoint', p: e.end },
    { type: 'midpoint', p: mid(e.start, e.end) },
  ],
  grips: (e) => [
    { id: 'start', p: e.start, shape: 'square' },
    { id: 'mid', p: mid(e.start, e.end), shape: 'square' },
    { id: 'end', p: e.end, shape: 'square' },
  ],
  moveGrip: (e, g, to) => {
    if (g === 'start') return { ...e, start: to };
    if (g === 'end') return { ...e, end: to };
    const d = sub(to, mid(e.start, e.end));
    return { ...e, start: add(e.start, d), end: add(e.end, d) };
  },
  length: (e) => dist(e.start, e.end),
};

export const rayKind: EntityKind<RayEntity> = {
  type: 'ray',
  curves: (e) => [{ kind: 'ray', o: e.origin, d: e.direction }],
  bbox: () => INFINITE_BOX,
  graphics: (e) => [{ k: 'path', cmds: [], stroke: true, infinite: { o: e.origin, d: e.direction, ray: true } }],
  transform: (e, m) => ({ ...e, origin: tp(m, e.origin), direction: transformDir(m, e.direction) }),
  snapPoints: (e) => [{ type: 'endpoint', p: e.origin }],
  grips: (e) => [
    { id: 'origin', p: e.origin, shape: 'square' },
    { id: 'dir', p: add(e.origin, e.direction), shape: 'square' },
  ],
  moveGrip: (e, g, to) => {
    if (g === 'origin') return { ...e, origin: to };
    const d = normalize(sub(to, e.origin));
    return len(d) ? { ...e, direction: d } : e;
  },
};

export const xlineKind: EntityKind<XLineEntity> = {
  type: 'xline',
  curves: (e) => [{ kind: 'xline', o: e.origin, d: e.direction }],
  bbox: () => INFINITE_BOX,
  graphics: (e) => [{ k: 'path', cmds: [], stroke: true, infinite: { o: e.origin, d: e.direction, ray: false } }],
  transform: (e, m) => ({ ...e, origin: tp(m, e.origin), direction: transformDir(m, e.direction) }),
  snapPoints: (e) => [{ type: 'midpoint', p: e.origin }],
  grips: (e) => [
    { id: 'origin', p: e.origin, shape: 'square' },
    { id: 'dir+', p: add(e.origin, e.direction), shape: 'square' },
    { id: 'dir-', p: sub(e.origin, e.direction), shape: 'square' },
  ],
  moveGrip: (e, g, to) => {
    if (g === 'origin') return { ...e, origin: to };
    const d = normalize(g === 'dir+' ? sub(to, e.origin) : sub(e.origin, to));
    return len(d) ? { ...e, direction: d } : e;
  },
};

function quadrants(c: Vec2, r: number): Vec2[] {
  return [
    { x: c.x + r, y: c.y },
    { x: c.x, y: c.y + r },
    { x: c.x - r, y: c.y },
    { x: c.x, y: c.y - r },
  ];
}

function ellipseToEntity(base: ReturnType<typeof baseProps>, c: EllipseCurve): EllipseEntity {
  const full = Math.abs(c.sweep) >= TAU - 1e-9;
  let startParam = c.sweep >= 0 ? c.a0 : c.a0 + c.sweep;
  let endParam = startParam + Math.abs(c.sweep);
  if (full) {
    startParam = 0;
    endParam = TAU;
  }
  return { ...base, type: 'ellipse', center: c.c, majorAxis: c.major, ratio: Math.min(1, Math.max(1e-6, c.ratio)), startParam, endParam } as EllipseEntity;
}

export const circleKind: EntityKind<CircleEntity> = {
  type: 'circle',
  curves: (e) => [circleOf(e)],
  bbox: (e) => ({ minX: e.center.x - e.radius, minY: e.center.y - e.radius, maxX: e.center.x + e.radius, maxY: e.center.y + e.radius }),
  graphics: (e) => [curvesItem([circleOf(e)])],
  transform: (e, m, ctx) => {
    if (isSimilarity(m)) {
      const c = transformCurve(circleOf(e), m) as ArcCurve;
      return { ...e, center: c.c, radius: c.r };
    }
    void ctx;
    const ec = transformCurve({ kind: 'ellipse', c: e.center, major: { x: e.radius, y: 0 }, ratio: 1, a0: 0, sweep: TAU }, m) as EllipseCurve;
    return ellipseToEntity(baseProps(e), ec);
  },
  snapPoints: (e) => [{ type: 'center', p: e.center }, ...quadrants(e.center, e.radius).map((p): SnapPointDef => ({ type: 'quadrant', p }))],
  grips: (e) => [{ id: 'center', p: e.center, shape: 'square' }, ...quadrants(e.center, e.radius).map((p, i): GripDef => ({ id: `q${i}`, p, shape: 'square' }))],
  moveGrip: (e, g, to) => (g === 'center' ? { ...e, center: to } : { ...e, radius: Math.max(1e-9, dist(e.center, to)) }),
  length: (e) => TAU * e.radius,
  area: (e) => Math.PI * e.radius * e.radius,
};

export const arcKind: EntityKind<ArcEntity> = {
  type: 'arc',
  curves: (e) => [arcOf(e)],
  bbox: (e) => curveBBox(arcOf(e)),
  graphics: (e) => [curvesItem([arcOf(e)])],
  transform: (e, m) => {
    const c = arcOf(e);
    if (isSimilarity(m)) {
      const t = transformCurve(c, m) as ArcCurve;
      const start = t.sweep >= 0 ? t.a0 : t.a0 + t.sweep;
      return { ...e, center: t.c, radius: t.r, startAngle: start, endAngle: start + Math.abs(t.sweep) };
    }
    const ec = transformCurve({ kind: 'ellipse', c: c.c, major: { x: c.r, y: 0 }, ratio: 1, a0: c.a0, sweep: c.sweep }, m) as EllipseCurve;
    return ellipseToEntity(baseProps(e), ec);
  },
  snapPoints: (e) => {
    const c = arcOf(e);
    const pts: SnapPointDef[] = [
      { type: 'endpoint', p: curvePoint(c, 0) },
      { type: 'endpoint', p: curvePoint(c, 1) },
      { type: 'midpoint', p: curvePoint(c, 0.5) },
      { type: 'center', p: e.center },
    ];
    quadrants(e.center, e.radius).forEach((p, i) => {
      if (angleInSweep((i * Math.PI) / 2, c.a0, c.sweep)) pts.push({ type: 'quadrant', p });
    });
    return pts;
  },
  grips: (e) => {
    const c = arcOf(e);
    return [
      { id: 'center', p: e.center, shape: 'square' },
      { id: 'start', p: curvePoint(c, 0), shape: 'square' },
      { id: 'mid', p: curvePoint(c, 0.5), shape: 'square' },
      { id: 'end', p: curvePoint(c, 1), shape: 'square' },
    ];
  },
  moveGrip: (e, g, to) => {
    const c = arcOf(e);
    const s = curvePoint(c, 0);
    const m = curvePoint(c, 0.5);
    const en = curvePoint(c, 1);
    if (g === 'center') return { ...e, center: to };
    const arc = g === 'start' ? arcFrom3Points(to, m, en) : g === 'end' ? arcFrom3Points(s, m, to) : arcFrom3Points(s, to, en);
    if (!arc) return e;
    const start = arc.sweep >= 0 ? arc.a0 : arc.a0 + arc.sweep;
    return { ...e, center: arc.c, radius: arc.r, startAngle: start, endAngle: start + Math.abs(arc.sweep) };
  },
  length: (e) => curveLength(arcOf(e)),
};

export const ellipseKind: EntityKind<EllipseEntity> = {
  type: 'ellipse',
  curves: (e) => [ellipseOf(e)],
  bbox: (e) => curveBBox(ellipseOf(e)),
  graphics: (e) => [curvesItem([ellipseOf(e)])],
  transform: (e, m) => ellipseToEntity(baseProps(e), transformCurve(ellipseOf(e), m) as EllipseCurve),
  snapPoints: (e) => {
    const c = ellipseOf(e);
    const full = Math.abs(c.sweep) >= TAU - 1e-9;
    const pts: SnapPointDef[] = [{ type: 'center', p: e.center }];
    for (let i = 0; i < 4; i++) {
      const th = (i * Math.PI) / 2;
      if (full || angleInSweep(th, c.a0, c.sweep)) pts.push({ type: 'quadrant', p: ellipsePointAtAngle(c, th) });
    }
    if (!full) {
      pts.push({ type: 'endpoint', p: curvePoint(c, 0) }, { type: 'endpoint', p: curvePoint(c, 1) }, { type: 'midpoint', p: curvePoint(c, 0.5) });
    }
    return pts;
  },
  grips: (e) => {
    const c = ellipseOf(e);
    const minor = scale({ x: -e.majorAxis.y, y: e.majorAxis.x }, e.ratio);
    const g: GripDef[] = [
      { id: 'center', p: e.center, shape: 'square' },
      { id: 'major+', p: add(e.center, e.majorAxis), shape: 'square' },
      { id: 'major-', p: sub(e.center, e.majorAxis), shape: 'square' },
      { id: 'minor+', p: add(e.center, minor), shape: 'square' },
      { id: 'minor-', p: sub(e.center, minor), shape: 'square' },
    ];
    if (Math.abs(c.sweep) < TAU - 1e-9) g.push({ id: 'start', p: curvePoint(c, 0), shape: 'square' }, { id: 'end', p: curvePoint(c, 1), shape: 'square' });
    return g;
  },
  moveGrip: (e, g, to) => {
    if (g === 'center') return { ...e, center: to };
    if (g === 'major+' || g === 'major-') {
      const v = sub(to, e.center);
      const L = len(v);
      if (L < 1e-12) return e;
      const minorLen = len(e.majorAxis) * e.ratio;
      const major = g === 'major+' ? v : scale(v, -1);
      if (minorLen > L) return { ...e, majorAxis: scale(normalize({ x: -major.y, y: major.x }), minorLen), ratio: L / minorLen };
      return { ...e, majorAxis: major, ratio: minorLen / L };
    }
    if (g === 'minor+' || g === 'minor-') {
      const L = len(e.majorAxis);
      const u = normalize({ x: -e.majorAxis.y, y: e.majorAxis.x });
      const d = Math.abs((to.x - e.center.x) * u.x + (to.y - e.center.y) * u.y);
      if (d > L) return { ...e, majorAxis: scale(u, d), ratio: L / d };
      return { ...e, ratio: Math.max(1e-6, d / L) };
    }
    const c = ellipseOf(e);
    const L = len(e.majorAxis);
    const ux = e.majorAxis.x / L;
    const uy = e.majorAxis.y / L;
    const dx = to.x - e.center.x;
    const dy = to.y - e.center.y;
    const th = Math.atan2((-dx * uy + dy * ux) / (L * e.ratio), (dx * ux + dy * uy) / L);
    if (g === 'start') return { ...e, startParam: th, endParam: e.endParam };
    void c;
    return { ...e, endParam: th };
  },
  length: (e) => curveLength(ellipseOf(e)),
  area: (e) => (Math.abs(e.endParam - e.startParam) >= TAU - 1e-9 ? Math.PI * len(e.majorAxis) ** 2 * e.ratio : null),
};

export function registerBasicKinds() {
  registerKind<'point'>(pointKind);
  registerKind<'line'>(lineKind);
  registerKind<'ray'>(rayKind);
  registerKind<'xline'>(xlineKind);
  registerKind<'circle'>(circleKind);
  registerKind<'arc'>(arcKind);
  registerKind<'ellipse'>(ellipseKind);
}

