import { useId, useRef, useState } from 'react';
import { COMPONENT_CATALOG, ComponentError, visibleComponentFields } from '../../app/componentCatalog';
import type { Editor } from '../../editor/editor';
import { buildComponent } from '../../geometry/architecture/components';
import { transformComponent } from '../../geometry/architecture/primitives';
import type { ComponentKind, ComponentPrimitive } from '../../geometry/architecture/types';
import { readComponentAssembly } from '../../model/componentAssembly';
import { tr } from '../controls';
import { useEditorEvents } from '../hooks';
import { ComponentMiniature } from './ComponentMiniature';
import { assertComponentContext, newComponentForm, refreshComponentForm, startComponentPlacement, validateComponentForm, type ComponentFormState } from './architectureForm';

// UI-only lifetime follows the editor. Closing a phone sheet does not discard precision input.
const forms = new WeakMap<Editor, ComponentFormState>();
export function ArchitecturePanel({ editor, onStart }: { editor: Editor; onStart?: () => void }) {
  useEditorEvents(editor, ['doc', 'prefs', 'selection']);
  const lang = editor.lang, units = editor.doc.settings.units;
  const [saved, setSaved] = useState(() => forms.get(editor) ?? newComponentForm('column', units, editor.doc.id));
  const state = refreshComponentForm(saved, saved.kind, units, editor.doc.id);
  const update = (next: ComponentFormState) => { forms.set(editor, next); setSaved(next); };
  const [query, setQuery] = useState(''), [category, setCategory] = useState('');
  const [error, setError] = useState<ComponentError | null>(null);
  if (state !== saved) { update(state); setError(null); }
  const ref = useRef<HTMLDivElement>(null), id = useId();
  const categories = [...new Map(COMPONENT_CATALOG.map(c => [c.category.en, c.category])).values()];
  const matches = COMPONENT_CATALOG.filter(c => (!category || c.category.en === category) && `${c.label.es} ${c.label.en} ${c.command}`.toLowerCase().includes(query.toLowerCase().trim()));
  const definition = COMPONENT_CATALOG.find(c => c.kind === state.kind)!;
  const available = matches.some(c => c.kind === state.kind);
  const change = (key: string, value: string) => { setError(null); update({ ...state, values: { ...state.values, [key]: value } }); };
  let primitives: ComponentPrimitive[] = [];
  try { const result = validateComponentForm(state.kind, units, state.values, state.rotationText); primitives = transformComponent(buildComponent(state.kind, result.parameters), { x: 0, y: 0 }, result.rotation); } catch { /* invalid fields have no misleading preview */ }
  let summary = '';
  if (editor.selection.size) {
    try { const assembly = readComponentAssembly(editor.doc, editor.selection.list[0]); summary = `${COMPONENT_CATALOG.find(c => c.kind === assembly.kind)!.label[lang]} · ${assembly.members.length} ${tr(lang, 'objetos', 'objects')}`; } catch { /* selected ordinary or damaged geometry is never parsed in UI */ }
  }
  const start = (edit: boolean) => {
    if (!edit && !available) return;
    try {
      assertComponentContext(editor, state);
      if (edit) { validateComponentForm(state.kind, units, state.values, state.rotationText); void editor.command('COMPONENTEDIT'); }
      else startComponentPlacement(editor, state);
      setError(null);
      const canvas = ref.current?.ownerDocument.querySelector<HTMLElement>('.canvas-host');
      onStart?.();
      requestAnimationFrame(() => canvas?.focus());
    } catch (failure) { setError(failure instanceof ComponentError ? failure : new ComponentError({ es: 'Revisa los valores de la pieza.', en: 'Review the component values.' })); }
  };
  const message = error?.l10n[lang];
  return <div ref={ref} className="panel panel--architecture" onKeyDown={event => { if (event.key !== 'Escape' && (event.target as HTMLElement).matches('input,select')) event.stopPropagation(); }}>
    <label className="architecture-field"><span>{tr(lang, 'Buscar piezas', 'Search components')}</span><input className="input" aria-label={tr(lang, 'Buscar piezas', 'Search components')} value={query} onChange={e => setQuery(e.target.value)} /></label>
    <label className="architecture-field"><span>{tr(lang, 'Categoría', 'Category')}</span><select className="input" aria-label={tr(lang, 'Categoría', 'Category')} value={category} onChange={e => setCategory(e.target.value)}><option value="">{tr(lang, 'Todas', 'All')}</option>{categories.map(c => <option key={c.en} value={c.en}>{c[lang]}</option>)}</select></label>
    <label className="architecture-field"><span>{tr(lang, 'Pieza', 'Component')}</span><select className="input" aria-label={tr(lang, 'Pieza', 'Component')} value={available ? state.kind : ''} onChange={e => { setError(null); update(newComponentForm(e.target.value as ComponentKind, units, editor.doc.id)); }}>
      {!available && <option value="" disabled>{tr(lang, 'Selecciona una pieza', 'Select a component')}</option>}{matches.map(c => <option key={c.kind} value={c.kind}>{c.label[lang]}</option>)}
    </select></label>
    {!matches.length && <p className="panel__hint">{tr(lang, 'No hay piezas que coincidan.', 'No matching components.')}</p>}
    {available && <>
      <div className="architecture-preview"><ComponentMiniature primitives={primitives} label={tr(lang, 'Vista previa de la pieza', 'Component preview')} /><code>{definition.command}</code></div>
      <div className="architecture-fields">{visibleComponentFields(state.kind, state.values).map(field => {
        const suffix = field.unit === 'angle' ? '°' : field.unit === 'length' ? units : field.unit === 'count' ? tr(lang, 'cantidad', 'count') : '';
        const label = `${field.label[lang]}${suffix ? ` · ${suffix}` : ''}`, invalid = error?.fieldKeys.includes(field.key);
        const props = { className: 'input input--mono', 'aria-label': label, 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? `${id}-error` : undefined, value: state.values[field.key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => change(field.key, e.target.value) };
        return <label className="architecture-field" key={field.key}><span>{label}</span>{field.type === 'enum' || field.type === 'boolean' ? <select {...props}>{field.type === 'enum' ? field.choices!.map(c => <option key={c.value} value={c.value}>{c.label[lang]}</option>) : <><option value="false">{tr(lang, 'No', 'No')}</option><option value="true">{tr(lang, 'Sí', 'Yes')}</option></>}</select> : <input {...props} inputMode="decimal" />}</label>;
      })}
      <label className="architecture-field"><span>{tr(lang, 'Giro', 'Rotation')} · °</span><input className="input input--mono" aria-label={`${tr(lang, 'Giro', 'Rotation')} · °`} aria-invalid={error?.fieldKeys.includes('rotation') || undefined} aria-describedby={error?.fieldKeys.includes('rotation') ? `${id}-error` : undefined} inputMode="decimal" value={state.rotationText} onChange={e => { setError(null); update({ ...state, rotationText: e.target.value }); }} /></label></div>
    </>}
    {message && <p className="architecture-error" id={`${id}-error`} role="alert">{message}</p>}
    {summary && <p className="panel__hint" role="status">{tr(lang, 'Pieza seleccionada', 'Selected component')}: {summary}</p>}
    <div className="panel-actions"><button type="button" className="btn btn--primary" disabled={!available} onClick={() => start(false)}>{tr(lang, 'Colocar', 'Place')}</button><button type="button" className="btn" onClick={() => start(true)}>{tr(lang, 'Editar pieza', 'Edit component')}</button></div>
    <div className="architecture-opening-actions" role="group" aria-label={tr(lang, 'Huecos asociados', 'Associated openings')}>
      <p className="panel__hint">{tr(lang, 'Selecciona una jamba o símbolo para editar el hueco; un fragmento de muro sólo permite crear huecos o cambiar espesor. Intro confirma y Esc descarta.', 'Select a jamb or symbol to edit its opening; a wall fragment only supports creation or thickness. Enter confirms and Esc discards.')}</p>
      <div className="panel-actions">{([
        ['WALLDOOR', 'Puerta', 'Door'], ['WALLWINDOW', 'Ventana', 'Window'],
        ['OPENINGMOVE', 'Mover hueco', 'Move opening'], ['OPENINGCOPY', 'Copiar hueco', 'Copy opening'],
        ['OPENINGEDIT', 'Editar hueco', 'Edit opening'], ['OPENINGMIRROR', 'Reflejar hueco', 'Mirror opening'],
        ['OPENINGDELETE', 'Borrar hueco', 'Delete opening'], ['WALLTHICKNESS', 'Espesor de muro', 'Wall thickness'],
      ] as const).map(([command, es, en]) => <button key={command} type="button" className="btn" onClick={() => {
        void editor.command(command); const canvas = ref.current?.ownerDocument.querySelector<HTMLElement>('.canvas-host');
        onStart?.(); requestAnimationFrame(() => canvas?.focus());
      }}>{tr(lang, es, en)}</button>)}</div>
    </div>
    <div className="architecture-opening-actions" role="group" aria-label={tr(lang, 'Herramientas de muro', 'Wall tools')}>
      <p className="panel__hint">{tr(lang, 'Selecciona un muro compatible; Intro crea el eje o muro paralelo. Esc descarta.', 'Select a compatible wall; Enter creates the axis or parallel wall. Esc cancels.')}</p>
      <div className="panel-actions">{([['WALLAXIS', 'Eje de muro', 'Wall axis'], ['WALLOFFSET', 'Muro paralelo', 'Parallel wall']] as const).map(([command, es, en]) => <button key={command} type="button" className="btn" onClick={() => {
        void editor.command(command); const canvas = ref.current?.ownerDocument.querySelector<HTMLElement>('.canvas-host');
        onStart?.(); requestAnimationFrame(() => canvas?.focus());
      }}>{tr(lang, es, en)}</button>)}</div>
    </div>
    <p className="panel__hint">{tr(lang, 'Las medidas configuran la colocación. Editar pieza abre las solicitudes nativas para una pieza existente. Los campos inactivos se conservan y validan para otra variante. Longitudes: unidades del dibujo o mm/cm/m/in; giros: grados. Intro o Esc antes de colocar cancela.', 'Dimensions configure placement. Edit component opens native prompts for an existing component. Inactive fields are retained and validated for another variant. Lengths: drawing units or mm/cm/m/in; angles: degrees. Enter or Esc before placement cancels.')}</p>
  </div>;
}
