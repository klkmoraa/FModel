import { CircleAlert, History, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CommandLogEntry } from '../commands/runner';
import type { Editor } from '../editor/editor';
import { Dialog } from './Dialogs';
import { useEditorEvents } from './hooks';
import '../styles/commandFeedback.css';

const kindLabels: Record<CommandLogEntry['kind'], { es: string; en: string }> = {
  command: { es: 'Comando', en: 'Command' },
  prompt: { es: 'Solicitud', en: 'Prompt' },
  input: { es: 'Entrada', en: 'Input' },
  info: { es: 'Información', en: 'Info' },
  warn: { es: 'Aviso', en: 'Warning' },
  error: { es: 'Error', en: 'Error' },
};

/** Feedback independiente de la línea: también visible con el teclado móvil cerrado. */
export function CommandFeedback({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['command', 'prefs']);
  const [showHistory, setShowHistory] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLOListElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const feedback = editor.runner.feedback;
  const lang = editor.lang;
  const historyTitle = lang === 'es' ? 'Historial de comandos' : 'Command history';
  const lastLogId = editor.runner.log.at(-1)?.id;

  useEffect(() => {
    const toggle = () => setShowHistory((value) => !value);
    const rememberFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && !noticeRef.current?.contains(target) && !target.closest('[aria-modal="true"]')) {
        previousFocusRef.current = target;
      }
    };
    window.addEventListener('fmodel:cmdlog', toggle);
    document.addEventListener('focusin', rememberFocus);
    return () => {
      window.removeEventListener('fmodel:cmdlog', toggle);
      document.removeEventListener('focusin', rememberFocus);
    };
  }, []);

  useEffect(() => {
    const log = historyRef.current;
    if (showHistory && log) log.scrollTop = log.scrollHeight;
  }, [showHistory, lastLogId]);

  const dismiss = () => {
    if (!feedback) return;
    if (noticeRef.current?.contains(document.activeElement)) {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.canvas-host')?.focus({ preventScroll: true });
    }
    editor.runner.dismissFeedback(feedback);
  };

  return (
    <>
      {feedback && (
        <div
          ref={noticeRef}
          className={`command-feedback command-feedback--${feedback.kind}`}
          onKeyDown={(event) => {
            if (event.key === 'F2') return;
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              dismiss();
            }
          }}
        >
          <div key={feedback.id} className="command-feedback__message" role={feedback.kind === 'error' ? 'alert' : 'status'} aria-atomic="true" tabIndex={0}>
            {feedback.kind === 'error' ? <CircleAlert size={17} aria-hidden="true" /> : <TriangleAlert size={17} aria-hidden="true" />}
            <strong>{feedback.kind === 'error' ? (lang === 'es' ? 'Error de comando' : 'Command error') : kindLabels.warn[lang]}</strong>
            <p>{feedback.text}</p>
          </div>
          <div className="command-feedback__actions">
            <button type="button" className="btn btn--sm" aria-haspopup="dialog" onClick={() => setShowHistory(true)}>
              <History size={15} aria-hidden="true" />
              {lang === 'es' ? 'Ver historial' : 'View history'}
            </button>
            <button type="button" className="icon-btn" onMouseDown={(event) => event.preventDefault()} onClick={dismiss} aria-label={lang === 'es' ? 'Descartar aviso' : 'Dismiss notice'}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {showHistory && (
        <div onKeyDown={(event) => {
          // El historial es de lectura: escribir aquí nunca alimenta el comando del lienzo.
          event.stopPropagation();
          if (event.key === 'F2') {
            event.preventDefault();
            setShowHistory(false);
          }
        }}>
          <Dialog title={historyTitle} lang={lang} onClose={() => setShowHistory(false)} footer={
            <button type="button" className="btn" onClick={() => setShowHistory(false)}>{lang === 'es' ? 'Volver al dibujo' : 'Back to drawing'}</button>
          }>
            <p className="command-history__hint">{lang === 'es' ? 'Últimas 500 entradas. F2 o Esc para volver al dibujo.' : 'Last 500 entries. F2 or Esc to return to the drawing.'}</p>
            {editor.runner.log.length ? (
              <ol ref={historyRef} className="command-history" tabIndex={0} aria-label={historyTitle}>
                {editor.runner.log.map((entry) => (
                  <li key={entry.id} className={`command-history__entry command-history__entry--${entry.kind}`}>
                    <span className="command-history__kind">{kindLabels[entry.kind][lang]}</span>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ol>
            ) : <p>{lang === 'es' ? 'Todavía no hay comandos.' : 'No commands yet.'}</p>}
          </Dialog>
        </div>
      )}
    </>
  );
}
