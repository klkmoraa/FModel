/**
 * Tolerancia geométrica centralizada de FModel 2D CAD.
 *
 * Todas las comparaciones geométricas del núcleo pasan por aquí. Los datos
 * viven en coordenadas de mundo (unidades del dibujo), nunca en píxeles:
 * las tolerancias expresadas en píxeles (apertura de snap, caja de selección)
 * se convierten a unidades de mundo en la capa de vista multiplicando por
 * `worldPerPixel` y nunca entran al documento.
 *
 * | Constante        | Valor  | Uso                                                    |
 * |------------------|--------|--------------------------------------------------------|
 * | LINEAR           | 1e-9   | coincidencia de puntos, longitudes nulas               |
 * | ANGULAR          | 1e-10  | paralelismo, ángulos iguales (radianes)                |
 * | PARAM            | 1e-9   | parámetros normalizados de curva en [0, 1]             |
 * | RELATIVE         | 1e-12  | factor relativo para magnitudes grandes (coords UTM)   |
 * | TESSELLATION     | 1e-3   | desviación cordal por defecto al teselar (unidades)    |
 * | NEWTON_MAX_ITER  | 32     | refinamiento numérico de intersecciones                |
 *
 * `linearTol(scale)` escala la tolerancia lineal con la magnitud de las
 * coordenadas implicadas, para que un plano georreferenciado (≈1e6) no pierda
 * coincidencias por error de redondeo en doble precisión.
 */
export const TOL = {
  LINEAR: 1e-9,
  ANGULAR: 1e-10,
  PARAM: 1e-9,
  RELATIVE: 1e-12,
  TESSELLATION: 1e-3,
  NEWTON_MAX_ITER: 32,
} as const;

/** Tolerancia lineal efectiva para coordenadas de magnitud `magnitude`. */
export function linearTol(magnitude = 0): number {
  return Math.max(TOL.LINEAR, Math.abs(magnitude) * TOL.RELATIVE);
}

export function nearZero(v: number, tol: number = TOL.LINEAR): boolean {
  return Math.abs(v) <= tol;
}

export function nearEqual(a: number, b: number, tol: number = TOL.LINEAR): boolean {
  return Math.abs(a - b) <= Math.max(tol, Math.max(Math.abs(a), Math.abs(b)) * TOL.RELATIVE);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Redondeo seguro para presentación, nunca para el modelo. */
export function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
