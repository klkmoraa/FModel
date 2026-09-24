import type { Vec2 } from './vec';
import { linearTol } from './tolerance';

/**
 * Transformación afín 2D en el mismo orden que Canvas/SVG:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 */
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Mat2D = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export const mat = (a: number, b: number, c: number, d: number, e: number, f: number): Mat2D => ({ a, b, c, d, e, f });

export function multiply(m: Mat2D, n: Mat2D): Mat2D {
  // m ∘ n : primero n, luego m
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

/** Compone transformaciones en orden de aplicación: compose(A, B, C) aplica A, luego B, luego C. */
export function compose(...ms: Mat2D[]): Mat2D {
  let r = IDENTITY;
  for (const m of ms) r = multiply(m, r);
  return r;
}

export const translation = (dx: number, dy: number): Mat2D => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
export const scaling = (sx: number, sy: number = sx, origin?: Vec2): Mat2D =>
  origin
    ? compose(translation(-origin.x, -origin.y), { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }, translation(origin.x, origin.y))
    : { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };

export function rotation(angle: number, origin?: Vec2): Mat2D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r: Mat2D = { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
  return origin ? compose(translation(-origin.x, -origin.y), r, translation(origin.x, origin.y)) : r;
}

/** Reflexión sobre la recta que pasa por p1 y p2. */
export function reflection(p1: Vec2, p2: Vec2): Mat2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  const magnitude = Math.max(Math.abs(p1.x), Math.abs(p1.y), Math.abs(p2.x), Math.abs(p2.y));
  if (!Number.isFinite(length) || length <= linearTol(magnitude)) return IDENTITY;
  const ux = dx / length;
  const uy = dy / length;
  const a = ux * ux - uy * uy;
  const b = 2 * ux * uy;
  const r: Mat2D = { a, b, c: b, d: -a, e: 0, f: 0 };
  return compose(translation(-p1.x, -p1.y), r, translation(p1.x, p1.y));
}

export function applyToPoint(m: Mat2D, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export function applyToVector(m: Mat2D, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y, y: m.b * p.x + m.d * p.y };
}

export function determinant(m: Mat2D): number {
  return m.a * m.d - m.b * m.c;
}

export function invert(m: Mat2D): Mat2D {
  const det = determinant(m);
  if (Math.abs(det) < 1e-300) return IDENTITY;
  const id = 1 / det;
  return {
    a: m.d * id,
    b: -m.b * id,
    c: -m.c * id,
    d: m.a * id,
    e: (m.c * m.f - m.d * m.e) * id,
    f: (m.b * m.e - m.a * m.f) * id,
  };
}

/** Escala uniforme media (para radios y alturas de texto). */
export function uniformScale(m: Mat2D): number {
  return Math.sqrt(Math.abs(determinant(m)));
}

export function rotationOf(m: Mat2D): number {
  return Math.atan2(m.b, m.a);
}

export function isMirroring(m: Mat2D): boolean {
  return determinant(m) < 0;
}

/** true si la matriz conserva círculos (similaridad: rotación + escala uniforme ± espejo). */
export function isSimilarity(m: Mat2D, tol = 1e-9): boolean {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  const orth = m.a * m.c + m.b * m.d;
  return Math.abs(sx - sy) <= tol * Math.max(1, sx) && Math.abs(orth) <= tol * Math.max(1, sx * sy);
}

/** Construye la matriz de inserción de un bloque: escala → rotación → traslación, respecto a un punto base. */
export function insertMatrix(position: Vec2, sx: number, sy: number, rot: number, base: Vec2 = { x: 0, y: 0 }): Mat2D {
  return compose(translation(-base.x, -base.y), scaling(sx, sy), rotation(rot), translation(position.x, position.y));
}

export function matEquals(m: Mat2D, n: Mat2D, tol = 1e-12): boolean {
  return (
    Math.abs(m.a - n.a) <= tol &&
    Math.abs(m.b - n.b) <= tol &&
    Math.abs(m.c - n.c) <= tol &&
    Math.abs(m.d - n.d) <= tol &&
    Math.abs(m.e - n.e) <= tol &&
    Math.abs(m.f - n.f) <= tol
  );
}
