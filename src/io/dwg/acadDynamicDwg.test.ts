import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installDynamicBlocks } from '../../blocks/install';
import { createDocument } from '../../document/defaults';
import type { InsertEntity } from '../../document/types';
import { MODEL_SPACE_ID } from '../../document/types';
import { createContext } from '../../model/context';
import { kindOf } from '../../model/registry';
import { decodeDxfBytes, importDxfFile } from '../dxf/importDxf';
import { parseDxf } from '../dxf/parser';
import { readDwgFile } from './readDwg';

const wasmDir = fileURLToPath(new URL('../../../node_modules/@mlightcad/libredwg-web/wasm', import.meta.url));
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../dxf/fixtures/acad-dynamic/${name}`, import.meta.url)));

async function boxes(file: string, dwg: boolean) {
  const doc = createDocument();
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  const dxf = dwg ? await readDwgFile(fixture(`${file}.dwg`), { wasmDir }) : parseDxf(decodeDxfBytes(fixture(`${file}.dxf`)));
  importDxfFile(doc, dxf, { replace: true, format: dwg ? 'DWG' : 'DXF' });
  const inserts = doc.entitiesOf(MODEL_SPACE_ID).filter((e): e is InsertEntity => e.type === 'insert');
  return { dynamic: [...doc.data.blocks.values()].filter((b) => b.dynamic).length, boxes: inserts.map((i) => { const b = kindOf(i).bbox(i, ctx); return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6); }) };
}

describe('bloques dinámicos de AutoCAD dentro de un DWG', () => {
  for (const file of ['BLOCKLINEARPARAMETER', 'BLOCKPOINTPARAMETER', 'BLOCKROTATIONPARAMETER', 'BLOCKFLIPPARAMETER', 'BLOCKVISIBILITYPARAMETER', 'BLOCKBASEPOINTPARAMETER']) {
    it(`${file}.dwg da el mismo resultado que su DXF`, async () => {
      const a = await boxes(file, true);
      const b = await boxes(file, false);
      expect(a).toEqual(b);
    }, 30_000);
  }
});
