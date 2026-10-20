import { useState } from 'react';
import { isPointRequest, POINT_SNAP_OPTIONS, type PointModifierKind } from '../../app/pointPrecision';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';
import { useEditorEvents } from '../hooks';
import '../../styles/precisionTools.css';

export function PointPrecisionDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  useEditorEvents(editor, ['command', 'prefs']);
  const [request] = useState(() => editor.runner.pending);
  const current = request === editor.runner.pending && isPointRequest(request?.req);
  const lang = editor.lang;
  const choose = (types: Parameters<Editor['setPointSnapOverride']>[0]) => {
    if (current && editor.setPointSnapOverride(types)) onClose();
  };
  const modifier = (kind: PointModifierKind) => {
    if (current && editor.runner.beginPointModifier(kind)) onClose();
  };
  return <Dialog lang={lang} title={tr(lang, 'Referencia de punto', 'Point reference')} onClose={onClose} footer={
    <button type="button" className="btn" onClick={onClose}>{tr(lang, 'Volver al dibujo', 'Back to drawing')}</button>
  }>
    <p className="panel__hint">{tr(lang, 'Elige una referencia sólo para el siguiente punto. Las referencias guardadas no cambian. Mayús + clic derecho abre estas opciones.', 'Choose a snap for the next point only. Saved snap settings stay unchanged. Shift + right-click opens these options.')}</p>
    {!current && <p role="status">{tr(lang, 'Inicia un comando que pida un punto para usar estas opciones.', 'Start a command that requests a point to use these options.')}</p>}
    <div className="point-precision-options" role="group" aria-label={tr(lang, 'Referencia para el siguiente punto', 'Snap for the next point')}>
      {POINT_SNAP_OPTIONS.map(option => <button type="button" className="btn" key={option.type} disabled={!current} onClick={() => choose([option.type])}>
        <span>{option.label[lang]}</span><kbd>{option.aliases[0]}</kbd>
      </button>)}
      <button type="button" className="btn" disabled={!current} onClick={() => choose([])}>{tr(lang, 'Sin referencia', 'No snap')}<kbd>NON</kbd></button>
    </div>
    <h3>{tr(lang, 'Construir un punto', 'Construct a point')}</h3>
    <div className="point-precision-options">
      <button type="button" className="btn" disabled={!current} onClick={() => modifier('from')}>{tr(lang, 'Desde una referencia', 'From a reference')}<kbd>FROM</kbd></button>
      <button type="button" className="btn" disabled={!current} onClick={() => modifier('midpoint')}>{tr(lang, 'Medio entre dos puntos', 'Mid between two points')}<kbd>M2P</kbd></button>
    </div>
    <p className="panel__hint">{tr(lang, 'Esc durante FROM/M2P vuelve al paso anterior sin cancelar el dibujo. Puedes anidar hasta 8 referencias.', 'Esc during FROM/M2P returns to the previous step without cancelling the drawing. Nest up to 8 references.')}</p>
  </Dialog>;
}
