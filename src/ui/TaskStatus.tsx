import { CircleAlert, CircleCheck, RotateCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { taskManager, type LocalizedText, type TaskInfo } from '../app/tasks';

const localized = (value: LocalizedText | string | undefined, lang: 'es' | 'en') => (typeof value === 'object' && value !== null ? (value[lang] ?? value.es) : value);

/** Operaciones largas en la barra de estado: nombre, fase, progreso real y acciones seguras (cancelar, reintentar, cerrar). */
export function TaskStatus({ lang }: { lang: 'es' | 'en' }) {
  const [tasks, setTasks] = useState<TaskInfo[]>(() => taskManager.getTasks());

  useEffect(() => {
    return taskManager.subscribe(setTasks);
  }, []);

  if (tasks.length === 0) return null;

  const t = (es: string, en: string) => (lang === 'es' ? es : en);

  return (
    <div className="task-status-container" role="status" aria-live="polite">
      {tasks.map((task) => {
        const title = localized(task.name, lang);
        const phase = localized(task.phase, lang);
        const errorText = localized(task.error, lang);
        const progress = task.progress === undefined ? undefined : Math.max(0, Math.min(100, Math.round(task.progress)));

        return (
          <div key={task.id} className={`task-status-item task-${task.state}`}>
            {task.state === 'running' && <span className="task-spinner" aria-hidden="true" />}
            {task.state === 'failed' && <CircleAlert size={13} aria-hidden="true" />}
            {task.state === 'completed' && <CircleCheck size={13} aria-hidden="true" />}
            <span className="task-status-item__title">{title}</span>
            {phase && <span className="task-status-item__phase">{phase}</span>}
            {progress !== undefined && task.state === 'running' && (
              <span className="task-progress" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span style={{ width: `${progress}%` }} />
              </span>
            )}
            {progress !== undefined && <span className="task-status-item__pct">{progress}%</span>}
            {task.state === 'failed' && errorText && (
              <span className="task-status-item__error" title={errorText}>
                {errorText}
              </span>
            )}
            {task.state === 'cancelled' && <span className="task-status-item__phase">{t('Cancelado', 'Cancelled')}</span>}
            {task.state === 'failed' && task.retry && (
              <button
                type="button"
                className="task-action task-retry-btn"
                onClick={() => {
                  void task.retry?.().catch(() => undefined);
                }}
                title={t('Reintentar operación', 'Retry operation')}
                aria-label={t('Reintentar operación', 'Retry operation')}
              >
                <RotateCw size={12} />
              </button>
            )}
            {task.state === 'running' && task.cancellable && (
              <button type="button" className="task-action task-cancel-btn" onClick={() => taskManager.cancelTask(task.id)} title={t('Cancelar operación', 'Cancel operation')} aria-label={t('Cancelar operación', 'Cancel operation')}>
                <X size={12} />
              </button>
            )}
            {task.state !== 'running' && (
              <button type="button" className="task-action task-dismiss-btn" onClick={() => taskManager.dismissTask(task.id)} title={t('Cerrar', 'Dismiss')} aria-label={t('Cerrar', 'Dismiss')}>
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
