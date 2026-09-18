import type { ReactNode } from 'react';
import { FileWarning } from 'lucide-react';
import type { StoredDrawing } from '../../storage/persistence';
import { tr } from '../controls';
import { drawingLabel, formatBytes, relativeTime } from './relativeTime';
import { useStoredDrawingPreview } from './templatePreview';

interface DrawingCardProps {
  drawing: StoredDrawing;
  dark: boolean;
  lang: 'es' | 'en';
  now: number;
  step: number;
  onOpen: () => void;
  /** acciones secundarias (descargar, eliminar) en la barra inferior */
  actions?: ReactNode;
}

/** Tarjeta de dibujo guardado: miniatura real, fecha relativa, tamaño y aviso si no se puede leer. */
export function DrawingCard({ drawing, dark, lang, now, step, onOpen, actions }: DrawingCardProps) {
  const { src, broken } = useStoredDrawingPreview(drawing, dark);
  const label = drawingLabel(drawing.name);
  const exact = new Date(drawing.savedAt).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <article className={`fmodel-quick-card fmodel-recent${broken ? ' is-broken' : ''}`} style={{ '--reveal-step': step } as React.CSSProperties}>
      <button type="button" className="fmodel-recent__open" onClick={onOpen} aria-label={tr(lang, `Abrir ${label}`, `Open ${label}`)}>
        <span className="fmodel-quick-card__preview fmodel-recent__preview">
          {broken ? (
            <span className="fmodel-recent__broken">
              <FileWarning size={26} aria-hidden="true" />
              {tr(lang, 'No se puede leer', 'Cannot be read')}
            </span>
          ) : src ? (
            <img src={src} alt="" draggable={false} />
          ) : (
            <span className="template-preview-pending" />
          )}
        </span>
      </button>
      <span className="fmodel-recent__foot">
        <span className="fmodel-quick-card__body">
          <strong title={label}>{label}</strong>
          <span className="fmodel-recent__meta">
            <time dateTime={new Date(drawing.savedAt).toISOString()} title={exact}>
              {relativeTime(drawing.savedAt, now, lang)}
            </time>
            <span aria-hidden="true">·</span>
            <span>{formatBytes(drawing.size)}</span>
          </span>
        </span>
        {actions && <span className="fmodel-recent__actions">{actions}</span>}
      </span>
    </article>
  );
}
