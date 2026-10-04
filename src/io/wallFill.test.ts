import { expect, it } from 'vitest';
import { CadDocument } from '../document/document';
import { createDocument } from '../document/defaults';
import type { HatchEntity } from '../document/types';
import { CommandHarness } from '../commands/behavior/harness';
import { createWallAssembly, readWallSource } from '../model/wallAssembly';
import { readComponentAssembly } from '../model/componentAssembly';
import { createContext } from '../model/context';
import { hatchSegments } from '../model/kinds/hatch';
import { loopsArea } from '../model/kinds/polylines';
import { readPackage, writePackage } from './native';
import { exportDxf } from './dxf/exportDxf';
import { importDxfIntoDocument } from './dxf/importDxf';

it('wall fill native and DXF roundtrip retains exact material, graphic properties and actual user pattern lines', async () => {
  const h = new CommandHarness();
  await h.run('WALLRECT', ['Thickness', '300', { x: 0, y: 0 }, { x: 6000, y: 4000 }]); const wall = [...h.doc.data.entities.keys()][0];
  h.doc.transact('empty cut', tx => createWallAssembly(tx, wall, readWallSource(h.doc, wall).source, [{ id: 'empty', segment: 0, offset: 3000, width: 900, type: 'empty', side: 1, hingeEnd: false }]));
  await h.run('COLUMN', [{ x: 1000, y: 1000 }], ['variant=circular', 'diameter=600']);
  const column = [...h.doc.data.entities.values()].find(e => e.meta?.fmodelComponent)!.id;
  const assembly = readWallSource(h.doc, wall).assembly!, component = readComponentAssembly(h.doc, column);
  h.doc.transact('properties', tx => { for (const id of [wall, column]) tx.updateEntity(id, { color: '#7657D5', lineweight: 35, transparency: 20 }); });
  const source = new Map(h.doc.data.entities), groups = new Map(h.doc.data.groups);
  h.select(...assembly.members, column); expect((await h.run('WALLFILL', [''])).ok).toBe(true);
  h.select(...assembly.members, column); expect((await h.run('WALLFILL', ['Hatched', 'Spacing', '400', 'Angle', '30', ''])).ok).toBe(true);
  const fills = [...h.doc.data.entities.values()].filter((e): e is HatchEntity => e.type === 'hatch');
  expect(fills).toHaveLength(4); expect(fills.map(e => loopsArea(e.loops))).toEqual([5730000, 90000 * Math.PI, 5730000, 90000 * Math.PI]);
  const pkg = readPackage(writePackage(h.doc.data, h.doc.id)), reopened = new CadDocument(pkg.data, pkg.documentId);
  expect(pkg.warnings).toEqual([]); expect(reopened.data.entities).toEqual(h.doc.data.entities); expect(reopened.data.groups).toEqual(groups);
  expect(readWallSource(reopened, wall).assembly).toEqual(assembly); expect(readComponentAssembly(reopened, column)).toEqual(component);
  expect(new Map([...source.keys()].map(id => [id, h.doc.entity(id)]))).toEqual(source);
  for (const fill of fills) { expect(reopened.entity(fill.id)).toEqual(fill); expect(fill.associative).toBeUndefined(); expect(fill.meta?.fmodelWallMember).toBeUndefined(); expect(fill.meta?.fmodelComponentMember).toBeUndefined(); }
  const exported = exportDxf(h.doc, createContext(h.doc)); expect(exported.report.transformed.FMODELWALLASSEMBLY?.count).toBe(1);
  expect(exported.report.transformed.FMODELCOMPONENT?.count).toBe(1);
  const imported = createDocument(), report = importDxfIntoDocument(imported, exported.text, { replace: true }); expect(report.ignored).toEqual({});
  const recovered = [...imported.data.entities.values()].filter((e): e is HatchEntity => e.type === 'hatch'); expect(recovered).toHaveLength(4);
  for (let i = 0; i < fills.length; i++) {
    expect(recovered[i].loops).toEqual(fills[i].loops); expect(loopsArea(recovered[i].loops)).toBeCloseTo(loopsArea(fills[i].loops), 6);
    expect(recovered[i].color.toLowerCase()).toBe('#7657d5'); expect(recovered[i]).toMatchObject({ lineweight: 35, transparency: 20, islandStyle: 'normal' });
    expect(recovered[i].associative).toBeUndefined();
    if (fills[i].pattern.type === 'user') {
      expect(recovered[i].origin).toEqual(fills[i].origin);
      expect(recovered[i].pattern).toMatchObject({ type: 'user', scale: 1, double: false }); expect(recovered[i].pattern.spacing).toBeCloseTo(400, 9); expect(recovered[i].pattern.angle).toBeCloseTo(Math.PI / 6, 12);
      const a = hatchSegments(fills[i]), b = hatchSegments(recovered[i]); expect(b.tooDense).toBe(false); expect(b.segments.length).toBeGreaterThan(0); expect(b.segments).toHaveLength(a.segments.length);
      for (let j = 0; j < a.segments.length; j++) for (let end = 0; end < 2; end++) { expect(b.segments[j][end].x).toBeCloseTo(a.segments[j][end].x, 6); expect(b.segments[j][end].y).toBeCloseTo(a.segments[j][end].y, 6); }
    } else expect(recovered[i].pattern.type).toBe('solid');
  }
  expect(recovered[1].loops[0].vertices.map(v => v.bulge)).toEqual([1, 1]); expect(recovered[3].loops[0].vertices.map(v => v.bulge)).toEqual([1, 1]);
});
