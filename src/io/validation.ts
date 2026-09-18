import { NativeFormatError } from './native';
import { INPUT_LIMITS } from './limits';

/** Rechaza números que el formato JSON no puede representar con seguridad. */
export function assertFiniteValues(value: unknown): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new NativeFormatError('El archivo contiene un número no finito. / The file contains a non-finite number.');
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertFiniteValues(entry);
    return;
  }
  if (value && typeof value === 'object') for (const entry of Object.values(value)) assertFiniteValues(entry);
}

const POINT_LISTS = new Set(['vertices', 'points', 'controlPoints', 'fitPoints']);

export function assertPointLimits(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertPointLimits(entry);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (POINT_LISTS.has(key) && Array.isArray(entry) && entry.length > INPUT_LIMITS.maxPointsPerEntity) throw new NativeFormatError('Una entidad contiene demasiados puntos. / An entity contains too many points.');
    assertPointLimits(entry);
  }
}
