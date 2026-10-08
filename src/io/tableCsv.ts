import type { TableEntity } from '../document/types';
import { plainMText } from '../model/text';

export class TableCsvError extends Error {
  readonly messageI18n = { es: 'La tabla supera los límites CSV: 2002 filas, 200 columnas o 2 millones de caracteres.', en: 'Table exceeds CSV limits: 2002 rows, 200 columns or 2 million characters.' };
  constructor() { super('CSV table exceeds resource limits'); }
}
/** Spreadsheet-friendly text snapshot; no document mutation or external I/O. */
export function tableCsv(table: TableEntity): string {
  const rows = table.rowHeights.length, cols = table.columnWidths.length;
  if (!rows || !cols || rows > 2002 || cols > 200) throw new TableCsvError();
  let characters = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    characters += table.cells[r]?.[c]?.text.length ?? 0;
    if (characters > 2_000_000) throw new TableCsvError();
  }
  const quote = (value: string) => {
    const text = plainMText(value);
    // Quoting alone does not prevent formulas when a CSV is opened in a spreadsheet.
    const safe = /^\s*[=+\-@]/u.test(text) || /^[\t\r]/u.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    const cell = table.cells[r]?.[c];
    return quote(!cell || cell.merged ? '' : cell.text);
  }).join(',')).join('\r\n') + '\r\n';
}
