import type { ArcCurve, Curve, LineCurve } from '../geometry/curves';
import { closestParam, curveEnd, curvePoint, curveStart } from '../geometry/curves';
import type { ChamferResult, FilletInput, FilletResult } from '../geometry/fillet';
import { chamferLines, chamferLinesAngle, filletCurves } from '../geometry/fillet';
import type { PolyVertex } from '../geometry/polyline';
import { polylineSegments, sweepToBulge } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import type { ArcEntity, Entity, LineEntity, LwPolylineEntity } from '../document/types';
import type { EvalContext } from '../model/registry';
import { kindOf } from '../model/registry';
import { baseProps } from '../model/kinds/common';
import { curveToEntity } from './curveEdit';

export interface CornerEdit {
  update: Entity[];
  add: Entity[];
}

export type CornerOp = { kind: 'fillet'; radius: number } | { kind: 'chamfer'; d1: number; d2: number } | { kind: 'chamfer-angle'; d1: number; angle: number };

function segmentIndexAt(p: LwPolylineEntity, pick: Vec2): number {
  const segs = polylineSegments(p.vertices, p.closed);
  let best = 0;
  let bd = Infinity;
  segs.forEach((s, i) => {
    const d = dist(curvePoint(s, closestParam(s, pick)), pick);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function pickCurve(e: Entity, pick: Vec2, ctx: EvalContext): { curve: FilletInput; seg?: number } | null {
  if (e.type === 'lwpolyline') {
    const i = segmentIndexAt(e, pick);
    const s = polylineSegments(e.vertices, e.closed)[i];
    return s && (s.kind === 'line' || s.kind === 'arc') ? { curve: s, seg: i } : null;
  }
  if (e.type === 'line' || e.type === 'arc' || e.type === 'circle') {
    const c = kindOf(e).curves(e, ctx)[0] as ArcCurve | LineCurve;
    return { curve: c };
  }
  return null;
}

function applyCorner(op: CornerOp, c1: FilletInput, p1: Vec2, c2: FilletInput, p2: Vec2): { r: FilletResult | ChamferResult; arc: Curve | null } | null {
  if (op.kind === 'fillet') {
    const r = filletCurves(c1, p1, c2, p2, op.radius);
    return r ? { r, arc: r.arc } : null;
  }
  if (c1.kind !== 'line' || c2.kind !== 'line') return null;
  const r = op.kind === 'chamfer' ? chamferLines(c1, p1, c2, p2, op.d1, op.d2) : chamferLinesAngle(c1, p1, c2, p2, op.d1, op.angle);
  return r ? { r, arc: r.line } : null;
}

/** Reemplaza el tramo extremo de una polilínea abierta por la curva recortada. */
function replaceEndSegment(p: LwPolylineEntity, seg: number, newSeg: FilletInput): LwPolylineEntity | null {
  const n = p.vertices.length;
  const vs = p.vertices.map((v) => ({ ...v }));
  const s = curveStart(newSeg);
  const e = curveEnd(newSeg);
  const bulge = newSeg.kind === 'arc' ? sweepToBulge(newSeg.sweep) : 0;
  const orig = polylineSegments(p.vertices, p.closed)[seg];
  // orientar como el tramo original
  const sameDir = dist(s, curveStart(orig)) + dist(e, curveEnd(orig)) <= dist(e, curveStart(orig)) + dist(s, curveEnd(orig));
  const a = sameDir ? s : e;
  const b = sameDir ? e : s;
  const bb = sameDir ? bulge : -bulge;
  if (seg === 0) {
    vs[0] = { ...vs[0], x: a.x, y: a.y, bulge: bb };
    vs[1] = { ...vs[1], x: b.x, y: b.y };
  } else if (seg === n - 2) {
    vs[n - 2] = { ...vs[n - 2], x: a.x, y: a.y, bulge: bb };
    vs[n - 1] = { ...vs[n - 1], x: b.x, y: b.y };
  } else return null;
  return { ...p, vertices: vs, shape: undefined };
}

function setEntityCurve(e: Entity, seg: number | undefined, c: FilletInput | null): Entity | null {
  if (!c) return null;
  if (e.type === 'lwpolyline' && seg !== undefined) return replaceEndSegment(e, seg, c);
  if (e.type === 'circle') return e;
  return curveToEntity(e, c, true);
}

/** Empalme o chaflán entre dos objetos (o dos tramos de la misma polilínea). */
export function cornerEntities(e1: Entity, p1: Vec2, e2: Entity, p2: Vec2, op: CornerOp, trim: boolean, ctx: EvalContext): CornerEdit | { error: { es: string; en: string } } {
  const a = pickCurve(e1, p1, ctx);
  const b = pickCurve(e2, p2, ctx);
  if (!a || !b) return { error: { es: 'Solo se admiten líneas, arcos, círculos y tramos de polilínea.', en: 'Only lines, arcs, circles and polyline segments are supported.' } };

  // misma polilínea: tramos consecutivos → vértice con arco/chaflán
  if (e1.id === e2.id && e1.type === 'lwpolyline' && a.seg !== undefined && b.seg !== undefined) {
    const n = polylineSegments(e1.vertices, e1.closed).length;
    let i = a.seg;
    let j = b.seg;
    if (!(Math.abs(i - j) === 1 || (e1.closed && Math.abs(i - j) === n - 1))) return { error: { es: 'Los tramos designados no son consecutivos.', en: 'The selected segments are not consecutive.' } };
    if ((j + 1) % n === i) [i, j] = [j, i];
    const res = polylineCorner(e1, i, op);
    return res ? { update: [res], add: [] } : { error: { es: 'El radio o las distancias no caben en esos tramos.', en: 'The radius or distances do not fit those segments.' } };
  }

  const res = applyCorner(op, a.curve, p1, b.curve, p2);
  if (!res) return { error: op.kind === 'fillet' ? { es: 'No se pudo calcular el empalme (radio demasiado grande u objetos paralelos sin solución).', en: 'Could not compute the fillet (radius too large or parallel objects without solution).' } : { es: 'El chaflán requiere segmentos rectos no paralelos.', en: 'Chamfer requires non-parallel straight segments.' } };
  const update: Entity[] = [];
  const add: Entity[] = [];
  if (trim) {
    const u1 = setEntityCurve(e1, a.seg, res.r.c1);
    const u2 = setEntityCurve(e2, b.seg, res.r.c2);
    if (e1.type === 'lwpolyline' && a.seg !== undefined && !u1) return { error: { es: 'En una polilínea solo se puede empalmar su primer o último tramo con otro objeto.', en: 'Only the first or last segment of a polyline can be filleted with another object.' } };
    if (u1) update.push(u1);
    if (u2 && e2.id !== e1.id) update.push(u2);
  }
  if (res.arc) {
    const src = e1;
    if (res.arc.kind === 'arc') {
      const arc = res.arc;
      const start = arc.sweep >= 0 ? arc.a0 : arc.a0 + arc.sweep;
      add.push({ ...baseProps(src), id: '', type: 'arc', center: arc.c, radius: arc.r, startAngle: start, endAngle: start + Math.abs(arc.sweep) } as ArcEntity);
    } else if (res.arc.kind === 'line') add.push({ ...baseProps(src), id: '', type: 'line', start: res.arc.a, end: res.arc.b } as LineEntity);
  }
  return { update, add };
}

/** Empalme/chaflán del vértice entre tramo i y tramo i+1 de una polilínea. */
export function polylineCorner(p: LwPolylineEntity, i: number, op: CornerOp): LwPolylineEntity | null {
  const segs = polylineSegments(p.vertices, p.closed);
  const n = segs.length;
  const j = (i + 1) % n;
  const s1 = segs[i];
  const s2 = segs[j];
  if (!s1 || !s2) return null;
  if (op.kind !== 'fillet' && (s1.kind !== 'line' || s2.kind !== 'line')) return null;
  // puntos de designación: interiores de cada tramo
  const res = applyCorner(op, s1 as FilletInput, curvePoint(s1, 0.25), s2 as FilletInput, curvePoint(s2, 0.75));
  if (!res || !res.r.c1 || !res.r.c2) return null;
  const c1 = res.r.c1;
  const c2 = res.r.c2;
  // validar que los recortes no invierten los tramos
  if (dist(curveStart(c1), curveStart(s1)) > dist(curveStart(s1), curveEnd(s1)) + 1e-9) return null;
  const vs: PolyVertex[] = p.vertices.map((v) => ({ ...v }));
  const k = j; // vértice compartido
  const t1 = curveEnd(c1);
  const t2 = curveStart(c2);
  const extraBulge = res.arc && res.arc.kind === 'arc' ? sweepToBulge(res.arc.sweep) : 0;
  const before = vs.slice(0, k);
  const after = vs.slice(k + 1);
  const newVerts: PolyVertex[] = [
    { x: t1.x, y: t1.y, bulge: extraBulge, startWidth: vs[k].startWidth, endWidth: vs[k].startWidth },
    { x: t2.x, y: t2.y, bulge: vs[k].bulge ?? 0, startWidth: vs[k].startWidth, endWidth: vs[k].endWidth },
  ];
  // tramos arco adyacentes: actualizar bulge por el recorte
  if (s1.kind === 'arc' && c1.kind === 'arc') before[before.length - 1] = { ...before[before.length - 1], bulge: sweepToBulge(c1.sweep) };
  if (s2.kind === 'arc' && c2.kind === 'arc') newVerts[1].bulge = sweepToBulge(c2.sweep);
  let vertices: PolyVertex[];
  if (k === 0) {
    // vértice de cierre: el vértice 0 se reemplaza al final
    vertices = [newVerts[1], ...after];
    vertices.push(newVerts[0]);
  } else vertices = [...before, ...newVerts, ...after];
  return { ...p, vertices, shape: undefined };
}

/** Empalme/chaflán de todos los vértices de una polilínea (opción Polilínea). */
export function polylineAllCorners(p: LwPolylineEntity, op: CornerOp): { result: LwPolylineEntity; done: number; skipped: number } {
  let cur = p;
  let done = 0;
  let skipped = 0;
  let idx = 0;
  const segsCount = () => polylineSegments(cur.vertices, cur.closed).length;
  let guard = 0;
  while (guard++ < 10000) {
    const n = segsCount();
    const limit = cur.closed ? n : n - 1;
    if (idx >= limit) break;
    const segs = polylineSegments(cur.vertices, cur.closed);
    const s1 = segs[idx];
    const s2 = segs[(idx + 1) % n];
    if (s1.kind !== 'line' || s2.kind !== 'line') {
      idx++;
      continue;
    }
    const next = polylineCorner(cur, idx, op);
    if (next) {
      cur = next;
      done++;
      idx += 2;
    } else {
      skipped++;
      idx++;
    }
  }
  return { result: cur, done, skipped };
}
