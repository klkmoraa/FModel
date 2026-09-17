import type { Vec2 } from '../geometry/vec';
import { cross, dist, dot, normalize, sub } from '../geometry/vec';
import type { Entity, Id, LineEntity } from '../document/types';

export interface OverkillOptions {
  tolerance: number;
  /** comparar también color, capa, tipo y grosor de línea */
  compareProps: boolean;
  mergeCollinear: boolean;
  removeZeroLength: boolean;
}

export interface OverkillPlan {
  remove: Id[];
  update: Entity[];
  duplicates: number;
  merged: number;
  zeroLength: number;
}

const q = (v: number, tol: number) => Math.round(v / tol);
const qp = (p: Vec2, tol: number) => `${q(p.x, tol)},${q(p.y, tol)}`;

function propsKey(e: Entity): string {
  return `${e.layer}|${e.color}|${e.linetype}|${e.lineweight}|${e.transparency}`;
}

/** Firma geométrica independiente de la dirección para detectar duplicados. */
export function geometrySignature(e: Entity, tol: number): string | null {
  switch (e.type) {
    case 'line': {
      const a = qp(e.start, tol);
      const b = qp(e.end, tol);
      return `line|${[a, b].sort().join('|')}`;
    }
    case 'point':
      return `point|${qp(e.position, tol)}`;
    case 'circle':
      return `circle|${qp(e.center, tol)}|${q(e.radius, tol)}`;
    case 'arc':
      return `arc|${qp(e.center, tol)}|${q(e.radius, tol)}|${q(((e.startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), 1e-6)}|${q(((e.endAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), 1e-6)}`;
    case 'ellipse':
      return `ellipse|${qp(e.center, tol)}|${qp(e.majorAxis, tol)}|${q(e.ratio, 1e-6)}|${q(e.startParam, 1e-6)}|${q(e.endParam, 1e-6)}`;
    case 'lwpolyline': {
      const fwd = e.vertices.map((v) => `${qp(v, tol)}:${q(v.bulge ?? 0, 1e-6)}`).join(';');
      const rev = [...e.vertices]
        .reverse()
        .map((v, i, arr) => `${qp(v, tol)}:${q(-(arr[i + 1]?.bulge ?? 0), 1e-6)}`)
        .join(';');
      return `pline|${e.closed ? 1 : 0}|${[fwd, rev].sort()[0]}`;
    }
    case 'text':
      return `text|${qp(e.position, tol)}|${e.text}|${q(e.height, tol)}|${q(e.rotation, 1e-6)}`;
    case 'mtext':
      return `mtext|${qp(e.position, tol)}|${e.contents}|${q(e.height, tol)}`;
    case 'insert':
      return `insert|${e.blockId}|${qp(e.position, tol)}|${q(e.scale.x, 1e-6)}|${q(e.scale.y, 1e-6)}|${q(e.rotation, 1e-6)}|${JSON.stringify(e.attributes)}|${JSON.stringify(e.dynamic ?? null)}`;
    case 'hatch':
      return `hatch|${JSON.stringify(e.loops.map((l) => l.vertices.map((v) => qp(v, tol))))}|${e.pattern.name}|${q(e.pattern.scale, 1e-6)}|${q(e.pattern.angle, 1e-6)}`;
    default:
      return null;
  }
}

/** OVERKILL: elimina duplicados, fusiona líneas colineales solapadas y líneas de longitud cero. */
export function planOverkill(entities: Entity[], opts: OverkillOptions): OverkillPlan {
  const plan: OverkillPlan = { remove: [], update: [], duplicates: 0, merged: 0, zeroLength: 0 };
  const seen = new Map<string, Id>();
  const tol = Math.max(opts.tolerance, 1e-12);
  const alive: Entity[] = [];
  for (const e of [...entities].sort((a, b) => a.order - b.order)) {
    if (opts.removeZeroLength && e.type === 'line' && dist(e.start, e.end) <= tol) {
      plan.remove.push(e.id);
      plan.zeroLength++;
      continue;
    }
    const sig = geometrySignature(e, tol);
    if (!sig) {
      alive.push(e);
      continue;
    }
    const key = opts.compareProps ? `${sig}#${propsKey(e)}` : sig;
    if (seen.has(key)) {
      plan.remove.push(e.id);
      plan.duplicates++;
      continue;
    }
    seen.set(key, e.id);
    alive.push(e);
  }
  if (!opts.mergeCollinear) return plan;
  // líneas colineales solapadas o contiguas
  const groups = new Map<string, LineEntity[]>();
  for (const e of alive) {
    if (e.type !== 'line') continue;
    let d = normalize(sub(e.end, e.start));
    if (d.x < -1e-12 || (Math.abs(d.x) <= 1e-12 && d.y < 0)) d = { x: -d.x, y: -d.y };
    const n = { x: -d.y, y: d.x };
    const offset = dot(e.start, n);
    const key = `${q(Math.atan2(d.y, d.x), 1e-7)}|${q(offset, tol)}${opts.compareProps ? `#${propsKey(e)}` : ''}`;
    const g = groups.get(key) ?? [];
    g.push(e);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const d = normalize(sub(g[0].end, g[0].start));
    const o = g[0].start;
    const intervals = g
      .map((l) => {
        const a = dot(sub(l.start, o), d);
        const b = dot(sub(l.end, o), d);
        return { l, lo: Math.min(a, b), hi: Math.max(a, b) };
      })
      .sort((a, b) => a.lo - b.lo);
    let cur = { keep: intervals[0].l, lo: intervals[0].lo, hi: intervals[0].hi, absorbed: [] as LineEntity[] };
    const flush = () => {
      if (!cur.absorbed.length) return;
      if (Math.abs(cross(d, sub(cur.keep.start, o))) > tol * 10) return;
      plan.update.push({ ...cur.keep, start: { x: o.x + d.x * cur.lo, y: o.y + d.y * cur.lo }, end: { x: o.x + d.x * cur.hi, y: o.y + d.y * cur.hi } });
      for (const a of cur.absorbed) plan.remove.push(a.id);
      plan.merged += cur.absorbed.length;
    };
    for (const it of intervals.slice(1)) {
      if (it.lo <= cur.hi + tol) {
        cur.hi = Math.max(cur.hi, it.hi);
        cur.absorbed.push(it.l);
      } else {
        flush();
        cur = { keep: it.l, lo: it.lo, hi: it.hi, absorbed: [] };
      }
    }
    flush();
  }
  return plan;
}
