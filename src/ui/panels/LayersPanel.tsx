import { Copy, Eye, EyeOff, Lock, Plus, Printer, Snowflake, Sun, Trash2, Unlock } from 'lucide-react';
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

  const sortBtn = (key: SortKey, label: string) => (
    <th>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  return (
    <div className="panel panel--layers" style={{ gap: 8 }}>
      <div className="panel__head layers-toolbar">
        <button
          className="icon-btn"
          title={tr(lang, 'Nueva capa', 'New layer')}
          onClick={() => {
            const l = doc.transact('LAYER NEW', (tx) => createLayer(tx, doc, { name: uniqueLayerName(doc, tr(lang, 'Capa', 'Layer')) }));
            setSelected([l.id]);
            setEditing(l.id);
            setEditName(l.name);
          }}
        >
          <Plus size={16} />
        </button>
        <button
          className="icon-btn"
          title={tr(lang, 'Duplicar capa', 'Duplicate layer')}
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
          <Copy size={15} />
        </button>
        <button
          className="icon-btn"
          title={tr(lang, 'Eliminar capa', 'Delete layer')}
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
          <Trash2 size={15} />
        </button>
        <button className="btn btn--sm" disabled={targets.length !== 1} onClick={() => doc.transact('CLAYER', (tx) => tx.setSettings({ currentLayer: targets[0] }))}>
          {tr(lang, 'Actual', 'Current')}
        </button>
        <button
          className="btn btn--sm"
          disabled={!targets.length}
          title={tr(lang, 'Aislar capas seleccionadas (apaga el resto)', 'Isolate selected layers (turns others off)')}
          onClick={() => doc.transact('LAYISO', (tx) => isolateLayers(tx, doc, targets, 'off'))}
        >
          {tr(lang, 'Aislar', 'Isolate')}
        </button>
        <button className="btn btn--sm" onClick={() => doc.transact('LAYUNISO', (tx) => unisolateLayers(tx, doc) || msg('info', 'No hay aislamiento de capas activo.', 'No layer isolation active.'))}>
          {tr(lang, 'Restaurar', 'Restore')}
        </button>
        <button
          className="btn btn--sm"
          title={tr(lang, 'Eliminar capas vacías', 'Purge empty layers')}
          onClick={() => {
            const removed = doc.transact('LAYER PURGE', (tx) => purgeEmptyLayers(tx, doc));
            msg('info', `Capas eliminadas: ${removed.join(', ') || 'ninguna'}`, `Purged layers: ${removed.join(', ') || 'none'}`);
          }}
        >
          {tr(lang, 'Purgar vacías', 'Purge empty')}
        </button>
      </div>
      <div className="layers-filter">
        <input className="input" placeholder={tr(lang, 'Buscar capa (admite * ?)', 'Search layer (supports * ?)')} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <select className="select" style={{ width: 130 }} value={filterId} onChange={(e) => setFilterId(e.target.value)} aria-label={tr(lang, 'Filtro de capas', 'Layer filter')}>
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
          className="btn btn--sm"
          title={tr(lang, 'Guardar filtro con la búsqueda actual', 'Save filter from current search')}
          disabled={!search}
          onClick={async () => {
            const name = (await askText(lang, tr(lang, 'Nombre del filtro', 'Filter name'), search, { confirmLabel: tr(lang, 'Guardar', 'Save') }))?.trim();
            if (name) doc.transact('LAYER FILTER', (tx) => tx.add('layerFilters', { id: newId('lfilter'), name, rule: { name: search.includes('*') ? search : `*${search}*` } }));
          }}
        >
          +{tr(lang, 'Filtro', 'Filter')}
        </button>
      </div>
      <LayerStates editor={editor} />
      <div className="layers-table">
        <table className="grid" aria-label={tr(lang, 'Capas', 'Layers')}>
          <thead>
            <tr>
              <th />
              {sortBtn('name', tr(lang, 'Nombre', 'Name'))}
              <th title={tr(lang, 'Activada', 'On')}>
                <Eye size={12} />
              </th>
              <th title={tr(lang, 'Inutilizar', 'Freeze')}>
                <Snowflake size={12} />
              </th>
              <th title={tr(lang, 'Bloquear', 'Lock')}>
                <Lock size={12} />
              </th>
              <th title={tr(lang, 'Trazar', 'Plot')}>
                <Printer size={12} />
              </th>
              {vp && <th title={tr(lang, 'Inutilizar en viewport actual', 'Freeze in current viewport')}>VP</th>}
              {sortBtn('color', tr(lang, 'Color', 'Color'))}
              <th>{tr(lang, 'Tipo de línea', 'Linetype')}</th>
              <th>{tr(lang, 'Grosor', 'Lineweight')}</th>
              <th>{tr(lang, 'Transp.', 'Transp.')}</th>
              {sortBtn('used', tr(lang, 'Uso', 'Used'))}
              <th>{tr(lang, 'Descripción', 'Description')}</th>
            </tr>
          </thead>
          <tbody>
            {layers.map((l) => {
              const isSel = selected.includes(l.id);
              const vpFrozen = vp?.frozenLayers.includes(l.id);
              return (
                <tr
                  key={l.id}
                  className={isSel ? 'is-active' : ''}
                  onClick={(e) => setSelected((s) => (e.shiftKey || e.metaKey || e.ctrlKey ? (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]) : [l.id]))}
                  onDoubleClick={() => doc.transact('CLAYER', (tx) => tx.setSettings({ currentLayer: l.id }))}
                >
                  <td title={l.id === current ? tr(lang, 'Capa actual', 'Current layer') : ''} style={{ color: 'var(--fm-accent)', fontWeight: 700 }}>
                    {l.id === current ? '✓' : ''}
                  </td>
                  <td>
                    {editing === l.id ? (
                      <input className="input" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={() => commitRename(l)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(l); if (e.key === 'Escape') setEditing(null); }} />
                    ) : (
                      <span onDoubleClick={(e) => { e.stopPropagation(); if (l.name !== '0' && l.name !== 'Defpoints') { setEditing(l.id); setEditName(l.name); } }}>{l.name}</span>
                    )}
                  </td>
                  <td>
                    <button className="icon-btn" style={{ width: 24, height: 24 }} aria-pressed={l.on} onClick={(e) => (e.stopPropagation(), update(l.id, { on: !l.on }))} title={l.on ? tr(lang, 'Apagar', 'Turn off') : tr(lang, 'Encender', 'Turn on')}>
                      {l.on ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      style={{ width: 24, height: 24 }}
                      aria-pressed={l.frozen}
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
                    <button className="icon-btn" style={{ width: 24, height: 24 }} aria-pressed={l.locked} onClick={(e) => (e.stopPropagation(), update(l.id, { locked: !l.locked }))} title={l.locked ? tr(lang, 'Desbloquear', 'Unlock') : tr(lang, 'Bloquear', 'Lock')}>
                      {l.locked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                  </td>
                  <td>
                    <input type="checkbox" checked={l.plot} onClick={(e) => e.stopPropagation()} onChange={(e) => update(l.id, { plot: e.target.checked })} aria-label={tr(lang, 'Trazar', 'Plot')} />
                  </td>
                  {vp && (
                    <td>
                      <input
                        type="checkbox"
                        checked={!!vpFrozen}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => doc.transact('VPLAYER', (tx) => tx.updateEntity<ViewportEntity>(vp.id, (v) => ({ ...v, frozenLayers: e.target.checked ? [...v.frozenLayers, l.id] : v.frozenLayers.filter((x) => x !== l.id) })))}
                        aria-label={tr(lang, 'Inutilizar en viewport', 'Freeze in viewport')}
                      />
                    </td>
                  )}
                  <td style={{ minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
                    <ColorPicker lang={lang} allowByLayer={false} value={l.color} onChange={(c) => update(l.id, { color: c })} />
                  </td>
                  <td style={{ minWidth: 110 }} onClick={(e) => e.stopPropagation()}>
                    <LinetypeSelect doc={doc} lang={lang} allowBy={false} value={l.linetype} onChange={(v) => update(l.id, { linetype: v })} />
                  </td>
                  <td style={{ minWidth: 96 }} onClick={(e) => e.stopPropagation()}>
                    <LineweightSelect lang={lang} allowBy={false} value={l.lineweight} onChange={(v) => update(l.id, { lineweight: v })} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input className="input input--mono" style={{ width: 52 }} type="number" min={0} max={90} value={l.transparency} onChange={(e) => update(l.id, { transparency: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} onKeyDown={(e) => e.stopPropagation()} />
                  </td>
                  <td style={{ fontFamily: 'var(--fs-font-data)', color: usage.get(l.id) ? 'var(--ink)' : 'var(--ink-faint)' }}>{usage.get(l.id) ?? 0}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input className="input" style={{ minWidth: 120 }} defaultValue={l.description} onBlur={(e) => e.target.value !== l.description && update(l.id, { description: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="eyebrow">
        {layers.length} / {doc.data.layers.size} {tr(lang, 'capas', 'layers')} · {tr(lang, 'actual', 'current')}: <span style={{ color: displayColor(doc.data.layers.get(current)?.color ?? 'aci:7', dark) }}>■</span> {doc.data.layers.get(current)?.name} ({colorLabel(doc.data.layers.get(current)?.color ?? 'aci:7', lang)})
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span className="eyebrow">{tr(lang, 'Estados', 'States')}</span>
      <select className="select" value={sel} onChange={(e) => setSel(e.target.value)} aria-label={tr(lang, 'Estados de capa', 'Layer states')}>
        <option value="">{tr(lang, '— estado de capas —', '— layer state —')}</option>
        {states.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button className="btn btn--sm" disabled={!sel} onClick={() => doc.transact('LAYERSTATE RESTORE', (tx) => restoreLayerState(tx, doc, doc.data.layerStates.get(sel)!))}>
        {tr(lang, 'Restituir', 'Restore')}
      </button>
      <button
        className="btn btn--sm"
        onClick={async () => {
          const name = (await askText(lang, tr(lang, 'Nombre del estado de capas', 'Layer state name'), '', { confirmLabel: tr(lang, 'Guardar', 'Save') }))?.trim();
          if (!name) return;
          const existing = states.find((s) => s.name.toLowerCase() === name.toLowerCase());
          doc.transact('LAYERSTATE SAVE', (tx) => tx.put('layerStates', { ...captureLayerState(doc, name), id: existing?.id ?? newId('lstate') }));
        }}
      >
        {tr(lang, 'Guardar', 'Save')}
      </button>
      <button className="btn btn--sm btn--danger" disabled={!sel} onClick={() => (doc.transact('LAYERSTATE DELETE', (tx) => tx.remove('layerStates', sel)), setSel(''))}>
        ×
      </button>
    </div>
  );
}
