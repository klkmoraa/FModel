import type { Curve } from '../geometry/curves';
import { closestPoint } from '../geometry/curves';
import { offsetCurve, offsetPolyline, sideOfCurve } from '../geometry/offset';
import { polylineSegments } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import type { Entity, LwPolylineEntity, Polyline2dEntity } from '../document/types';
import type { EvalContext } from '../model/registry';
import { kindOf } from '../model/registry';
import { baseProps } from '../model/kinds/common';
import { curveToEntity } from './curveEdit';

export const OFFSETTABLE = ['line', 'arc', 'circle', 'ellipse', 'spline', 'lwpolyline', 'polyline2d', 'xline', 'ray'] as const;

/** Distancia del punto a la entidad (para la opción «Punto a través»). */
export function distanceToEntity(e: Entity, p: Vec2, ctx: EvalContext): number {
  let d = Infinity;
  for (const c of kindOf(e).curves(e, ctx)) d = Math.min(d, dist(closestPoint(c, p), p));
  return d;
}

function nearestCurveIndex(curves: Curve[], p: Vec2): number {
  let best = 0;
  let bd = Infinity;
  curves.forEach((c, i) => {
    const d = dist(closestPoint(c, p), p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/**
 * Desfase de una entidad hacia el lado de `side`. Devuelve entidades nuevas (sin id).
 * Líneas, arcos y círculos se desplazan exactamente; elipses y splines se aproximan
 * con una spline de ajuste (como AutoCAD); polilíneas usan el algoritmo con limpieza de lazos.
 */
export function offsetEntity(e: Entity, distance: number, side: Vec2, ctx: EvalContext): Entity[] {
  if (distance <= 0) return [];
  if (e.type === 'lwpolyline' || e.type === 'polyline2d') {
    const verts = e.vertices;
    const segs = polylineSegments(verts, e.closed);
    const i = nearestCurveIndex(segs, side);
    const s = sideOfCurve(segs[i], side);
    const res = offsetPolyline(verts, e.closed, s * distance);
    return res
      .filter((r) => r.vertices.length >= 2)
      .map((r) => ({ ...baseProps(e), id: '', type: 'lwpolyline', vertices: r.vertices, closed: r.closed, constantWidth: (e as LwPolylineEntity).constantWidth }) as LwPolylineEntity)
      .map((p) => (e.type === 'polyline2d' && (e as Polyline2dEntity).smoothing !== 'none' ? ({ ...p, type: 'polyline2d', smoothing: (e as Polyline2dEntity).smoothing } as unknown as Entity) : p));
  }
  const curves = kindOf(e).curves(e, ctx);
  if (!curves.length) return [];
  const c = curves[nearestCurveIndex(curves, side)];
  const s = sideOfCurve(c, side);
  const off = offsetCurve(c, s * distance);
  if (!off) return [];
  return [curveToEntity(e, off, false)];
}
