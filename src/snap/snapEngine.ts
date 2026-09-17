import { normAngleSigned, TAU } from '../geometry/angle';
import { tangentPointsFromPoint } from '../geometry/construct';
import type { Curve } from '../geometry/curves';
import { closestParam, closestPoint, curveDerivative, curveEnd, curvePoint, curveStart, distanceToCurve, isBounded } from '../geometry/curves';
import { intersectCurves } from '../geometry/intersect';
import type { Vec2 } from '../geometry/vec';
import { add, dist, dot, normalize, scale, sub } from '../geometry/vec';
import type { Id } from '../document/types';
import type { ModelContext } from '../model/context';
import type { SnapType } from '../model/registry';
import { kindOf } from '../model/registry';
import type { VisibilityOptions } from '../model/visibility';
import { entityVisible } from '../model/visibility';
import type { SpatialIndex } from '../spatial/spatialIndex';

export interface SnapSettings {
  osnap: boolean;
  types: SnapType[];
  otrack: boolean;
  polar: boolean;
  /** incremento polar en radianes */
  polarIncrement: number;
  polarAdditional: number[];
  /** rastreo con todos los ángulos polares (true) u ortogonal (false) */
  trackAllPolar: boolean;
  ortho: boolean;
  gridSnap: boolean;
  snapSpacing: Vec2;
  aperturePx: number;
  trackingTolPx: number;
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  osnap: true,
  types: ['endpoint', 'midpoint', 'center', 'intersection', 'extension', 'node', 'geocenter', 'insertion', 'perpendicular', 'quadrant'],
  otrack: true,
  polar: true,
  polarIncrement: Math.PI / 4,
  polarAdditional: [],
  trackAllPolar: false,
  ortho: false,
  gridSnap: false,
  snapSpacing: { x: 10, y: 10 },
  aperturePx: 12,
  trackingTolPx: 8,
};

export interface SnapCandidate {
  p: Vec2;
  type: SnapType;
  entityId?: Id;
  /** entidad secundaria (intersecciones) */
  otherId?: Id;
  score: number;
  /** trayectoria a dibujar (extensión, paralela) */
  guide?: { from: Vec2; to: Vec2 };
}

export type ResolveKind = SnapType | 'grid' | 'polar' | 'ortho' | 'tracking' | 'free';

export interface ResolvedPoint {
  p: Vec2;
  kind: ResolveKind;
  entityId?: Id;
  label?: string;
  guides: { from: Vec2; to: Vec2 }[];
  candidates: SnapCandidate[];
  /** índice del candidato activo (Tab) */
  candidateIndex: number;
  /** marcadores de puntos adquiridos */
  acquired: Vec2[];
}

const PRIORITY: Record<SnapType, number> = {
  endpoint: 0,
  intersection: 0,
  node: 0.02,
  midpoint: 0.05,
  center: 0.05,
  geocenter: 0.08,
  quadrant: 0.1,
  insertion: 0.1,
  perpendicular: 0.25,
  tangent: 0.25,
  appint: 0.3,
  extension: 0.45,
  parallel: 0.55,
  nearest: 0.9,
};

interface NearCurve {
  c: Curve;
  id: Id;
}

/** Estado de adquisición para extensión, paralela y rastreo. */
export class AcquisitionState {
  /** puntos adquiridos para OTRACK */
  points: Vec2[] = [];
  /** curvas adquiridas (para extensión/paralela) */
  curves: NearCurve[] = [];
  private hoverKey = '';
  private hoverSince = 0;

  clear() {
    this.points = [];
    this.curves = [];
  }

  /** Llamar en cada movimiento: adquiere tras una pausa sobre un punto o curva. */
  dwell(key: string, now: number, dwellMs: number, onAcquire: () => void) {
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.hoverSince = now;
      return;
    }
    if (key && now - this.hoverSince >= dwellMs) {
      this.hoverSince = Infinity;
      onAcquire();
    }
  }

  togglePoint(p: Vec2) {
    const i = this.points.findIndex((q) => dist(q, p) < 1e-9);
    if (i >= 0) this.points.splice(i, 1);
    else {
      this.points.push(p);
      if (this.points.length > 7) this.points.shift();
    }
  }

  acquireCurve(nc: NearCurve) {
    if (this.curves.some((c) => c.id === nc.id)) return;
    this.curves.push(nc);
    if (this.curves.length > 4) this.curves.shift();
  }
}

export interface SnapQuery {
  ctx: ModelContext;
  index: SpatialIndex;
  owner: Id;
  cursor: Vec2;
  worldPerPixel: number;
  settings: SnapSettings;
  /** anulación temporal de un solo uso (Mayús+clic derecho / tecla) */
  override?: SnapType[] | null;
  lastPoint?: Vec2 | null;
  vis?: VisibilityOptions;
  acquisition?: AcquisitionState;
  /** entidades excluidas (las que se están editando) */
  exclude?: ReadonlySet<Id>;
  /** geometría adicional sobre la que referenciar (p. ej. vista previa en construcción) */
  extraCurves?: Curve[];
}

export function findOsnapCandidates(q: SnapQuery): { candidates: SnapCandidate[]; near: NearCurve[] } {
  const types = new Set(q.override ?? (q.settings.osnap ? q.settings.types : []));
  const ap = q.settings.aperturePx * q.worldPerPixel;
  const c = q.cursor;
  const out: SnapCandidate[] = [];
  const near: NearCurve[] = [];
  if (!types.size) return { candidates: out, near };
  const box = { minX: c.x - ap * 2, minY: c.y - ap * 2, maxX: c.x + ap * 2, maxY: c.y + ap * 2 };
  const push = (p: Vec2, type: SnapType, entityId?: Id, extra: Partial<SnapCandidate> = {}) => {
    const d = dist(p, c);
    if (d <= ap) out.push({ p, type, entityId, score: d / ap + PRIORITY[type], ...extra });
  };
  const ids = q.index.query(q.owner, box);
  if (ids.length > 400) ids.length = 400;
  for (const id of ids) {
    if (q.exclude?.has(id)) continue;
    const e = q.ctx.doc.entity(id);
    if (!e || !entityVisible(q.ctx.doc, e, q.vis)) continue;
    const k = kindOf(e);
    for (const s of k.snapPointsNear ? k.snapPointsNear(e, q.ctx, box) : k.snapPoints(e, q.ctx)) if (types.has(s.type)) push(s.p, s.type, id);
    for (const cv of k.curvesNear ? k.curvesNear(e, q.ctx, box) : k.curves(e, q.ctx)) {
      if (distanceToCurve(cv, c) <= ap * 2) near.push({ c: cv, id });
    }
  }
  if (q.extraCurves) for (const cv of q.extraCurves) if (distanceToCurve(cv, c) <= ap * 2) near.push({ c: cv, id: '' });
  if (near.length > 60) near.length = 60;

  if (types.has('nearest')) for (const n of near) push(closestPoint(n.c, c), 'nearest', n.id);

  if (q.lastPoint) {
    const lp = q.lastPoint;
    if (types.has('perpendicular')) {
      for (const n of near) {
        let foot: Vec2 | null = null;
        if (n.c.kind === 'line') {
          const d = sub(n.c.b, n.c.a);
          const l2 = dot(d, d);
          if (l2 > 0) foot = add(n.c.a, scale(d, dot(sub(lp, n.c.a), d) / l2));
        } else if (n.c.kind === 'arc') {
          const dir = normalize(sub(c, n.c.c));
          const candidates = [add(n.c.c, scale(normalize(sub(lp, n.c.c)), n.c.r)), sub(n.c.c, scale(normalize(sub(lp, n.c.c)), n.c.r))];
          foot = candidates.reduce((a, b) => (dist(a, c) < dist(b, c) ? a : b));
          void dir;
        } else if (isBounded(n.c)) {
          const t = closestParam(n.c, c);
          const pt = curvePoint(n.c, t);
          const tan = curveDerivative(n.c, t);
          if (Math.abs(dot(normalize(tan), normalize(sub(lp, pt)))) < 1e-3) foot = pt;
        }
        if (foot) push(foot, 'perpendicular', n.id);
      }
    }
    if (types.has('tangent')) {
      for (const n of near) {
        if (n.c.kind !== 'arc') continue;
        for (const tpt of tangentPointsFromPoint(lp, n.c.c, n.c.r)) {
          if (distanceToCurve(n.c, tpt) < 1e-9 * Math.max(1, n.c.r)) push(tpt, 'tangent', n.id);
        }
      }
    }
  }

  if (types.has('intersection') || types.has('appint')) {
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        if (near[i].id === near[j].id && near[i].c === near[j].c) continue;
        const hits = intersectCurves(near[i].c, near[j].c, { tol: 1e-9 });
        if (types.has('intersection')) for (const h of hits) push(h.p, 'intersection', near[i].id, { otherId: near[j].id });
        if (types.has('appint') && !hits.length) {
          for (const h of intersectCurves(near[i].c, near[j].c, { extend1: true, extend2: true, tol: 1e-9 })) push(h.p, 'appint', near[i].id, { otherId: near[j].id });
        }
      }
    }
  }

  // extensión y paralela sobre curvas adquiridas
  if (q.acquisition) {
    for (const acq of q.acquisition.curves) {
      if (types.has('extension') && acq.c.kind === 'line') {
        for (const [end, dir] of [
          [curveEnd(acq.c), normalize(sub(acq.c.b, acq.c.a))],
          [curveStart(acq.c), normalize(sub(acq.c.a, acq.c.b))],
        ] as [Vec2, Vec2][]) {
          const t = dot(sub(c, end), dir);
          if (t <= 0) continue;
          const proj = add(end, scale(dir, t));
          if (dist(proj, c) <= ap) out.push({ p: proj, type: 'extension', entityId: acq.id, score: dist(proj, c) / ap + PRIORITY.extension, guide: { from: end, to: proj } });
        }
      }
      if (types.has('extension') && acq.c.kind === 'arc' && Math.abs(acq.c.sweep) < TAU - 1e-9) {
        const r = dist(c, acq.c.c);
        if (Math.abs(r - acq.c.r) <= ap) {
          const ang = Math.atan2(c.y - acq.c.c.y, c.x - acq.c.c.x);
          const p = { x: acq.c.c.x + acq.c.r * Math.cos(ang), y: acq.c.c.y + acq.c.r * Math.sin(ang) };
          if (distanceToCurve(acq.c, p) > 1e-9) out.push({ p, type: 'extension', entityId: acq.id, score: dist(p, c) / ap + PRIORITY.extension, guide: { from: curveEnd(acq.c), to: p } });
        }
      }
      if (types.has('parallel') && q.lastPoint && acq.c.kind === 'line') {
        const dir = normalize(sub(acq.c.b, acq.c.a));
        const v = sub(c, q.lastPoint);
        const t = dot(v, dir);
        const proj = add(q.lastPoint, scale(dir, t));
        if (dist(proj, c) <= ap * 0.6 && Math.abs(t) > ap) out.push({ p: proj, type: 'parallel', entityId: acq.id, score: dist(proj, c) / ap + PRIORITY.parallel, guide: { from: q.lastPoint, to: proj } });
      }
    }
  }

  out.sort((a, b) => a.score - b.score);
  // eliminar duplicados cercanos conservando el de mayor prioridad
  const dedup: SnapCandidate[] = [];
  for (const cand of out) if (!dedup.some((d) => dist(d.p, cand.p) < q.worldPerPixel * 0.5 && d.type === cand.type)) dedup.push(cand);
  return { candidates: dedup, near };
}

function polarAngles(s: SnapSettings): number[] {
  const out: number[] = [];
  const inc = s.polarIncrement > 0 ? s.polarIncrement : Math.PI / 2;
  for (let a = 0; a < TAU - 1e-9; a += inc) out.push(a);
  for (const a of s.polarAdditional) out.push(a);
  return out;
}

/** Restricción polar/ortogonal respecto al último punto. */
export function polarConstrain(p: Vec2, base: Vec2, s: SnapSettings, tolWorld: number): { p: Vec2; angle: number; dist: number } | null {
  const v = sub(p, base);
  const d = Math.hypot(v.x, v.y);
  if (d < 1e-12) return null;
  const ang = Math.atan2(v.y, v.x);
  let best: { p: Vec2; angle: number; dist: number; lat: number } | null = null;
  for (const a of s.ortho ? [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] : polarAngles(s)) {
    const diff = normAngleSigned(ang - a);
    const lat = Math.abs(Math.sin(diff)) * d;
    if (Math.abs(diff) > Math.PI / 2) continue;
    if (!s.ortho && lat > tolWorld) continue;
    const along = Math.cos(diff) * d;
    if (!best || lat < best.lat) best = { p: { x: base.x + Math.cos(a) * along, y: base.y + Math.sin(a) * along }, angle: a, dist: along, lat };
  }
  return best ? { p: best.p, angle: best.angle, dist: best.dist } : null;
}

/** Rastreo de referencias a objetos: alineaciones con puntos adquiridos. */
export function trackingConstrain(p: Vec2, acquired: Vec2[], s: SnapSettings, tolWorld: number, base?: Vec2 | null): { p: Vec2; guides: { from: Vec2; to: Vec2 }[] } | null {
  const angles = s.trackAllPolar ? polarAngles(s) : [0, Math.PI / 2];
  const lines: { o: Vec2; d: Vec2; lat: number }[] = [];
  const sources = base && s.polar ? [...acquired, base] : acquired;
  for (const o of sources) {
    for (const a of angles) {
      const d = { x: Math.cos(a), y: Math.sin(a) };
      const v = sub(p, o);
      const lat = Math.abs(v.x * d.y - v.y * d.x);
      if (lat <= tolWorld && dist(o, p) > tolWorld) lines.push({ o, d, lat });
    }
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.lat - b.lat);
  // intersección de dos alineaciones
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i];
      const B = lines[j];
      if (A.o === B.o) continue;
      const den = A.d.x * B.d.y - A.d.y * B.d.x;
      if (Math.abs(den) < 1e-9) continue;
      const w = sub(B.o, A.o);
      const t = (w.x * B.d.y - w.y * B.d.x) / den;
      const x = add(A.o, scale(A.d, t));
      if (dist(x, p) <= tolWorld * 1.5) return { p: x, guides: [{ from: A.o, to: x }, { from: B.o, to: x }] };
    }
  }
  const L = lines[0];
  const t = dot(sub(p, L.o), L.d);
  const proj = add(L.o, scale(L.d, t));
  return { p: proj, guides: [{ from: L.o, to: proj }] };
}

export function gridSnap(p: Vec2, spacing: Vec2, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const sx = spacing.x > 0 ? spacing.x : 1;
  const sy = spacing.y > 0 ? spacing.y : sx;
  return { x: origin.x + Math.round((p.x - origin.x) / sx) * sx, y: origin.y + Math.round((p.y - origin.y) / sy) * sy };
}

/**
 * Tubería completa de resolución de un punto:
 * object snap → rastreo de objetos → ortho/polar → forzcursor de rejilla → libre.
 */
export function resolvePoint(q: SnapQuery & { candidateIndex?: number; shiftOrtho?: boolean }): ResolvedPoint {
  const tolTrack = q.settings.trackingTolPx * q.worldPerPixel;
  const acquired = q.acquisition?.points ?? [];
  const { candidates } = findOsnapCandidates(q);
  if (candidates.length) {
    const idx = ((q.candidateIndex ?? 0) % candidates.length + candidates.length) % candidates.length;
    const cand = candidates[idx];
    return { p: cand.p, kind: cand.type, entityId: cand.entityId, guides: cand.guide ? [cand.guide] : [], candidates, candidateIndex: idx, acquired };
  }
  const settings = q.shiftOrtho ? { ...q.settings, ortho: !q.settings.ortho } : q.settings;
  if (settings.otrack && acquired.length) {
    const tr = trackingConstrain(q.cursor, acquired, settings, tolTrack, q.lastPoint);
    if (tr) return { p: tr.p, kind: 'tracking', guides: tr.guides, candidates: [], candidateIndex: 0, acquired };
  }
  if (q.lastPoint && (settings.ortho || settings.polar)) {
    const pc = polarConstrain(q.cursor, q.lastPoint, settings, tolTrack);
    if (pc) {
      return {
        p: settings.gridSnap && !settings.ortho ? pc.p : pc.p,
        kind: settings.ortho ? 'ortho' : 'polar',
        label: `${pc.dist.toFixed(4)} < ${Math.round((pc.angle * 180) / Math.PI)}°`,
        guides: settings.ortho ? [] : [{ from: q.lastPoint, to: pc.p }],
        candidates: [],
        candidateIndex: 0,
        acquired,
      };
    }
  }
  if (settings.gridSnap) return { p: gridSnap(q.cursor, settings.snapSpacing), kind: 'grid', guides: [], candidates: [], candidateIndex: 0, acquired };
  return { p: q.cursor, kind: 'free', guides: [], candidates: [], candidateIndex: 0, acquired };
}
