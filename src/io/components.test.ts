import { describe, expect, it } from 'vitest';
import { Editor } from '../editor/editor';
import { CadDocument } from '../document/document';
import { createDocument } from '../document/defaults';
import type { Entity } from '../document/types';
import { CommandHarness } from '../commands/behavior/harness';
import { readComponentAssembly } from '../model/componentAssembly';
import { readPackage, writePackage } from './native';
import { exportDxf } from './dxf/exportDxf';
import { importDxfIntoDocument } from './dxf/importDxf';
import { analyzeDrawing } from '../audit/health';

async function fixture(command: string) {
  const h = new CommandHarness();
  expect((await h.run(command, [{ x: 100, y: 200 }], command === 'STAIRPLAN' ? ['variant=curved', 'rotation=30'] : [])).ok).toBe(true);
  if (command === 'WINDOWELEVATION') {
    h.select([...h.doc.data.entities.keys()][1]);
    expect((await h.run('COMPONENTEDIT', ['width', '2400', 'opening', 'Yes', ''])).ok).toBe(true);
  }
  return h;
}
const commands = ['AXISGRID', 'STAIRPLAN', 'WINDOWELEVATION'];
function nativeGeometry(e: Entity) {
  const { id: _id, owner: _owner, layer: _layer, order: _order, color: _color, linetype: _lt, linetypeScale: _lts, lineweight: _lw, transparency: _tr, visible: _v, locked: _lock, meta: _meta, construction: _construction, annotative: _annotative, ...geometry } = e;
  if ('style' in geometry) delete (geometry as { style?: string }).style;
  // Justified TEXT stores its anchor in position on import; a redundant alignPoint is equivalent.
  if (e.type === 'text' && e.halign !== 'aligned' && e.halign !== 'fit') delete (geometry as { alignPoint?: unknown }).alignPoint;
  return geometry;
}
function expectGeometry(actual: unknown, expected: unknown): void {
  if (typeof expected === 'number') { expect(actual).toBeCloseTo(expected, 8); return; }
  if (Array.isArray(expected)) { expect(actual).toHaveLength(expected.length); expected.forEach((v, i) => expectGeometry((actual as unknown[])[i], v)); return; }
  if (expected && typeof expected === 'object') { for (const [k, v] of Object.entries(expected)) expectGeometry((actual as Record<string, unknown>)[k], v); return; }
  expect(actual).toBe(expected);
}
describe('component native and DXF round trip', () => {
  it.each(commands)('%s retains native geometry, IDs, metadata and editability without migration', async command => {
    const h = await fixture(command), loaded = readPackage(writePackage(h.doc.data, h.doc.id)), doc = new CadDocument(loaded.data, loaded.documentId);
    expect(loaded.warnings).toEqual([]); expect(doc.data.entities).toEqual(h.doc.data.entities); expect(doc.data.groups).toEqual(h.doc.data.groups);
    const group = [...doc.data.groups.values()][0], assembly = readComponentAssembly(doc, group.members.at(-1)!);
    expect(assembly.kind).toBe(command.toLowerCase());
    const next = new CommandHarness(new Editor(doc)); next.select(group.members.at(-1)!);
    expect((await next.run('COMPONENTEDIT', [''])).ok).toBe(true);
  });
  it.each(commands)('%s DXF preserves exact standard shapes/text and reports lost parametric state', async command => {
    const h = await fixture(command), exported = exportDxf(h.doc, h.editor.ctx), doc = createDocument();
    expect(exported.report.transformed.FMODELCOMPONENT?.count).toBe(1);
    expect(exported.report.transformed.FMODELCOMPONENT?.reason).toMatch(/param/i);
    const imported = importDxfIntoDocument(doc, exported.text, { replace: true }); expect(imported.ignored).toEqual({});
    const actual = [...doc.data.entities.values()]; expect(actual).toHaveLength(h.doc.data.entities.size);
    const wanted = [...h.doc.data.entities.values()];
    for (let i = 0; i < wanted.length; i++) {
      const a = nativeGeometry(actual[i]), b = nativeGeometry(wanted[i]);
      // DXF may materialize optional defaults; compare all authored geometric fields.
      expectGeometry(a, b);
    }
    expect(actual.every(e => e.meta?.fmodelComponent === undefined)).toBe(true);
    expect(() => readComponentAssembly(doc, actual[0].id)).toThrow();
    if (command === 'AXISGRID') expect(actual.filter(e => e.type === 'text').map(e => e.text)).toEqual(['1', '1', '2', '2', '3', '3', '4', '4', 'A', 'A', 'B', 'B', 'C', 'C']);
    if (command === 'STAIRPLAN') expect(actual.filter(e => e.type === 'arc').map(e => e.radius)).toEqual([1000, 2000]);
    if (command === 'WINDOWELEVATION') expect(actual[0]).toMatchObject({ vertices: [{ x: 100, y: 200 }, { x: 2500, y: 200 }, { x: 2500, y: 1400 }, { x: 100, y: 1400 }] });
  });
  it('finite but corrupt imported metadata cannot edit a valid native drawing', async () => {
    const h = await fixture('AXISGRID'), group = [...h.doc.data.groups.values()][0], first = h.doc.entity(group.members[0])!;
    h.doc.transact('corrupt', tx => tx.updateEntity(first.id, { meta: { ...first.meta, fmodelComponent: { ...(first.meta!.fmodelComponent as object), parameters: { columns: 200, rows: 200 } } } }));
    const loaded = readPackage(writePackage(h.doc.data, h.doc.id)), doc = new CadDocument(loaded.data, loaded.documentId), next = new CommandHarness(new Editor(doc)); next.select(first.id);
    const before = next.snapshot(); expect((await next.run('COMPONENTEDIT', [''])).ok).toBe(false); expect(next.snapshot()).toEqual(before);
  });
  it('shrunk component with additional groups reopens without broken references or silent membership repair', async () => {
    const h = await fixture('STAIRPLAN'), assembly = readComponentAssembly(h.doc, [...h.doc.data.entities.keys()][0]);
    const removed = assembly.roles.get('tread-15')!, retained = assembly.roles.get('inner')!;
    h.doc.transact('additional group', tx => tx.add('groups', { id: 'user-group', name: 'User group', description: 'Original description', selectable: false, members: [removed, retained] }));
    h.select(retained); expect((await h.run('COMPONENTEDIT', ['steps', '8', ''])).ok).toBe(true);
    expect(analyzeDrawing(h.doc, h.editor.ctx).issues.filter(issue => issue.code === 'broken-group')).toEqual([]);
    const loaded = readPackage(writePackage(h.doc.data, h.doc.id)), doc = new CadDocument(loaded.data, loaded.documentId), next = new CommandHarness(new Editor(doc));
    expect(loaded.warnings).toEqual([]); expect(doc.data.groups).toEqual(h.doc.data.groups);
    expect(doc.data.groups.get('user-group')).toEqual({ id: 'user-group', name: 'User group', description: 'Original description', selectable: false, members: [retained] });
    expect(analyzeDrawing(doc, next.editor.ctx).issues.filter(issue => issue.code === 'broken-group')).toEqual([]);
  });
});
