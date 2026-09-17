import type { BlockRecord, DynamicInstanceState, Entity, InsertEntity } from '../document/types';
import type { ModelContext } from '../model/context';
import type { DynamicEvaluation } from './dynamic';
import { dynamicGrips, evaluateDynamic, moveDynamicGrip } from './dynamic';

/** Conecta el evaluador de bloques dinámicos al contexto del modelo (con caché por variante). */
export function installDynamicBlocks(ctx: ModelContext) {
  const cache = new Map<string, { version: number; ev: DynamicEvaluation }>();
  const evaluator = (block: BlockRecord, dyn?: DynamicInstanceState): DynamicEvaluation => {
    const key = `${block.id}|${block.revision}|${dyn ? JSON.stringify(dyn) : ''}`;
    const hit = cache.get(key);
    if (hit && hit.version === ctx.blocksVersion) return hit.ev;
    const ev = evaluateDynamic(ctx, block, ctx.doc.entitiesOf(block.id), dyn);
    if (cache.size > 2000) cache.clear();
    cache.set(key, { version: ctx.blocksVersion, ev });
    return ev;
  };
  ctx.dynamicEvaluator = (_c, block, _entities, dyn) => evaluator(block, dyn).entities;
  ctx.dynamicGrips = (e: Entity) => dynamicGrips(ctx, e, evaluator);
  ctx.moveDynamicGrip = (e: Entity, gripId: string, to) => (e.type === 'insert' ? moveDynamicGrip(ctx, e as InsertEntity, gripId, to, evaluator) : null);
  return evaluator;
}
