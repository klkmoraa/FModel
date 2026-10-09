import { createContext } from '../model/context';
import { CadDocument } from '../document/document';
import { tableKind } from '../model/kinds/annotation';
import { newId } from '../document/ids';
import type { TableEntity } from '../document/types';
import { collectOpeningAnnotations, openingScheduleCells } from '../model/openingAnnotations';
import { insertEntity, physicalSize } from './architectureHelpers';
import { fail, L, make } from './helpers';
import type { CommandDef } from './types';

export const OPENINGSCHEDULE: CommandDef = {
  name: 'OPENINGSCHEDULE', aliases: ['CUADROHUECOS'], category: 'annotate', icon: 'table',
  label: L('Cuadro de huecos', 'Opening schedule'),
  description: L('Cuenta huecos asociados por tipo y ancho en el espacio actual y coloca una tabla editable.', 'Count associated openings by type and width in the current space and place an editable table.'),
  help: L('Cuadro vinculado: se actualiza al editar huecos asociados del espacio actual, incluso capas ocultas/bloqueadas. ETIQUETASHUECOS añade las claves al plano. Sin alturas inferidas ni símbolos sueltos. Restaura muros limpiados antes de crear; una fuente inválida muestra Revisar huecos. Esc cancela.', 'Linked schedule: updates when associated current-space openings change, including hidden/locked layers. OPENINGTAGS adds matching codes to the plan. No inferred heights or loose symbols. Restore cleaned walls before creation; invalid sources show Review openings. Esc cancels.'),
  async run(api) {
    const doc = api.editor.doc, version = doc.version, owner = api.editor.inputOwner;
    const snapshot = collectOpeningAnnotations(doc, owner), count = snapshot.openings.length;
    if (!count) fail('No hay huecos asociados en el espacio actual. Crea puertas o ventanas con PUERTA/VENTANA.', 'No associated openings in the current space. Create doors or windows using WALLDOOR/WALLWINDOW.');
    const baseStyle = doc.data.tableStyles.get(doc.settings.currentTableStyle);
    if (!baseStyle) fail('El estilo de tabla actual no existe.', 'Current table style is missing.');
    const size = (mm: number) => physicalSize(api, mm);
    const style = { ...baseStyle, id: newId('ts'), name: `FModel Opening Schedule ${newId()}`, cellMargin: size(1.5), title: { ...baseStyle.title, textHeight: size(4) }, header: { ...baseStyle.header, textHeight: size(3) }, data: { ...baseStyle.data, textHeight: size(3) } };
    const cells = openingScheduleCells(snapshot, api.lang, doc.settings.units), headers = cells[1].map(c => c.text), data = cells.slice(2).map(row => row.map(c => c.text));
    const widths = [20, 50, 40, 30].map((mm, i) => Math.max(size(mm), size(2) * Math.max(headers[i].length, ...data.map(row => row[i].length)) + 2 * style.cellMargin));
    const build = (position: { x: number; y: number }) => make<TableEntity>(api, { type: 'table', position, rotation: 0, style: style.id, cells, columnWidths: widths, rowHeights: [size(12), size(10), ...data.map(() => size(10))], titleRow: true, headerRow: true, openingSchedule: { version: 1, language: api.lang } });
    // Isolated evaluation document: preview resolves the exact style without touching the drawing.
    const previewDoc = new CadDocument({ ...doc.data, entities: new Map(), tableStyles: new Map(doc.data.tableStyles).set(style.id, style) });
    const previewContext = createContext(previewDoc);
    const point = await api.getPoint({ prompt: L('Esquina superior izquierda del cuadro · actualización automática', 'Top-left corner of schedule · automatic updates'), allowNone: true, preview: p => ({ items: tableKind.graphics(build(p), previewContext) }) });
    if (point.kind !== 'point') return;
    if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner) { api.warn(L('El dibujo cambió mientras colocabas el cuadro. Ejecuta CUADROHUECOS de nuevo.', 'The drawing changed while placing the schedule. Run OPENINGSCHEDULE again.')); return; }
    if (!Number.isFinite(point.p.x) || !Number.isFinite(point.p.y)) fail('Punto de inserción inválido.', 'Invalid insertion point.');
    api.apply('OPENINGSCHEDULE', tx => { tx.add('tableStyles', style); insertEntity(tx, build(point.p)); });
    api.info(L(`Cuadro vinculado: ${count} huecos en ${snapshot.rows.length} tipos/anchos. Actualización automática.`, `Linked schedule: ${count} openings in ${snapshot.rows.length} type/width groups. Automatic updates.`));
  },
};
