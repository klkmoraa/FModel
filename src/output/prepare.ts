import { installDynamicBlocks } from '../blocks/install';
import { CadDocument } from '../document/document';
import type { Id, PageSetup } from '../document/types';
import { ModelContext } from '../model/context';
import { prepareExportImages } from '../render/assets';
import { SpatialIndex } from '../spatial/spatialIndex';
import { exportSvg, planSheet, type PlotContext } from './plot';

export interface PreparedPlotContext extends PlotContext {
  omittedAssets: string[];
  dispose(): void;
}

/** Captura un dibujo y prepara sus recursos para trazado sin leer cambios posteriores. */
export async function preparePlotContext(source: CadDocument, sourceContext: Pick<ModelContext, 'measureText' | 'sheetName' | 'fileName'>, signal?: AbortSignal): Promise<PreparedPlotContext> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const doc = new CadDocument(structuredClone(source.data), source.id);
  const ctx = new ModelContext(doc);
  let index: SpatialIndex | undefined;
  try {
    ctx.measureText = sourceContext.measureText;
    ctx.annotationScale = doc.settings.annotationScale;
    ctx.sheetName = sourceContext.sheetName;
    ctx.fileName = sourceContext.fileName;
    installDynamicBlocks(ctx);
    index = new SpatialIndex(ctx);
    const preparedImages = await prepareExportImages(doc, signal);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const preparedIndex = index;
    return { doc, ctx, index, images: preparedImages.get, omittedAssets: preparedImages.omittedAssets, dispose: () => { preparedIndex.dispose(); ctx.dispose(); } };
  } catch (error) {
    index?.dispose();
    ctx.dispose();
    throw error;
  }
}

/** La vista previa usa los mismos recursos y trazado SVG que la exportación. */
export async function preparePlotPreview(source: CadDocument, sourceContext: Pick<ModelContext, 'measureText' | 'sheetName' | 'fileName'>, spaceId: Id, page: PageSetup, signal?: AbortSignal) {
  const pc = await preparePlotContext(source, sourceContext, signal);
  try {
    const plan = planSheet(pc, spaceId, page);
    const { data, warnings } = exportSvg(pc, spaceId, page);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return { svg: data, scale: plan.scale, warnings, omittedAssets: pc.omittedAssets };
  } finally {
    pc.dispose();
  }
}
