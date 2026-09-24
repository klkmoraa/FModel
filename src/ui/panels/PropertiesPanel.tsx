import { useMemo, useState } from 'react';
import type { Entity, EntityType, InsertEntity } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { insertAttributes } from '../../model/kinds/insert';
import { useEditorEvents } from '../hooks';
import { ColorPicker, LinetypeSelect, LineweightSelect, NumberField, TextField, tr } from '../controls';
import { PropertyField } from './propertyFields';
import type { PropRow } from './propertyDefs';
import { GENERAL_ROWS, rowsForType } from './propertyDefs';
import { dynamicPropertyRows } from '../../blocks/dynamicProperties';

import { typeLabel } from '../../model/typeLabels';

export { typeLabel };

const GROUP_LABELS: Record<PropRow['group'], [string, string]> = {
  general: ['General', 'General'],
  geometry: ['Geometría', 'Geometry'],
  text: ['Texto', 'Text'],
  misc: ['Varios', 'Misc'],
  dimension: ['Cota', 'Dimension'],
  attributes: ['Atributos', 'Attributes'],
  custom: ['Personalizadas', 'Custom'],
  view: ['Vista', 'View'],
};

export function PropertiesPanel({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['selection', 'doc', 'prefs']);
  const lang = editor.lang;
  const doc = editor.doc;
  const ctx = editor.ctx;
  const [typeFilter, setTypeFilter] = useState<'all' | EntityType>('all');
  const selected = editor.selection.list.map((id) => doc.entity(id)).filter(Boolean) as Entity[];
  const byType = useMemo(() => {
    const m = new Map<EntityType, number>();
    for (const e of selected) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.selection.version, doc.version]);
  const filter = typeFilter !== 'all' && byType.has(typeFilter) ? typeFilter : byType.size === 1 ? [...byType.keys()][0] : 'all';
  const targets = filter === 'all' ? selected : selected.filter((e) => e.type === filter);

  if (!selected.length) return <CurrentProperties editor={editor} />;

  const rows: PropRow[] = [...GENERAL_ROWS, ...(filter !== 'all' ? rowsForType(filter) : [])];
  const groups = new Map<PropRow['group'], PropRow[]>();
  for (const r of rows) {
    const vals = targets.map((e) => {
      try {
        return r.get(e, ctx);
      } catch {
        return null;
      }
    });
    if (vals.every((v) => v === null || v === undefined)) continue;
    const g = groups.get(r.group) ?? [];
    g.push(r);
    groups.set(r.group, g);
  }

  const single = targets.length === 1 ? targets[0] : null;

  return (
    <div className="panel">
      <div className="panel__head">
        <select className="select" value={filter} onChange={(e) => setTypeFilter(e.target.value as EntityType | 'all')} aria-label={tr(lang, 'Filtrar por tipo', 'Filter by type')}>
          <option value="all">
            {tr(lang, 'Todo', 'All')} ({selected.length})
          </option>
          {[...byType.entries()].map(([t, n]) => (
            <option key={t} value={t}>
              {typeLabel(t, lang)} ({n})
            </option>
          ))}
        </select>
        <button className="btn btn--sm" title={tr(lang, 'Selección rápida', 'Quick select')} onClick={() => editor.command('QSELECT')}>
          QSELECT
        </button>
      </div>
      {[...groups.entries()].map(([g, rs]) => (
        <details className="section" open key={g}>
          <summary>
            <span className="eyebrow">{GROUP_LABELS[g][lang === 'es' ? 0 : 1]}</span>
          </summary>
          <div className="section__body">{rs.map((row) => <PropertyField key={row.key} editor={editor} row={row} targets={targets} />)}</div>
        </details>
      ))}
      {single?.type === 'insert' && <InsertExtras editor={editor} e={single as InsertEntity} />}
      {single && (
        <div className="eyebrow" style={{ textAlign: 'right' }}>
          ID {single.id} · {tr(lang, 'orden', 'order')} {single.order}
        </div>
      )}
      {filter === 'all' && byType.size > 1 && <div className="empty">{tr(lang, 'Elige un tipo arriba para editar su geometría en lote.', 'Pick a type above to batch-edit its geometry.')}</div>}
    </div>
  );
}

function InsertExtras({ editor, e }: { editor: Editor; e: InsertEntity }) {
  const lang = editor.lang;
  const attrs = insertAttributes(e, editor.ctx);
  const dynRows = dynamicPropertyRows(editor, e);
  return (
    <>
      {dynRows.length > 0 && (
        <details className="section" open>
          <summary>
            <span className="eyebrow">{tr(lang, 'Personalizadas (dinámico)', 'Custom (dynamic)')}</span>
          </summary>
          <div className="section__body">
            {dynRows.map((r) => (
              <div className="field" key={r.key}>
                <label title={r.label}>{r.label}</label>
                {r.options ? (
                  <select className="select" value={String(r.value)} onChange={(ev) => r.set(ev.target.value)} aria-label={r.label}>
                    {r.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : r.kind === 'bool' ? (
                  <input type="checkbox" checked={!!r.value} onChange={(ev) => r.set(ev.target.checked)} aria-label={r.label} />
                ) : (
                  <NumberField lang={lang} value={Number(r.value)} readOnly={r.readOnly} suffix={r.kind === 'angle' ? '°' : undefined} onCommit={(v) => r.set(v)} ariaLabel={r.label} />
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {attrs.length > 0 && (
        <details className="section" open>
          <summary>
            <span className="eyebrow">{tr(lang, 'Atributos', 'Attributes')}</span>
          </summary>
          <div className="section__body">
            {attrs.map((a) => (
              <div className="field" key={a.tag}>
                <label title={a.def.prompt}>{a.tag}</label>
                <TextField
                  value={a.text}
                  readOnly={a.def.constant}
                  ariaLabel={a.tag}
                  onCommit={(v) =>
                    editor.doc.transact('ATTEDIT', (tx) =>
                      tx.updateEntity<InsertEntity>(e.id, (cur) => {
                        const has = cur.attributes.some((x) => x.tag.toUpperCase() === a.tag.toUpperCase());
                        return { ...cur, attributes: has ? cur.attributes.map((x) => (x.tag.toUpperCase() === a.tag.toUpperCase() ? { ...x, value: v } : x)) : [...cur.attributes, { tag: a.tag, value: v }] };
                      }),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function CurrentProperties({ editor }: { editor: Editor }) {
  const lang = editor.lang;
  const doc = editor.doc;
  const s = doc.settings;
  const set = (patch: Partial<typeof s>) => doc.transact('SETVAR', (tx) => tx.setSettings(patch));
  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">{tr(lang, 'Sin selección · propiedades actuales', 'No selection · current properties')}</span>
      </div>
      <details className="section" open>
        <summary>
          <span className="eyebrow">{tr(lang, 'Nuevos objetos', 'New objects')}</span>
        </summary>
        <div className="section__body">
          <div className="field">
            <label>{tr(lang, 'Capa actual', 'Current layer')}</label>
            <select className="select" value={s.currentLayer} onChange={(e) => set({ currentLayer: e.target.value })} aria-label={tr(lang, 'Capa actual', 'Current layer')}>
              {[...doc.data.layers.values()]
                .filter((l) => !l.frozen)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Color', 'Color')}</label>
            <ColorPicker lang={lang} value={s.currentColor} onChange={(c) => set({ currentColor: c })} ariaLabel={tr(lang, 'Color', 'Color')} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Tipo de línea', 'Linetype')}</label>
            <LinetypeSelect doc={doc} lang={lang} value={s.currentLinetype} onChange={(v) => set({ currentLinetype: v })} ariaLabel={tr(lang, 'Tipo de línea', 'Linetype')} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Grosor', 'Lineweight')}</label>
            <LineweightSelect lang={lang} value={s.currentLineweight} onChange={(v) => set({ currentLineweight: v })} ariaLabel={tr(lang, 'Grosor', 'Lineweight')} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Estilo de texto', 'Text style')}</label>
            <select className="select" value={s.currentTextStyle} onChange={(e) => set({ currentTextStyle: e.target.value })} aria-label={tr(lang, 'Estilo de texto', 'Text style')}>
              {[...doc.data.textStyles.values()].map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Estilo de cota', 'Dim style')}</label>
            <select className="select" value={s.currentDimStyle} onChange={(e) => set({ currentDimStyle: e.target.value })} aria-label={tr(lang, 'Estilo de cota', 'Dim style')}>
              {[...doc.data.dimStyles.values()].map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Altura de texto', 'Text height')}</label>
            <NumberField lang={lang} value={s.textHeight} onCommit={(v) => v > 0 && set({ textHeight: v })} ariaLabel={tr(lang, 'Altura de texto', 'Text height')} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Escala global de línea', 'Global linetype scale')}</label>
            <NumberField lang={lang} value={s.ltscale} onCommit={(v) => v > 0 && set({ ltscale: v })} ariaLabel={tr(lang, 'Escala global de línea', 'Global linetype scale')} />
          </div>
        </div>
      </details>
      <details className="section" open>
        <summary>
          <span className="eyebrow">{tr(lang, 'Dibujo', 'Drawing')}</span>
        </summary>
        <div className="section__body">
          <div className="field">
            <label>{tr(lang, 'Título', 'Title')}</label>
            <TextField value={s.title} onCommit={(v) => set({ title: v })} ariaLabel={tr(lang, 'Título', 'Title')} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Autor', 'Author')}</label>
            <TextField value={s.author} onCommit={(v) => set({ author: v })} ariaLabel={tr(lang, 'Autor', 'Author')} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Unidades', 'Units')}</label>
            <select className="select" value={s.units} onChange={(e) => set({ units: e.target.value as typeof s.units, insUnits: e.target.value as typeof s.units })} aria-label={tr(lang, 'Unidades', 'Units')}>
              {['unitless', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Precisión lineal', 'Linear precision')}</label>
            <NumberField lang={lang} value={s.linearPrecision} onCommit={(v) => set({ linearPrecision: Math.max(0, Math.min(8, Math.round(v))) })} ariaLabel={tr(lang, 'Precisión lineal', 'Linear precision')} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Objetos', 'Objects')}</label>
            <input className="input input--mono" readOnly value={editor.index.count(editor.inputOwner)} aria-label={tr(lang, 'Objetos', 'Objects')} />
          </div>
        </div>
      </details>
      <p className="empty" style={{ textAlign: 'left', padding: 4 }}>
        {tr(lang, 'Selecciona objetos para ver y editar sus propiedades. Con varios tipos, elige uno en el filtro para editar en lote.', 'Select objects to see and edit their properties. With mixed types, pick one in the filter to batch edit.')}
      </p>
    </div>
  );
}
