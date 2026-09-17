import { useMemo, useState } from 'react';
import type { Entity, EntityType, InsertEntity } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { insertAttributes } from '../../model/kinds/insert';
import { useEditorEvents } from '../hooks';
import { ColorPicker, LinetypeSelect, LineweightSelect, MIXED, NumberField, TextField, tr } from '../controls';
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

  const apply = (row: PropRow, value: unknown) => {
    if (!row.set) return;
    let rejected = 0;
    doc.transact(`PROPERTIES ${row.key}`, (tx) => {
      for (const e of targets) {
        const cur = doc.entity(e.id);
        if (!cur) continue;
        try {
          const next = row.set!(cur, value, ctx);
          if (next) tx.put('entities', next);
          else rejected++;
        } catch {
          rejected++;
        }
      }
    });
    if (rejected) editor.runner.message('warn', { es: `${rejected} objeto(s) no aceptaron el valor «${String(value)}» (fuera de rango o no aplicable).`, en: `${rejected} object(s) rejected value "${String(value)}" (out of range or not applicable).` });
  };

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

  const renderRow = (row: PropRow) => {
    const vals = targets.map((e) => {
      try {
        return row.get(e, ctx);
      } catch {
        return null;
      }
    });
    const first = vals[0];
    const mixed = vals.some((v) => JSON.stringify(v) !== JSON.stringify(first));
    const label = row.label[lang];
    let control: React.ReactNode;
    switch (row.kind) {
      case 'readonly':
        control = <input className="input input--mono" readOnly value={mixed ? MIXED : typeof first === 'number' ? (Math.round(first * 1e4) / 1e4).toString() : String(first ?? '—')} aria-label={label} />;
        break;
      case 'number':
        control = <NumberField lang={lang} value={typeof first === 'number' ? first : null} mixed={mixed} onCommit={(v) => apply(row, v)} ariaLabel={label} />;
        break;
      case 'angle':
        control = <NumberField lang={lang} value={typeof first === 'number' ? first : null} mixed={mixed} suffix="°" onCommit={(v) => apply(row, v)} ariaLabel={label} />;
        break;
      case 'text':
        control = <TextField value={String(first ?? '')} mixed={mixed} onCommit={(v) => apply(row, v)} ariaLabel={label} />;
        break;
      case 'multiline':
        control = <TextField multiline value={String(first ?? '')} mixed={mixed} onCommit={(v) => apply(row, v)} ariaLabel={label} />;
        break;
      case 'bool':
        control = <input type="checkbox" checked={!mixed && !!first} ref={(el) => {
              if (el) el.indeterminate = mixed;
            }} onChange={(e) => apply(row, e.target.checked)} aria-label={label} />;
        break;
      case 'color':
        control = <ColorPicker lang={lang} value={String(first)} mixed={mixed} onChange={(c) => apply(row, c)} />;
        break;
      case 'layer':
        control = (
          <select className="select" value={mixed ? 'mixed' : String(first)} onChange={(e) => apply(row, e.target.value)} aria-label={label}>
            {mixed && <option value="mixed">{MIXED}</option>}
            {[...doc.data.layers.values()]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        );
        break;
      case 'linetype':
        control = <LinetypeSelect doc={doc} lang={lang} value={String(first)} mixed={mixed} onChange={(v) => apply(row, v)} />;
        break;
      case 'lineweight':
        control = <LineweightSelect lang={lang} value={Number(first)} mixed={mixed} onChange={(v) => apply(row, v)} />;
        break;
      case 'transparency':
        control = (
          <div style={{ display: 'flex', gap: 4 }}>
            <select className="select" style={{ width: 96 }} value={mixed ? 'mixed' : typeof first === 'number' ? 'value' : String(first)} onChange={(e) => apply(row, e.target.value === 'value' ? 0 : e.target.value)}>
              {mixed && <option value="mixed">{MIXED}</option>}
              <option value="ByLayer">{tr(lang, 'PorCapa', 'ByLayer')}</option>
              <option value="ByBlock">{tr(lang, 'PorBloque', 'ByBlock')}</option>
              <option value="value">{tr(lang, 'Valor', 'Value')}</option>
            </select>
            {typeof first === 'number' && !mixed && <NumberField lang={lang} value={first} suffix="%" onCommit={(v) => apply(row, v)} />}
          </div>
        );
        break;
      case 'select': {
        let options = row.options;
        if (!options && (row.key === 'style')) options = [...doc.data.textStyles.values()].map((s) => ({ value: s.id, label: s.name }));
        if (!options && row.key === 'dstyle') options = [...doc.data.dimStyles.values()].map((s) => ({ value: s.id, label: s.name }));
        if (!options && row.key === 'mlstyle') options = [...doc.data.mleaderStyles.values()].map((s) => ({ value: s.id, label: s.name }));
        control = (
          <select className="select" value={mixed ? 'mixed' : String(first)} onChange={(e) => apply(row, e.target.value)} aria-label={label}>
            {mixed && <option value="mixed">{MIXED}</option>}
            {(options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
        break;
      }
    }
    return (
      <div className="field" key={row.key}>
        <label title={label}>{label}</label>
        {control}
      </div>
    );
  };

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
          <div className="section__body">{rs.map(renderRow)}</div>
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
                  <select className="select" value={String(r.value)} onChange={(ev) => r.set(ev.target.value)}>
                    {r.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : r.kind === 'bool' ? (
                  <input type="checkbox" checked={!!r.value} onChange={(ev) => r.set(ev.target.checked)} />
                ) : (
                  <NumberField lang={lang} value={Number(r.value)} readOnly={r.readOnly} suffix={r.kind === 'angle' ? '°' : undefined} onCommit={(v) => r.set(v)} />
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
            <select className="select" value={s.currentLayer} onChange={(e) => set({ currentLayer: e.target.value })}>
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
            <ColorPicker lang={lang} value={s.currentColor} onChange={(c) => set({ currentColor: c })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Tipo de línea', 'Linetype')}</label>
            <LinetypeSelect doc={doc} lang={lang} value={s.currentLinetype} onChange={(v) => set({ currentLinetype: v })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Grosor', 'Lineweight')}</label>
            <LineweightSelect lang={lang} value={s.currentLineweight} onChange={(v) => set({ currentLineweight: v })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Estilo de texto', 'Text style')}</label>
            <select className="select" value={s.currentTextStyle} onChange={(e) => set({ currentTextStyle: e.target.value })}>
              {[...doc.data.textStyles.values()].map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Estilo de cota', 'Dim style')}</label>
            <select className="select" value={s.currentDimStyle} onChange={(e) => set({ currentDimStyle: e.target.value })}>
              {[...doc.data.dimStyles.values()].map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Altura de texto', 'Text height')}</label>
            <NumberField lang={lang} value={s.textHeight} onCommit={(v) => v > 0 && set({ textHeight: v })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Escala global de línea', 'Global linetype scale')}</label>
            <NumberField lang={lang} value={s.ltscale} onCommit={(v) => v > 0 && set({ ltscale: v })} />
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
            <TextField value={s.title} onCommit={(v) => set({ title: v })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Autor', 'Author')}</label>
            <TextField value={s.author} onCommit={(v) => set({ author: v })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Unidades', 'Units')}</label>
            <select className="select" value={s.units} onChange={(e) => set({ units: e.target.value as typeof s.units, insUnits: e.target.value as typeof s.units })}>
              {['unitless', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Precisión lineal', 'Linear precision')}</label>
            <NumberField lang={lang} value={s.linearPrecision} onCommit={(v) => set({ linearPrecision: Math.max(0, Math.min(8, Math.round(v))) })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Objetos', 'Objects')}</label>
            <input className="input input--mono" readOnly value={editor.index.count(editor.inputOwner)} />
          </div>
        </div>
      </details>
      <p className="empty" style={{ textAlign: 'left', padding: 4 }}>
        {tr(lang, 'Selecciona objetos para ver y editar sus propiedades. Con varios tipos, elige uno en el filtro para editar en lote.', 'Select objects to see and edit their properties. With mixed types, pick one in the filter to batch edit.')}
      </p>
    </div>
  );
}
