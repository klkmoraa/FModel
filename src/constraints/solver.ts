import { solveLinear } from '../geometry/linalg';
import { normAngleSigned } from '../geometry/angle';
import { TOL } from '../geometry/tolerance';
import type { BlockConstraint, Entity, GeoRef, Id } from '../document/types';

/**
 * Solver de restricciones 2D. Variables = coordenadas de los puntos que definen
 * las entidades implicadas. Resuelve r(x) = 0 con pasos de norma mínima
 *   Δx = −Jᵀ (J Jᵀ + λI)⁻¹ r
 * lo que mueve lo menos posible la geometría no restringida (comportamiento
 * esperado al editar un parámetro).
 *
 * El jacobiano es disperso (cada restricción solo depende de sus variables) y el
 * sistema se parte en grupos independientes; los grupos grandes usan LSQR en lugar
 * de la factorización densa para que un plano completo siga siendo interactivo.
 */

interface VarRef {
  entityId: Id;
  path: string; // p.ej. 'start.x', 'radius', 'vertices.2.y'
}

export type SolveStatus = 'solved' | 'unchanged' | 'inconsistent' | 'no-constraints';

export interface SolveResult {
  entities: Map<Id, Entity>;
  status: SolveStatus;
  residual: number;
  iterations: number;
  /** restricciones con residuo final apreciable */
  conflicts: Id[];
}

export interface SolveOptions {
  maxIter?: number;
  tol?: number;
  /**
   * Estado anterior de las entidades: las coordenadas que cambiaron respecto a él (la
   * edición del usuario) se conservan si el resto del sistema puede adaptarse.
   */
  previous?: ReadonlyMap<Id, Entity>;
  /** Entidades que se prefiere no mover (p. ej. el primer objeto designado). */
  prefer?: ReadonlySet<Id>;
  /** Variables concretas (`entidad|ruta`) que se prefiere no mover. */
  preferKeys?: ReadonlySet<string>;
  /**
   * Anclas alternativas (`entidad|ruta`) en orden de prioridad: si todas juntas impiden la
   * solución, se prueba con cada grupo por separado antes de soltarlas.
   */
  preferKeyGroups?: readonly ReadonlySet<string>[];
  /** No aplica los cambios de un grupo que no puede satisfacerse. */
  onlyConsistent?: boolean;
  /** Un grupo con residuo inicial por debajo de este valor no se toca. */
  skipTol?: number;
  /** No toca los grupos que ya cumplen la tolerancia de aceptación (evita microajustes). */
  skipAccepted?: boolean;
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

/** Variables que definen la posición y tamaño de una entidad para el solver. */
export function entityVarPaths(e: Entity): string[] {
  switch (e.type) {
    case 'line':
      return ['start.x', 'start.y', 'end.x', 'end.y'];
    case 'circle':
      return ['center.x', 'center.y', 'radius'];
    case 'arc':
      return ['center.x', 'center.y', 'radius', 'startAngle', 'endAngle'];
    case 'ellipse':
      return ['center.x', 'center.y'];
    case 'lwpolyline':
      return e.vertices.flatMap((_, i) => [`vertices.${i}.x`, `vertices.${i}.y`]);
    case 'point':
    case 'text':
    case 'mtext':
    case 'attdef':
    case 'insert':
      return ['position.x', 'position.y'];
    default:
      return [];
  }
}

/** Entidades que el solver sabe restringir. */
export function isConstrainable(e: Entity): boolean {
  return entityVarPaths(e).length > 0;
}

/** Rutas de variables de un punto referenciado directamente por dos coordenadas. */
function pointPaths(e: Entity, part: string): [string, string] | null {
  const vert = /^vertex:(\d+)$/.exec(part);
  switch (e.type) {
    case 'line':
      if (part === 'start') return ['start.x', 'start.y'];
      if (part === 'end') return ['end.x', 'end.y'];
      return null;
    case 'circle':
    case 'arc':
    case 'ellipse':
      if (part === 'center') return ['center.x', 'center.y'];
      return null;
    case 'point':
      return ['position.x', 'position.y'];
    case 'lwpolyline':
      if (vert) {
        const index = Number(vert[1]);
        if (!Number.isSafeInteger(index) || index >= e.vertices.length) return null;
        return [`vertices.${index}.x`, `vertices.${index}.y`];
      }
      if (part === 'start') return e.vertices.length ? ['vertices.0.x', 'vertices.0.y'] : null;
      if (part === 'end') return e.vertices.length ? [`vertices.${e.vertices.length - 1}.x`, `vertices.${e.vertices.length - 1}.y`] : null;
      return null;
    case 'text':
    case 'mtext':
    case 'attdef':
    case 'insert':
      return ['position.x', 'position.y'];
    default:
      return null;
  }
}

/** Segmento lineal referenciado: [a, b] como pares de rutas. */
function segmentPaths(e: Entity, part: string): [[string, string], [string, string]] | null {
  if (e.type === 'line') return part === 'edge' || part === 'segment:0' ? [['start.x', 'start.y'], ['end.x', 'end.y']] : null;
  if (e.type === 'lwpolyline') {
    const m = /^segment:(\d+)$/.exec(part);
    const i = m ? Number(m[1]) : part === 'edge' ? 0 : -1;
    const segmentCount = e.closed ? e.vertices.length : e.vertices.length - 1;
    if (!Number.isSafeInteger(i) || i < 0 || i >= segmentCount) return null;
    const j = (i + 1) % e.vertices.length;
    return [[`vertices.${i}.x`, `vertices.${i}.y`], [`vertices.${j}.x`, `vertices.${j}.y`]];
  }
  return null;
}

/** Punto referenciado por una restricción (para dibujar sus glifos), o null si no aplica. */
export function refPoint(e: Entity, part: string): { x: number; y: number } | null {
  let p: { x: number; y: number } | null = null;
  if (e.type === 'arc' && (part === 'start' || part === 'end')) {
    const a = part === 'start' ? e.startAngle : e.endAngle;
    p = { x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) };
  } else if (e.type === 'line' && part === 'mid') {
    p = { x: (e.start.x + e.end.x) / 2, y: (e.start.y + e.end.y) / 2 };
  } else {
    const pp = pointPaths(e, part);
    if (pp) p = { x: getPath(e, pp[0]), y: getPath(e, pp[1]) };
  }
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
}

/** Segmento referenciado por una restricción, o null si no aplica. */
export function refSegment(e: Entity, part: string): [{ x: number; y: number }, { x: number; y: number }] | null {
  const s = segmentPaths(e, part);
  if (!s) return null;
  const a = { x: getPath(e, s[0][0]), y: getPath(e, s[0][1]) };
  const b = { x: getPath(e, s[1][0]), y: getPath(e, s[1][1]) };
  return [a, b].every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)) ? [a, b] : null;
}

/** ¿La referencia apunta a una característica que el solver entiende? */
export function refResolvable(e: Entity, part: string): boolean {
  if (part === 'edge' && (e.type === 'circle' || e.type === 'arc')) return true;
  return refPoint(e, part) !== null || refSegment(e, part) !== null;
}

interface Model {
  vars: VarRef[];
  index: Map<string, number>;
  values: number[];
  fixed: Set<number>;
  /** variables tocadas por la restricción que se está construyendo */
  touched: Set<number> | null;
}

function varIndex(model: Model, entityId: Id, path: string, entities: ReadonlyMap<Id, Entity>): number {
  const key = `${entityId}|${path}`;
  let i = model.index.get(key);
  if (i === undefined) {
    i = model.vars.length;
    model.vars.push({ entityId, path });
    model.index.set(key, i);
    model.values.push(getPath(entities.get(entityId), path));
  }
  model.touched?.add(i);
  return i;
}

type Residual = (x: number[]) => number[];
type PointFn = (x: number[]) => [number, number];

interface Built {
  id: Id;
  f: Residual;
  /** variables de las que depende (para el jacobiano disperso y los grupos) */
  deps: number[];
  /** número de componentes del residuo */
  size: number;
}

function buildResiduals(constraints: readonly BlockConstraint[], entities: ReadonlyMap<Id, Entity>, model: Model, dimValues: Record<Id, number>): Built[] {
  const out: Built[] = [];
  const V = (e: Entity, path: string) => varIndex(model, e.id, path, entities);
  /** Punto como función de las variables (incluye extremos de arco y punto medio). */
  const P = (ref: GeoRef): PointFn | null => {
    const e = entities.get(ref.entityId);
    if (!e) return null;
    if (e.type === 'arc' && (ref.part === 'start' || ref.part === 'end')) {
      const cx = V(e, 'center.x');
      const cy = V(e, 'center.y');
      const r = V(e, 'radius');
      const a = V(e, ref.part === 'start' ? 'startAngle' : 'endAngle');
      return (x) => [x[cx] + x[r] * Math.cos(x[a]), x[cy] + x[r] * Math.sin(x[a])];
    }
    if (e.type === 'line' && ref.part === 'mid') {
      const [ax, ay, bx, by] = ['start.x', 'start.y', 'end.x', 'end.y'].map((p) => V(e, p));
      return (x) => [(x[ax] + x[bx]) / 2, (x[ay] + x[by]) / 2];
    }
    const pp = pointPaths(e, ref.part);
    if (!pp) return null;
    const ix = V(e, pp[0]);
    const iy = V(e, pp[1]);
    return (x) => [x[ix], x[iy]];
  };
  const S = (ref: GeoRef): [[number, number], [number, number]] | null => {
    const e = entities.get(ref.entityId);
    if (!e) return null;
    const sp = segmentPaths(e, ref.part);
    if (!sp) return null;
    return [
      [V(e, sp[0][0]), V(e, sp[0][1])],
      [V(e, sp[1][0]), V(e, sp[1][1])],
    ];
  };
  const R = (ref: GeoRef): number | null => {
    const e = entities.get(ref.entityId);
    if (!e || (e.type !== 'circle' && e.type !== 'arc')) return null;
    return V(e, 'radius');
  };
  const C = (ref: GeoRef): [number, number] | null => {
    const e = entities.get(ref.entityId);
    if (!e || (e.type !== 'circle' && e.type !== 'arc' && e.type !== 'ellipse')) return null;
    return [V(e, 'center.x'), V(e, 'center.y')];
  };
  const push = (id: Id, size: number, f: Residual) => {
    out.push({ id, f, deps: [...(model.touched ?? [])], size });
  };
  const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;

  for (const c of constraints) {
    if (c.kind === 'geometric' && !c.enabled) continue;
    model.touched = new Set();
    const [r0, r1, r2] = c.refs;
    if (c.kind === 'geometric') {
      switch (c.type) {
        case 'coincident': {
          const a = r0 && P(r0);
          const b = r1 && P(r1);
          if (a && b)
            push(c.id, 2, (x) => {
              const pa = a(x);
              const pb = b(x);
              return [pa[0] - pb[0], pa[1] - pb[1]];
            });
          break;
        }
        case 'horizontal':
        case 'vertical': {
          const k = c.type === 'horizontal' ? 1 : 0;
          const s = r0 && !r1 ? S(r0) : null;
          if (s) push(c.id, 1, (x) => [x[s[0][k]] - x[s[1][k]]]);
          else {
            const a = r0 && P(r0);
            const b = r1 && P(r1);
            if (a && b) push(c.id, 1, (x) => [a(x)[k] - b(x)[k]]);
          }
          break;
        }
        case 'parallel':
        case 'perpendicular':
        case 'collinear': {
          const s1 = r0 && S(r0);
          const s2 = r1 && S(r1);
          if (!s1 || !s2) break;
          const type = c.type;
          push(c.id, type === 'collinear' ? 2 : 1, (x) => {
            const d1x = x[s1[1][0]] - x[s1[0][0]];
            const d1y = x[s1[1][1]] - x[s1[0][1]];
            const d2x = x[s2[1][0]] - x[s2[0][0]];
            const d2y = x[s2[1][1]] - x[s2[0][1]];
            const l1 = Math.hypot(d1x, d1y) || 1;
            const l2 = Math.hypot(d2x, d2y) || 1;
            if (type === 'perpendicular') return [(d1x * d2x + d1y * d2y) / (l1 * l2)];
            const par = (d1x * d2y - d1y * d2x) / (l1 * l2);
            if (type === 'parallel') return [par];
            const ox = x[s2[0][0]] - x[s1[0][0]];
            const oy = x[s2[0][1]] - x[s1[0][1]];
            return [par, (d1x * oy - d1y * ox) / l1];
          });
          break;
        }
        case 'equal': {
          const ra = r0 && R(r0);
          const rb = r1 && R(r1);
          if (has(ra) && has(rb)) {
            push(c.id, 1, (x) => [x[ra] - x[rb]]);
            break;
          }
          model.touched = new Set();
          const s1 = r0 && S(r0);
          const s2 = r1 && S(r1);
          if (s1 && s2) push(c.id, 1, (x) => [Math.hypot(x[s1[1][0]] - x[s1[0][0]], x[s1[1][1]] - x[s1[0][1]]) - Math.hypot(x[s2[1][0]] - x[s2[0][0]], x[s2[1][1]] - x[s2[0][1]])]);
          break;
        }
        case 'concentric': {
          const a = r0 && C(r0);
          const b = r1 && C(r1);
          if (a && b) push(c.id, 2, (x) => [x[a[0]] - x[b[0]], x[a[1]] - x[b[1]]]);
          break;
        }
        case 'tangent': {
          const s = r0 && S(r0);
          const cc = r1 && C(r1);
          const rr = r1 && R(r1);
          if (s && cc && has(rr)) {
            const dx0 = model.values[s[1][0]] - model.values[s[0][0]];
            const dy0 = model.values[s[1][1]] - model.values[s[0][1]];
            const l0 = Math.hypot(dx0, dy0) || 1;
            const signed0 = (dx0 * (model.values[cc[1]] - model.values[s[0][1]]) - dy0 * (model.values[cc[0]] - model.values[s[0][0]])) / l0;
            // Conserva la rama de tangencia inicial para evitar la cúspide de |distancia|.
            const side = Math.sign(signed0) || 1;
            push(c.id, 1, (x) => {
              const dx = x[s[1][0]] - x[s[0][0]];
              const dy = x[s[1][1]] - x[s[0][1]];
              const l = Math.hypot(dx, dy) || 1;
              const signed = (dx * (x[cc[1]] - x[s[0][1]]) - dy * (x[cc[0]] - x[s[0][0]])) / l;
              return [side * signed - x[rr]];
            });
            break;
          }
          model.touched = new Set();
          const c1 = r0 && C(r0);
          const c2 = r1 && C(r1);
          const ra = r0 && R(r0);
          const rb = r1 && R(r1);
          if (c1 && c2 && has(ra) && has(rb)) {
            const d0 = Math.hypot(model.values[c1[0]] - model.values[c2[0]], model.values[c1[1]] - model.values[c2[1]]);
            const external = Math.abs(d0 - (model.values[ra] + model.values[rb])) <= Math.abs(d0 - Math.abs(model.values[ra] - model.values[rb]));
            push(c.id, 1, (x) => [Math.hypot(x[c1[0]] - x[c2[0]], x[c1[1]] - x[c2[1]]) - (external ? x[ra] + x[rb] : Math.abs(x[ra] - x[rb]))]);
          }
          break;
        }
        case 'symmetric': {
          const a = r0 && P(r0);
          const b = r1 && P(r1);
          const axis = r2 && S(r2);
          if (!a || !b || !axis) break;
          push(c.id, 2, (x) => {
            const pa = a(x);
            const pb = b(x);
            const dx = x[axis[1][0]] - x[axis[0][0]];
            const dy = x[axis[1][1]] - x[axis[0][1]];
            const l = Math.hypot(dx, dy) || 1;
            const mx = (pa[0] + pb[0]) / 2 - x[axis[0][0]];
            const my = (pa[1] + pb[1]) / 2 - x[axis[0][1]];
            return [(dx * my - dy * mx) / l, ((pb[0] - pa[0]) * dx + (pb[1] - pa[1]) * dy) / l];
          });
          break;
        }
        case 'fixed': {
          const e = r0 ? entities.get(r0.entityId) : undefined;
          if (!e) break;
          if (r0.part !== 'edge' && e.type === 'arc' && (r0.part === 'start' || r0.part === 'end')) {
            for (const p of ['center.x', 'center.y', 'radius', r0.part === 'start' ? 'startAngle' : 'endAngle']) model.fixed.add(V(e, p));
            break;
          }
          const pp = r0.part === 'edge' ? null : pointPaths(e, r0.part);
          if (pp) {
            model.fixed.add(V(e, pp[0]));
            model.fixed.add(V(e, pp[1]));
          } else for (const p of entityVarPaths(e)) model.fixed.add(V(e, p));
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
        const k = c.type === 'diameter' ? 2 : 1;
        if (has(rr)) push(c.id, 1, (x) => [k * x[rr] - target]);
        break;
      }
      case 'angular': {
        const s1 = r0 && S(r0);
        const s2 = r1 && S(r1);
        if (!s1 || !s2) break;
        push(c.id, 1, (x) => {
          const a1 = Math.atan2(x[s1[1][1]] - x[s1[0][1]], x[s1[1][0]] - x[s1[0][0]]);
          const a2 = Math.atan2(x[s2[1][1]] - x[s2[0][1]], x[s2[1][0]] - x[s2[0][0]]);
          return [normAngleSigned(a2 - a1 - target)];
        });
        break;
      }
      case 'linear-h':
      case 'linear-v':
      case 'aligned': {
        let a: PointFn | null = null;
        let b: PointFn | null = null;
        if (r1) {
          a = P(r0!);
          b = P(r1);
        } else if (r0) {
          const s = S(r0);
          if (s) {
            a = (x) => [x[s[0][0]], x[s[0][1]]];
            b = (x) => [x[s[1][0]], x[s[1][1]]];
          }
        }
        if (!a || !b) break;
        const A = a;
        const B = b;
        if (c.type === 'aligned') {
          push(c.id, 1, (x) => {
            const pa = A(x);
            const pb = B(x);
            return [Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) - target];
          });
        } else {
          const k = c.type === 'linear-h' ? 0 : 1;
          const sign = Math.sign(B(model.values)[k] - A(model.values)[k]) || 1;
          push(c.id, 1, (x) => [(B(x)[k] - A(x)[k]) * sign - target]);
        }
        break;
      }
    }
  }
  model.touched = null;
  return out;
}

/**
 * Medida actual de una restricción dimensional en las unidades de su expresión
 * (unidades de dibujo; grados con signo para las angulares). null si no se puede medir.
 */
export function measureConstraint(c: BlockConstraint, entities: ReadonlyMap<Id, Entity>): number | null {
  if (c.kind !== 'dimensional') return null;
  const [r0, r1] = c.refs;
  const e0 = r0 ? entities.get(r0.entityId) : undefined;
  const e1 = r1 ? entities.get(r1.entityId) : undefined;
  if (!e0) return null;
  switch (c.type) {
    case 'radius':
    case 'diameter':
      return e0.type === 'circle' || e0.type === 'arc' ? e0.radius * (c.type === 'diameter' ? 2 : 1) : null;
    case 'angular': {
      const s0 = refSegment(e0, r0.part);
      const s1 = e1 && refSegment(e1, r1.part);
      if (!s0 || !s1) return null;
      const a0 = Math.atan2(s0[1].y - s0[0].y, s0[1].x - s0[0].x);
      const a1 = Math.atan2(s1[1].y - s1[0].y, s1[1].x - s1[0].x);
      return (normAngleSigned(a1 - a0) * 180) / Math.PI;
    }
    default: {
      let a: { x: number; y: number } | null;
      let b: { x: number; y: number } | null;
      if (e1) {
        a = refPoint(e0, r0.part);
        b = refPoint(e1, r1.part);
      } else {
        const s = refSegment(e0, r0.part);
        a = s?.[0] ?? null;
        b = s?.[1] ?? null;
      }
      if (!a || !b) return null;
      if (c.type === 'aligned') return Math.hypot(b.x - a.x, b.y - a.y);
      return Math.abs(c.type === 'linear-h' ? b.x - a.x : b.y - a.y);
    }
  }
}

/**
 * Variables (`entidad|ruta`) que actúan como ancla de una cota: al cambiar su valor se
 * prefiere mover el segundo punto y dejar quieto el primero (o el centro de un radio).
 */
export function anchorKeys(c: BlockConstraint, entities: ReadonlyMap<Id, Entity>): string[] {
  const r0 = c.refs[0];
  const e = r0 && entities.get(r0.entityId);
  if (!e || c.kind !== 'dimensional') return [];
  const key = (p: string) => `${e.id}|${p}`;
  if (c.type === 'radius' || c.type === 'diameter') return e.type === 'circle' || e.type === 'arc' ? [key('center.x'), key('center.y')] : [];
  const seg = segmentPaths(e, r0.part);
  if (c.type === 'angular') return seg ? [...seg[0], ...seg[1]].map(key) : [];
  if (c.refs.length === 1) return seg ? seg[0].map(key) : [];
  if (e.type === 'arc' && (r0.part === 'start' || r0.part === 'end')) return ['center.x', 'center.y', 'radius', r0.part === 'start' ? 'startAngle' : 'endAngle'].map(key);
  const pp = pointPaths(e, r0.part);
  return pp ? pp.map(key) : [];
}

// ------------------------------------------------------------------ álgebra dispersa

interface SparseRow {
  cols: number[];
  vals: number[];
}

/** Jacobiano disperso por diferencias centrales, restringido a las columnas libres. */
function sparseJacobian(residuals: Built[], x: number[], colOf: Map<number, number>): SparseRow[] {
  const rows: SparseRow[] = [];
  for (const res of residuals) {
    const local: SparseRow[] = Array.from({ length: res.size }, () => ({ cols: [], vals: [] }));
    for (const vi of res.deps) {
      const col = colOf.get(vi);
      if (col === undefined) continue;
      const h = 1e-7 * Math.max(1, Math.abs(x[vi]));
      const keep = x[vi];
      x[vi] = keep + h;
      const rp = res.f(x);
      x[vi] = keep - h;
      const rm = res.f(x);
      x[vi] = keep;
      for (let k = 0; k < res.size; k++) {
        const d = (rp[k] - rm[k]) / (2 * h);
        if (d !== 0 && Number.isFinite(d)) {
          local[k].cols.push(col);
          local[k].vals.push(d);
        }
      }
    }
    rows.push(...local);
  }
  return rows;
}

const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const norm2 = (a: number[]) => Math.sqrt(dot(a, a));

/**
 * LSQR (Paige y Saunders): min ‖A·x − b‖² + damp²‖x‖² sin formar AᵀA. Desde x₀ = 0 converge
 * a la solución de norma mínima, igual que la fórmula densa.
 */
function lsqr(rows: SparseRow[], n: number, b: number[], damp: number, iterLim: number): number[] {
  const m = rows.length;
  const Av = (v: number[]) => {
    const out = Array.from<number>({ length: m }).fill(0);
    for (let i = 0; i < m; i++) {
      const r = rows[i];
      let s = 0;
      for (let k = 0; k < r.cols.length; k++) s += r.vals[k] * v[r.cols[k]];
      out[i] = s;
    }
    return out;
  };
  const ATu = (u: number[]) => {
    const out = Array.from<number>({ length: n }).fill(0);
    for (let i = 0; i < m; i++) {
      const r = rows[i];
      const ui = u[i];
      if (!ui) continue;
      for (let k = 0; k < r.cols.length; k++) out[r.cols[k]] += r.vals[k] * ui;
    }
    return out;
  };
  const x = Array.from<number>({ length: n }).fill(0);
  let u = [...b];
  let beta = norm2(u);
  if (beta > 0) u = u.map((v) => v / beta);
  let v = ATu(u);
  let alpha = norm2(v);
  if (alpha > 0) v = v.map((t) => t / alpha);
  let w = [...v];
  let phibar = beta;
  let rhobar = alpha;
  const bnorm = beta;
  for (let it = 0; it < iterLim && alpha > 0 && beta > 0; it++) {
    const Avv = Av(v);
    u = Avv.map((t, i) => t - alpha * u[i]);
    beta = norm2(u);
    if (beta > 0) u = u.map((t) => t / beta);
    const ATuu = ATu(u);
    v = ATuu.map((t, i) => t - beta * v[i]);
    alpha = norm2(v);
    if (alpha > 0) v = v.map((t) => t / alpha);
    const rhobar1 = Math.hypot(rhobar, damp);
    const cs1 = rhobar / rhobar1;
    phibar = cs1 * phibar;
    const rho = Math.hypot(rhobar1, beta);
    if (rho === 0) break;
    const cs = rhobar1 / rho;
    const sn = beta / rho;
    const theta = sn * alpha;
    rhobar = -cs * alpha;
    const phi = cs * phibar;
    phibar = sn * phibar;
    const t1 = phi / rho;
    const t2 = -theta / rho;
    for (let j = 0; j < n; j++) {
      x[j] += t1 * w[j];
      w[j] = v[j] + t2 * w[j];
    }
    if (Math.abs(phibar) <= 1e-15 * bnorm || Math.abs(phibar * alpha * cs) <= 1e-15 * bnorm) break;
  }
  return x;
}

/** Tamaño a partir del cual el paso se calcula con LSQR en vez de la forma densa. */
const DENSE_MAX_ROWS = 160;

interface GroupSolve {
  x: number[];
  norm: number;
  iterations: number;
}

/** Levenberg–Marquardt de norma mínima sobre un grupo de residuos y sus variables libres. */
function solveGroup(residuals: Built[], x0: number[], free: number[], tol: number, maxIter: number): GroupSolve {
  const x = [...x0];
  const colOf = new Map(free.map((vi, j) => [vi, j]));
  const evalAll = (xx: number[]) => residuals.flatMap((r) => r.f(xx));
  let r = evalAll(x);
  let norm = norm2(r);
  let iter = 0;
  let lambda = 1e-9;
  const n = free.length;
  while (norm > tol && iter < maxIter && n && r.length) {
    iter++;
    const rows = sparseJacobian(residuals, x, colOf);
    const m = rows.length;
    let delta: number[] | null;
    if (m <= DENSE_MAX_ROWS) {
      // (J Jᵀ + λI) y = −r ; Δ = Jᵀ y
      const dense = rows.map((row) => {
        const d = Array.from<number>({ length: n }).fill(0);
        row.cols.forEach((c, k) => (d[c] = row.vals[k]));
        return d;
      });
      const A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => dot(dense[i], dense[k]) + (i === k ? lambda : 0)));
      const y = solveLinear(A, r.map((v) => -v));
      if (y) {
        delta = Array.from<number>({ length: n }).fill(0);
        for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) delta[j] += dense[i][j] * y[i];
      } else delta = null;
    } else {
      delta = lsqr(rows, n, r.map((v) => -v), Math.sqrt(lambda), Math.min(4 * n + 100, 20000));
    }
    if (!delta || delta.some((d) => !Number.isFinite(d))) {
      lambda = lambda * 10 + 1e-8;
      if (lambda > 1e6) break;
      continue;
    }
    const trial = [...x];
    for (let j = 0; j < n; j++) trial[free[j]] += delta[j];
    const rt = evalAll(trial);
    const nt = norm2(rt);
    if (Number.isFinite(nt) && (nt < norm || nt <= tol)) {
      for (let j = 0; j < n; j++) x[free[j]] = trial[free[j]];
      r = rt;
      norm = nt;
      lambda = Math.max(1e-12, lambda / 10);
    } else {
      lambda = lambda * 10 + 1e-8;
      if (lambda > 1e6) break;
    }
  }
  return { x, norm, iterations: iter };
}

/** Parte los residuos en grupos que no comparten variables libres. */
function groupsOf(residuals: Built[], fixed: Set<number>): Built[][] {
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  // cada residuo se representa por un nodo negativo para unir residuos sin variables libres
  residuals.forEach((res, i) => {
    const node = -1 - i;
    parent.set(node, node);
    for (const v of res.deps) {
      if (fixed.has(v)) continue;
      if (!parent.has(v)) parent.set(v, v);
      union(node, v);
    }
  });
  const groups = new Map<number, Built[]>();
  residuals.forEach((res, i) => {
    const root = find(-1 - i);
    let g = groups.get(root);
    if (!g) groups.set(root, (g = []));
    g.push(res);
  });
  return [...groups.values()];
}

function magnitude(values: number[], indices: Iterable<number>): number {
  let m = 0;
  for (const i of indices) if (Number.isFinite(values[i])) m = Math.max(m, Math.abs(values[i]));
  return m;
}

/** Residuo máximo admitido para dar por satisfecho un grupo con coordenadas de tamaño `mag`. */
export function acceptTol(mag: number): number {
  return Math.max(1e-7, mag * TOL.RELATIVE * 10);
}

export function solveConstraints(entityList: readonly Entity[], constraints: readonly BlockConstraint[], dimValues: Record<Id, number>, opts: SolveOptions = {}): SolveResult {
  const entities = new Map(entityList.map((e) => [e.id, e]));
  if (!constraints.length) return { entities, status: 'no-constraints', residual: 0, iterations: 0, conflicts: [] };
  const model: Model = { vars: [], index: new Map(), values: [], fixed: new Set(), touched: null };
  const residuals = buildResiduals(constraints, entities, model, dimValues);
  const baseTol = opts.tol ?? 1e-10;
  const maxIter = opts.maxIter ?? 80;
  // variables editadas por el usuario o de objetos preferidos: se intentan conservar
  const changed = new Set<number>();
  const preferred = new Set<number>();
  const keyGroups = (opts.preferKeyGroups ?? []).map(() => new Set<number>());
  model.vars.forEach((v, i) => {
    const prev = opts.previous?.get(v.entityId);
    if (prev && getPath(prev, v.path) !== model.values[i]) changed.add(i);
    const k = `${v.entityId}|${v.path}`;
    if (opts.prefer?.has(v.entityId) || opts.preferKeys?.has(k)) preferred.add(i);
    opts.preferKeyGroups?.forEach((g, gi) => {
      if (g.has(k)) keyGroups[gi].add(i);
    });
  });

  const x = [...model.values];
  let totalSq = 0;
  let initialSq = 0;
  let iterations = 0;
  let anyInconsistent = false;
  for (const group of groupsOf(residuals, model.fixed)) {
    const deps = new Set(group.flatMap((g) => g.deps));
    const mag = magnitude(x, deps);
    const tol = Math.max(baseTol, mag * TOL.RELATIVE);
    const ok = acceptTol(mag);
    const skip = opts.skipTol ?? (opts.skipAccepted ? ok : tol);
    const r0 = norm2(group.flatMap((g) => g.f(x)));
    initialSq += r0 * r0;
    if (!Number.isFinite(r0) || r0 <= skip) {
      totalSq += Number.isFinite(r0) ? r0 * r0 : 0;
      continue;
    }
    const allFree = [...deps].filter((i) => !model.fixed.has(i));
    // intentos de mayor a menor preferencia; se descartan los repetidos
    const attempts: Set<number>[] = [];
    const seen = new Set<string>();
    const tryPins = (pins: Set<number>) => {
      const id = [...pins].filter((i) => deps.has(i)).sort((a, b) => a - b).join(',');
      if (seen.has(id)) return;
      seen.add(id);
      attempts.push(pins);
    };
    const anchors = keyGroups.reduce((acc, g) => new Set([...acc, ...g]), new Set<number>());
    tryPins(new Set([...changed, ...preferred, ...anchors]));
    for (const g of keyGroups) tryPins(new Set([...changed, ...preferred, ...g]));
    tryPins(new Set([...changed, ...preferred]));
    tryPins(new Set(changed));
    tryPins(new Set());
    let best: GroupSolve | null = null;
    for (const pins of attempts) {
      const free = allFree.filter((i) => !pins.has(i));
      if (!free.length) continue;
      const res = solveGroup(group, x, free, tol, maxIter);
      iterations += res.iterations;
      if (!best || res.norm < best.norm) best = res;
      if (res.norm <= ok) {
        best = res;
        break;
      }
    }
    if (!best) {
      totalSq += r0 * r0;
      anyInconsistent = true;
      continue;
    }
    const consistent = best.norm <= ok;
    if (!consistent) anyInconsistent = true;
    if (consistent || !opts.onlyConsistent) for (const i of deps) x[i] = best.x[i];
    const rn = consistent || !opts.onlyConsistent ? best.norm : r0;
    totalSq += rn * rn;
  }
  const residual = Math.sqrt(totalSq);

  const out = new Map(entities);
  model.vars.forEach((v, i) => {
    if (x[i] !== model.values[i] && Number.isFinite(x[i])) out.set(v.entityId, setPath(out.get(v.entityId)!, v.path, x[i]));
  });
  const conflicts: Id[] = [];
  for (const res of residuals) {
    const mag = magnitude(x, res.deps);
    const vals = res.f(x);
    if (vals.some((v) => !Number.isFinite(v) || Math.abs(v) > Math.max(1e-6, mag * 1e-10))) conflicts.push(res.id);
  }
  const status: SolveStatus = anyInconsistent ? 'inconsistent' : Math.sqrt(initialSq) <= baseTol || iterations === 0 ? 'unchanged' : 'solved';
  return { entities: out, status, residual, iterations, conflicts: [...new Set(conflicts)] };
}

// ------------------------------------------------------------------ grados de libertad

export type FreedomState = 'full' | 'partial';

/**
 * Qué entidades quedan totalmente determinadas por sus restricciones. Una variable está
 * determinada si no aparece en el núcleo del jacobiano (ningún movimiento infinitesimal
 * compatible con las restricciones la cambia); sin una restricción «fija» siempre queda
 * libre al menos la traslación, como en cualquier croquis paramétrico.
 * Devuelve null si el sistema supera `maxVars` (el análisis es O(n³)).
 */
export function analyzeFreedom(entityList: readonly Entity[], constraints: readonly BlockConstraint[], dimValues: Record<Id, number>, maxGroupVars = 600): Map<Id, FreedomState> | null {
  const entities = new Map(entityList.map((e) => [e.id, e]));
  const model: Model = { vars: [], index: new Map(), values: [], fixed: new Set(), touched: null };
  const residuals = buildResiduals(constraints, entities, model, dimValues);
  const involved = new Set(model.vars.map((v) => v.entityId));
  for (const id of involved) {
    const e = entities.get(id);
    if (e) for (const p of entityVarPaths(e)) varIndex(model, id, p, entities);
  }
  const determined = new Set<number>(model.fixed);
  for (const group of groupsOf(residuals, model.fixed)) {
    const free = [...new Set(group.flatMap((g) => g.deps))].filter((i) => !model.fixed.has(i));
    if (free.length > maxGroupVars) return null;
    const colOf = new Map(free.map((vi, j) => [vi, j]));
    const pivotRows = rref(sparseJacobian(group, [...model.values], colOf), free.length);
    for (const { col, row } of pivotRows) {
      let alone = true;
      for (let j = 0; j < free.length && alone; j++) if (j !== col && !pivotRows.pivotCols.has(j) && Math.abs(row[j]) > 1e-8) alone = false;
      if (alone) determined.add(free[col]);
    }
  }
  const out = new Map<Id, FreedomState>();
  for (const id of involved) {
    const e = entities.get(id);
    if (!e) continue;
    const all = entityVarPaths(e).every((p) => determined.has(model.index.get(`${id}|${p}`) ?? -1));
    out.set(id, all ? 'full' : 'partial');
  }
  return out;
}

/** Rango numérico del jacobiano de un conjunto de restricciones (para detectar redundancias). */
export function constraintRank(entityList: readonly Entity[], constraints: readonly BlockConstraint[], dimValues: Record<Id, number>): number {
  const entities = new Map(entityList.map((e) => [e.id, e]));
  const model: Model = { vars: [], index: new Map(), values: [], fixed: new Set(), touched: null };
  const residuals = buildResiduals(constraints, entities, model, dimValues);
  let rank = 0;
  for (const group of groupsOf(residuals, model.fixed)) {
    const free = [...new Set(group.flatMap((g) => g.deps))].filter((i) => !model.fixed.has(i));
    const colOf = new Map(free.map((vi, j) => [vi, j]));
    rank += rref(sparseJacobian(group, [...model.values], colOf), free.length).length;
  }
  return rank;
}

/** Forma escalonada reducida (Gauss-Jordan con pivoteo parcial por columnas). */
function rref(rows: SparseRow[], n: number): { col: number; row: number[] }[] & { pivotCols: Set<number> } {
  const M = rows.map((r) => {
    const d = Array.from<number>({ length: n }).fill(0);
    r.cols.forEach((c, k) => (d[c] += r.vals[k]));
    return d;
  });
  let scale = 0;
  for (const r of M) for (const v of r) scale = Math.max(scale, Math.abs(v));
  const eps = Math.max(1e-12, scale * 1e-9);
  const pivots = [] as unknown as { col: number; row: number[] }[] & { pivotCols: Set<number> };
  pivots.pivotCols = new Set();
  let lead = 0;
  for (let col = 0; col < n && lead < M.length; col++) {
    let best = lead;
    for (let r = lead + 1; r < M.length; r++) if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    if (Math.abs(M[best][col]) <= eps) continue;
    [M[lead], M[best]] = [M[best], M[lead]];
    const p = M[lead][col];
    for (let j = 0; j < n; j++) M[lead][j] /= p;
    for (let r = 0; r < M.length; r++) {
      if (r === lead) continue;
      const f = M[r][col];
      if (Math.abs(f) <= 0) continue;
      for (let j = 0; j < n; j++) M[r][j] -= f * M[lead][j];
    }
    pivots.push({ col, row: M[lead] });
    pivots.pivotCols.add(col);
    lead++;
  }
  return pivots;
}
