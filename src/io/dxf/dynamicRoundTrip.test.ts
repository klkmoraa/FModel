import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { insertBlock } from '../../blocks/blockOps';
import { installDynamicBlocks } from '../../blocks/install';
import { installDynamicSamples } from '../../blocks/samples';
import { createDocument } from '../../document/defaults';
import type { InsertEntity, VisibilityParam } from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import { createContext } from '../../model/context';
import { exportDxf } from './exportDxf';
import { importDxfIntoDocument } from './importDxf';
import { parseDxf } from './parser';

export function dynamicDoc() {
  const doc = createDocument({ title: 'Dinámicos' });
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  installDynamicSamples(doc);
  const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
  const symbol = doc.findByName('blocks', 'FM Símbolo eléctrico')!;
  const w = panel.dynamic!.parameters.find((p) => p.name === 'Ancho')!;
  const vis = symbol.dynamic!.parameters.find((p): p is VisibilityParam => p.type === 'visibility')!;
  doc.transact('inserts', (tx) => {
    const a = insertBlock(tx, doc, panel.id, MODEL_SPACE_ID, { x: 0, y: 0 });
    tx.updateEntity<InsertEntity>(a.id, { dynamic: { values: { [w.id]: 1800 } } });
    const b = insertBlock(tx, doc, symbol.id, MODEL_SPACE_ID, { x: 3000, y: 0 });
    tx.updateEntity<InsertEntity>(b.id, { dynamic: { values: { [vis.id]: 'Interruptor' } } });
    insertBlock(tx, doc, symbol.id, MODEL_SPACE_ID, { x: 4000, y: 0 });
  });
  return { doc, ctx, panel, symbol, w, vis };
}

describe('exportación de bloques dinámicos con datos FModel', () => {
  it('escribe el XRECORD de cada definición y la XDATA de cada instancia', () => {
    const { doc, ctx } = dynamicDoc();
    const { text } = exportDxf(doc, ctx);
    if (process.env.FMODEL_DXF_OUT) writeFileSync(process.env.FMODEL_DXF_OUT.replace(/\.dxf$/, '-dyn.dxf'), text);
    const dxf = parseDxf(text);
    const appids = dxf.tables.get('APPID')!.records.map((r) => r.pairs.find(([c]) => c === 2)?.[1]);
    expect(appids).toContain('FMODEL');
    const xrecs = dxf.objects.filter((o) => o.type === 'XRECORD' && o.pairs.some(([c, v]) => c === 1 && v === 'FMODEL_DYNAMIC'));
    expect(xrecs.length).toBe([...doc.data.blocks.values()].filter((b) => b.dynamic).length);
    const inserts = dxf.entities.filter((e) => e.type === 'INSERT');
    expect(inserts.every((i) => i.pairs.some(([c, v]) => c === 1001 && v === 'FMODEL'))).toBe(true);
    // otros programas siguen viendo variantes estáticas
    expect(inserts.map((i) => i.pairs.find(([c]) => c === 2)?.[1])).toEqual(expect.arrayContaining([expect.stringMatching(/_V\d+$/)]));
  });
});

function roundTrip() {
  const src = dynamicDoc();
  const { text } = exportDxf(src.doc, src.ctx);
  const doc = createDocument();
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  const report = importDxfIntoDocument(doc, text);
  return { src, doc, ctx, report, text };
}

describe('ida y vuelta DXF de bloques dinámicos', () => {
  it('reconstruye definiciones con entidades propias y sin variantes', () => {
    const { src, doc } = roundTrip();
    const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
    expect(panel.dynamic?.parameters.length).toBe(src.panel.dynamic!.parameters.length);
    expect(panel.dynamic?.actions.length).toBe(src.panel.dynamic!.actions.length);
    const own = new Set(doc.entitiesOf(panel.id).map((e) => e.id));
    for (const a of panel.dynamic!.actions) for (const id of (a as { selection?: string[] }).selection ?? []) expect(own.has(id)).toBe(true);
    expect([...doc.data.blocks.values()].some((b) => /_V\d+$/.test(b.name))).toBe(false);
  });

  it('las instancias apuntan al bloque base con su estado y se evalúan igual', () => {
    const { src, doc, ctx } = roundTrip();
    const inserts = doc.entitiesOf(MODEL_SPACE_ID).filter((e): e is InsertEntity => e.type === 'insert');
    const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
    const pi = inserts.find((i) => i.blockId === panel.id)!;
    expect(pi.dynamic?.values[src.w.id]).toBe(1800);
    const srcInsert = src.doc.entitiesOf(MODEL_SPACE_ID).find((e): e is InsertEntity => e.type === 'insert' && e.blockId === src.panel.id)!;
    const shape = (ents: { type: string }[]) => JSON.stringify(ents.map((e) => ({ ...e, id: undefined, owner: undefined, layer: undefined, order: undefined })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const got = ctx.evaluateBlock(panel.id, pi.dynamic).entities;
    expect(got.length).toBeGreaterThan(0);
    expect(shape(got)).toBe(shape(src.ctx.evaluateBlock(src.panel.id, srcInsert.dynamic).entities));
    const symbol = doc.findByName('blocks', 'FM Símbolo eléctrico')!;
    expect(inserts.filter((i) => i.blockId === symbol.id).map((i) => i.dynamic?.values[src.vis.id])).toEqual(['Interruptor', undefined]);
  });

  it('con datos dañados conserva las variantes estáticas y avisa', () => {
    const { text } = roundTrip();
    const broken = text.replace(/\n 90\n1\n  2\nFM Panel ajustable\n/, '\n 90\n7\n  2\nFM Panel ajustable\n');
    expect(broken).not.toBe(text);
    const doc = createDocument();
    const report = importDxfIntoDocument(doc, broken);
    expect(report.warnings.some((w) => /versión de datos dinámicos/.test(w))).toBe(true);
    expect([...doc.data.blocks.values()].some((b) => /^FM Panel ajustable_V\d+$/.test(b.name))).toBe(true);
    expect(doc.findByName('blocks', 'FM Panel ajustable')?.dynamic).toBeUndefined();
  });
});
