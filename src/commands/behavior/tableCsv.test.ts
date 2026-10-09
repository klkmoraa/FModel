import { Blob as NodeBlob } from 'node:buffer';
// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CommandHarness } from './harness';
import type { TableEntity } from '../../document/types';
let h: CommandHarness;
beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { delete (window as any).showSaveFilePicker; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function fixture() {
  await h.run('TABLE', ['4', '1', { x: 0, y: 0 }]);
  const t = [...h.doc.data.entities.values()].find((e): e is TableEntity => e.type === 'table')!;
  h.doc.transact('edit', tx => tx.updateEntity<TableEntity>(t.id, { cells: [[{ text: 'Cuadro' }, { text: '' }, { text: '' }, { text: '' }], ['Clave', 'Tipo', 'Ancho (mm)', 'Cantidad'].map(text => ({ text })), ['P-01', 'Puerta sencilla', '900', '2'].map(text => ({ text }))] }));
  return t.id;
}
async function selected(id: string) {
  const run = h.runner.execute('EXPORTARTABLACSV'); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity'));
  h.runner.submitEntity(id, { x: 0, y: 0 }); await run;
}
it('exports the actual selected table without changing the drawing or clean state', async () => {
  const id = await fixture(), before = h.snapshot(); let written: Blob | undefined;
  Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({ name: 'cuadro.csv', createWritable: async () => ({ write: async (blob: Blob) => { written = blob; }, close: async () => {} }) }) });
  await selected(id); expect(written).toBeDefined();
  expect(await written!.text()).toContain('"P-01","Puerta sencilla","900","2"');
  expect(h.snapshot()).toEqual(before); expect(h.runner.log.at(-1)?.kind).toBe('info'); delete (window as any).showSaveFilePicker;
});
it('cancelling the file picker emits no export success and writes nothing', async () => {
  const id = await fixture(), before = h.snapshot();
  Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => { throw new DOMException('cancel', 'AbortError'); } });
  const start = h.runner.log.length; await selected(id); expect(h.snapshot()).toEqual(before);
  expect(h.runner.log.slice(start).some(e => e.kind === 'info' && /CSV/.test(e.text))).toBe(false); delete (window as any).showSaveFilePicker;
});
it('a write failure reports an error without changing the drawing or declaring export success', async () => {
  const id = await fixture(), before = h.snapshot();
  Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({ name: 'cuadro.csv', createWritable: async () => ({ write: async () => { throw new Error('disk full'); }, close: async () => {} }) }) });
  const start = h.runner.log.length; await selected(id); expect(h.snapshot()).toEqual(before);
  const log = h.runner.log.slice(start); expect(log.some(e => e.kind === 'error' && e.text.includes('disk full'))).toBe(true);
  expect(log.some(e => e.kind === 'info' && /CSV/.test(e.text))).toBe(false);
});
