import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { emptyDynamic, LOOKUP_INPUT_TYPES, PARAM_TYPE_LABEL } from '../../blocks/authoring';
import type { Id, LookupTable } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { Toggle, tr } from '../controls';

/**
 * Editor de tablas de consulta: columnas de entrada (parámetros lineales, de rotación en grados
 * o de visibilidad) y filas con el valor de consulta que verá el usuario en la instancia.
 */
export function LookupTableDialog({ editor, tableId, onClose }: { editor: Editor; tableId: Id; onClose: () => void }) {
  const lang = editor.lang;
  const doc = editor.doc;
  const blockId = editor.blockEdit?.blockId;
  const block = blockId ? doc.data.blocks.get(blockId) : undefined;
  const def = block?.dynamic ?? emptyDynamic();
  const original = def.lookups.find((t) => t.id === tableId);
  const [table, setTable] = useState<LookupTable | null>(() => (original ? structuredClone(original) : null));
  const [error, setError] = useState('');

  if (!block || !table) {
    return (
      <Dialog title={tr(lang, 'Tabla de consulta', 'Lookup table')} onClose={onClose} lang={lang}>
        <div className="empty">{tr(lang, 'La tabla ya no existe o el Editor de bloques está cerrado.', 'The table no longer exists or the Block Editor is closed.')}</div>
      </Dialog>
    );
  }

  const candidates = def.parameters.filter((p) => LOOKUP_INPUT_TYPES.includes(p.type));
  const toggleInput = (pid: Id, on: boolean) =>
    setTable((t) => {
      if (!t) return t;
      if (on) return { ...t, inputs: [...t.inputs, pid], rows: t.rows.map((r) => ({ ...r, inputs: [...r.inputs, ''] })) };
      const col = t.inputs.indexOf(pid);
      return { ...t, inputs: t.inputs.filter((x) => x !== pid), rows: t.rows.map((r) => ({ ...r, inputs: r.inputs.filter((_, i) => i !== col) })) };
    });
  const setCell = (row: number, col: number, value: string) =>
    setTable((t) => {
      if (!t) return t;
      const pid = t.inputs[col];
      const p = def.parameters.find((x) => x.id === pid);
      const n = Number(value.replace(',', '.'));
      const v: number | string = p?.type !== 'visibility' && value.trim() !== '' && Number.isFinite(n) ? n : value;
      return { ...t, rows: t.rows.map((r, i) => (i === row ? { ...r, inputs: r.inputs.map((c, j) => (j === col ? v : c)) } : r)) };
    });

  const save = () => {
    const labels = table.rows.map((r) => r.label.trim());
    if (labels.some((l) => !l)) return setError(tr(lang, 'Cada fila necesita un valor de consulta.', 'Every row needs a lookup value.'));
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return setError(tr(lang, 'Los valores de consulta deben ser únicos.', 'Lookup values must be unique.'));
    for (const [ci, pid] of table.inputs.entries()) {
      const p = def.parameters.find((x) => x.id === pid);
      for (const r of table.rows) {
        const v = r.inputs[ci];
        if (p?.type === 'visibility') {
          if (!p.states.some((s) => s.name === v)) return setError(tr(lang, `«${v}» no es un estado de «${p.name}».`, `"${v}" is not a state of "${p.name}".`));
        } else if (typeof v !== 'number') return setError(tr(lang, `La columna «${p?.name}» solo admite números.`, `Column "${p?.name}" only accepts numbers.`));
      }
    }
    const next = { ...table, rows: table.rows.map((r) => ({ ...r, label: r.label.trim() })) };
    doc.transact('LOOKUP TABLE', (tx) => tx.update('blocks', block.id, { dynamic: { ...def, lookups: def.lookups.map((t) => (t.id === tableId ? next : t)) } }));
    onClose();
  };

  return (
    <Dialog
      wide
      lang={lang}
      title={tr(lang, `Tabla de consulta · ${table.name}`, `Lookup table · ${table.name}`)}
      onClose={onClose}
      footer={
        <>
          {error && (
            <span role="alert" style={{ color: 'var(--fm-danger)', fontSize: 12, flex: 1 }}>
              {error}
            </span>
          )}
          <button className="btn" onClick={onClose}>
            {tr(lang, 'Cancelar', 'Cancel')}
          </button>
          <button className="btn btn--primary" onClick={save}>
            {tr(lang, 'Aceptar', 'OK')}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <label className="field">
          <span>{tr(lang, 'Nombre de la tabla', 'Table name')}</span>
          <input className="input" value={table.name} onChange={(e) => setTable({ ...table, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </label>
        <label className="field">
          <span>{tr(lang, 'Propiedad de consulta', 'Lookup property')}</span>
          <input className="input" value={table.lookupName} onChange={(e) => setTable({ ...table, lookupName: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </label>
      </div>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        {tr(lang, 'Parámetros de entrada', 'Input parameters')}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {candidates.map((p) => (
          <Toggle key={p.id} checked={table.inputs.includes(p.id)} onChange={(on) => toggleInput(p.id, on)} label={`${p.name} (${PARAM_TYPE_LABEL[p.type][lang]}${p.type === 'rotation' ? ', °' : ''})`} />
        ))}
        {!candidates.length && <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{tr(lang, 'Añade parámetros lineales, de rotación o de visibilidad para usarlos como entradas.', 'Add linear, rotation or visibility parameters to use them as inputs.')}</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="grid">
          <thead>
            <tr>
              {table.inputs.map((pid) => (
                <th key={pid}>{def.parameters.find((p) => p.id === pid)?.name ?? '?'}</th>
              ))}
              <th>{table.lookupName || tr(lang, 'Consulta', 'Lookup')}</th>
              <th aria-label={tr(lang, 'Acciones', 'Actions')} />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, ri) => (
              <tr key={ri}>
                {table.inputs.map((pid, ci) => {
                  const p = def.parameters.find((x) => x.id === pid);
                  return (
                    <td key={pid}>
                      {p?.type === 'visibility' ? (
                        <select className="select" value={String(r.inputs[ci] ?? '')} onChange={(e) => setCell(ri, ci, e.target.value)}>
                          <option value="">—</option>
                          {p.states.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input className="input input--mono" value={String(r.inputs[ci] ?? '')} onChange={(e) => setCell(ri, ci, e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                      )}
                    </td>
                  );
                })}
                <td>
                  <input className="input" value={r.label} onChange={(e) => setTable({ ...table, rows: table.rows.map((x, i) => (i === ri ? { ...x, label: e.target.value } : x)) })} onKeyDown={(e) => e.stopPropagation()} />
                </td>
                <td>
                  <button className="icon-btn" onClick={() => setTable({ ...table, rows: table.rows.filter((_, i) => i !== ri) })} aria-label={tr(lang, 'Eliminar fila', 'Delete row')}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn--sm" onClick={() => setTable({ ...table, rows: [...table.rows, { label: `${tr(lang, 'Opción', 'Option')} ${table.rows.length + 1}`, inputs: table.inputs.map(() => '') }] })}>
          <Plus size={12} /> {tr(lang, 'Añadir fila', 'Add row')}
        </button>
        <Toggle checked={table.reverse} onChange={(v) => setTable({ ...table, reverse: v })} label={tr(lang, 'Permitir consulta inversa', 'Allow reverse lookup')} />
      </div>
    </Dialog>
  );
}
