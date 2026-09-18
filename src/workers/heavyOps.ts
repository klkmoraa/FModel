import type { HealthReport } from '../audit/health';
import { analyzeDrawing } from '../audit/health';
import { installDynamicBlocks } from '../blocks/install';
import { CadDocument } from '../document/document';
import { createDocument } from '../document/defaults';
import type { DocumentData } from '../document/types';
import type { DxfExportReport } from '../io/dxf/exportDxf';
import { exportDxf } from '../io/dxf/exportDxf';
import type { ImportReport } from '../io/dxf/importDxf';
import { importDxfFile, importDxfIntoDocument } from '../io/dxf/importDxf';
import type { DxfFile } from '../io/dxf/parser';
import { createContext } from '../model/context';

/**
 * Operaciones pesadas sin estado compartido: reciben datos serializables (clon estructurado)
 * y devuelven resultados serializables. Se ejecutan en un Web Worker o, si no hay, en el hilo principal.
 */
function contextFor(data: DocumentData) {
  const doc = new CadDocument(data);
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  return { doc, ctx };
}

export const HEAVY_OPS = {
  exportDxf(payload: { data: DocumentData }): { text: string; report: DxfExportReport } {
    const { doc, ctx } = contextFor(payload.data);
    return exportDxf(doc, ctx);
  },
  analyze(payload: { data: DocumentData }): HealthReport {
    const { doc, ctx } = contextFor(payload.data);
    return analyzeDrawing(doc, ctx);
  },
  /** Lee un DXF completo en un documento nuevo (abrir, referencias externas). */
  readDxf(payload: { text: string }): { data: DocumentData; report: ImportReport } {
    const doc = createDocument();
    const report = importDxfIntoDocument(doc, payload.text, { replace: true });
    return { data: doc.data, report };
  },
  /** Traduce un DWG a la estructura intermedia del DXF con LibreDWG (carga diferida). */
  async parseDwg(payload: { bytes: Uint8Array }): Promise<DxfFile> {
    const [{ readDwgFile }, { default: wasmFile }] = await Promise.all([import('../io/dwg/readDwg'), import('../io/dwg/wasmUrl')]);
    return readDwgFile(payload.bytes, { wasmFile });
  },
  /** Lee un DWG completo en un documento nuevo (abrir). */
  async readDwg(payload: { bytes: Uint8Array }): Promise<{ data: DocumentData; report: ImportReport }> {
    const dxf = await HEAVY_OPS.parseDwg(payload);
    const doc = createDocument();
    const report = importDxfFile(doc, dxf, { replace: true, format: 'DWG' });
    return { data: doc.data, report };
  },
};

export type HeavyOps = typeof HEAVY_OPS;
export type HeavyOp = keyof HeavyOps;
