import { createContext } from '../model/context';
import { CadDocument } from '../document/document';
import { tableKind } from '../model/kinds/annotation';
import { newId } from '../document/ids';
import type { Id, TableEntity } from '../document/types';
import type { WallOpeningSpec } from '../geometry/wallOpenings';
import { readWallAssembly } from '../model/wallAssembly';
import { insertEntity, physicalSize } from './architectureHelpers';
import { fail, L, make } from './helpers';
import type { CommandDef } from './types';

const TYPE_LABELS = {
  single: L('Puerta sencilla', 'Single door'), double: L('Puerta doble', 'Double door'),
  fixed: L('Ventana fija', 'Fixed window'), sliding: L('Hueco corredizo', 'Sliding opening'), empty: L('Hueco sin símbolo', 'Empty opening'),
};
const TYPE_ORDER: WallOpeningSpec['type'][] = ['single', 'double', 'fixed', 'sliding', 'empty'];

export const OPENINGSCHEDULE: CommandDef = {
  name: 'OPENINGSCHEDULE', aliases: ['CUADROHUECOS'], category: 'annotate', icon: 'table',
  label: L('Cuadro de huecos', 'Opening schedule'),
  description: L('Cuenta huecos asociados por tipo y ancho en el espacio actual y coloca una tabla editable.', 'Count associated openings by type and width in the current space and place an editable table.'),
  help: L('Incluye todos los muros asociados del espacio actual, incluso capas ocultas o bloqueadas. No cuenta bloques ni símbolos sueltos. Es una instantánea: vuelve a generar tras editar. No inventa alturas ni distingue puertas/ventanas corredizas sin datos. Muros limpiados: restaura primero. Esc cancela.', 'Includes all associated walls in the current space, including hidden or locked layers. Excludes blocks and loose symbols. A snapshot: regenerate after editing. Does not invent heights or classify ambiguous sliding openings. Restore cleaned walls first. Esc cancels.'),
  async run(api) {
    const doc = api.editor.doc, version = doc.version, owner = api.editor.inputOwner;
    const validated = new Set<Id>(), grouped = new Map<string, { type: WallOpeningSpec['type']; width: number; count: number }>();
    let assemblies = 0, count = 0;
    for (const entity of doc.data.entities.values()) {
      if (entity.owner !== owner || validated.has(entity.id) || (entity.meta?.fmodelWallAssembly === undefined && entity.meta?.fmodelWallMember === undefined)) continue;
      if (++assemblies > 100) fail('Máximo 100 muros asociados por cuadro.', 'At most 100 associated walls per schedule.');
      const assembly = readWallAssembly(doc, entity.id);
      for (const id of assembly.members) validated.add(id);
      for (const opening of assembly.openings) {
        if (++count > 1000) fail('Máximo 1000 huecos por cuadro.', 'At most 1000 openings per schedule.');
        const key = `${opening.type}:${opening.width}`;
        const row = grouped.get(key);
        if (row) row.count++; else grouped.set(key, { type: opening.type, width: opening.width, count: 1 });
      }
    }
    if (!count) fail('No hay huecos asociados en el espacio actual. Crea puertas o ventanas con PUERTA/VENTANA.', 'No associated openings in the current space. Create doors or windows using WALLDOOR/WALLWINDOW.');
    const baseStyle = doc.data.tableStyles.get(doc.settings.currentTableStyle);
    if (!baseStyle) fail('El estilo de tabla actual no existe.', 'Current table style is missing.');
    const size = (mm: number) => physicalSize(api, mm);
    const style = { ...baseStyle, id: newId('ts'), name: `FModel Opening Schedule ${newId()}`, cellMargin: size(1.5), title: { ...baseStyle.title, textHeight: size(4) }, header: { ...baseStyle.header, textHeight: size(3) }, data: { ...baseStyle.data, textHeight: size(3) } };
    const rows = [...grouped.values()].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.width - b.width);
    const indices = { P: 0, V: 0, H: 0 };
    const data = rows.map(row => {
      const prefix = row.type === 'single' || row.type === 'double' ? 'P' : row.type === 'fixed' ? 'V' : 'H';
      const code = `${prefix}-${String(++indices[prefix]).padStart(2, '0')}`;
      return [code, api.t(TYPE_LABELS[row.type]), String(row.width), String(row.count)];
    });
    const unit = doc.settings.units === 'unitless' ? api.t(L('unidades', 'units')) : doc.settings.units;
    const headers = [api.t(L('Clave', 'Code')), api.t(L('Tipo', 'Type')), `${api.t(L('Ancho', 'Width'))} (${unit})`, api.t(L('Cantidad', 'Quantity'))];
    const title = api.t(L('Cuadro de huecos', 'Opening schedule'));
    const cells = [[{ text: title, colSpan: 4 }, { text: '', merged: true }, { text: '', merged: true }, { text: '', merged: true }], headers.map(text => ({ text })), ...data.map(row => row.map(text => ({ text })))];
    const widths = [20, 50, 40, 30].map((mm, i) => Math.max(size(mm), size(2) * Math.max(headers[i].length, ...data.map(row => row[i].length)) + 2 * style.cellMargin));
    const build = (position: { x: number; y: number }) => make<TableEntity>(api, { type: 'table', position, rotation: 0, style: style.id, cells, columnWidths: widths, rowHeights: [size(12), size(10), ...data.map(() => size(10))], titleRow: true, headerRow: true });
    // Isolated evaluation document: preview resolves the exact style without touching the drawing.
    const previewDoc = new CadDocument({ ...doc.data, entities: new Map(), tableStyles: new Map(doc.data.tableStyles).set(style.id, style) });
    const previewContext = createContext(previewDoc);
    const point = await api.getPoint({ prompt: L('Esquina superior izquierda del cuadro · instantánea del espacio actual', 'Top-left corner of schedule · current-space snapshot'), allowNone: true, preview: p => ({ items: tableKind.graphics(build(p), previewContext) }) });
    if (point.kind !== 'point') return;
    if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner) { api.warn(L('El dibujo cambió mientras colocabas el cuadro. Ejecuta CUADROHUECOS de nuevo.', 'The drawing changed while placing the schedule. Run OPENINGSCHEDULE again.')); return; }
    if (!Number.isFinite(point.p.x) || !Number.isFinite(point.p.y)) fail('Punto de inserción inválido.', 'Invalid insertion point.');
    api.apply('OPENINGSCHEDULE', tx => { tx.add('tableStyles', style); insertEntity(tx, build(point.p)); });
    api.info(L(`Cuadro creado: ${count} huecos en ${rows.length} tipos/anchos. Instantánea sin actualización automática.`, `Schedule created: ${count} openings in ${rows.length} type/width groups. Snapshot without automatic updates.`));
  },
};
