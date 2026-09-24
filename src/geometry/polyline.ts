import { TAU } from './angle';
import type { ArcCurve, Curve, LineCurve } from './curves';
import { curveEnd, curveLength, curvePoint, curveStart, tessellateCurve } from './curves';
import { TOL } from './tolerance';
import type { Vec2 } from './vec';
import { dist, mid, samePoint } from './vec';

/** Vértice de polilínea ligera: `bulge` = tan(ángulo incluido / 4), positivo CCW. */
export interface PolyVertex {
  x: number;
  y: number;
  bulge?: number;
  startWidth?: number;
  endWidth?: number;
}

/** Arco definido por dos puntos y bulge. */
export function bulgeToArc(p1: Vec2, p2: Vec2, bulge: number): ArcCurve {
  const chord = dist(p1, p2);
  const theta = 4 * Math.atan(bulge); // ángulo incluido con signo
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const { x: mx, y: my } = mid(p1, p2);
  const sagittaDist = r * Math.cos(Math.abs(theta) / 2); // distancia del centro a la cuerda
  const dx = (p2.x - p1.x) / chord;
  const dy = (p2.y - p1.y) / chord;
  // centro a la izquierda de la cuerda para bulge>0 cuando |θ|<π
  const sign = bulge > 0 ? 1 : -1;
  const cx = mx - dy * sagittaDist * sign;
  const cy = my + dx * sagittaDist * sign;
  const a0 = Math.atan2(p1.y - cy, p1.x - cx);
  return { kind: 'arc', c: { x: cx, y: cy }, r, a0, sweep: theta };
}

/** bulge a partir de un arco con barrido con signo. */
export function sweepToBulge(sweep: number): number {
  return Math.tan(sweep / 4);
}

export function arcToBulge(arc: ArcCurve): { p1: Vec2; p2: Vec2; bulge: number } {
  return { p1: curveStart(arc), p2: curveEnd(arc), bulge: sweepToBulge(arc.sweep) };
}

export function polylineSegments(vertices: readonly PolyVertex[], closed: boolean): Curve[] {
  const out: Curve[] = [];
  const n = vertices.length;
  if (n < 2) return out;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    out.push(segmentFromVertices(a, b));
  }
  return out;
}

export function segmentFromVertices(a: PolyVertex, b: PolyVertex): LineCurve | ArcCurve {
  const bulge = a.bulge ?? 0;
  if (Math.abs(bulge) > 1e-12 && dist(a, b) > TOL.LINEAR) return bulgeToArc(a, b, bulge);
  return { kind: 'line', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
}

/** Convierte una cadena de líneas y arcos contiguos en vértices de polilínea. */
export function curvesToVertices(curves: readonly Curve[], tol: number = TOL.LINEAR): { vertices: PolyVertex[]; closed: boolean } {
  const vertices: PolyVertex[] = [];
  for (const c of curves) {
    const s = curveStart(c);
    let bulge = 0;
    if (c.kind === 'arc') bulge = Math.abs(c.sweep) >= TAU - 1e-9 ? 0 : sweepToBulge(c.sweep);
    const last = vertices[vertices.length - 1];
    if (last && samePoint(last, s, tol)) last.bulge = bulge;
    else vertices.push({ x: s.x, y: s.y, bulge });
    if (c.kind !== 'line' && c.kind !== 'arc') {
      // curvas no representables con bulge: se aproximan
      const pts = tessellateCurve(c, 1e-3);
      vertices[vertices.length - 1].bulge = 0;
      for (let i = 1; i < pts.length - 1; i++) vertices.push({ x: pts[i].x, y: pts[i].y, bulge: 0 });
    }
    const e = curveEnd(c);
    vertices.push({ x: e.x, y: e.y, bulge: 0 });
  }
  let closed = false;
  if (vertices.length > 2 && samePoint(vertices[0], vertices[vertices.length - 1], tol)) {
    vertices.pop();
    closed = true;
  }
  return { vertices, closed };
}

export function polylineLength(vertices: readonly PolyVertex[], closed: boolean): number {
  return polylineSegments(vertices, closed).reduce((s, c) => s + curveLength(c), 0);
}

/** Área con signo (positiva CCW), exacta para segmentos de arco. */
export function polylineSignedArea(vertices: readonly PolyVertex[]): number {
  const n = vertices.length;
  if (n < 2) return 0;
  const origin = vertices[0];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    area += ((a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y)) / 2;
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) > 1e-12) {
      const arc = bulgeToArc(a, b, bulge);
      const th = Math.abs(arc.sweep);
      const segArea = ((arc.r * arc.r) / 2) * (th - Math.sin(th));
      area += Math.sign(bulge) * segArea;
    }
  }
  return area;
}

export function pointsSignedArea(pts: readonly Vec2[]): number {
  if (pts.length < 2) return 0;
  const origin = pts[0];
  let area = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  return area / 2;
}

export function polylineCentroid(vertices: readonly PolyVertex[]): Vec2 {
  const pts = tessellatePolyline(vertices, true, 1e-4);
  if (!pts.length) return { x: 0, y: 0 };
  const origin = pts[0];
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const px = p.x - origin.x;
    const py = p.y - origin.y;
    const qx = q.x - origin.x;
    const qy = q.y - origin.y;
    const f = px * qy - qx * py;
    a += f;
    cx += (px + qx) * f;
    cy += (py + qy) * f;
  }
  if (Math.abs(a) < 1e-15) {
    const s = pts.reduce((acc, p) => ({ x: acc.x + (p.x - origin.x), y: acc.y + (p.y - origin.y) }), { x: 0, y: 0 });
    return { x: origin.x + s.x / pts.length, y: origin.y + s.y / pts.length };
  }
  return { x: origin.x + cx / (3 * a), y: origin.y + cy / (3 * a) };
}

export function tessellatePolyline(vertices: readonly PolyVertex[], closed: boolean, tol = 1e-3): Vec2[] {
  const segs = polylineSegments(vertices, closed);
  if (!segs.length) return vertices.map((v) => ({ x: v.x, y: v.y }));
  const out: Vec2[] = [];
  for (const s of segs) {
    const pts = tessellateCurve(s, tol);
    if (out.length) pts.shift();
    out.push(...pts);
  }
  if (closed && out.length > 1 && samePoint(out[0], out[out.length - 1], 1e-12)) out.pop();
  return out;
}

/** Regla par-impar sobre un contorno de puntos. */
export function pointInPolygon(p: Vec2, pts: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pointOnPolygonEdge(p: Vec2, pts: readonly Vec2[], tol: number): boolean {
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) <= tol) return true;
  }
  return false;
}

export function vertexAtParam(vertices: readonly PolyVertex[], closed: boolean, param: number): Vec2 {
  const segs = polylineSegments(vertices, closed);
  if (!segs.length) return vertices[0] ?? { x: 0, y: 0 };
  const i = Math.max(0, Math.min(segs.length - 1, Math.floor(param)));
  return curvePoint(segs[i], Math.max(0, Math.min(1, param - i)));
}
