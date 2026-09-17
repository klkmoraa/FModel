import { TAU } from './angle';
import type { BBox } from './bbox';
import { boxesIntersect, inflate } from './bbox';
import type { ArcCurve, Curve, LineCurve } from './curves';
import { curveBBox, curveDerivative, curveEnd, curvePoint, curveStart, isBounded, subCurve, tessellateCurve } from './curves';
import { intersectCurves } from './intersect';
import type { PolyVertex } from './polyline';
import { pointInPolygon, polylineSignedArea, sweepToBulge, tessellatePolyline } from './polyline';
import type { Vec2 } from './vec';

type Edge = LineCurve | ArcCurve;

interface HalfEdge {
  id: number;
  from: number;
  to: number;
  curve: Edge;
  twin: number;
  angle: number;
  curvature: number;
  component: number;
}

export interface BoundaryResult {
  outer: PolyVertex[];
  islands: PolyVertex[][];
}

/** Normaliza curvas a líneas y arcos (elipses y splines se aproximan). */
function toEdges(curves: Curve[], tol: number): Edge[] {
  const out: Edge[] = [];
  for (const c of curves) {
    if (!isBounded(c)) continue;
    if (c.kind === 'line') out.push(c);
    else if (c.kind === 'arc') {
      if (Math.abs(c.sweep) >= TAU - 1e-9) {
        out.push({ ...c, sweep: Math.sign(c.sweep) * Math.PI });
        out.push({ ...c, a0: c.a0 + Math.sign(c.sweep) * Math.PI, sweep: Math.sign(c.sweep) * Math.PI });
      } else out.push(c);
    } else {
      const pts = tessellateCurve(c, tol);
      for (let i = 1; i < pts.length; i++) out.push({ kind: 'line', a: pts[i - 1], b: pts[i] });
    }
  }
  return out;
}

function edgeLength(e: Edge): number {
  return e.kind === 'line' ? Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) : Math.abs(e.sweep) * e.r;
}

/**
 * Detecta el contorno cerrado más pequeño que rodea `pick` a partir de un conjunto
 * de curvas, con islas (componentes contenidos). Tolerancia `tol` en unidades de dibujo.
 */
export function detectBoundary(curves: Curve[], pick: Vec2, tol = 1e-6): BoundaryResult | null {
  const edges = toEdges(curves, Math.max(tol * 10, 1e-4));
  if (!edges.length) return null;
  const n = edges.length;
  const boxes: BBox[] = edges.map((e) => inflate(curveBBox(e), tol));
  const cuts: number[][] = edges.map(() => [0, 1]);
  // barrido por X para podar pares
  const order = edges.map((_, i) => i).sort((a, b) => boxes[a].minX - boxes[b].minX);
  for (let ii = 0; ii < n; ii++) {
    const i = order[ii];
    for (let jj = ii + 1; jj < n; jj++) {
      const j = order[jj];
      if (boxes[j].minX > boxes[i].maxX) break;
      if (!boxesIntersect(boxes[i], boxes[j])) continue;
      for (const h of intersectCurves(edges[i], edges[j], { tol })) {
        cuts[i].push(h.t1);
        cuts[j].push(h.t2);
      }
    }
  }
  // vértices con fusión por rejilla
  const verts: Vec2[] = [];
  const grid = new Map<string, number[]>();
  const cell = Math.max(tol * 20, 1e-9);
  const vertexId = (p: Vec2): number => {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (Math.abs(verts[id].x - p.x) <= cell && Math.abs(verts[id].y - p.y) <= cell) return id;
        }
      }
    }
    const id = verts.length;
    verts.push(p);
    const key = `${gx},${gy}`;
    const list = grid.get(key);
    if (list) list.push(id);
    else grid.set(key, [id]);
    return id;
  };
  const half: HalfEdge[] = [];
  const outgoing = new Map<number, number[]>();
  const addHalf = (curve: Edge, from: number, to: number): number => {
    const d0 = curveDerivative(curve, 0);
    let curvature = 0;
    if (curve.kind === 'arc') curvature = (curve.sweep >= 0 ? 1 : -1) / curve.r;
    const h: HalfEdge = { id: half.length, from, to, curve, twin: -1, angle: Math.atan2(d0.y, d0.x), curvature, component: -1 };
    half.push(h);
    const list = outgoing.get(from);
    if (list) list.push(h.id);
    else outgoing.set(from, [h.id]);
    return h.id;
  };
  const reverse = (e: Edge): Edge => (e.kind === 'line' ? { kind: 'line', a: e.b, b: e.a } : { ...e, a0: e.a0 + e.sweep, sweep: -e.sweep });
  edges.forEach((e, i) => {
    const ts = [...new Set(cuts[i].map((t) => Math.min(1, Math.max(0, t))))].sort((a, b) => a - b);
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < 1e-12) continue;
      const piece = subCurve(e, ts[k - 1], ts[k]) as Edge;
      if (edgeLength(piece) <= tol) continue;
      const a = vertexId(curveStart(piece));
      const b = vertexId(curveEnd(piece));
      if (a === b && piece.kind === 'line') continue;
      const h1 = addHalf(piece, a, b);
      const h2 = addHalf(reverse(piece), b, a);
      half[h1].twin = h2;
      half[h2].twin = h1;
    }
  });
  if (!half.length) return null;
  // ordenar salientes CCW por ángulo (desempate por curvatura)
  for (const [, list] of outgoing) {
    list.sort((a, b) => {
      const d = half[a].angle - half[b].angle;
      if (Math.abs(d) > 1e-9) return d;
      return half[a].curvature - half[b].curvature;
    });
  }
  // componentes conexas
  let comp = 0;
  for (const h of half) {
    if (h.component >= 0) continue;
    const stack = [h.from];
    const seen = new Set<number>();
    while (stack.length) {
      const v = stack.pop()!;
      if (seen.has(v)) continue;
      seen.add(v);
      for (const hid of outgoing.get(v) ?? []) {
        half[hid].component = comp;
        half[half[hid].twin].component = comp;
        stack.push(half[hid].to);
      }
    }
    comp++;
  }

  const nextInFace = (hid: number): number => {
    const h = half[hid];
    const list = outgoing.get(h.to)!;
    const twin = h.twin;
    const idx = list.indexOf(twin);
    // la siguiente arista de la cara izquierda es la anterior en orden CCW alrededor del vértice
    return list[(idx - 1 + list.length) % list.length];
  };

  const traceFace = (start: number): number[] | null => {
    const loop: number[] = [];
    let cur = start;
    for (let guard = 0; guard < half.length + 2; guard++) {
      loop.push(cur);
      cur = nextInFace(cur);
      if (cur === start) return loop;
    }
    return null;
  };

  const loopVertices = (loop: number[]): PolyVertex[] =>
    loop.map((hid) => {
      const h = half[hid];
      const s = curveStart(h.curve);
      return { x: s.x, y: s.y, bulge: h.curve.kind === 'arc' ? sweepToBulge(h.curve.sweep) : 0 };
    });

  const excluded = new Set<number>();
  const skippedComponents = new Set<number>();
  for (let attempt = 0; attempt < comp + 1; attempt++) {
    // rayo horizontal hacia +X: arista más cercana
    const ray: LineCurve = { kind: 'line', a: pick, b: { x: pick.x + 1e12, y: pick.y + 1e-7 } };
    let best: { hid: number; t: number } | null = null;
    for (const h of half) {
      if (excluded.has(h.component) || h.id > h.twin) continue;
      const bb = curveBBox(h.curve);
      if (bb.maxX < pick.x || bb.minY > pick.y + tol || bb.maxY < pick.y - tol) continue;
      for (const hit of intersectCurves(ray, h.curve, { tol: 1e-12 })) {
        if (hit.t1 <= 0) continue;
        if (!best || hit.t1 < best.t) {
          // orientar para que el punto quede a la izquierda
          const d = curveDerivative(h.curve, hit.t2);
          const hid = d.y > 0 ? h.id : h.twin;
          best = { hid, t: hit.t1 };
        }
      }
    }
    if (!best) return null;
    const loop = traceFace(best.hid);
    if (!loop) return null;
    const verts2 = loopVertices(loop);
    const area = polylineSignedArea(verts2);
    const poly = tessellatePolyline(verts2, true, Math.max(tol, 1e-3));
    if (area > 0 && pointInPolygon(pick, poly)) {
      const outerComponent = half[best.hid].component;
      const islands: PolyVertex[][] = [];
      for (let c = 0; c < comp; c++) {
        if (c === outerComponent) continue;
        // borde exterior del componente: cara con área negativa
        const any = half.find((h) => h.component === c);
        if (!any) continue;
        const probe = curvePoint(any.curve, 0.5);
        if (!pointInPolygon(probe, poly)) continue;
        const outerFace = outerFaceOf(c);
        if (outerFace && !pointInPolygon(pick, tessellatePolyline(outerFace, true, 1e-3))) islands.push(outerFace);
      }
      void skippedComponents;
      return { outer: verts2, islands };
    }
    // se golpeó una isla desde fuera: excluir su componente y reintentar
    excluded.add(half[best.hid].component);
    skippedComponents.add(half[best.hid].component);
  }
  return null;

  function outerFaceOf(c: number): PolyVertex[] | null {
    const visited = new Set<number>();
    let bestLoop: PolyVertex[] | null = null;
    let bestArea = 0;
    for (const h of half) {
      if (h.component !== c || visited.has(h.id)) continue;
      const loop = traceFace(h.id);
      if (!loop) continue;
      loop.forEach((x) => visited.add(x));
      const vs = loopVertices(loop);
      const a = polylineSignedArea(vs);
      if (a < bestArea) {
        bestArea = a;
        bestLoop = vs;
      }
    }
    if (!bestLoop) return null;
    // devolver en sentido CCW
    return reverseVertices(bestLoop);
  }
}

export function reverseVertices(vs: PolyVertex[]): PolyVertex[] {
  const n = vs.length;
  const out: PolyVertex[] = [];
  for (let i = 0; i < n; i++) {
    const v = vs[(n - i) % n];
    const prev = vs[(n - i - 1 + n) % n];
    out.push({ x: v.x, y: v.y, bulge: -(prev.bulge ?? 0) });
  }
  return out;
}
