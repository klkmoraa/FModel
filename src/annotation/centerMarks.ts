import { refSegment } from '../constraints/solver';
import type { CadDocument } from '../document/document';
import type { CenterMarkEntity, Entity, GeoRef, Id } from '../document/types';
import { linearTol } from '../geometry/tolerance';
import type { Vec2 } from '../geometry/vec';
import { dist, dot, mid, sub } from '../geometry/vec';

export interface CenterGeometry {
  center: Vec2;
  radius: number;
  end?: Vec2;
}

/**
 * Geometría de una marca o eje de centro a partir de sus objetos de origen: centro y radio
 * de un círculo o arco; o el eje que une los puntos medios de los extremos homólogos de dos
 * tramos (con los tramos orientados en el mismo sentido). null si ya no se puede resolver.
 */
export function centerGeometryFrom(mode: CenterMarkEntity['mode'], sources: readonly GeoRef[], get: (id: Id) => Entity | undefined): CenterGeometry | null {
  if (mode === 'mark') {
    const e = sources[0] && get(sources[0].entityId);
    if (!e || (e.type !== 'circle' && e.type !== 'arc')) return null;
    return { center: e.center, radius: e.radius };
  }
  const [r1, r2] = sources;
  const e1 = r1 && get(r1.entityId);
  const e2 = r2 && get(r2.entityId);
  const s1 = e1 && refSegment(e1, r1.part);
  const s2 = e2 && refSegment(e2, r2.part);
  if (!s1 || !s2) return null;
  let [b0, b1] = s2;
  if (dot(sub(s1[1], s1[0]), sub(b1, b0)) < 0) [b0, b1] = [b1, b0];
  const center = mid(s1[0], b0);
  const end = mid(s1[1], b1);
  if (!(dist(center, end) > 1e-12)) return null;
  return { center, radius: 0, end };
}

function matches(e: CenterMarkEntity, g: CenterGeometry): boolean {
  const tol = linearTol(Math.max(Math.abs(e.center.x), Math.abs(e.center.y))) * 100;
  if (dist(e.center, g.center) > tol || Math.abs(e.radius - g.radius) > tol) return false;
  if (g.end || e.end) return !!g.end && !!e.end && dist(e.end, g.end) <= tol;
  return true;
}

/**
 * Reactor de marcas y ejes de centro asociativos: si cambia el objeto de origen, la marca lo
 * sigue; si la marca se mueve o se copia por su cuenta, o su origen desaparece o cambia de
 * espacio, queda como geometría independiente (sin referencias colgantes).
 */
export function installCenterMarks(doc: CadDocument): () => void {
  return doc.addReactor((tx, changes) => {
    const changedIds = new Set<Id>();
    for (const c of changes) if (c.coll === 'entities') changedIds.add(c.id);
    if (!changedIds.size) return;
    for (const e of doc.data.entities.values()) {
      if (e.type !== 'centermark' || !e.sources?.length) continue;
      const sourceChanged = e.sources.some((r) => changedIds.has(r.entityId));
      if (!sourceChanged && !changedIds.has(e.id)) continue;
      const g = centerGeometryFrom(e.mode, e.sources, (id) => doc.entity(id));
      const sameSpace = e.sources.every((r) => doc.entity(r.entityId)?.owner === e.owner);
      if (!g || !sameSpace) {
        tx.put('entities', { ...e, sources: undefined });
        continue;
      }
      if (matches(e, g)) continue;
      tx.put('entities', sourceChanged ? { ...e, ...g } : { ...e, sources: undefined });
    }
  });
}
