import { useState } from 'react';
import type { Editor } from '../../editor/editor';
import type { SnapType } from '../../model/registry';
import { ALL_SNAP_TYPES } from '../../model/registry';
import { SNAP_LABELS } from '../../render/overlayRenderer';
import { Dialog } from '../Dialogs';
import { NumberField, tr } from '../controls';

export function DraftingSettings({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const lang = editor.lang;
  const [tab, setTab] = useState<'osnap' | 'polar' | 'grid' | 'dyn' | 'selection' | 'display'>('osnap');
  const p = editor.prefs;
  const snap = p.snap;
  const setSnap = (patch: Partial<typeof snap>) => editor.setPrefs({ snap: { ...snap, ...patch } });
  const tabs: [typeof tab, string][] = [
    ['osnap', tr(lang, 'Referencia a objetos', 'Object snap')],
    ['polar', tr(lang, 'Rastreo polar', 'Polar tracking')],
    ['grid', tr(lang, 'Rejilla y forzcursor', 'Grid & snap')],
    ['dyn', tr(lang, 'Entrada dinámica', 'Dynamic input')],
    ['selection', tr(lang, 'Selección', 'Selection')],
    ['display', tr(lang, 'Visualización', 'Display')],
  ];
  return (
    <Dialog title={tr(lang, 'Parámetros de dibujo', 'Drafting settings')} onClose={onClose} lang={lang} footer={<button className="btn btn--primary" onClick={onClose}>{tr(lang, 'Listo', 'Done')}</button>}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }} role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`btn btn--sm${tab === id ? ' btn--accent' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'osnap' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <input type="checkbox" checked={snap.osnap} onChange={(e) => setSnap({ osnap: e.target.checked })} /> {tr(lang, 'Referencia a objetos activada (F3)', 'Object snap on (F3)')}
          </label>
          <label>
            <input type="checkbox" checked={snap.otrack} onChange={(e) => setSnap({ otrack: e.target.checked })} /> {tr(lang, 'Rastreo de referencia a objetos (F11)', 'Object snap tracking (F11)')}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6 }}>
            {ALL_SNAP_TYPES.map((t: SnapType) => (
              <label key={t}>
                <input
                  type="checkbox"
                  checked={snap.types.includes(t)}
                  onChange={(e) => setSnap({ types: e.target.checked ? [...snap.types, t] : snap.types.filter((x) => x !== t) })}
                />{' '}
                {SNAP_LABELS[t][lang]}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn--sm" onClick={() => setSnap({ types: [...ALL_SNAP_TYPES] })}>
              {tr(lang, 'Seleccionar todo', 'Select all')}
            </button>
            <button className="btn btn--sm" onClick={() => setSnap({ types: [] })}>
              {tr(lang, 'Borrar todo', 'Clear all')}
            </button>
          </div>
          <div className="field">
            <label>{tr(lang, 'Apertura (px)', 'Aperture (px)')}</label>
            <NumberField lang={lang} value={snap.aperturePx} onCommit={(v) => setSnap({ aperturePx: Math.max(2, Math.min(50, v)) })} />
          </div>
          <p className="eyebrow">{tr(lang, 'Tab alterna candidatos · referencias temporales: escribe END, MID, CEN, INT, PER, TAN, NEA… durante un comando', 'Tab cycles candidates · temporary overrides: type END, MID, CEN, INT, PER, TAN, NEA… inside a command')}</p>
        </div>
      )}
      {tab === 'polar' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <input type="checkbox" checked={snap.polar} onChange={(e) => setSnap({ polar: e.target.checked, ortho: e.target.checked ? false : snap.ortho })} /> {tr(lang, 'Rastreo polar (F10)', 'Polar tracking (F10)')}
          </label>
          <label>
            <input type="checkbox" checked={snap.ortho} onChange={(e) => setSnap({ ortho: e.target.checked, polar: e.target.checked ? false : snap.polar })} /> {tr(lang, 'Modo Orto (F8, Mayús invierte temporalmente)', 'Ortho mode (F8, Shift toggles temporarily)')}
          </label>
          <div className="field">
            <label>{tr(lang, 'Ángulo incremental', 'Increment angle')}</label>
            <select className="select" value={Math.round((snap.polarIncrement * 180) / Math.PI)} onChange={(e) => setSnap({ polarIncrement: (Number(e.target.value) * Math.PI) / 180 })}>
              {[90, 45, 30, 22.5, 18, 15, 10, 5].map((a) => (
                <option key={a} value={a}>
                  {a}°
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{tr(lang, 'Ángulos adicionales (°, coma)', 'Additional angles (°, comma)')}</label>
            <input
              className="input"
              defaultValue={snap.polarAdditional.map((a) => ((a * 180) / Math.PI).toFixed(2)).join(', ')}
              onBlur={(e) => setSnap({ polarAdditional: e.target.value.split(',').map((s) => parseFloat(s)).filter(Number.isFinite).map((d) => (d * Math.PI) / 180) })}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <label>
            <input type="checkbox" checked={snap.trackAllPolar} onChange={(e) => setSnap({ trackAllPolar: e.target.checked })} /> {tr(lang, 'Rastreo de objetos con todos los ángulos polares', 'Object tracking with all polar angles')}
          </label>
          <div className="field">
            <label>{tr(lang, 'Tolerancia de rastreo (px)', 'Tracking tolerance (px)')}</label>
            <NumberField lang={lang} value={snap.trackingTolPx} onCommit={(v) => setSnap({ trackingTolPx: Math.max(2, Math.min(40, v)) })} />
          </div>
        </div>
      )}
      {tab === 'grid' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <input type="checkbox" checked={p.grid.on} onChange={(e) => editor.setPrefs({ grid: { ...p.grid, on: e.target.checked } })} /> {tr(lang, 'Mostrar rejilla (F7)', 'Show grid (F7)')}
          </label>
          <label>
            <input type="checkbox" checked={p.grid.adaptive} onChange={(e) => editor.setPrefs({ grid: { ...p.grid, adaptive: e.target.checked } })} /> {tr(lang, 'Rejilla adaptativa al zoom', 'Adaptive grid')}
          </label>
          <div className="field">
            <label>{tr(lang, 'Espaciado de rejilla', 'Grid spacing')}</label>
            <NumberField lang={lang} value={p.grid.spacing} onCommit={(v) => v > 0 && editor.setPrefs({ grid: { ...p.grid, spacing: v } })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Línea principal cada', 'Major line every')}</label>
            <NumberField lang={lang} value={p.grid.majorEvery} onCommit={(v) => editor.setPrefs({ grid: { ...p.grid, majorEvery: Math.max(1, Math.round(v)) } })} />
          </div>
          <label>
            <input type="checkbox" checked={snap.gridSnap} onChange={(e) => setSnap({ gridSnap: e.target.checked })} /> {tr(lang, 'Forzcursor de rejilla (F9)', 'Grid snap (F9)')}
          </label>
          <div className="field">
            <label>{tr(lang, 'Forzcursor X', 'Snap X')}</label>
            <NumberField lang={lang} value={snap.snapSpacing.x} onCommit={(v) => v > 0 && setSnap({ snapSpacing: { ...snap.snapSpacing, x: v } })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Forzcursor Y', 'Snap Y')}</label>
            <NumberField lang={lang} value={snap.snapSpacing.y} onCommit={(v) => v > 0 && setSnap({ snapSpacing: { ...snap.snapSpacing, y: v } })} />
          </div>
        </div>
      )}
      {tab === 'dyn' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <input type="checkbox" checked={p.dynamicInput.on} onChange={(e) => editor.setPrefs({ dynamicInput: { ...p.dynamicInput, on: e.target.checked } })} /> {tr(lang, 'Entrada dinámica junto al cursor (F12)', 'Dynamic input near cursor (F12)')}
          </label>
          <label>
            <input type="checkbox" checked={p.dynamicInput.relative} onChange={(e) => editor.setPrefs({ dynamicInput: { ...p.dynamicInput, relative: e.target.checked } })} /> {tr(lang, 'Coordenadas relativas por defecto para el segundo punto (# fuerza absolutas)', 'Relative coordinates by default for next points (# forces absolute)')}
          </label>
          <label>
            <input type="checkbox" checked={p.dynamicInput.showTooltips} onChange={(e) => editor.setPrefs({ dynamicInput: { ...p.dynamicInput, showTooltips: e.target.checked } })} /> {tr(lang, 'Etiquetas de referencia y rastreo', 'Snap and tracking tooltips')}
          </label>
        </div>
      )}
      {tab === 'selection' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="field">
            <label>{tr(lang, 'Caja de designación (px)', 'Pickbox (px)')}</label>
            <NumberField lang={lang} value={p.pickboxPx} onCommit={(v) => editor.setPrefs({ pickboxPx: Math.max(2, Math.min(20, v)) })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Tamaño de grips (px)', 'Grip size (px)')}</label>
            <NumberField lang={lang} value={p.gripSizePx} onCommit={(v) => editor.setPrefs({ gripSizePx: Math.max(4, Math.min(16, v)) })} />
          </div>
          <label>
            <input type="checkbox" checked={p.selectionCycling} onChange={(e) => editor.setPrefs({ selectionCycling: e.target.checked })} /> {tr(lang, 'Ciclo de selección para objetos superpuestos', 'Selection cycling for overlapping objects')}
          </label>
          <label>
            <input type="checkbox" checked={p.rolloverHighlight} onChange={(e) => editor.setPrefs({ rolloverHighlight: e.target.checked })} /> {tr(lang, 'Resaltar al pasar el cursor', 'Rollover highlighting')}
          </label>
        </div>
      )}
      {tab === 'display' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="field">
            <label>{tr(lang, 'Tamaño del cursor en cruz (%)', 'Crosshair size (%)')}</label>
            <NumberField lang={lang} value={p.crosshairSize} onCommit={(v) => editor.setPrefs({ crosshairSize: Math.max(1, Math.min(100, v)) })} />
          </div>
          <div className="field">
            <label>{tr(lang, 'Fondo del lienzo', 'Canvas background')}</label>
            <select className="select" value={p.canvasBackground} onChange={(e) => editor.setPrefs({ canvasBackground: e.target.value as typeof p.canvasBackground })}>
              <option value="auto">{tr(lang, 'Según tema', 'Follow theme')}</option>
              <option value="paper">{tr(lang, 'Papel técnico', 'Technical paper')}</option>
              <option value="charcoal">{tr(lang, 'Carbón', 'Charcoal')}</option>
              <option value="black">{tr(lang, 'Negro', 'Black')}</option>
            </select>
          </div>
          <label>
            <input type="checkbox" checked={p.lineweightDisplay} onChange={(e) => editor.setPrefs({ lineweightDisplay: e.target.checked })} /> {tr(lang, 'Mostrar grosores de línea', 'Display lineweights')}
          </label>
          <div className="field">
            <label>{tr(lang, 'Autoguardado (min)', 'Autosave (min)')}</label>
            <NumberField lang={lang} value={p.autosaveMinutes} onCommit={(v) => editor.setPrefs({ autosaveMinutes: Math.max(0, Math.min(120, v)) })} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
