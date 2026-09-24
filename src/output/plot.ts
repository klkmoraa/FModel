import type { BBox } from '../geometry/bbox';
import { boxCenter, boxFromPoints, emptyBox, expandBox, isEmptyBox, scaleToFitSpan, transformBox } from '../geometry/bbox';
import type { Mat2D } from '../geometry/matrix';
import { invert, multiply, scaling, translation } from '../geometry/matrix';
import type { CadDocument } from '../document/document';
import { defaultPageSetup, paperExtents } from '../document/defaults';
import type { Id, PageSetup, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { ModelContext } from '../model/context';
import { viewportMatrix, viewportOutline } from '../model/kinds/media';
import { kindOf } from '../model/registry';
import { layerVisible } from '../model/visibility';
import type { TraverseEnv } from '../render/traverse';
import { drawEntity, drawSpace, visibleEntities } from '../render/traverse';
import type { SpatialIndex } from '../spatial/spatialIndex';
import { SvgBackend } from './svgBackend';
import type { ImageProvider, VectorBackend } from './vectorSink';
import { VectorSink } from './vectorSink';

export interface PlotContext {
  doc: CadDocument;
  ctx: ModelContext;
  /** índice espacial opcional (acelera el recorte por viewport) */
  index?: SpatialIndex | null;
  images?: ImageProvider;
}

export interface SheetPlan {
  spaceId: Id;
  name: string;
  page: PageSetup;
  paper: { width: number; height: number };
  /** espacio → mm de papel */
  base: Mat2D;
  /** región trazada en coordenadas del espacio (null = todo) */
  region: BBox | null;
  /** escala efectiva en mm de papel por unidad de dibujo */
  scale: number;
  warnings: string[];
}

/** Configuración de página del espacio (presentación o modelo). */
export function pageFor(doc: CadDocument, spaceId: Id): PageSetup {
  const layout = doc.data.layouts.get(spaceId);
  if (layout) return layout.page;
  return doc.settings.modelPage ?? { ...defaultPageSetup('ISO A3', 'landscape'), plotArea: 'extents', plotScale: 0, center: true };
}

/** Extensión de los objetos trazables de un espacio. */
export function plotExtents(pc: PlotContext, spaceId: Id): BBox {
  const b = emptyBox();
  const env = plotEnv(pc, defaultPageSetup());
  for (const e of visibleEntities(env, spaceId, null, null)) {
    try {
      const eb = kindOf(e).bbox(e, pc.ctx);
      if (Number.isFinite(eb.minX) && Number.isFinite(eb.minY) && Number.isFinite(eb.maxX) && Number.isFinite(eb.maxY)) expandBox(b, eb);
    } catch {
      /* entidad sin caja */
    }
  }
  return b;
}

/** Calcula la transformación de una hoja a partir de su configuración de página. */
export function planSheet(pc: PlotContext, spaceId: Id, pageOverride?: PageSetup): SheetPlan {
  const doc = pc.doc;
  const page = pageOverride ?? pageFor(doc, spaceId);
  const paper = paperExtents(page);
  const layout = doc.data.layouts.get(spaceId);
  const name = layout?.name ?? (spaceId === MODEL_SPACE_ID ? 'Modelo' : (doc.data.blocks.get(spaceId)?.name ?? spaceId));
  const warnings: string[] = [];
  if (layout && page.plotArea === 'layout') {
    return { spaceId, name, page, paper, base: translation(page.offset.x, page.offset.y), region: null, scale: 1, warnings };
  }
  let region: BBox;
  if (page.plotArea === 'window' && page.window) region = boxFromPoints([page.window.min, page.window.max]);
  else region = plotExtents(pc, spaceId);
  if (isEmptyBox(region)) {
    warnings.push('No hay objetos trazables en el área seleccionada.');
    region = { minX: 0, minY: 0, maxX: paper.width, maxY: paper.height };
  }
  const m = page.margins;
  const pw = Math.max(1, paper.width - m.left - m.right);
  const ph = Math.max(1, paper.height - m.top - m.bottom);
  const rw = Math.max(region.maxX - region.minX, 1e-9);
  const rh = Math.max(region.maxY - region.minY, 1e-9);
  const k = page.plotScale > 0 ? page.plotScale : Math.min(scaleToFitSpan(region.minX, region.maxX, pw), scaleToFitSpan(region.minY, region.maxY, ph));
  if (!Number.isFinite(k) || k <= 0) throw new RangeError('La escala de trazado excede el rango numérico válido. / Plot scale exceeds the valid numeric range.');
  if (page.plotScale > 0 && (rw * k > pw + 1e-6 || rh * k > ph + 1e-6)) warnings.push('A esta escala el área trazada no cabe en la zona imprimible: se recortará.');
  let tx: number;
  let ty: number;
  if (page.center) {
    const center = boxCenter(region);
    tx = m.left + pw / 2 - k * center.x;
    ty = m.bottom + ph / 2 - k * center.y;
  } else {
    tx = m.left - k * region.minX;
    ty = m.bottom - k * region.minY;
  }
  const offsetX = page.offset?.x ?? 0;
  const offsetY = page.offset?.y ?? 0;
  const base = multiply(translation(tx + offsetX, ty + offsetY), scaling(k, k));
  if (Object.values(base).some((value) => !Number.isFinite(value))) {
    throw new RangeError('La escala de trazado excede el rango numérico válido. / Plot scale exceeds the valid numeric range.');
  }
  return { spaceId, name, page, paper, base, region, scale: k, warnings };
}

function plotEnv(pc: PlotContext, page: PageSetup): TraverseEnv {
  return {
    doc: pc.doc,
    ctx: pc.ctx,
    dark: false,
    background: '#ffffff',
    plotting: true,
    plotStyle: page.plotStyle,
    hidden: undefined,
    isolated: undefined,
    viewport: null,
    dashScale: 1,
  };
}

/** Dibuja una hoja completa sobre un backend vectorial. */
export function drawSheet(pc: PlotContext, plan: SheetPlan, backend: VectorBackend) {
  const { doc, ctx } = pc;
  const sink = new VectorSink(backend, { base: plan.base, paper: plan.paper, plotLineweights: plan.page.plotLineweights, images: pc.images, plotTransparency: plan.page.plotTransparency });
  const env = plotEnv(pc, plan.page);
  const prevSheet = ctx.sheetName;
  const prevScale = ctx.annotationScale;
  ctx.sheetName = plan.name;
  if (doc.data.layouts.has(plan.spaceId)) ctx.annotationScale = 1;
  try {
    const layout = doc.data.layouts.get(plan.spaceId);
    if (!layout) {
      sink.save();
      const m = plan.page.margins;
      // recorte a la zona imprimible
      if (plan.page.plotArea !== 'layout') sink.clipPaper({ minX: m.left, minY: m.bottom, maxX: plan.paper.width - m.right, maxY: plan.paper.height - m.top });
      drawSpace(sink, env, plan.spaceId, pc.index ?? null, plan.region);
      sink.restore();
      return;
    }
    const list = visibleEntities(env, plan.spaceId, null, null);
    const drawPaper = () => {
      for (const e of list) drawEntity(sink, env, e, null);
    };
    if (!plan.page.plotPaperspaceLast) drawPaper();
    for (const vp of list) {
      if (vp.type !== 'viewport' || !vp.on) continue;
      drawViewport(pc, sink, env, vp as ViewportEntity);
    }
    if (plan.page.plotPaperspaceLast) drawPaper();
  } finally {
    ctx.sheetName = prevSheet;
    ctx.annotationScale = prevScale;
  }
}

function drawViewport(pc: PlotContext, sink: VectorSink, env: TraverseEnv, vp: ViewportEntity) {
  if (!Number.isFinite(vp.scale) || vp.scale <= 0) return;
  const layer = pc.doc.data.layers.get(vp.layer);
  if (!layerVisible(layer, { plotting: true })) return;
  const outline = viewportOutline(vp);
  const m = viewportMatrix(vp);
  const prevScale = pc.ctx.annotationScale;
  sink.save();
  try {
    sink.clip([...outline.map((p, i) => ({ t: i ? 'L' : 'M', x: p.x, y: p.y }) as const), { t: 'Z' as const }]);
    sink.transform(m);
    pc.ctx.annotationScale = vp.scale;
    const modelBox = transformBox(boxFromPoints(outline), invert(m));
    drawSpace(sink, { ...env, viewport: vp, dashScale: pc.doc.settings.psltscale ? 1 / (vp.scale || 1) : 1 }, MODEL_SPACE_ID, pc.index ?? null, pc.index ? modelBox : null);
  } finally {
    pc.ctx.annotationScale = prevScale;
    sink.restore();
  }
}

export interface ExportResult<T> {
  data: T;
  warnings: string[];
  omittedAssets: string[];
}

export function exportSvg(pc: PlotContext, spaceId: Id, pageOverride?: PageSetup): ExportResult<string> {
  const plan = planSheet(pc, spaceId, pageOverride);
  const backend = new SvgBackend(plan.paper.width, plan.paper.height, { title: `${pc.doc.settings.title} — ${plan.name}`, background: '#ffffff' });
  drawSheet(pc, plan, backend);
  return { data: backend.finish(), warnings: plan.warnings, omittedAssets: [] };
}

/** PDF vectorial de una o varias hojas (PUBLISH). */
export async function exportPdf(pc: PlotContext, spaceIds: Id[], pageOverride?: PageSetup): Promise<ExportResult<Uint8Array>> {
  // pdf-lib solo se descarga cuando se exporta un PDF
  const [{ PDFDocument }, { PdfBackend }] = await Promise.all([import('pdf-lib'), import('./pdfBackend')]);
  const pdf = await PDFDocument.create();
  pdf.setTitle(pc.doc.settings.title || 'FModel 2D CAD');
  pdf.setCreator('FModel 2D CAD');
  pdf.setProducer('FModel 2D CAD');
  const warnings: string[] = [];
  const failedAssets = new Set<Id>();
  let substituted = 0;
  for (const id of spaceIds) {
    const plan = planSheet(pc, id, spaceIds.length === 1 ? pageOverride : undefined);
    const backend = new PdfBackend(pdf, plan.paper.width, plan.paper.height);
    drawSheet(pc, plan, backend);
    await backend.finish();
    for (const assetId of backend.failedAssets) failedAssets.add(assetId);
    substituted += backend.substitutedChars;
    for (const w of plan.warnings) warnings.push(`${plan.name}: ${w}`);
  }
  if (substituted) warnings.push(`${substituted} carácter(es) sin equivalente en las fuentes PDF estándar se sustituyeron por «?».`);
  return {
    data: await pdf.save(),
    warnings,
    omittedAssets: [...failedAssets].map((id) => pc.doc.data.assets.get(id)?.name ?? id),
  };
}
