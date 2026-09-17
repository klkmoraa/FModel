import type { HeavyOp, HeavyOps } from './heavyOps';

type Result<K extends HeavyOp> = ReturnType<HeavyOps[K]>;
type Payload<K extends HeavyOp> = Parameters<HeavyOps[K]>[0];

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    worker = new Worker(new URL('./heavy.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  worker.addEventListener('message', (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(new Error(e.data.error));
  });
  worker.addEventListener('error', (e) => {
    // un fallo del worker (p. ej. bloqueado por la política del sitio) no pierde peticiones
    for (const p of pending.values()) p.reject(new Error(e.message || 'worker'));
    pending.clear();
    worker?.terminate();
    worker = null;
    workerBroken = true;
  });
  return worker;
}

let workerBroken = false;

async function runInline<K extends HeavyOp>(op: K, payload: Payload<K>): Promise<Result<K>> {
  const { HEAVY_OPS } = await import('./heavyOps');
  return (HEAVY_OPS[op] as (p: Payload<K>) => Result<K>)(payload);
}

/**
 * Ejecuta una operación pesada en segundo plano sin bloquear el lienzo. Si el navegador no
 * permite workers, se ejecuta en el hilo principal con el mismo resultado.
 */
export async function runHeavy<K extends HeavyOp>(op: K, payload: Payload<K>): Promise<Result<K>> {
  const w = workerBroken ? null : getWorker();
  if (!w) return runInline(op, payload);
  const id = ++seq;
  try {
    return await new Promise<Result<K>>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ id, op, payload });
    });
  } catch (err) {
    if (workerBroken) return runInline(op, payload);
    throw err;
  }
}
