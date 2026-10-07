import type { HatchPatternRef } from '../../document/types';
import { DEG, normAngle } from '../../geometry/angle';
import { linearTol, nearEqual, TOL } from '../../geometry/tolerance';
import type { Vec2 } from '../../geometry/vec';
import type { Pair } from './parser';

type Recovery = { pattern: HatchPatternRef; origin: Vec2 } | { reason: string };

/** DXF family coordinates/offsets already include rotation and scale. Only
 * continuous single or orthogonal double families fit the native user pattern. */
export function recoverUserHatchPattern(pairs: Pair[], name: string): Recovery {
  const invalid = (reason: string): Recovery => ({ reason });
  const start = pairs.findIndex(([code]) => code === 78);
  const numeric = (value: string | undefined) => value?.trim() ? Number(value) : NaN;
  const count = numeric(pairs[start]?.[1]);
  // Bound work by the supported representation, never by an untrusted count.
  if (start < 0 || !Number.isInteger(count) || count < 1 || count > 2) {
    return invalid('cantidad de familias no admitida / unsupported family count');
  }
  const families: { angle: number; origin: Vec2; spacing: number }[] = [];
  let cursor = start + 1;
  for (let index = 0; index < count; index++) {
    const values: number[] = [];
    for (const code of [53, 43, 44, 45, 46, 79]) {
      const pair = pairs[cursor++];
      const value = numeric(pair?.[1]);
      if (pair?.[0] !== code || !Number.isFinite(value)) {
        return invalid('familia incompleta o no finita / incomplete or non-finite family');
      }
      values.push(value);
    }
    const [degrees, x, y, dx, dy, dashes] = values;
    if (dashes !== 0) return invalid('trazos no admitidos / unsupported dashes');
    const angle = normAngle(degrees * DEG);
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    const spacing = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (!Number.isFinite(spacing) || spacing <= TOL.LINEAR || Math.abs(along) > linearTol(Math.max(Math.abs(dx), Math.abs(dy)))) {
      return invalid('desplazamiento no perpendicular o colapsado / nonperpendicular or collapsed offset');
    }
    families.push({ angle, origin: { x, y }, spacing });
  }
  // A mismatched count must not silently hide further families or dash data.
  for (; cursor < pairs.length && pairs[cursor][0] !== 98; cursor++) {
    if ([78, 53, 43, 44, 45, 46, 79, 49].includes(pairs[cursor][0])) {
      return invalid('datos de familia no declarados / undeclared family data');
    }
  }
  const first = families[0];
  const second = families[1];
  if (second && (Math.abs(Math.cos(second.angle - first.angle)) > TOL.ANGULAR ||
    !nearEqual(first.spacing, second.spacing) ||
    !nearEqual(first.origin.x, second.origin.x) || !nearEqual(first.origin.y, second.origin.y))) {
    return invalid('familias sin origen, espaciado y ortogonalidad comunes / families lack common origin, spacing and orthogonality');
  }
  return {
    pattern: { type: 'user', name, angle: first.angle, scale: 1, spacing: first.spacing, double: !!second },
    origin: first.origin,
  };
}
