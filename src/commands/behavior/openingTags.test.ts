import { expect, it, vi } from 'vitest';
import { CommandHarness } from './harness';
import { createWallAssembly, readWallSource, readWallAssembly, updateWallAssembly } from '../../model/wallAssembly';
import type { TableEntity, TextEntity } from '../../document/types';
import { translation } from '../../geometry/matrix';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { createClipboardPackage, pasteClipboardPackage } from '../../io/clipboard';
import { readPackage, writePackage } from '../../io/native';
import { createBlock } from '../../blocks/blockOps';

async function fixture(units: 'mm' | 'm' = 'mm', inBlock = false) {
  const h = new CommandHarness(); h.doc.transact('units', tx => tx.setSettings({ units }));
  if (inBlock) {
    h.doc.transact('block', tx => createBlock(tx, h.doc, { name: 'Source', basePoint: { x: 0, y: 0 }, ids: [], mode: 'retain' }));
    await h.run('BEDIT', [], ['Source']);
  }
  const f = units === 'm' ? 0.001 : 1;
  await h.run('WALL', [{ x: 0, y: 0 }, { x: 10000 * f, y: 0 }, '']);
  const id = [...h.doc.data.entities.keys()][0], source = readWallSource(h.doc, id).source;
  h.doc.transact('door', tx => createWallAssembly(tx, id, source, [{ id: 'door', segment: 0, offset: 2000 * f, width: 900 * f, type: 'single', side: 1, hingeEnd: false }]));
  await h.run('OPENINGSCHEDULE', [{ x: 0, y: 5000 * f }]);
  const table = [...h.doc.data.entities.values()].find((e): e is TableEntity => e.type === 'table')!;
  return { h, id, table, f };
}
async function begin(h: CommandHarness, table: TableEntity) {
  const run = h.runner.execute('ETIQUETASHUECOS');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('entity'));
  h.runner.submitEntity(table.id, table.position);
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('distance'));
  return { run };
}
it.each(['mm', 'm'] as const)('confirms physical opening tags in %s, repeats without duplicates and reopens live links', async units => {
  const { h, id, table, f } = await fixture(units);
  const { run } = await begin(h, table); h.runner.submitText('');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  expect(h.editor.preview?.entities?.some(e => e.type === 'text' && e.text === 'P-01')).toBe(true);
  h.runner.submitText(''); await run;
  const tag = [...h.doc.data.entities.values()].find((e): e is TextEntity => e.type === 'text')!;
  expect(tag.height).toBe(100 * f); expect(tag.position.x).toBeCloseTo(2000 * f); expect(tag.position.y).toBeCloseTo(-225 * f);
  const again = await begin(h, table); h.runner.submitText('');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); h.runner.submitText(''); await again.run;
  expect([...h.doc.data.entities.values()].filter(e => e.type === 'text')).toHaveLength(1);
  expect(h.doc.entity(tag.id)).toBeDefined();
  const loaded = readPackage(writePackage(h.doc.data, h.doc.id)), editor = new Editor(createDocument()); editor.doc.replaceData(loaded.data, loaded.documentId);
  editor.doc.transact('edit reloaded', tx => { const a = readWallAssembly(editor.doc, id); a.openings[0].width = 1000 * f; updateWallAssembly(tx, id, a.source, a.openings); });
  expect((editor.doc.entity(table.id) as TableEntity).cells[2][2].text).toBe(String(1000 * f));
  expect((editor.doc.entity(tag.id) as TextEntity).text).toBe('P-01');
});

it('saves live annotations into an independent block copy without losing visible rows', async () => {
  const { h, table } = await fixture('mm', true), { run } = await begin(h, table);
  h.runner.submitText(''); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); h.runner.submitText(''); await run;
  const original = h.doc.entity(table.id) as TableEntity;
  expect((await h.run('BSAVEAS', ['Copy'])).ok).toBe(true);
  const block = [...h.doc.data.blocks.values()].find(b => b.name === 'Copy')!;
  const copy = h.doc.entitiesOf(block.id).find((e): e is TableEntity => e.type === 'table')!;
  expect(copy.cells).toEqual(original.cells); expect(copy.openingSchedule).toBeUndefined();
  const tag = h.doc.entitiesOf(block.id).find((e): e is TextEntity => e.type === 'text')!;
  expect(tag.text).toBe('P-01'); expect(tag.openingTag).toBeUndefined();
});
it('cancels legacy-table linking without changes and detaches copied and pasted annotations', async () => {
  const { h, table } = await fixture();
  h.doc.transact('legacy table', tx => tx.updateEntity<TableEntity>(table.id, { openingSchedule: undefined }));
  const before = new Map(h.doc.data.entities), { run } = await begin(h, table);
  h.runner.submitText(''); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); h.runner.cancel(); await run;
  expect(h.doc.data.entities).toEqual(before); expect(h.editor.preview).toBeNull();
  const retry = await begin(h, table); h.runner.submitText(''); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword')); h.runner.submitText(''); await retry.run;
  const texts = [...h.doc.data.entities.values()].filter(e => e.type === 'text'); const ids = [table.id, texts[0].id];
  const copied = h.editor.transformEntities(ids, translation(0, 1000), 'COPY', true);
  for (const id of copied) { const entity = h.doc.entity(id) as any; expect(entity.openingSchedule).toBeUndefined(); expect(entity.openingTag).toBeUndefined(); }
  const target = createDocument(), pkg = createClipboardPackage(h.doc, ids, h.editor.ctx, { x: 0, y: 0 });
  pasteClipboardPackage(target, pkg, '*model', { x: 0, y: 0 });
  for (const entity of target.data.entities.values() as any) { expect(entity.openingSchedule).toBeUndefined(); expect(entity.openingTag).toBeUndefined(); }
});
