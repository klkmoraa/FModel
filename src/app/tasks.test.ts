import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TaskManager } from './tasks';

describe('TaskManager', () => {
  let tm: TaskManager;

  beforeEach(() => {
    tm = new TaskManager();
    vi.useFakeTimers();
  });

  it('runs a task and tracks progress and completion', async () => {
    const states: string[] = [];
    tm.subscribe((tasks) => {
      if (tasks[0]) states.push(`${tasks[0].state}:${tasks[0].progress ?? 0}`);
    });

    const resPromise = tm.runTask(
      'task-1',
      { es: 'Exportando', en: 'Exporting' },
      async (ctx) => {
        ctx.reportProgress(25, { es: 'Iniciando', en: 'Starting' });
        ctx.reportProgress(75, { es: 'Escribiendo', en: 'Writing' });
        return 'success';
      }
    );

    const result = await resPromise;
    expect(result).toBe('success');

    const tasks = tm.getTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].state).toBe('completed');

    // Auto-clean completed tasks
    vi.advanceTimersByTime(3500);
    expect(tm.getTasks()).toHaveLength(0);
  });

  it('handles cancellation properly', async () => {
    let cancelled = false;

    const promise = tm.runTask(
      'task-cancel',
      { es: 'Descargando', en: 'Downloading' },
      async (ctx) => {
        return new Promise((resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            cancelled = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
    );

    expect(tm.getActiveTasks()).toHaveLength(1);
    tm.cancelTask('task-cancel');

    await expect(promise).rejects.toThrow();
    expect(cancelled).toBe(true);
    expect(tm.getTasks()[0].state).toBe('cancelled');
  });

  it('cancels from an owning command signal even if the task resolves later', async () => {
    const owner = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const promise = tm.runTask(
      'task-owned',
      { es: 'Abriendo', en: 'Opening' },
      async () => {
        await gate;
        return 'stale result';
      },
      { signal: owner.signal },
    );

    owner.abort();
    release();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(tm.getTasks()[0].state).toBe('cancelled');
  });

  it('does not start a task when its owning signal was already aborted', async () => {
    const owner = new AbortController();
    owner.abort();
    const fn = vi.fn(async () => 'should not run');

    const promise = tm.runTask(
      'task-pre-aborted',
      { es: 'Abriendo', en: 'Opening' },
      fn,
      { signal: owner.signal },
    );

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fn).not.toHaveBeenCalled();
    expect(tm.getTasks()[0].state).toBe('cancelled');
  });

  it('does not let an older run overwrite the state of a newer task with the same id', async () => {
    let releaseOlder!: () => void;
    let releaseNewer!: () => void;
    const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
    const newerGate = new Promise<void>((resolve) => { releaseNewer = resolve; });

    const older = tm.runTask('shared', { es: 'Anterior', en: 'Older' }, async () => {
      await olderGate;
      return 'older';
    });
    const newer = tm.runTask('shared', { es: 'Reciente', en: 'Newer' }, async () => {
      await newerGate;
      return 'newer';
    });

    releaseOlder();
    await older;
    expect(tm.getTasks()).toEqual([
      expect.objectContaining({ name: { es: 'Reciente', en: 'Newer' }, state: 'running' }),
    ]);

    releaseNewer();
    await newer;
    expect(tm.getTasks()[0]).toEqual(expect.objectContaining({ state: 'completed' }));
  });

  it('handles task failure and preserves error message', async () => {
    const promise = tm.runTask(
      'task-fail',
      { es: 'Procesando', en: 'Processing' },
      async () => {
        throw new Error('Archivo dañado');
      }
    );

    await expect(promise).rejects.toThrow('Archivo dañado');
    const tasks = tm.getTasks();
    expect(tasks[0].state).toBe('failed');
    expect(tasks[0].error).toBe('Archivo dañado');

    // Dismiss manually
    tm.dismissTask('task-fail');
    expect(tm.getTasks()).toHaveLength(0);
  });

  it('keeps a failed task actionable and retries it with the original context', async () => {
    let attempts = 0;
    const promise = tm.runTask(
      'task-retry',
      { es: 'Importando', en: 'Importing' },
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Temporal');
        return 'ok';
      },
      { retryable: true },
    );

    await expect(promise).rejects.toThrow('Temporal');
    expect(tm.getTasks()[0].retry).toBeDefined();
    expect(tm.getTasks()[0].error).toBe('Temporal');
    await tm.getTasks()[0].retry?.();
    await vi.waitFor(() => expect(attempts).toBe(2));
    expect(tm.getTasks()[0].state).toBe('completed');
  });
});
