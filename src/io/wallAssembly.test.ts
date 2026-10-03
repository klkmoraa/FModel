import { describe, expect, it } from 'vitest';
import { CadDocument } from '../document/document';
import { createDocument, entityDefaults } from '../document/defaults';
import type { ArcEntity, MLineEntity } from '../document/types';
import { createContext } from '../model/context';
import { createWallAssembly, readWallAssembly, readWallOpening, readWallSource, updateWallAssembly } from '../model/wallAssembly';
import { wallStyle } from '../model/wallStyle';
import { analyzeDrawing } from '../audit/health';
import { exportDxf } from './dxf/exportDxf';
import { importDxfIntoDocument } from './dxf/importDxf';
import { fromNativeFile, readPackage, toNativeFile, writePackage } from './native';
import type { WallOpeningSpec } from '../geometry/wallOpenings';

const door: WallOpeningSpec = { id: 'door', segment: 0, offset: 2000, width: 900, type: 'double', side: 1, hingeEnd: false };
const window: WallOpeningSpec = { ...door, id: 'window', segment: 1, offset: 2000, width: 1200, type: 'fixed' };

function fixture() {
  const doc = createDocument();
  doc.transact('original wall', tx => {
    tx.add('mlineStyles', wallStyle('wall-style', 'Walls'));
    tx.addEntity<MLineEntity>({ ...entityDefaults(doc), id: 'original', type: 'mline', vertices: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], closed: true, style: 'wall-style', scale: 150, justification: 'zero' });
  });
  const source = readWallSource(doc, 'original').source;
  const assembly = doc.transact('cut', tx => createWallAssembly(tx, 'original', source, [door, window]))!;
  return { doc, assembly };
}

describe('wall assembly interchange', () => {
  it('keeps source, group, role identities and editability after a native package round trip', () => {
    const { doc, assembly } = fixture();
    const removed = assembly.members.find(id => (doc.entity(id)?.meta?.fmodelWallMember as { openingId?: string } | undefined)?.openingId === door.id)!;
    const retained = assembly.members.find(id => (doc.entity(id)?.meta?.fmodelWallMember as { openingId?: string } | undefined)?.openingId === window.id)!;
    doc.transact('secondary groups', tx => {
      tx.add('groups', { id: 'mixed', name: 'Mixed', description: 'Keep', selectable: false, members: [retained, removed, 'original'] });
      tx.add('groups', { id: 'becomes-empty', name: 'Empty', description: 'Keep', selectable: false, members: [removed] });
    });
    doc.transact('remove opening', tx => updateWallAssembly(tx, 'original', assembly.source, [window]));
    const loaded = readPackage(writePackage(doc.data, doc.id));
    const reopened = new CadDocument(loaded.data, loaded.documentId);
    expect(loaded.warnings).toEqual([]);
    expect(reopened.data.groups).toEqual(doc.data.groups);
    expect(reopened.data.entities).toEqual(doc.data.entities);
    expect(reopened.data.groups.get('mixed')?.members).toEqual([retained, 'original']);
    expect(reopened.data.groups.get('becomes-empty')?.members).toEqual([]);
    expect(analyzeDrawing(reopened, createContext(reopened)).issues.filter(issue => issue.code === 'broken-group')).toEqual([]);
    expect(readWallOpening(reopened, retained).opening).toEqual(window);
    expect(readWallAssembly(reopened, 'original').source).toEqual(assembly.source);
    reopened.transact('last removal', tx => updateWallAssembly(tx, retained, assembly.source, []));
    expect(readWallSource(reopened, 'original').assembly).toBeNull();
    expect((reopened.entity('original') as MLineEntity).closed).toBe(true);
    expect(reopened.data.groups.get('mixed')?.members).toEqual(['original']);
  });

  it('exports physical wall fragments and true quarter arcs, reports lost association, and does not infer it on import', () => {
    const { doc } = fixture();
    const expectedArcs = [...doc.data.entities.values()].filter((e): e is ArcEntity => e.type === 'arc');
    expect(expectedArcs.map(a => a.radius)).toEqual([450, 450]);
    const exported = exportDxf(doc, createContext(doc));
    expect(exported.report.transformed.FMODELWALLASSEMBLY?.count).toBe(1);
    expect(exported.report.transformed.FMODELWALLASSEMBLY?.reason).toMatch(/huecos.*openings/i);
    expect(exported.report.warnings.join(' ')).toMatch(/\.fmodel.*DXF/i);
    const imported = createDocument();
    const report = importDxfIntoDocument(imported, exported.text, { replace: true });
    expect(report.ignored).toEqual({});
    const arcs = [...imported.data.entities.values()].filter((e): e is ArcEntity => e.type === 'arc');
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) {
      expect(arc.radius).toBeCloseTo(450, 8);
      expect(((arc.endAngle - arc.startAngle + Math.PI * 2) % (Math.PI * 2))).toBeCloseTo(Math.PI / 2, 8);
      expect(() => readWallOpening(imported, arc.id)).toThrow();
    }
    expect([...imported.data.entities.values()].every(e => !e.meta?.fmodelWallMember)).toBe(true);
    const lines = [...imported.data.entities.values()].filter(e => e.type === 'line');
    expect(lines.some(e => e.type === 'line' && (Math.abs(e.start.x - 1550) < 1e-8 || Math.abs(e.end.x - 1550) < 1e-8))).toBe(true);
    expect(lines.some(e => e.type === 'line' && (Math.abs(e.start.x - 2450) < 1e-8 || Math.abs(e.end.x - 2450) < 1e-8))).toBe(true);
  });

  it('rejects imported assembly metadata that does not describe the physical wall before editing', () => {
    const { doc } = fixture();
    const file = structuredClone(toNativeFile(doc.data, doc.id));
    const entities = file.collections.entities as Array<{ id: string; meta?: Record<string, unknown> }>;
    const anchor = entities.find(e => e.id === 'original')!;
    const metadata = anchor.meta!.fmodelWallAssembly as { source: { vertices: Array<{ x: number; y: number }> } };
    metadata.source.vertices[1].x = 5000;
    const loaded = fromNativeFile(file);
    const reopened = new CadDocument(loaded.data, loaded.documentId);
    const before = structuredClone(reopened.data);
    reopened.transact('reject foreign source', tx => {
      expect(() => updateWallAssembly(tx, 'original', readWallSource(doc, 'original').source, [door])).toThrow();
      expect(tx.list()).toHaveLength(0);
    });
    expect(reopened.data).toEqual(before);
  });
});
