import type { HeavyOp } from './heavyOps';
import { HEAVY_OPS } from './heavyOps';

/** Web Worker de operaciones pesadas: un mensaje por petición, respuesta con el mismo id. */
self.addEventListener('message', async (event: MessageEvent<{ id: number; op: HeavyOp; payload: never }>) => {
  const { id, op, payload } = event.data;
  try {
    const result = await (HEAVY_OPS[op] as (p: never) => unknown)(payload);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
