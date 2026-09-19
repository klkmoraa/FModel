import type { HeavyOp, HeavyOps } from './heavyOps';

type Result<K extends HeavyOp> = ReturnType<HeavyOps[K]>;
type Payload<K extends HeavyOp> = Parameters<HeavyOps[K]>[0];

export interface RunHeavyProgress {
  phase?: string;
  percent?: number;
  message?: string;
  [key: string]: unknown;
}

export interface RunHeavyOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: RunHeavyProgress) => void;
  transfer?: Transferable[];
}

interface PendingEntry {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (progress: RunHeavyProgress) => void;
  timer?: ReturnType<typeof setTimeout> | null;
  cleanupSignal?: () => void;
  op: HeavyOp;
  payload: unknown;
  options?: RunHeavyOptions;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, PendingEntry>();
let workerBroken = false;

export function _resetWorker(): void {
  for (const entry of pending.values()) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.cleanupSignal?.();
    entry.reject(new Error('Worker reset'));
  }
  pending.clear();
  worker?.terminate();
  worker = null;
  workerBroken = false;
  seq = 0;
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    worker = new Worker(new URL('./heavy.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  worker.addEventListener('message', (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string; type?: string; progress?: RunHeavyProgress }>) => {
    const data = e.data;
    if (!data) return;
    const p = pending.get(data.id);
    if (!p) return;

    if (data.type === 'progress') {
      p.onProgress?.(data.progress ?? {});
      return;
    }

    if (p.timer) clearTimeout(p.timer);
    p.cleanupSignal?.();
    pending.delete(data.id);

    if (data.ok) {
      p.resolve(data.result);
    } else {
      p.reject(new Error(data.error));
    }
  });

  worker.addEventListener('error', (e) => {
    const entries = [...pending.entries()];
    pending.clear();
    worker?.terminate();
    worker = null;
    workerBroken = true;

    for (const [, p] of entries) {
      if (p.timer) clearTimeout(p.timer);
      p.cleanupSignal?.();
      runInline(p.op, p.payload as never, p.options)
        .then(p.resolve, () => p.reject(new Error((e as ErrorEvent).message || 'Worker failure')));
    }
  });
  return worker;
}

async function runInline<K extends HeavyOp>(
  op: K,
  payload: Payload<K>,
  options?: RunHeavyOptions
): Promise<Result<K>> {
  if (options?.signal?.aborted) {
    throw new DOMException('Operation aborted', 'AbortError');
  }

  if (!options?.signal && (!options?.timeoutMs || options.timeoutMs <= 0)) {
    const { HEAVY_OPS } = await import('./heavyOps');
    const fn = HEAVY_OPS[op] as (p: Payload<K>, prog?: (p: RunHeavyProgress) => void) => Promise<Result<K>> | Result<K>;
    return await fn(payload, options?.onProgress);
  }

  return new Promise<Result<K>>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(new DOMException('Operation aborted', 'AbortError'));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        reject(new Error(`Operation timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
    }

    (async () => {
      try {
        const { HEAVY_OPS } = await import('./heavyOps');
        if (settled) return;
        if (options.signal?.aborted) {
          onAbort();
          return;
        }
        const fn = HEAVY_OPS[op] as (p: Payload<K>, prog?: (p: RunHeavyProgress) => void) => Promise<Result<K>> | Result<K>;
        const res = await fn(payload, options?.onProgress);
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        resolve(res);
      } catch (err) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}

/**
 * Ejecuta una operación pesada en segundo plano sin bloquear el lienzo. Si el navegador no
 * permite workers, se ejecuta en el hilo principal con el mismo resultado.
 */
export async function runHeavy<K extends HeavyOp>(
  op: K,
  payload: Payload<K>,
  options?: RunHeavyOptions
): Promise<Result<K>> {
  if (options?.signal?.aborted) {
    throw new DOMException('Operation aborted', 'AbortError');
  }

  const w = workerBroken ? null : getWorker();
  if (!w) return runInline(op, payload, options);

  const id = ++seq;
  return new Promise<Result<K>>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cleanupSignal: (() => void) | undefined;

    if (options?.signal) {
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        pending.delete(id);
        try {
          w.postMessage({ type: 'cancel', id });
        } catch {
          // Worker ya cerrado
        }
        reject(new DOMException('Operation aborted', 'AbortError'));
      };
      options.signal.addEventListener('abort', onAbort, { once: true });
      cleanupSignal = () => options.signal?.removeEventListener('abort', onAbort);
    }

    if (options?.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanupSignal?.();
        pending.delete(id);
        worker?.terminate();
        worker = null;
        reject(new Error(`Operation timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
    }

    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      onProgress: options?.onProgress,
      timer,
      cleanupSignal,
      op,
      payload,
      options,
    });

    try {
      if (options?.transfer && options.transfer.length > 0) {
        w.postMessage({ id, op, payload }, options.transfer);
      } else {
        w.postMessage({ id, op, payload });
      }
    } catch {
      if (timer) clearTimeout(timer);
      cleanupSignal?.();
      pending.delete(id);
      runInline(op, payload, options).then(resolve, reject);
    }
  });
}
