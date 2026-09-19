import { useEffect, useState } from 'react';
import { Download, FolderOpen, Plus, Trash2 } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { getServices } from '../../app/services';
import { downloadBlob } from '../../storage/fileAccess';
import type { StoredDrawing } from '../../storage/persistence';
import { tr } from '../controls';
import { confirmDiscard, openStoredDrawing } from './actions';
import { DrawingCard } from './DrawingCard';
import { InlineAlert } from './InlineAlert';
import { drawingLabel, formatBytes } from './relativeTime';
import { matchesQuery } from './welcomeSearch';
import { askConfirm } from '../ConfirmHost';

type Sort = 'recent' | 'name';

interface DrawingsViewProps {
  editor: Editor;
  dark: boolean;
  onOpenWorkspace: () => void;
  onCreateBlank: () => void;
  searchFilter?: string;
}

export function DrawingsView({ editor, dark, onOpenWorkspace, onCreateBlank, searchFilter = '' }: DrawingsViewProps) {
  const lang = editor.lang;
  const [drawings, setDrawings] = useState<StoredDrawing[] | null>(null);
  const [sort, setSort] = useState<Sort>('recent');
  const [alert, setAlert] = useState<string | null>(null);

  const loadList = async () => {
    try {
      setDrawings(await getServices().persistence.drawings());
    } catch {
      setDrawings([]);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  const handleOpen = async (d: StoredDrawing) => {
    if (!(await confirmDiscard(editor))) return;
    try {
      openStoredDrawing(editor, d);
      onOpenWorkspace();
    } catch {
      setAlert(
        tr(
          lang,
          `No se pudo abrir «${drawingLabel(d.name)}»: el archivo guardado está dañado o es de una versión incompatible. Tu dibujo actual no se ha tocado.`,
          `Could not open “${drawingLabel(d.name)}”: the saved file is damaged or from an incompatible version. Your current drawing was not touched.`,
        ),
      );
    }
  };

  const handleDownload = (d: StoredDrawing) => {
    const blob = new Blob([d.bytes as BlobPart], { type: 'application/x-fmodel' });
    downloadBlob(blob, d.name.toLowerCase().endsWith('.fmodel') ? d.name : `${d.name}.fmodel`);
  };

  const handleDelete = async (d: StoredDrawing) => {
    const label = drawingLabel(d.name);
    if (!(await askConfirm(lang, tr(lang, 'Eliminar dibujo', 'Delete drawing'), tr(lang, `¿Eliminar «${label}» de este navegador? No se puede deshacer.`, `Delete “${label}” from this browser? This cannot be undone.`), { confirmLabel: tr(lang, 'Eliminar', 'Delete'), danger: true }))) return;
    try {
      await getServices().persistence.deleteDrawing(d.id);
      await loadList();
    } catch {
      setAlert(tr(lang, `No se pudo eliminar «${label}».`, `Could not delete “${label}”.`));
    }
  };

  if (drawings === null) return <div className="welcome-loading">{tr(lang, 'Consultando el almacenamiento local…', 'Checking local storage…')}</div>;

  const totalBytes = drawings.reduce((n, d) => n + d.size, 0);
  const filtered = drawings
    .filter((d) => matchesQuery(searchFilter, [d.name]))
    .sort((a, b) => (sort === 'name' ? drawingLabel(a.name).localeCompare(drawingLabel(b.name), lang) : b.savedAt - a.savedAt));
  const now = Date.now();

  return (
    <section className="welcome-view welcome-drawings" aria-label={tr(lang, 'Mis dibujos', 'My drawings')}>
      <header className="welcome-view__head">
        <div>
          <h2>{tr(lang, 'Mis dibujos', 'My drawings')}</h2>
          <p>
            {drawings.length
              ? tr(lang, `${drawings.length} dibujos · ${formatBytes(totalBytes)} guardados en este navegador. Nada se sube a ningún servidor.`, `${drawings.length} drawings · ${formatBytes(totalBytes)} saved in this browser. Nothing is uploaded to any server.`)
              : tr(lang, 'Los dibujos que guardes se quedan en este navegador. Nada se sube a ningún servidor.', 'Drawings you save stay in this browser. Nothing is uploaded to any server.')}
          </p>
        </div>
        <button type="button" className="welcome-action-btn welcome-action-btn--primary" onClick={onCreateBlank}>
          <Plus size={16} aria-hidden="true" />
          <span>{tr(lang, 'Nuevo dibujo', 'New drawing')}</span>
        </button>
      </header>

      {alert && (
        <InlineAlert lang={lang} onClose={() => setAlert(null)}>
          {alert}
        </InlineAlert>
      )}

      {drawings.length > 1 && (
        <div className="welcome-categories" role="tablist" aria-label={tr(lang, 'Ordenar', 'Sort')}>
          {(
            [
              ['recent', tr(lang, 'Recientes', 'Recent')],
              ['name', tr(lang, 'Nombre', 'Name')],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={sort === id} className={`welcome-cat-btn${sort === id ? ' is-active' : ''}`} onClick={() => setSort(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="fmodel-recents welcome-drawings__grid">
          {filtered.map((d, i) => (
            <DrawingCard
              key={d.id}
              drawing={d}
              dark={dark}
              lang={lang}
              now={now}
              step={i}
              onOpen={() => handleOpen(d)}
              actions={
                <>
                  <button type="button" className="welcome-icon-action" title={tr(lang, 'Descargar .fmodel', 'Download .fmodel')} aria-label={tr(lang, `Descargar ${drawingLabel(d.name)}`, `Download ${drawingLabel(d.name)}`)} onClick={() => handleDownload(d)}>
                    <Download size={15} />
                  </button>
                  <button type="button" className="welcome-icon-action welcome-icon-action--danger" title={tr(lang, 'Eliminar', 'Delete')} aria-label={tr(lang, `Eliminar ${drawingLabel(d.name)}`, `Delete ${drawingLabel(d.name)}`)} onClick={() => void handleDelete(d)}>
                    <Trash2 size={15} />
                  </button>
                </>
              }
            />
          ))}
        </div>
      ) : drawings.length ? (
        <div className="welcome-empty">
          <p>{tr(lang, 'Ningún dibujo coincide con la búsqueda.', 'No drawing matches the search.')}</p>
        </div>
      ) : (
        <div className="welcome-empty">
          <FolderOpen size={40} className="welcome-empty__icon" aria-hidden="true" />
          <h3>{tr(lang, 'Aún no hay dibujos guardados', 'No saved drawings yet')}</h3>
          <p>
            {tr(
              lang,
              'Crea un dibujo y guárdalo con Ctrl+S: se quedará aquí, con su vista previa. También puedes empezar desde una plantilla o abrir un DXF.',
              'Create a drawing and save it with Ctrl+S: it will stay here, with a preview. You can also start from a template or open a DXF.',
            )}
          </p>
        </div>
      )}
    </section>
  );
}
