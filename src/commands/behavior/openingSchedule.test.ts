import { createContext } from '../../model/context';
import { exportDxf } from '../../io/dxf/exportDxf';
import { importDxfIntoDocument } from '../../io/dxf/importDxf';
import { createDocument } from '../../document/defaults';
import { beforeEach, expect, it, vi } from 'vitest';
import type { TableEntity } from '../../document/types';
import { createWallAssembly } from '../../model/wallAssembly';
import { readPackage, writePackage } from '../../io/native';
import { CommandHarness } from './harness';
const p = (x: number, y = 0) => ({ x, y });
let h: CommandHarness;
beforeEach(() => { h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
async function fixture(units: 'mm' | 'm' = 'mm') {
  h.doc.transact('units', tx => tx.setSettings({ units }));
  const factor = units === 'm' ? 0.001 : 1;
  await h.run('WALL', [p(0), p(10000 * factor), '']);
  const wall = [...h.doc.data.entities.values()].find(e => e.type === 'mline')!;
  h.doc.transact('openings', tx => createWallAssembly(tx, wall.id, { vertices: [p(0), p(10000 * factor)], closed: false, scale: 150 * factor, justification: 'zero', style: wall.type === 'mline' ? wall.style : '', owner: wall.owner }, [
    { id: 'a', segment: 0, offset: 2000 * factor, width: 900 * factor, type: 'single', side: 1, hingeEnd: false },
    { id: 'b', segment: 0, offset: 4000 * factor, width: 900 * factor, type: 'single', side: -1, hingeEnd: true },
    { id: 'c', segment: 0, offset: 6500 * factor, width: 1200 * factor, type: 'fixed', side: 1, hingeEnd: false },
  ]));
  return wall.id;
}
it.each(['mm', 'm'] as const)('opening schedule groups once per assembly in %s, keeps sources and roundtrips a native table', async units => {
  await fixture(units); h.editor.setPrefs({ lang: units === 'mm' ? 'es' : 'en' });
  const before = new Map(h.doc.data.entities);
  const result = await h.run('CUADROHUECOS', [p(100, 100)]); expect(result.errors).toEqual([]);
  const table = [...h.doc.data.entities.values()].find((e): e is TableEntity => e.type === 'table'); expect(table).toBeDefined();
  expect(table!.cells[2].map(c => c.text)).toEqual(['P-01', units === 'mm' ? 'Puerta sencilla' : 'Single door', units === 'mm' ? '900' : '0.9', '2']);
  expect(table!.cells[3].map(c => c.text)).toEqual(['V-01', units === 'mm' ? 'Ventana fija' : 'Fixed window', units === 'mm' ? '1200' : '1.2', '1']);
  expect(table!.columnWidths[0]).toBe(units === 'mm' ? 20 : 0.02);
  expect(new Map([...before.keys()].map(id => [id, h.doc.entity(id)]))).toEqual(before);
  const loaded = readPackage(writePackage(h.doc.data, h.doc.id)); expect(loaded.data.entities.get(table!.id)).toEqual(table);
  const dxf = exportDxf(h.doc, createContext(h.doc));
  const imported = createDocument(); importDxfIntoDocument(imported, dxf.text, { replace: true });
  const contents = [...imported.data.entities.values()].flatMap(e => e.type === 'text' ? [e.text] : e.type === 'mtext' ? [e.contents] : []);
  expect(contents.some(text => text.includes('P-01'))).toBe(true); expect(contents.some(text => text.includes('V-01'))).toBe(true);
  h.undo(); expect(h.doc.data.entities).toEqual(before); h.redo(); expect(h.doc.entity(table!.id)).toEqual(table);
});
it('cancel placement leaves no table or style behind', async () => {
  await fixture(); const before = h.snapshot(), styles = new Map(h.doc.data.tableStyles);
  const run = h.runner.execute('OPENINGSCHEDULE'); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('point'));
  const preview = h.runner.pending!.req.preview!(p(0)); expect(preview?.items?.length).toBeGreaterThan(5);
  h.runner.cancel(); await run; expect(h.snapshot().entities).toEqual(before.entities); expect(h.doc.data.tableStyles).toEqual(styles); expect(h.editor.preview).toBeNull();
});
it('rejects malformed source and empty drawing without mutation', async () => {
  expect((await h.run('OPENINGSCHEDULE')).errors).toHaveLength(1);
  const id = await fixture(); h.doc.transact('damage', tx => tx.updateEntity(id, { meta: { fmodelWallAssembly: { version: 1 } } }));
  const before = h.snapshot(); expect((await h.run('OPENINGSCHEDULE')).errors).toHaveLength(1); expect(h.snapshot().entities).toEqual(before.entities);
});
it('refuses a stale snapshot if sources change while placing', async () => {
  const id = await fixture(); const run = h.runner.execute('OPENINGSCHEDULE'); await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('point'));
  h.doc.transact('concurrent edit', tx => tx.updateEntity(id, { locked: true }));
  const before = h.snapshot(); h.runner.submitPoint(p(0)); await run;
  expect(h.runner.log.at(-1)?.kind).toBe('warn'); expect(h.snapshot().entities).toEqual(before.entities);
});
