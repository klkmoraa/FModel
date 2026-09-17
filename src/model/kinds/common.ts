import { TAU } from '../../geometry/angle';
import type { BBox } from '../../geometry/bbox';
import { emptyBox, expandBox } from '../../geometry/bbox';
import type { ArcCurve, Curve, EllipseCurve } from '../../geometry/curves';
import { curveBBox } from '../../geometry/curves';
import type { Mat2D } from '../../geometry/matrix';
import { applyToPoint, applyToVector, determinant, rotationOf, uniformScale } from '../../geometry/matrix';
import type { Vec2 } from '../../geometry/vec';
import { angleOf, normalize } from '../../geometry/vec';
import type { ArcEntity, CircleEntity, EllipseEntity, Entity } from '../../document/types';

export function curvesBBox(curves: readonly Curve[]): BBox {
  const b = emptyBox();
  for (const c of curves) expandBox(b, curveBBox(c));
  return b;
}

export function arcOf(e: ArcEntity): ArcCurve {
  let sweep = e.endAngle - e.startAngle;
  sweep = ((sweep % TAU) + TAU) % TAU;
  if (sweep <= 1e-12) sweep = TAU;
  return { kind: 'arc', c: e.center, r: e.radius, a0: e.startAngle, sweep };
}

export function circleOf(e: CircleEntity): ArcCurve {
  return { kind: 'arc', c: e.center, r: e.radius, a0: 0, sweep: TAU };
}

export function ellipseOf(e: EllipseEntity): EllipseCurve {
  let sweep = e.endParam - e.startParam;
  sweep = ((sweep % TAU) + TAU) % TAU;
  if (sweep <= 1e-12) sweep = TAU;
  return { kind: 'ellipse', c: e.center, major: e.majorAxis, ratio: e.ratio, a0: e.startParam, sweep };
}

export const tp = (m: Mat2D, p: Vec2): Vec2 => applyToPoint(m, p);

/** Ángulo transformado de una dirección. */
export function transformAngle(m: Mat2D, angle: number): number {
  return angleOf(applyToVector(m, { x: Math.cos(angle), y: Math.sin(angle) }));
}

export function transformDir(m: Mat2D, d: Vec2): Vec2 {
  return normalize(applyToVector(m, d));
}

export const mirrored = (m: Mat2D): boolean => determinant(m) < 0;
export const scaleOf = (m: Mat2D): number => uniformScale(m);
export const rotOf = (m: Mat2D): number => rotationOf(m);

/** Copia una entidad cambiando campos, preservando identidad y propiedades comunes. */
export function withProps<E extends Entity>(e: E, patch: Partial<E>): E {
  return { ...e, ...patch };
}

/** Para transformaciones no conformes: base común para crear entidades de otro tipo. */
export function baseProps(e: Entity) {
  const { id, owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, order, annotative, meta } = e;
  return { id, owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, order, annotative, meta };
}

export function rectOutline(origin: Vec2, width: number, height: number, rotation: number): Vec2[] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const pt = (x: number, y: number) => ({ x: origin.x + x * c - y * s, y: origin.y + x * s + y * c });
  return [pt(0, 0), pt(width, 0), pt(width, height), pt(0, height)];
}
