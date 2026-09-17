import { solveLinear } from '../geometry/linalg';
import { normAngleSigned } from '../geometry/angle';
import type { BlockConstraint, Entity, GeoRef, Id } from '../document/types';

/**
 * Solver de restricciones 2D. Variables = coordenadas de los puntos que definen
 * las entidades implicadas. Resuelve r(x) = 0 con pasos de norma mínima
 *   Δx = −Jᵀ (J Jᵀ + λI)⁻¹ r
 * lo que mueve lo menos posible la geometría no restringida (comportamiento
 * esperado al editar un parámetro). Jacobiano por diferencias centrales.
 */

interface VarRef {
  entityId: Id;
  path: string; // p.ej. 'start.x', 'radius', 'vertices.2.y'
}

export interface SolveResult {
  entities: Map<Id, Entity>;
  status: 'solved' | 'unchanged' | 'inconsistent' | 'no-constraints';
  residual: number;
  iterations: number;
  /** restricciones con residuo final apreciable */
  conflicts: Id[];
}

function getPath(obj: unknown, path: string): number {
  let cur: unknown = obj;
  for (const k of path.split('.')) cur = (cur as Record<string, unknown>)?.[k];
  return typeof cur === 'number' ? cur : NaN;
}

function setPath<T>(obj: T, path: string, v: number): T {
  const keys = path.split('.');
  const clone = (x: unknown): unknown => (Array.isArray(x) ? [...x] : { ...(x as object) });
  const root = clone(obj) as Record<string, unknown>;
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = clone(cur[keys[i]]) as Record<string, unknown>;
    cur[keys[i]] = next;
    cur = next;
  }
  cur[keys[keys.length - 1]] = v;
  return root as T;
}

/** Rutas de variables de un punto referenciado. */
function pointPaths(e: Entity, part: string): [string, string] | null {
  const vert = /^vertex:(\d+)$/.exec(part);
  switch (e.type) {
    case 'line':
      if (part === 'start') return ['start.x', 'start.y'];
      if (part === 'end') return ['end.x', 'end.y'];
      return null;
    case 'circle':
    case 'arc':
      if (part === 'center') return ['center.x', 'center.y'];
      return null;
    case 'ellipse':
      if (part === 'center') return ['center.x', 'center.y'];
      return null;
    case 'point':
      return ['position.x', 'position.y'];
    case 'lwpolyline':
      if (vert) return [`vertices.${vert[1]}.x`, `vertices.${vert[1]}.y`];
      if (part === 'start') return ['vertices.0.x', 'vertices.0.y'];
      if (part === 'end') return [`vertices.${e.vertices.length - 1}.x`, `vertices.${e.vertices.length - 1}.y`];
      return null;
    case 'text':
    case 'mtext':
    case 'attdef':
      return ['position.x', 'position.y'];
    case 'insert':
      return ['position.x', 'position.y'];
    default:
      return null;
  }
}

/** Segmento lineal referenciado: [a, b] como pares de rutas. */
function segmentPaths(e: Entity, part: string): [[string, string], [string, string]] | null {
  if (e.type === 'line') return [['start.x', 'start.y'], ['end.x', 'end.y']];
  if (e.type === 'lwpolyline') {
    const m = /^segment:(\d+)$/.exec(part);
    const i = m ? Number(m[1]) : 0;
    const j = (i + 1) % e.vertices.length;
    return [[`vertices.${i}.x`, `vertices.${i}.y`], [`vertices.${j}.x`, `vertices.${j}.y`]];
  }
  return null;
}

/** Punto referenciado por una restricción (para dibujar sus glifos), o null si no aplica. */
export function refPoint(e: Entity, part: string): { x: number; y: number } | null {
  const p = pointPaths(e, part);
  if (!p) return null;
  const x = getPath(e, p[0]);
  const y = getPath(e, p[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Segmento referenciado por una restricción, o null si no aplica. */
export function refSegment(e: Entity, part: string): [{ x: number; y: number }, { x: number; y: number }] | null {
  const s = segmentPaths(e, part);
  if (!s) return null;
  const a = { x: getPath(e, s[0][0]), y: getPath(e, s[0][1]) };
  const b = { x: getPath(e, s[1][0]), y: getPath(e, s[1][1]) };
  return [a, b].every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)) ? [a, b] : null;
}

interface Model {
  vars: VarRef[];
  index: Map<string, number>;
  values: number[];
  fixed: Set<number>;
}

function varIndex(model: Model, entityId: Id, path: string, entities: Map<Id, Entity>): number {
  const key = `${entityId}|${path}`;
  let i = model.index.get(key);
  if (i === undefined) {
    i = model.vars.length;
    model.vars.push({ entityId, path });
    model.index.set(key, i);
    model.values.push(getPath(entities.get(entityId), path));
  }
  return i;
}

type Residual = (x: number[]) => number[];

interface Built {
  id: Id;
  f: Residual;
}

function buildResiduals(constraints: BlockConstraint[], entities: Map<Id, Entity>, model: Model, dimValues: Record<Id, number>): Built[] {
  const out: Built[] = [];
  const P = (ref: GeoRef): [number, number] | null => {
    const e = entities.get(ref.entityId);
    if (!e) return null;
    const pp = pointPaths(e, ref.part);
    if (!pp) return null;
    return [varIndex(model, e.id, pp[0], entities), varIndex(model, e.id, pp[1], entities)];
  };
  const S = (ref: GeoRef): [[number, number], [number, number]] | null => {
    const e = entities.get(ref.entityId);
    if (!e) return null;
    const sp = segmentPaths(e, ref.part);
    if (!sp) return null;
    return [
      [varIndex(model, e.id, sp[0][0], entities), varIndex(model, e.id, sp[0][1], entities)],
      [varIndex(model, e.id, sp[1][0], entities), varIndex(model, e.id, sp[1][1], entities)],
    ];
  };
  const R = (ref: GeoRef): number | null => {
    const e = entities.get(ref.entityId);
    if (!e || (e.type !== 'circle' && e.type !== 'arc')) return null;
    return varIndex(model, e.id, 'radius', entities);
  };
  const C = (ref: GeoRef): [number, number] | null => {
    const e = entities.get(ref.entityId);
    if (!e || (e.type !== 'circle' && e.type !== 'arc' && e.type !== 'ellipse')) return null;
    return [varIndex(model, e.id, 'center.x', entities), varIndex(model, e.id, 'center.y', entities)];
  };

  for (const c of constraints) {
    if (c.kind === 'geometric' && !c.enabled) continue;
    const [r0, r1, r2] = c.refs;
    if (c.kind === 'geometric') {
      switch (c.type) {
        case 'coincident': {
          const a = r0 && P(r0);
          const b = r1 && P(r1);
          if (a && b) out.push({ id: c.id, f: (x) => [x[a[0]] - x[b[0]], x[a[1]] - x[b[1]]] });
          break;
        }
        case 'horizontal':
        case 'vertical': {
          const k = c.type === 'horizontal' ? 1 : 0;
          const s = r0 && S(r0);
          if (s && !r1) out.push({ id: c.id, f: (x) => [x[s[0][k]] - x[s[1][k]]] });
          else {
            const a = r0 && P(r0);
            const b = r1 && P(r1);
            if (a && b) out.push({ id: c.id, f: (x) => [x[a[k]] - x[b[k]]] });
          }
          break;
        }
        case 'parallel':
        case 'perpendicular':
        case 'collinear': {
          const s1 = r0 && S(r0);
          const s2 = r1 && S(r1);
          if (!s1 || !s2) break;
          out.push({
            id: c.id,
            f: (x) => {
              const d1x = x[s1[1][0]] - x[s1[0][0]];
              const d1y = x[s1[1][1]] - x[s1[0][1]];
              const d2x = x[s2[1][0]] - x[s2[0][0]];
              const d2y = x[s2[1][1]] - x[s2[0][1]];
              const l1 = Math.hypot(d1x, d1y) || 1;
              const l2 = Math.hypot(d2x, d2y) || 1;
              if (c.type === 'perpendicular') return [(d1x * d2x + d1y * d2y) / (l1 * l2)];
              const par = (d1x * d2y - d1y * d2x) / (l1 * l2);
              if (c.type === 'parallel') return [par];
              const ox = x[s2[0][0]] - x[s1[0][0]];
              const oy = x[s2[0][1]] - x[s1[0][1]];
              return [par, (d1x * oy - d1y * ox) / l1];
            },
          });
          break;
        }
        case 'equal': {
          const ra = r0 && R(r0);
          const rb = r1 && R(r1);
          if (ra !== null && ra !== undefined && rb !== null && rb !== undefined) {
            out.push({ id: c.id, f: (x) => [x[ra] - x[rb]] });
            break;
          }
          const s1 = r0 && S(r0);
          const s2 = r1 && S(r1);
          if (s1 && s2)
            out.push({
              id: c.id,
              f: (x) => [Math.hypot(x[s1[1][0]] - x[s1[0][0]], x[s1[1][1]] - x[s1[0][1]]) - Math.hypot(x[s2[1][0]] - x[s2[0][0]], x[s2[1][1]] - x[s2[0][1]])],
            });
          break;
        }
        case 'concentric': {
          const a = r0 && C(r0);
          const b = r1 && C(r1);
          if (a && b) out.push({ id: c.id, f: (x) => [x[a[0]] - x[b[0]], x[a[1]] - x[b[1]]] });
          break;
        }
        case 'tangent': {
          const s = r0 && S(r0);
          const cc = r1 && C(r1);
          const rr = r1 && R(r1);
          if (s && cc && rr !== null && rr !== undefined) {
            out.push({
              id: c.id,
              f: (x) => {
                const dx = x[s[1][0]] - x[s[0][0]];
                const dy = x[s[1][1]] - x[s[0][1]];
                const l = Math.hypot(dx, dy) || 1;
                const d = Math.abs(dx * (x[cc[1]] - x[s[0][1]]) - dy * (x[cc[0]] - x[s[0][0]])) / l;
                return [d - x[rr]];
              },
            });
            break;
          }
          const c1 = r0 && C(r0);
          const c2 = r1 && C(r1);
          const ra = r0 && R(r0);
          const rb = r1 && R(r1);
          if (c1 && c2 && ra !== null && ra !== undefined && rb !== null && rb !== undefined) {
            const d0 = Math.hypot(model.values[c1[0]] - model.values[c2[0]], model.values[c1[1]] - model.values[c2[1]]);
            const external = Math.abs(d0 - (model.values[ra] + model.values[rb])) <= Math.abs(d0 - Math.abs(model.values[ra] - model.values[rb]));
            out.push({ id: c.id, f: (x) => [Math.hypot(x[c1[0]] - x[c2[0]], x[c1[1]] - x[c2[1]]) - (external ? x[ra] + x[rb] : Math.abs(x[ra] - x[rb]))] });
          }
          break;
        }
        case 'symmetric': {
          const a = r0 && P(r0);
          const b = r1 && P(r1);
          const axis = r2 && S(r2);
          if (!a || !b || !axis) break;
          out.push({
            id: c.id,
            f: (x) => {
              const dx = x[axis[1][0]] - x[axis[0][0]];
              const dy = x[axis[1][1]] - x[axis[0][1]];
              const l = Math.hypot(dx, dy) || 1;
              const mx = (x[a[0]] + x[b[0]]) / 2 - x[axis[0][0]];
              const my = (x[a[1]] + x[b[1]]) / 2 - x[axis[0][1]];
              return [(dx * my - dy * mx) / l, ((x[b[0]] - x[a[0]]) * dx + (x[b[1]] - x[a[1]]) * dy) / l];
            },
          });
          break;
        }
        case 'fixed': {
          const e = r0 ? entities.get(r0.entityId) : undefined;
          if (!e) break;
          const pp = r0.part === 'edge' ? null : pointPaths(e, r0.part);
          if (pp) {
            model.fixed.add(varIndex(model, e.id, pp[0], entities));
            model.fixed.add(varIndex(model, e.id, pp[1], entities));
          } else {
            for (const part of ['start', 'end', 'center']) {
              const q = pointPaths(e, part);
              if (q) {
                model.fixed.add(varIndex(model, e.id, q[0], entities));
                model.fixed.add(varIndex(model, e.id, q[1], entities));
              }
            }
            if (e.type === 'circle' || e.type === 'arc') model.fixed.add(varIndex(model, e.id, 'radius', entities));
            if (e.type === 'lwpolyline') e.vertices.forEach((_, i) => {
              model.fixed.add(varIndex(model, e.id, `vertices.${i}.x`, entities));
              model.fixed.add(varIndex(model, e.id, `vertices.${i}.y`, entities));
            });
          }
          break;
        }
      }
      continue;
    }
    // dimensionales
    const target = dimValues[c.id];
    if (target === undefined || !Number.isFinite(target)) continue;
    switch (c.type) {
      case 'radius':
      case 'diameter': {
        const rr = r0 && R(r0);
        if (rr !== null && rr !== undefined) out.push({ id: c.id, f: (x) => [(c.type === 'diameter' ? 2 : 1) * x[rr] - target] });
        break;
      }
      case 'angular': {
        const s1 = r0 && S(r0);
        const s2 = r1 && S(r1);
        if (!s1 || !s2) break;
        out.push({
          id: c.id,
          f: (x) => {
            const a1 = Math.atan2(x[s1[1][1]] - x[s1[0][1]], x[s1[1][0]] - x[s1[0][0]]);
            const a2 = Math.atan2(x[s2[1][1]] - x[s2[0][1]], x[s2[1][0]] - x[s2[0][0]]);
            return [normAngleSigned(a2 - a1 - target)];
          },
        });
        break;
      }
      case 'linear-h':
      case 'linear-v':
      case 'aligned': {
        let a: [number, number] | null = null;
        let b: [number, number] | null = null;
        if (r1) {
          a = P(r0!);
          b = P(r1);
        } else if (r0) {
          const s = S(r0);
          if (s) [a, b] = s;
        }
        if (!a || !b) break;
        const A = a;
        const B = b;
        if (c.type === 'aligned') out.push({ id: c.id, f: (x) => [Math.hypot(x[B[0]] - x[A[0]], x[B[1]] - x[A[1]]) - target] });
        else {
          const k = c.type === 'linear-h' ? 0 : 1;
          const sign = Math.sign(model.values[B[k]] - model.values[A[k]]) || 1;
          out.push({ id: c.id, f: (x) => [(x[B[k]] - x[A[k]]) * sign - target] });
        }
        break;
      }
    }
  }
  return out;
}

export function solveConstraints(entityList: Entity[], constraints: BlockConstraint[], dimValues: Record<Id, number>, opts: { maxIter?: number; tol?: number } = {}): SolveResult {
  const entities = new Map(entityList.map((e) => [e.id, e]));
  if (!constraints.length) return { entities, status: 'no-constraints', residual: 0, iterations: 0, conflicts: [] };
  const model: Model = { vars: [], index: new Map(), values: [], fixed: new Set() };
  const residuals = buildResiduals(constraints, entities, model, dimValues);
  const free = model.vars.map((_, i) => i).filter((i) => !model.fixed.has(i));
  const x = [...model.values];
  const tol = opts.tol ?? 1e-10;
  const evalAll = (xx: number[]) => residuals.flatMap((r) => r.f(xx));
  let r = evalAll(x);
  let norm = Math.sqrt(r.reduce((s, v) => s + v * v, 0));
  const initialNorm = norm;
  let iter = 0;
  const maxIter = opts.maxIter ?? 80;
  let lambda = 1e-9;
  while (norm > tol && iter < maxIter && free.length && r.length) {
    iter++;
    const m = r.length;
    const n = free.length;
    // Jacobiano J[m×n]
    const J: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
    for (let j = 0; j < n; j++) {
      const vi = free[j];
      const h = 1e-7 * Math.max(1, Math.abs(x[vi]));
      const xp = [...x];
      const xm = [...x];
      xp[vi] += h;
      xm[vi] -= h;
      const rp = evalAll(xp);
      const rm = evalAll(xm);
      for (let i = 0; i < m; i++) J[i][j] = (rp[i] - rm[i]) / (2 * h);
    }
    // (J Jᵀ + λI) y = −r ; Δ = Jᵀ y
    const A: number[][] = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => J[i].reduce((s, v, j) => s + v * J[k][j], 0) + (i === k ? lambda : 0)));
    const y = solveLinear(A, r.map((v) => -v));
    if (!y) {
      lambda = lambda * 10 + 1e-8;
      if (lambda > 1e6) break;
      continue;
    }
    const delta = new Array<number>(n).fill(0);
    for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) delta[j] += J[i][j] * y[i];
    const trial = [...x];
    for (let j = 0; j < n; j++) trial[free[j]] += delta[j];
    const rt = evalAll(trial);
    const nt = Math.sqrt(rt.reduce((s, v) => s + v * v, 0));
    if (nt < norm || nt <= tol) {
      for (let j = 0; j < n; j++) x[free[j]] = trial[free[j]];
      r = rt;
      norm = nt;
      lambda = Math.max(1e-12, lambda / 10);
    } else {
      lambda = lambda * 10 + 1e-8;
      if (lambda > 1e6) break;
    }
  }
  const out = new Map(entities);
  model.vars.forEach((v, i) => {
    if (Math.abs(x[i] - model.values[i]) > 0) out.set(v.entityId, setPath(out.get(v.entityId)!, v.path, x[i]));
  });
  const conflicts: Id[] = [];
  for (const res of residuals) {
    const vals = res.f(x);
    if (vals.some((v) => Math.abs(v) > 1e-6)) conflicts.push(res.id);
  }
  const status = norm <= Math.max(tol, 1e-7) ? (initialNorm <= tol ? 'unchanged' : 'solved') : 'inconsistent';
  return { entities: out, status, residual: norm, iterations: iter, conflicts };
}
