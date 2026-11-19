import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { aciToHex, colorLabel, displayColor } from '../document/colors';
import type { CadDocument } from '../document/document';
import { LINEWEIGHTS } from '../document/types';
import type { Lang } from '../commands/types';
import { evaluate } from '../lib/expr';
import { nextSegmentIndex } from './segmented';
import { useModalFocusTrap } from './modalFocus';
import './colorPicker.css';

export const MIXED = '*VARIOS*';

export function tr(lang: Lang, es: string, en: string) {
  return lang === 'es' ? es : en;
}

/** Campo numérico que confirma al perder foco o con Intro; admite expresiones. */
export function NumberField({ value, onCommit, mixed, readOnly, step, suffix, lang, ariaLabel }: { value: number | null; onCommit: (v: number) => void; mixed?: boolean; readOnly?: boolean; step?: number; suffix?: string; lang: Lang; ariaLabel?: string }) {
  const fmt = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : String(Math.round(v * 1e6) / 1e6));
  const [text, setText] = useState(mixed ? '' : fmt(value));
  const [err, setErr] = useState(false);
  useEffect(() => {
    setText(mixed ? '' : fmt(value));
    setErr(false);
  }, [value, mixed]);
  const commit = async () => {
    if (readOnly) return;
    const t = text.trim();
    if (!t || (!mixed && t === fmt(value))) return;
    try {
      const v = evaluate(t.replace(',', '.'));
      if (!Number.isFinite(v)) throw new Error('nan');
      setErr(false);
      onCommit(v);
    } catch {
      setErr(true);
    }
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input input--mono"
        value={text}
        placeholder={mixed ? MIXED : ''}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-invalid={err || undefined}
        style={err ? { borderColor: 'var(--fm-danger)' } : undefined}
        title={err ? tr(lang, 'Valor no válido', 'Invalid value') : undefined}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') setText(mixed ? '' : fmt(value));
        }}
      />
      {suffix && <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 11, color: 'var(--ink-secondary)', pointerEvents: 'none' }}>{suffix}</span>}
    </div>
  );
}

export function TextField({ value, onCommit, mixed, readOnly, multiline, ariaLabel }: { value: string; onCommit: (v: string) => void; mixed?: boolean; readOnly?: boolean; multiline?: boolean; ariaLabel?: string }) {
  const [text, setText] = useState(mixed ? '' : value);
  useEffect(() => setText(mixed ? '' : value), [value, mixed]);
  const commit = () => {
    if (!readOnly && text !== (mixed ? '' : value)) onCommit(text);
  };
  if (multiline)
    return (
      <textarea
        className="input"
        style={{ height: 64, padding: 6, resize: 'vertical' }}
        value={text}
        placeholder={mixed ? MIXED : ''}
        readOnly={readOnly}
        aria-label={ariaLabel}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.stopPropagation()}
      />
    );
  return (
    <input
      className="input"
      value={text}
      placeholder={mixed ? MIXED : ''}
      readOnly={readOnly}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

export function colorCss(c: string, dark: boolean): string {
  if (c === 'ByLayer' || c === 'ByBlock') return 'transparent';
  return displayColor(c, dark);
}

interface ColorPickerProps {
  value: string;
  onChange: (c: string) => void;
  lang: Lang;
  allowByLayer?: boolean;
  mixed?: boolean;
  ariaLabel?: string;
}

function selectedColorIndex(value: string, mixed?: boolean): number | null {
  const match = !mixed && /^aci:(\d+)$/.exec(value);
  const index = match ? Number(match[1]) : 0;
  return Number.isInteger(index) && index >= 1 && index <= 255 ? index : null;
}

/** Selector de color: PorCapa, PorBloque, índice ACI y color verdadero. */
export function ColorPicker({ value, onChange, lang, allowByLayer = true, mixed, ariaLabel }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  const dark = document.documentElement.dataset.theme === 'noche' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <div className="color-picker">
      <button ref={triggerRef} type="button" className="input color-picker__trigger" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined} aria-label={ariaLabel}>
        <span className="swatch" aria-hidden="true" style={{ background: mixed ? 'repeating-linear-gradient(45deg,var(--line),var(--line) 2px,transparent 2px,transparent 4px)' : colorCss(value, dark) }} />
        <span className="color-picker__value">{mixed ? MIXED : colorLabel(value, lang)}</span>
      </button>
      {open && createPortal(
        <ColorPickerDialog id={popupId} value={value} onChange={onChange} lang={lang} allowByLayer={allowByLayer} mixed={mixed} triggerRef={triggerRef} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </div>
  );
}

function ColorPickerDialog({ id, value, onChange, lang, allowByLayer, mixed, triggerRef, onClose }: ColorPickerProps & { id: string; triggerRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const resizeFocus = useRef<string | null>(null);
  const selectedAci = selectedColorIndex(value, mixed);
  const inheritedSelected = !mixed && allowByLayer && (value === 'ByLayer' || value === 'ByBlock');
  const initialFocus = useRef(selectedAci !== null ? `[data-aci="${selectedAci}"]` : inheritedSelected ? `[data-inherited="${value}"]` : '[data-aci="1"]');
  // Foco y selección son independientes: recorrer la paleta nunca modifica el dibujo.
  const [basicTabStop, setBasicTabStop] = useState(selectedAci !== null && selectedAci <= 9 ? selectedAci : 1);
  const [extendedTabStop, setExtendedTabStop] = useState(selectedAci !== null && selectedAci >= 10 ? selectedAci : 10);
  const [aciText, setAciText] = useState(selectedAci === null ? '' : String(selectedAci));
  const [aciError, setAciError] = useState(false);
  const [placement, setPlacement] = useState({ width: Math.min(360, window.innerWidth - 16), left: 8, top: 8, maxHeight: window.innerHeight - 16 });
  const columns = placement.width >= 328 ? 6 : 5;
  const errorId = `${id}-aci-error`;
  useModalFocusTrap(dialogRef, onClose, triggerRef);

  useLayoutEffect(() => {
    const place = () => {
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = Math.min(360, viewportWidth - 16);
      const maxHeight = viewportHeight - 16;
      const trigger = triggerRef.current?.getBoundingClientRect();
      const height = Math.min(dialogRef.current?.getBoundingClientRect().height ?? 0, maxHeight);
      const active = document.activeElement;
      resizeFocus.current = active instanceof HTMLElement && dialogRef.current?.contains(active) ? active.dataset.aci ?? null : null;
      const below = (trigger?.bottom ?? y) + 6;
      const above = (trigger?.top ?? y) - height - 6;
      const top = Math.max(y + 8, Math.min(below + height <= y + viewportHeight - 8 ? below : above, y + viewportHeight - height - 8));
      const left = Math.max(x + 8, Math.min((trigger?.right ?? x + width + 8) - width, x + viewportWidth - width - 8));
      setPlacement((previous) => previous.width === width && previous.left === left && previous.top === top && previous.maxHeight === maxHeight ? previous : { width, left, top, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (dialogRef.current) observer?.observe(dialogRef.current);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      observer?.disconnect();
    };
  }, [triggerRef]);

  useLayoutEffect(() => {
    const initial = dialogRef.current?.querySelector<HTMLElement>(initialFocus.current);
    initial?.focus({ preventScroll: true });
    initial?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  useLayoutEffect(() => {
    // Cambiar las filas al girar el teléfono no debe perder el color enfocado.
    if (resizeFocus.current) dialogRef.current?.querySelector<HTMLElement>(`[data-aci="${resizeFocus.current}"]`)?.focus({ preventScroll: true });
    resizeFocus.current = null;
  }, [columns]);

  const commit = (color: string) => {
    onChange(color);
    onClose();
  };
  const applyAci = () => {
    const number = Number(aciText.trim());
    if (!/^\d+$/.test(aciText.trim()) || !Number.isInteger(number) || number < 1 || number > 255) {
      setAciError(true);
      return;
    }
    commit(`aci:${number}`);
  };
  const moveAci = (event: React.KeyboardEvent, current: number, min: number, max: number) => {
    let next = current;
    if (event.key === 'ArrowRight') next = Math.min(max, current + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(min, current - 1);
    else if (event.key === 'ArrowDown') next = Math.min(max, current + columns);
    else if (event.key === 'ArrowUp') next = Math.max(min, current - columns);
    else if (event.key === 'Home') next = Math.floor((current - min) / columns) * columns + min;
    else if (event.key === 'End') next = Math.min(max, Math.floor((current - min) / columns) * columns + columns - 1 + min);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      commit(`aci:${current}`);
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    const cell = dialogRef.current?.querySelector<HTMLElement>(`[data-aci="${next}"]`);
    cell?.focus({ preventScroll: true });
    cell?.scrollIntoView?.({ block: 'nearest' });
  };
  const palette = (min: number, max: number, label: string, extended = false) => {
    const tabStop = extended ? extendedTabStop : basicTabStop;
    const rows = Array.from({ length: Math.ceil((max - min + 1) / columns) }, (_, row) => Array.from({ length: Math.min(columns, max - min + 1 - row * columns) }, (_, column) => min + row * columns + column));
    return (
      <section className={`color-picker__palette${extended ? ' color-picker__palette--extended' : ''}`}>
        <h3>{label}</h3>
        <div className={`color-picker__grid${extended ? ' color-picker__grid--scroll' : ''}`} role="grid" aria-label={label} aria-colcount={columns} aria-rowcount={rows.length}>
          {rows.map((row) => (
            <div key={row[0]} role="row" className="color-picker__row" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {row.map((aci) => {
                const label = `ACI ${aci} · ${aci <= 9 ? colorLabel(`aci:${aci}`, lang) : aciToHex(aci).toUpperCase()}`;
                return (
                  <button
                    key={aci} type="button" role="gridcell" className="color-picker__cell" aria-label={label} title={label} aria-selected={selectedAci === aci} data-aci={aci} tabIndex={tabStop === aci ? 0 : -1}
                    onFocus={() => (extended ? setExtendedTabStop(aci) : setBasicTabStop(aci))} onKeyDown={(event) => moveAci(event, aci, min, max)} onClick={() => commit(`aci:${aci}`)}
                  >
                    <span className="color-picker__chip" aria-hidden="true" style={{ background: aci === 7 ? 'linear-gradient(135deg,#fff 50%,#14171a 50%)' : aciToHex(aci) }} />
                    <span aria-hidden="true">{aci}</span>
                    {selectedAci === aci && <span className="color-picker__selected" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    );
  };
  return (
    <div className="color-picker__overlay" onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} id={id} className="color-picker__dialog" style={placement} role="dialog" aria-modal="true" aria-label={tr(lang, 'Seleccionar color', 'Select color')} tabIndex={-1}>
        <header className="color-picker__head">
          <h2>{tr(lang, 'Seleccionar color', 'Select color')}</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{tr(lang, 'Cerrar', 'Close')}</button>
        </header>
        {allowByLayer && (
          <div className="color-picker__inherited">
            {['ByLayer', 'ByBlock'].map((color) => (
              <button key={color} type="button" className="btn" data-inherited={color} aria-pressed={!mixed && value === color} onClick={() => commit(color)}>{colorLabel(color, lang)}</button>
            ))}
          </div>
        )}
        {palette(1, 9, tr(lang, 'Colores ACI básicos', 'Basic ACI colors'))}
        {palette(10, 255, tr(lang, 'Colores ACI ampliados', 'Extended ACI colors'), true)}
        <div className="color-picker__custom">
          <div className="color-picker__precise">
            <label htmlFor={`${id}-aci`}>ACI (1–255)</label>
            <div className="color-picker__aci-entry">
              <input id={`${id}-aci`} className="input input--mono" type="text" inputMode="numeric" autoComplete="off" aria-label={tr(lang, 'Número ACI (1–255)', 'ACI number (1–255)')} aria-invalid={aciError || undefined} aria-describedby={aciError ? errorId : undefined} value={aciText} placeholder="1–255" onChange={(event) => { setAciText(event.target.value); setAciError(false); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); applyAci(); } }} />
              <button type="button" className="btn" onClick={applyAci}>{tr(lang, 'Aplicar', 'Apply')}</button>
            </div>
          </div>
          <label className="color-picker__true-color">
            <span>{tr(lang, 'Color verdadero', 'True color')}</span>
            <input type="color" value={value.startsWith('#') ? value : selectedAci !== null ? aciToHex(selectedAci) : '#7657d5'} onChange={(event) => onChange(event.target.value)} />
          </label>
          {aciError && <p className="color-picker__error" id={errorId} role="alert">{tr(lang, 'Introduce un número ACI del 1 al 255.', 'Enter an ACI number from 1 to 255.')}</p>}
        </div>
      </div>
    </div>
  );
}

export function LineweightSelect({ value, onChange, lang, allowBy = true, mixed, ariaLabel }: { value: number; onChange: (v: number) => void; lang: Lang; allowBy?: boolean; mixed?: boolean; ariaLabel?: string }) {
  return (
    <select className="select" value={mixed ? 'mixed' : String(value)} onChange={(e) => onChange(Number(e.target.value))} aria-label={ariaLabel}>
      {mixed && <option value="mixed">{MIXED}</option>}
      {allowBy && <option value="-1">{tr(lang, 'PorCapa', 'ByLayer')}</option>}
      {allowBy && <option value="-2">{tr(lang, 'PorBloque', 'ByBlock')}</option>}
      <option value="-3">{tr(lang, 'Por defecto', 'Default')}</option>
      {LINEWEIGHTS.map((w) => (
        <option key={w} value={w}>
          {(w / 100).toFixed(2)} mm
        </option>
      ))}
    </select>
  );
}

export function LinetypeSelect({ doc, value, onChange, lang, allowBy = true, mixed, ariaLabel }: { doc: CadDocument; value: string; onChange: (v: string) => void; lang: Lang; allowBy?: boolean; mixed?: boolean; ariaLabel?: string }) {
  const lts = [...doc.data.linetypes.values()];
  return (
    <select className="select" value={mixed ? 'mixed' : value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
      {mixed && <option value="mixed">{MIXED}</option>}
      {allowBy && <option value="ByLayer">{tr(lang, 'PorCapa', 'ByLayer')}</option>}
      {allowBy && <option value="ByBlock">{tr(lang, 'PorBloque', 'ByBlock')}</option>}
      {lts.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  /** contador opcional a la derecha de la etiqueta (p. ej. número de resultados) */
  count?: number;
}

/**
 * Control segmentado: pista hundida con la opción activa elevada.
 * `tabs` (por defecto) expone pestañas que cambian de vista; `radio` expone una elección única.
 * Teclado: flechas, Inicio y Fin mueven el foco y la selección; sólo la opción activa está en el orden de Tab.
 */
export function Segmented<T extends string>({ value, options, onChange, label, kind = 'tabs', size = 'md', controls }: { value: T; options: readonly SegmentedOption<T>[]; onChange: (id: T) => void; label: string; kind?: 'tabs' | 'radio'; size?: 'sm' | 'md'; controls?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tabs = kind === 'tabs';
  const activeIndex = options.findIndex((o) => o.id === value);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('.seg__item') ?? []);
    const from = items.findIndex((el) => el === document.activeElement);
    const next = nextSegmentIndex(event.key, from, options.map((o) => !o.disabled));
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
    onChange(options[next].id);
  };
  return (
    <div ref={ref} className={`seg${size === 'sm' ? ' seg--sm' : ''}`} role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            aria-selected={tabs ? selected : undefined}
            aria-checked={tabs ? undefined : selected}
            aria-controls={tabs ? controls : undefined}
            tabIndex={selected || (activeIndex < 0 && i === 0) ? 0 : -1}
            className={`seg__item${selected ? ' is-active' : ''}`}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.id)}
          >
            {o.label}
            {o.count !== undefined && <span className="seg__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

