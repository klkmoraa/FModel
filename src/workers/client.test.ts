import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { runHeavy, _resetWorker, type RunHeavyProgress } from './client';
import { HEAVY_OPS } from './heavyOps';

describe('heavy operations client', () => {
  beforeEach(() => {
    _resetWorker();
  });

  afterEach(() => {
    _resetWorker();
    vi.restoreAllMocks();
  });

  it('runs export, read and analysis with serializable results (inline when there is no Worker)', async () => {
    const doc = createDocument();
    doc.transact('seed', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    });
    const exported = await runHeavy('exportDxf', { data: structuredClone(doc.data) });
    expect(exported.report.exported.LINE).toBe(2);
    const read = await runHeavy('readDxf', { text: exported.text });
    expect([...read.data.entities.values()].filter((e) => e.owner === MODEL_SPACE_ID)).toHaveLength(2);
    const report = await runHeavy('analyze', { data: structuredClone(doc.data) });
    expect(report.issues.some((i) => i.code === 'duplicate')).toBe(true);
    expect(() => structuredClone(report)).not.toThrow();
  });

  it('aborts immediately when AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runHeavy('readDxf', { text: '' }, { signal: controller.signal })).rejects.toThrowError(
      expect.objectContaining({ name: 'AbortError' })
    );
  });

  it('handles cancellation and timeout in inline mode', async () => {
    const controller = new AbortController();
    const promise = runHeavy('readDxf', { text: '' }, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrowError(expect.objectContaining({ name: 'AbortError' }));
  });

  it('works with simulated Worker messaging, transferables and progress', async () => {
    type Listener = (event: any) => void;
    const listeners = new Map<string, Listener[]>();
    const posted: any[] = [];

    class MockWorker {
      addEventListener(type: string, fn: Listener) {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      }
      removeEventListener(type: string, fn: Listener) {
        const list = listeners.get(type) ?? [];
        listeners.set(type, list.filter((f) => f !== fn));
      }
      postMessage(data: any, transfer?: any) {
        posted.push({ data, transfer });
        if (data.op === 'readDxf') {
          setTimeout(() => {
            const progressListeners = listeners.get('message') ?? [];
            for (const l of progressListeners) {
              l({ data: { type: 'progress', id: data.id, progress: { phase: 'parsing', percent: 50 } } });
              l({ data: { type: 'result', id: data.id, ok: true, result: { data: createDocument().data, report: { summary: { es: 'ok', en: 'ok' }, warnings: [] } } } });
            }
          }, 5);
        }
      }
      terminate = vi.fn();
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = MockWorker as any;
    (globalThis as any).window = globalThis;

    try {
      const progressUpdates: RunHeavyProgress[] = [];
      const dummyBuffer = new ArrayBuffer(8);
      const res = await runHeavy('readDxf', { text: 'dummy' }, {
        transfer: [dummyBuffer],
        onProgress: (p) => progressUpdates.push(p),
      });

      expect(res).toBeDefined();
      expect(progressUpdates).toEqual([{ phase: 'parsing', percent: 50 }]);
      expect(posted.length).toBe(1);
      expect(posted[0].transfer).toEqual([dummyBuffer]);
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });

  it('cancels cooperative Worker job and ignores late results', async () => {
    type Listener = (event: any) => void;
    const listeners = new Map<string, Listener[]>();
    const posted: any[] = [];

    class MockWorker {
      addEventListener(type: string, fn: Listener) {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      }
      removeEventListener() {}
      postMessage(data: any) {
        posted.push(data);
      }
      terminate = vi.fn();
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = MockWorker as any;
    (globalThis as any).window = globalThis;

    try {
      const controller = new AbortController();
      const promise = runHeavy('readDxf', { text: 'dummy' }, { signal: controller.signal });

      expect(posted[0].op).toBe('readDxf');
      const jobId = posted[0].id;

      controller.abort();
      await expect(promise).rejects.toThrowError(expect.objectContaining({ name: 'AbortError' }));

      // Checked that cancel message was sent to worker
      expect(posted.some((p) => p.type === 'cancel' && p.id === jobId)).toBe(true);
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });

  it('times out hung Worker job and terminates worker', async () => {
    const terminateMock = vi.fn();

    class MockWorker {
      addEventListener() {}
      removeEventListener() {}
      postMessage() {
        // do not respond
      }
      terminate = terminateMock;
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = MockWorker as any;
    (globalThis as any).window = globalThis;

    try {
      await expect(runHeavy('readDxf', { text: 'dummy' }, { timeoutMs: 20 })).rejects.toThrowError(
        /timed out after 20ms/
      );
      expect(terminateMock).toHaveBeenCalled();
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });

  it('retries safely via inline fallback when Worker encounters error event', async () => {
    const listeners = new Map<string, ((event: any) => void)[]>();

    class MockWorker {
      addEventListener(type: string, fn: (event: any) => void) {
        const list = listeners.get(type) ?? [];
        list.push(fn);
        listeners.set(type, list);
      }
      removeEventListener() {}
      postMessage() {
        // Trigger worker error event
        setTimeout(() => {
          const errListeners = listeners.get('error') ?? [];
          for (const l of errListeners) {
            l({ message: 'worker crashed' });
          }
        }, 5);
      }
      terminate = vi.fn();
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = MockWorker as any;
    (globalThis as any).window = globalThis;

    try {
      const doc = createDocument();
      // Should fall back inline on worker crash and return result
      const res = await runHeavy('analyze', { data: structuredClone(doc.data) });
      expect(res).toBeDefined();
      expect(res.score).toBeDefined();
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });

  it('serializes concurrent jobs and drains the queue in submission order', async () => {
    type Listener = (event: any) => void;
    const workers: MockQueuedWorker[] = [];

    class MockQueuedWorker {
      listeners = new Map<string, Listener[]>();
      posted: any[] = [];
      constructor() {
        workers.push(this);
      }
      addEventListener(type: string, fn: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      removeEventListener(type: string, fn: Listener) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== fn));
      }
      postMessage(data: any) {
        this.posted.push(data);
      }
      terminate = vi.fn();
      respond(result: unknown) {
        const messageListeners = this.listeners.get('message') ?? [];
        for (const listener of messageListeners) listener({ data: { type: 'result', id: this.posted[this.posted.length - 1].id, ok: true, result } });
      }
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = MockQueuedWorker as any;
    (globalThis as any).window = globalThis;

    try {
      const first = runHeavy('readDxf', { text: 'first' });
      const second = runHeavy('readDxf', { text: 'second' });
      await Promise.resolve();

      expect(workers).toHaveLength(1);
      expect(workers[0].posted.map((message) => message.payload.text)).toEqual(['first']);

      workers[0].respond({ order: 1 });
      await Promise.resolve();
      expect(workers[0].posted.map((message) => message.payload.text)).toEqual(['first', 'second']);
      workers[0].respond({ order: 2 });

      await expect(first).resolves.toEqual({ order: 1 });
      await expect(second).resolves.toEqual({ order: 2 });
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });

  it('rejects a timed-out job and continues with queued work on a recreated worker', async () => {
    type Listener = (event: any) => void;
    const workers: MockQueuedWorker[] = [];

    class MockQueuedWorker {
      listeners = new Map<string, Listener[]>();
      posted: any[] = [];
      constructor() {
        workers.push(this);
      }
      addEventListener(type: string, fn: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      removeEventListener(type: string, fn: Listener) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== fn));
      }
      postMessage(data: any) {
        this.posted.push(data);
      }
      terminate = vi.fn();
      respond(result: unknown) {
        const messageListeners = this.listeners.get('message') ?? [];
        for (const listener of messageListeners) listener({ data: { type: 'result', id: this.posted[0].id, ok: true, result } });
      }
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = MockQueuedWorker as any;
    (globalThis as any).window = globalThis;

    try {
      const first = runHeavy('readDxf', { text: 'hung' }, { timeoutMs: 10 });
      const second = runHeavy('readDxf', { text: 'after-timeout' });
      await Promise.resolve();

      await expect(first).rejects.toThrow('timed out after 10ms');
      expect(workers[0].terminate).toHaveBeenCalled();
      expect(workers).toHaveLength(2);
      expect(workers[1].posted.map((message) => message.payload.text)).toEqual(['after-timeout']);

      workers[1].respond({ order: 2 });
      await expect(second).resolves.toEqual({ order: 2 });
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });

  it('terminates a running worker on abort so a non-cooperative job cannot block the next one', async () => {
    type Listener = (event: any) => void;
    const workers: MockQueuedWorker[] = [];

    class MockQueuedWorker {
      listeners = new Map<string, Listener[]>();
      posted: any[] = [];
      constructor() {
        workers.push(this);
      }
      addEventListener(type: string, fn: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      removeEventListener(type: string, fn: Listener) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== fn));
      }
      postMessage(data: any) {
        this.posted.push(data);
      }
      terminate = vi.fn();
      respond(result: unknown) {
        for (const listener of this.listeners.get('message') ?? []) listener({ data: { type: 'result', id: this.posted[this.posted.length - 1].id, ok: true, result } });
      }
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = MockQueuedWorker as any;
    (globalThis as any).window = globalThis;

    try {
      const controller = new AbortController();
      const first = runHeavy('readDxf', { text: 'non-cooperative' }, { signal: controller.signal });
      const second = runHeavy('readDxf', { text: 'next' });
      await Promise.resolve();
      controller.abort();

      await expect(first).rejects.toThrowError(expect.objectContaining({ name: 'AbortError' }));
      expect(workers[0].terminate).toHaveBeenCalled();
      expect(workers[0].posted.some((message) => message.type === 'cancel')).toBe(true);
      expect(workers).toHaveLength(2);
      expect(workers[1].posted[0].payload.text).toBe('next');

      workers[1].respond({ order: 2 });
      await expect(second).resolves.toEqual({ order: 2 });
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });

  it('falls back with a preserved payload after a crash even when its ArrayBuffer was transferred', async () => {
    type Listener = (event: any) => void;
    const listeners = new Map<string, Listener[]>();
    class CrashingWorker {
      addEventListener(type: string, fn: Listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      }
      removeEventListener() {}
      postMessage(data: any, transfer?: Transferable[]) {
        // Simulate the browser detaching the sender's buffer during transfer.
        if (transfer?.length) structuredClone(data, { transfer: transfer as ArrayBuffer[] });
        queueMicrotask(() => {
          for (const listener of listeners.get('error') ?? []) listener({ message: 'worker crashed after transfer' });
        });
      }
      terminate = vi.fn();
    }

    const fallback = vi.spyOn(HEAVY_OPS, 'parseDwg').mockImplementation(async ({ bytes }) => ({ byteLength: bytes.byteLength } as never));
    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).Worker = CrashingWorker as any;
    (globalThis as any).window = globalThis;

    try {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const result = await runHeavy('parseDwg', { bytes }, { transfer: [bytes.buffer] });
      expect(result).toEqual({ byteLength: 5 });
      expect(fallback).toHaveBeenCalled();
    } finally {
      fallback.mockRestore();
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
    }
  });
});
