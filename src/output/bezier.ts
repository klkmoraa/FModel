import type { Mat2D } from '../geometry/matrix';
import { applyToPoint } from '../geometry/matrix';
import type { PathCmd } from '../model/graphics';
import { sweepOf } from '../model/graphics';

/** Comando de trazado de salida: solo segmentos rectos y Bézier cúbicas (invariantes afines). */
export type OutCmd = { t: 'M'; x: number; y: number } | { t: 'L'; x: number; y: number } | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { t: 'Z' };
const MAX_ARC_CUBICS = 4096;

/**
 * Arco de elipse (centro, semiejes, rotación, ángulos paramétricos) como cúbicas de ≤ 90°.
 * El error radial máximo es 2.7e-4 · r, por debajo de la precisión de trazado en cualquier escala útil.
 * Devuelve los segmentos sin el punto inicial (se asume ya situado en el arco).
 */
export function ellipseArcToCubics(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, sweep: number): OutCmd[] {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  if (!Number.isFinite(n) || n > MAX_ARC_CUBICS) throw new RangeError('El arco necesita demasiados segmentos. / The arc needs too many segments.');
  const step = sweep / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const map = (u: number, v: number) => ({ x: cx + rx * u * cr - ry * v * sr, y: cy + rx * u * sr + ry * v * cr });
  const out: OutCmd[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * step;
    const t1 = t0 + step;
    const c0 = Math.cos(t0);
    const s0 = Math.sin(t0);
    const c1 = Math.cos(t1);
    const s1 = Math.sin(t1);
    const p1 = map(c0 - k * s0, s0 + k * c0);
    const p2 = map(c1 + k * s1, s1 - k * c1);
    const p3 = map(c1, s1);
    out.push({ t: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p3.x, y: p3.y });
  }
  return out;
}

/** Convierte los comandos de una lista de visualización a coordenadas de salida con la matriz dada. */
export function toOutPath(cmds: readonly PathCmd[], m: Mat2D): OutCmd[] {
  const out: OutCmd[] = [];
  const tp = (x: number, y: number) => applyToPoint(m, { x, y });
  let hasCurrent = false;
  for (const c of cmds) {
    switch (c.t) {
      case 'M': {
        const p = tp(c.x, c.y);
        out.push({ t: 'M', x: p.x, y: p.y });
        hasCurrent = true;
        break;
      }
      case 'L': {
        const p = tp(c.x, c.y);
        out.push({ t: hasCurrent ? 'L' : 'M', x: p.x, y: p.y });
        hasCurrent = true;
        break;
      }
      case 'A':
      case 'E': {
        const rx = c.t === 'A' ? c.r : c.rx;
        const ry = c.t === 'A' ? c.r : c.ry;
        const rot = c.t === 'A' ? 0 : c.rot;
        const sweep = sweepOf(c.a0, c.a1, c.ccw);
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        const u = Math.cos(c.a0);
        const v = Math.sin(c.a0);
        const start = tp(c.cx + rx * u * cr - ry * v * sr, c.cy + rx * u * sr + ry * v * cr);
        out.push({ t: hasCurrent ? 'L' : 'M', x: start.x, y: start.y });
        for (const seg of ellipseArcToCubics(c.cx, c.cy, rx, ry, rot, c.a0, sweep)) {
          if (seg.t !== 'C') continue;
          const p1 = tp(seg.x1, seg.y1);
          const p2 = tp(seg.x2, seg.y2);
          const p3 = tp(seg.x, seg.y);
          out.push({ t: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p3.x, y: p3.y });
        }
        hasCurrent = true;
        break;
      }
      case 'C': {
        const p1 = tp(c.x1, c.y1);
        const p2 = tp(c.x2, c.y2);
        const p3 = tp(c.x, c.y);
        out.push({ t: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p3.x, y: p3.y });
        hasCurrent = true;
        break;
      }
      case 'Z':
        out.push({ t: 'Z' });
        break;
    }
  }
  return out;
}

/** Caja envolvente aproximada (incluye puntos de control: conservadora). */
export function outPathBox(path: readonly OutCmd[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const c of path) {
    if (c.t === 'Z') continue;
    if (c.t === 'C') {
      add(c.x1, c.y1);
      add(c.x2, c.y2);
    }
    add(c.x, c.y);
  }
  return { minX, minY, maxX, maxY };
}
