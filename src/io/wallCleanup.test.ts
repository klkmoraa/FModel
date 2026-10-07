import { expect, it } from 'vitest';
import { CadDocument } from '../document/document';
import { createDocument } from '../document/defaults';
import { CommandHarness } from '../commands/behavior/harness';
import { createWallAssembly, readWallAssembly, readWallSource } from '../model/wallAssembly';
import { restoreWallCleanup, wallCleanupRecords } from '../model/wallCleanup';
import type { MLineEntity } from '../document/types';
import { createContext } from '../model/context';
import { fromNativeFile, readPackage, toNativeFile, writePackage } from './native';
import { exportDxf } from './dxf/exportDxf';
import { importDxfIntoDocument } from './dxf/importDxf';

it('native roundtrip retains recovery and opening identities; corrupt opaque meta rejects at use; DXF keeps only clean visible faces', async () => {
  const h = new CommandHarness(); await h.run('WALL', ['Thickness', '300', { x: 0, y: 0 }, { x: 6000, y: 0 }, '']);
  const anchor = [...h.doc.data.entities.keys()][0];
  const assembly = h.doc.transact('opening', tx => createWallAssembly(tx, anchor, readWallSource(h.doc, anchor).source, [{ id: 'opening', segment: 0, offset: 4000, width: 900, type: 'empty', side: 1, hingeEnd: false }]))!;
  await h.run('WALL', ['Thickness', '200', { x: 2000, y: 0 }, { x: 2000, y: 2500 }, '']);
  const originalEntities = new Map(h.doc.data.entities), originalGroups = new Map(h.doc.data.groups);
  h.select(...h.doc.data.entities.keys()); expect((await h.run('WALLCLEAN', [''])).ok).toBe(true);
  const loaded = readPackage(writePackage(h.doc.data, h.doc.id)), reopened = new CadDocument(loaded.data, loaded.documentId);
  expect(loaded.warnings).toEqual([]); expect(reopened.data.entities).toEqual(h.doc.data.entities); expect(reopened.data.groups).toEqual(h.doc.data.groups);
  reopened.transact('restore after reopen', tx => restoreWallCleanup(tx, wallCleanupRecords(reopened)));
  expect(reopened.data.entities).toEqual(originalEntities); expect(reopened.data.groups).toEqual(originalGroups); expect(readWallAssembly(reopened, anchor).openings).toEqual(assembly.openings);
  // Generic group MOVE may move hidden MLINEs without transforming native parameters.
  // A saved/reopened drawing has no Undo history: recovery must reveal the current geometry.
  const movedData = readPackage(writePackage(h.doc.data, h.doc.id));
  const moved = new CadDocument(movedData.data, movedData.documentId);
  moved.transact('generic source move', tx => {
    for (const entity of moved.data.entities.values()) if (entity.type === 'mline') tx.updateEntity<MLineEntity>(entity.id, { vertices: entity.vertices.map(p => ({ x: p.x + 100, y: p.y + 200 })), color: '#123456' });
  });
  const movedFile = readPackage(writePackage(moved.data, moved.id)), movedReopened = new CadDocument(movedFile.data, movedFile.documentId), movedAnchor = movedReopened.entity(anchor) as MLineEntity;
  expect(movedReopened.history.entries()).toHaveLength(0);
  const movedResult = movedReopened.transact('recover current geometry', tx => restoreWallCleanup(tx, wallCleanupRecords(movedReopened)));
  expect(movedResult.editedSources).toContain(anchor); expect(movedReopened.entity(anchor)).toMatchObject({ id: anchor, visible: true, vertices: movedAnchor.vertices, color: '#123456', meta: { fmodelWallAssembly: movedAnchor.meta!.fmodelWallAssembly } });
  expect(movedReopened.data.groups).toEqual(originalGroups);
  const file = structuredClone(toNativeFile(h.doc.data, h.doc.id));
  const badAnchor = (file.collections.entities as Array<{ id: string; meta?: Record<string, unknown> }>).find(e => e.id === anchor)!;
  (badAnchor.meta!.fmodelWallCleanup as { selfId: string }).selfId = 'foreign';
  const bad = fromNativeFile(file), corrupt = new CadDocument(bad.data, bad.documentId), before = structuredClone(corrupt.data);
  expect(() => corrupt.transact('reject recovery', tx => restoreWallCleanup(tx, wallCleanupRecords(corrupt)))).toThrow(); expect(corrupt.data).toEqual(before); expect(corrupt.history.entries()).toHaveLength(0);
  const exported = exportDxf(h.doc, createContext(h.doc));
  expect(exported.report.warnings.join(' ')).toMatch(/invisibles.*60.*\.fmodel.*cleanup recovery/);
  const imported = createDocument(); expect(importDxfIntoDocument(imported, exported.text, { replace: true }).ignored).toEqual({});
  const visible = [...imported.data.entities.values()].filter(e => e.visible);
  const cleanLines = [...h.doc.data.entities.values()].filter(e => e.meta?.fmodelWallCleanupOutput !== undefined);
  expect(visible.filter(e => e.type === 'line')).toHaveLength(cleanLines.length + 2); // two unchanged jamb symbols
  expect([...imported.data.entities.values()].some(e => !e.visible)).toBe(true);
  expect([...imported.data.entities.values()].every(e => !e.meta?.fmodelWallCleanup && !e.meta?.fmodelWallCleanupOutput)).toBe(true);
});
