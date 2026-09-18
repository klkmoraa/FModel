import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installDynamicBlocks } from '../../blocks/install';
import { createDocument } from '../../document/defaults';
import type { Entity } from '../../document/types';
import { createContext } from '../../model/context';
import { kindOf } from '../../model/registry';
import { decodeDxfBytes, importDxfFile, importDxfIntoDocument } from '../dxf/importDxf';
import { readDwgFile } from './readDwg';

const wasmDir = fileURLToPath(new URL('../../../node_modules/@mlightcad/libredwg-web/wasm', import.meta.url));
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

async function both(base: string) {
  const dwgDoc = createDocument();
  const dwgReport = importDxfFile(dwgDoc, await readDwgFile(fixture(`${base}.dwg`), { wasmDir }), { replace: true, format: 'DWG' });
  const dxfDoc = createDocument();
  const dxfReport = importDxfIntoDocument(dxfDoc, decodeDxfBytes(fixture(`${base}.dxf`)), { replace: true });
  return { dwgDoc, dwgReport, dxfDoc, dxfReport };
}

const count = (list: Entity[]) => {
  const m: Record<string, number> = {};
  for (const e of list) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

function extents(doc: ReturnType<typeof createDocument>) {
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of doc.data.entities.values()) {
    if (e.type === 'xline' || e.type === 'ray') continue;
    try {
      const b = kindOf(e).bbox(e, ctx);
      if (!Number.isFinite(b.minX)) continue;
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    } catch {
      /* sin caja */
    }
  }
  return { minX, minY, maxX, maxY };
}

describe('lectura DWG con LibreDWG', () => {
  for (const base of ['sample_2018', 'sample_2000', 'example_2018']) {
    it(`${base}.dwg se importa igual que su DXF equivalente escrito por AutoCAD`, async () => {
      const { dwgDoc, dwgReport, dxfDoc } = await both(base);
      expect(dwgReport.summary.es).toMatch(/^DWG /);
      expect(count([...dwgDoc.data.entities.values()])).toEqual(count([...dxfDoc.data.entities.values()]));
      const names = (d: typeof dwgDoc) => [...d.data.layers.values()].map((l) => `${l.name}|${l.color}|${l.on}|${l.frozen}|${l.locked}|${l.lineweight}`).sort();
      expect(names(dwgDoc)).toEqual(names(dxfDoc));
      const blocks = (d: typeof dwgDoc) => [...d.data.blocks.values()].map((b) => b.name).filter((n) => !n.startsWith('*')).sort();
      expect(blocks(dwgDoc)).toEqual(blocks(dxfDoc));
      const a = extents(dwgDoc);
      const b = extents(dxfDoc);
      for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(a[k]).toBeCloseTo(b[k], 3);
    }, 30_000);
  }

  it('un archivo que no es DWG se rechaza con un error claro', async () => {
    await expect(readDwgFile(new TextEncoder().encode('hola mundo'), { wasmDir })).rejects.toThrow(/no es un DWG/);
  });

  it('un DWG truncado no cuelga: da error o importa lo legible', async () => {
    const bytes = fixture('sample_2018.dwg').slice(0, 4000);
    const outcome = await readDwgFile(bytes, { wasmDir }).then(
      (dxf) => importDxfFile(createDocument(), dxf, { format: 'DWG' }).summary.es,
      (err: Error) => err.message,
    );
    expect(typeof outcome).toBe('string');
  }, 30_000);
});
