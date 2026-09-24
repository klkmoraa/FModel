import type { Mat2D } from './matrix';
import { applyToPoint } from './matrix';
import type { Vec2 } from './vec';
import { mid } from './vec';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const emptyBox = (): BBox => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

export const isEmptyBox = (b: BBox): boolean => !(b.minX <= b.maxX && b.minY <= b.maxY);

export function boxFromPoints(points: readonly Vec2[]): BBox {
  const b = emptyBox();
  for (const p of points) expandPoint(b, p);
  return b;
}

export function boxFromCorners(a: Vec2, c: Vec2): BBox {
  return {
    minX: Math.min(a.x, c.x),
    minY: Math.min(a.y, c.y),
    maxX: Math.max(a.x, c.x),
    maxY: Math.max(a.y, c.y),
  };
}

export function expandPoint(b: BBox, p: Vec2): BBox {
  if (p.x < b.minX) b.minX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y > b.maxY) b.maxY = p.y;
  return b;
}

export function expandBox(b: BBox, o: BBox): BBox {
  if (isEmptyBox(o)) return b;
  if (o.minX < b.minX) b.minX = o.minX;
  if (o.minY < b.minY) b.minY = o.minY;
  if (o.maxX > b.maxX) b.maxX = o.maxX;
  if (o.maxY > b.maxY) b.maxY = o.maxY;
  return b;
}

export const unionBoxes = (boxes: Iterable<BBox>): BBox => {
  const b = emptyBox();
  for (const o of boxes) expandBox(b, o);
  return b;
};

export function inflate(b: BBox, d: number): BBox {
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

export function boxesIntersect(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boxContainsBox(outer: BBox, inner: BBox): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

export function boxContainsPoint(b: BBox, p: Vec2, tol = 0): boolean {
  return p.x >= b.minX - tol && p.x <= b.maxX + tol && p.y >= b.minY - tol && p.y <= b.maxY + tol;
}

export const boxCenter = (b: BBox): Vec2 => mid({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY });
export const boxWidth = (b: BBox): number => b.maxX - b.minX;
export const boxHeight = (b: BBox): number => b.maxY - b.minY;

/** Escala para encajar un intervalo finito sin desbordar su ancho. */
export function scaleToFitSpan(min: number, max: number, available: number): number {
  const span = max - min;
  if (Number.isFinite(span)) return available / Math.max(span, 1e-9);
  return (available / 2) / Math.max(max / 2 - min / 2, 5e-10);
}

export function boxCorners(b: BBox): Vec2[] {
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
}

export function transformBox(b: BBox, m: Mat2D): BBox {
  if (isEmptyBox(b)) return emptyBox();
  return boxFromPoints(boxCorners(b).map((p) => applyToPoint(m, p)));
}
