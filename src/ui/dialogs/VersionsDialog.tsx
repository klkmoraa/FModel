import { GitCompare, History, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getServices } from '../../app/services';
import { compareDrawings } from '../../audit/compare';
import type { Editor } from '../../editor/editor';
import type { VersionRecord } from '../../storage/persistence';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

/** Historial local de versiones del dibujo actual (IndexedDB, sin salir del navegador). */
export function VersionsDialog({ editor, onClose, onUi }: { editor: Editor; onClose: () => void; onUi: (ui: string) => void }) {
  const lang = editor.lang;
  const persistence = getServices().persistence;
  const [versions, setVersions] = useState<VersionRecord[] | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const refresh = () =>
    persistence
      .versions(editor.doc.id)
      .then(setVersions)
      .catch(() => setVersions([]));
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    try {
      await persistence.saveVersion(label.trim() || tr(lang, 'Versión manual', 'Manual version'));
      setLabel('');
      setError('');
      await refresh();
    } catch (err) {
      setError(tr(lang, `No se pudo guardar: ${String(err)}`, `Could not save: ${String(err)}`));
    }
  };

  const restore = (v: VersionRecord) => {
    const msg = editor.doc.dirty ? tr(lang, 'Hay cambios sin guardar como versión. ¿Restaurar igualmente? (Se guarda antes una versión automática del estado actual.)', 'There are changes not saved as a version. Restore anyway? (An automatic version of the current state is saved first.)') : tr(lang, `¿Restaurar «${v.label}»?`, `Restore "${v.label}"?`);
    if (!window.confirm(msg)) return;
    void (async () => {
      await persistence.saveVersion(tr(lang, 'Antes de restaurar', 'Before restore'), true).catch(() => undefined);
      const res = persistence.loadVersion(v);
      editor.doc.replaceData(res.data, editor.doc.id);
      editor.doc.dirty = true;
      editor.zoomExtents();
      editor.runner.message('info', { es: `Restaurada la versión «${v.label}» del ${new Date(v.savedAt).toLocaleString()}.`, en: `Restored version "${v.label}" from ${new Date(v.savedAt).toLocaleString()}.` });
      onClose();
    })();
  };

  const compare = (v: VersionRecord) => {
    editor.compare = { diff: compareDrawings(persistence.loadVersion(v).data, editor.doc.data), label: v.label || new Date(v.savedAt).toLocaleString() };
    editor.emit('overlay');
    onUi('compare');
  };

  return (
    <Dialog
      wide
      lang={lang}
      title={tr(lang, 'Historial de versiones', 'Version history')}
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 12, color: error ? 'var(--fm-danger)' : 'var(--ink-muted)' }}>
            {error || tr(lang, 'Las versiones se guardan solo en este navegador. Se conservan las 40 automáticas más recientes y todas las manuales.', 'Versions are stored only in this browser. The 40 latest automatic versions and all manual ones are kept.')}
          </span>
          <button className="btn btn--primary" onClick={onClose}>
            {tr(lang, 'Cerrar', 'Close')}
          </button>
        </>
      }
    >
      <div className="report">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
          <input className="input" value={label} placeholder={tr(lang, 'Etiqueta de la versión (p. ej. «Entrega cliente»)', 'Version label (e.g. "Client issue")')} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && void save())} aria-label={tr(lang, 'Etiqueta', 'Label')} />
          <button className="btn btn--sm" onClick={() => void save()}>
            <Save size={13} /> {tr(lang, 'Guardar versión', 'Save version')}
          </button>
        </div>
        {versions === null ? (
          <p className="empty">{tr(lang, 'Cargando…', 'Loading…')}</p>
        ) : versions.length ? (
          <table className="grid">
            <thead>
              <tr>
                <th>{tr(lang, 'Versión', 'Version')}</th>
                <th>{tr(lang, 'Fecha', 'Date')}</th>
                <th>{tr(lang, 'Tipo', 'Type')}</th>
                <th style={{ textAlign: 'right' }}>{tr(lang, 'Objetos', 'Objects')}</th>
                <th style={{ textAlign: 'right' }}>{tr(lang, 'Tamaño', 'Size')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.label}</strong>
                  </td>
                  <td>{new Date(v.savedAt).toLocaleString()}</td>
                  <td>
                    <span className={`status-pill status-pill--${v.auto ? 'planeado' : 'disponible'}`}>{v.auto ? tr(lang, 'auto', 'auto') : tr(lang, 'manual', 'manual')}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{v.entityCount}</td>
                  <td style={{ textAlign: 'right' }}>{Math.max(1, Math.round(v.bytes.length / 1024))} KB</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn btn--sm" onClick={() => compare(v)} title={tr(lang, 'Comparar con el dibujo actual', 'Compare with current drawing')}>
                        <GitCompare size={12} /> {tr(lang, 'Comparar', 'Compare')}
                      </button>
                      <button className="btn btn--sm" onClick={() => restore(v)}>
                        <History size={12} /> {tr(lang, 'Restaurar', 'Restore')}
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={tr(lang, 'Eliminar versión', 'Delete version')}
                        onClick={() => {
                          if (!window.confirm(tr(lang, `¿Eliminar la versión «${v.label}»? No se puede deshacer.`, `Delete version "${v.label}"? This cannot be undone.`))) return;
                          void persistence.deleteVersion(v.id).then(refresh);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">{tr(lang, 'Todavía no hay versiones de este dibujo. Guarda una o espera al autoguardado.', 'No versions of this drawing yet. Save one or wait for autosave.')}</p>
        )}
      </div>
    </Dialog>
  );
}
