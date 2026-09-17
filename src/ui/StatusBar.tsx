import type { Editor } from '../editor/editor';
import { formatCoord } from '../snap/coords';
import { useThrottledEditorEvents } from './hooks';

const tr = (lang: 'es' | 'en', es: string, en: string) => (lang === 'es' ? es : en);

export function StatusBar({ editor, onOpenSettings, fullscreen, onFullscreen }: { editor: Editor; onOpenSettings: () => void; fullscreen: boolean; onFullscreen: () => void }) {
  useThrottledEditorEvents(editor, ['overlay', 'prefs', 'space', 'doc', 'view']);
  const lang = editor.lang;
  const p = editor.hover.resolved?.p ?? editor.hover.world;
  const snap = editor.prefs.snap;
  const s = editor.doc.settings;
  const scales = s.annotationScales;
  const currentScale = editor.activeViewport ? editor.activeViewport.scale : s.annotationScale;
  const scaleName = scales.find((x) => Math.abs(x.paper / x.drawing - currentScale) < 1e-9)?.name ?? `${Math.round((1 / currentScale) * 1000) / 1000}`;
  const toggles: { label: string; title: string; on: boolean; act: () => void }[] = [
    { label: tr(lang, 'REJILLA', 'GRID'), title: 'F7', on: editor.prefs.grid.on, act: () => editor.command('GRIDTOGGLE') },
    { label: tr(lang, 'FORZC', 'SNAP'), title: 'F9', on: snap.gridSnap, act: () => editor.toggleSnapSetting('gridSnap') },
    { label: tr(lang, 'ORTO', 'ORTHO'), title: 'F8', on: snap.ortho, act: () => editor.toggleSnapSetting('ortho') },
    { label: 'POLAR', title: 'F10', on: snap.polar, act: () => editor.toggleSnapSetting('polar') },
    { label: tr(lang, 'REFENT', 'OSNAP'), title: 'F3', on: snap.osnap, act: () => editor.toggleSnapSetting('osnap') },
    { label: tr(lang, 'RASTREO', 'OTRACK'), title: 'F11', on: snap.otrack, act: () => editor.toggleSnapSetting('otrack') },
    { label: 'DYN', title: 'F12', on: editor.prefs.dynamicInput.on, act: () => editor.command('DYNTOGGLE') },
    { label: tr(lang, 'GLN', 'LWT'), title: tr(lang, 'Mostrar grosores', 'Show lineweights'), on: editor.prefs.lineweightDisplay, act: () => editor.command('LWDISPLAY') },
    { label: tr(lang, 'CICLO', 'CYCLE'), title: tr(lang, 'Ciclo de selección', 'Selection cycling'), on: editor.prefs.selectionCycling, act: () => editor.setPrefs({ selectionCycling: !editor.prefs.selectionCycling }) },
  ];
  const isolated = !!editor.isolated || editor.hidden.size > 0;
  return (
    <footer className="statusbar" role="toolbar" aria-label={tr(lang, 'Barra de estado', 'Status bar')}>
      <span className="coords" title={tr(lang, 'Coordenadas del cursor (mundo)', 'Cursor coordinates (world)')}>
        {formatCoord(p.x, 4)}, {formatCoord(p.y, 4)}
      </span>
      <span className="status-sep" />
      <button className="status-toggle is-on" disabled={editor.spaceKind !== 'layout'} onClick={() => editor.command(editor.activeViewportId ? 'PSPACE' : 'MSPACE')} title={tr(lang, 'Alternar espacio papel / modelo en viewport', 'Toggle paper / model space in viewport')}>
        {editor.spaceKind === 'model' ? tr(lang, 'MODELO', 'MODEL') : editor.spaceKind === 'block' ? tr(lang, 'BLOQUE', 'BLOCK') : editor.activeViewportId ? tr(lang, 'MODELO·VP', 'MODEL·VP') : tr(lang, 'PAPEL', 'PAPER')}
      </button>
      <span className="status-sep" />
      {toggles.map((t) => (
        <button key={t.label} className={`status-toggle${t.on ? ' is-on' : ''}`} title={t.title} aria-pressed={t.on} onClick={t.act}>
          {t.label}
        </button>
      ))}
      <button className="status-toggle" onClick={onOpenSettings} title={tr(lang, 'Ajustes de dibujo', 'Drafting settings')}>
        ⚙
      </button>
      <span className="status-sep" />
      {isolated && (
        <button className="status-toggle is-on" onClick={() => editor.command('UNISOLATEOBJECTS')} title={tr(lang, 'Terminar aislamiento', 'End isolation')}>
          ◐ {tr(lang, 'AISLADO', 'ISOLATED')}
        </button>
      )}
      <label className="status-toggle" title={tr(lang, 'Escala de anotación', 'Annotation scale')}>
        {tr(lang, 'ESC', 'SCALE')}
        <select
          className="status-select"
          value={scaleName}
          onChange={(e) => {
            const sc = scales.find((x) => x.name === e.target.value);
            if (!sc) return;
            const k = sc.paper / sc.drawing;
            if (editor.activeViewportId) editor.doc.transact('VP SCALE', (tx) => tx.updateEntity(editor.activeViewportId!, { scale: k, scaleName: sc.name }));
            else editor.doc.transact('CANNOSCALE', (tx) => tx.setSettings({ annotationScale: k }));
            editor.ctx.annotationScale = k;
          }}
        >
          {!scales.some((x) => x.name === scaleName) && <option value={scaleName}>{scaleName}</option>}
          {scales.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <span className="status-toggle" title={tr(lang, 'Unidades del dibujo', 'Drawing units')}>
        {s.units.toUpperCase()}
      </span>
      <span className="status-toggle" title={tr(lang, 'Zoom', 'Zoom')}>
        {editor.view.scale >= 1 ? `${editor.view.scale.toFixed(2)} px/u` : `${(1 / editor.view.scale).toFixed(2)} u/px`}
      </span>
      <span style={{ flex: 1 }} />
      <button className="status-toggle" onClick={onFullscreen} title={tr(lang, 'Pantalla limpia / completa (Ctrl+0)', 'Clean screen / fullscreen (Ctrl+0)')}>
        {fullscreen ? '⤡' : '⤢'}
      </button>
    </footer>
  );
}
