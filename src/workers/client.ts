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

interface WorkerMessage {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  type?: string;
  progress?: RunHeavyProgress;
}

interface HeavyJob {
  id: number;
  op: HeavyOp;
  payload: unknown;
  fallbackPayload: unknown;
  postPayload: unknown;
  postTransfer?: Transferable[];
  options?: RunHeavyOptions;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
  cleanupSignal?: () => void;
}

let worker: Worker | null = null;
let seq = 0;
let activeJob: HeavyJob | null = null;
const queuedJobs: HeavyJob[] = [];

function abortError(): DOMException {
  return new DOMException('Operation aborted', 'AbortError');
}

function timeoutError(timeoutMs: number): Error {
  return new Error(`Operation timed out after ${timeoutMs}ms`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type ObjectPath = Array<string | number>;

function findObjectPath(value: unknown, target: object, path: ObjectPath = [], seen = new Set<object>()): ObjectPath | null {
  if (value === target) return path;
  if (!isObject(value) || seen.has(value)) return null;
  seen.add(value);

  if (ArrayBuffer.isView(value)) return value.buffer === target ? [...path, 'buffer'] : null;
  if (value instanceof ArrayBuffer) return null;

  for (const key of Object.keys(value)) {
    const result = findObjectPath(value[key], target, [...path, key], seen);
    if (result) return result;
  }
  return null;
}

function atPath(value: unknown, path: ObjectPath): unknown {
  let current = value;
  for (const part of path) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

/** Clone before transfer so crash recovery never observes a detached ArrayBuffer. */
function preparePayload(payload: unknown, transfer?: Transferable[]): {
  fallbackPayload: unknown;
  postPayload: unknown;
  postTransfer?: Transferable[];
} {
  if (!transfer?.length) return { fallbackPayload: payload, postPayload: payload };

  const transferPaths = transfer.map((item) => findObjectPath(payload, item));
  const embeddedTransfer = transfer.filter((_, index) => transferPaths[index] !== null);
  const fallbackPayload = embeddedTransfer.length ? structuredClone(payload, { transfer: embeddedTransfer }) : structuredClone(payload);
  const postPayload = structuredClone(fallbackPayload);
  const clonedTransfer = transferPaths
    .filter((path): path is ObjectPath => path !== null)
    .map((path) => atPath(postPayload, path))
    .filter((value): value is Transferable => isObject(value) || value instanceof ArrayBuffer);
  const externalTransfer = transfer.filter((_, index) => transferPaths[index] === null);
  const postTransfer = [...clonedTransfer, ...externalTransfer];

  return { fallbackPayload, postPayload, postTransfer };
}

function clearJob(job: HeavyJob): void {
  if (job.timer) clearTimeout(job.timer);
  job.timer = null;
  job.cleanupSignal?.();
  job.cleanupSignal = undefined;
}

function terminateWorker(): void {
  worker?.terminate();
  worker = null;
}

function rejectQueued(reason: unknown): void {
  while (queuedJobs.length > 0) {
    const job = queuedJobs.shift();
    if (!job) continue;
    clearJob(job);
    job.reject(reason);
  }
}

export function _resetWorker(): void {
  const current = activeJob;
  activeJob = null;
  if (current) {
    clearJob(current);
    current.reject(new Error('Worker reset'));
  }
  rejectQueued(new Error('Worker reset'));
  terminateWorker();
  seq = 0;
}

function settleJob(job: HeavyJob, result: unknown, error?: unknown): void {
  if (activeJob !== job) return;
  activeJob = null;
  clearJob(job);
  if (error === undefined) job.resolve(result);
  else job.reject(error);
  dispatchNext();
}

async function fallbackJob(job: HeavyJob): Promise<void> {
  try {
    const result = await runInline(job.op, job.fallbackPayload as never, { ...job.options, transfer: undefined });
    settleJob(job, result);
  } catch (error) {
    settleJob(job, undefined, error);
  }
}

function handleWorkerCrash(event: ErrorEvent): void {
  const crashedJob = activeJob;
  terminateWorker();
  if (!crashedJob) {
    dispatchNext();
    return;
  }
  clearJob(crashedJob);
  void fallbackJob(crashedJob).catch((error) => settleJob(crashedJob, undefined, error ?? new Error(event.message || 'Worker failure')));
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    worker = new Worker(new URL('./heavy.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }

  worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const data = event.data;
    const job = activeJob;
    if (!data || !job || data.id !== job.id) return;
    if (data.type === 'progress') {
      job.options?.onProgress?.(data.progress ?? {});
      return;
    }
    if (data.ok) settleJob(job, data.result);
    else settleJob(job, undefined, new Error(data.error ?? 'Worker operation failed'));
  });
  worker.addEventListener('error', handleWorkerCrash);
  return worker;
}

function startTimer(job: HeavyJob): void {
  const timeoutMs = job.options?.timeoutMs;
  if (!timeoutMs || timeoutMs <= 0) return;
  job.timer = setTimeout(() => {
    if (activeJob !== job) return;
    activeJob = null;
    clearJob(job);
    terminateWorker();
    job.reject(timeoutError(timeoutMs));
    dispatchNext();
  }, timeoutMs);
}

function cancelJob(job: HeavyJob): void {
  if (activeJob === job) {
    try {
      worker?.postMessage({ type: 'cancel', id: job.id });
    } catch {
      // El worker puede haber terminado; terminate() sigue siendo la cancelación autoritativa.
    }
    activeJob = null;
    clearJob(job);
    terminateWorker();
    job.reject(abortError());
    dispatchNext();
    return;
  }

  const index = queuedJobs.indexOf(job);
  if (index >= 0) {
    queuedJobs.splice(index, 1);
    clearJob(job);
    job.reject(abortError());
  }
}

function dispatchNext(): void {
  if (activeJob || queuedJobs.length === 0) return;
  const job = queuedJobs.shift();
  if (!job) return;

  const currentWorker = getWorker();
  activeJob = job;
  startTimer(job);
  if (!currentWorker) {
    void fallbackJob(job);
    return;
  }

  try {
    if (job.postTransfer?.length) currentWorker.postMessage({ id: job.id, op: job.op, payload: job.postPayload }, job.postTransfer);
    else currentWorker.postMessage({ id: job.id, op: job.op, payload: job.postPayload });
  } catch {
    clearJob(job);
    terminateWorker();
    void fallbackJob(job);
  }
}

async function runInline<K extends HeavyOp>(op: K, payload: Payload<K>, options?: RunHeavyOptions): Promise<Result<K>> {
  if (options?.signal?.aborted) throw abortError();

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
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      options?.signal?.removeEventListener('abort', onAbort);
    };

    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
      if (options.signal.aborted) {
        onAbort();
        return;
      }
    }
    if (options?.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(timeoutError(options.timeoutMs as number));
      }, options.timeoutMs);
    }

    void (async () => {
      try {
        const { HEAVY_OPS } = await import('./heavyOps');
        if (settled) return;
        const fn = HEAVY_OPS[op] as (p: Payload<K>, prog?: (p: RunHeavyProgress) => void) => Promise<Result<K>> | Result<K>;
        const result = await fn(payload, options?.onProgress);
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      } catch (error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
}

/** Ejecuta una operación pesada en un worker o, si no hay worker, en el hilo principal. */
export function runHeavy<K extends HeavyOp>(op: K, payload: Payload<K>, options?: RunHeavyOptions): Promise<Result<K>> {
  if (options?.signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return runInline(op, payload, options);

  const prepared = preparePayload(payload, options?.transfer);
  return new Promise<Result<K>>((resolve, reject) => {
    const job: HeavyJob = {
      id: ++seq,
      op,
      payload,
      fallbackPayload: prepared.fallbackPayload,
      postPayload: prepared.postPayload,
      postTransfer: prepared.postTransfer,
      options,
      resolve: resolve as (value: unknown) => void,
      reject,
      timer: null,
    };
    if (options?.signal) {
      const onAbort = () => cancelJob(job);
      options.signal.addEventListener('abort', onAbort, { once: true });
      job.cleanupSignal = () => options.signal?.removeEventListener('abort', onAbort);
    }
    queuedJobs.push(job);
    dispatchNext();
  });
}
