import { line, point, poly, rect } from './primitives';
import { requireLayout } from './schema';
import type { ComponentParameters, ComponentPrimitive } from './types';
export function column(p: ComponentParameters): ComponentPrimitive[] {
  const w = p.width as number, d = p.depth as number, a = p.arm as number, diameter = p.diameter as number;
  if (p.variant === 'circular') return [{ key: 'outline', type: 'circle', center: point(diameter / 2, diameter / 2), radius: diameter / 2 }];
  if (p.variant === 'rectangular') return [rect('outline', 0, 0, w, d)];
  requireLayout(a < w && a < d, undefined, undefined, ['arm', 'width', 'depth']);
  const x = (w - a) / 2, y = (d - a) / 2;
  if (p.variant === 'l') return [poly('outline', [[0, 0], [w, 0], [w, a], [a, a], [a, d], [0, d]])];
  if (p.variant === 't') return [poly('outline', [[0, d - a], [x, d - a], [x, 0], [x + a, 0], [x + a, d - a], [w, d - a], [w, d], [0, d]])];
  return [poly('outline', [[x, 0], [x + a, 0], [x + a, y], [w, y], [w, y + a], [x + a, y + a], [x + a, d], [x, d], [x, y + a], [0, y + a], [0, y], [x, y]])];
}
function letters(i: number): string { let result = ''; for (i++; i; i = Math.floor((i - 1) / 26)) result = String.fromCharCode(65 + (i - 1) % 26) + result; return result; }
export function axisgrid(p: ComponentParameters): ComponentPrimitive[] {
  const nx = p.columns as number, ny = p.rows as number, sx = p.spacingX as number, sy = p.spacingY as number, m = p.margin as number, r = p.bubble as number;
  requireLayout(m > 2 * r && (nx === 1 || sx > 2 * r) && (ny === 1 || sy > 2 * r), undefined, undefined, ['margin', 'bubble', 'spacingX', 'spacingY']);
  const w = (nx - 1) * sx, h = (ny - 1) * sy, result: ComponentPrimitive[] = [];
  for (const direction of ['x', 'y']) for (let i = 0; i < (direction === 'x' ? nx : ny); i++) {
    const vertical = direction === 'x', offset = i * (vertical ? sx : sy), label = vertical ? String(i + 1) : letters(i);
    result.push(vertical ? line(`axis-x-${i}`, offset, -m, offset, h + m) : line(`axis-y-${i}`, -m, offset, w + m, offset));
    for (let side = 0; side < 2; side++) {
      const center = vertical ? point(offset, side ? h + m : -m) : point(side ? w + m : -m, offset);
      result.push({ key: `bubble-${direction}-${i}-${side}`, type: 'circle', center, radius: r }, { key: `label-${direction}-${i}-${side}`, type: 'text', position: center, text: label, height: r, rotation: 0 });
    }
  }
  return result;
}
