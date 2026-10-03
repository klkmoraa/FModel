import { column, axisgrid } from './structure';
import { stairplan, stairsection, escalator, liftplan } from './circulation';
import { facade } from './facades';
import { validateParameters } from './schema';
import { validatePrimitives } from './primitives';
import type { ComponentKind, ComponentParameters, ComponentPrimitive } from './types';
/** Fully populated input in drawing units; all domain angles are radians. Pure and bounded. */
export function buildComponent(kind: ComponentKind, parameters: ComponentParameters): ComponentPrimitive[] {
  validateParameters(kind, parameters);
  const builders = { column, axisgrid, stairplan, stairsection, escalator, liftplan };
  const primitives = kind in builders ? builders[kind as keyof typeof builders](parameters) : facade(kind, parameters);
  validatePrimitives(primitives); return primitives;
}
