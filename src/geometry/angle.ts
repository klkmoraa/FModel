import { TOL } from './tolerance';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const toRad = (deg: number): number => deg * DEG;
export const toDeg = (rad: number): number => rad / DEG;

/** Normaliza a [0, 2π). */
export function normAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** Normaliza a (-π, π]. */
export function normAngleSigned(a: number): number {
  let r = normAngle(a);
  if (r > Math.PI) r -= TAU;
  return r;
}

/** Barrido CCW desde `start` hasta `end`, en (0, 2π]. Si coinciden devuelve 2π. */
export function ccwSweep(start: number, end: number): number {
  const s = normAngle(end - start);
  return s <= TOL.ANGULAR ? TAU : s;
}

/** ¿Está `a` dentro del arco CCW que empieza en `start` con barrido `sweep` (con signo)? */
export function angleInSweep(a: number, start: number, sweep: number, tol = 1e-9): boolean {
  if (Math.abs(sweep) >= TAU - tol) return true;
  if (sweep >= 0) {
    const d = normAngle(a - start);
    return d <= sweep + tol || d >= TAU - tol;
  }
  const d = normAngle(start - a);
  return d <= -sweep + tol || d >= TAU - tol;
}

/** Parámetro normalizado t∈[0,1] de un ángulo sobre un barrido con signo (puede salir de rango). */
export function angleToParam(a: number, start: number, sweep: number): number {
  if (sweep >= 0) {
    let d = normAngle(a - start);
    if (d > sweep + (TAU - sweep) / 2) d -= TAU;
    return d / sweep;
  }
  let d = normAngle(start - a);
  if (d > -sweep + (TAU + sweep) / 2) d -= TAU;
  return d / -sweep;
}

/** Ajusta un ángulo al múltiplo más cercano de `step` (para polar tracking y ortho). */
export function snapAngle(a: number, step: number): number {
  return Math.round(a / step) * step;
}

export function angleDiff(a: number, b: number): number {
  return Math.abs(normAngleSigned(a - b));
}
