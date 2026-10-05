import * as polygonClipping from 'polygon-clipping';
import type { Polygon } from 'polygon-clipping';
import { TOL, linearTol } from './tolerance';
import { circleFillLoop, polygonFillLoop, wallFillLoops } from './wallFill';
import { wallFaces, type WallPath } from './walls';
import type { Vec2 } from './vec';

export type CleanupWall = { key: string; path: WallPath; startCap: boolean; endCap: boolean };
export type CleanupColumn = { kind: 'polygon'; vertices: Vec2[] } | { kind: 'circle'; center: Vec2; radius: number };
export type CleanupSegment = { sourceKey: string; start: Vec2; end: Vec2 };
export class WallCleanupError extends Error {
  readonly messageI18n: { es: string; en: string };
  constructor(readonly code: string) {
    const messages: Record<string, { es: string; en: string }> = {
      path: { es: 'Corrige los fragmentos y las caras del muro.', en: 'Correct the wall fragments and faces.' },
      column: { es: 'Corrige el contorno o la medida de la columna.', en: 'Correct the column contour or dimension.' },
      limit: { es: 'Reduce la selección o la complejidad de los encuentros.', en: 'Reduce the selection or junction complexity.' },
      range: { es: 'Reduce las coordenadas o medidas extremas.', en: 'Reduce extreme coordinates or dimensions.' },
      empty: { es: 'La limpieza no produce caras seleccionables.', en: 'The cleanup produces no selectable faces.' },
    };
    const message = messages[code] ?? messages.path;
    super(message.en);
    this.name = 'WallCleanupError';
    this.messageI18n = message;
  }
}

const MAX_SOURCES = 100;
const MAX_POINTS = 5000;
const MAX_SEGMENTS = 10000;
const MAX_OPERATIONS = 2000000;
// Matches native wall/material validation: squared differences remain finite.
const MAX_MAGNITUDE = Math.sqrt(Number.MAX_VALUE) / 32;
type Edge = readonly [Vec2, Vec2];
type Interval = [number, number];
type Axis = { start: Vec2; end: Vec2; ux: number; uy: number; length: number };

function axis([start, end]: Edge): Axis {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0) throw new WallCleanupError('range');
  return { start, end, ux: dx / length, uy: dy / length, length };
}
function along(a: Axis, point: Vec2): number {
  return (point.x - a.start.x) * a.ux + (point.y - a.start.y) * a.uy;
}
function across(a: Axis, point: Vec2): number {
  return a.ux * (point.y - a.start.y) - a.uy * (point.x - a.start.x);
}
function pointAt(a: Axis, distance: number): Vec2 {
  // Preserve original endpoints, avoiding accumulated endpoint roundoff.
  if (distance === 0) return { ...a.start };
  if (distance === a.length) return { ...a.end };
  return { x: a.start.x + a.ux * distance, y: a.start.y + a.uy * distance };
}
function edges(vertices: readonly Vec2[], closed = true): Edge[] {
  return Array.from({ length: closed ? vertices.length : vertices.length - 1 }, (_, i) =>
    [vertices[i], vertices[(i + 1) % vertices.length]] as const);
}
function overlap(a: Axis, [start, end]: Edge, tol: number): Interval | undefined {
  if (Math.abs(across(a, start)) > tol || Math.abs(across(a, end)) > tol) return;
  const first = along(a, start), last = along(a, end);
  const lo = Math.max(0, Math.min(first, last)), hi = Math.min(a.length, Math.max(first, last));
  if (hi - lo > tol) return [lo, hi];
}
function merge(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [lo, hi] of intervals.sort((a, b) => a[0] - b[0])) {
    const previous = result[result.length - 1];
    // Never bridge even a small empty interval between native fragments.
    if (previous && lo <= previous[1]) previous[1] = Math.max(previous[1], hi);
    else result.push([lo, hi]);
  }
  return result;
}
function subtract(intervals: Interval[], removed: Interval[], tol: number): Interval[] {
  const cuts = merge(removed), result: Interval[] = [];
  for (const [lo, hi] of intervals) {
    let cursor = lo;
    for (const [first, last] of cuts) {
      if (last <= cursor || first >= hi) continue;
      if (first - cursor > tol) result.push([cursor, first]);
      cursor = Math.max(cursor, last);
      if (cursor >= hi) break;
    }
    if (hi - cursor > tol) result.push([cursor, hi]);
  }
  return result;
}

/** Exact segment/polygon cuts, including collinear column boundaries. */
function polygonCuts(a: Axis, vertices: readonly Vec2[], tol: number): Interval[] {
  const border = edges(vertices), cuts = [0, a.length];
  for (const edge of border) {
    const b = axis(edge), denominator = a.ux * b.uy - a.uy * b.ux;
    if (Math.abs(denominator) <= TOL.ANGULAR) {
      if (Math.abs(across(a, b.start)) <= tol && Math.abs(across(a, b.end)) <= tol)
        cuts.push(Math.max(0, Math.min(a.length, along(a, b.start))), Math.max(0, Math.min(a.length, along(a, b.end))));
      continue;
    }
    const dx = b.start.x - a.start.x, dy = b.start.y - a.start.y;
    const distance = (dx * b.uy - dy * b.ux) / denominator;
    const other = (dx * a.uy - dy * a.ux) / denominator;
    if (distance >= -tol && distance <= a.length + tol && other >= -tol && other <= b.length + tol)
      cuts.push(Math.max(0, Math.min(a.length, distance)));
  }
  const sorted = cuts.sort((x, y) => x - y).filter((distance, i, all) => i === 0 || distance - all[i - 1] > tol);
  const result: Interval[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1], hi = sorted[i];
    if (hi - lo <= tol) continue;
    const point = pointAt(a, lo + (hi - lo) / 2);
    let inside = false, onBorder = false;
    for (const edge of border) {
      const b = axis(edge), distance = along(b, point);
      if (Math.abs(across(b, point)) <= tol && distance >= -tol && distance <= b.length + tol) onBorder = true;
      const [first, last] = edge;
      if ((first.y > point.y) !== (last.y > point.y) &&
        point.x - first.x < (last.x - first.x) * ((point.y - first.y) / (last.y - first.y))) inside = !inside;
    }
    if (inside || onBorder) result.push([lo, hi]);
  }
  return merge(result);
}

/** Unit-direction projection avoids the cancellation of a global quadratic. */
function circleCuts(a: Axis, center: Vec2, radius: number, tol: number): Interval[] {
  const perpendicular = Math.abs(across(a, center));
  if (perpendicular >= radius) return []; // A tangent removes no positive-length interval.
  const half = Math.sqrt((radius - perpendicular) * (radius + perpendicular));
  const projection = along(a, center);
  const lo = Math.max(0, projection - half), hi = Math.min(a.length, projection + half);
  if (![half, projection, lo, hi].every(Number.isFinite)) throw new WallCleanupError('range');
  return hi - lo > tol ? [[lo, hi]] : [];
}

/** Retains the original native linework lying on the material union boundary. */
export function cleanWallFaces(walls: readonly CleanupWall[], columns: readonly CleanupColumn[]): CleanupSegment[] {
  if (!Array.isArray(walls) || !Array.isArray(columns)) throw new WallCleanupError('path');
  if (walls.length + columns.length > MAX_SOURCES) throw new WallCleanupError('limit');
  if (walls.length === 0) throw new WallCleanupError('empty');
  let points = 0, candidateCount = 0, materialEdges = 0, columnWork = 0, validationPairs = 0;
  const keys = new Set<string>();
  for (const wall of walls) {
    if (!wall || typeof wall.key !== 'string' || !wall.key.trim() || keys.has(wall.key) ||
      typeof wall.startCap !== 'boolean' || typeof wall.endCap !== 'boolean' || !Array.isArray(wall.path?.vertices))
      throw new WallCleanupError('path');
    keys.add(wall.key);
    const n = wall.path.vertices.length;
    points += n;
    materialEdges += 2 * n;
    candidateCount += 2 * (wall.path.closed ? n : n - 1) +
      (wall.path.closed ? 0 : Number(wall.startCap) + Number(wall.endCap));
    validationPairs += (2 * n) ** 2;
  }
  for (const column of columns) {
    if (!column || !['circle', 'polygon'].includes(column.kind)) throw new WallCleanupError('column');
    if (column.kind === 'polygon') {
      if (!Array.isArray(column.vertices)) throw new WallCleanupError('column');
      points += column.vertices.length;
      columnWork += column.vertices.length * (column.vertices.length + 2);
      validationPairs += column.vertices.length ** 2;
    } else { points++; columnWork++; }
  }
  // Bound native contour validation, union edge pairs and candidate/border work
  // before either native topology checks or polygon clipping is invoked.
  const preflight = validationPairs + materialEdges * (materialEdges - 1) / 2 +
    candidateCount * (materialEdges + columnWork);
  if (points > MAX_POINTS || candidateCount > MAX_SEGMENTS || preflight > MAX_OPERATIONS)
    throw new WallCleanupError('limit');

  let operations = validationPairs + materialEdges * (materialEdges - 1) / 2 + candidateCount * columnWork;
  const reserve = (count: number) => {
    if (!Number.isFinite(count) || operations + count > MAX_OPERATIONS) throw new WallCleanupError('limit');
    operations += count;
  };
  const checkPoint = (point: Vec2) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      Math.max(Math.abs(point.x), Math.abs(point.y)) > MAX_MAGNITUDE) throw new WallCleanupError('range');
  };
  const candidates: CleanupSegment[] = [], polygons: Polygon[] = [];
  let magnitude = 0;
  // Sort without locale-dependent comparison: coincident faces inherit the
  // lexicographically first source, regardless of selection order.
  const ordered = [...walls].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  for (const wall of ordered) {
    let loops;
    try { loops = wallFillLoops(wall.path); } catch { throw new WallCleanupError('path'); }
    polygons.push(loops.map(loop => loop.vertices.map(({ x, y }) => [x, y])));
    const faces = wallFaces(wall.path);
    const own = faces.flatMap(face => edges(face, wall.path.closed));
    if (!wall.path.closed) {
      if (wall.startCap) own.push([faces[0][0], faces[1][0]]);
      if (wall.endCap) own.push([faces[0].at(-1)!, faces[1].at(-1)!]);
    }
    for (const face of faces) for (const point of face) {
      checkPoint(point);
      magnitude = Math.max(magnitude, Math.abs(point.x), Math.abs(point.y));
    }
    for (const [start, end] of own) candidates.push({ sourceKey: wall.key, start, end });
  }
  const validatedColumns: CleanupColumn[] = columns.map(column => {
    try {
      if (column.kind === 'polygon') {
        const vertices = polygonFillLoop(column.vertices).vertices.map(({ x, y }) => ({ x, y }));
        for (const point of vertices) magnitude = Math.max(magnitude, Math.abs(point.x), Math.abs(point.y));
        return { kind: 'polygon', vertices };
      }
      circleFillLoop(column.center, column.radius);
      magnitude = Math.max(magnitude, Math.abs(column.center.x), Math.abs(column.center.y), column.radius);
      return { kind: 'circle', center: { ...column.center }, radius: column.radius };
    } catch { throw new WallCleanupError('column'); }
  });
  const tol = linearTol(magnitude);
  // Local coordinates keep polygon-clipping independent of UTM offsets.
  const origin = candidates[0].start;
  const local = polygons.map(polygon => polygon.map(ring => ring.map(([x, y]) => [x - origin.x, y - origin.y] as [number, number])));
  let union;
  try { union = polygonClipping.union(local[0], ...local.slice(1)); }
  catch { throw new WallCleanupError('path'); }
  const boundary: Edge[] = [];
  for (const polygon of union) for (const ring of polygon) {
    for (let i = 1; i < ring.length; i++) {
      const start = { x: ring[i - 1][0] + origin.x, y: ring[i - 1][1] + origin.y };
      const end = { x: ring[i][0] + origin.x, y: ring[i][1] + origin.y };
      checkPoint(start); checkPoint(end);
      if (Math.hypot(end.x - start.x, end.y - start.y) > tol) boundary.push([start, end]);
    }
  }
  // Union intersections can increase the edge count; reject that candidate
  // product before scanning the boundary rather than discovering it mid-scan.
  reserve(candidates.length * boundary.length);
  const result: CleanupSegment[] = [];
  for (const candidate of candidates) {
    const a = axis([candidate.start, candidate.end]);
    let kept = merge(boundary.flatMap(edge => {
      const interval = overlap(a, edge, tol);
      return interval ? [interval] : [];
    }));
    if (!kept.length) continue;
    for (const column of validatedColumns) {
      const removed = column.kind === 'polygon' ? polygonCuts(a, column.vertices, tol) : circleCuts(a, column.center, column.radius, tol);
      kept = subtract(kept, removed, tol);
      if (!kept.length) break;
    }
    if (!kept.length) continue;
    reserve(result.length);
    const duplicates = result.flatMap(segment => {
      const interval = overlap(a, [segment.start, segment.end], tol);
      return interval ? [interval] : [];
    });
    kept = subtract(kept, duplicates, tol);
    if (result.length + kept.length > MAX_SEGMENTS) throw new WallCleanupError('limit');
    for (const [lo, hi] of kept) {
      const start = pointAt(a, lo), end = pointAt(a, hi);
      checkPoint(start); checkPoint(end);
      if (Math.hypot(end.x - start.x, end.y - start.y) <= tol) continue;
      result.push({ sourceKey: candidate.sourceKey, start, end });
    }
  }
  if (!result.length) throw new WallCleanupError('empty');
  return result;
}
