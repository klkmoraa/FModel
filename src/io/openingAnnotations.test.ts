import { expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import { CommandHarness } from '../commands/behavior/harness';
import { createWallAssembly, readWallSource } from '../model/wallAssembly';
import { fromNativeFile, toNativeFile, FORMAT_VERSION } from './native';

async function fixture() {
  const h = new CommandHarness();
  await h.run('WALL', [{ x: 0, y: 0 }, { x: 10000, y: 0 }, '']);
  const anchorId = [...h.doc.data.entities.keys()][0];
  const source = readWallSource(h.doc, anchorId).source;
  h.doc.transact('door', tx => createWallAssembly(tx, anchorId, source, [{ id: 'door', segment: 0, offset: 2000, width: 900, type: 'single', side: 1, hingeEnd: false }]));
  await h.run('OPENINGSCHEDULE', [{ x: 0, y: 5000 }]);
  const table = [...h.doc.data.entities.values()].find(e => e.type === 'table')!;
  h.doc.transact('links', tx => {
    tx.updateEntity(table.id, { openingSchedule: { version: 1, language: 'es', tags: { height: 100, style: h.doc.settings.currentTextStyle, layer: h.doc.settings.currentLayer } } } as never);
  });
  await h.run('TEXT', [{ x: 2000, y: -225 }, '100', '0', 'P-01', '']);
  const tag = [...h.doc.data.entities.values()].find(e => e.type === 'text')!;
  h.doc.transact('link tag', tx => tx.updateEntity(tag.id, { openingTag: { version: 1, scheduleId: table.id, anchorId, openingId: 'door', base: { x: 2000, y: -225 } } } as never));
  return { h, table, tag };
}

it('retains opening associations in native v5 and rejects malformed links', async () => {
  const { h, table, tag } = await fixture();
  expect(FORMAT_VERSION).toBe(5);
  const file = toNativeFile(h.doc.data, h.doc.id);
  const loaded = fromNativeFile(file);
  expect(loaded.data.entities.get(table.id)).toEqual(h.doc.entity(table.id));
  expect(loaded.data.entities.get(tag.id)).toEqual(h.doc.entity(tag.id));
  for (const patch of [{ version: 2 }, { tags: { height: -1 } }, { language: 'unknown' }, { language: ['es'] }]) {
    const bad = structuredClone(file);
    const record = bad.collections.entities!.find((e: any) => e.id === table.id) as any;
    Object.assign(record.openingSchedule, patch);
    expect(() => fromNativeFile(bad)).toThrow();
  }
});

it('repairs tables before tags regardless of native entity order', async () => {
  const { h, table, tag } = await fixture(), file = toNativeFile(h.doc.data, h.doc.id);
  const records = file.collections.entities! as any[];
  records.find(e => e.id === table.id).openingSchedule.tags.style = 'missing';
  file.collections.entities = [records.find(e => e.id === tag.id), ...records.filter(e => e.id !== tag.id)];
  const loaded = fromNativeFile(file);
  expect((loaded.data.entities.get(table.id) as any).openingSchedule).toBeUndefined();
  expect((loaded.data.entities.get(tag.id) as any).openingTag).toBeUndefined();
  expect((loaded.data.entities.get(tag.id) as any).text).toBe('P-01');
});

it('detaches nonexistent opening identities but keeps temporarily damaged anchors recoverable', async () => {
  const { h, tag } = await fixture(), file = toNativeFile(h.doc.data, h.doc.id);
  for (const patch of [{ openingId: 'missing' }, { anchorId: [...h.doc.data.entities.values()].find(e => e.type === 'line')!.id }]) {
    const bad = structuredClone(file);
    Object.assign((bad.collections.entities!.find((e: any) => e.id === tag.id) as any).openingTag, patch);
    const loaded = fromNativeFile(bad);
    expect((loaded.data.entities.get(tag.id) as any).openingTag).toBeUndefined();
    expect((loaded.data.entities.get(tag.id) as any).text).toBe('P-01');
  }
  const damaged = structuredClone(file), anchorId = (h.doc.entity(tag.id) as any).openingTag.anchorId;
  (damaged.collections.entities!.find((e: any) => e.id === anchorId) as any).meta.fmodelWallAssembly = { version: 1 };
  expect((fromNativeFile(damaged).data.entities.get(tag.id) as any).openingTag).toEqual((h.doc.entity(tag.id) as any).openingTag);
});

it('migrates v4 annotations as independent and rejects future versions', async () => {
  const { h, table, tag } = await fixture();
  const file = toNativeFile(h.doc.data, h.doc.id); file.version = 4;
  const loaded = fromNativeFile(file);
  expect((loaded.data.entities.get(table.id) as any).openingSchedule).toBeUndefined();
  expect((loaded.data.entities.get(tag.id) as any).openingTag).toBeUndefined();
  expect((loaded.data.entities.get(tag.id) as any).text).toBe('P-01');
  expect(() => fromNativeFile({ ...file, version: 6 })).toThrow(/más reciente/);
});

it('detaches broken native references with a warning and keeps visible text', async () => {
  const { h, tag } = await fixture();
  const file = toNativeFile(h.doc.data, h.doc.id);
  (file.collections.entities!.find((e: any) => e.id === tag.id) as any).openingTag.scheduleId = 'missing';
  const loaded = fromNativeFile(file);
  expect((loaded.data.entities.get(tag.id) as any).openingTag).toBeUndefined();
  expect((loaded.data.entities.get(tag.id) as any).text).toBe('P-01');
  expect(loaded.warnings.join(' ')).toMatch(/asocia|assoc/i);
  expect(createDocument().data.entities.size).toBe(0);
});
