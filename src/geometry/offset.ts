import { normAngleSigned, TAU } from './angle';
import type { ArcCurve, Curve } from './curves';
import {
  closestParam,
  curveDerivative,
  curveEnd,
  curvePoint,
  curveStart,
  distanceToCurve,
  isClosedCurve,
  subCurve,
  tessellateWithParams,
} from './curves';
import { intersectCurves } from './intersect';
import type { PolyVertex } from './polyline';
import { curvesToVertices, polylineSegments } from './polyline';
import { splineThroughPoints } from './spline';
import type { Vec2 } from './vec';
import { add, cross, dist, normalize, perp, samePoint, scale, sub } from './vec';
import { TOL } from './tolerance';

/**
 * Lado de un punto respecto a una curva: +1 a la izquierda del sentido de
 * avance, −1 a la derecha. Para curvas cerradas CCW la izquierda es el interior.
 */
export function sideOfCurve(c: Curve, p: Vec2): 1 | -1 {
  const t = closestParam(c, p);
  const q = curvePoint(c, t);
  let d = curveDerivative(c, t);
  if (Math.hypot(d.x, d.y) < 1e-15) d = curveDerivative(c, Math.min(1, t + 1e-6));
  const s = cross(d, sub(p, q));
  if (Math.abs(s) < 1e-15 && c.kind === 'arc') return Math.hypot(p.x - c.c.x, p.y - c.c.y) < c.r ? (c.sweep > 0 ? 1 : -1) : c.sweep > 0 ? -1 : 1;
  return s >= 0 ? 1 : -1;
}

/**
 * Offset de una curva simple. `d` > 0 desplaza a la izquierda del sentido de avance.
 * Devuelve null si la curva colapsa (radio ≤ 0).
 */
export function offsetCurve(c: Curve, d: number): Curve | null {
  switch (c.kind) {
    case 'line': {
      const n = scale(perp(normalize(sub(c.b, c.a))), d);
      return { kind: 'line', a: add(c.a, n), b: add(c.b, n) };
    }
    case 'ray':
    case 'xline': {
      const n = scale(perp(c.d), d);
      return { ...c, o: add(c.o, n) };
    }
    case 'arc': {
      const r = c.sweep >= 0 ? c.r - d : c.r + d;
      if (r <= 1e-12) return null;
      return { ...c, r };
    }
    case 'ellipse':
    case 'spline':
    case 'poly': {
      const samples = tessellateWithParams(c, 1e-4);
      const pts: Vec2[] = [];
      for (const s of samples) {
        let der = curveDerivative(c, s.t);
        if (Math.hypot(der.x, der.y) < 1e-15) der = curveDerivative(c, Math.min(1, s.t + 1e-6));
        pts.push(add(s.p, scale(perp(normalize(der)), d)));
      }
      if (c.kind === 'poly') return { kind: 'poly', pts };
      // Reducir muestras para un ajuste estable
      const step = Math.max(1, Math.floor(pts.length / 64));
      const fit = pts.filter((_, i) => i % step === 0);
      if (!samePoint(fit[fit.length - 1], pts[pts.length - 1])) fit.push(pts[pts.length - 1]);
      return { kind: 'spline', s: splineThroughPoints(fit, 3) };
    }
  }
}

/** Mueve el inicio o el fin de una línea/arco al punto p (que debe estar sobre su extensión). */
export function setCurveEndpoint(c: Curve, which: 'start' | 'end', p: Vec2): Curve {
  if (c.kind === 'line') return which === 'start' ? { ...c, a: p } : { ...c, b: p };
  if (c.kind === 'arc') {
    const ang = Math.atan2(p.y - c.c.y, p.x - c.c.x);
    if (which === 'start') {
      const end = c.a0 + c.sweep;
      let sweep = normAngleSigned(end - ang);
      if (Math.sign(sweep) !== Math.sign(c.sweep) && Math.abs(sweep) > 1e-9) sweep += Math.sign(c.sweep) * TAU;
      return { ...c, a0: ang, sweep };
    }
    let sweep = normAngleSigned(ang - c.a0);
    if (Math.sign(sweep) !== Math.sign(c.sweep) && Math.abs(sweep) > 1e-9) sweep += Math.sign(c.sweep) * TAU;
    return { ...c, sweep };
  }
  return c;
}

function joinArc(center: Vec2, from: Vec2, to: Vec2, leftTurn: boolean): ArcCurve {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  let sweep = normAngleSigned(a1 - a0);
  if (leftTurn && sweep < 0) sweep += TAU;
  if (!leftTurn && sweep > 0) sweep -= TAU;
  return { kind: 'arc', c: center, r: dist(center, from), a0, sweep };
}

/**
 * Offset de una polilínea (líneas + arcos) con limpieza global de lazos:
 * 1. offset por segmento; 2. unión por intersección extendida o arco de unión;
 * 3. partición en autointersecciones; 4. se descartan los tramos más cercanos
 * que |d| a la polilínea original; 5. se reconectan cadenas.
 */
export function offsetPolyline(vertices: PolyVertex[], closed: boolean, d: number, tol = TOL.LINEAR): { vertices: PolyVertex[]; closed: boolean }[] {
  const segs = polylineSegments(vertices, closed);
  if (!segs.length) return [];
  const n = segs.length;
  const joined: (Curve | null)[] = segs.map((s) => offsetCurve(s, d));
  const joinArcs = new Map<number, Curve>();
  // Unir tramos consecutivos
  for (let i = 0; i < n; i++) {
    const j = i + 1;
    if (j >= n && !closed) break;
    const jj = j % n;
    const a = joined[i];
    const b = joined[jj];
    if (!a || !b) continue;
    const ea = curveEnd(a);
    const sb = curveStart(b);
    if (samePoint(ea, sb, tol)) continue;
    const vertex = curveStart(segs[jj]);
    const hits = intersectCurves(a, b, { extend1: true, extend2: true, tol });
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const h of hits) {
      const dd = dist(h.p, vertex);
      if (dd < bestD) {
        bestD = dd;
        best = h.p;
      }
    }
    // Un vértice convexo puede unirse por extensión (inglete) si queda razonablemente cerca.
    const ta = curveDerivative(segs[i], 1);
    const tb = curveDerivative(segs[jj], 0);
    const turn = cross(ta, tb);
    const convexForOffset = (turn < 0 && d > 0) || (turn > 0 && d < 0);
    if (best && (bestD <= Math.abs(d) * 4 || !convexForOffset)) {
      joined[i] = setCurveEndpoint(a, 'end', best);
      joined[jj] = setCurveEndpoint(b, 'start', best);
    } else {
      joinArcs.set(i, joinArc(vertex, ea, sb, turn > 0));
    }
  }
  const chain: Curve[] = [];
  for (let i = 0; i < n; i++) {
    const c = joined[i];
    if (c) chain.push(c);
    const arc = joinArcs.get(i);
    if (arc) chain.push(arc);
  }
  // Conectar huecos por colapsos con líneas rectas
  const bridged: Curve[] = [];
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    const prev = bridged[bridged.length - 1];
    if (prev && !samePoint(curveEnd(prev), curveStart(c), tol)) bridged.push({ kind: 'line', a: curveEnd(prev), b: curveStart(c) });
    bridged.push(c);
  }
  if (closed && bridged.length > 1 && !samePoint(curveEnd(bridged[bridged.length - 1]), curveStart(bridged[0]), tol)) {
    bridged.push({ kind: 'line', a: curveEnd(bridged[bridged.length - 1]), b: curveStart(bridged[0]) });
  }
  const pieces = splitAtSelfIntersections(bridged, tol);
  const original = segs;
  const keep = pieces.filter((piece) => {
    const probe = curvePoint(piece, 0.5);
    let md = Infinity;
    for (const s of original) md = Math.min(md, distanceToCurve(s, probe));
    const endsOk = [curvePoint(piece, 0.02), curvePoint(piece, 0.98)].every((q) => {
      let m = Infinity;
      for (const s of original) m = Math.min(m, distanceToCurve(s, q));
      return m >= Math.abs(d) - Math.max(1e-6, Math.abs(d) * 1e-4);
    });
    return md >= Math.abs(d) - Math.max(1e-6, Math.abs(d) * 1e-4) && endsOk;
  });
  return chainCurves(keep, tol * 10).map((ch) => curvesToVertices(ch, tol * 10));
}

function splitAtSelfIntersections(curves: Curve[], tol: number): Curve[] {
  const cuts: number[][] = curves.map(() => []);
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      for (const h of intersectCurves(curves[i], curves[j], { tol })) {
        cuts[i].push(h.t1);
        cuts[j].push(h.t2);
      }
    }
  }
  const out: Curve[] = [];
  curves.forEach((c, i) => {
    const ts = [0, ...cuts[i].filter((t) => t > 1e-9 && t < 1 - 1e-9).sort((a, b) => a - b), 1];
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < 1e-9) continue;
      const piece = subCurve(c, ts[k - 1], ts[k]);
      if (dist(curveStart(piece), curveEnd(piece)) > tol || isClosedCurve(piece)) out.push(piece);
    }
  });
  return out;
}

/** Agrupa curvas en cadenas conectadas por extremos (orientando cuando es necesario). */
export function chainCurves(curves: Curve[], tol: number): Curve[][] {
  const remaining = [...curves];
  const chains: Curve[][] = [];
  while (remaining.length) {
    const chain = [remaining.shift()!];
    let grew = true;
    while (grew) {
      grew = false;
      const end = curveEnd(chain[chain.length - 1]);
      const start = curveStart(chain[0]);
      for (let i = 0; i < remaining.length; i++) {
        const c = remaining[i];
        if (samePoint(curveStart(c), end, tol)) {
          chain.push(c);
        } else if (samePoint(curveEnd(c), start, tol)) {
          chain.unshift(c);
        } else continue;
        remaining.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}
