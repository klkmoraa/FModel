import { TOL, linearTol } from './tolerance';
import { add, sub, scale, dot, perp, dist, mid } from './vec';
import type { Vec2 } from './vec';

export type WallJustification = 'zero' | 'top' | 'bottom';
export interface WallPath { vertices: Vec2[]; closed: boolean; scale: number; justification: WallJustification }
const finite = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.y);
export const WALL_MITER_LIMIT = 8;
export function wallOffsets(w: WallPath): number[] {
  const shift = w.justification === 'top' ? -0.5 : w.justification === 'bottom' ? 0.5 : 0;
  return [0.5 + shift, -0.5 + shift].map(v => v * w.scale);
}
/** The same miter construction as native MLINE, validated before preview or commit. */
export function wallFaces(w: WallPath): Vec2[][] {
  if (!Number.isFinite(w.scale) || w.scale <= TOL.LINEAR || w.vertices.length < (w.closed ? 3 : 2) || !w.vertices.every(finite)) throw new Error('path');
  const pts = w.vertices, n = pts.length, count = w.closed ? n : n - 1;
  const tol = linearTol(pts.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y)), w.scale));
  const dirs = Array.from({ length: count }, (_, i) => {
    const d = sub(pts[(i + 1) % n], pts[i]), len = Math.hypot(d.x, d.y);
    if (len <= tol) throw new Error('segment');
    return scale(d, 1 / len);
  });
  const miters = pts.map((_, i) => {
    const prev = w.closed ? dirs[(i - 1 + count) % count] : dirs[i - 1];
    const next = w.closed ? dirs[i % count] : dirs[i];
    if (!prev) return perp(next);
    if (!next) return perp(prev);
    const sum = add(perp(prev), perp(next)), len = Math.hypot(sum.x, sum.y);
    if (len <= TOL.ANGULAR) throw new Error('reversal');
    const m = scale(sum, 1 / len), c = dot(m, perp(next));
    if (c <= 1 / WALL_MITER_LIMIT) throw new Error('miter');
    return scale(m, 1 / c);
  });
  const faces = wallOffsets(w).map(offset => pts.map((p, i) => add(p, scale(miters[i], offset))));
  for (const face of faces) {
    if (!face.every(finite)) throw new Error('finite');
    for (let i = 0; i < count; i++) if (dot(sub(face[(i + 1) % n], face[i]), dirs[i]) <= tol) throw new Error('collapsed-face');
  }
  return faces;
}
export interface WallOpening { paths: Vec2[][]; start: Vec2; end: Vec2; direction: Vec2; normal: Vec2; width: number; segment: number }
/** Pick the nearest straight segment; never clamp an opening into its bounds. */
export function wallOpening(w: WallPath, pick: Vec2, width: number): WallOpening {
  const faces = wallFaces(w);
  if (!finite(pick) || !Number.isFinite(width) || width <= TOL.LINEAR) throw new Error('width');
  const pts = w.vertices, count = w.closed ? pts.length : pts.length - 1;
  let nearest = Infinity, segment = 0, t = 0;
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], d = sub(b, a), len = dist(a, b);
    const projection = dot(sub(pick, a), scale(d, 1 / len));
    const axisA = mid(faces[0][i], faces[1][i]), axisB = mid(faces[0][(i + 1) % pts.length], faces[1][(i + 1) % pts.length]);
    const axisLength = dist(axisA, axisB), axisDirection = scale(sub(axisB, axisA), 1 / axisLength);
    const axisProjection = dot(sub(pick, axisA), axisDirection);
    const q = add(axisA, scale(axisDirection, Math.max(0, Math.min(axisLength, axisProjection))));
    const distance = dist(pick, q);
    if (distance < nearest) { nearest = distance; segment = i; t = projection; }
  }
  const a = pts[segment], b = pts[(segment + 1) % pts.length], length = dist(a, b), direction = scale(sub(b, a), 1 / length);
  const lo = t - width / 2, hi = t + width / 2;
  const tol = linearTol(Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), w.scale));
  const firstLimit = Math.max(0, ...faces.map(f => dot(sub(f[segment], a), direction)));
  const lastLimit = Math.min(length, ...faces.map(f => dot(sub(f[(segment + 1) % pts.length], a), direction)));
  if (lo <= firstLimit + tol || hi >= lastLimit - tol) throw new Error('corner');
  const start = add(a, scale(direction, lo)), end = add(a, scale(direction, hi));
  const paths = w.closed
    ? [[end, ...Array.from({ length: pts.length }, (_, i) => pts[(segment + 1 + i) % pts.length]), start]]
    : [[...pts.slice(0, segment + 1), start], [end, ...pts.slice(segment + 1)]];
  for (const vertices of paths) wallFaces({ ...w, vertices, closed: false });
  return { paths, start, end, direction, normal: perp(direction), width, segment };
}
