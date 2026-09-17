import type { Curve } from '../geometry/curves';
import { closestParam, curveEnd, curvePoint, curveStart } from '../geometry/curves';
import { polylineSegments } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { dist, mid } from '../geometry/vec';
import type { CadDocument } from '../document/document';
import type { DimAssocRef, DimensionEntity, Entity, Id } from '../document/types';
import type { EvalContext, SnapType } from '../model/registry';
import { kindOf } from '../model/registry';

/** Punto característico actual de una entidad según la referencia asociativa. */
export function assocPoint(e: Entity, ref: DimAssocRef, ctx: EvalContext): Vec2 | null {
  const curves = kindOf(e).curves(e, ctx);
  switch (ref.snap) {
    case 'endpoint-start':
    case 'endpoint-end': {
      if (e.type === 'lwpolyline' && ref.index !== undefined) return e.vertices[ref.index] ? { x: e.vertices[ref.index].x, y: e.vertices[ref.index].y } : null;
      const c = curves[0];
      if (!c) return null;
      return ref.snap === 'endpoint-start' ? curveStart(c) : curveEnd(curves[curves.length - 1]);
    }
    case 'vertex':
      if (e.type === 'lwpolyline' && ref.index !== undefined) return e.vertices[ref.index] ?? null;
      return null;
    case 'midpoint': {
      if (e.type === 'lwpolyline') {
        const s = polylineSegments(e.vertices, e.closed)[ref.index ?? 0];
        return s ? curvePoint(s, 0.5) : null;
      }
      if (e.type === 'line') return mid(e.start, e.end);
      return curves[0] ? curvePoint(curves[0], 0.5) : null;
    }
    case 'center':
      if (e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse') return e.center;
      if (e.type === 'lwpolyline') {
        const s = polylineSegments(e.vertices, e.closed)[ref.index ?? 0];
        return s && s.kind === 'arc' ? s.c : null;
      }
      return null;
    case 'quadrant':
      if (e.type === 'circle' || e.type === 'arc') {
        const a = ((ref.index ?? 0) * Math.PI) / 2;
        return { x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) };
      }
      return null;
    case 'insertion':
      return (e as { position?: Vec2 }).position ?? null;
    case 'nearest': {
      const c = curves[0];
      if (!c) return null;
      if (e.type === 'circle' || e.type === 'arc') {
        const a = ref.index ?? 0;
        return { x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) };
      }
      return curvePoint(c, ref.index ?? 0);
    }
  }
}

/** Crea una referencia asociativa a partir de un punto resuelto por object snap. */
export function makeAssocRef(point: DimAssocRef['point'], e: Entity | undefined, snap: SnapType | string | undefined, p: Vec2, ctx: EvalContext): DimAssocRef | null {
  if (!e) return null;
  const tol = 1e-6 * Math.max(1, Math.abs(p.x), Math.abs(p.y));
  const curves: Curve[] = kindOf(e).curves(e, ctx);
  switch (snap) {
    case 'endpoint': {
      if (e.type === 'lwpolyline') {
        const idx = e.vertices.findIndex((v) => dist(v, p) <= tol);
        return idx >= 0 ? { point, entityId: e.id, snap: 'vertex', index: idx } : null;
      }
      const c = curves[0];
      if (!c) return null;
      if (dist(curveStart(c), p) <= tol) return { point, entityId: e.id, snap: 'endpoint-start' };
      if (dist(curveEnd(curves[curves.length - 1]), p) <= tol) return { point, entityId: e.id, snap: 'endpoint-end' };
      return null;
    }
    case 'midpoint': {
      if (e.type === 'lwpolyline') {
        const segs = polylineSegments(e.vertices, e.closed);
        const idx = segs.findIndex((s) => dist(curvePoint(s, 0.5), p) <= tol);
        return idx >= 0 ? { point, entityId: e.id, snap: 'midpoint', index: idx } : null;
      }
      return { point, entityId: e.id, snap: 'midpoint' };
    }
    case 'center':
      return { point, entityId: e.id, snap: 'center' };
    case 'quadrant':
      if (e.type === 'circle' || e.type === 'arc') {
        const a = Math.atan2(p.y - e.center.y, p.x - e.center.x);
        return { point, entityId: e.id, snap: 'quadrant', index: ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4 };
      }
      return null;
    case 'insertion':
      return { point, entityId: e.id, snap: 'insertion' };
    case 'nearest': {
      if (e.type === 'circle' || e.type === 'arc') return { point, entityId: e.id, snap: 'nearest', index: Math.atan2(p.y - e.center.y, p.x - e.center.x) };
      const c = curves[0];
      if (!c || curves.length > 1) return null;
      return { point, entityId: e.id, snap: 'nearest', index: closestParam(c, p) };
    }
    default:
      return null;
  }
}

/**
 * Reactor de cotas asociativas: cuando cambia geometría referenciada, recalcula los
 * puntos de definición dentro de la misma transacción (el deshacer los incluye).
 */
export function installDimensionAssociativity(doc: CadDocument, ctx: EvalContext): () => void {
  return doc.addReactor((tx, changes) => {
    const changed = new Set<Id>();
    const removed = new Set<Id>();
    for (const c of changes) {
      if (c.coll !== 'entities') continue;
      if (c.after) changed.add(c.id);
      else removed.add(c.id);
    }
    if (!changed.size && !removed.size) return;
    for (const dim of doc.data.entities.values()) {
      if (dim.type !== 'dimension' || !dim.assoc?.length) continue;
      if (!dim.assoc.some((a) => changed.has(a.entityId) || removed.has(a.entityId))) continue;
      const next: DimensionEntity = { ...dim };
      const kept: DimAssocRef[] = [];
      const deltas: Vec2[] = [];
      for (const a of dim.assoc) {
        const e = doc.entity(a.entityId);
        if (!e) continue; // la entidad desapareció: la cota queda no asociativa en ese punto
        const p = assocPoint(e, a, ctx);
        if (!p) continue;
        const prev = (dim as unknown as Record<string, Vec2 | undefined>)[a.point];
        if (prev) deltas.push({ x: p.x - prev.x, y: p.y - prev.y });
        (next as unknown as Record<string, Vec2>)[a.point] = p;
        kept.push(a);
      }
      next.assoc = kept.length ? kept : undefined;
      // si todas las referencias se movieron igual (desplazamiento rígido), arrastrar la línea de cota
      if (deltas.length && !changed.has(dim.id)) {
        const d0 = deltas[0];
        const rigid = deltas.every((d) => Math.abs(d.x - d0.x) < 1e-9 && Math.abs(d.y - d0.y) < 1e-9);
        if (rigid && (dim.dimType === 'linear' || dim.dimType === 'aligned')) next.p3 = { x: dim.p3.x + d0.x, y: dim.p3.y + d0.y };
        if (rigid && dim.arcPoint) next.arcPoint = { x: dim.arcPoint.x + d0.x, y: dim.arcPoint.y + d0.y };
        if (rigid && (dim.dimType === 'radial' || dim.dimType === 'diametric')) next.p3 = { x: dim.p3.x + d0.x, y: dim.p3.y + d0.y };
        if (rigid && dim.textPosition) next.textPosition = { x: dim.textPosition.x + d0.x, y: dim.textPosition.y + d0.y };
      }
      if (JSON.stringify(next) !== JSON.stringify(dim)) tx.put('entities', next);
    }
  });
}
