import { Download, FileImage, FileText, Link2, RefreshCw, Trash2 } from 'lucide-react';
import type { AssetRecord, BlockRecord, XrefInfo } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { downloadBlob } from '../../storage/fileAccess';
import { LIBRARY_PREFIX } from '../../xref/sources';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';
import { useEditorEvents } from '../hooks';

const STATUS: Record<XrefInfo['status'], { es: string; en: string; tone: string }> = {
  loaded: { es: 'Cargada', en: 'Loaded', tone: 'disponible' },
  unloaded: { es: 'Descargada', en: 'Unloaded', tone: 'planeado' },
  'not-found': { es: 'No encontrada', en: 'Not found', tone: 'experimental' },
  unresolved: { es: 'Sin resolver', en: 'Unresolved', tone: 'experimental' },
  circular: { es: 'Circular', en: 'Circular', tone: 'experimental' },
};

function kb(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Gestor de referencias externas: dibujos, imágenes y calcos PDF con su estado. */
export function ReferencesDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  useEditorEvents(editor, ['doc']);
  const lang = editor.lang;
  const doc = editor.doc;
  const xrefs = [...doc.data.blocks.values()].filter((b): b is BlockRecord & { xref: XrefInfo } => b.kind === 'xref' && !!b.xref);
  const entities = [...doc.data.entities.values()];
  const inserts = (id: string) => entities.filter((e) => e.type === 'insert' && e.blockId === id).length;
  const assetUses = (a: AssetRecord) => entities.filter((e) => (e.type === 'image' || e.type === 'pdfunderlay') && e.assetId === a.id).length;
  const assets = [...doc.data.assets.values()].filter((a) => assetUses(a) > 0);
  const images = assets.filter((a) => a.mime !== 'application/pdf');
  const pdfs = assets.filter((a) => a.mime === 'application/pdf');
  const run = (cmd: string, args?: string[]) => {
    onClose();
    editor.command(cmd, args);
  };
  const removeAsset = (a: AssetRecord) => {
    if (!window.confirm(tr(lang, `Se eliminarán ${assetUses(a)} referencia(s) a «${a.name}». Se puede deshacer.`, `${assetUses(a)} reference(s) to "${a.name}" will be deleted. This can be undone.`))) return;
    doc.transact('DETACH ASSET', (tx) => {
      for (const e of entities) if ((e.type === 'image' || e.type === 'pdfunderlay') && e.assetId === a.id) tx.removeEntity(e.id);
      tx.remove('assets', a.id);
    });
  };
  const saveAsset = async (a: AssetRecord) => {
    if (!a.dataUrl) return;
    const blob = await (await fetch(a.dataUrl)).blob();
    downloadBlob(blob, a.name);
  };

  return (
    <Dialog
      wide
      lang={lang}
      title={tr(lang, 'Referencias externas', 'External references')}
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>
            {tr(lang, 'El dibujo guarda una copia del contenido de cada referencia: se comparte sin archivos sueltos y se actualiza al recargar.', 'The drawing keeps a copy of each reference content: it shares without loose files and updates on reload.')}
          </span>
          <button className="btn" onClick={onClose}>
            {tr(lang, 'Cerrar', 'Close')}
          </button>
        </>
      }
    >
      <div className="report">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn--sm" onClick={() => run('XATTACH')}>
            <Link2 size={13} /> {tr(lang, 'Enlazar dibujo…', 'Attach drawing…')}
          </button>
          <button className="btn btn--sm" onClick={() => run('IMAGEATTACH')}>
            <FileImage size={13} /> {tr(lang, 'Imagen…', 'Image…')}
          </button>
          <button className="btn btn--sm" onClick={() => run('PDFATTACH')}>
            <FileText size={13} /> {tr(lang, 'Calco PDF…', 'PDF underlay…')}
          </button>
          {xrefs.length > 0 && (
            <button className="btn btn--sm" onClick={() => run('XRELOAD', ['*'])}>
              <RefreshCw size={13} /> {tr(lang, 'Recargar todas', 'Reload all')}
            </button>
          )}
        </div>

        <section>
          <h3 className="eyebrow">{tr(lang, 'Dibujos', 'Drawings')}</h3>
          {xrefs.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>{tr(lang, 'Nombre', 'Name')}</th>
                  <th>{tr(lang, 'Estado', 'Status')}</th>
                  <th>{tr(lang, 'Tipo', 'Type')}</th>
                  <th>{tr(lang, 'Origen', 'Source')}</th>
                  <th style={{ textAlign: 'right' }}>{tr(lang, 'Inserciones', 'Insertions')}</th>
                  <th>{tr(lang, 'Cargada', 'Loaded')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {xrefs.map((b) => {
                  const st = STATUS[b.xref.status];
                  return (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.name}</strong>
                        {b.xref.error && <div style={{ color: 'var(--ink-muted)', fontSize: 11 }}>{b.xref.error}</div>}
                      </td>
                      <td>
                        <span className={`status-pill status-pill--${st.tone}`}>{st[lang]}</span>
                      </td>
                      <td>{b.xref.mode === 'attach' ? tr(lang, 'Enlazar', 'Attach') : tr(lang, 'Superponer', 'Overlay')}</td>
                      <td title={b.xref.path}>{b.xref.path.startsWith(LIBRARY_PREFIX) ? tr(lang, 'Biblioteca local', 'Local library') : b.xref.path}</td>
                      <td style={{ textAlign: 'right' }}>{inserts(b.id)}</td>
                      <td>{b.xref.lastLoaded ? new Date(b.xref.lastLoaded).toLocaleString() : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button className="btn btn--sm" onClick={() => run('XRELOAD', [b.name])}>
                            {tr(lang, 'Recargar', 'Reload')}
                          </button>
                          {b.xref.status !== 'unloaded' && (
                            <button className="btn btn--sm" onClick={() => run('XUNLOAD', [b.name])}>
                              {tr(lang, 'Descargar', 'Unload')}
                            </button>
                          )}
                          <button className="btn btn--sm" onClick={() => run('XOPEN', [b.name])}>
                            {tr(lang, 'Abrir', 'Open')}
                          </button>
                          <button className="btn btn--sm" onClick={() => run('XREPATH', [b.name])}>
                            {tr(lang, 'Ruta…', 'Path…')}
                          </button>
                          <button className="btn btn--sm" disabled={b.xref.status === 'unloaded'} onClick={() => run('XBIND', [b.name])}>
                            {tr(lang, 'Unir', 'Bind')}
                          </button>
                          <button className="btn btn--sm btn--danger" onClick={() => window.confirm(tr(lang, `¿Desenlazar «${b.name}» y borrar sus ${inserts(b.id)} inserción(es)?`, `Detach "${b.name}" and delete its ${inserts(b.id)} insertion(s)?`)) && run('XDETACH', [b.name])}>
                            {tr(lang, 'Desenlazar', 'Detach')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty">{tr(lang, 'No hay dibujos referenciados.', 'No referenced drawings.')}</p>
          )}
        </section>

        {[
          { title: tr(lang, 'Imágenes', 'Images'), list: images, empty: tr(lang, 'No hay imágenes.', 'No images.') },
          { title: tr(lang, 'Calcos PDF', 'PDF underlays'), list: pdfs, empty: tr(lang, 'No hay calcos PDF.', 'No PDF underlays.') },
        ].map((group) => (
          <section key={group.title}>
            <h3 className="eyebrow">{group.title}</h3>
            {group.list.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th>{tr(lang, 'Archivo', 'File')}</th>
                    <th>{tr(lang, 'Tamaño', 'Size')}</th>
                    <th>{tr(lang, 'Dimensiones', 'Dimensions')}</th>
                    <th style={{ textAlign: 'right' }}>{tr(lang, 'Usos', 'Uses')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {group.list.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 11 }}>{a.dataUrl ? tr(lang, 'Incrustado en el dibujo', 'Embedded in drawing') : tr(lang, 'Sin datos: vuelve a enlazarlo', 'No data: attach it again')}</div>
                      </td>
                      <td>{kb(a.size)}</td>
                      <td>
                        {a.width && a.height ? `${Math.round(a.width)} × ${Math.round(a.height)} ${a.mime === 'application/pdf' ? 'pt' : 'px'}` : '—'}
                        {a.pages ? tr(lang, ` · ${a.pages} pág.`, ` · ${a.pages} p.`) : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>{assetUses(a)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="icon-btn" disabled={!a.dataUrl} onClick={() => void saveAsset(a)} aria-label={tr(lang, 'Guardar archivo', 'Save file')} title={tr(lang, 'Guardar archivo', 'Save file')}>
                            <Download size={14} />
                          </button>
                          <button className="icon-btn" onClick={() => removeAsset(a)} aria-label={tr(lang, 'Desenlazar', 'Detach')} title={tr(lang, 'Desenlazar', 'Detach')}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">{group.empty}</p>
            )}
          </section>
        ))}
      </div>
    </Dialog>
  );
}
