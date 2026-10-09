import { expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { CommandHarness } from './harness';
import { exportPdf, planSheet } from '../../output/plot';
it.each(['mm', 'm'] as const)('creates unique sheets at physical scale in %s and publishes multiple pages', async (units) => {
  const h = new CommandHarness(), f = units === 'mm' ? 1000 : 1;
  h.doc.transact('units', tx => tx.setSettings({ units }));
  await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 6 * f, y: 4 * f }]);
  await h.run('RECTANG', [{ x: 10 * f, y: 0 }, { x: 16 * f, y: 4 * f }]);
  h.select(...h.doc.data.entities.keys());
  const before = new Map(h.doc.data.layouts), entities = new Map(h.doc.data.entities);
  expect((await h.run('SHEETSET', ['A3', '1:50', 'Proyecto', 'Planta', ''])).ok).toBe(true);
  const sheets = [...h.doc.data.layouts.values()].filter(l => !before.has(l.id));
  expect(sheets).toHaveLength(2);
  expect(new Set(sheets.map(l => l.name)).size).toBe(2);
  for (const l of sheets) {
    const v = h.doc.entitiesOf(l.id).find(e => e.type === 'viewport')!;
    expect(v).toMatchObject({ type: 'viewport', scale: units === 'mm' ? 0.02 : 20, displayLocked: true, width: 120, height: 80 });
    expect(planSheet({ doc: h.doc, ctx: h.editor.ctx }, l.id).scale).toBe(1);
  }
  const pdf = await exportPdf({ doc: h.doc, ctx: h.editor.ctx }, sheets.map(l => l.id));
  expect((await PDFDocument.load(pdf.data)).getPageCount()).toBe(2);
  h.undo();
  expect(h.doc.data.entities).toEqual(entities);
  expect(h.doc.data.layouts).toEqual(before);
  h.redo();
});
it('rejects oversize frames and cancels sheet preview without creating layouts', async () => {
  const h = new CommandHarness();
  await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 6000, y: 4000 }]);
  h.select(...h.doc.data.entities.keys());
  const before = new Map(h.doc.data.layouts);
  expect((await h.run('SHEETSET', ['A4', '1:1', 'Proyecto', 'Planta'])).ok).toBe(false);
  expect(h.doc.data.layouts).toEqual(before);
  h.select(...h.doc.data.entities.keys());
  const run = h.runner.execute('SHEETSET');
  for (const step of ['A3', '1:50', 'Proyecto', 'Planta']) {
    await vi.waitFor(() => expect(h.runner.pending).not.toBeNull());
    h.runner.submitText(step);
  }
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  h.runner.cancel();
  await run;
  expect(h.doc.data.layouts).toEqual(before);
  expect(h.editor.preview).toBeNull();
});
