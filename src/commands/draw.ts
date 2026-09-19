import type { CommandDef } from './types';
import {
  ARC,
  CIRCLE,
  DONUT,
  ELLIPSE,
  LINE,
  PLINE,
  POLYGON,
  RECTANG,
  SPLINE,
} from './draw/curves';
import {
  DIVIDE,
  MEASURE,
  POINT,
  RAY,
  REVCLOUD,
  XLINE,
} from './draw/construction';
import { MLEADER, MTEXT, TABLE, TEXT } from './draw/annotation';
import {
  BOUNDARY,
  HATCH,
  MLINE,
  REGION,
  WIPEOUT,
} from './draw/areas';

// Re-export shared helpers and modular definitions
export { nearestCurve, arcEntityFrom } from './draw/shared';
export {
  CURVE_COMMANDS,
  LINE,
  PLINE,
  CIRCLE,
  ARC,
  RECTANG,
  POLYGON,
  ELLIPSE,
  SPLINE,
  DONUT,
  rectangleVertices,
} from './draw/curves';
export {
  CONSTRUCTION_COMMANDS,
  POINT,
  RAY,
  XLINE,
  REVCLOUD,
  DIVIDE,
  MEASURE,
  revcloudVertices,
} from './draw/construction';
export { ANNOTATION_COMMANDS, TEXT, MTEXT, MLEADER, TABLE } from './draw/annotation';
export {
  AREA_COMMANDS,
  MLINE,
  WIPEOUT,
  HATCH,
  BOUNDARY,
  REGION,
  closedLoopOf,
  hatchDefaults,
} from './draw/areas';

/**
 * Registro completo de comandos de dibujo en orden estándar de FModel.
 */
export const DRAW_COMMANDS: CommandDef[] = [
  LINE,
  PLINE,
  CIRCLE,
  ARC,
  RECTANG,
  POLYGON,
  ELLIPSE,
  SPLINE,
  POINT,
  RAY,
  XLINE,
  REVCLOUD,
  DIVIDE,
  MEASURE,
  TEXT,
  MTEXT,
  MLEADER,
  TABLE,
  MLINE,
  WIPEOUT,
  HATCH,
  BOUNDARY,
  REGION,
  DONUT,
];
