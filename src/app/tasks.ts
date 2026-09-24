export type TaskState = 'running' | 'completed' | 'failed' | 'cancelled';

export interface LocalizedText {
  es: string;
  en: string;
}

export interface TaskInfo {
  id: string;
  name: LocalizedText;
  state: TaskState;
  progress?: number; // 0 a 100
  phase?: LocalizedText | string;
  error?: LocalizedText | string;
  cancellable: boolean;
  cancel?: () => void;
  retry?: () => Promise<void>;
  startedAt: number;
  endedAt?: number;
}

export interface TaskContext {
  signal: AbortSignal;
  reportProgress: (progress?: number, phase?: LocalizedText | string) => void;
}

export class TaskManager {
  private tasks = new Map<string, TaskInfo>();
  private listeners = new Set<(tasks: TaskInfo[]) => void>();

  subscribe(fn: (tasks: TaskInfo[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.getTasks());
    return () => this.listeners.delete(fn);
  }

  getTasks(): TaskInfo[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  getActiveTasks(): TaskInfo[] {
    return this.getTasks().filter((t) => t.state === 'running');
  }

  private notify(): void {
    const list = this.getTasks();
    for (const fn of this.listeners) {
      try {
        fn(list);
      } catch {
        // Ignorar errores en observadores
      }
    }
  }

  async runTask<T>(
    id: string,
    name: LocalizedText,
    fn: (ctx: TaskContext) => Promise<T>,
    options?: { cancellable?: boolean; onCancel?: () => void; retryable?: boolean; signal?: AbortSignal }
  ): Promise<T> {
    const controller = new AbortController();
    const cancellable = options?.cancellable ?? true;
    const abortFromOwner = () => controller.abort();
    if (options?.signal?.aborted) controller.abort();
    else options?.signal?.addEventListener('abort', abortFromOwner, { once: true });

    const task: TaskInfo = {
      id,
      name,
      state: 'running',
      cancellable,
      cancel: cancellable
        ? () => {
            controller.abort();
            options?.onCancel?.();
          }
        : undefined,
      startedAt: Date.now(),
    };

    this.tasks.set(id, task);
    this.notify();

    const ctx: TaskContext = {
      signal: controller.signal,
      reportProgress: (progress, phase) => {
        const current = this.tasks.get(id);
        if (current === task && current.state === 'running') {
          current.progress = progress;
          current.phase = phase;
          this.notify();
        }
      },
    };

    try {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const result = await fn(ctx);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const current = this.tasks.get(id);
      if (current === task) {
        current.state = 'completed';
        current.endedAt = Date.now();
        this.notify();
        setTimeout(() => {
          if (this.tasks.get(id) === task && task.state === 'completed') {
            this.tasks.delete(id);
            this.notify();
          }
        }, 3000);
      }
      return result;
    } catch (err) {
      const current = this.tasks.get(id);
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError') ||
        controller.signal.aborted;

      if (current === task) {
        current.endedAt = Date.now();
        if (isAbort) {
          current.state = 'cancelled';
        } else {
          current.state = 'failed';
          current.error = err instanceof Error ? err.message : String(err);
          if (options?.retryable) {
            current.retry = async () => {
              await this.runTask(id, name, fn, options);
            };
          }
        }
        this.notify();
      }
      throw err;
    } finally {
      options?.signal?.removeEventListener('abort', abortFromOwner);
    }
  }

  cancelTask(id: string): void {
    const t = this.tasks.get(id);
    if (t && t.state === 'running' && t.cancel) {
      t.cancel();
    }
  }

  dismissTask(id: string): void {
    if (this.tasks.delete(id)) {
      this.notify();
    }
  }

  _clear(): void {
    this.tasks.clear();
    this.notify();
  }
}

export const taskManager = new TaskManager();
