import { normAngle, TAU } from '../geometry/angle';
import type { ArcCurve, Curve, EllipseCurve } from '../geometry/curves';
import {
  closestParam,
  curveEnd,
  curveLength,
  curvePoint,
  curveStart,
  isBounded,
  isClosedCurve,
  reverseCurve,
  subCurve,
  tessellateCurve,
} from '../geometry/curves';
import { intersectCurves } from '../geometry/intersect';
import type { PolyVertex } from '../geometry/polyline';
import { curvesToVertices, polylineSegments, sweepToBulge } from '../geometry/polyline';
import { reverseSpline, splineThroughPoints } from '../geometry/spline';
import type { Vec2 } from '../geometry/vec';
import { cross, dist, dot, normalize, sub } from '../geometry/vec';
import type { ArcEntity, CircleEntity, EllipseEntity, Entity, LineEntity, LwPolylineEntity, RayEntity, SplineEntity, XLineEntity } from '../document/types';
import type { EvalContext } from '../model/registry';
import { kindOf } from '../model/registry';
import { baseProps } from '../model/kinds/common';

export const EDIT_TOL = 1e-9;

export type EditableEntity = LineEntity | ArcEntity | CircleEntity | EllipseEntity | LwPolylineEntity | SplineEntity | RayEntity | XLineEntity;

export function isEditable(e: Entity): e is EditableEntity {
  return ['line', 'arc', 'circle', 'ellipse', 'lwpolyline', 'spline', 'ray', 'xline'].includes(e.type);
}

/** Convierte una curva en entidad con las propiedades base de `src` (conserva id si keepId). */
export function curveToEntity(src: Entity, c: Curve, keepId = false): Entity {
  const base = { ...baseProps(src), id: keepId ? src.id : '' };
  switch (c.kind) {
    case 'line':
      return { ...base, type: 'line', start: c.a, end: c.b } as LineEntity;
    case 'ray':
      return { ...base, type: 'ray', origin: c.o, direction: c.d } as RayEntity;
    case 'xline':
      return { ...base, type: 'xline', origin: c.o, direction: c.d } as XLineEntity;
    case 'arc': {
      if (Math.abs(c.sweep) >= TAU - 1e-9) return { ...base, type: 'circle', center: c.c, radius: c.r } as CircleEntity;
      const start = c.sweep >= 0 ? c.a0 : c.a0 + c.sweep;
      return { ...base, type: 'arc', center: c.c, radius: c.r, startAngle: normAngle(start), endAngle: normAngle(start) + Math.abs(c.sweep) } as ArcEntity;
    }
    case 'ellipse': {
      const full = Math.abs(c.sweep) >= TAU - 1e-9;
      const start = c.sweep >= 0 ? c.a0 : c.a0 + c.sweep;
      return { ...base, type: 'ellipse', center: c.c, majorAxis: c.major, ratio: c.ratio, startParam: full ? 0 : start, endParam: full ? TAU : start + Math.abs(c.sweep) } as EllipseEntity;
    }
    case 'spline':
      return { ...base, type: 'spline', spline: c.s, method: 'cv', fitTolerance: 0 } as SplineEntity;
    case 'poly':
      return { ...base, type: 'lwpolyline', vertices: c.pts.map((p) => ({ x: p.x, y: p.y, bulge: 0 })), closed: false } as LwPolylineEntity;
  }
}

// ------------------------------------------------------------------ polilíneas por parámetro global

/** Parámetro global g ∈ [0, n] (n = número de tramos) del punto más cercano. */
export function polylineClosestParam(vertices: PolyVertex[], closed: boolean, p: Vec2): number {
  const segs = polylineSegments(vertices, closed);
  let best = 0;
  let bd = Infinity;
  segs.forEach((s, i) => {
    const t = closestParam(s, p);
    const d = dist(curvePoint(s, t), p);
    if (d < bd - 1e-12) {
      bd = d;
      best = i + t;
    }
  });
  return best;
}

/** Sub-polilínea entre parámetros globales g0 < g1 (si closed y g1 > n se da la vuelta). */
export function subPolyline(vertices: PolyVertex[], closed: boolean, g0: number, g1: number): PolyVertex[] {
  const segs = polylineSegments(vertices, closed);
  const n = segs.length;
  const pieces: Curve[] = [];
  let g = g0;
  let guard = 0;
  while (g < g1 - 1e-12 && guard++ < 4 * n + 4) {
    const i = Math.floor(g + 1e-12);
    const idx = ((i % n) + n) % n;
    const tStart = g - i;
    const tEnd = Math.min(1, g1 - i);
    if (tEnd - tStart > 1e-12) pieces.push(subCurve(segs[idx], tStart, tEnd));
    g = i + 1;
  }
  const out: PolyVertex[] = [];
  for (const c of pieces) {
    const s = curveStart(c);
    const bulge = c.kind === 'arc' ? sweepToBulge(c.sweep) : 0;
    if (out.length && dist(out[out.length - 1], s) < 1e-9) out[out.length - 1].bulge = bulge;
    else out.push({ x: s.x, y: s.y, bulge });
    const e = curveEnd(c);
    out.push({ x: e.x, y: e.y, bulge: 0 });
  }
  return out;
}

// ------------------------------------------------------------------ TRIM

export interface TrimResult {
  /** entidades resultantes (la primera conserva el id si hay alguna) */
  replace: Entity[];
  /** true si la entidad se eliminó completa (recorte rápido sin límites) */
  erased: boolean;
}

function intersectionParamsSimple(target: Curve, cutters: Curve[], selfExclude?: Curve): number[] {
  const ts: number[] = [];
  for (const c of cutters) {
    if (c === selfExclude) continue;
    for (const h of intersectCurves(target, c, { tol: EDIT_TOL })) ts.push(h.t1);
  }
  return ts;
}

/**
 * Recorta la parte de `e` designada en `pick` entre las intersecciones más próximas
 * con los límites. Sin intersecciones, borra la entidad (modo rápido de AutoCAD).
 */
export function trimEntity(e: Entity, pick: Vec2, cutters: Curve[], ctx: EvalContext): TrimResult | null {
  if (!isEditable(e)) return null;
  if (e.type === 'lwpolyline') return trimPolyline(e, pick, cutters, ctx);
  const [c] = kindOf(e).curves(e, ctx);
  if (!c) return null;
  const own = cutters.filter((x) => x !== c);
  let ts = intersectionParamsSimple(c, own).filter((t) => Number.isFinite(t));
  const tp = closestParam(c, pick);
  const closed = isClosedCurve(c);
  if (c.kind === 'ray' || c.kind === 'xline') {
    ts = ts.sort((a, b) => a - b);
    const lo = ts.filter((t) => t < tp - 1e-9).pop();
    const hi = ts.find((t) => t > tp + 1e-9);
    if (lo === undefined && hi === undefined) return { replace: [], erased: true };
    const out: Curve[] = [];
    if (lo !== undefined) out.push(subCurve(c, c.kind === 'ray' ? 0 : -Infinity, lo));
    if (hi !== undefined) out.push(subCurve(c, hi, Infinity));
    return { replace: out.map((x, i) => curveToEntity(e, x, i === 0)), erased: false };
  }
  ts = [...new Set(ts.map((t) => (closed ? ((t % 1) + 1) % 1 : Math.max(0, Math.min(1, t)))))].sort((a, b) => a - b);
  // ignorar intersecciones en los extremos de curvas abiertas
  if (!closed) ts = ts.filter((t) => t > 1e-9 && t < 1 - 1e-9);
  if (!ts.length) return { replace: [], erased: true };
  if (closed) {
    if (ts.length < 2) return null;
    let lo = ts.filter((t) => t < tp).pop();
    let hi = ts.find((t) => t > tp);
    if (lo === undefined) lo = ts[ts.length - 1] - 1;
    if (hi === undefined) hi = ts[0] + 1;
    // se conserva de hi a lo+1 (dando la vuelta)
    let keep: Curve;
    if (c.kind === 'arc') keep = { ...c, a0: c.a0 + c.sweep * hi, sweep: c.sweep * (lo + 1 - hi) };
    else if (c.kind === 'ellipse') keep = { ...c, a0: c.a0 + c.sweep * hi, sweep: c.sweep * (lo + 1 - hi) };
    else return null;
    return { replace: [curveToEntity(e, keep, true)], erased: false };
  }
  const lo = ts.filter((t) => t < tp).pop();
  const hi = ts.find((t) => t > tp);
  const out: Curve[] = [];
  if (lo !== undefined && lo > 1e-9) out.push(subCurve(c, 0, lo));
  if (hi !== undefined && hi < 1 - 1e-9) out.push(subCurve(c, hi, 1));
  return { replace: out.map((x, i) => curveToEntity(e, x, i === 0)), erased: !out.length };
}

function trimPolyline(e: LwPolylineEntity, pick: Vec2, cutters: Curve[], ctx: EvalContext): TrimResult | null {
  const segs = polylineSegments(e.vertices, e.closed);
  const n = segs.length;
  if (!n) return null;
  const gs: number[] = [];
  const ownSet = new Set(kindOf(e).curves(e, ctx));
  segs.forEach((s, i) => {
    for (const cut of cutters) {
      if (ownSet.has(cut)) continue;
      for (const h of intersectCurves(s, cut, { tol: EDIT_TOL })) gs.push(i + Math.max(0, Math.min(1, h.t1)));
    }
    // autointersecciones con tramos no adyacentes de la propia polilínea
    segs.forEach((o, j) => {
      if (Math.abs(i - j) <= 1 || (e.closed && Math.abs(i - j) === n - 1)) return;
      for (const h of intersectCurves(s, o, { tol: EDIT_TOL })) gs.push(i + h.t1);
    });
  });
  let params = [...new Set(gs.map((g) => Math.round(g * 1e10) / 1e10))].sort((a, b) => a - b);
  const gp = polylineClosestParam(e.vertices, e.closed, pick);
  if (!e.closed) params = params.filter((g) => g > 1e-9 && g < n - 1e-9);
  if (!params.length) return { replace: [], erased: true };
  const make = (verts: PolyVertex[], keepId: boolean): LwPolylineEntity => ({ ...baseProps(e), id: keepId ? e.id : '', type: 'lwpolyline', vertices: verts, closed: false, constantWidth: e.constantWidth } as LwPolylineEntity);
  if (e.closed) {
    params = params.map((g) => ((g % n) + n) % n);
    if (params.length < 2) return null;
    let lo = params.filter((g) => g < gp).pop();
    let hi = params.find((g) => g > gp);
    if (lo === undefined) lo = params[params.length - 1] - n;
    if (hi === undefined) hi = params[0] + n;
    return { replace: [make(subPolyline(e.vertices, true, hi, lo + n), true)], erased: false };
  }
  const lo = params.filter((g) => g < gp).pop();
  const hi = params.find((g) => g > gp);
  const out: LwPolylineEntity[] = [];
  if (lo !== undefined) out.push(make(subPolyline(e.vertices, false, 0, lo), true));
  if (hi !== undefined) out.push(make(subPolyline(e.vertices, false, hi, n), out.length === 0));
  return { replace: out.filter((p) => p.vertices.length >= 2), erased: !out.length };
}

// ------------------------------------------------------------------ EXTEND

function ellipseAngle(e: EllipseCurve, p: Vec2): number {
  const L = Math.hypot(e.major.x, e.major.y);
  const ux = e.major.x / L;
  const uy = e.major.y / L;
  const dx = p.x - e.c.x;
  const dy = p.y - e.c.y;
  return Math.atan2((-dx * uy + dy * ux) / (L * e.ratio), (dx * ux + dy * uy) / L);
}

function extendCurveEnd(c: Curve, atEnd: boolean, boundaries: Curve[]): Vec2 | null {
  let best: { p: Vec2; d: number } | null = null;
  const endPt = atEnd ? curveEnd(c) : curveStart(c);
  for (const b of boundaries) {
    for (const h of intersectCurves(c, b, { extend1: true, tol: EDIT_TOL })) {
      let beyond: number;
      if (c.kind === 'line') beyond = atEnd ? h.t1 - 1 : -h.t1;
      else if (c.kind === 'arc' || c.kind === 'ellipse') {
        // distancia angular fuera del arco en el sentido del barrido, sin reentrar en él
        const ang = c.kind === 'arc' ? Math.atan2(h.p.y - c.c.y, h.p.x - c.c.x) : ellipseAngle(c, h.p);
        const s = Math.sign(c.sweep) || 1;
        const gap = TAU - Math.abs(c.sweep);
        beyond = atEnd ? normAngle((ang - (c.a0 + c.sweep)) * s) : normAngle((c.a0 - ang) * s);
        if (beyond >= gap - 1e-12) continue;
      } else continue;
      if (beyond <= 1e-9) continue;
      void endPt;
      if (!best || beyond < best.d) best = { p: h.p, d: beyond };
    }
  }
  return best?.p ?? null;
}

/** Alarga el extremo de `e` más cercano a `pick` hasta el límite más próximo. */
export function extendEntity(e: Entity, pick: Vec2, boundaries: Curve[], ctx: EvalContext): Entity | null {
  if (e.type === 'line') {
    const atEnd = dist(pick, e.end) < dist(pick, e.start);
    const p = extendCurveEnd({ kind: 'line', a: e.start, b: e.end }, atEnd, boundaries);
    if (!p) return null;
    return atEnd ? { ...e, end: p } : { ...e, start: p };
  }
  if (e.type === 'arc') {
    const [c] = kindOf(e).curves(e, ctx) as ArcCurve[];
    const atEnd = dist(pick, curveEnd(c)) < dist(pick, curveStart(c));
    const p = extendCurveEnd(c, atEnd, boundaries);
    if (!p) return null;
    const ang = Math.atan2(p.y - e.center.y, p.x - e.center.x);
    return atEnd ? { ...e, endAngle: ang } : { ...e, startAngle: ang };
  }
  if (e.type === 'lwpolyline' && !e.closed && e.vertices.length >= 2) {
    const segs = polylineSegments(e.vertices, false);
    const n = e.vertices.length;
    const atEnd = dist(pick, e.vertices[n - 1]) < dist(pick, e.vertices[0]);
    const seg = atEnd ? segs[segs.length - 1] : segs[0];
    const p = extendCurveEnd(seg, atEnd, boundaries);
    if (!p) return null;
    const vertices = e.vertices.map((v) => ({ ...v }));
    if (seg.kind === 'arc') {
      const idx = atEnd ? n - 2 : 0;
      const center = seg.c;
      const a = atEnd ? Math.atan2(vertices[idx].y - center.y, vertices[idx].x - center.x) : Math.atan2(p.y - center.y, p.x - center.x);
      const b = atEnd ? Math.atan2(p.y - center.y, p.x - center.x) : Math.atan2(vertices[1].y - center.y, vertices[1].x - center.x);
      let sweep = normAngle(b - a);
      if (seg.sweep < 0) sweep = sweep - TAU;
      vertices[idx].bulge = sweepToBulge(sweep);
    }
    if (atEnd) vertices[n - 1] = { ...vertices[n - 1], x: p.x, y: p.y };
    else vertices[0] = { ...vertices[0], x: p.x, y: p.y };
    return { ...e, vertices, shape: undefined };
  }
  if (e.type === 'ellipse') {
    const [c] = kindOf(e).curves(e, ctx) as EllipseCurve[];
    if (Math.abs(c.sweep) >= TAU - 1e-9) return null;
    const atEnd = dist(pick, curveEnd(c)) < dist(pick, curveStart(c));
    const p = extendCurveEnd(c, atEnd, boundaries);
    if (!p) return null;
    const L = Math.hypot(e.majorAxis.x, e.majorAxis.y);
    const ux = e.majorAxis.x / L;
    const uy = e.majorAxis.y / L;
    const dx = p.x - e.center.x;
    const dy = p.y - e.center.y;
    const th = Math.atan2((-dx * uy + dy * ux) / (L * e.ratio), (dx * ux + dy * uy) / L);
    return atEnd ? { ...e, endParam: th } : { ...e, startParam: th };
  }
  return null;
}

// ------------------------------------------------------------------ BREAK

/** Parte una entidad entre dos puntos (p2 = p1 para BREAKATPOINT). */
export function breakEntity(e: Entity, p1: Vec2, p2: Vec2, ctx: EvalContext): Entity[] | null {
  if (!isEditable(e)) return null;
  if (e.type === 'lwpolyline') {
    const n = polylineSegments(e.vertices, e.closed).length;
    let g1 = polylineClosestParam(e.vertices, e.closed, p1);
    let g2 = polylineClosestParam(e.vertices, e.closed, p2);
    const mk = (v: PolyVertex[], keep: boolean) => ({ ...baseProps(e), id: keep ? e.id : '', type: 'lwpolyline', vertices: v, closed: false, constantWidth: e.constantWidth }) as LwPolylineEntity;
    if (e.closed) {
      if (Math.abs(g1 - g2) < 1e-9) return [mk(subPolyline(e.vertices, true, g1, g1 + n), true)];
      // se elimina de g1 a g2 en sentido del recorrido
      if (g2 < g1) g2 += n;
      return [mk(subPolyline(e.vertices, true, g2, g1 + n), true)];
    }
    if (g2 < g1) [g1, g2] = [g2, g1];
    const out: LwPolylineEntity[] = [];
    if (g1 > 1e-9) out.push(mk(subPolyline(e.vertices, false, 0, g1), true));
    if (g2 < n - 1e-9) out.push(mk(subPolyline(e.vertices, false, g2, n), out.length === 0));
    return out;
  }
  const [c] = kindOf(e).curves(e, ctx);
  let t1 = closestParam(c, p1);
  let t2 = closestParam(c, p2);
  if (isClosedCurve(c)) {
    // AutoCAD: en círculos se elimina la parte CCW del primer al segundo punto
    if (Math.abs(t1 - t2) < 1e-9) return [curveToEntity(e, c, true)];
    if (t2 < t1) t2 += 1;
    const keep = c.kind === 'arc' ? { ...c, a0: c.a0 + c.sweep * t2, sweep: c.sweep * (1 - (t2 - t1)) } : c.kind === 'ellipse' ? { ...c, a0: c.a0 + c.sweep * t2, sweep: c.sweep * (1 - (t2 - t1)) } : null;
    return keep ? [curveToEntity(e, keep, true)] : null;
  }
  if (c.kind === 'xline' || c.kind === 'ray') {
    if (t2 < t1) [t1, t2] = [t2, t1];
    const out: Curve[] = [];
    if (c.kind === 'xline') out.push(subCurve(c, -Infinity, t1));
    else if (t1 > 1e-9) out.push(subCurve(c, 0, t1));
    out.push(subCurve(c, t2, Infinity));
    return out.map((x, i) => curveToEntity(e, x, i === 0));
  }
  if (t2 < t1) [t1, t2] = [t2, t1];
  const out: Curve[] = [];
  if (t1 > 1e-9) out.push(subCurve(c, 0, t1));
  if (t2 < 1 - 1e-9) out.push(subCurve(c, t2, 1));
  return out.map((x, i) => curveToEntity(e, x, i === 0));
}

// ------------------------------------------------------------------ JOIN

export interface JoinResult {
  entities: Entity[];
  consumed: string[];
  message: { es: string; en: string };
}

/** Une objetos contiguos (líneas colineales, arcos concéntricos, cadenas a polilínea). */
export function joinEntities(source: Entity, others: Entity[], ctx: EvalContext, tol = 1e-6): JoinResult | null {
  const all = [source, ...others];
  // líneas colineales
  if (all.every((e) => e.type === 'line')) {
    const lines = all as LineEntity[];
    const d = normalize(sub(lines[0].end, lines[0].start));
    const collinear = lines.every((l) => Math.abs(cross(d, normalize(sub(l.end, l.start)))) < 1e-9 && Math.abs(cross(d, sub(l.start, lines[0].start))) < tol);
    if (collinear) {
      const ts = lines.flatMap((l) => [dot(sub(l.start, lines[0].start), d), dot(sub(l.end, lines[0].start), d)]);
      const intervals = lines.map((l) => [dot(sub(l.start, lines[0].start), d), dot(sub(l.end, lines[0].start), d)].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
      let reach = intervals[0][1];
      for (const [a, b] of intervals.slice(1)) {
        if (a > reach + tol) return { entities: [], consumed: [], message: { es: 'Las líneas colineales tienen huecos entre sí: no se pueden juntar.', en: 'The collinear lines have gaps: cannot join.' } };
        reach = Math.max(reach, b);
      }
      const t0 = Math.min(...ts);
      const t1 = Math.max(...ts);
      const o = lines[0].start;
      return { entities: [{ ...source, start: { x: o.x + d.x * t0, y: o.y + d.y * t0 }, end: { x: o.x + d.x * t1, y: o.y + d.y * t1 } } as LineEntity], consumed: others.map((e) => e.id), message: { es: `${all.length} líneas unidas en 1.`, en: `${all.length} lines joined into 1.` } };
    }
  }
  // arcos concéntricos del mismo radio
  if (all.every((e) => e.type === 'arc')) {
    const arcs = all as ArcEntity[];
    const same = arcs.every((a) => dist(a.center, arcs[0].center) < tol && Math.abs(a.radius - arcs[0].radius) < tol);
    if (same) {
      // unir intervalos angulares contiguos
      let start = arcs[0].startAngle;
      let end = arcs[0].endAngle;
      let remaining = arcs.slice(1);
      let grew = true;
      while (grew && remaining.length) {
        grew = false;
        for (const a of remaining) {
          if (Math.abs(normAngle(a.startAngle - end)) < 1e-9 || Math.abs(normAngle(a.startAngle - end) - TAU) < 1e-9) {
            end = end + normAngle(a.endAngle - a.startAngle || TAU);
          } else if (Math.abs(normAngle(start - a.endAngle)) < 1e-9 || Math.abs(normAngle(start - a.endAngle) - TAU) < 1e-9) {
            start = start - normAngle(a.endAngle - a.startAngle || TAU);
          } else continue;
          remaining = remaining.filter((x) => x !== a);
          grew = true;
          break;
        }
      }
      if (!remaining.length) {
        const sweep = end - start;
        const joined: Entity = sweep >= TAU - 1e-9 ? ({ ...baseProps(source), type: 'circle', center: arcs[0].center, radius: arcs[0].radius } as CircleEntity) : ({ ...source, startAngle: normAngle(start), endAngle: normAngle(start) + sweep } as ArcEntity);
        return { entities: [joined], consumed: others.map((e) => e.id), message: { es: `${all.length} arcos unidos.`, en: `${all.length} arcs joined.` } };
      }
    }
  }
  // cadena de líneas/arcos/polilíneas → polilínea
  const chainable = all.every((e) => e.type === 'line' || e.type === 'arc' || (e.type === 'lwpolyline' && !e.closed));
  if (chainable) {
    const pieces = all.map((e) => ({ id: e.id, curves: kindOf(e).curves(e, ctx) }));
    let chain = [...pieces[0].curves];
    const used = new Set([pieces[0].id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of pieces) {
        if (used.has(p.id)) continue;
        const s = curveStart(chain[0]);
        const en = curveEnd(chain[chain.length - 1]);
        const ps = curveStart(p.curves[0]);
        const pe = curveEnd(p.curves[p.curves.length - 1]);
        const rev = () => [...p.curves].reverse().map(reverseCurve);
        if (dist(en, ps) <= tol) chain = [...chain, ...p.curves];
        else if (dist(en, pe) <= tol) chain = [...chain, ...rev()];
        else if (dist(s, pe) <= tol) chain = [...p.curves, ...chain];
        else if (dist(s, ps) <= tol) chain = [...rev(), ...chain];
        else continue;
        used.add(p.id);
        grew = true;
      }
    }
    if (used.size < 2) return { entities: [], consumed: [], message: { es: 'Los objetos no comparten extremos (tolerancia de unión).', en: 'Objects do not share endpoints (join tolerance).' } };
    const { vertices, closed } = curvesToVertices(chain, tol);
    const poly: LwPolylineEntity = { ...baseProps(source), type: 'lwpolyline', vertices, closed } as LwPolylineEntity;
    const consumed = [...used].filter((id) => id !== source.id);
    return { entities: [poly], consumed, message: { es: `${used.size} objetos unidos en una polilínea${closed ? ' cerrada' : ''}${used.size < all.length ? `; ${all.length - used.size} no conectados` : ''}.`, en: `${used.size} objects joined into a ${closed ? 'closed ' : ''}polyline${used.size < all.length ? `; ${all.length - used.size} not connected` : ''}.` } };
  }
  // splines y elipses: aproximación a spline por puntos (experimental)
  if (all.every((e) => e.type === 'spline' || e.type === 'ellipse' || e.type === 'arc' || e.type === 'line' || e.type === 'lwpolyline')) {
    const curves = all.flatMap((e) => kindOf(e).curves(e, ctx)).filter(isBounded);
    const pts: Vec2[] = [];
    let cur = curves.shift()!;
    pts.push(...tessellateCurve(cur, 1e-3));
    while (curves.length) {
      const end = pts[pts.length - 1];
      const i = curves.findIndex((c) => dist(curveStart(c), end) <= tol || dist(curveEnd(c), end) <= tol);
      if (i < 0) break;
      cur = curves.splice(i, 1)[0];
      const t = tessellateCurve(dist(curveStart(cur), end) <= tol ? cur : reverseCurve(cur), 1e-3);
      pts.push(...t.slice(1));
    }
    const step = Math.max(1, Math.floor(pts.length / 80));
    const fit = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    return { entities: [{ ...baseProps(source), type: 'spline', spline: splineThroughPoints(fit, 3), method: 'fit', fitTolerance: 1e-3 } as SplineEntity], consumed: others.map((e) => e.id), message: { es: 'Unión aproximada como spline de ajuste (experimental).', en: 'Joined approximately as a fit spline (experimental).' } };
  }
  return null;
}

// ------------------------------------------------------------------ LENGTHEN

export type LengthenMode = { kind: 'delta'; value: number } | { kind: 'percent'; value: number } | { kind: 'total'; value: number } | { kind: 'point'; to: Vec2 };

export function lengthenEntity(e: Entity, pick: Vec2, mode: LengthenMode, ctx: EvalContext): Entity | null {
  if (e.type === 'line') {
    const atEnd = dist(pick, e.end) < dist(pick, e.start);
    const L0 = dist(e.start, e.end);
    const d = normalize(sub(e.end, e.start));
    let L = L0;
    if (mode.kind === 'delta') L = L0 + mode.value;
    else if (mode.kind === 'percent') L = (L0 * mode.value) / 100;
    else if (mode.kind === 'total') L = mode.value;
    else L = atEnd ? dot(sub(mode.to, e.start), d) : dot(sub(e.end, mode.to), d);
    if (L <= 1e-12) return null;
    return atEnd ? { ...e, end: { x: e.start.x + d.x * L, y: e.start.y + d.y * L } } : { ...e, start: { x: e.end.x - d.x * L, y: e.end.y - d.y * L } };
  }
  if (e.type === 'arc') {
    const sweep0 = normAngle(e.endAngle - e.startAngle) || TAU;
    const L0 = sweep0 * e.radius;
    const [c] = kindOf(e).curves(e, ctx);
    const atEnd = dist(pick, curveEnd(c)) < dist(pick, curveStart(c));
    let sweep = sweep0;
    if (mode.kind === 'delta') sweep = (L0 + mode.value) / e.radius;
    else if (mode.kind === 'percent') sweep = (sweep0 * mode.value) / 100;
    else if (mode.kind === 'total') sweep = mode.value / e.radius;
    else {
      const a = Math.atan2(mode.to.y - e.center.y, mode.to.x - e.center.x);
      sweep = atEnd ? normAngle(a - e.startAngle) : normAngle(e.endAngle - a);
    }
    if (sweep <= 1e-12 || sweep >= TAU) return null;
    return atEnd ? { ...e, endAngle: e.startAngle + sweep } : { ...e, startAngle: e.endAngle - sweep };
  }
  if (e.type === 'lwpolyline' && !e.closed) {
    const segs = polylineSegments(e.vertices, false);
    const total = segs.reduce((s, c) => s + curveLength(c), 0);
    const n = e.vertices.length;
    const atEnd = dist(pick, e.vertices[n - 1]) < dist(pick, e.vertices[0]);
    let target = total;
    if (mode.kind === 'delta') target = total + mode.value;
    else if (mode.kind === 'percent') target = (total * mode.value) / 100;
    else if (mode.kind === 'total') target = mode.value;
    else return null;
    const delta = target - total;
    const seg = atEnd ? segs[segs.length - 1] : segs[0];
    if (seg.kind !== 'line') return null;
    const segLen = curveLength(seg) + delta;
    if (segLen <= 1e-12) return null;
    const vertices = e.vertices.map((v) => ({ ...v }));
    const dir = normalize(sub(seg.b, seg.a));
    if (atEnd) vertices[n - 1] = { ...vertices[n - 1], x: seg.a.x + dir.x * segLen, y: seg.a.y + dir.y * segLen };
    else vertices[0] = { ...vertices[0], x: seg.b.x - dir.x * segLen, y: seg.b.y - dir.y * segLen };
    return { ...e, vertices, shape: undefined };
  }
  return null;
}

// ------------------------------------------------------------------ REVERSE

export function reverseEntity(e: Entity): Entity | null {
  switch (e.type) {
    case 'line':
      return { ...e, start: e.end, end: e.start };
    case 'lwpolyline': {
      const n = e.vertices.length;
      const vs: PolyVertex[] = [];
      for (let i = 0; i < n; i++) {
        const v = e.vertices[n - 1 - i];
        const prev = e.vertices[(n - 2 - i + n) % n];
        const bulge = e.closed ? -(prev.bulge ?? 0) : i < n - 1 ? -(e.vertices[n - 2 - i].bulge ?? 0) : 0;
        vs.push({ x: v.x, y: v.y, bulge, startWidth: v.endWidth, endWidth: v.startWidth });
      }
      return { ...e, vertices: vs, shape: undefined };
    }
    case 'spline':
      return { ...e, spline: reverseSpline(e.spline) };
    case 'polyline2d':
      return { ...e, vertices: [...e.vertices].reverse() };
    default:
      return null;
  }
}
