import type { MLineStyleRecord } from '../document/types';
import { nearEqual } from '../geometry/tolerance';
/** Only unfilled, ByLayer two-face styles with straight caps are compatible. */
export function isWallStyle(style: MLineStyleRecord | undefined): boolean {
  return !!style && !style.fill && style.startCap === 'line' && style.endCap === 'line' && style.elements.length === 2 &&
    style.elements.every(e => e.color === 'ByLayer' && e.linetype === 'ByLayer') &&
    (nearEqual(style.elements[0].offset, 0.5) && nearEqual(style.elements[1].offset, -0.5) || nearEqual(style.elements[1].offset, 0.5) && nearEqual(style.elements[0].offset, -0.5));
}
export function wallStyle(id: string, name: string): MLineStyleRecord {
  return { id, name, description: 'FModel 2D wall / muro', elements: [{ offset: 0.5, color: 'ByLayer', linetype: 'ByLayer' }, { offset: -0.5, color: 'ByLayer', linetype: 'ByLayer' }], startCap: 'line', endCap: 'line' };
}
