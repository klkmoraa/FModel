import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { installDynamicBlocks } from '../../blocks/install';
import { createDocument } from '../../document/defaults';
import type { InsertEntity } from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import { createContext } from '../../model/context';
import { kindOf } from '../../model/registry';
import { decodeDxfBytes, importDxfFile } from './importDxf';
import { parseDxf } from './parser';

const load = (name: string) => parseDxf(decodeDxfBytes(new Uint8Array(readFileSync(new URL(`./fixtures/acad-dynamic/${name}.dxf`, import.meta.url)))));

function importAs(name: string, acadDynamic: boolean) {
  const doc = createDocument();
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  const report = importDxfFile(doc, load(name), { replace: true, acadDynamic });
  const inserts = doc.entitiesOf(MODEL_SPACE_ID).filter((e): e is InsertEntity => e.type === 'insert');
  return { doc, ctx, report, inserts };
}

const box = (e: InsertEntity, ctx: ReturnType<typeof createContext>) => {
  const b = kindOf(e).bbox(e, ctx);
  return [b.minX, b.minY, b.maxX, b.maxY];
};

describe('bloques dinámicos de AutoCAD', () => {
  const supported: [string, string[]][] = [
    ['BLOCKLINEARPARAMETER', ['linear']],
    ['BLOCKPOINTPARAMETER', ['point']],
    ['BLOCKROTATIONPARAMETER', ['rotation']],
    ['BLOCKFLIPPARAMETER', ['flip']],
    ['BLOCKVISIBILITYPARAMETER', ['visibility']],
    ['BLOCKBASEPOINTPARAMETER', ['basepoint']],
  ];
  for (const [file, types] of supported) {
    it(`${file}: cada instancia evaluada en FModel coincide con la geometría que guardó AutoCAD`, () => {
      const dyn = importAs(file, true);
      const ref = importAs(file, false);
      const defs = [...dyn.doc.data.blocks.values()].filter((b) => b.dynamic);
      expect(defs).toHaveLength(1);
      expect(defs[0].dynamic!.parameters.map((p) => p.type)).toEqual(types);
      expect([...dyn.doc.data.blocks.values()].some((b) => b.name.startsWith('*U'))).toBe(false);
      expect(dyn.inserts.length).toBe(ref.inserts.length);
      expect(dyn.inserts.every((i) => i.blockId === defs[0].id)).toBe(true);
      dyn.inserts.forEach((ins, k) => {
        const a = box(ins, dyn.ctx);
        const b = box(ref.inserts[k], ref.ctx);
        for (let q = 0; q < 4; q++) expect(a[q]).toBeCloseTo(b[q], 6);
        const shown = dyn.ctx.evaluateBlock(ins.blockId, ins.dynamic).entities.filter((e) => e.visible && e.type !== 'attdef').length;
        const refShown = ref.ctx.evaluateBlock(ref.inserts[k].blockId).entities.filter((e) => e.visible && e.type !== 'attdef').length;
        expect(shown).toBe(refShown);
      });
      expect(dyn.report.imported['Bloque dinámico de AutoCAD']).toBe(1);
    });
  }

  for (const file of ['BLOCKLOOKUPPARAMETER', 'BLOCKXYPARAMETER', 'BLOCKPOLARPARAMETER', 'BLOCKALIGNMENTPARAMETER']) {
    it(`${file}: sin equivalente fiable, conserva las representaciones estáticas y lo explica`, () => {
      const dyn = importAs(file, true);
      const ref = importAs(file, false);
      expect(dyn.report.warnings.some((w) => /sin equivalente en FModel/.test(w))).toBe(true);
      expect(dyn.report.transformed['Bloque dinámico de AutoCAD']).toBeTruthy();
      expect(dyn.inserts.map((i) => box(i, dyn.ctx))).toEqual(ref.inserts.map((i) => box(i, ref.ctx)));
      expect([...dyn.doc.data.blocks.values()].some((b) => b.dynamic)).toBe(false);
    });
  }
});
