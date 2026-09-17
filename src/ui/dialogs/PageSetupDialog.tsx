import { useEffect, useMemo, useState } from 'react';
import { PAPER_SIZES, paperExtents, STANDARD_SCALES, unitConversion } from '../../document/defaults';
import type { PageSetup } from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import type { Editor } from '../../editor/editor';
import { exportSvg, pageFor, planSheet } from '../../output/plot';
import { Dialog } from '../Dialogs';
import { NumberField, Toggle, tr } from '../controls';

const CUSTOM = 'Custom';

/**
 * Configuración de página y trazado de la hoja actual. La vista previa es el mismo SVG
 * vectorial que se exporta, así que lo que se ve es lo que se traza.
 */
export function PageSetupDialog({ editor, plot, onClose }: { editor: Editor; plot: boolean; onClose: () => void }) {
  const lang = editor.lang;
  const doc = editor.doc;
  const spaceId = editor.space;
  const layout = doc.data.layouts.get(spaceId);
  const sheetName = layout?.name ?? (spaceId === MODEL_SPACE_ID ? tr(lang, 'Modelo', 'Model') : (doc.data.blocks.get(spaceId)?.name ?? ''));
  const [page, setPage] = useState<PageSetup>(() => structuredClone(pageFor(doc, spaceId)));
  const set = (patch: Partial<PageSetup>) => setPage((p) => ({ ...p, ...patch }));
  const scales = doc.settings.annotationScales?.length ? doc.settings.annotationScales : STANDARD_SCALES;
  // en presentaciones el papel está en mm; en el modelo se convierten las unidades del dibujo
  const unitToMm = layout ? 1 : unitConversion(doc.settings.units, 'mm');
  const scaleName = page.plotScale <= 0 ? 'fit' : (scales.find((s) => Math.abs((s.paper / s.drawing) * unitToMm - page.plotScale) < 1e-9)?.name ?? 'custom');

  const [preview, setPreview] = useState<{ url: string; scale: number; warnings: string[] } | null>(null);
  const key = useMemo(() => JSON.stringify(page), [page]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const pc = { doc, ctx: editor.ctx, index: editor.index };
        const plan = planSheet(pc, spaceId, page);
        const svg = exportSvg(pc, spaceId, page).data;
        setPreview({ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, scale: plan.scale, warnings: plan.warnings });
      } catch (err) {
        setPreview({ url: '', scale: 0, warnings: [err instanceof Error ? err.message : String(err)] });
      }
    }, 120);
    return () => clearTimeout(t);
  }, [key, doc.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    doc.transact('PAGESETUP', (tx) => {
      if (layout) tx.update('layouts', layout.id, { page });
      else tx.setSettings({ modelPage: page });
    });
  };
  const paperOptions = PAPER_SIZES.some((p) => p.name === page.paper) ? page.paper : CUSTOM;
  const ext = paperExtents(page);
  const windowFromView = () => {
    const b = editor.view.visibleBox();
    set({ plotArea: 'window', window: { min: { x: b.minX, y: b.minY }, max: { x: b.maxX, y: b.maxY } } });
  };
  const fmtScale = (k: number) => {
    if (!(k > 0)) return '—';
    const ratio = k / unitToMm;
    return ratio >= 1 ? `${Math.round(ratio * 1000) / 1000}:1` : `1:${Math.round((1 / ratio) * 1000) / 1000}`;
  };

  return (
    <Dialog
      wide
      lang={lang}
      title={`${plot ? tr(lang, 'Trazar', 'Plot') : tr(lang, 'Configurar página', 'Page setup')} · ${sheetName}`}
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>{tr(lang, 'PDF y SVG vectoriales; las imágenes y calcos PDF se incrustan rasterizados.', 'Vector PDF and SVG; images and PDF underlays are embedded as rasters.')}</span>
          <button className="btn" onClick={onClose}>
            {tr(lang, 'Cancelar', 'Cancel')}
          </button>
          {plot ? (
            <>
              <button className="btn" onClick={() => (apply(), onClose(), editor.command('EXPORTSVG'))}>
                {tr(lang, 'Exportar SVG', 'Export SVG')}
              </button>
              <button className="btn btn--primary" onClick={() => (apply(), onClose(), editor.command('EXPORTPDF', ['Current']))}>
                {tr(lang, 'Trazar PDF', 'Plot PDF')}
              </button>
            </>
          ) : (
            <button className="btn btn--primary" onClick={() => (apply(), onClose())}>
              {tr(lang, 'Aceptar', 'OK')}
            </button>
          )}
        </>
      }
    >
      <div className="page-setup">
        <div className="page-setup__form">
          <fieldset>
            <legend className="eyebrow">{tr(lang, 'Papel', 'Paper')}</legend>
            <div className="field">
              <label>{tr(lang, 'Tamaño', 'Size')}</label>
              <select
                className="select"
                value={paperOptions}
                onChange={(e) => {
                  const p = PAPER_SIZES.find((x) => x.name === e.target.value);
                  set(p ? { paper: p.name, width: p.width, height: p.height } : { paper: CUSTOM });
                }}
              >
                {PAPER_SIZES.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.width} × {p.height} mm)
                  </option>
                ))}
                <option value={CUSTOM}>{tr(lang, 'Personalizado…', 'Custom…')}</option>
              </select>
            </div>
            {paperOptions === CUSTOM && (
              <div className="page-setup__pair">
                <NumberField lang={lang} ariaLabel={tr(lang, 'Ancho', 'Width')} value={page.width} suffix="mm" onCommit={(v) => set({ width: Math.max(10, v) })} />
                <NumberField lang={lang} ariaLabel={tr(lang, 'Alto', 'Height')} value={page.height} suffix="mm" onCommit={(v) => set({ height: Math.max(10, v) })} />
              </div>
            )}
            <div className="field">
              <label>{tr(lang, 'Orientación', 'Orientation')}</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['landscape', 'portrait'] as const).map((o) => (
                  <button key={o} className={`btn btn--sm${page.orientation === o ? ' btn--accent' : ''}`} aria-pressed={page.orientation === o} onClick={() => set({ orientation: o })}>
                    {o === 'landscape' ? tr(lang, 'Horizontal', 'Landscape') : tr(lang, 'Vertical', 'Portrait')}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{tr(lang, 'Márgenes (sup · der · inf · izq)', 'Margins (top · right · bottom · left)')}</label>
              <div className="page-setup__quad">
                {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                  <NumberField key={side} lang={lang} ariaLabel={side} value={page.margins[side]} onCommit={(v) => set({ margins: { ...page.margins, [side]: Math.max(0, Math.min(v, Math.min(ext.width, ext.height) / 3)) } })} />
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="eyebrow">{tr(lang, 'Área y escala', 'Area and scale')}</legend>
            <div className="field">
              <label>{tr(lang, 'Qué trazar', 'What to plot')}</label>
              <select className="select" value={page.plotArea} onChange={(e) => set({ plotArea: e.target.value as PageSetup['plotArea'], plotScale: e.target.value === 'layout' ? 1 : page.plotScale })}>
                {layout && <option value="layout">{tr(lang, 'Presentación', 'Layout')}</option>}
                <option value="extents">{tr(lang, 'Extensión', 'Extents')}</option>
                <option value="window">{tr(lang, 'Ventana', 'Window')}</option>
              </select>
            </div>
            {page.plotArea === 'window' && (
              <>
                <div className="page-setup__quad">
                  <NumberField lang={lang} ariaLabel="X min" value={page.window?.min.x ?? 0} onCommit={(v) => set({ window: { min: { x: v, y: page.window?.min.y ?? 0 }, max: page.window?.max ?? { x: 100, y: 100 } } })} />
                  <NumberField lang={lang} ariaLabel="Y min" value={page.window?.min.y ?? 0} onCommit={(v) => set({ window: { min: { x: page.window?.min.x ?? 0, y: v }, max: page.window?.max ?? { x: 100, y: 100 } } })} />
                  <NumberField lang={lang} ariaLabel="X max" value={page.window?.max.x ?? 100} onCommit={(v) => set({ window: { min: page.window?.min ?? { x: 0, y: 0 }, max: { x: v, y: page.window?.max.y ?? 100 } } })} />
                  <NumberField lang={lang} ariaLabel="Y max" value={page.window?.max.y ?? 100} onCommit={(v) => set({ window: { min: page.window?.min ?? { x: 0, y: 0 }, max: { x: page.window?.max.x ?? 100, y: v } } })} />
                </div>
                <button className="btn btn--sm" onClick={windowFromView}>
                  {tr(lang, 'Usar la vista actual', 'Use current view')}
                </button>
              </>
            )}
            <div className="field">
              <label>{tr(lang, 'Escala', 'Scale')}</label>
              <select
                className="select"
                disabled={page.plotArea === 'layout'}
                value={page.plotArea === 'layout' ? '1:1' : scaleName}
                onChange={(e) => {
                  if (e.target.value === 'fit') return set({ plotScale: 0 });
                  const s = scales.find((x) => x.name === e.target.value);
                  if (s) set({ plotScale: (s.paper / s.drawing) * unitToMm });
                }}
              >
                <option value="fit">{tr(lang, 'Ajustar al papel', 'Fit to paper')}</option>
                {scaleName === 'custom' && <option value="custom">{fmtScale(page.plotScale)}</option>}
                {scales.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Toggle checked={page.center} onChange={(v) => set({ center: v })} label={tr(lang, 'Centrar en el papel', 'Center on paper')} />
            </div>
            <div className="field">
              <label>{tr(lang, 'Desfase X · Y (mm)', 'Offset X · Y (mm)')}</label>
              <div className="page-setup__pair">
                <NumberField lang={lang} ariaLabel="X" value={page.offset.x} onCommit={(v) => set({ offset: { ...page.offset, x: v } })} />
                <NumberField lang={lang} ariaLabel="Y" value={page.offset.y} onCommit={(v) => set({ offset: { ...page.offset, y: v } })} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="eyebrow">{tr(lang, 'Estilo de trazado', 'Plot style')}</legend>
            <div className="field">
              <label>{tr(lang, 'Color', 'Color')}</label>
              <select className="select" value={page.plotStyle} onChange={(e) => set({ plotStyle: e.target.value as PageSetup['plotStyle'] })}>
                <option value="color">{tr(lang, 'Color', 'Color')}</option>
                <option value="monochrome">{tr(lang, 'Monocromo', 'Monochrome')}</option>
                <option value="grayscale">{tr(lang, 'Escala de grises', 'Grayscale')}</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Toggle checked={page.plotLineweights} onChange={(v) => set({ plotLineweights: v })} label={tr(lang, 'Trazar grosores de línea', 'Plot lineweights')} />
              <Toggle checked={page.plotTransparency} onChange={(v) => set({ plotTransparency: v })} label={tr(lang, 'Trazar transparencia', 'Plot transparency')} />
              {layout && <Toggle checked={page.plotPaperspaceLast} onChange={(v) => set({ plotPaperspaceLast: v })} label={tr(lang, 'Espacio papel al final', 'Plot paper space last')} />}
            </div>
          </fieldset>
        </div>

        <div className="page-setup__preview">
          <div className="page-setup__sheet" style={{ aspectRatio: `${ext.width} / ${ext.height}` }}>
            {preview?.url ? <img src={preview.url} alt={tr(lang, 'Vista previa del trazado', 'Plot preview')} /> : null}
          </div>
          <div className="page-setup__meta">
            <span>
              {page.paper === CUSTOM ? tr(lang, 'Personalizado', 'Custom') : page.paper} · {Math.round(ext.width * 10) / 10} × {Math.round(ext.height * 10) / 10} mm
            </span>
            <span>
              {tr(lang, 'Escala efectiva', 'Effective scale')}: <strong>{page.plotArea === 'layout' ? '1:1' : fmtScale(preview?.scale ?? 0)}</strong>
            </span>
          </div>
          {preview?.warnings.map((w) => (
            <div key={w} className="authoring__issue is-warn" role="status">
              <span aria-hidden>⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
