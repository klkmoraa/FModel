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
