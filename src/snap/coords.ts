import { evaluate } from '../lib/expr';
import type { Vec2 } from '../geometry/vec';

export type ParsedInput =
  | { kind: 'point'; p: Vec2; relative: boolean }
  | { kind: 'distance'; value: number }
  | { kind: 'angle-lock'; angle: number }
  | { kind: 'keyword'; text: string }
  | { kind: 'empty' };

function num(s: string): number {
  const t = s.trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return parseFloat(t);
  return evaluate(t);
}

/** Ángulo en grados salvo sufijo r (radianes) o g (grados centesimales). Devuelve radianes. */
export function parseAngle(s: string, angleBase = 0): number {
  const t = s.trim().toLowerCase();
  const dms = /^(-?\d+(?:\.\d+)?)d(\d+(?:\.\d+)?)?'?(\d+(?:\.\d+)?)?"?$/.exec(t);
  if (dms && (dms[2] || dms[3])) {
    const d = parseFloat(dms[1]);
    const m = parseFloat(dms[2] ?? '0');
    const sec = parseFloat(dms[3] ?? '0');
    return ((Math.sign(d || 1) * (Math.abs(d) + m / 60 + sec / 3600)) * Math.PI) / 180 + angleBase;
  }
  if (t.endsWith('r')) return num(t.slice(0, -1)) + angleBase;
  if (t.endsWith('g')) return (num(t.slice(0, -1)) * Math.PI) / 200 + angleBase;
  return (num(t.replace(/d$/, '')) * Math.PI) / 180 + angleBase;
}

/**
 * Interpreta entrada de coordenadas estilo AutoCAD:
 * `x,y` (absoluta o relativa según Entrada dinámica), `@dx,dy`, `@d<ang`, `d<ang`,
 * `#x,y` (absoluta forzada), `*x,y` (SCU), `@` (último punto), `<ang` (bloqueo de ángulo),
 * número suelto (distancia directa).
 */
export function parseCoordinateInput(text: string, opts: { lastPoint?: Vec2 | null; dynamicRelative?: boolean; angleBase?: number } = {}): ParsedInput {
  const raw = text.trim();
  if (!raw) return { kind: 'empty' };
  const last = opts.lastPoint ?? null;
  let t = raw;
  let forcedAbs = false;
  let relative = false;
  if (t.startsWith('#') || t.startsWith('*')) {
    forcedAbs = true;
    t = t.slice(1);
  } else if (t.startsWith('@')) {
    relative = true;
    t = t.slice(1);
    if (!t.trim()) return last ? { kind: 'point', p: { ...last }, relative: true } : { kind: 'point', p: { x: 0, y: 0 }, relative: true };
  }
  if (t.startsWith('<') && !relative && !forcedAbs) {
    try {
      return { kind: 'angle-lock', angle: parseAngle(t.slice(1), opts.angleBase) };
    } catch {
      return { kind: 'keyword', text: raw };
    }
  }
  try {
    if (t.includes('<')) {
      const [d, a] = t.split('<');
      const dist = num(d);
      const ang = parseAngle(a, opts.angleBase);
      const v = { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist };
      const rel = relative || (!forcedAbs && !!opts.dynamicRelative && !!last);
      if (rel && last) return { kind: 'point', p: { x: last.x + v.x, y: last.y + v.y }, relative: true };
      return { kind: 'point', p: v, relative: false };
    }
    if (t.includes(',')) {
      const parts = t.split(',');
      if (parts.length < 2 || parts.length > 3) return { kind: 'keyword', text: raw };
      const x = num(parts[0]);
      const y = num(parts[1]);
      const rel = relative || (!forcedAbs && !!opts.dynamicRelative && !!last);
      if (rel && last) return { kind: 'point', p: { x: last.x + x, y: last.y + y }, relative: true };
      return { kind: 'point', p: { x, y }, relative: false };
    }
    if (!relative && !forcedAbs && /^[-+0-9.(]/.test(t)) {
      return { kind: 'distance', value: num(t) };
    }
  } catch {
    return { kind: 'keyword', text: raw };
  }
  return { kind: 'keyword', text: raw };
}

/** Formato de coordenadas para la barra de estado y la entrada dinámica. */
export function formatCoord(v: number, precision = 4): string {
  const s = v.toFixed(precision);
  return s === `-${(0).toFixed(precision)}` ? (0).toFixed(precision) : s;
}
