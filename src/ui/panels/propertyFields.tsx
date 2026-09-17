import type { Entity } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { ColorPicker, LinetypeSelect, LineweightSelect, MIXED, NumberField, TextField, tr } from '../controls';
import type { PropRow } from './propertyDefs';

/** Aplica el valor de una fila de propiedades a todos los objetos destino en una transacción. */
export function applyPropertyRow(editor: Editor, targets: Entity[], row: PropRow, value: unknown) {
  const doc = editor.doc;
  const ctx = editor.ctx;
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
}

/** Campo editable de una fila de propiedades (valores mixtos incluidos), usado por el inspector y las propiedades rápidas. */
export function PropertyField({ editor, row, targets }: { editor: Editor; row: PropRow; targets: Entity[] }) {
  const lang = editor.lang;
  const doc = editor.doc;
  const ctx = editor.ctx;
  const apply = (r: PropRow, value: unknown) => applyPropertyRow(editor, targets, r, value);
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
}
