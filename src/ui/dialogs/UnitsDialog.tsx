import { useState } from 'react';
import { ANGLE_FORMATS, DRAWING_UNITS, LINEAR_FORMATS, parseUnitsOptions, type UnitsSession } from '../../commands/units';
import type { Editor } from '../../editor/editor';
import { formatAngle, formatLength } from '../../model/format';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';
import { useEditorEvents } from '../hooks';
import '../../styles/precisionTools.css';

const linearLabels = { decimal: ['Decimal', 'Decimal'], architectural: ['Arquitectónico', 'Architectural'], engineering: ['Ingeniería', 'Engineering'], fractional: ['Fraccionario', 'Fractional'], scientific: ['Científico', 'Scientific'] };
const angleLabels = { degrees: ['Grados decimales', 'Decimal degrees'], dms: ['Grados, minutos, segundos', 'Degrees, minutes, seconds'], grads: ['Centesimales', 'Grads'], radians: ['Radianes', 'Radians'], surveyor: ['Topográfico', 'Surveyor'] };
export function UnitsDialog({ editor, payload, onClose }: { editor: Editor; payload: unknown; onClose: () => void }) {
  useEditorEvents(editor, ['doc']);
  const [session] = useState(() => payload as UnitsSession);
  const [draft, setDraft] = useState(() => ({ units: editor.doc.settings.units, linearFormat: editor.doc.settings.linearFormat, linearPrecision: String(editor.doc.settings.linearPrecision), angleFormat: editor.doc.settings.angleFormat, anglePrecision: String(editor.doc.settings.anglePrecision) }));
  const lang = editor.lang, index = lang === 'es' ? 0 : 1;
  const current = !!session && session.doc === editor.doc && session.version === editor.doc.version;
  let value: ReturnType<typeof parseUnitsOptions> | null = null;
  try { if (draft.linearPrecision.trim() && draft.anglePrecision.trim()) value = parseUnitsOptions(JSON.stringify({ version: 1, documentId: editor.doc.id, documentVersion: session?.version, ...draft, linearPrecision: Number(draft.linearPrecision), anglePrecision: Number(draft.anglePrecision) })); } catch { /* invalid draft remains editable */ }
  const apply = () => { if (!current || !value) return; onClose(); void editor.command('UNITS', [JSON.stringify(value)]); };
  return <Dialog lang={lang} title={tr(lang, 'Unidades del dibujo', 'Drawing units')} onClose={onClose} footer={<>
    <button className="btn" type="button" onClick={onClose}>{tr(lang, 'Cancelar', 'Cancel')}</button>
    <button className="btn btn--primary" type="button" disabled={!current || !value} onClick={apply}>{tr(lang, 'Aceptar', 'Apply')}</button>
  </>}>
    <p className="panel__hint">{tr(lang, 'Define las unidades de inserción y cómo se muestran las medidas. La geometría existente conserva su tamaño.', 'Sets insertion units and how measurements are displayed. Existing geometry keeps its size.')}</p>
    <div className="units-fields">
      <label>{tr(lang, 'Unidades de inserción', 'Insertion units')}<select aria-label={tr(lang, 'Unidades de inserción', 'Insertion units')} className="select" value={draft.units} onChange={e => setDraft({ ...draft, units: e.target.value as typeof draft.units })}>{DRAWING_UNITS.map(unit => <option key={unit} value={unit}>{unit === 'unitless' ? tr(lang, 'Sin unidades', 'Unitless') : unit}</option>)}</select></label>
      <label>{tr(lang, 'Formato lineal', 'Linear format')}<select aria-label={tr(lang, 'Formato lineal', 'Linear format')} className="select" value={draft.linearFormat} onChange={e => setDraft({ ...draft, linearFormat: e.target.value as typeof draft.linearFormat })}>{LINEAR_FORMATS.map(format => <option key={format} value={format}>{linearLabels[format][index]}</option>)}</select></label>
      <label>{tr(lang, 'Precisión lineal (0–8)', 'Linear precision (0–8)')}<input className="input input--mono" type="number" min="0" max="8" step="1" value={draft.linearPrecision} onChange={e => setDraft({ ...draft, linearPrecision: e.target.value })} /></label>
      <label>{tr(lang, 'Formato angular', 'Angle format')}<select aria-label={tr(lang, 'Formato angular', 'Angle format')} className="select" value={draft.angleFormat} onChange={e => setDraft({ ...draft, angleFormat: e.target.value as typeof draft.angleFormat })}>{ANGLE_FORMATS.map(format => <option key={format} value={format}>{angleLabels[format][index]}</option>)}</select></label>
      <label>{tr(lang, 'Precisión angular (0–8)', 'Angular precision (0–8)')}<input className="input input--mono" type="number" min="0" max="8" step="1" value={draft.anglePrecision} onChange={e => setDraft({ ...draft, anglePrecision: e.target.value })} /></label>
    </div>
    <p className="units-preview" aria-live="polite">{tr(lang, 'Ejemplo', 'Example')}: {value ? `${formatLength(123.456, value.linearFormat, value.linearPrecision)} · ${formatAngle(Math.PI / 3, value.angleFormat, value.anglePrecision)}` : '—'}</p>
    {['architectural', 'engineering'].includes(draft.linearFormat) && <p className="panel__hint">{tr(lang, 'Los formatos arquitectónico e ingeniería interpretan la longitud en pulgadas.', 'Architectural and engineering formats interpret lengths in inches.')}</p>}
    {!current ? <p role="alert">{tr(lang, 'El dibujo cambió. Cierra y vuelve a abrir Unidades.', 'The drawing changed. Close and reopen Drawing units.')}</p> : !value && <p role="alert">{tr(lang, 'La precisión debe ser un entero entre 0 y 8.', 'Precision must be an integer from 0 to 8.')}</p>}
  </Dialog>;
}
