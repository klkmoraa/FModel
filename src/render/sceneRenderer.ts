import type { BBox } from '../geometry/bbox';
import { boxFromPoints, transformBox } from '../geometry/bbox';
import { applyToPoint, invert, multiply } from '../geometry/matrix';
import { paperExtents } from '../document/defaults';
import type { Entity, Id, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { Editor } from '../editor/editor';
import { viewportMatrix, viewportOutline } from '../model/kinds/media';
import { entityVisible } from '../model/visibility';
import type { ViewTransform } from '../view/viewTransform';
import type { ImageSource } from './canvasSink';
import { CanvasSink } from './canvasSink';
import type { RenderTheme } from './theme';
import type { DrawSink, TraverseEnv } from './traverse';
import { drawEntity, drawSpace, visibleEntities } from './traverse';

export interface SceneOptions {
  theme: RenderTheme;
  dpr: number;
  images: ImageSource;
}

function envFor(editor: Editor, theme: RenderTheme, extra: Partial<TraverseEnv> = {}): TraverseEnv {
  return {
    doc: editor.doc,
    ctx: editor.ctx,
    dark: theme.dark,
    background: theme.background,
    plotting: false,
    plotStyle: 'color',
    hidden: editor.hidden,
    isolated: editor.isolated,
    viewport: null,
    dashScale: 1,
    construction: theme.construction,
    showTransparency: editor.prefs.transparencyDisplay,
    ...extra,
  };
}

export function drawGrid(g: CanvasRenderingContext2D, view: ViewTransform, theme: RenderTheme, dpr: number, spacing: number, majorEvery: number, adaptive: boolean, axes = true) {
  let s = spacing > 0 ? spacing : 10;
  const minPx = 9;
  if (adaptive) {
    while (s * view.scale < minPx) s *= majorEvery > 1 ? majorEvery : 2;
    while (s * view.scale > minPx * (majorEvery > 1 ? majorEvery : 2) * 2 && s / (majorEvery || 2) >= spacing * 1e-6) s /= majorEvery > 1 ? majorEvery : 2;
  } else if (s * view.scale < 4) return;
  const box = view.visibleBox();
  const major = s * (majorEvery > 1 ? majorEvery : 5);
  g.save();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.lineWidth = 1;
  const drawLines = (step: number, color: string, skipMajor: boolean) => {
    g.strokeStyle = color;
    g.beginPath();
    const x0 = Math.ceil(box.minX / step) * step;
    for (let x = x0, i = 0; x <= box.maxX && i < 2000; x += step, i++) {
      if (skipMajor && Math.abs(Math.round(x / major) * major - x) < step * 1e-6) continue;
      const sx = Math.round(view.toScreen({ x, y: 0 }).x) + 0.5;
      g.moveTo(sx, 0);
      g.lineTo(sx, view.height);
    }
    const y0 = Math.ceil(box.minY / step) * step;
    for (let y = y0, i = 0; y <= box.maxY && i < 2000; y += step, i++) {
      if (skipMajor && Math.abs(Math.round(y / major) * major - y) < step * 1e-6) continue;
      const sy = Math.round(view.toScreen({ x: 0, y }).y) + 0.5;
      g.moveTo(0, sy);
      g.lineTo(view.width, sy);
    }
    g.stroke();
  };
  drawLines(s, theme.gridMinor, true);
  drawLines(major, theme.gridMajor, false);
  if (axes) {
    const o = view.toScreen({ x: 0, y: 0 });
    g.lineWidth = 1;
    if (o.y >= 0 && o.y <= view.height) {
      g.strokeStyle = theme.axisX;
      g.beginPath();
      g.moveTo(0, Math.round(o.y) + 0.5);
      g.lineTo(view.width, Math.round(o.y) + 0.5);
      g.stroke();
    }
    if (o.x >= 0 && o.x <= view.width) {
      g.strokeStyle = theme.axisY;
      g.beginPath();
      g.moveTo(Math.round(o.x) + 0.5, 0);
      g.lineTo(Math.round(o.x) + 0.5, view.height);
      g.stroke();
    }
  }
  g.restore();
}

/** Dibuja un viewport de papel: recorte y espacio modelo con su escala, congelación y sobrescrituras. */
export function drawViewportContent(sink: DrawSink, editor: Editor, env: TraverseEnv, vp: ViewportEntity, paperVisible: BBox) {
  if (!vp.on || !Number.isFinite(vp.scale) || vp.scale <= 0) return;
  const outline = viewportOutline(vp);
  const m = viewportMatrix(vp);
  const clipBox = boxFromPoints(outline);
  const vis = { minX: Math.max(clipBox.minX, paperVisible.minX), minY: Math.max(clipBox.minY, paperVisible.minY), maxX: Math.min(clipBox.maxX, paperVisible.maxX), maxY: Math.min(clipBox.maxY, paperVisible.maxY) };
  if (vis.minX >= vis.maxX || vis.minY >= vis.maxY) return;
  sink.save();
  const prevScale = editor.ctx.annotationScale;
  try {
    sink.clip(outline.map((p, i) => ({ t: i ? 'L' : 'M', x: p.x, y: p.y }) as const).concat([{ t: 'Z' } as never]));
    sink.transform(m);
    editor.ctx.annotationScale = vp.scale;
    const modelBox = transformBox(vis, invert(m));
    const vEnv: TraverseEnv = { ...env, viewport: vp, dashScale: editor.doc.settings.psltscale ? 1 / (vp.scale || 1) : 1, hidden: undefined, isolated: undefined };
    drawSpace(sink, vEnv, MODEL_SPACE_ID, editor.index, modelBox);
  } finally {
    editor.ctx.annotationScale = prevScale;
    sink.restore();
  }
}

/**
 * Renderizador de la escena base (entidades). Se redibuja con cambios del documento
 * o de la vista; el cursor y las ayudas viven en el overlay.
 */
export function renderScene(g: CanvasRenderingContext2D, editor: Editor, opts: SceneOptions) {
  const { theme, dpr } = opts;
  const view = editor.view;
  const W = Math.round(view.width * dpr);
  const H = Math.round(view.height * dpr);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  const kind = editor.spaceKind;
  const vm = view.matrix();
  const base = { a: vm.a * dpr, b: vm.b * dpr, c: vm.c * dpr, d: vm.d * dpr, e: vm.e * dpr, f: vm.f * dpr };
  const sinkOpts = { base, dpr, lineweightDisplay: editor.prefs.lineweightDisplay, lwPxPerHundredth: 1 / 25, background: theme.background, images: opts.images, deviceWidth: W, deviceHeight: H };

  if (kind === 'layout') {
    const layout = editor.doc.data.layouts.get(editor.space)!;
    g.fillStyle = theme.paperBackground;
    g.fillRect(0, 0, W, H);
    const { width, height } = paperExtents(layout.page);
    const a = view.toScreen({ x: 0, y: height });
    const b = view.toScreen({ x: width, y: 0 });
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.shadowColor = theme.sheetShadow;
    g.shadowBlur = 14;
    g.shadowOffsetX = 3;
    g.shadowOffsetY = 5;
    g.fillStyle = theme.sheet;
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.shadowColor = 'transparent';
    // área imprimible
    const mg = layout.page.margins;
    const pa = view.toScreen({ x: mg.left, y: height - mg.top });
    const pb = view.toScreen({ x: width - mg.right, y: mg.bottom });
    g.setLineDash([4, 4]);
    g.strokeStyle = theme.marginLine;
    g.lineWidth = 1;
    g.strokeRect(Math.round(pa.x) + 0.5, Math.round(pa.y) + 0.5, pb.x - pa.x, pb.y - pa.y);
    g.restore();
    const sheetTheme = { ...theme, background: theme.sheet };
    const sink = new CanvasSink(g, { ...sinkOpts, background: theme.sheet });
    const env = envFor(editor, sheetTheme, { dark: false, background: theme.sheet, hidden: editor.hidden, isolated: editor.isolated });
    const paperVisible = view.visibleBox();
    const list = visibleEntities(env, editor.space, editor.index, paperVisible);
    const vps = list.filter((e): e is ViewportEntity => e.type === 'viewport');
    for (const vp of vps) drawViewportContent(sink, editor, env, vp, paperVisible);
    sink.end();
    const sink2 = new CanvasSink(g, { ...sinkOpts, background: theme.sheet });
    for (const e of list) drawEntity(sink2, env, e, null);
    sink2.end();
    // viewport activo resaltado
    const avp = editor.activeViewport;
    if (avp) {
      g.save();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = theme.accent;
      g.lineWidth = 2;
      g.beginPath();
      viewportOutline(avp).forEach((p, i) => {
        const s = view.toScreen(p);
        if (i) g.lineTo(s.x, s.y);
        else g.moveTo(s.x, s.y);
      });
      g.closePath();
      g.stroke();
      g.restore();
    }
    return;
  }

  g.fillStyle = theme.background;
  g.fillRect(0, 0, W, H);
  if (editor.prefs.grid.on) drawGrid(g, view, theme, dpr, editor.prefs.grid.spacing, editor.prefs.grid.majorEvery, editor.prefs.grid.adaptive, kind === 'model');
  const env = envFor(editor, theme);
  const sink = new CanvasSink(g, sinkOpts);
  // edición de bloque en contexto: el dibujo anfitrión atenuado debajo
  if (kind === 'block' && editor.blockEdit?.inPlace) {
    const ip = editor.blockEdit.inPlace;
    const faded: TraverseEnv = { ...env, fade: 0.7, hidden: new Set([ip.insertId]) };
    // ip.matrix lleva del anfitrión (mundo) a coordenadas del bloque
    sink.save();
    sink.transform(ip.matrix);
    drawSpace(sink, faded, editor.blockEdit.previousSpace, editor.index, transformBox(view.visibleBox(), invert(ip.matrix)));
    sink.restore();
  }
  const stateHidden = kind === 'block' ? editor.blockStateHidden() : null;
  if (stateHidden?.size) {
    // objetos fuera del estado de visibilidad actual: atenuados debajo del resto
    drawSpace(sink, { ...env, isolated: stateHidden, fade: 0.8 }, editor.space, editor.index, view.visibleBox(50));
    const hidden = new Set([...(env.hidden ?? []), ...stateHidden]);
    drawSpace(sink, { ...env, hidden }, editor.space, editor.index, view.visibleBox(50));
  } else drawSpace(sink, env, editor.space, editor.index, view.visibleBox(50));
  sink.end();
}

/** Resalta un conjunto de entidades (selección, hover, designación en curso). */
export function renderHighlight(g: CanvasRenderingContext2D, editor: Editor, ids: Iterable<Id>, color: string, opts: SceneOptions & { dash?: number[] | null; boost?: number }) {
  const { dpr } = opts;
  const view = editor.view;
  const vm = view.matrix();
  let base = { a: vm.a * dpr, b: vm.b * dpr, c: vm.c * dpr, d: vm.d * dpr, e: vm.e * dpr, f: vm.f * dpr };
  const own = editor.ownerToSpace;
  if (own) base = multiply(base, own);
  const sink = new CanvasSink(g, {
    base,
    dpr,
    lineweightDisplay: false,
    lwPxPerHundredth: 0,
    background: opts.theme.background,
    images: opts.images,
    deviceWidth: view.width * dpr,
    deviceHeight: view.height * dpr,
    minWidthPx: 1.5,
    widthBoost: opts.boost ?? 1.4,
    forceDashPx: opts.dash ?? null,
  });
  const env: TraverseEnv = { ...envFor(editor, opts.theme), forceColor: color, viewport: editor.activeViewport };
  for (const id of ids) {
    const e = editor.doc.entity(id);
    if (!e || !entityVisible(editor.doc, e, editor.visibility())) continue;
    drawEntity(sink, env, e, null);
  }
  sink.end();
}

/** Dibuja entidades temporales (vista previa) con el color de acento. */
export function renderPreviewEntities(g: CanvasRenderingContext2D, editor: Editor, entities: Entity[], color: string, opts: SceneOptions) {
  if (!entities.length) return;
  const { dpr } = opts;
  const view = editor.view;
  const vm = view.matrix();
  let base = { a: vm.a * dpr, b: vm.b * dpr, c: vm.c * dpr, d: vm.d * dpr, e: vm.e * dpr, f: vm.f * dpr };
  const own = editor.ownerToSpace;
  if (own) base = multiply(base, own);
  const sink = new CanvasSink(g, { base, dpr, lineweightDisplay: false, lwPxPerHundredth: 0, background: opts.theme.background, images: opts.images, deviceWidth: view.width * dpr, deviceHeight: view.height * dpr, minWidthPx: 1 });
  const env: TraverseEnv = { ...envFor(editor, opts.theme), forceColor: color };
  for (const e of entities) drawEntity(sink, env, e, null);
  sink.end();
}

export const worldToScreenPoint = (editor: Editor, p: { x: number; y: number }) => editor.ownerToScreen(p);
export const _apply = applyToPoint;
