import { useEffect, useRef, useState } from 'react';
import { aciToHex, colorLabel, displayColor } from '../document/colors';
import type { CadDocument } from '../document/document';
import { LINEWEIGHTS } from '../document/types';
import type { Lang } from '../commands/types';
import { evaluate } from '../lib/expr';

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
      {suffix && <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 11, color: 'var(--ink-muted)', pointerEvents: 'none' }}>{suffix}</span>}
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

/** Selector de color: PorCapa, PorBloque, índice ACI y color verdadero. */
export function ColorPicker({ value, onChange, lang, allowByLayer = true, mixed }: { value: string; onChange: (c: string) => void; lang: Lang; allowByLayer?: boolean; mixed?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const dark = document.documentElement.dataset.theme === 'noche' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const std = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="input" style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }} onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="swatch" style={{ background: mixed ? 'repeating-linear-gradient(45deg,var(--line),var(--line) 2px,transparent 2px,transparent 4px)' : colorCss(value, dark) }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mixed ? MIXED : colorLabel(value, lang)}</span>
      </button>
      {open && (
        <div className="popover" style={{ right: 0, top: 34, width: 244 }} role="dialog" aria-label={tr(lang, 'Seleccionar color', 'Select color')}>
          {allowByLayer && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {['ByLayer', 'ByBlock'].map((c) => (
                <button key={c} className={`btn btn--sm${value === c ? ' btn--accent' : ''}`} onClick={() => (onChange(c), setOpen(false))}>
                  {colorLabel(c, lang)}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 3, marginBottom: 6 }}>
            {std.map((i) => (
              <button key={i} title={`${colorLabel(`aci:${i}`, lang)} (${i})`} className="swatch" style={{ width: 22, height: 22, background: i === 7 ? 'linear-gradient(135deg,#fff 50%,#14171a 50%)' : aciToHex(i), outline: value === `aci:${i}` ? '2px solid var(--fm-accent)' : undefined }} onClick={() => (onChange(`aci:${i}`), setOpen(false))} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 1, marginBottom: 6 }}>
            {Array.from({ length: 240 }, (_, k) => 10 + k).map((i) => (
              <button key={i} title={`ACI ${i}`} style={{ height: 9, background: aciToHex(i), outline: value === `aci:${i}` ? '2px solid var(--fm-accent)' : undefined }} onClick={() => (onChange(`aci:${i}`), setOpen(false))} />
            ))}
          </div>
          <label className="field" style={{ gridTemplateColumns: '1fr auto' }}>
            <span className="eyebrow">{tr(lang, 'Color verdadero', 'True color')}</span>
            <input type="color" value={value.startsWith('#') ? value : value.startsWith('aci:') ? aciToHex(Number(value.slice(4))) : '#7657d5'} onChange={(e) => onChange(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}

export function LineweightSelect({ value, onChange, lang, allowBy = true, mixed }: { value: number; onChange: (v: number) => void; lang: Lang; allowBy?: boolean; mixed?: boolean }) {
  return (
    <select className="select" value={mixed ? 'mixed' : String(value)} onChange={(e) => onChange(Number(e.target.value))}>
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

export function LinetypeSelect({ doc, value, onChange, lang, allowBy = true, mixed }: { doc: CadDocument; value: string; onChange: (v: string) => void; lang: Lang; allowBy?: boolean; mixed?: boolean }) {
  const lts = [...doc.data.linetypes.values()];
  return (
    <select className="select" value={mixed ? 'mixed' : value} onChange={(e) => onChange(e.target.value)}>
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
