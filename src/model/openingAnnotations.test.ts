import { expect, it } from 'vitest';
import { CommandHarness } from '../commands/behavior/harness';
import { createWallAssembly, readWallSource, readWallAssembly, updateWallAssembly } from './wallAssembly';
import type { TableEntity, TextEntity } from '../document/types';
import { translation } from '../geometry/matrix';
import { createBlock, redefineBlock } from '../blocks/blockOps';
import { canDeleteLayer, createLayer, layerUsage, mergeLayers, purgeEmptyLayers } from '../layers/layerOps';
import { findUnused, purge } from '../audit/purge';

async function fixture() {
  const h = new CommandHarness(); h.editor.setPrefs({ lang: 'es' });
  await h.run('WALL', [{ x: 0, y: 0 }, { x: 10000, y: 0 }, '']);
  const id = [...h.doc.data.entities.keys()][0], source = readWallSource(h.doc, id).source;
  h.doc.transact('openings', tx => createWallAssembly(tx, id, source, [
    { id: 'door', segment: 0, offset: 2000, width: 900, type: 'single', side: 1, hingeEnd: false },
    { id: 'window', segment: 0, offset: 6500, width: 1200, type: 'fixed', side: 1, hingeEnd: false },
  ]));
  await h.run('OPENINGSCHEDULE', [{ x: 0, y: 5000 }]);
  const table = [...h.doc.data.entities.values()].find((e): e is TableEntity => e.type === 'table')!;
  h.doc.transact('enable tags', tx => tx.updateEntity<TableEntity>(table.id, { openingSchedule: { version: 1, language: 'es', tags: { height: 100, style: h.doc.settings.currentTextStyle, layer: h.doc.settings.currentLayer } } }));
  const tags = () => [...h.doc.data.entities.values()].filter((e): e is TextEntity => e.type === 'text' && !!e.openingTag);
  const edit = (change: (a: ReturnType<typeof readWallAssembly>) => void) => h.doc.transact('edit openings', tx => {
    const a = readWallAssembly(h.doc, id); change(a); updateWallAssembly(tx, id, a.source, a.openings);
  });
  return { h, id, table, tags, edit };
}

it('updates opening keys, counts, positions and additions atomically with undo/redo', async () => {
  const { h, table, tags, edit } = await fixture();
  expect(tags().map(e => e.text)).toEqual(['P-01', 'V-01']);
  const door = tags()[0], before = new Map(h.doc.data.entities);
  h.editor.transformEntities([door.id], translation(70, 40), 'MOVE');
  const moved = h.doc.entity(door.id) as TextEntity;
  edit(a => { a.openings[0].offset += 500; a.openings.push({ ...a.openings[0], id: 'narrow', offset: 4000, width: 800 }); });
  expect(tags().find(e => e.id === door.id)?.text).toBe('P-02');
  expect(tags().find(e => e.id === door.id)?.position).toEqual({ x: moved.position.x + 500, y: moved.position.y });
  expect((h.doc.entity(table.id) as TableEntity).cells[2].map(c => c.text)).toEqual(['P-01', 'Puerta sencilla', '800', '1']);
  expect(tags()).toHaveLength(3);
  const after = new Map(h.doc.data.entities); h.undo();
  expect(tags()).toHaveLength(2); expect((h.doc.entity(table.id) as TableEntity).cells[2][2].text).toBe('900');
  h.redo(); expect(h.doc.data.entities).toEqual(after);
  h.undo(); h.undo(); expect(h.doc.data.entities).toEqual(before);
});

it.each(['retain', 'convert'] as const)('preserves visible annotations when creating and redefining blocks (%s)', async mode => {
  const { h, table, tags } = await fixture(), originals = [h.doc.entity(table.id)!, ...tags()];
  const before = new Map(h.doc.data.entities);
  const { block } = h.doc.transact('BLOCK', tx => createBlock(tx, h.doc, { name: 'Annotations', ids: originals.map(e => e.id), basePoint: { x: 0, y: 0 }, mode }));
  const copies = h.doc.entitiesOf(block.id), copiedTable = copies.find((e): e is TableEntity => e.type === 'table')!;
  expect(copiedTable.cells).toEqual(table.cells); expect(copiedTable.openingSchedule).toBeUndefined();
  expect(copies.filter(e => e.type === 'text').map(e => e.openingTag)).toEqual([undefined, undefined]);
  h.doc.transact('redefine', tx => redefineBlock(tx, h.doc, block.id, originals));
  const redefined = h.doc.entitiesOf(block.id).find((e): e is TableEntity => e.type === 'table')!;
  expect(redefined.cells).toEqual(table.cells); expect(redefined.openingSchedule).toBeUndefined();
  h.undo(); h.undo(); expect(h.doc.data.entities).toEqual(before);
});

it('keeps configured tag resources through layer merge and purge with no current openings', async () => {
  const { h, table, tags, edit } = await fixture();
  const { source, target, style } = h.doc.transact('resources', tx => {
    const source = createLayer(tx, h.doc, { name: 'Tags' }), target = createLayer(tx, h.doc, { name: 'Merged' });
    const style = { ...h.doc.data.textStyles.get(h.doc.settings.currentTextStyle)!, id: 'tag-style', name: 'Tag style' }; tx.add('textStyles', style);
    tx.updateEntity<TableEntity>(table.id, { openingSchedule: { ...table.openingSchedule!, tags: { height: 100, layer: source.id, style: style.id } } });
    return { source, target, style };
  });
  const beforeMerge = new Map(h.doc.data.entities);
  h.doc.transact('LAYMRG', tx => mergeLayers(tx, h.doc, [source.id], target.id));
  expect((h.doc.entity(table.id) as TableEntity).openingSchedule?.tags?.layer).toBe(target.id);
  h.undo(); expect(h.doc.data.entities).toEqual(beforeMerge); h.redo();
  edit(a => { a.openings = []; }); expect(tags()).toHaveLength(0);
  expect(layerUsage(h.doc).get(target.id)).toBeGreaterThan(0); expect(canDeleteLayer(h.doc, target.id).ok).toBe(false);
  expect(findUnused(h.doc).some(i => i.id === target.id || i.id === style.id)).toBe(false);
  h.doc.transact('PURGE', tx => { purgeEmptyLayers(tx, h.doc); purge(tx, h.doc, ['layers', 'textStyles']); });
  expect(h.doc.data.layers.has(target.id)).toBe(true); expect(h.doc.data.textStyles.has(style.id)).toBe(true);
});

it('handles last-opening deletion and detaches tags when their schedule is erased', async () => {
  const { h, table, tags, edit } = await fixture();
  edit(a => { a.openings = []; });
  expect(tags()).toHaveLength(0); expect((h.doc.entity(table.id) as TableEntity).cells).toHaveLength(2);
  h.undo(); const originals = tags();
  h.doc.transact('erase schedule', tx => tx.removeEntity(table.id));
  for (const text of originals) expect((h.doc.entity(text.id) as TextEntity).openingTag).toBeUndefined();
  h.undo(); expect(tags()).toEqual(originals);
});

it('keeps contents and flags damaged sources, then recovers without blocking edits', async () => {
  const { h, id, table, tags } = await fixture();
  const source = h.doc.entity(id)!, texts = tags(), cells = table.cells;
  h.doc.transact('damage', tx => tx.updateEntity(id, { meta: { fmodelWallAssembly: { version: 1 } } }));
  expect((h.doc.entity(table.id) as TableEntity).openingSchedule?.status).toBe('review');
  expect((h.doc.entity(table.id) as TableEntity).cells[0][0].text).toContain('Revisar');
  expect(tags()).toEqual(texts);
  h.doc.transact('restore', tx => tx.put('entities', source));
  expect((h.doc.entity(table.id) as TableEntity).openingSchedule?.status).toBeUndefined();
  expect((h.doc.entity(table.id) as TableEntity).cells).toEqual(cells);
});
