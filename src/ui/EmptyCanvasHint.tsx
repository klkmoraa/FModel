import { Circle, FolderOpen, Minus, Square } from 'lucide-react';
import type { Editor } from '../editor/editor';
import { useEditorEvents } from './hooks';

/**
 * Pista de inicio sobre el lienzo vacío: explica cómo empezar (teclado y puntero) sin tapar el dibujo.
 * Desaparece con el primer objeto o en cuanto hay un comando en curso.
 */
export function EmptyCanvasHint({ editor, touch }: { editor: Editor; touch: boolean }) {
  useEditorEvents(editor, ['doc', 'command']);
  if (editor.doc.data.entities.size > 0 || editor.runner.busy || editor.blockEdit) return null;
  const lang = editor.lang;
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  const quick = [
    { cmd: 'LINE', key: 'L', label: t('Línea', 'Line'), icon: <Minus size={14} /> },
    { cmd: 'RECTANG', key: 'REC', label: t('Rectángulo', 'Rectangle'), icon: <Square size={13} /> },
    { cmd: 'CIRCLE', key: 'C', label: t('Círculo', 'Circle'), icon: <Circle size={13} /> },
  ];
  return (
    <div className="canvas-hint" role="region" aria-label={t('Cómo empezar', 'Getting started')}>
      <strong className="canvas-hint__title">{t('Lienzo vacío', 'Empty canvas')}</strong>
      <p className="canvas-hint__text">
        {touch
          ? t('Elige una herramienta en la barra inferior y toca el lienzo para colocar puntos.', 'Pick a tool in the bottom bar and tap the canvas to place points.')
          : t('Escribe el nombre de un comando y pulsa Intro, o elige una herramienta.', 'Type a command name and press Enter, or pick a tool.')}
      </p>
      <div className="canvas-hint__actions">
        {quick.map((q) => (
          <button key={q.cmd} type="button" className="btn btn--sm" onClick={() => editor.command(q.cmd)} title={`${q.label} · ${q.cmd}`}>
            {q.icon}
            {q.label}
            {!touch && <kbd>{q.key}</kbd>}
          </button>
        ))}
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => editor.command('OPEN')} title={t('Abrir un .fmodel o DXF', 'Open a .fmodel or DXF')}>
          <FolderOpen size={14} />
          {t('Abrir archivo…', 'Open file…')}
        </button>
      </div>
      {!touch && (
        <p className="canvas-hint__keys">
          <kbd>Ctrl K</kbd> {t('busca cualquier comando', 'searches every command')} · <kbd>F1</kbd> {t('ayuda', 'help')}
        </p>
      )}
    </div>
  );
}
