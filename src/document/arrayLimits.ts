export const MAX_ARRAY_INSTANCE_COUNT = 250_000;

/** Devuelve el total de instancias solo para parámetros enteros y acotados. */
export function arrayInstanceCount(params: unknown): number | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const value = params as Record<string, unknown>;
  let count: number;
  if (value.kind === 'rect') {
    if (!Number.isSafeInteger(value.columns) || !Number.isSafeInteger(value.rows) || Number(value.columns) < 1 || Number(value.rows) < 1) return null;
    count = Number(value.columns) * Number(value.rows);
  } else if (value.kind === 'polar') {
    if (!Number.isSafeInteger(value.count) || !Number.isSafeInteger(value.rows) || Number(value.count) < 1 || Number(value.rows) < 1) return null;
    count = Number(value.count) * Number(value.rows);
  } else if (value.kind === 'path') {
    if (!Number.isSafeInteger(value.count) || Number(value.count) < 1) return null;
    count = Number(value.count);
  } else {
    return null;
  }
  return Number.isSafeInteger(count) && count <= MAX_ARRAY_INSTANCE_COUNT ? count : null;
}

/** Limita el trabajo derivado por instancias, objetos fuente y tramos de ruta. */
export function arrayExpansionWithinLimit(instances: number, sourceEntities: number, pathSegments = 1): boolean {
  return Number.isSafeInteger(instances) && instances > 0 &&
    Number.isSafeInteger(sourceEntities) && sourceEntities >= 0 &&
    Number.isSafeInteger(pathSegments) && pathSegments >= 0 &&
    instances * Math.max(1, sourceEntities, pathSegments) <= MAX_ARRAY_INSTANCE_COUNT;
}
