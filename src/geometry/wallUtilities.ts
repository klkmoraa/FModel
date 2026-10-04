import { TOL, linearTol } from './tolerance';
import { wallFaces } from './walls';
import type { WallPath } from './walls';
import { pointInPolygon, pointOnPolygonEdge } from './polyline';
import { cross, dist, dot, mid, sub } from './vec';
import type { Vec2 } from './vec';

export class WallUtilityError extends Error {
  readonly messageI18n: { es: string; en: string };
  constructor(readonly code: string) {
    const messages: Record<string, { es: string; en: string }> = {
      path: { es: 'Corrige el recorrido o las caras del muro.', en: 'Correct the wall path or faces.' },
      limit: { es: 'Reduce la cantidad de vértices del muro.', en: 'Reduce the wall vertex count.' },
      measure: { es: 'Introduce una distancia no negativa y un espesor positivo y finito.', en: 'Enter a finite nonnegative gap and positive thickness.' },
      side: { es: 'Elige izquierda o derecha del recorrido.', en: 'Choose the left or right side of the path.' },
      range: { es: 'Reduce las coordenadas o medidas extremas del muro.', en: 'Reduce extreme wall coordinates or dimensions.' },
      collapse: { es: 'El desplazamiento colapsa una cara o la habitación.', en: 'The offset collapses a face or room.' },
      separation: { es: 'No cabe un muro con esa distancia libre en todo el recorrido.', en: 'The clear distance cannot be maintained along the whole path.' },
    };
    const message = messages[code] ?? messages.path;
    super(message.en);
    this.name = 'WallUtilityError';
    this.messageI18n = message;
  }
}

type Segment = [Vec2, Vec2];
type Material = { rings: Vec2[][]; segments: Segment[]; samples: Vec2[] };
// Squared segment lengths and orientation cross-products stay finite when both
// coordinate differences are at most twice this bound (including subtraction).
const MAX_GEOMETRY_MAGNITUDE = Math.sqrt(Number.MAX_VALUE) / 32;
const finite = (p: unknown): p is Vec2 => {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return false;
  const x = Object.getOwnPropertyDescriptor(p, 'x');
  const y = Object.getOwnPropertyDescriptor(p, 'y');
  return typeof x?.value === 'number' && Number.isFinite(x.value) &&
    typeof y?.value === 'number' && Number.isFinite(y.value);
};
const magnitude = (points: Vec2[]) => points.reduce((n, p) => Math.max(n, Math.abs(p.x), Math.abs(p.y)), 0);
const segments = (points: Vec2[], closed: boolean): Segment[] =>
  Array.from({ length: closed ? points.length : points.length - 1 }, (_, i) => [points[i], points[(i + 1) % points.length]]);

function pointSegmentDistance(p: Vec2, [a, b]: Segment): number {
  const d = sub(b, a), len2 = dot(d, d);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), d) / len2));
  return dist(p, { x: a.x + t * d.x, y: a.y + t * d.y });
}

function orientation(a: Vec2, b: Vec2, c: Vec2, tol: number): number {
  const d = sub(b, a), w = sub(c, a);
  const signed = cross(d, w) / Math.hypot(d.x, d.y);
  return signed > tol ? 1 : signed < -tol ? -1 : 0;
}

function onSegment(p: Vec2, segment: Segment, tol: number): boolean {
  return pointSegmentDistance(p, segment) <= tol;
}

function intersect(a: Segment, b: Segment, tol: number): boolean {
  const o1 = orientation(a[0], a[1], b[0], tol), o2 = orientation(a[0], a[1], b[1], tol);
  const o3 = orientation(b[0], b[1], a[0], tol), o4 = orientation(b[0], b[1], a[1], tol);
  return (o1 * o2 < 0 && o3 * o4 < 0) ||
    (o1 === 0 && onSegment(b[0], a, tol)) || (o2 === 0 && onSegment(b[1], a, tol)) ||
    (o3 === 0 && onSegment(a[0], b, tol)) || (o4 === 0 && onSegment(a[1], b, tol));
}

function segmentDistance(a: Segment, b: Segment, tol: number): number {
  if (intersect(a, b, tol)) return 0;
  return Math.min(pointSegmentDistance(a[0], b), pointSegmentDistance(a[1], b),
    pointSegmentDistance(b[0], a), pointSegmentDistance(b[1], a));
}

function simple(points: Vec2[], closed: boolean, tol: number): boolean {
  const edges = segments(points, closed);
  if (edges.some(([a, b]) => dist(a, b) <= tol)) return false;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const adjacent = j === i + 1 || (closed && i === 0 && j === edges.length - 1);
    if (adjacent) {
      const otherA = j === i + 1 ? edges[i][0] : edges[i][1];
      const otherB = j === i + 1 ? edges[j][1] : edges[j][0];
      if (onSegment(otherA, edges[j], tol) || onSegment(otherB, edges[i], tol) || dist(otherA, otherB) <= tol) return false;
    } else if (intersect(edges[i], edges[j], tol)) return false;
  }
  return true;
}

function inside(p: Vec2, ring: Vec2[], tol: number): boolean {
  return !pointOnPolygonEdge(p, ring, tol) && pointInPolygon(p, ring);
}

function inMaterial(p: Vec2, material: Material, tol: number): boolean {
  return material.rings.reduce((insideCount, ring) => insideCount + Number(inside(p, ring, tol)), 0) % 2 === 1;
}

function validated(path: WallPath, max: number): { faces: Vec2[][]; material: Material } {
  if (!path || !Array.isArray(path.vertices)) throw new WallUtilityError('path');
  if (path.vertices.length > max) throw new WallUtilityError('limit');
  const pts = path.vertices;
  if (typeof path.closed !== 'boolean' || !['zero', 'top', 'bottom'].includes(path.justification) ||
    !Number.isFinite(path.scale) || path.scale <= TOL.LINEAR ||
    pts.length < (path.closed ? 3 : 2)) throw new WallUtilityError('path');
  for (let i = 0; i < pts.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(pts, i) || !finite(pts[i])) throw new WallUtilityError('path');
  }
  if (Math.max(magnitude(pts), path.scale) > MAX_GEOMETRY_MAGNITUDE) throw new WallUtilityError('range');
  const tol = linearTol(Math.max(magnitude(pts), path.scale));
  if (!simple(pts, path.closed, tol)) throw new WallUtilityError('path');
  let faces: Vec2[][];
  try { faces = wallFaces(path); } catch (error) {
    if (error instanceof Error && ['path', 'segment', 'reversal', 'miter', 'finite', 'collapsed-face'].includes(error.message)) throw new WallUtilityError('collapse');
    throw error;
  }
  if (faces.some(face => face.some(p => !finite(p) || Math.abs(p.x) > MAX_GEOMETRY_MAGNITUDE || Math.abs(p.y) > MAX_GEOMETRY_MAGNITUDE))) throw new WallUtilityError('range');
  if (!faces.every(face => face.every(finite) && simple(face, path.closed, tol))) throw new WallUtilityError('collapse');
  const rings = path.closed ? faces : [[...faces[0], ...faces[1].slice().reverse()]];
  if (!rings.every(ring => simple(ring, true, tol))) throw new WallUtilityError('collapse');
  if (path.closed) {
    const first = segments(rings[0], true), second = segments(rings[1], true);
    if (first.some(a => second.some(b => intersect(a, b, tol)))) throw new WallUtilityError('collapse');
    if (!inside(rings[0][0], rings[1], tol) && !inside(rings[1][0], rings[0], tol)) throw new WallUtilityError('collapse');
  }
  return { faces, material: { rings, segments: rings.flatMap(r => segments(r, true)),
    samples: segments(faces[0].map((p, i) => mid(p, faces[1][i])), path.closed).map(([a, b]) => mid(a, b)) } };
}

export function wallCenterAxis(path: WallPath): { vertices: Vec2[]; closed: boolean } {
  const { faces } = validated(path, 500);
  return { vertices: faces[0].map((p, i) => mid(p, faces[1][i])), closed: path.closed };
}

export function parallelWall(path: WallPath, clearance: number, side: 1 | -1, thickness = path.scale): WallPath {
  if (path?.vertices?.length > 200) throw new WallUtilityError('limit');
  if (!Number.isFinite(clearance) || clearance < 0 || !Number.isFinite(thickness) || thickness <= TOL.LINEAR) throw new WallUtilityError('measure');
  if (Math.max(clearance, thickness) > MAX_GEOMETRY_MAGNITUDE) throw new WallUtilityError('range');
  if (side !== 1 && side !== -1) throw new WallUtilityError('side');
  const source = validated(path, 200);
  const axis: WallPath = { vertices: source.faces[0].map((p, i) => mid(p, source.faces[1][i])), closed: path.closed,
    scale: clearance + (path.scale + thickness) / 2, justification: side === 1 ? 'bottom' : 'top' };
  if (!Number.isFinite(axis.scale) || axis.scale <= TOL.LINEAR) throw new WallUtilityError('measure');
  if (axis.scale > MAX_GEOMETRY_MAGNITUDE) throw new WallUtilityError('range');
  let offset: Vec2[][];
  try { offset = wallFaces(axis); } catch (error) {
    if (error instanceof Error && ['path', 'segment', 'reversal', 'miter', 'finite', 'collapsed-face'].includes(error.message)) throw new WallUtilityError('collapse');
    throw error;
  }
  const copy: WallPath = { vertices: (side === 1 ? offset[0] : offset[1]).map(p => ({ ...p })), closed: path.closed,
    scale: thickness, justification: 'zero' };
  const target = validated(copy, 200);
  const tol = linearTol(Math.max(magnitude(path.vertices), magnitude(copy.vertices), path.scale, thickness, clearance));
  for (const a of source.material.segments) for (const b of target.material.segments) {
    if (segmentDistance(a, b, tol) < clearance - tol) throw new WallUtilityError('separation');
  }
  if (source.material.samples.some(p => inMaterial(p, target.material, tol)) ||
      target.material.samples.some(p => inMaterial(p, source.material, tol))) throw new WallUtilityError('separation');
  if (clearance === 0) {
    for (const a of source.material.segments) for (const b of target.material.segments) {
      const o = [orientation(a[0], a[1], b[0], tol), orientation(a[0], a[1], b[1], tol)];
      const q = [orientation(b[0], b[1], a[0], tol), orientation(b[0], b[1], a[1], tol)];
      if (o[0] * o[1] < 0 && q[0] * q[1] < 0) throw new WallUtilityError('separation');
    }
  }
  return copy;
}
