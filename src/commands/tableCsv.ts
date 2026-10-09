import { TableCsvError, tableCsv } from '../io/tableCsv';
import { saveFile } from '../storage/fileAccess';
import { L } from './helpers';
import { CommandError, type CommandDef } from './types';

export const TABLECSV: CommandDef = {
  name: 'TABLECSV', aliases: ['EXPORTARTABLACSV'], category: 'output', icon: 'table', readOnly: true,
  label: L('Exportar tabla CSV', 'Export table CSV'),
  description: L('Descarga el cuadro de huecos o cualquier tabla nativa como CSV para Excel.', 'Download the opening schedule or any native table as an Excel-friendly CSV.'),
  help: L('Selecciona una tabla, incluso bloqueada. Exporta su texto actual: no recalcula huecos ni cambia el dibujo. UTF-8, celdas combinadas vacías y fórmulas neutralizadas. Esc o cancelar el archivo termina sin indicar éxito.', 'Select a table, including locked ones. Export its current text: does not recount openings or change the drawing. UTF-8, blank covered cells and neutralized formulas. Esc or cancelling the file ends without a success message.'),
  async run(api) {
    const selected = await api.getEntity({ prompt: L('Selecciona la tabla que quieres exportar', 'Select the table to export'), types: ['table'], allowLocked: true, allowNone: true });
    if (selected.kind !== 'entity') return;
    const table = api.editor.doc.entity(selected.id);
    if (!table || table.type !== 'table') return;
    let contents: string;
    try { contents = tableCsv(table); }
    catch (error) { if (error instanceof TableCsvError) throw new CommandError(error.messageI18n); throw error; }
    if (api.signal.aborted) return;
    const base = (api.editor.fileName || api.editor.doc.settings.title || api.t(L('dibujo', 'drawing'))).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'FModel';
    const result = await saveFile(new Blob([contents], { type: 'text/csv;charset=utf-8' }), `${base}-tabla.csv`, { 'text/csv': ['.csv'] }, 'CSV');
    if (result.kind === 'cancelled' || api.signal.aborted) return;
    api.info(L('CSV exportado. El dibujo permanece intacto.', 'CSV exported. The drawing is unchanged.'));
  },
};
