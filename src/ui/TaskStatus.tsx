import { useEffect, useState } from 'react';
import { taskManager, type TaskInfo } from '../app/tasks';

export function TaskStatus({ lang }: { lang: 'es' | 'en' }) {
  const [tasks, setTasks] = useState<TaskInfo[]>(() => taskManager.getTasks());

  useEffect(() => {
    return taskManager.subscribe(setTasks);
  }, []);

  if (tasks.length === 0) return null;

  return (
    <div className="task-status-container" role="status" aria-live="polite">
      {tasks.map((task) => {
        const title = task.name[lang] ?? task.name.es;
        const phase = typeof task.phase === 'object' && task.phase !== null ? task.phase[lang] ?? task.phase.es : task.phase;
        const errorText = typeof task.error === 'object' && task.error !== null ? task.error[lang] ?? task.error.es : task.error;

        return (
          <div
            key={task.id}
            className={`task-status-item task-${task.state}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              backgroundColor:
                task.state === 'failed'
                  ? 'var(--color-error-bg, rgba(239, 68, 68, 0.15))'
                  : task.state === 'cancelled'
                    ? 'var(--color-warn-bg, rgba(234, 179, 8, 0.15))'
                    : 'var(--color-surface-hover, rgba(255, 255, 255, 0.08))',
              color:
                task.state === 'failed'
                  ? 'var(--color-error, #ef4444)'
                  : task.state === 'cancelled'
                    ? 'var(--color-warn, #eab308)'
                    : 'var(--color-text, currentColor)',
            }}
          >
            {task.state === 'running' && (
              <span
                className="task-spinner"
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  border: '1.5px solid currentColor',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            )}
            <span style={{ fontWeight: 500 }}>{title}</span>
            {phase && <span style={{ opacity: 0.8 }}>({phase})</span>}
            {task.progress !== undefined && <span>{Math.round(task.progress)}%</span>}
            {task.state === 'failed' && <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>: {errorText}</span>}
            {task.state === 'cancelled' && <span>({lang === 'es' ? 'Cancelado' : 'Cancelled'})</span>}
            {task.state === 'running' && task.cancellable && (
              <button
                type="button"
                className="task-cancel-btn"
                onClick={() => taskManager.cancelTask(task.id)}
                title={lang === 'es' ? 'Cancelar operación' : 'Cancel operation'}
                aria-label={lang === 'es' ? 'Cancelar operación' : 'Cancel operation'}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 2px',
                  cursor: 'pointer',
                  color: 'inherit',
                  fontSize: '11px',
                }}
              >
                ✕
              </button>
            )}
            {task.state !== 'running' && (
              <button
                type="button"
                className="task-dismiss-btn"
                onClick={() => taskManager.dismissTask(task.id)}
                title={lang === 'es' ? 'Cerrar' : 'Dismiss'}
                aria-label={lang === 'es' ? 'Cerrar' : 'Dismiss'}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 2px',
                  cursor: 'pointer',
                  color: 'inherit',
                  fontSize: '11px',
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
