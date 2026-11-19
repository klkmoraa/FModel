import { AlertCircle, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { getServices } from '../../app/services';
import type { Editor } from '../../editor/editor';
import type { StoredDrawing } from '../../storage/persistence';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';
import { askConfirm } from '../ConfirmHost';
import { confirmDiscard, openStoredDrawing } from '../welcome/actions';
import '../../styles/fileMenu.css';

export function FileMenu({ editor, onClose, onUi }: { editor: Editor; onClose: () => void; onUi: (ui: string, cmd?: string) => void }) {
  const lang = editor.lang;
  const savedHeadingId = useId();
  const [drawings, setDrawings] = useState<StoredDrawing[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoadState('loading');
    void getServices().persistence.drawings().then(
      (items) => {
        if (!active) return;
        setDrawings(items);
        setLoadState('ready');
      },
      () => { if (active) setLoadState('error'); },
    );
    return () => { active = false; };
  }, [loadAttempt]);
  const run = (cmd: string) => {
    onClose();
    editor.command(cmd);
  };
  const groups: { title: string; items: [string, string, string][] }[] = [
    {
      title: tr(lang, 'Dibujo', 'Drawing'),
      items: [
        ['NEW', tr(lang, 'Nuevo', 'New'), 'Ctrl+N'],
        ['OPEN', tr(lang, 'Abrir .fmodel / DXF…', 'Open .fmodel / DXF…'), 'Ctrl+O'],
        ['QSAVE', tr(lang, 'Guardar', 'Save'), 'Ctrl+S'],
        ['SAVEAS', tr(lang, 'Guardar como…', 'Save as…'), 'Ctrl+Shift+S'],
        ['VERSIONS', tr(lang, 'Historial de versiones', 'Version history'), ''],
        ['RECOVER', tr(lang, 'Recuperar autoguardado', 'Recover autosave'), ''],
      ],
    },
    {
      title: tr(lang, 'Intercambio', 'Exchange'),
      items: [
        ['IMPORTDXF', tr(lang, 'Importar DXF en el dibujo…', 'Import DXF into drawing…'), ''],
        ['EXPORTDXF', tr(lang, 'Exportar DXF', 'Export DXF'), ''],
        ['EXPORTSVG', tr(lang, 'Exportar SVG', 'Export SVG'), ''],
        ['PLOT', tr(lang, 'Trazar a PDF vectorial…', 'Plot to vector PDF…'), 'Ctrl+P'],
        ['PUBLISH', tr(lang, 'Publicar presentaciones (PDF)…', 'Publish layouts (PDF)…'), ''],
        ['EXPORTJSON', tr(lang, 'JSON de depuración', 'Debug JSON'), ''],
      ],
    },
    {
      title: tr(lang, 'Calidad y ajustes', 'Quality & settings'),
      items: [
        ['AUDIT', tr(lang, 'Auditar dibujo', 'Audit drawing'), ''],
        ['HEALTHREPORT', tr(lang, 'Informe de salud', 'Health report'), ''],
        ['PURGE', tr(lang, 'Limpiar elementos sin uso', 'Purge unused'), ''],
        ['OPTIONS', tr(lang, 'Opciones, alias y atajos', 'Options, aliases & shortcuts'), ''],
        ['HELP', tr(lang, 'Ayuda y estado de funciones', 'Help & feature status'), 'F1'],
      ],
    },
  ];
  return (
    <Dialog
      title={tr(lang, 'Archivo', 'File')}
      onClose={onClose}
      lang={lang}
      wide
      footer={error ? <div role="alert" className="file-menu__alert"><AlertCircle size={16} aria-hidden="true" /><span>{error}</span></div> : undefined}
    >
      <div className="file-menu">
        <div className="file-menu__actions">
          {groups.map((g) => (
            <section key={g.title} className="file-menu__group" aria-label={g.title}>
              <h3 className="eyebrow file-menu__heading">{g.title}</h3>
              {g.items.map(([cmd, label, kbd]) => (
                <button type="button" key={cmd} className="menu-item file-menu__action" onClick={() => (cmd === 'OPTIONS' ? (onClose(), onUi('options')) : run(cmd))}>
                  <span>{label}</span>
                  {kbd && <kbd>{kbd}</kbd>}
                </button>
              ))}
            </section>
          ))}
        </div>
        <section className="file-menu__saved" aria-labelledby={savedHeadingId} aria-busy={loadState === 'loading'}>
          <div className="file-menu__saved-head">
            <h3 id={savedHeadingId} className="file-menu__saved-title">{tr(lang, 'Guardados en este navegador', 'Stored in this browser')}</h3>
            {loadState === 'ready' && drawings.length > 0 && <span className="file-menu__count">{drawings.length}</span>}
          </div>
          {loadState === 'loading' && <p role="status" className="file-menu__state">{tr(lang, 'Consultando los dibujos guardados…', 'Loading stored drawings…')}</p>}
          {loadState === 'error' && (
            <div className="file-menu__state">
              <p role="alert">{tr(lang, 'No se pudieron consultar los dibujos guardados. Reintenta para comprobar el almacenamiento.', 'Could not load stored drawings. Retry to check local storage.')}</p>
              <button type="button" className="btn file-menu__retry" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{tr(lang, 'Reintentar', 'Retry')}</button>
            </div>
          )}
          {loadState === 'ready' && !drawings.length && <p className="file-menu__state">{tr(lang, 'Aún no hay dibujos guardados localmente.', 'No locally stored drawings yet.')}</p>}
          {loadState === 'ready' && drawings.length > 0 && (
            <ul className="file-menu__drawings">
              {drawings.slice(0, 12).map((d) => {
                const savedAt = new Date(d.savedAt);
                const validDate = Number.isFinite(savedAt.getTime());
                const deleting = deletingId === d.id;
                return (
                  <li key={d.id} className="file-menu__drawing">
                    <button
                      type="button"
                      className="menu-item file-menu__open"
                      disabled={deleting}
                      onClick={async () => {
                        if (!(await confirmDiscard(editor))) return;
                        try {
                          openStoredDrawing(editor, d);
                        } catch {
                          setError(tr(lang,
                            `No se pudo abrir «${d.name}»: el archivo guardado puede estar dañado o ser de una versión incompatible`,
                            `Could not open “${d.name}”: the saved file may be damaged or from an incompatible version`,
                          ));
                          return;
                        }
                        onClose();
                      }}
                    >
                      <span className="file-menu__name">{d.name}</span>
                      {deleting ? <span role="status" className="file-menu__date">{tr(lang, 'Eliminando…', 'Deleting…')}</span> : (
                        <time className="file-menu__date" dateTime={validDate ? savedAt.toISOString() : undefined}>
                          {validDate ? savedAt.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : tr(lang, 'Fecha no disponible', 'Date unavailable')}
                        </time>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon btn--danger-icon file-menu__delete"
                      disabled={deletingId !== null}
                      title={tr(lang, 'Eliminar de este navegador', 'Delete from this browser')}
                      aria-label={tr(lang, `Eliminar «${d.name}»`, `Delete “${d.name}”`)}
                      onClick={async () => {
                        const ok = await askConfirm(lang, tr(lang, 'Eliminar dibujo', 'Delete drawing'), tr(lang, `¿Eliminar «${d.name}» de este navegador? No se puede deshacer.`, `Delete “${d.name}” from this browser? This cannot be undone.`), { confirmLabel: tr(lang, 'Eliminar', 'Delete'), danger: true });
                        if (!ok) return;
                        setDeletingId(d.id);
                        setError('');
                        try {
                          await getServices().persistence.deleteDrawing(d.id);
                          setDrawings((items) => items.filter((item) => item.id !== d.id));
                        } catch {
                          setError(tr(lang, `No se pudo eliminar «${d.name}». El dibujo sigue en la lista; puedes volver a intentarlo.`, `Could not delete “${d.name}”. The drawing remains in the list; you can try again.`));
                        } finally {
                          setDeletingId(null);
                        }
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {loadState === 'ready' && drawings.length > 12 && <p className="file-menu__limit">{tr(lang, `Se muestran los 12 más recientes de ${drawings.length} dibujos`, `Showing the 12 most recent of ${drawings.length} drawings`)}</p>}
        </section>
      </div>
    </Dialog>
  );
}
