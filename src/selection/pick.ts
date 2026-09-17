import type { BBox } from '../geometry/bbox';
import { boxContainsBox, boxContainsPoint, boxesIntersect, inflate } from '../geometry/bbox';
import type { Curve } from '../geometry/curves';
import { distanceToCurve, isBounded, tessellateCurve } from '../geometry/curves';
import { pointInPolygon, pointOnPolygonEdge } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import type { Entity, EntityType, Id } from '../document/types';
import type { ModelContext } from '../model/context';
import { kindOf } from '../model/registry';
import type { VisibilityOptions } from '../model/visibility';
import { entityVisible } from '../model/visibility';
import type { SpatialIndex } from '../spatial/spatialIndex';

export interface PickFilter {
  types?: EntityType[];
  layers?: Id[];
  predicate?: (e: Entity) => boolean;
  /** incluir entidades en capas bloqueadas (para snaps y consulta) */
  includeLocked?: boolean;
}

export interface PickHit {
  id: Id;
  distance: number;
  order: number;
}

function passes(ctx: ModelContext, e: Entity, filter: PickFilter | undefined, vis: VisibilityOptions): boolean {
  if (!entityVisible(ctx.doc, e, vis)) return false;
  if (filter?.types && !filter.types.includes(e.type)) return false;
  if (filter?.layers && !filter.layers.includes(e.layer)) return false;
  if (filter?.predicate && !filter.predicate(e)) return false;
  return true;
}

/** Distancia de un punto a la entidad (0 si cae dentro de un relleno/contorno de texto). */
export function entityDistance(ctx: ModelContext, e: Entity, p: Vec2, tol: number): number {
  const k = kindOf(e);
  let best = Infinity;
  const outline = k.outline?.(e, ctx);
  if (outline && outline.length > 2) {
    if (k.filledHit?.(e, ctx) && pointInPolygon(p, outline)) return 0;
    if (pointOnPolygonEdge(p, outline, tol)) best = Math.min(best, tol * 0.5);
  }
  for (const c of k.curves(e, ctx)) {
    const d = distanceToCurve(c, p);
    if (d < best) best = d;
    if (best === 0) break;
  }
  if (!Number.isFinite(best)) {
    for (const s of k.snapPoints(e, ctx)) best = Math.min(best, Math.hypot(s.p.x - p.x, s.p.y - p.y));
  }
  return best;
}

/** Entidades bajo el cursor ordenadas: más cercanas primero y, a igual distancia, las de encima. */
export function pickAt(ctx: ModelContext, index: SpatialIndex, owner: Id, p: Vec2, tol: number, filter?: PickFilter, vis: VisibilityOptions = {}): PickHit[] {
  const box = { minX: p.x - tol, minY: p.y - tol, maxX: p.x + tol, maxY: p.y + tol };
  const hits: PickHit[] = [];
  for (const id of index.query(owner, box)) {
    const e = ctx.doc.entity(id);
    if (!e || !passes(ctx, e, filter, vis)) continue;
    const d = entityDistance(ctx, e, p, tol);
    if (d <= tol) hits.push({ id, distance: d, order: e.order });
  }
  hits.sort((a, b) => {
    const da = Math.round((a.distance / tol) * 4);
    const db = Math.round((b.distance / tol) * 4);
    return da !== db ? da - db : b.order - a.order;
  });
  return hits;
}

function segIntersectsBox(a: Vec2, b: Vec2, box: BBox): boolean {
  // Liang–Barsky
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (pp: number, q: number) => {
    if (pp === 0) return q >= 0;
    const r = q / pp;
    if (pp < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a.x - box.minX) && clip(dx, box.maxX - a.x) && clip(-dy, a.y - box.minY) && clip(dy, box.maxY - a.y);
}

function curvesCrossBox(curves: Curve[], box: BBox, tol: number): boolean {
  for (const c of curves) {
    if (!isBounded(c)) {
      const o = (c as { o: Vec2 }).o;
      const d = (c as { d: Vec2 }).d;
      const L = 1e9;
      const a = c.kind === 'ray' ? o : { x: o.x - d.x * L, y: o.y - d.y * L };
      if (segIntersectsBox(a, { x: o.x + d.x * L, y: o.y + d.y * L }, box)) return true;
      continue;
    }
    const pts = tessellateCurve(c, tol);
    for (let i = 1; i < pts.length; i++) if (segIntersectsBox(pts[i - 1], pts[i], box)) return true;
  }
  return false;
}

/**
 * Selección por ventana (objetos completamente dentro) o captura (dentro o cruzando).
 */
export function selectInBox(ctx: ModelContext, index: SpatialIndex, owner: Id, box: BBox, crossing: boolean, filter?: PickFilter, vis: VisibilityOptions = {}): Id[] {
  const out: Id[] = [];
  const tol = Math.max(box.maxX - box.minX, box.maxY - box.minY) * 1e-4;
  for (const id of index.query(owner, box)) {
    const e = ctx.doc.entity(id);
    if (!e || !passes(ctx, e, filter, vis)) continue;
    const k = kindOf(e);
    const eb = index.bboxOf(owner, id);
    const inside = !!eb && boxContainsBox(box, eb);
    if (inside) {
      out.push(id);
      continue;
    }
    if (!crossing) continue;
    if (eb && !boxesIntersect(box, eb) && Number.isFinite(eb.minX)) continue;
    if (curvesCrossBox(k.curves(e, ctx), box, tol)) {
      out.push(id);
      continue;
    }
    const outline = k.outline?.(e, ctx);
    if (outline && outline.length > 2) {
      const edgesCross = outline.some((p, i) => segIntersectsBox(p, outline[(i + 1) % outline.length], box));
      const boxInside = k.filledHit?.(e, ctx) && pointInPolygon({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, outline);
      if (edgesCross || boxInside) out.push(id);
    } else if (k.snapPoints(e, ctx).some((s) => boxContainsPoint(box, s.p))) {
      out.push(id);
    }
  }
  return out;
}

/** Selección poligonal (WPolygon / CPolygon). */
export function selectInPolygon(ctx: ModelContext, index: SpatialIndex, owner: Id, poly: Vec2[], crossing: boolean, filter?: PickFilter, vis: VisibilityOptions = {}): Id[] {
  const box = poly.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const out: Id[] = [];
  for (const id of index.query(owner, inflate(box, 1e-9))) {
    const e = ctx.doc.entity(id);
    if (!e || !passes(ctx, e, filter, vis)) continue;
    const k = kindOf(e);
    const pts = k.curves(e, ctx).flatMap((c) => (isBounded(c) ? tessellateCurve(c, 1e-2) : []));
    const probe = pts.length ? pts : (k.outline?.(e, ctx) ?? k.snapPoints(e, ctx).map((s) => s.p));
    if (!probe.length) continue;
    const insideAll = probe.every((p) => pointInPolygon(p, poly));
    if (insideAll) {
      out.push(id);
      continue;
    }
    if (crossing && (probe.some((p) => pointInPolygon(p, poly)) || fenceCrosses(ctx, e, [...poly, poly[0]]))) out.push(id);
  }
  return out;
}

function segSeg(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

function fenceCrosses(ctx: ModelContext, e: Entity, fence: Vec2[]): boolean {
  const k = kindOf(e);
  for (const c of k.curves(e, ctx)) {
    if (!isBounded(c)) continue;
    const pts = tessellateCurve(c, 1e-2);
    for (let i = 1; i < pts.length; i++) for (let j = 1; j < fence.length; j++) if (segSeg(pts[i - 1], pts[i], fence[j - 1], fence[j])) return true;
  }
  const outline = k.outline?.(e, ctx);
  if (outline) for (let i = 0; i < outline.length; i++) for (let j = 1; j < fence.length; j++) if (segSeg(outline[i], outline[(i + 1) % outline.length], fence[j - 1], fence[j])) return true;
  return false;
}

/** Selección por borde (Fence). */
export function selectByFence(ctx: ModelContext, index: SpatialIndex, owner: Id, fence: Vec2[], filter?: PickFilter, vis: VisibilityOptions = {}): Id[] {
  if (fence.length < 2) return [];
  const box = fence.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return index.query(owner, box).filter((id) => {
    const e = ctx.doc.entity(id);
    return !!e && passes(ctx, e, filter, vis) && fenceCrosses(ctx, e, fence);
  });
}

/** Selección rápida (QSELECT / SELECTSIMILAR). */
export function quickSelect(ctx: ModelContext, owner: Id, filter: PickFilter, vis: VisibilityOptions = {}): Id[] {
  const out: Id[] = [];
  for (const e of ctx.doc.data.entities.values()) if (e.owner === owner && passes(ctx, e, filter, vis)) out.push(e.id);
  return out;
}
