import { polylineSignedArea } from './polyline';
import { linearTol } from './tolerance';
import { wallCenterAxis } from './wallUtilities';
import { wallFaces, type WallPath } from './walls';
import type { Vec2 } from './vec';

export type MaterialLoop = { vertices: Array<Vec2 & { bulge: number }>; closed: true };

export class WallFillError extends Error {
  readonly messageI18n: { es: string; en: string };
  constructor(readonly code: string) {
    const messages: Record<string, { es: string; en: string }> = {
      contour: { es: 'Corrige el contorno de material.', en: 'Correct the material contour.' },
      measure: { es: 'Introduce una medida positiva y representable.', en: 'Enter a positive, representable measure.' },
      limit: { es: 'Reduce la cantidad de vértices del contorno.', en: 'Reduce the contour vertex count.' },
      range: { es: 'Reduce las coordenadas o medidas extremas.', en: 'Reduce extreme coordinates or dimensions.' },
    };
    const message = messages[code] ?? messages.contour;
    super(message.en);
    this.name = 'WallFillError';
    this.messageI18n = message;
  }
}

// Bounded products of at most 500 squared coordinate differences remain finite.
const MAX_MAGNITUDE = Math.sqrt(Number.MAX_VALUE) / 32;

function ownFinitePoint(value: unknown): value is Vec2 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const x = Object.getOwnPropertyDescriptor(value, 'x')?.value;
  const y = Object.getOwnPropertyDescriptor(value, 'y')?.value;
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y);
}

function straightLoop(points: ReadonlyArray<Vec2>): MaterialLoop {
  return { closed: true, vertices: points.map(({ x, y }) => ({ x, y, bulge: 0 })) };
}

/** The two native faces bound one open band, or an outer loop and one empty room. */
export function wallFillLoops(path: WallPath): MaterialLoop[] {
  wallCenterAxis(path); // Validate the full path, faces and material topology before using the native offsets.
  const faces = wallFaces(path);
  if (!path.closed) return [straightLoop([...faces[0], ...faces[1].reverse()])];
  const loops = faces.map(straightLoop);
  return loops.sort((a, b) => Math.abs(polylineSignedArea(b.vertices)) - Math.abs(polylineSignedArea(a.vertices)));
}

type Edge = readonly [Vec2, Vec2];
function pointEdgeDistance(point: Vec2, [a, b]: Edge): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
function side(a: Vec2, b: Vec2, p: Vec2, tol: number): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const signed = (dx * (p.y - a.y) - dy * (p.x - a.x)) / Math.hypot(dx, dy);
  return signed > tol ? 1 : signed < -tol ? -1 : 0;
}
function intersects([a, b]: Edge, [c, d]: Edge, tol: number): boolean {
  const abC = side(a, b, c, tol), abD = side(a, b, d, tol);
  const cdA = side(c, d, a, tol), cdB = side(c, d, b, tol);
  return (abC * abD < 0 && cdA * cdB < 0) ||
    (abC === 0 && pointEdgeDistance(c, [a, b]) <= tol) ||
    (abD === 0 && pointEdgeDistance(d, [a, b]) <= tol) ||
    (cdA === 0 && pointEdgeDistance(a, [c, d]) <= tol) ||
    (cdB === 0 && pointEdgeDistance(b, [c, d]) <= tol);
}

/** A single straight, simple contour, including concave column outlines. */
export function polygonFillLoop(vertices: ReadonlyArray<Vec2>): MaterialLoop {
  if (!Array.isArray(vertices)) throw new WallFillError('contour');
  if (vertices.length > 500) throw new WallFillError('limit');
  if (vertices.length < 3) throw new WallFillError('contour');
  for (let i = 0; i < vertices.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(vertices, i) || !ownFinitePoint(vertices[i])) throw new WallFillError('contour');
  }
  const magnitude = vertices.reduce((max, p) => Math.max(max, Math.abs(p.x), Math.abs(p.y)), 0);
  if (magnitude > MAX_MAGNITUDE) throw new WallFillError('range');
  const tol = linearTol(magnitude);
  const edges: Edge[] = vertices.map((p, i) => [p, vertices[(i + 1) % vertices.length]]);
  if (edges.some(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) <= tol)) throw new WallFillError('contour');
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    if (j === i + 1 || (i === 0 && j === edges.length - 1)) {
      const farA = j === i + 1 ? edges[i][0] : edges[i][1];
      const farB = j === i + 1 ? edges[j][1] : edges[j][0];
      if (pointEdgeDistance(farA, edges[j]) <= tol || pointEdgeDistance(farB, edges[i]) <= tol ||
        Math.hypot(farA.x - farB.x, farA.y - farB.y) <= tol) throw new WallFillError('contour');
    } else if (intersects(edges[i], edges[j], tol)) throw new WallFillError('contour');
  }
  const loop = straightLoop(vertices);
  if (Math.abs(polylineSignedArea(loop.vertices)) <= tol * tol) throw new WallFillError('contour');
  return loop;
}

/** Two exact semicircles; the bulges survive native HATCH and DXF round trips. */
export function circleFillLoop(center: Vec2, radius: number): MaterialLoop {
  if (!ownFinitePoint(center)) throw new WallFillError('contour');
  if (!Number.isFinite(radius) || radius <= 0) throw new WallFillError('measure');
  if (Math.max(Math.abs(center.x), Math.abs(center.y), radius) > MAX_MAGNITUDE) throw new WallFillError('range');
  const tol = linearTol(Math.max(Math.abs(center.x), Math.abs(center.y), radius));
  if (radius <= tol) throw new WallFillError('measure');
  const right = center.x + radius, left = center.x - radius;
  if (!Number.isFinite(right) || !Number.isFinite(left) || right - left <= tol ||
    right === center.x || left === center.x) throw new WallFillError('measure');
  return { closed: true, vertices: [{ x: right, y: center.y, bulge: 1 }, { x: left, y: center.y, bulge: 1 }] };
}
