import { Maximize, Minus, Plus } from 'lucide-react';
import type { Editor } from '../editor/editor';
import { tr } from './controls';

/** Zoom táctil sobre el lienzo: el pellizco es cómodo, pero no preciso. Una sola pieza de arcilla. */
export function TouchHud({ editor }: { editor: Editor }) {
  const lang = editor.lang;
  const center = () => ({ x: editor.view.width / 2, y: editor.view.height / 2 });
  return (
    <div className="touch-hud" role="toolbar" aria-label={tr(lang, 'Zoom', 'Zoom')}>
      <button type="button" className="hud-btn" onClick={() => editor.wheel(center(), -220)} aria-label={tr(lang, 'Acercar', 'Zoom in')}>
        <Plus size={18} />
      </button>
      <button type="button" className="hud-btn" onClick={() => editor.wheel(center(), 220)} aria-label={tr(lang, 'Alejar', 'Zoom out')}>
        <Minus size={18} />
      </button>
      <button type="button" className="hud-btn" onClick={() => editor.zoomExtents()} aria-label={tr(lang, 'Zoom a extensión', 'Zoom extents')}>
        <Maximize size={17} />
      </button>
    </div>
  );
}
