import { emptyBox, expandBox, inflate, isEmptyBox } from '../../geometry/bbox';
import type { Editor } from '../../editor/editor';
import { kindOf } from '../../model/registry';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

const TABLE_LABEL: Record<string, { es: string; en: string }> = {
  layers: { es: 'Capas', en: 'Layers' },
  linetypes: { es: 'Tipos de línea', en: 'Linetypes' },
  textStyles: { es: 'Estilos de texto', en: 'Text styles' },
  dimStyles: { es: 'Estilos de cota', en: 'Dimension styles' },
  mleaderStyles: { es: 'Estilos de directriz', en: 'Multileader styles' },
  tableStyles: { es: 'Estilos de tabla', en: 'Table styles' },
  mlineStyles: { es: 'Estilos de multilínea', en: 'Multiline styles' },
  blocks: { es: 'Bloques', en: 'Blocks' },
  layouts: { es: 'Presentaciones', en: 'Layouts' },
  groups: { es: 'Grupos', en: 'Groups' },
  views: { es: 'Vistas', en: 'Views' },
  layerStates: { es: 'Estados de capa', en: 'Layer states' },
  layerFilters: { es: 'Filtros de capa', en: 'Layer filters' },
  assets: { es: 'Recursos', en: 'Assets' },
  constraints: { es: 'Restricciones', en: 'Constraints' },
  parameters: { es: 'Parámetros', en: 'Parameters' },
  parameterSets: { es: 'Variantes de parámetros', en: 'Parameter variants' },
};

/** Resumen de la comparación de revisiones; los cambios se ven resaltados en el lienzo. */
export function CompareDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const lang = editor.lang;
  const cmp = editor.compare;
  if (!cmp) return null;
  const { diff, label } = cmp;
  const zoomToChanges = () => {
    const box = emptyBox();
    const owner = editor.inputOwner;
    for (const e of diff.removed) if (e.owner === owner) expandBox(box, kindOf(e).bbox(e, editor.ctx));
    for (const id of [...diff.added, ...diff.modified.map((m) => m.id)]) {
      const e = editor.doc.entity(id);
      if (e && e.owner === owner) expandBox(box, kindOf(e).bbox(e, editor.ctx));
    }
    if (!isEmptyBox(box) && Number.isFinite(box.minX)) editor.zoomToBox(inflate(box, Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.08 || 1));
    onClose();
  };
  const rows: [string, string, number][] = [
    ['var(--fs-signal-shear)', tr(lang, 'Añadidos', 'Added'), diff.added.length],
    ['var(--fs-signal-moment)', tr(lang, 'Eliminados', 'Removed'), diff.removed.length],
    ['var(--fs-signal-attention)', tr(lang, 'Modificados', 'Modified'), diff.modified.length],
  ];
  return (
    <Dialog
      lang={lang}
      title={tr(lang, `Comparación con «${label}»`, `Comparison with "${label}"`)}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => (onClose(), editor.command('COMPAREEND'))}>
            {tr(lang, 'Terminar comparación', 'End comparison')}
          </button>
          <button className="btn" onClick={zoomToChanges}>
            {tr(lang, 'Zoom a los cambios', 'Zoom to changes')}
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            {tr(lang, 'Ver en el lienzo', 'View on canvas')}
          </button>
        </>
      }
    >
      <div className="report">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {rows.map(([color, name, n]) => (
            <div key={name} className="section" style={{ padding: 12, borderLeft: `4px solid ${color}` }}>
              <div className="eyebrow">{name}</div>
              <div style={{ font: '600 26px/1.2 var(--fs-font-display, inherit)' }}>{n}</div>
            </div>
          ))}
        </div>
        <section>
          <h3 className="eyebrow">{tr(lang, 'Tablas y configuración', 'Tables and settings')}</h3>
          {Object.keys(diff.records).length || diff.settingsChanged ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>{tr(lang, 'Tabla', 'Table')}</th>
                  <th style={{ textAlign: 'right' }}>{tr(lang, 'Añadidos', 'Added')}</th>
                  <th style={{ textAlign: 'right' }}>{tr(lang, 'Eliminados', 'Removed')}</th>
                  <th style={{ textAlign: 'right' }}>{tr(lang, 'Modificados', 'Modified')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(diff.records).map(([k, r]) => (
                  <tr key={k}>
                    <td>{TABLE_LABEL[k]?.[lang] ?? k}</td>
                    <td style={{ textAlign: 'right' }}>{r.added}</td>
                    <td style={{ textAlign: 'right' }}>{r.removed}</td>
                    <td style={{ textAlign: 'right' }}>{r.modified}</td>
                  </tr>
                ))}
                {diff.settingsChanged && (
                  <tr>
                    <td colSpan={4}>{tr(lang, 'La configuración del dibujo cambió (unidades, estilos actuales, escalas…).', 'Drawing settings changed (units, current styles, scales…).')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="empty">{tr(lang, 'Sin cambios en tablas ni configuración.', 'No changes in tables or settings.')}</p>
          )}
        </section>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>{tr(lang, 'En el lienzo: verde añadidos, ámbar modificados y rojo lo eliminado (como fantasma). La comparación sigue visible hasta COMPAREEND.', 'On canvas: green added, amber modified and red what was removed (as a ghost). The comparison stays visible until COMPAREEND.')}</p>
      </div>
    </Dialog>
  );
}
