import { ArrowDown, ArrowUp, Check, Copy, Eraser, Eye, EyeOff, Focus, Lock, Plus, Printer, RotateCcw, Save, Snowflake, Sun, Trash2, Unlock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { colorLabel, displayColor } from '../../document/colors';
import type { Id, LayerRecord, ViewportEntity } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { canDeleteLayer, captureLayerState, createLayer, isolateLayers, layerMatchesFilter, layerUsage, purgeEmptyLayers, restoreLayerState, uniqueLayerName, unisolateLayers, validateLayerName, wildcardMatch } from '../../layers/layerOps';
import { newId } from '../../document/ids';
import { useEditorEvents } from '../hooks';
import { ColorPicker, LinetypeSelect, LineweightSelect, tr } from '../controls';
import { askText } from '../ConfirmHost';

type SortKey = 'name' | 'color' | 'used' | 'order';

export function LayersPanel({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['doc', 'space', 'selection']);
  const lang = editor.lang;
  const doc = editor.doc;
  const [search, setSearch] = useState('');
  const [filterId, setFilterId] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [selected, setSelected] = useState<Id[]>([]);
  const [editing, setEditing] = useState<Id | null>(null);
  const [editName, setEditName] = useState('');
  const [allColumns, setAllColumns] = useState(false);
  const usage = useMemo(() => layerUsage(doc), [doc.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const vp = editor.activeViewport ?? ((editor.spaceKind === 'layout' && editor.selection.size === 1 && doc.entity(editor.selection.list[0])?.type === 'viewport') ? (doc.entity(editor.selection.list[0]) as ViewportEntity) : null);
  const current = doc.settings.currentLayer;
  const filter = filterId === 'all' ? null : filterId === 'used' ? { id: 'used', name: '', rule: { used: true } } : filterId === 'unused' ? { id: 'unused', name: '', rule: { used: false } } : (doc.data.layerFilters.get(filterId) ?? null);

  let layers = [...doc.data.layers.values()].filter((l) => (!search || wildcardMatch(search.includes('*') || search.includes('?') ? search : `*${search}*`, l.name)) && (!filter || layerMatchesFilter(doc, l, filter, usage)));
  layers = layers.sort((a, b) => {
    const k = sort.key;
    const va = k === 'name' ? a.name.toLowerCase() : k === 'color' ? a.color : k === 'used' ? (usage.get(a.id) ?? 0) : a.order;
    const vb = k === 'name' ? b.name.toLowerCase() : k === 'color' ? b.color : k === 'used' ? (usage.get(b.id) ?? 0) : b.order;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });

  const update = (id: Id, patch: Partial<LayerRecord>, label = 'LAYER') => doc.transact(label, (tx) => tx.update('layers', id, patch));
  const msg = (kind: 'info' | 'warn' | 'error', es: string, en: string) => editor.runner.message(kind, { es, en });
  const dark = document.documentElement.dataset.theme === 'noche' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const targets = selected.length ? selected : [];

  const commitRename = (l: LayerRecord) => {
    const name = editName.trim();
    setEditing(null);
    if (name === l.name) return;
    const v = validateLayerName(doc, name, l.id);
    if (!v.ok) return msg('error', v.es, v.en);
    update(l.id, { name }, 'LAYER RENAME');
  };

  const sortBtn = (key: SortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="grid__sort" title={tr(lang, `Ordenar por ${label.toLowerCase()}`, `Sort by ${label.toLowerCase()}`)} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />) : null}
      </button>
    </th>
  );

  return (
    <div className="panel panel--layers" style={{ gap: 8 }}>
      <div className="layers-toolbar" role="toolbar" aria-label={tr(lang, 'Acciones de capas', 'Layer actions')}>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn--sm btn--icon"
            title={tr(lang, 'Nueva capa', 'New layer')}
            aria-label={tr(lang, 'Nueva capa', 'New layer')}
            onClick={() => {
              const l = doc.transact('LAYER NEW', (tx) => createLayer(tx, doc, { name: uniqueLayerName(doc, tr(lang, 'Capa', 'Layer')) }));
              setSelected([l.id]);
              setEditing(l.id);
              setEditName(l.name);
            }}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="btn btn--sm btn--icon"
            title={targets.length ? tr(lang, 'Duplicar capas seleccionadas', 'Duplicate selected layers') : tr(lang, 'Duplicar capa (selecciona una en la tabla)', 'Duplicate layer (select one in the table)')}
            aria-label={tr(lang, 'Duplicar capa', 'Duplicate layer')}
            disabled={!targets.length}
            onClick={() =>
              doc.transact('LAYER DUPLICATE', (tx) => {
                for (const id of targets) {
                  const src = doc.data.layers.get(id)!;
                  createLayer(tx, doc, { ...src, id: undefined as never, name: uniqueLayerName(doc, `${src.name} copia`) });
                }
              })
            }
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="btn btn--sm btn--icon btn--danger-icon"
            title={targets.length ? tr(lang, 'Eliminar capas seleccionadas', 'Delete selected layers') : tr(lang, 'Eliminar capa (selecciona una en la tabla)', 'Delete layer (select one in the table)')}
            aria-label={tr(lang, 'Eliminar capa', 'Delete layer')}
            disabled={!targets.length}
            onClick={() => {
              const problems: string[] = [];
              doc.transact('LAYER DELETE', (tx) => {
                for (const id of targets) {
                  const c = canDeleteLayer(doc, id);
                  if (c.ok) tx.remove('layers', id);
                  else problems.push(`${doc.data.layers.get(id)?.name}: ${lang === 'es' ? c.es : c.en}`);
                }
              });
              setSelected([]);
              if (problems.length) msg('warn', problems.join(' · '), problems.join(' · '));
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          disabled={targets.length !== 1}
          title={targets.length === 1 ? tr(lang, 'Dibujar en la capa seleccionada', 'Draw on the selected layer') : tr(lang, 'Selecciona una sola capa para hacerla actual', 'Select a single layer to make it current')}
          onClick={() => doc.transact('CLAYER', (tx) => tx.setSettings({ currentLayer: targets[0] }))}
        >
          <Check size={13} />
          {tr(lang, 'Actual', 'Current')}
        </button>
        <div className="btn-group">
          <button
            type="button"
            className="btn btn--sm"
            disabled={!targets.length}
            title={tr(lang, 'Aislar capas seleccionadas (apaga el resto)', 'Isolate selected layers (turns others off)')}
            onClick={() => doc.transact('LAYISO', (tx) => isolateLayers(tx, doc, targets, 'off'))}
          >
            <Focus size={13} />
            {tr(lang, 'Aislar', 'Isolate')}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            title={tr(lang, 'Restaurar las capas tras aislar', 'Restore layers after isolating')}
            onClick={() => doc.transact('LAYUNISO', (tx) => unisolateLayers(tx, doc) || msg('info', 'No hay aislamiento de capas activo.', 'No layer isolation active.'))}
          >
            <RotateCcw size={13} />
            {tr(lang, 'Restaurar', 'Restore')}
          </button>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          title={tr(lang, 'Eliminar capas vacías', 'Purge empty layers')}
          onClick={() => {
            const removed = doc.transact('LAYER PURGE', (tx) => purgeEmptyLayers(tx, doc));
            msg('info', `Capas eliminadas: ${removed.join(', ') || 'ninguna'}`, `Purged layers: ${removed.join(', ') || 'none'}`);
          }}
        >
          <Eraser size={13} />
          {tr(lang, 'Purgar vacías', 'Purge empty')}
        </button>
      </div>
      <div className="layers-filter">
        <input className="input" placeholder={tr(lang, 'Buscar capa…', 'Search layer…')} title={tr(lang, 'Admite comodines: * y ?', 'Wildcards allowed: * and ?')} aria-label={tr(lang, 'Buscar capa (admite * y ?)', 'Search layer (supports * and ?)')} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <select className="select" value={filterId} onChange={(e) => setFilterId(e.target.value)} aria-label={tr(lang, 'Filtro de capas', 'Layer filter')}>
          <option value="all">{tr(lang, 'Todas', 'All')}</option>
          <option value="used">{tr(lang, 'En uso', 'Used')}</option>
          <option value="unused">{tr(lang, 'Sin uso', 'Unused')}</option>
          {[...doc.data.layerFilters.values()].map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--sm"
          title={search ? tr(lang, 'Guardar filtro con la búsqueda actual', 'Save filter from current search') : tr(lang, 'Escribe una búsqueda para guardarla como filtro', 'Type a search to save it as a filter')}
          disabled={!search}
          onClick={async () => {
            const name = (await askText(lang, tr(lang, 'Nombre del filtro', 'Filter name'), search, { confirmLabel: tr(lang, 'Guardar', 'Save') }))?.trim();
            if (name) doc.transact('LAYER FILTER', (tx) => tx.add('layerFilters', { id: newId('lfilter'), name, rule: { name: search.includes('*') ? search : `*${search}*` } }));
          }}
        >
          <Save size={13} />
          {tr(lang, 'Filtro', 'Filter')}
        </button>
      </div>
      <LayerStates editor={editor} />
      <div className="layers-table-bar">
        <span className="eyebrow">
          {layers.length} / {doc.data.layers.size} {tr(lang, 'capas', 'layers')}
        </span>
        <button type="button" className="btn btn--sm btn--ghost" aria-pressed={allColumns} onClick={() => setAllColumns((v) => !v)} title={tr(lang, 'Mostrar tipo de línea, grosor, transparencia, uso y descripción', 'Show linetype, lineweight, transparency, usage and description')}>
          {allColumns ? tr(lang, 'Columnas básicas', 'Basic columns') : tr(lang, 'Todas las columnas', 'All columns')}
        </button>
      </div>
      <div className="layers-table" tabIndex={0} role="region" aria-label={tr(lang, 'Tabla de capas', 'Layer table')}>
        <table className="grid" aria-label={tr(lang, 'Capas', 'Layers')}>
          <thead>
            <tr>
              {sortBtn('name', tr(lang, 'Nombre', 'Name'), 'grid__name')}
              <th aria-label={tr(lang, 'Activada', 'On')} title={tr(lang, 'Activada', 'On')}>
                <Eye size={12} />
              </th>
              <th aria-label={tr(lang, 'Inutilizar', 'Freeze')} title={tr(lang, 'Inutilizar', 'Freeze')}>
                <Snowflake size={12} />
              </th>
              <th aria-label={tr(lang, 'Bloquear', 'Lock')} title={tr(lang, 'Bloquear', 'Lock')}>
                <Lock size={12} />
              </th>
              {allColumns && (
                <th aria-label={tr(lang, 'Trazar', 'Plot')} title={tr(lang, 'Trazar', 'Plot')}>
                  <Printer size={12} />
                </th>
              )}
              {vp && <th title={tr(lang, 'Inutilizar en viewport actual', 'Freeze in current viewport')}>VP</th>}
              {sortBtn('color', tr(lang, 'Color', 'Color'))}
              {allColumns && (
                <>
                  <th>{tr(lang, 'Tipo de línea', 'Linetype')}</th>
                  <th>{tr(lang, 'Grosor', 'Lineweight')}</th>
                  <th>{tr(lang, 'Transp.', 'Transp.')}</th>
                  {sortBtn('used', tr(lang, 'Uso', 'Used'))}
                  <th>{tr(lang, 'Descripción', 'Description')}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {layers.map((l) => {
              const isSel = selected.includes(l.id);
              const vpFrozen = vp?.frozenLayers.includes(l.id);
              const isCurrent = l.id === current;
              return (
                <tr
                  key={l.id}
                  className={`${isSel ? 'is-active' : ''}${!l.on || l.frozen ? ' is-off' : ''}`}
                  onClick={(e) => setSelected((s) => (e.shiftKey || e.metaKey || e.ctrlKey ? (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]) : [l.id]))}
                  onDoubleClick={() => doc.transact('CLAYER', (tx) => tx.setSettings({ currentLayer: l.id }))}
                >
                  <td className="grid__name" title={isCurrent ? tr(lang, 'Capa actual: aquí se dibuja', 'Current layer: new objects go here') : tr(lang, 'Doble clic para hacerla actual', 'Double-click to make it current')}>
                    <span className="layer-name">
                      <span className={`layer-current${isCurrent ? ' is-on' : ''}`} aria-hidden="true">
                        {isCurrent ? <Check size={12} /> : null}
                      </span>
                      {isCurrent && <span className="sr-only">{tr(lang, 'Capa actual: ', 'Current layer: ')}</span>}
                      {isSel && <span className="sr-only">{tr(lang, 'Seleccionada: ', 'Selected: ')}</span>}
                      {editing === l.id ? (
                        <input className="input" autoFocus onFocus={(e) => e.target.select()} value={editName} aria-label={tr(lang, 'Nombre de la capa', 'Layer name')} onChange={(e) => setEditName(e.target.value)} onBlur={() => commitRename(l)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(l); if (e.key === 'Escape') setEditing(null); }} />
                      ) : (
                        <span className="layer-name__text" title={l.name !== '0' && l.name !== 'Defpoints' ? tr(lang, 'Doble clic para renombrar', 'Double-click to rename') : undefined} onDoubleClick={(e) => { e.stopPropagation(); if (l.name !== '0' && l.name !== 'Defpoints') { setEditing(l.id); setEditName(l.name); } }}>{l.name}</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="icon-btn icon-btn--cell" aria-pressed={l.on} aria-label={`${l.name}: ${tr(lang, 'visible', 'visible')}`} onClick={(e) => (e.stopPropagation(), update(l.id, { on: !l.on }))} title={l.on ? tr(lang, 'Apagar', 'Turn off') : tr(lang, 'Encender', 'Turn on')}>
                      {l.on ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn icon-btn--cell"
                      aria-pressed={l.frozen}
                      aria-label={`${l.name}: ${tr(lang, 'inutilizada', 'frozen')}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (l.id === current && !l.frozen) return msg('warn', 'No se puede inutilizar la capa actual.', 'Cannot freeze the current layer.');
                        update(l.id, { frozen: !l.frozen });
                      }}
                      title={l.frozen ? tr(lang, 'Reutilizar', 'Thaw') : tr(lang, 'Inutilizar', 'Freeze')}
                    >
                      {l.frozen ? <Snowflake size={14} /> : <Sun size={14} />}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="icon-btn icon-btn--cell" aria-pressed={l.locked} aria-label={`${l.name}: ${tr(lang, 'bloqueada', 'locked')}`} onClick={(e) => (e.stopPropagation(), update(l.id, { locked: !l.locked }))} title={l.locked ? tr(lang, 'Desbloquear', 'Unlock') : tr(lang, 'Bloquear', 'Lock')}>
                      {l.locked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                  </td>
                  {allColumns && (
                    <td>
                      <input type="checkbox" checked={l.plot} onClick={(e) => e.stopPropagation()} onChange={(e) => update(l.id, { plot: e.target.checked })} aria-label={`${l.name}: ${tr(lang, 'trazar', 'plot')}`} />
                    </td>
                  )}
                  {vp && (
                    <td>
                      <input
                        type="checkbox"
                        checked={!!vpFrozen}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => doc.transact('VPLAYER', (tx) => tx.updateEntity<ViewportEntity>(vp.id, (v) => ({ ...v, frozenLayers: e.target.checked ? [...v.frozenLayers, l.id] : v.frozenLayers.filter((x) => x !== l.id) })))}
                        aria-label={`${l.name}: ${tr(lang, 'inutilizar en viewport', 'freeze in viewport')}`}
                      />
                    </td>
                  )}
                  <td className="grid__color" onClick={(e) => e.stopPropagation()}>
                    <ColorPicker lang={lang} allowByLayer={false} value={l.color} onChange={(c) => update(l.id, { color: c })} ariaLabel={`${l.name}: ${tr(lang, 'color', 'color')}`} />
                  </td>
                  {allColumns && (
                    <>
                      <td style={{ minWidth: 110 }} onClick={(e) => e.stopPropagation()}>
                        <LinetypeSelect doc={doc} lang={lang} allowBy={false} value={l.linetype} onChange={(v) => update(l.id, { linetype: v })} ariaLabel={`${l.name}: ${tr(lang, 'tipo de línea', 'linetype')}`} />
                      </td>
                      <td style={{ minWidth: 96 }} onClick={(e) => e.stopPropagation()}>
                        <LineweightSelect lang={lang} allowBy={false} value={l.lineweight} onChange={(v) => update(l.id, { lineweight: v })} ariaLabel={`${l.name}: ${tr(lang, 'grosor', 'lineweight')}`} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input className="input input--mono" style={{ width: 56 }} type="number" min={0} max={90} value={l.transparency} aria-label={`${l.name}: ${tr(lang, 'transparencia', 'transparency')}`} onChange={(e) => update(l.id, { transparency: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} onKeyDown={(e) => e.stopPropagation()} />
                      </td>
                      <td style={{ fontFamily: 'var(--fs-font-data)', color: usage.get(l.id) ? 'var(--ink)' : 'var(--ink-faint)' }}>{usage.get(l.id) ?? 0}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input className="input" style={{ minWidth: 120 }} defaultValue={l.description} aria-label={`${l.name}: ${tr(lang, 'descripción', 'description')}`} onBlur={(e) => e.target.value !== l.description && update(l.id, { description: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!layers.length && <p className="empty">{search || filterId !== 'all' ? tr(lang, 'Ninguna capa coincide con el filtro.', 'No layer matches the filter.') : tr(lang, 'No hay capas.', 'No layers.')}</p>}
      </div>
      <div className="eyebrow">
        {tr(lang, 'actual', 'current')}: <span style={{ color: displayColor(doc.data.layers.get(current)?.color ?? 'aci:7', dark) }}>■</span> {doc.data.layers.get(current)?.name} ({colorLabel(doc.data.layers.get(current)?.color ?? 'aci:7', lang)})
      </div>
    </div>
  );
}

function LayerStates({ editor }: { editor: Editor }) {
  const doc = editor.doc;
  const lang = editor.lang;
  const states = [...doc.data.layerStates.values()].filter((s) => !s.name.startsWith('__'));
  const [sel, setSel] = useState('');
  return (
    <div className="layers-states">
      <label className="eyebrow" htmlFor="layer-state-select">
        {tr(lang, 'Estados de capas', 'Layer states')}
      </label>
      <div className="layers-states__row">
        <select id="layer-state-select" className="select" value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">{states.length ? tr(lang, 'Elegir estado…', 'Choose state…') : tr(lang, 'Sin estados guardados', 'No saved states')}</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="btn-group">
          <button type="button" className="btn btn--sm" disabled={!sel} title={tr(lang, 'Aplicar el estado elegido a las capas', 'Apply the chosen state to the layers')} onClick={() => doc.transact('LAYERSTATE RESTORE', (tx) => restoreLayerState(tx, doc, doc.data.layerStates.get(sel)!))}>
            <RotateCcw size={13} />
            {tr(lang, 'Restituir', 'Restore')}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            title={tr(lang, 'Guardar el estado actual de las capas', 'Save the current layer state')}
            onClick={async () => {
              const name = (await askText(lang, tr(lang, 'Nombre del estado de capas', 'Layer state name'), '', { confirmLabel: tr(lang, 'Guardar', 'Save') }))?.trim();
              if (!name) return;
              const existing = states.find((s) => s.name.toLowerCase() === name.toLowerCase());
              doc.transact('LAYERSTATE SAVE', (tx) => tx.put('layerStates', { ...captureLayerState(doc, name), id: existing?.id ?? newId('lstate') }));
            }}
          >
            <Save size={13} />
            {tr(lang, 'Guardar', 'Save')}
          </button>
        </div>
        <button type="button" className="btn btn--sm btn--icon btn--danger-icon" disabled={!sel} title={tr(lang, 'Eliminar el estado elegido', 'Delete the chosen state')} aria-label={tr(lang, 'Eliminar estado de capas', 'Delete layer state')} onClick={() => (doc.transact('LAYERSTATE DELETE', (tx) => tx.remove('layerStates', sel)), setSel(''))}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
