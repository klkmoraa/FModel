import { Copy, Plus, RotateCcw, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { findUnused } from '../../audit/purge';
import type { Lang } from '../../commands/types';
import { STANDARD_SCALES, TEXTSTYLE_STANDARD_ID } from '../../document/defaults';
import { newId } from '../../document/ids';
import type { ArrowType, DimStyleRecord, Id, MLeaderStyleRecord, MLineStyleRecord, MTextAttachment, TableStyleRecord, TextStyleRecord } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { ColorPicker, LinetypeSelect, LineweightSelect, NumberField, TextField, Toggle, tr } from '../controls';
import { useEditorEvents } from '../hooks';
import { askConfirm } from '../ConfirmHost';

type Coll = 'textStyles' | 'dimStyles' | 'mleaderStyles' | 'tableStyles' | 'mlineStyles';
type Tab = Coll | 'scales';
type AnyStyle = { id: Id; name: string };
type L10n = { es: string; en: string };

const CURRENT_KEY: Record<Coll, 'currentTextStyle' | 'currentDimStyle' | 'currentMLeaderStyle' | 'currentTableStyle' | 'currentMLineStyle'> = {
  textStyles: 'currentTextStyle',
  dimStyles: 'currentDimStyle',
  mleaderStyles: 'currentMLeaderStyle',
  tableStyles: 'currentTableStyle',
  mlineStyles: 'currentMLineStyle',
};

const TABS: [Tab, L10n][] = [
  ['textStyles', { es: 'Texto', en: 'Text' }],
  ['dimStyles', { es: 'Cota', en: 'Dimension' }],
  ['mleaderStyles', { es: 'Directriz múltiple', en: 'Multileader' }],
  ['tableStyles', { es: 'Tabla', en: 'Table' }],
  ['mlineStyles', { es: 'Multilínea', en: 'Multiline' }],
  ['scales', { es: 'Lista de escalas', en: 'Scale list' }],
];

const ARROWS: [ArrowType, L10n][] = [
  ['closed-filled', { es: 'Cerrada rellena', en: 'Closed filled' }],
  ['closed', { es: 'Cerrada', en: 'Closed' }],
  ['open', { es: 'Abierta', en: 'Open' }],
  ['open30', { es: 'Abierta 30°', en: 'Open 30°' }],
  ['dot', { es: 'Punto', en: 'Dot' }],
  ['dot-small', { es: 'Punto pequeño', en: 'Small dot' }],
  ['tick', { es: 'Oblicua', en: 'Oblique' }],
  ['architectural', { es: 'Marca arquitectónica', en: 'Architectural tick' }],
  ['integral', { es: 'Integral', en: 'Integral' }],
  ['none', { es: 'Ninguna', en: 'None' }],
];

const ATTACH: [MTextAttachment, L10n][] = [
  [1, { es: 'Superior izquierda', en: 'Top left' }],
  [2, { es: 'Superior centro', en: 'Top center' }],
  [3, { es: 'Superior derecha', en: 'Top right' }],
  [4, { es: 'Medio izquierda', en: 'Middle left' }],
  [5, { es: 'Medio centro', en: 'Middle center' }],
  [6, { es: 'Medio derecha', en: 'Middle right' }],
  [7, { es: 'Inferior izquierda', en: 'Bottom left' }],
  [8, { es: 'Inferior centro', en: 'Bottom center' }],
  [9, { es: 'Inferior derecha', en: 'Bottom right' }],
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label title={label}>{label}</label>
      {children}
    </div>
  );
}

function Select<T extends string | number>({ value, options, onChange, lang }: { value: T; options: [T, L10n][]; onChange: (v: T) => void; lang: Lang }) {
  return (
    <select className="select" value={String(value)} onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}>
      {options.map(([v, l]) => (
        <option key={String(v)} value={String(v)}>
          {l[lang]}
        </option>
      ))}
    </select>
  );
}

/** Administrador de estilos con edición en vivo: todo cambio es una transacción que se puede deshacer. */
export function StylesDialog({ editor, onClose, initialTab }: { editor: Editor; onClose: () => void; initialTab?: Tab }) {
  useEditorEvents(editor, ['doc']);
  const lang = editor.lang;
  const doc = editor.doc;
  const [tab, setTab] = useState<Tab>(initialTab ?? 'textStyles');
  const [selected, setSelected] = useState<Record<string, Id>>({});
  const [error, setError] = useState('');

  const coll = tab === 'scales' ? null : tab;
  const list = coll ? ([...(doc.data[coll] as Map<Id, AnyStyle>).values()].sort((a, b) => a.name.localeCompare(b.name)) as AnyStyle[]) : [];
  const current = coll ? (doc.settings[CURRENT_KEY[coll]] as Id) : '';
  const selId = coll ? (selected[coll] && (doc.data[coll] as Map<Id, AnyStyle>).has(selected[coll]) ? selected[coll] : current || list[0]?.id) : '';
  const record = coll && selId ? (doc.data[coll] as Map<Id, AnyStyle>).get(selId) : undefined;
  const unused = new Set(findUnused(doc).map((i) => i.id));
  const textStyleOptions: [Id, L10n][] = [...doc.data.textStyles.values()].map((t) => [t.id, { es: t.name, en: t.name }]);

  const update = <R extends AnyStyle>(patch: Partial<R> | ((r: R) => R)) => {
    if (!coll || !record) return;
    doc.transact('STYLE', (tx) => tx.update(coll, record.id, patch as never));
  };
  const uniqueName = (base: string) => {
    const names = new Set(list.map((s) => s.name.toLowerCase()));
    let n = base;
    let i = 2;
    while (names.has(n.toLowerCase())) n = `${base} (${i++})`;
    return n;
  };
  const duplicate = () => {
    if (!coll || !record) return;
    const id = newId('st');
    doc.transact('STYLE NEW', (tx) => tx.add(coll, { ...structuredClone(record), id, name: uniqueName(`${record.name} copia`) } as never));
    setSelected({ ...selected, [coll]: id });
  };
  const rename = (name: string) => {
    const n = name.trim();
    if (!n || !record || n === record.name) return;
    if (list.some((s) => s.id !== record.id && s.name.toLowerCase() === n.toLowerCase())) return setError(tr(lang, `Ya existe un estilo «${n}».`, `Style "${n}" already exists.`));
    if (/[<>/\\":;?*|=,`]/.test(n)) return setError(tr(lang, 'El nombre contiene caracteres no válidos (< > / \\ " : ; ? * | = , `).', 'The name contains invalid characters.'));
    setError('');
    update({ name: n });
  };
  const remove = () => {
    if (!coll || !record) return;
    doc.transact('STYLE DELETE', (tx) => tx.remove(coll, record.id));
    setSelected({ ...selected, [coll]: current });
  };
  const canDelete = !!record && record.id !== current && record.id !== TEXTSTYLE_STANDARD_ID && unused.has(record.id);

  return (
    <Dialog
      wide
      lang={lang}
      title={tr(lang, 'Administrador de estilos', 'Styles manager')}
      onClose={onClose}
      footer={
        <>
          <span role={error ? 'alert' : undefined} style={{ flex: 1, fontSize: 12, color: error ? 'var(--fm-danger)' : 'var(--ink-muted)' }}>
            {error || tr(lang, 'Los cambios se aplican al momento a todos los objetos que usan el estilo y se pueden deshacer.', 'Changes apply at once to every object using the style and can be undone.')}
          </span>
          <button className="btn btn--primary" onClick={onClose}>
            {tr(lang, 'Listo', 'Done')}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }} role="tablist">
        {TABS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`btn btn--sm${tab === id ? ' btn--accent' : ''}`} onClick={() => (setTab(id), setError(''))}>
            {l[lang]}
          </button>
        ))}
      </div>

      {coll ? (
        <div className="styles">
          <div className="styles__list">
            <div className="list" role="listbox" aria-label={tr(lang, 'Estilos', 'Styles')}>
              {list.map((s) => (
                <button key={s.id} role="option" aria-selected={s.id === selId} className={`list-row${s.id === selId ? ' is-active' : ''}`} onClick={() => setSelected({ ...selected, [coll]: s.id })}>
                  {s.id === current ? <Star size={12} color="var(--fs-signal-attention)" aria-label={tr(lang, 'actual', 'current')} /> : <span style={{ width: 12 }} />}
                  <span style={{ flex: 1, textAlign: 'left' }}>{s.name}</span>
                  {unused.has(s.id) && s.id !== current && <span className="eyebrow">{tr(lang, 'sin uso', 'unused')}</span>}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className="btn btn--sm" disabled={!record} onClick={duplicate}>
                <Copy size={12} /> {tr(lang, 'Nuevo a partir de', 'New from')}
              </button>
              <button className="btn btn--sm" disabled={!record || record.id === current} onClick={() => record && doc.transact('STYLE CURRENT', (tx) => tx.setSettings({ [CURRENT_KEY[coll]]: record.id }))}>
                <Star size={12} /> {tr(lang, 'Establecer actual', 'Set current')}
              </button>
              <button className="btn btn--sm btn--danger" disabled={!canDelete} onClick={remove} title={canDelete ? '' : tr(lang, 'Solo se eliminan estilos sin uso que no sean el actual ni el estándar.', 'Only unused styles that are not current or standard can be deleted.')}>
                <Trash2 size={12} /> {tr(lang, 'Eliminar', 'Delete')}
              </button>
            </div>
          </div>
          <div className="styles__props">
            {record ? (
              <>
                <Row label={tr(lang, 'Nombre', 'Name')}>
                  <TextField value={record.name} onCommit={rename} />
                </Row>
                {coll === 'textStyles' && <TextStyleFields s={record as TextStyleRecord} update={update} lang={lang} />}
                {coll === 'dimStyles' && <DimStyleFields s={record as DimStyleRecord} update={update} lang={lang} textStyles={textStyleOptions} />}
                {coll === 'mleaderStyles' && <MLeaderFields s={record as MLeaderStyleRecord} update={update} lang={lang} textStyles={textStyleOptions} editor={editor} />}
                {coll === 'tableStyles' && <TableStyleFields s={record as TableStyleRecord} update={update} lang={lang} textStyles={textStyleOptions} />}
                {coll === 'mlineStyles' && <MLineFields s={record as MLineStyleRecord} update={update} lang={lang} editor={editor} />}
              </>
            ) : (
              <p className="empty">{tr(lang, 'No hay estilos.', 'No styles.')}</p>
            )}
          </div>
        </div>
      ) : (
        <ScaleList editor={editor} lang={lang} setError={setError} />
      )}
    </Dialog>
  );
}

type Updater<R> = (patch: Partial<R> | ((r: R) => R)) => void;

function TextStyleFields({ s, update, lang }: { s: TextStyleRecord; update: Updater<TextStyleRecord>; lang: Lang }) {
  return (
    <>
      <Row label={tr(lang, 'Fuente', 'Font')}>
        <>
          <input className="input" list="fm-fonts" defaultValue={s.font} key={s.id + s.font} onBlur={(e) => e.target.value.trim() && e.target.value !== s.font && update({ font: e.target.value.trim() })} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && (e.target as HTMLInputElement).blur())} />
          <datalist id="fm-fonts">
            {['Inter', 'IBM Plex Mono', 'Space Grotesk', 'Arial', 'Times New Roman', 'simplex.shx', 'romans.shx', 'isocp.shx'].map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </>
      </Row>
      <Row label={tr(lang, 'Altura (0 = variable)', 'Height (0 = variable)')}>
        <NumberField lang={lang} value={s.height} onCommit={(v) => update({ height: Math.max(0, v) })} />
      </Row>
      <Row label={tr(lang, 'Factor de anchura', 'Width factor')}>
        <NumberField lang={lang} value={s.widthFactor} onCommit={(v) => update({ widthFactor: Math.max(0.01, v) })} />
      </Row>
      <Row label={tr(lang, 'Ángulo oblicuo', 'Oblique angle')}>
        <NumberField lang={lang} value={(s.oblique * 180) / Math.PI} suffix="°" onCommit={(v) => update({ oblique: (Math.max(-85, Math.min(85, v)) * Math.PI) / 180 })} />
      </Row>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '4px 0' }}>
        <Toggle checked={!!s.bold} onChange={(v) => update({ bold: v || undefined })} label={tr(lang, 'Negrita', 'Bold')} />
        <Toggle checked={!!s.italic} onChange={(v) => update({ italic: v || undefined })} label={tr(lang, 'Cursiva', 'Italic')} />
        <Toggle checked={s.annotative} onChange={(v) => update({ annotative: v })} label={tr(lang, 'Anotativo', 'Annotative')} />
      </div>
      <div className="styles__sample" style={{ fontFamily: `"${s.font.replace(/\.(shx|ttf)$/i, '')}", Inter, sans-serif`, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', transform: `skewX(${(-s.oblique * 180) / Math.PI}deg) scaleX(${s.widthFactor})`, transformOrigin: 'left' }}>
        AaBb 0123 Ø±°
      </div>
    </>
  );
}

function DimStyleFields({ s, update, lang, textStyles }: { s: DimStyleRecord; update: Updater<DimStyleRecord>; lang: Lang; textStyles: [Id, L10n][] }) {
  const num = (key: keyof DimStyleRecord, label: string, min = 0, suffix?: string) => (
    <Row label={label}>
      <NumberField lang={lang} value={s[key] as number} suffix={suffix} onCommit={(v) => update({ [key]: Math.max(min, v) } as Partial<DimStyleRecord>)} />
    </Row>
  );
  const bool = (key: keyof DimStyleRecord, label: string) => <Toggle checked={!!s[key]} onChange={(v) => update({ [key]: v } as Partial<DimStyleRecord>)} label={label} />;
  return (
    <>
      <h4 className="eyebrow styles__group">{tr(lang, 'Líneas y flechas', 'Lines and arrows')}</h4>
      <Row label={tr(lang, 'Flecha 1', 'Arrow 1')}>
        <Select lang={lang} value={s.arrow1} options={ARROWS} onChange={(v) => update({ arrow1: v })} />
      </Row>
      <Row label={tr(lang, 'Flecha 2', 'Arrow 2')}>
        <Select lang={lang} value={s.arrow2} options={ARROWS} onChange={(v) => update({ arrow2: v })} />
      </Row>
      <Row label={tr(lang, 'Flecha de directriz', 'Leader arrow')}>
        <Select lang={lang} value={s.leaderArrow} options={ARROWS} onChange={(v) => update({ leaderArrow: v })} />
      </Row>
      {num('arrowSize', tr(lang, 'Tamaño de flecha', 'Arrow size'))}
      {num('centerMark', tr(lang, 'Marca de centro (<0 líneas)', 'Center mark (<0 lines)'), -100)}
      {num('extLineOffset', tr(lang, 'Desfase de extensión', 'Extension offset'))}
      {num('extLineExtension', tr(lang, 'Prolongación de extensión', 'Extension beyond line'))}
      {num('dimLineExtension', tr(lang, 'Prolongación de línea de cota', 'Dimension line extension'))}
      {num('baselineSpacing', tr(lang, 'Separación de línea base', 'Baseline spacing'))}
      <Row label={tr(lang, 'Color de línea de cota', 'Dimension line color')}>
        <ColorPicker lang={lang} value={s.dimColor} onChange={(c) => update({ dimColor: c })} />
      </Row>
      <Row label={tr(lang, 'Color de extensión', 'Extension color')}>
        <ColorPicker lang={lang} value={s.extColor} onChange={(c) => update({ extColor: c })} />
      </Row>
      <Row label={tr(lang, 'Grosor de línea de cota', 'Dimension lineweight')}>
        <LineweightSelect lang={lang} value={s.dimLineweight} onChange={(v) => update({ dimLineweight: v })} />
      </Row>
      <Row label={tr(lang, 'Grosor de extensión', 'Extension lineweight')}>
        <LineweightSelect lang={lang} value={s.extLineweight} onChange={(v) => update({ extLineweight: v })} />
      </Row>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {bool('suppressExt1', tr(lang, 'Suprimir extensión 1', 'Suppress extension 1'))}
        {bool('suppressExt2', tr(lang, 'Suprimir extensión 2', 'Suppress extension 2'))}
      </div>

      <h4 className="eyebrow styles__group">{tr(lang, 'Texto', 'Text')}</h4>
      <Row label={tr(lang, 'Estilo de texto', 'Text style')}>
        <Select lang={lang} value={s.textStyle} options={textStyles} onChange={(v) => update({ textStyle: v })} />
      </Row>
      {num('textHeight', tr(lang, 'Altura de texto', 'Text height'), 0.001)}
      {num('textGap', tr(lang, 'Separación', 'Gap'))}
      <Row label={tr(lang, 'Color de texto', 'Text color')}>
        <ColorPicker lang={lang} value={s.textColor} onChange={(c) => update({ textColor: c })} />
      </Row>
      <Row label={tr(lang, 'Posición vertical', 'Vertical position')}>
        <Select lang={lang} value={s.textVertical} options={[['centered', { es: 'Centrado', en: 'Centered' }], ['above', { es: 'Encima', en: 'Above' }], ['outside', { es: 'Exterior', en: 'Outside' }], ['below', { es: 'Debajo', en: 'Below' }]]} onChange={(v) => update({ textVertical: v })} />
      </Row>
      <Row label={tr(lang, 'Alineación', 'Alignment')}>
        <Select lang={lang} value={s.textAlignment} options={[['aligned', { es: 'Alineado con la cota', en: 'Aligned with dimension' }], ['horizontal', { es: 'Horizontal', en: 'Horizontal' }], ['iso', { es: 'Norma ISO', en: 'ISO standard' }]]} onChange={(v) => update({ textAlignment: v })} />
      </Row>
      <Row label={tr(lang, 'Relleno de texto', 'Text fill')}>
        <Select lang={lang} value={s.textFill} options={[['none', { es: 'Ninguno', en: 'None' }], ['background', { es: 'Color de fondo', en: 'Background' }]]} onChange={(v) => update({ textFill: v })} />
      </Row>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {bool('fitTextInside', tr(lang, 'Forzar texto entre extensiones', 'Force text inside'))}
        {bool('annotative', tr(lang, 'Anotativo', 'Annotative'))}
      </div>
      {num('overallScale', tr(lang, 'Escala global', 'Overall scale'), 0.0001)}

      <h4 className="eyebrow styles__group">{tr(lang, 'Unidades principales', 'Primary units')}</h4>
      <Row label={tr(lang, 'Formato', 'Format')}>
        <Select lang={lang} value={s.unitFormat} options={[['decimal', { es: 'Decimal', en: 'Decimal' }], ['engineering', { es: 'Ingeniería', en: 'Engineering' }], ['architectural', { es: 'Arquitectura', en: 'Architectural' }], ['fractional', { es: 'Fraccionario', en: 'Fractional' }], ['scientific', { es: 'Científico', en: 'Scientific' }]]} onChange={(v) => update({ unitFormat: v })} />
      </Row>
      <Row label={tr(lang, 'Precisión (decimales)', 'Precision (decimals)')}>
        <NumberField lang={lang} value={s.precision} onCommit={(v) => update({ precision: Math.max(0, Math.min(8, Math.round(v))) })} />
      </Row>
      <Row label={tr(lang, 'Separador decimal', 'Decimal separator')}>
        <Select lang={lang} value={s.decimalSeparator} options={[[',', { es: 'Coma (,)', en: 'Comma (,)' }], ['.', { es: 'Punto (.)', en: 'Period (.)' }]]} onChange={(v) => update({ decimalSeparator: v })} />
      </Row>
      {num('roundOff', tr(lang, 'Redondeo', 'Round off'))}
      {num('linearFactor', tr(lang, 'Factor de escala lineal', 'Linear scale factor'), 0.000001)}
      <Row label={tr(lang, 'Prefijo', 'Prefix')}>
        <TextField value={s.prefix} onCommit={(v) => update({ prefix: v })} />
      </Row>
      <Row label={tr(lang, 'Sufijo', 'Suffix')}>
        <TextField value={s.suffix} onCommit={(v) => update({ suffix: v })} />
      </Row>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {bool('suppressLeadingZeros', tr(lang, 'Suprimir ceros a la izquierda', 'Suppress leading zeros'))}
        {bool('suppressTrailingZeros', tr(lang, 'Suprimir ceros a la derecha', 'Suppress trailing zeros'))}
      </div>
      <Row label={tr(lang, 'Formato angular', 'Angle format')}>
        <Select lang={lang} value={s.angleFormat} options={[['degrees', { es: 'Grados decimales', en: 'Decimal degrees' }], ['dms', { es: 'Grados/minutos/segundos', en: 'Deg/min/sec' }], ['grads', { es: 'Grados centesimales', en: 'Grads' }], ['radians', { es: 'Radianes', en: 'Radians' }], ['surveyor', { es: 'Topográfico', en: 'Surveyor' }]]} onChange={(v) => update({ angleFormat: v })} />
      </Row>
      <Row label={tr(lang, 'Precisión angular', 'Angle precision')}>
        <NumberField lang={lang} value={s.anglePrecision} onCommit={(v) => update({ anglePrecision: Math.max(0, Math.min(8, Math.round(v))) })} />
      </Row>

      <h4 className="eyebrow styles__group">{tr(lang, 'Tolerancias', 'Tolerances')}</h4>
      <Row label={tr(lang, 'Método', 'Method')}>
        <Select lang={lang} value={s.tolerance} options={[['none', { es: 'Ninguno', en: 'None' }], ['symmetrical', { es: 'Simétrico', en: 'Symmetrical' }], ['deviation', { es: 'Desviación', en: 'Deviation' }], ['limits', { es: 'Límites', en: 'Limits' }], ['basic', { es: 'Básico', en: 'Basic' }]]} onChange={(v) => update({ tolerance: v })} />
      </Row>
      {s.tolerance !== 'none' && s.tolerance !== 'basic' && (
        <>
          {num('tolUpper', tr(lang, 'Valor superior', 'Upper value'), -1e9)}
          {s.tolerance !== 'symmetrical' && num('tolLower', tr(lang, 'Valor inferior', 'Lower value'), -1e9)}
          <Row label={tr(lang, 'Precisión', 'Precision')}>
            <NumberField lang={lang} value={s.tolPrecision} onCommit={(v) => update({ tolPrecision: Math.max(0, Math.min(8, Math.round(v))) })} />
          </Row>
          {num('tolHeightFactor', tr(lang, 'Factor de altura', 'Height factor'), 0.1)}
        </>
      )}

      <h4 className="eyebrow styles__group">{tr(lang, 'Unidades alternativas', 'Alternate units')}</h4>
      {bool('altUnits', tr(lang, 'Mostrar unidades alternativas', 'Display alternate units'))}
      {s.altUnits && (
        <>
          {num('altFactor', tr(lang, 'Multiplicador', 'Multiplier'), 0.000001)}
          <Row label={tr(lang, 'Precisión', 'Precision')}>
            <NumberField lang={lang} value={s.altPrecision} onCommit={(v) => update({ altPrecision: Math.max(0, Math.min(8, Math.round(v))) })} />
          </Row>
          <Row label={tr(lang, 'Prefijo', 'Prefix')}>
            <TextField value={s.altPrefix} onCommit={(v) => update({ altPrefix: v })} />
          </Row>
          <Row label={tr(lang, 'Sufijo', 'Suffix')}>
            <TextField value={s.altSuffix} onCommit={(v) => update({ altSuffix: v })} />
          </Row>
        </>
      )}
    </>
  );
}

function MLeaderFields({ s, update, lang, textStyles, editor }: { s: MLeaderStyleRecord; update: Updater<MLeaderStyleRecord>; lang: Lang; textStyles: [Id, L10n][]; editor: Editor }) {
  const blocks: [Id, L10n][] = [...editor.doc.data.blocks.values()].filter((b) => b.kind === 'normal').map((b) => [b.id, { es: b.name, en: b.name }]);
  return (
    <>
      <h4 className="eyebrow styles__group">{tr(lang, 'Directriz', 'Leader')}</h4>
      <Row label={tr(lang, 'Tipo', 'Type')}>
        <Select lang={lang} value={s.leaderType} options={[['straight', { es: 'Recta', en: 'Straight' }], ['spline', { es: 'Spline', en: 'Spline' }], ['none', { es: 'Ninguna', en: 'None' }]]} onChange={(v) => update({ leaderType: v })} />
      </Row>
      <Row label={tr(lang, 'Flecha', 'Arrow')}>
        <Select lang={lang} value={s.arrow} options={ARROWS} onChange={(v) => update({ arrow: v })} />
      </Row>
      <Row label={tr(lang, 'Tamaño de flecha', 'Arrow size')}>
        <NumberField lang={lang} value={s.arrowSize} onCommit={(v) => update({ arrowSize: Math.max(0, v) })} />
      </Row>
      <Row label={tr(lang, 'Color', 'Color')}>
        <ColorPicker lang={lang} value={s.leaderColor} onChange={(c) => update({ leaderColor: c })} />
      </Row>
      <Row label={tr(lang, 'Grosor', 'Lineweight')}>
        <LineweightSelect lang={lang} value={s.leaderLineweight} onChange={(v) => update({ leaderLineweight: v })} />
      </Row>
      <Row label={tr(lang, 'Puntos máximos', 'Maximum points')}>
        <NumberField lang={lang} value={s.maxLeaderPoints} onCommit={(v) => update({ maxLeaderPoints: Math.max(2, Math.round(v)) })} />
      </Row>
      <Toggle checked={s.landing} onChange={(v) => update({ landing: v })} label={tr(lang, 'Rellano horizontal', 'Horizontal landing')} />
      <Row label={tr(lang, 'Longitud del rellano', 'Landing length')}>
        <NumberField lang={lang} value={s.doglegLength} onCommit={(v) => update({ doglegLength: Math.max(0, v) })} />
      </Row>
      <Row label={tr(lang, 'Separación del rellano', 'Landing gap')}>
        <NumberField lang={lang} value={s.landingGap} onCommit={(v) => update({ landingGap: Math.max(0, v) })} />
      </Row>
      <h4 className="eyebrow styles__group">{tr(lang, 'Contenido', 'Content')}</h4>
      <Row label={tr(lang, 'Tipo de contenido', 'Content type')}>
        <Select lang={lang} value={s.contentType} options={[['mtext', { es: 'Texto de párrafos', en: 'Mtext' }], ['block', { es: 'Bloque', en: 'Block' }], ['none', { es: 'Ninguno', en: 'None' }]]} onChange={(v) => update({ contentType: v })} />
      </Row>
      {s.contentType === 'mtext' && (
        <>
          <Row label={tr(lang, 'Estilo de texto', 'Text style')}>
            <Select lang={lang} value={s.textStyle} options={textStyles} onChange={(v) => update({ textStyle: v })} />
          </Row>
          <Row label={tr(lang, 'Altura de texto', 'Text height')}>
            <NumberField lang={lang} value={s.textHeight} onCommit={(v) => update({ textHeight: Math.max(0.001, v) })} />
          </Row>
          <Row label={tr(lang, 'Color de texto', 'Text color')}>
            <ColorPicker lang={lang} value={s.textColor} onChange={(c) => update({ textColor: c })} />
          </Row>
          <Toggle checked={s.textFrame} onChange={(v) => update({ textFrame: v })} label={tr(lang, 'Marco alrededor del texto', 'Frame text')} />
        </>
      )}
      {s.contentType === 'block' && (
        <>
          <Row label={tr(lang, 'Bloque', 'Block')}>
            {blocks.length ? <Select lang={lang} value={s.blockId ?? blocks[0][0]} options={blocks} onChange={(v) => update({ blockId: v })} /> : <span className="eyebrow">{tr(lang, 'No hay bloques', 'No blocks')}</span>}
          </Row>
          <Row label={tr(lang, 'Escala del bloque', 'Block scale')}>
            <NumberField lang={lang} value={s.blockScale} onCommit={(v) => update({ blockScale: Math.max(0.0001, v) })} />
          </Row>
        </>
      )}
      <Row label={tr(lang, 'Escala global', 'Overall scale')}>
        <NumberField lang={lang} value={s.overallScale} onCommit={(v) => update({ overallScale: Math.max(0.0001, v) })} />
      </Row>
      <Toggle checked={s.annotative} onChange={(v) => update({ annotative: v })} label={tr(lang, 'Anotativo', 'Annotative')} />
    </>
  );
}

function TableStyleFields({ s, update, lang, textStyles }: { s: TableStyleRecord; update: Updater<TableStyleRecord>; lang: Lang; textStyles: [Id, L10n][] }) {
  const cell = (key: 'title' | 'header' | 'data', label: string) => (
    <>
      <h4 className="eyebrow styles__group">{label}</h4>
      <Row label={tr(lang, 'Altura de texto', 'Text height')}>
        <NumberField lang={lang} value={s[key].textHeight} onCommit={(v) => update({ [key]: { ...s[key], textHeight: Math.max(0.001, v) } } as Partial<TableStyleRecord>)} />
      </Row>
      <Row label={tr(lang, 'Justificación', 'Alignment')}>
        <Select lang={lang} value={s[key].align} options={ATTACH} onChange={(v) => update({ [key]: { ...s[key], align: v } } as Partial<TableStyleRecord>)} />
      </Row>
      <Row label={tr(lang, 'Relleno', 'Fill')}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Toggle checked={!!s[key].fill} onChange={(on) => update({ [key]: { ...s[key], fill: on ? 'aci:8' : undefined } } as Partial<TableStyleRecord>)} label="" />
          {s[key].fill && <ColorPicker lang={lang} allowByLayer={false} value={s[key].fill!} onChange={(c) => update({ [key]: { ...s[key], fill: c } } as Partial<TableStyleRecord>)} />}
        </div>
      </Row>
    </>
  );
  return (
    <>
      <Row label={tr(lang, 'Estilo de texto', 'Text style')}>
        <Select lang={lang} value={s.textStyle} options={textStyles} onChange={(v) => update({ textStyle: v })} />
      </Row>
      <Row label={tr(lang, 'Dirección', 'Direction')}>
        <Select lang={lang} value={s.flow} options={[['down', { es: 'Hacia abajo', en: 'Down' }], ['up', { es: 'Hacia arriba', en: 'Up' }]]} onChange={(v) => update({ flow: v })} />
      </Row>
      <Row label={tr(lang, 'Margen de celda', 'Cell margin')}>
        <NumberField lang={lang} value={s.cellMargin} onCommit={(v) => update({ cellMargin: Math.max(0, v) })} />
      </Row>
      <Row label={tr(lang, 'Color de rejilla', 'Grid color')}>
        <ColorPicker lang={lang} value={s.gridColor} onChange={(c) => update({ gridColor: c })} />
      </Row>
      <Row label={tr(lang, 'Grosor de rejilla', 'Grid lineweight')}>
        <LineweightSelect lang={lang} value={s.gridLineweight} onChange={(v) => update({ gridLineweight: v })} />
      </Row>
      {cell('title', tr(lang, 'Título', 'Title'))}
      {cell('header', tr(lang, 'Encabezado', 'Header'))}
      {cell('data', tr(lang, 'Datos', 'Data'))}
    </>
  );
}

function MLineFields({ s, update, lang, editor }: { s: MLineStyleRecord; update: Updater<MLineStyleRecord>; lang: Lang; editor: Editor }) {
  const caps: ['none' | 'line' | 'outer-arc', L10n][] = [
    ['none', { es: 'Sin remate', en: 'None' }],
    ['line', { es: 'Línea', en: 'Line' }],
    ['outer-arc', { es: 'Arco exterior', en: 'Outer arc' }],
  ];
  const setElement = (i: number, patch: Partial<MLineStyleRecord['elements'][number]>) => update({ elements: s.elements.map((el, j) => (j === i ? { ...el, ...patch } : el)) });
  return (
    <>
      <Row label={tr(lang, 'Descripción', 'Description')}>
        <TextField value={s.description} onCommit={(v) => update({ description: v })} />
      </Row>
      <Row label={tr(lang, 'Remate inicial', 'Start cap')}>
        <Select lang={lang} value={s.startCap} options={caps} onChange={(v) => update({ startCap: v })} />
      </Row>
      <Row label={tr(lang, 'Remate final', 'End cap')}>
        <Select lang={lang} value={s.endCap} options={caps} onChange={(v) => update({ endCap: v })} />
      </Row>
      <h4 className="eyebrow styles__group">{tr(lang, 'Elementos', 'Elements')}</h4>
      {s.elements.map((el, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr auto', gap: 4, alignItems: 'center' }}>
          <NumberField lang={lang} ariaLabel={tr(lang, 'Desfase', 'Offset')} value={el.offset} onCommit={(v) => setElement(i, { offset: v })} />
          <ColorPicker lang={lang} value={el.color} onChange={(c) => setElement(i, { color: c })} />
          <LinetypeSelect doc={editor.doc} lang={lang} value={el.linetype} onChange={(v) => setElement(i, { linetype: v })} />
          <button className="icon-btn" disabled={s.elements.length <= 1} onClick={() => update({ elements: s.elements.filter((_, j) => j !== i) })} aria-label={tr(lang, 'Quitar elemento', 'Remove element')}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="btn btn--sm" onClick={() => update({ elements: [...s.elements, { offset: 0, color: 'ByLayer', linetype: 'ByLayer' }].sort((a, b) => b.offset - a.offset) })}>
        <Plus size={12} /> {tr(lang, 'Añadir elemento', 'Add element')}
      </button>
    </>
  );
}

function ScaleList({ editor, lang, setError }: { editor: Editor; lang: Lang; setError: (s: string) => void }) {
  const doc = editor.doc;
  const scales = doc.settings.annotationScales;
  const [paper, setPaper] = useState('1');
  const [drawing, setDrawing] = useState('');
  const save = (next: typeof scales) => doc.transact('SCALELISTEDIT', (tx) => tx.setSettings({ annotationScales: next }));
  const add = () => {
    const p = Number(paper.replace(',', '.'));
    const d = Number(drawing.replace(',', '.'));
    if (!(p > 0) || !(d > 0)) return setError(tr(lang, 'Introduce unidades de papel y de dibujo positivas.', 'Enter positive paper and drawing units.'));
    const name = `${p}:${d}`;
    if (scales.some((s) => s.name === name)) return setError(tr(lang, `La escala ${name} ya existe.`, `Scale ${name} already exists.`));
    setError('');
    save([...scales, { name, paper: p, drawing: d }].sort((a, b) => b.paper / b.drawing - a.paper / a.drawing));
    setDrawing('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '90px auto 90px auto auto', gap: 6, alignItems: 'center' }}>
        <input className="input input--mono" value={paper} onChange={(e) => setPaper(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Unidades de papel', 'Paper units')} />
        <span>:</span>
        <input className="input input--mono" value={drawing} placeholder="50" onChange={(e) => setDrawing(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && add())} aria-label={tr(lang, 'Unidades de dibujo', 'Drawing units')} />
        <button className="btn btn--sm" onClick={add}>
          <Plus size={12} /> {tr(lang, 'Añadir escala', 'Add scale')}
        </button>
        <button className="btn btn--sm" onClick={async () => (await askConfirm(lang, tr(lang, 'Restablecer escalas', 'Reset scales'), tr(lang, '¿Restablecer la lista de escalas estándar?', 'Reset to the standard scale list?'), { confirmLabel: tr(lang, 'Restablecer', 'Reset') })) && save(STANDARD_SCALES)}>
          <RotateCcw size={12} /> {tr(lang, 'Restablecer', 'Reset')}
        </button>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>{tr(lang, 'Escala', 'Scale')}</th>
            <th style={{ textAlign: 'right' }}>{tr(lang, 'Papel', 'Paper')}</th>
            <th style={{ textAlign: 'right' }}>{tr(lang, 'Dibujo', 'Drawing')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {scales.map((s) => (
            <tr key={s.name}>
              <td>
                <code>{s.name}</code>
              </td>
              <td style={{ textAlign: 'right' }}>{s.paper}</td>
              <td style={{ textAlign: 'right' }}>{s.drawing}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="icon-btn" disabled={scales.length <= 1} onClick={() => save(scales.filter((x) => x.name !== s.name))} aria-label={tr(lang, 'Eliminar escala', 'Delete scale')}>
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
