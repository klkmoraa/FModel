import { linearTol, TOL } from './tolerance';

export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const perpCW = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });
const midpointCoordinate = (a: number, b: number): number => {
  const delta = b - a;
  return Number.isFinite(delta) ? a + delta / 2 : a / 2 + b / 2;
};
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: midpointCoordinate(a.x, b.x), y: midpointCoordinate(a.y, b.y) });
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const angleBetweenPoints = (from: Vec2, to: Vec2): number => Math.atan2(to.y - from.y, to.x - from.x);
export const polar = (origin: Vec2, angle: number, distance: number): Vec2 => ({
  x: origin.x + Math.cos(angle) * distance,
  y: origin.y + Math.sin(angle) * distance,
});
export const fromAngle = (angle: number, length = 1): Vec2 => ({
  x: Math.cos(angle) * length,
  y: Math.sin(angle) * length,
});

export function normalize(a: Vec2): Vec2 {
  const magnitude = Math.max(Math.abs(a.x), Math.abs(a.y));
  if (magnitude === 0) return { x: 0, y: 0 };
  const x = a.x / magnitude;
  const y = a.y / magnitude;
  const scaledLength = Math.hypot(x, y);
  return magnitude * scaledLength <= TOL.LINEAR ? { x: 0, y: 0 } : { x: x / scaledLength, y: y / scaledLength };
}

export function samePoint(a: Vec2, b: Vec2, tol: number = TOL.LINEAR): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

export function rotate(p: Vec2, angle: number, origin: Vec2 = ZERO): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

/** Refleja `p` sobre la recta que pasa por `a` y `b`. */
export function mirrorPoint(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const axis = sub(b, a);
  const axisLength = len(axis);
  const magnitude = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
  if (!Number.isFinite(axisLength) || axisLength <= linearTol(magnitude)) return clone(p);
  const d = scale(axis, 1 / axisLength);
  const ap = sub(p, a);
  const proj = scale(d, dot(ap, d));
  const foot = add(a, proj);
  return sub(scale(foot, 2), p);
}

export function isFiniteVec(p: Vec2 | undefined | null): p is Vec2 {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export const clone = (p: Vec2): Vec2 => ({ x: p.x, y: p.y });
