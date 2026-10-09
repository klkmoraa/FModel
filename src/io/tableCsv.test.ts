import { expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { TableEntity } from '../document/types';
import { tableCsv } from './tableCsv';
const table = (texts: string[][]): TableEntity => ({ ...entityDefaults(createDocument()), id: 'csv-table', order: 1, type: 'table', position: { x: 0, y: 0 }, rotation: 0, style: 'style', rowHeights: texts.map(() => 10), columnWidths: texts[0].map(() => 20), cells: texts.map(row => row.map(text => ({ text }))), titleRow: false, headerRow: true });
it('exports UTF-8 Excel CSV with numeric widths, accents, quotes, commas and multiline text', () => {
  expect(tableCsv(table([['Clave', 'Ancho (m)', 'Tipo'], ['P-01', '0.9', 'Puerta "doble", café\\PPlanta baja']]))).toBe('\uFEFF"Clave","Ancho (m)","Tipo"\r\n"P-01","0.9","Puerta ""doble"", café\nPlanta baja"\r\n');
});
it('keeps merged cells blank and prevents edited cells from becoming spreadsheet formulas', () => {
  const t = table([['Título', 'cubierta', '@SUM(A1)'], ['  =1+1', '-cmd', '+2']]); t.cells[0][1].merged = true;
  expect(tableCsv(t)).toBe('\uFEFF"Título","","\'@SUM(A1)"\r\n"\'  =1+1","\'-cmd","\'+2"\r\n');
});
it('rejects an oversized table before parsing or constructing output', () => {
  const t = table([['x'.repeat(2_000_001)]]); expect(() => tableCsv(t)).toThrow();
});
