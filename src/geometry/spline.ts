import { solveLinear, zeros } from './linalg';
import type { Vec2 } from './vec';
import { dist } from './vec';

/**
 * B-spline / NURBS 2D (compatible con la entidad SPLINE de DXF).
 * Dominio del parámetro: u ∈ [knots[degree], knots[ctrl.length]].
 */
export interface SplineData {
  degree: number;
  ctrl: Vec2[];
  knots: number[];
  weights?: number[];
  /** Puntos de ajuste originales (si se creó por interpolación). */
  fit?: Vec2[];
  closed?: boolean;
}

export function splineDomain(s: SplineData): [number, number] {
  return [s.knots[s.degree], s.knots[s.ctrl.length]];
}

export function findSpan(s: SplineData, u: number): number {
  const n = s.ctrl.length - 1;
  const p = s.degree;
  const U = s.knots;
  if (u >= U[n + 1]) return n;
  if (u <= U[p]) return p;
  let low = p;
  let high = n + 1;
  let mid = (low + high) >> 1;
  while (u < U[mid] || u >= U[mid + 1]) {
    if (u < U[mid]) high = mid;
    else low = mid;
    mid = (low + high) >> 1;
  }
  return mid;
}

function basisFuns(span: number, u: number, p: number, U: number[]): number[] {
  const N = new Array<number>(p + 1).fill(0);
  const left = new Array<number>(p + 1).fill(0);
  const right = new Array<number>(p + 1).fill(0);
  N[0] = 1;
  for (let j = 1; j <= p; j++) {
    left[j] = u - U[span + 1 - j];
    right[j] = U[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r];
      const temp = denom === 0 ? 0 : N[r] / denom;
      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

export function splinePoint(s: SplineData, u: number): Vec2 {
  const p = s.degree;
  const span = findSpan(s, u);
  const N = basisFuns(span, u, p, s.knots);
  let x = 0;
  let y = 0;
  let w = 0;
  for (let i = 0; i <= p; i++) {
    const cp = s.ctrl[span - p + i];
    const wi = s.weights ? s.weights[span - p + i] : 1;
    const f = N[i] * wi;
    x += f * cp.x;
    y += f * cp.y;
    w += f;
  }
  return w === 0 ? { x, y } : { x: x / w, y: y / w };
}

/** Derivada dP/du por diferencia central (suficiente para tangentes y Newton). */
export function splineDerivative(s: SplineData, u: number): Vec2 {
  const [u0, u1] = splineDomain(s);
  const h = (u1 - u0) * 1e-6 || 1e-6;
  const a = Math.max(u0, u - h);
  const b = Math.min(u1, u + h);
  const pa = splinePoint(s, a);
  const pb = splinePoint(s, b);
  const du = b - a || 1;
  return { x: (pb.x - pa.x) / du, y: (pb.y - pa.y) / du };
}

export function clampedUniformKnots(nCtrl: number, degree: number): number[] {
  const m = nCtrl + degree + 1;
  const knots: number[] = [];
  const interior = nCtrl - degree;
  for (let i = 0; i < m; i++) {
    if (i <= degree) knots.push(0);
    else if (i >= nCtrl) knots.push(1);
    else knots.push((i - degree) / interior);
  }
  return knots;
}

/** Spline de control con nudos uniformes sujetos. */
export function splineFromControl(ctrl: Vec2[], degree = 3, closed = false): SplineData {
  const p = Math.max(1, Math.min(degree, ctrl.length - 1));
  let pts = ctrl;
  if (closed && ctrl.length > p) pts = [...ctrl, ...ctrl.slice(0, p)];
  if (closed) {
    const m = pts.length + p + 1;
    const knots = Array.from({ length: m }, (_, i) => i / (m - 1));
    return { degree: p, ctrl: pts, knots, closed: true };
  }
  return { degree: p, ctrl: pts, knots: clampedUniformKnots(pts.length, p), closed };
}

/**
 * Interpolación global cúbica por puntos de ajuste (NURBS Book §9.2.1):
 * parametrización por longitud de cuerda y nudos por promedio.
 */
export function splineThroughPoints(fit: Vec2[], degree = 3): SplineData {
  const pts = fit.filter((p, i) => i === 0 || dist(p, fit[i - 1]) > 1e-12);
  const n = pts.length - 1;
  if (n < 1) return { degree: 1, ctrl: [...pts, ...pts], knots: [0, 0, 1, 1], fit: pts };
  const p = Math.min(degree, n);
  const d = pts.slice(1).reduce((s, q, i) => s + dist(q, pts[i]), 0) || 1;
  const params = [0];
  for (let i = 1; i <= n; i++) params.push(params[i - 1] + dist(pts[i], pts[i - 1]) / d);
  params[n] = 1;
  const knots: number[] = new Array(n + p + 2).fill(0);
  for (let i = 0; i <= p; i++) {
    knots[i] = 0;
    knots[n + p + 1 - i] = 1;
  }
  for (let j = 1; j <= n - p; j++) {
    let sum = 0;
    for (let i = j; i < j + p; i++) sum += params[i];
    knots[j + p] = sum / p;
  }
  const s: SplineData = { degree: p, ctrl: pts.map((q) => ({ ...q })), knots, fit: pts };
  const A = zeros(n + 1, n + 1);
  for (let i = 0; i <= n; i++) {
    const span = findSpan(s, params[i]);
    const N = basisFuns(span, params[i], p, knots);
    for (let k = 0; k <= p; k++) A[i][span - p + k] = N[k];
  }
  const xs = solveLinear(A, pts.map((q) => q.x));
  const ys = solveLinear(A, pts.map((q) => q.y));
  if (!xs || !ys) return splineFromControl(pts, p);
  s.ctrl = xs.map((x, i) => ({ x, y: ys[i] }));
  return s;
}

/** Teselado adaptativo por tramos de nudo; devuelve pares (punto, parámetro u). */
export function tessellateSpline(s: SplineData, tol = 1e-3): { p: Vec2; u: number }[] {
  const [u0, u1] = splineDomain(s);
  const spans: number[] = [];
  for (let i = s.degree; i < s.ctrl.length; i++) {
    const a = s.knots[i];
    const b = s.knots[i + 1];
    if (b > a) spans.push(a);
  }
  spans.push(u1);
  const out: { p: Vec2; u: number }[] = [{ p: splinePoint(s, u0), u: u0 }];
  const recurse = (a: number, pa: Vec2, b: number, pb: Vec2, depth: number) => {
    const m = (a + b) / 2;
    const pm = splinePoint(s, m);
    const q1 = splinePoint(s, (a + m) / 2);
    const q3 = splinePoint(s, (m + b) / 2);
    const dev = Math.max(chordDeviation(pa, pb, pm), chordDeviation(pa, pm, q1), chordDeviation(pm, pb, q3));
    if (depth < 12 && (dev > tol || depth < 2)) {
      recurse(a, pa, m, pm, depth + 1);
      recurse(m, pm, b, pb, depth + 1);
    } else {
      out.push({ p: pm, u: m });
      out.push({ p: pb, u: b });
    }
  };
  for (let i = 0; i < spans.length - 1; i++) {
    const a = spans[i];
    const b = spans[i + 1];
    recurse(a, splinePoint(s, a), b, splinePoint(s, b), 0);
  }
  return out;
}

function chordDeviation(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-15) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l;
}

/** Inserción de nudo (Boehm) `times` veces; funciona en coordenadas homogéneas para NURBS. */
export function insertKnot(s: SplineData, u: number, times = 1): SplineData {
  let cur = s;
  for (let t = 0; t < times; t++) {
    const p = cur.degree;
    const k = findSpan(cur, u);
    const U = cur.knots;
    const hw = cur.ctrl.map((c, i) => {
      const w = cur.weights ? cur.weights[i] : 1;
      return { x: c.x * w, y: c.y * w, w };
    });
    const nh: { x: number; y: number; w: number }[] = [];
    for (let i = 0; i <= k - p; i++) nh.push(hw[i]);
    for (let i = k - p + 1; i <= k; i++) {
      const denom = U[i + p] - U[i];
      const a = denom === 0 ? 0 : (u - U[i]) / denom;
      nh.push({
        x: (1 - a) * hw[i - 1].x + a * hw[i].x,
        y: (1 - a) * hw[i - 1].y + a * hw[i].y,
        w: (1 - a) * hw[i - 1].w + a * hw[i].w,
      });
    }
    for (let i = k; i < hw.length; i++) nh.push(hw[i]);
    const knots = [...U.slice(0, k + 1), u, ...U.slice(k + 1)];
    const rational = !!cur.weights;
    cur = {
      degree: p,
      knots,
      ctrl: nh.map((h) => ({ x: h.x / (h.w || 1), y: h.y / (h.w || 1) })),
      weights: rational ? nh.map((h) => h.w) : undefined,
    };
  }
  return cur;
}

function multiplicity(knots: number[], u: number): number {
  return knots.reduce((m, k) => (Math.abs(k - u) < 1e-12 ? m + 1 : m), 0);
}

/** Divide la spline en u. Devuelve [izquierda, derecha]; cualquiera puede ser null si u está en un extremo. */
export function splitSpline(s: SplineData, u: number): [SplineData | null, SplineData | null] {
  const [u0, u1] = splineDomain(s);
  if (u <= u0 + 1e-12) return [null, s];
  if (u >= u1 - 1e-12) return [s, null];
  const p = s.degree;
  const mult = multiplicity(s.knots, u);
  const r = insertKnot(s, u, Math.max(0, p + 1 - mult));
  const k = r.knots.findIndex((kk) => Math.abs(kk - u) < 1e-12);
  // Nudos: izquierda usa [0..k+p], derecha [k..end]
  const leftKnots = r.knots.slice(0, k + p + 1);
  const rightKnots = r.knots.slice(k);
  const nLeft = leftKnots.length - p - 1;
  const left: SplineData = {
    degree: p,
    knots: leftKnots,
    ctrl: r.ctrl.slice(0, nLeft),
    weights: r.weights?.slice(0, nLeft),
  };
  const right: SplineData = {
    degree: p,
    knots: rightKnots,
    ctrl: r.ctrl.slice(nLeft),
    weights: r.weights?.slice(nLeft),
  };
  return [normalizeKnots(left), normalizeKnots(right)];
}

export function normalizeKnots(s: SplineData): SplineData {
  const [a, b] = [s.knots[0], s.knots[s.knots.length - 1]];
  const span = b - a || 1;
  return { ...s, knots: s.knots.map((k) => (k - a) / span) };
}

export function reverseSpline(s: SplineData): SplineData {
  const [a, b] = [s.knots[0], s.knots[s.knots.length - 1]];
  return {
    ...s,
    ctrl: [...s.ctrl].reverse(),
    weights: s.weights ? [...s.weights].reverse() : undefined,
    knots: [...s.knots].reverse().map((k) => a + b - k),
    fit: s.fit ? [...s.fit].reverse() : undefined,
  };
}
