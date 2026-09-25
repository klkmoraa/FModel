import type { Curve } from './curves';
import { curveDerivative, curveLength, curvePoint, tessellateCurve } from './curves';
import { TAU } from './angle';
import type { Vec2 } from './vec';

/**
 * Propiedades de masa de regiones planas (MASSPROP) por integrales de contorno (Green):
 *   A = ½∮(x dy − y dx)   Qy = ∮ x²/2 dy   Qx = −∮ y²/2 dx
 *   Ixx = −∮ y³/3 dx      Iyy = ∮ x³/3 dy   Ixy = ∮ x²y/2 dy
 * Líneas y arcos se integran con Gauss-Legendre por tramos (exacto a precisión de máquina
 * para polinomios y trigonométricas en tramos cortos). Las splines se aproximan y lo indican.
 * Se integra respecto a un origen local para no perder cifras con coordenadas grandes.
 */

export interface MassProperties {
  area: number;
  perimeter: number;
  centroid: Vec2;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** momentos y producto de inercia respecto a ejes paralelos a X/Y por el centroide */
  ixx: number;
  iyy: number;
  ixy: number;
  /** momentos respecto al origen del dibujo */
  ixxOrigin: number;
  iyyOrigin: number;
  ixyOrigin: number;
  /** momentos principales (i1 ≥ i2) y ángulo del eje de i1 respecto a X, en radianes */
  principal: { i1: number; i2: number; angle: number };
  /** radios de giro respecto a los ejes centroidales X/Y */
  radii: { rx: number; ry: number };
  /** false si alguna curva (spline) se aproximó */
  exact: boolean;
}

// Gauss-Legendre de 8 puntos en [0, 1]
const GL_X = [0.019855071751231856, 0.10166676129318664, 0.2372337950418355, 0.4082826787521751, 0.5917173212478249, 0.7627662049581645, 0.8983332387068134, 0.9801449282487681];
const GL_W = [0.05061426814518813, 0.11119051722668724, 0.15685332293894363, 0.18134189168918097, 0.18134189168918097, 0.15685332293894363, 0.11119051722668724, 0.05061426814518813];

interface Sums {
  a: number;
  qx: number;
  qy: number;
  ixx: number;
  iyy: number;
  ixy: number;
}

const zero = (): Sums => ({ a: 0, qx: 0, qy: 0, ixx: 0, iyy: 0, ixy: 0 });

/** Tramos integrables de una curva: [curva, t0, t1]; las splines pasan a polilínea. */
function pieces(c: Curve): { curve: Curve; t0: number; t1: number; exact: boolean }[] {
  if (c.kind === 'arc' || c.kind === 'ellipse') {
    const n = Math.max(1, Math.ceil(Math.abs(c.sweep) / (TAU / 16)));
    return Array.from({ length: n }, (_, i) => ({ curve: c, t0: i / n, t1: (i + 1) / n, exact: true }));
  }
  if (c.kind === 'spline') {
    const pts = tessellateCurve(c, 1e-6, 20000);
    return pts.slice(1).map((p, i) => ({ curve: { kind: 'line' as const, a: pts[i], b: p }, t0: 0, t1: 1, exact: false }));
  }
  if (c.kind === 'poly') return c.pts.slice(1).map((p, i) => ({ curve: { kind: 'line' as const, a: c.pts[i], b: p }, t0: 0, t1: 1, exact: true }));
  return [{ curve: c, t0: 0, t1: 1, exact: true }];
}

function loopSums(loop: Curve[], o: Vec2): { sums: Sums; exact: boolean } {
  const s = zero();
  let exact = true;
  for (const c of loop) {
    for (const piece of pieces(c)) {
      exact &&= piece.exact;
      const span = piece.t1 - piece.t0;
      for (let k = 0; k < GL_X.length; k++) {
        const t = piece.t0 + span * GL_X[k];
        const w = GL_W[k] * span;
        const p = curvePoint(piece.curve, t);
        const d = curveDerivative(piece.curve, t);
        const x = p.x - o.x;
        const y = p.y - o.y;
        s.a += w * 0.5 * (x * d.y - y * d.x);
        s.qy += w * ((x * x) / 2) * d.y;
        s.qx += w * (-(y * y) / 2) * d.x;
        s.iyy += w * ((x * x * x) / 3) * d.y;
        s.ixx += w * (-(y * y * y) / 3) * d.x;
        s.ixy += w * ((x * x * y) / 2) * d.y;
      }
    }
  }
  return { sums: s, exact };
}

function polygonOf(loop: Curve[]): Vec2[] {
  const out: Vec2[] = [];
  for (const c of loop) {
    const pts = tessellateCurve(c, 1e-4, 4000);
    out.push(...(out.length ? pts.slice(1) : pts));
  }
  return out;
}

function inside(p: Vec2, poly: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * Propiedades de masa de un conjunto de lazos cerrados. Los lazos anidados se restan por
 * paridad (un hueco dentro de un contorno resta; una isla dentro del hueco vuelve a sumar),
 * con independencia del sentido en que estén dibujados. null si el área es nula.
 */
export function massProperties(loops: Curve[][]): MassProperties | null {
  const valid = loops.filter((l) => l.length > 0);
  if (!valid.length) return null;
  const first = curvePoint(valid[0][0], 0);
  const o = { x: first.x, y: first.y };
  const info = valid.map((loop) => ({ loop, ...loopSums(loop, o), poly: polygonOf(loop) }));
  const total = zero();
  let exact = true;
  for (const item of info) {
    const probe = item.poly[0];
    const depth = info.filter((other) => other !== item && Math.abs(other.sums.a) > Math.abs(item.sums.a) && inside(probe, other.poly)).length;
    const sign = (depth % 2 === 0 ? 1 : -1) * (Math.sign(item.sums.a) || 1);
    for (const k of Object.keys(total) as (keyof Sums)[]) total[k] += sign * item.sums[k];
    exact &&= item.exact;
  }
  const A = total.a;
  if (!(Math.abs(A) > 0) || !Number.isFinite(A)) return null;
  const cxl = total.qy / A;
  const cyl = total.qx / A;
  const ixx = total.ixx - A * cyl * cyl;
  const iyy = total.iyy - A * cxl * cxl;
  const ixy = total.ixy - A * cxl * cyl;
  const centroid = { x: o.x + cxl, y: o.y + cyl };
  const avg = (ixx + iyy) / 2;
  const rad = Math.hypot((ixx - iyy) / 2, ixy);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of info) for (const p of item.poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const perimeter = valid.reduce((sum, loop) => sum + loop.reduce((s, c) => s + curveLength(c), 0), 0);
  return {
    area: A,
    perimeter,
    centroid,
    bbox: { minX, minY, maxX, maxY },
    ixx,
    iyy,
    ixy,
    ixxOrigin: ixx + A * centroid.y * centroid.y,
    iyyOrigin: iyy + A * centroid.x * centroid.x,
    ixyOrigin: ixy + A * centroid.x * centroid.y,
    principal: { i1: avg + rad, i2: avg - rad, angle: rad > 0 ? 0.5 * Math.atan2(-2 * ixy, ixx - iyy) : 0 },
    radii: { rx: Math.sqrt(Math.max(0, ixx) / A), ry: Math.sqrt(Math.max(0, iyy) / A) },
    exact,
  };
}

/**
 * Suma de objetos independientes (no se restan entre sí aunque se solapen), trasladando los
 * momentos de cada uno al centroide conjunto con el teorema de Steiner.
 */
export function combineMassProperties(list: readonly MassProperties[]): MassProperties | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const area = list.reduce((s, m) => s + m.area, 0);
  if (!(Math.abs(area) > 0)) return null;
  const ref = list[0].centroid;
  const cx = ref.x + list.reduce((s, m) => s + m.area * (m.centroid.x - ref.x), 0) / area;
  const cy = ref.y + list.reduce((s, m) => s + m.area * (m.centroid.y - ref.y), 0) / area;
  let ixx = 0;
  let iyy = 0;
  let ixy = 0;
  for (const m of list) {
    const dx = m.centroid.x - cx;
    const dy = m.centroid.y - cy;
    ixx += m.ixx + m.area * dy * dy;
    iyy += m.iyy + m.area * dx * dx;
    ixy += m.ixy + m.area * dx * dy;
  }
  const avg = (ixx + iyy) / 2;
  const rad = Math.hypot((ixx - iyy) / 2, ixy);
  return {
    area,
    perimeter: list.reduce((s, m) => s + m.perimeter, 0),
    centroid: { x: cx, y: cy },
    bbox: {
      minX: Math.min(...list.map((m) => m.bbox.minX)),
      minY: Math.min(...list.map((m) => m.bbox.minY)),
      maxX: Math.max(...list.map((m) => m.bbox.maxX)),
      maxY: Math.max(...list.map((m) => m.bbox.maxY)),
    },
    ixx,
    iyy,
    ixy,
    ixxOrigin: ixx + area * cy * cy,
    iyyOrigin: iyy + area * cx * cx,
    ixyOrigin: ixy + area * cx * cy,
    principal: { i1: avg + rad, i2: avg - rad, angle: rad > 0 ? 0.5 * Math.atan2(-2 * ixy, ixx - iyy) : 0 },
    radii: { rx: Math.sqrt(Math.max(0, ixx) / area), ry: Math.sqrt(Math.max(0, iyy) / area) },
    exact: list.every((m) => m.exact),
  };
}
