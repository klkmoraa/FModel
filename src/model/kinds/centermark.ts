import { boxFromPoints } from '../../geometry/bbox';
import type { Curve } from '../../geometry/curves';
import type { Vec2 } from '../../geometry/vec';
import { add, len, mid, perp, scale, sub } from '../../geometry/vec';
import type { CenterMarkEntity } from '../../document/types';
import { strokePath } from '../graphics';
import type { EntityKind, SnapPointDef } from '../registry';
import { registerKind } from '../registry';
import { scaleOf, tp, transformAngle } from './common';
import { explodeSegments } from './polylines';

/** Segmentos visibles de una marca o eje de centro. */
export function centerMarkSegments(e: CenterMarkEntity): [Vec2, Vec2][] {
  if (e.mode === 'line') {
    const end = e.end ?? e.center;
    const d = sub(end, e.center);
    const l = len(d);
    if (!(l > 1e-12)) return [];
    const u = scale(d, 1 / l);
    return [[sub(e.center, scale(u, e.extension)), add(end, scale(u, e.extension))]];
  }
  const u = { x: Math.cos(e.rotation), y: Math.sin(e.rotation) };
  const v = perp(u);
  const c = e.center;
  const cs = e.crossSize * e.radius;
  const gap = e.crossGap * e.radius;
  const reach = e.radius + e.extension;
  const segs: [Vec2, Vec2][] = [];
  if (cs > 0) segs.push([sub(c, scale(u, cs)), add(c, scale(u, cs))], [sub(c, scale(v, cs)), add(c, scale(v, cs))]);
  if (reach > cs + gap) for (const dir of [u, scale(u, -1), v, scale(v, -1)]) segs.push([add(c, scale(dir, cs + gap)), add(c, scale(dir, reach))]);
  return segs;
}

const curvesOf = (e: CenterMarkEntity): Curve[] => centerMarkSegments(e).map(([a, b]) => ({ kind: 'line', a, b }));

export const centerMarkKind: EntityKind<CenterMarkEntity> = {
  type: 'centermark',
  curves: (e) => curvesOf(e),
  bbox: (e) => boxFromPoints(centerMarkSegments(e).flat().concat([e.center])),
  // cada tramo es un subtrayecto independiente (M…L), no una polilínea continua
  graphics: (e) => [strokePath(centerMarkSegments(e).flatMap(([a, b]) => [{ t: 'M' as const, x: a.x, y: a.y }, { t: 'L' as const, x: b.x, y: b.y }]))],
  transform: (e, m) => {
    const k = scaleOf(m);
    return { ...e, center: tp(m, e.center), end: e.end ? tp(m, e.end) : undefined, rotation: transformAngle(m, e.rotation), radius: e.radius * k, extension: e.extension * k };
  },
  snapPoints: (e) => {
    const pts: SnapPointDef[] = [];
    if (e.mode === 'mark') pts.push({ type: 'center', p: e.center });
    for (const [a, b] of centerMarkSegments(e)) pts.push({ type: 'endpoint', p: a }, { type: 'endpoint', p: b });
    if (e.mode === 'line' && e.end) pts.push({ type: 'midpoint', p: mid(e.center, e.end) });
    return pts;
  },
  grips: (e) =>
    e.mode === 'line' && e.end
      ? [
          { id: 'start', p: e.center, shape: 'square' },
          { id: 'mid', p: mid(e.center, e.end), shape: 'square' },
          { id: 'end', p: e.end, shape: 'square' },
        ]
      : [{ id: 'center', p: e.center, shape: 'square' }],
  moveGrip: (e, g, to) => {
    if (g === 'start') return { ...e, center: to };
    if (g === 'end') return { ...e, end: to };
    const ref = g === 'mid' && e.end ? mid(e.center, e.end) : e.center;
    const d = sub(to, ref);
    return { ...e, center: add(e.center, d), end: e.end ? add(e.end, d) : undefined };
  },
  explode: (e) => explodeSegments(e, curvesOf(e)),
};

export function registerCenterMarkKind() {
  registerKind<'centermark'>(centerMarkKind);
}
