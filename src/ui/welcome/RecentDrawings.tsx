import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { getServices } from '../../app/services';
import type { StoredDrawing } from '../../storage/persistence';
import { tr } from '../controls';
import { InlineAlert } from './InlineAlert';
import { confirmDiscard, openStoredDrawing } from './actions';
import { drawingLabel } from './relativeTime';
import { DrawingCard } from './DrawingCard';

const LIMIT = 4;

interface RecentDrawingsProps {
  editor: Editor;
  dark: boolean;
  onOpened: () => void;
  onSeeAll: () => void;
}

export function RecentDrawings({ editor, dark, onOpened, onSeeAll }: RecentDrawingsProps) {
  const lang = editor.lang;
  const [drawings, setDrawings] = useState<StoredDrawing[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getServices()
      .persistence.drawings()
      .then((list) => {
        if (!alive) return;
        setTotal(list.length);
        setDrawings(list.slice(0, LIMIT));
      })
      .catch(() => alive && setDrawings([]));
    return () => {
      alive = false;
    };
  }, []);

  const open = async (d: StoredDrawing) => {
    if (!(await confirmDiscard(editor))) return;
    try {
      openStoredDrawing(editor, d);
      onOpened();
    } catch {
      // No se abre el lienzo: el dibujo actual sigue intacto y el aviso dice cuál falló
      setFailed(drawingLabel(d.name));
    }
  };

  const now = Date.now();

  return (
    <section className="fmodel-section" aria-labelledby="fmodel-recent-title">
      <header className="fmodel-section__head">
        <div>
          <h2 id="fmodel-recent-title">{tr(lang, 'Dibujos recientes', 'Recent drawings')}</h2>
          <p>{tr(lang, 'Guardados en este navegador. Nada sale de tu equipo.', 'Saved in this browser. Nothing leaves your device.')}</p>
        </div>
        {total > 0 && (
          <button type="button" className="fmodel-section__link" onClick={onSeeAll}>
            <span>{total > LIMIT ? tr(lang, `Ver los ${total}`, `See all ${total}`) : tr(lang, 'Gestionar', 'Manage')}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </header>

      {failed && (
        <InlineAlert lang={lang} onClose={() => setFailed(null)}>
            {tr(
              lang,
              `No se pudo abrir «${failed}»: el archivo guardado está dañado o es de una versión incompatible. Tu dibujo actual no se ha tocado.`,
              `Could not open “${failed}”: the saved file is damaged or from an incompatible version. Your current drawing was not touched.`,
            )}
        </InlineAlert>
      )}

      {drawings === null ? (
        <div className="welcome-loading">{tr(lang, 'Consultando el almacenamiento local…', 'Checking local storage…')}</div>
      ) : drawings.length > 0 ? (
        <div className="fmodel-recents">
          {drawings.map((d, i) => (
            <DrawingCard key={d.id} drawing={d} dark={dark} lang={lang} now={now} step={i} onOpen={() => open(d)} />
          ))}
        </div>
      ) : (
        <div className="fmodel-recents-empty">
          <p>
            {tr(
              lang,
              'Aún no has guardado dibujos en este navegador. Guarda con Ctrl+S y aparecerán aquí, con su vista previa.',
              'You have not saved drawings in this browser yet. Save with Ctrl+S and they will appear here, with a preview.',
            )}
          </p>
        </div>
      )}
    </section>
  );
}
