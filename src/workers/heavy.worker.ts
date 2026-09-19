import type { HeavyOp } from './heavyOps';
import { HEAVY_OPS } from './heavyOps';

let currentJobId: number | null = null;
let cancelledJobId: number | null = null;

/** Web Worker de operaciones pesadas: soporta ejecución, progreso y cancelación cooperativa. */
self.addEventListener('message', async (event: MessageEvent<{ type?: string; id: number; op?: HeavyOp; payload?: unknown }>) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'cancel') {
    if (currentJobId === data.id) {
      cancelledJobId = data.id;
    }
    return;
  }
  const { id, op, payload } = data;
  if (!op) return;
  currentJobId = id;
  cancelledJobId = null;
  try {
    const postProgress = (progress: unknown) => {
      if (cancelledJobId === id) return;
      (self as unknown as Worker).postMessage({ type: 'progress', id, progress });
    };
    const result = await (HEAVY_OPS[op] as (p: unknown, onProg?: (p: unknown) => void) => unknown)(payload, postProgress);
    if (cancelledJobId === id) return;
    (self as unknown as Worker).postMessage({ type: 'result', id, ok: true, result });
  } catch (err) {
    if (cancelledJobId === id) return;
    (self as unknown as Worker).postMessage({ type: 'result', id, ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (currentJobId === id) currentJobId = null;
  }
});
