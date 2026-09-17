import { X } from 'lucide-react';
import type { Entity } from '../document/types';
import type { Editor } from '../editor/editor';
import { typeLabel } from '../model/typeLabels';
import { tr } from './controls';
import { useEditorEvents } from './hooks';
import type { PropRow } from './panels/propertyDefs';
import { GENERAL_ROWS, rowsForType } from './panels/propertyDefs';
import { PropertyField } from './panels/propertyFields';

const GENERAL_KEYS = ['layer', 'color', 'linetype', 'lineweight'];
/** Propiedades geométricas más útiles primero; el resto está en el inspector. */
const PREFERRED = ['text', 'contents', 'measure', 'textOverride', 'radius', 'diameter', 'len', 'rectW', 'rectH', 'length', 'area', 'carea', 'parea', 'height', 'rotation', 'style', 'dstyle', 'mlstyle', 'blockName', 'scaleX', 'pname', 'pscale', 'vpscale', 'vplocked', 'opacity', 'fade'];

/** Tarjeta flotante con las propiedades principales de la selección (modo QP). */
export function QuickProperties({ editor, onMore }: { editor: Editor; onMore: () => void }) {
  useEditorEvents(editor, ['selection', 'doc', 'prefs', 'command']);
  const lang = editor.lang;
  if (!editor.prefs.quickProperties || !editor.selection.size || editor.runner.busy) return null;
  const targets = editor.selection.list.map((id) => editor.doc.entity(id)).filter(Boolean) as Entity[];
  if (!targets.length) return null;
  const types = new Set(targets.map((e) => e.type));
  const general = GENERAL_ROWS.filter((r) => GENERAL_KEYS.includes(r.key));
  let specific: PropRow[] = [];
  if (types.size === 1) {
    const rows = rowsForType(targets[0].type).filter((r) => r.group !== 'general');
    specific = [...rows].sort((a, b) => rank(a.key) - rank(b.key)).slice(0, 4);
  }
  const title = types.size === 1 ? `${typeLabel(targets[0].type, lang)}${targets.length > 1 ? ` (${targets.length})` : ''}` : tr(lang, `${targets.length} objetos`, `${targets.length} objects`);
  return (
    <div className="quickprops" role="dialog" aria-label={tr(lang, 'Propiedades rápidas', 'Quick properties')} onKeyDown={(e) => e.stopPropagation()}>
      <div className="quickprops__head">
        <strong>{title}</strong>
        <button className="btn btn--sm" onClick={onMore}>
          {tr(lang, 'Más…', 'More…')}
        </button>
        <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => editor.selection.clear()} aria-label={tr(lang, 'Cerrar', 'Close')}>
          <X size={13} />
        </button>
      </div>
      {[...general, ...specific].map((row) => (
        <PropertyField key={row.key} editor={editor} row={row} targets={targets} />
      ))}
    </div>
  );
}

function rank(key: string): number {
  const i = PREFERRED.findIndex((k) => key === k || key.startsWith(`${k}.`));
  return i < 0 ? PREFERRED.length : i;
}
