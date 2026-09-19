import { useEffect, useMemo, useState } from 'react';
import type { LibraryBlock } from '../../blocks/library';
import { categoryTree } from '../../blocks/libraryCategories';
import type { ImportCandidate, LibraryImportSession, Resolution } from '../../blocks/libraryImport';
import { planLibraryWrite } from '../../blocks/libraryImport';
import { commitLibrary, loadLibrary } from '../../blocks/libraryStore';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

const UNITS = ['unitless', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'] as const;
const unitLabel = (lang: 'es' | 'en', unit: (typeof UNITS)[number]) => ({
  unitless: tr(lang, 'Sin unidad', 'Unitless'), mm: 'mm', cm: 'cm', m: 'm', km: 'km', in: 'in', ft: 'ft', yd: 'yd', mi: 'mi',
})[unit];

/** Revisión antes de guardar en la biblioteca: qué bloques, con qué nombre, categoría y etiquetas. */
export function LibraryImportDialog({ editor, session, onClose, onUi }: { editor: Editor; session: LibraryImportSession | undefined; onClose: () => void; onUi: (ui: string, cmd?: string, payload?: unknown) => void }) {
  const lang = editor.lang;
  const [items, setItems] = useState<ImportCandidate[]>(() => session?.candidates.map((c) => ({ ...c, tags: [...c.tags] })) ?? []);
  const [existing, setExisting] = useState<LibraryBlock[]>([]);
  const [resolution, setResolution] = useState<Record<string, Resolution>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => void loadLibrary().then(setExisting), []);
  const tree = useMemo(() => categoryTree(session?.categories ?? []), [session]);
  if (!session) return null;
  const clashes = new Set(items.filter((c) => existing.some((b) => b.name.trim().toLowerCase() === c.name.trim().toLowerCase())).map((c) => c.key));
  const selected = items.filter((c) => c.selected);
  const patch = (key: string, p: Partial<ImportCandidate>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const plan = planLibraryWrite({ ...session, candidates: items }, existing, (k) => resolution[k] ?? 'rename');
      await commitLibrary({ ...plan, categories: session.categories });
      editor.runner.message('info', { es: `${plan.put.length} bloque(s) guardado(s) en la biblioteca.`, en: `${plan.put.length} block(s) saved to the library.` });
      onClose();
      onUi('panel:blocks');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const title = session.mode === 'save' ? tr(lang, 'Guardar en la biblioteca', 'Save to library') : tr(lang, `Importar a la biblioteca · ${session.source.file ?? ''}`, `Import to library · ${session.source.file ?? ''}`);
  return (
    <Dialog
      wide
      lang={lang}
      title={title}
      onClose={onClose}
      footer={
        <>
          {session.report ? (
            <button className="btn" onClick={() => onUi('conversion-report', undefined, { kind: 'import', name: session.source.file ?? '', report: session.report })}>
              {tr(lang, 'Informe de conversión', 'Conversion report')}
            </button>
          ) : null}
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>{tr(lang, `${selected.length} de ${items.length} seleccionados`, `${selected.length} of ${items.length} selected`)}</span>
          {error && <span style={{ color: 'var(--fm-danger)', fontSize: 12 }}>{error}</span>}
          <button className="btn" onClick={onClose}>{tr(lang, 'Cancelar', 'Cancel')}</button>
          <button className="btn btn--primary" disabled={busy || !selected.length} onClick={save}>
            {tr(lang, `Guardar ${selected.length}`, `Save ${selected.length}`)}
          </button>
        </>
      }
    >
      {items.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className="btn btn--sm" onClick={() => setItems((xs) => xs.map((x) => ({ ...x, selected: true })))}>{tr(lang, 'Todos', 'All')}</button>
          <button className="btn btn--sm" onClick={() => setItems((xs) => xs.map((x) => ({ ...x, selected: false })))}>{tr(lang, 'Ninguno', 'None')}</button>
        </div>
      )}
      <div className="libimp">
        {items.map((c) => (
          <div key={c.key} className={`libimp__row${c.selected ? ' is-on' : ''}`}>
            <label className="libimp__pick">
              <input type="checkbox" checked={c.selected} onChange={(e) => patch(c.key, { selected: e.target.checked })} aria-label={tr(lang, `Incluir ${c.name}`, `Include ${c.name}`)} />
              <span className="libimp__thumb">{c.thumbnail ? <img src={c.thumbnail} width={56} height={56} alt="" /> : null}</span>
            </label>
            <div className="libimp__fields">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input" value={c.name} onChange={(e) => patch(c.key, { name: e.target.value })} aria-label={tr(lang, 'Nombre', 'Name')} />
                {c.dynamic && <span className="libbadge">{tr(lang, 'Dinámico', 'Dynamic')}</span>}
                {c.key === '*model' && <span className="libbadge libbadge--muted">{tr(lang, 'Dibujo entero', 'Whole drawing')}</span>}
                {!c.dynamic && (
                  <label className="libimp__stretch" title={tr(lang, 'Añade Ancho y Fondo para alargarlo o acortarlo', 'Adds Width and Depth to lengthen or shorten it')}>
                    <input type="checkbox" checked={!!c.stretchable} onChange={(e) => patch(c.key, { stretchable: e.target.checked })} /> {tr(lang, 'Estirable', 'Stretchable')}
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select className="select" value={c.categoryId} onChange={(e) => patch(c.key, { categoryId: e.target.value })} aria-label={tr(lang, 'Categoría', 'Category')}>
                  {tree.map((n) => (
                    <optgroup key={n.cat.id} label={n.cat.name}>
                      <option value={n.cat.id}>{n.cat.name}</option>
                      {n.children.map((ch) => (
                        <option key={ch.id} value={ch.id}>{`${n.cat.name} › ${ch.name}`}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-muted)' }}>
                  {tr(lang, 'Unidades', 'Units')}
                  <select className="select" value={c.units} onChange={(e) => patch(c.key, { units: e.target.value as ImportCandidate['units'] })} aria-label={tr(lang, 'Unidades de origen del bloque', 'Block source units')}>
                    {UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(lang, unit)}</option>)}
                  </select>
                </label>
                <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder={tr(lang, 'Etiquetas, separadas por comas', 'Tags, comma separated')} value={c.tags.join(', ')} onChange={(e) => patch(c.key, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
              </div>
              {clashes.has(c.key) && c.selected && (
                <div className="libimp__clash">
                  {tr(lang, 'Ya hay un bloque con este nombre:', 'A block with this name exists:')}
                  <select className="select" value={resolution[c.key] ?? 'rename'} onChange={(e) => setResolution((r) => ({ ...r, [c.key]: e.target.value as Resolution }))}>
                    <option value="rename">{tr(lang, 'Guardar con otro nombre', 'Keep both (rename)')}</option>
                    <option value="replace">{tr(lang, 'Sustituir', 'Replace')}</option>
                    <option value="skip">{tr(lang, 'Omitir', 'Skip')}</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
