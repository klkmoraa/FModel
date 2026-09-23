import { Download, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Editor } from '../../editor/editor';
import { calculateNewmark, NEWMARK_DEFAULTS, type NewmarkInputs } from '../../geotech/newmark';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

const COLORS = ['#f5c744', '#ed8b2c', '#c84432', '#413597', '#55b94a', '#2f74b8', '#ede86a', '#22c7df', '#55d7e8'];

export function NewmarkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const lang = editor.lang;
  const [inputs, setInputs] = useState<NewmarkInputs>(NEWMARK_DEFAULTS);
  const result = useMemo(() => calculateNewmark(inputs), [inputs]);
  const set = (key: keyof NewmarkInputs, value: string) => setInputs((current) => ({ ...current, [key]: Math.max(0.01, Number(value) || 0.01) }));

  const download = () => {
    const node = document.querySelector('.newmark-sheet') as SVGSVGElement | null;
    if (!node) return;
    const source = new XMLSerializer().serializeToString(node);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Carta_de_Newmark_FModel.svg';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Dialog title={tr(lang, 'Carta de Newmark · incremento de esfuerzo', 'Newmark chart · stress increment')} onClose={onClose} wide lang={lang}>
      <div className="newmark">
        <section className="newmark-controls" aria-label={tr(lang, 'Datos del ejercicio', 'Exercise data')}>
          <div className="newmark-controls__title">
            <div><span className="eyebrow">{tr(lang, 'EJERCICIO DEL VIDEO', 'VIDEO EXERCISE')}</span><h3>{tr(lang, 'Cimentación escalonada', 'Stepped foundation')}</h3></div>
            <button className="btn btn--sm" onClick={() => setInputs(NEWMARK_DEFAULTS)}><RotateCcw size={14} />{tr(lang, 'Restablecer', 'Reset')}</button>
          </div>
          <div className="newmark-fields">
            <NumberField label="q (t/m²)" value={inputs.pressure} onChange={(v) => set('pressure', v)} />
            <NumberField label="z (m)" value={inputs.depth} onChange={(v) => set('depth', v)} />
            <NumberField label={tr(lang, 'Ancho (m)', 'Width (m)')} value={inputs.width} onChange={(v) => set('width', v)} />
            <NumberField label={tr(lang, 'Largo (m)', 'Length (m)')} value={inputs.height} onChange={(v) => set('height', v)} />
            <NumberField label="Δx (m)" value={inputs.offsetX} onChange={(v) => set('offsetX', v)} />
            <NumberField label="Δy (m)" value={inputs.offsetY} onChange={(v) => set('offsetY', v)} />
          </div>
          <div className="newmark-result">
            <span>{tr(lang, 'Incremento vertical', 'Vertical increment')}</span>
            <strong>Δσ<sub>z</sub> = {result.totalStress.toFixed(4)} t/m²</strong>
            <small>Δσ<sub>z</sub> = 0.1 · q · ΣN</small>
          </div>
          <button className="btn btn--primary newmark-download" onClick={download}><Download size={15} />{tr(lang, 'Descargar lámina SVG', 'Download SVG sheet')}</button>
        </section>

        <section className="newmark-board">
          <NewmarkGraphic inputs={inputs} />
          <div className="newmark-table-wrap">
            <table className="newmark-table">
              <thead><tr><th>σ<sub>z</sub>/q</th><th>r/z</th><th>r (m)</th><th>{tr(lang, 'Área anillo', 'Ring area')}</th><th>{tr(lang, 'Área ocupada', 'Occupied area')}</th><th>N</th><th>Δσ<sub>z</sub></th></tr></thead>
              <tbody>{result.rows.map((row) => <tr key={row.ratio} className={row.boundary ? 'is-boundary' : undefined}>
                <td>{row.ratio.toFixed(2)}</td><td>{row.radiusRatio.toFixed(2)}</td><td>{row.radius.toFixed(4)}</td><td>{row.ringArea.toFixed(4)}</td><td>{row.boundary ? '—' : row.occupiedArea.toFixed(4)}</td><td>{row.boundary ? '—' : row.occupiedFraction.toFixed(4)}</td><td>{row.stress.toFixed(4)}</td>
              </tr>)}</tbody>
              <tfoot><tr><td colSpan={6}>{tr(lang, 'TOTAL', 'TOTAL')}</td><td>{result.totalStress.toFixed(4)}</td></tr></tfoot>
            </table>
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return <label className="newmark-field"><span>{label}</span><input type="number" min="0.01" step="0.1" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NewmarkGraphic({ inputs }: { inputs: NewmarkInputs }) {
  const result = calculateNewmark(inputs);
  const maxRadius = result.rows[result.rows.length - 1].radius;
  const extent = Math.max(maxRadius * 1.08, inputs.width + inputs.offsetX, inputs.height) || 1;
  const footprint = result.footprint.map(([x, y]) => `${x},${-y}`).join(' ');
  return <svg className="newmark-sheet" viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`} role="img" aria-label="Carta de Newmark con la cimentación superpuesta">
    <defs><clipPath id="newmark-foundation"><polygon points={footprint} /></clipPath></defs>
    <rect x={-extent} y={-extent} width={extent * 2} height={extent * 2} className="newmark-sheet__paper" />
    <g clipPath="url(#newmark-foundation)">
      {result.rows.slice(0, 9).reverse().map((row, reverseIndex) => {
        const index = 8 - reverseIndex;
        return <circle key={row.ratio} cx="0" cy="0" r={row.radius} fill={COLORS[index]} />;
      })}
    </g>
    <polygon points={footprint} className="newmark-sheet__footprint" />
    {result.rows.map((row) => <circle key={row.ratio} cx="0" cy="0" r={row.radius} className={row.boundary ? 'newmark-sheet__circle is-boundary' : 'newmark-sheet__circle'} />)}
    <line x1={-extent} y1="0" x2={extent} y2="0" className="newmark-sheet__axis" /><line x1="0" y1={-extent} x2="0" y2={extent} className="newmark-sheet__axis" />
    <circle cx="0" cy="0" r={extent * 0.022} className="newmark-sheet__point" />
    <text x={extent * 0.06} y={-extent * 0.05} className="newmark-sheet__label">P</text>
  </svg>;
}
