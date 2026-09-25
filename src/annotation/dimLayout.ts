import type { DimAssocRef, DimensionEntity, Entity } from '../document/types';
import { linearTol } from '../geometry/tolerance';
import type { Vec2 } from '../geometry/vec';
import { add, cross, dot, len, normalize, perp, scale, sub } from '../geometry/vec';

/** Punto de definición para cotas rápidas, con su referencia asociativa. */
export interface QuickPoint {
  p: Vec2;
  ref: Omit<DimAssocRef, 'point'>;
}

/** Extremos de líneas y arcos, centros de arcos y círculos, vértices de polilínea y puntos. */
export function quickDimensionPoints(entities: readonly Entity[]): QuickPoint[] {
  const out: QuickPoint[] = [];
  for (const e of entities) {
    switch (e.type) {
      case 'line':
        out.push({ p: e.start, ref: { entityId: e.id, snap: 'endpoint-start' } }, { p: e.end, ref: { entityId: e.id, snap: 'endpoint-end' } });
        break;
      case 'arc':
        out.push(
          { p: { x: e.center.x + e.radius * Math.cos(e.startAngle), y: e.center.y + e.radius * Math.sin(e.startAngle) }, ref: { entityId: e.id, snap: 'endpoint-start' } },
          { p: { x: e.center.x + e.radius * Math.cos(e.endAngle), y: e.center.y + e.radius * Math.sin(e.endAngle) }, ref: { entityId: e.id, snap: 'endpoint-end' } },
          { p: e.center, ref: { entityId: e.id, snap: 'center' } },
        );
        break;
      case 'circle':
        out.push({ p: e.center, ref: { entityId: e.id, snap: 'center' } });
        break;
      case 'lwpolyline':
        e.vertices.forEach((v, i) => out.push({ p: { x: v.x, y: v.y }, ref: { entityId: e.id, snap: 'vertex', index: i } }));
        break;
      case 'point':
        out.push({ p: e.position, ref: { entityId: e.id, snap: 'insertion' } });
        break;
    }
  }
  return out;
}

export type QuickMode = 'continuous' | 'baseline' | 'ordinate';

export type QuickDimSpec = Pick<DimensionEntity, 'dimType' | 'p1' | 'p2' | 'p3' | 'rotation' | 'assoc'> & Partial<Pick<DimensionEntity, 'origin' | 'axis'>>;

/**
 * Cotas rápidas (QDIM) a partir de puntos: continuas, desde línea base u ordenadas.
 * `horizontal` mide a lo largo de X (línea de cota horizontal) o de Y. `spacing` separa las
 * cotas sucesivas en línea base; el lado lo da la posición de la línea de cota.
 */
export function quickDimensions(points: readonly QuickPoint[], place: Vec2, mode: QuickMode, horizontal: boolean, spacing: number): QuickDimSpec[] {
  const key = (q: QuickPoint) => (horizontal ? q.p.x : q.p.y);
  const mag = points.reduce((m, q) => Math.max(m, Math.abs(q.p.x), Math.abs(q.p.y)), 0);
  const tol = linearTol(mag) * 1000;
  const sorted = [...points].sort((a, b) => key(a) - key(b));
  const unique: QuickPoint[] = [];
  for (const q of sorted) if (!unique.length || key(q) - key(unique[unique.length - 1]) > tol) unique.push(q);
  const rotation = horizontal ? 0 : Math.PI / 2;
  const across = (q: QuickPoint) => (horizontal ? q.p.y : q.p.x);
  const placeAcross = horizontal ? place.y : place.x;
  const onLine = (along: number, acrossValue: number): Vec2 => (horizontal ? { x: along, y: acrossValue } : { x: acrossValue, y: along });
  const assoc = (a: QuickPoint, b: QuickPoint): DimAssocRef[] => [{ ...a.ref, point: 'p1' }, { ...b.ref, point: 'p2' }];
  if (mode === 'ordinate') {
    return unique.map((q) => ({
      dimType: 'ordinate' as const,
      p1: q.p,
      p2: onLine(key(q), placeAcross),
      p3: onLine(key(q), placeAcross),
      rotation: 0,
      origin: { x: 0, y: 0 },
      axis: horizontal ? ('x' as const) : ('y' as const),
      assoc: [{ ...q.ref, point: 'p1' as const }],
    }));
  }
  if (unique.length < 2) return [];
  if (mode === 'continuous') {
    return unique.slice(1).map((b, i) => {
      const a = unique[i];
      return { dimType: 'linear' as const, p1: a.p, p2: b.p, p3: onLine((key(a) + key(b)) / 2, placeAcross), rotation, assoc: assoc(a, b) };
    });
  }
  const first = unique[0];
  const side = Math.sign(placeAcross - unique.reduce((s, q) => s + across(q), 0) / unique.length) || 1;
  return unique.slice(1).map((b, i) => ({
    dimType: 'linear' as const,
    p1: first.p,
    p2: b.p,
    p3: onLine((key(first) + key(b)) / 2, placeAcross + side * i * spacing),
    rotation,
    assoc: assoc(first, b),
  }));
}

/** Dirección de la línea de cota de una cota lineal o alineada, o null si no aplica. */
export function dimLineDirection(d: DimensionEntity): Vec2 | null {
  if (d.dimType === 'aligned') {
    const u = sub(d.p2, d.p1);
    return len(u) > 1e-12 ? normalize(u) : null;
  }
  if (d.dimType === 'linear') return { x: Math.cos(d.rotation), y: Math.sin(d.rotation) };
  return null;
}

/**
 * DIMSPACE: coloca las cotas paralelas a la base a distancias iguales de ella, cada una en su
 * lado y en su orden actual. Con separación 0 las alinea sobre la línea de la base.
 * Devuelve solo las cotas que cambian.
 */
export function spaceDimensions(base: DimensionEntity, dims: readonly DimensionEntity[], spacing: number): DimensionEntity[] {
  const u = dimLineDirection(base);
  if (!u) return [];
  const n = perp(u);
  const sides = new Map<number, { dim: DimensionEntity; off: number }[]>();
  for (const d of dims) {
    if (d.id === base.id) continue;
    const ud = dimLineDirection(d);
    if (!ud || Math.abs(cross(u, ud)) > 1e-9) continue;
    const off = dot(sub(d.p3, base.p3), n);
    const side = Math.sign(off) || 1;
    const list = sides.get(side) ?? [];
    list.push({ dim: d, off });
    sides.set(side, list);
  }
  const out: DimensionEntity[] = [];
  for (const [side, list] of sides) {
    list.sort((a, b) => Math.abs(a.off) - Math.abs(b.off));
    list.forEach(({ dim, off }, i) => {
      const delta = side * (i + 1) * spacing - off;
      if (Math.abs(delta) < 1e-12) return;
      const shift = scale(n, delta);
      out.push({ ...dim, p3: add(dim.p3, shift), textPosition: dim.textPosition ? add(dim.textPosition, shift) : undefined });
    });
  }
  return out;
}
