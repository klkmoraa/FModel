import type { ArcEntity, Entity, LineEntity, MLineEntity } from '../document/types';
import { add, scale } from '../geometry/vec';
import type { Vec2 } from '../geometry/vec';
import { wallOffsets } from '../geometry/walls';
import type { WallOpening } from '../geometry/walls';
import { wallProperties } from './architectureHelpers';
export function openingSymbols(wall: MLineEntity, opening: WallOpening, door: boolean, side = 1, hingeEnd = false): Entity[] {
  const { start, end, normal, direction, width } = opening;
  const offsets = wallOffsets(wall), entities: Entity[] = [];
  const line = (a: Vec2, b: Vec2) => entities.push({ ...wallProperties(wall), type: 'line', start: a, end: b } as LineEntity);
  for (const point of [start, end]) line(add(point, scale(normal, offsets[0])), add(point, scale(normal, offsets[1])));
  if (!door) {
    for (const factor of [0.25, 0.75]) {
      const offset = offsets[1] + (offsets[0] - offsets[1]) * factor;
      line(add(start, scale(normal, offset)), add(end, scale(normal, offset)));
    }
    return entities;
  }
  const offset = side > 0 ? offsets[0] : offsets[1];
  const hinge = add(hingeEnd ? end : start, scale(normal, offset));
  const leaf = add(hinge, scale(normal, side * width));
  line(hinge, leaf);
  const closedDirection = scale(direction, hingeEnd ? -1 : 1);
  const closedAngle = Math.atan2(closedDirection.y, closedDirection.x), openAngle = Math.atan2(side * normal.y, side * normal.x);
  const ccw = (hingeEnd ? -1 : 1) * side > 0;
  entities.push({ ...wallProperties(wall), type: 'arc', center: hinge, radius: width, startAngle: ccw ? closedAngle : openAngle, endAngle: ccw ? openAngle : closedAngle } as ArcEntity);
  return entities;
}
import { openingCommand } from './openingLifecycle';
export const WALLDOOR = openingCommand(true);
export const WALLWINDOW = openingCommand(false);
