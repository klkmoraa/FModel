import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import type { Editor } from '../editor/editor';
import type { SnapType } from '../model/registry';
import type { GripDef } from '../model/registry';
import { selectInBox } from '../selection/pick';
import type { SceneOptions } from './sceneRenderer';
import { renderHighlight, renderPreviewEntities } from './sceneRenderer';
import { CanvasSink } from './canvasSink';
import { drawEntity } from './traverse';
import { drawAuthoringOverlay } from './authoringOverlay';
import { drawDrawingConstraints } from './constraintOverlay';

export const SNAP_LABELS: Record<SnapType, { es: string; en: string }> = {
  endpoint: { es: 'Punto final', en: 'Endpoint' },
  midpoint: { es: 'Punto medio', en: 'Midpoint' },
  center: { es: 'Centro', en: 'Center' },
  node: { es: 'Nodo', en: 'Node' },
  geocenter: { es: 'Centro geométrico', en: 'Geometric center' },
  quadrant: { es: 'Cuadrante', en: 'Quadrant' },
  intersection: { es: 'Intersección', en: 'Intersection' },
  extension: { es: 'Extensión', en: 'Extension' },
  insertion: { es: 'Inserción', en: 'Insertion' },
  perpendicular: { es: 'Perpendicular', en: 'Perpendicular' },
  tangent: { es: 'Tangente', en: 'Tangent' },
  nearest: { es: 'Cercano', en: 'Nearest' },
  parallel: { es: 'Paralelo', en: 'Parallel' },
  appint: { es: 'Intersección ficticia', en: 'Apparent intersection' },
};

function drawSnapMarker(g: CanvasRenderingContext2D, type: SnapType, s: Vec2, size: number) {
  const h = size;
  g.beginPath();
  switch (type) {
    case 'endpoint':
      g.rect(s.x - h, s.y - h, 2 * h, 2 * h);
      break;
    case 'midpoint':
      g.moveTo(s.x, s.y - h);
      g.lineTo(s.x + h, s.y + h * 0.8);
      g.lineTo(s.x - h, s.y + h * 0.8);
      g.closePath();
      break;
    case 'center':
      g.arc(s.x, s.y, h, 0, Math.PI * 2);
      break;
    case 'geocenter':
      g.arc(s.x, s.y, h, 0, Math.PI * 2);
      g.moveTo(s.x - h * 0.5, s.y);
      g.lineTo(s.x + h * 0.5, s.y);
      g.moveTo(s.x, s.y - h * 0.5);
      g.lineTo(s.x, s.y + h * 0.5);
      break;
    case 'node':
      g.arc(s.x, s.y, h, 0, Math.PI * 2);
      g.moveTo(s.x - h * 0.7, s.y - h * 0.7);
      g.lineTo(s.x + h * 0.7, s.y + h * 0.7);
      g.moveTo(s.x + h * 0.7, s.y - h * 0.7);
      g.lineTo(s.x - h * 0.7, s.y + h * 0.7);
      break;
    case 'quadrant':
      g.moveTo(s.x, s.y - h);
      g.lineTo(s.x + h, s.y);
      g.lineTo(s.x, s.y + h);
      g.lineTo(s.x - h, s.y);
      g.closePath();
      break;
    case 'intersection':
    case 'appint':
      g.moveTo(s.x - h, s.y - h);
      g.lineTo(s.x + h, s.y + h);
      g.moveTo(s.x + h, s.y - h);
      g.lineTo(s.x - h, s.y + h);
      if (type === 'appint') g.rect(s.x - h, s.y - h, 2 * h, 2 * h);
      break;
    case 'extension':
      g.moveTo(s.x - h * 0.2, s.y);
      g.arc(s.x, s.y, h * 0.2, 0, Math.PI * 2);
      g.moveTo(s.x + h * 0.5, s.y);
      g.arc(s.x + h * 0.7, s.y, h * 0.2, 0, Math.PI * 2);
      g.moveTo(s.x - h * 0.5, s.y);
      g.arc(s.x - h * 0.7, s.y, h * 0.2, 0, Math.PI * 2);
      break;
    case 'insertion':
      g.moveTo(s.x - h, s.y - h);
      g.lineTo(s.x, s.y - h);
      g.lineTo(s.x, s.y);
      g.lineTo(s.x + h, s.y);
      g.lineTo(s.x + h, s.y + h);
      g.lineTo(s.x, s.y + h);
      g.lineTo(s.x, s.y);
      g.lineTo(s.x - h, s.y);
      g.closePath();
      break;
    case 'perpendicular':
      g.moveTo(s.x - h, s.y - h);
      g.lineTo(s.x - h, s.y + h);
      g.lineTo(s.x + h, s.y + h);
      g.moveTo(s.x - h, s.y);
      g.lineTo(s.x, s.y);
      g.lineTo(s.x, s.y + h);
      break;
    case 'tangent':
      g.arc(s.x, s.y, h * 0.8, 0, Math.PI * 2);
      g.moveTo(s.x - h, s.y - h * 0.8);
      g.lineTo(s.x + h, s.y - h * 0.8);
      break;
    case 'nearest':
      g.moveTo(s.x - h, s.y - h);
      g.lineTo(s.x + h, s.y - h);
      g.lineTo(s.x - h, s.y + h);
      g.lineTo(s.x + h, s.y + h);
      g.closePath();
      break;
    case 'parallel':
      g.moveTo(s.x - h, s.y + h * 0.4);
      g.lineTo(s.x + h * 0.4, s.y - h);
      g.moveTo(s.x - h * 0.4, s.y + h);
      g.lineTo(s.x + h, s.y - h * 0.4);
      break;
  }
  g.stroke();
}

function tooltip(g: CanvasRenderingContext2D, text: string, at: Vec2, bg: string, ink: string) {
  g.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  const w = g.measureText(text).width + 12;
  const x = Math.round(at.x + 14);
  const y = Math.round(at.y + 16);
  g.fillStyle = bg;
  g.beginPath();
  const rr = (g as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
  if (typeof rr === 'function') rr.call(g, x, y, w, 20, 6);
  else (g as CanvasRenderingContext2D).rect(x, y, w, 20);
  g.fill();
  g.fillStyle = ink;
  g.textBaseline = 'middle';
  g.fillText(text, x + 6, y + 10.5);
}

function drawGrip(g: CanvasRenderingContext2D, grip: GripDef, s: Vec2, size: number, fill: string, stroke: string) {
  const h = size / 2;
  g.fillStyle = fill;
  g.strokeStyle = stroke;
  g.lineWidth = 1;
  g.beginPath();
  switch (grip.shape) {
    case 'triangle':
    case 'arrow': {
      const d = grip.dir ?? { x: 1, y: 0 };
      const ang = Math.atan2(-d.y, d.x);
      const pts = [
        [h * 1.4, 0],
        [-h, -h],
        [-h, h],
      ].map(([x, y]) => ({ x: s.x + x * Math.cos(ang) - y * Math.sin(ang), y: s.y + x * Math.sin(ang) + y * Math.cos(ang) }));
      g.moveTo(pts[0].x, pts[0].y);
      g.lineTo(pts[1].x, pts[1].y);
      g.lineTo(pts[2].x, pts[2].y);
      g.closePath();
      break;
    }
    case 'circle':
    case 'rotation':
      g.arc(s.x, s.y, h, 0, Math.PI * 2);
      break;
    case 'diamond':
    case 'flip':
      g.moveTo(s.x, s.y - h * 1.2);
      g.lineTo(s.x + h * 1.2, s.y);
      g.lineTo(s.x, s.y + h * 1.2);
      g.lineTo(s.x - h * 1.2, s.y);
      g.closePath();
      break;
    case 'lookup':
    case 'visibility':
      g.rect(s.x - h, s.y - h, 2 * h, 2 * h);
      g.fill();
      g.stroke();
      g.beginPath();
      g.fillStyle = stroke;
      g.moveTo(s.x - h * 0.5, s.y - h * 0.2);
      g.lineTo(s.x + h * 0.5, s.y - h * 0.2);
      g.lineTo(s.x, s.y + h * 0.5);
      g.closePath();
      g.fill();
      return;
    case 'rect-mid':
      g.rect(s.x - h * 1.2, s.y - h * 0.6, h * 2.4, h * 1.2);
      break;
    default:
      g.rect(Math.round(s.x - h) + 0.5, Math.round(s.y - h) + 0.5, size, size);
  }
  g.fill();
  g.stroke();
}

/** Capa de ayudas: resaltados, grips, vista previa, snaps, rastreo, cursor y ventanas. */
export function renderOverlay(g: CanvasRenderingContext2D, editor: Editor, opts: SceneOptions) {
  const { theme, dpr } = opts;
  const view = editor.view;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  const req = editor.runner.pending?.req;

  // resaltado de selección y de designación
  const sel = new Set<string>(editor.selection.list);
  for (const id of editor.requestIds) sel.add(id);
  if (sel.size && sel.size < 5000) renderHighlight(g, editor, sel, theme.accent, { ...opts, dash: [5, 4], boost: 1.6 });
  // comparación de revisiones: eliminados como fantasma, añadidos y modificados resaltados
  if (editor.compare) {
    const { diff } = editor.compare;
    const owner = editor.inputOwner;
    const removed = diff.removed.filter((e) => e.owner === owner);
    if (removed.length) renderPreviewEntities(g, editor, removed, theme.diffRemoved, opts);
    const inSpace = (id: string) => editor.doc.entity(id)?.owner === owner;
    const added = diff.added.filter(inSpace);
    const modified = diff.modified.map((m) => m.id).filter(inSpace);
    if (added.length) renderHighlight(g, editor, added, theme.diffAdded, { ...opts, dash: null, boost: 1.8 });
    if (modified.length) renderHighlight(g, editor, modified, theme.diffModified, { ...opts, dash: null, boost: 1.8 });
  }
  // ventana en curso: vista previa de lo que se seleccionaría
  if (editor.window?.dragging) {
    const w = editor.window;
    const crossing = editor.selectionBoxMode === 'crossing' || (editor.selectionBoxMode === 'auto' && editor.ownerToScreen(w.current).x < w.startScreen.x);
    const box = { minX: Math.min(w.start.x, w.current.x), minY: Math.min(w.start.y, w.current.y), maxX: Math.max(w.start.x, w.current.x), maxY: Math.max(w.start.y, w.current.y) };
    const ids = selectInBox(editor.ctx, editor.index, editor.inputOwner, box, crossing, undefined, editor.visibility());
    if (ids.length < 3000) renderHighlight(g, editor, ids, theme.hover, { ...opts, boost: 1.8 });
  } else if (editor.hover.entityId && editor.hover.inside && !sel.has(editor.hover.entityId)) {
    renderHighlight(g, editor, [editor.hover.entityId], theme.hover, { ...opts, boost: 2 });
  }

  // vista previa
  const pv = editor.preview;
  if (pv?.entities?.length) renderPreviewEntities(g, editor, pv.entities, theme.preview, opts);
  if (pv?.items?.length) {
    const vm = view.matrix();
    const sink = new CanvasSink(g, { base: { a: vm.a * dpr, b: vm.b * dpr, c: vm.c * dpr, d: vm.d * dpr, e: vm.e * dpr, f: vm.f * dpr }, dpr, lineweightDisplay: false, lwPxPerHundredth: 0, background: theme.background, deviceWidth: view.width * dpr, deviceHeight: view.height * dpr });
    const fake = { id: '', type: 'line', owner: editor.inputOwner, layer: 'layer-0', color: 'ByLayer', linetype: 'ByLayer', linetypeScale: 1, lineweight: -1, transparency: 'ByLayer', visible: true, order: 0, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } as const;
    for (const it of pv.items) {
      if (it.k === 'path') sink.stroke(it, { color: theme.preview, alpha: 1, lineweight: 0, dash: null, layer: '' }, fake as never);
      else if (it.k === 'text') sink.text(it, { color: theme.preview, alpha: 1, lineweight: 0, dash: null, layer: '' }, fake as never);
    }
    sink.end();
    void drawEntity;
  }

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawAuthoringOverlay(g, editor, theme);
  drawDrawingConstraints(g, editor, theme);

  // grips
  if (!req && !editor.runner.busy && editor.selection.size) {
    const grips = editor.gripsFor(editor.selection.list);
    const size = editor.prefs.gripSizePx;
    for (const gr of grips) {
      const s = editor.ownerToScreen(gr.grip.p);
      if (s.x < -10 || s.y < -10 || s.x > view.width + 10 || s.y > view.height + 10) continue;
      const hovered = editor.hover.grip && editor.hover.grip.entityId === gr.entityId && editor.hover.grip.grip.id === gr.grip.id;
      const dyn = !!gr.grip.paramId;
      drawGrip(g, gr.grip, s, dyn ? size + 2 : size, hovered ? theme.gripHover : dyn ? theme.snap : theme.gripFill, theme.dark ? '#0e1113' : '#ffffff');
    }
  }
  if (editor.gripContext) {
    const s = editor.ownerToScreen(editor.gripContext.base);
    g.fillStyle = theme.gripHot;
    g.fillRect(s.x - 4, s.y - 4, 8, 8);
  }

  const hover = editor.hover;
  if (!hover.inside) return;
  const cur = hover.screen;
  const resolved = hover.resolved;
  const pointLike = !!req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle');

  // banda elástica
  const base = req && (req.kind === 'point' || req.kind === 'distance' || req.kind === 'angle') ? req.base : editor.gripContext?.base;
  if ((pointLike || editor.gripContext) && base && resolved) {
    const a = editor.ownerToScreen(base);
    const b = editor.ownerToScreen(resolved.p);
    g.strokeStyle = theme.preview;
    g.lineWidth = 1;
    g.setLineDash([6, 4]);
    g.beginPath();
    if (req?.kind === 'point' && req.rubber === 'rect') {
      g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else {
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    g.stroke();
    g.setLineDash([]);
  }

  // rastreo y guías
  if (resolved) {
    g.strokeStyle = theme.tracking;
    g.lineWidth = 1;
    g.setLineDash([2, 4]);
    for (const guide of resolved.guides) {
      const a = editor.ownerToScreen(guide.from);
      const b = editor.ownerToScreen(guide.to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const ext = Math.max(view.width, view.height) * 2;
      g.beginPath();
      g.moveTo(a.x - (dx / l) * (resolved.kind === 'polar' || resolved.kind === 'tracking' ? 0 : 0), a.y);
      g.lineTo(a.x + (dx / l) * ext, a.y + (dy / l) * ext);
      g.stroke();
    }
    g.setLineDash([]);
    for (const p of resolved.acquired) {
      const s = editor.ownerToScreen(p);
      g.strokeStyle = theme.snap;
      g.beginPath();
      g.moveTo(s.x - 4, s.y);
      g.lineTo(s.x + 4, s.y);
      g.moveTo(s.x, s.y - 4);
      g.lineTo(s.x, s.y + 4);
      g.stroke();
    }
  }

  // marcador de snap
  const snapped = resolved && resolved.kind !== 'free' && resolved.kind !== 'grid' && resolved.kind !== 'polar' && resolved.kind !== 'ortho' && resolved.kind !== 'tracking';
  if (resolved && snapped) {
    const s = editor.ownerToScreen(resolved.p);
    g.strokeStyle = theme.snap;
    g.lineWidth = 2;
    drawSnapMarker(g, resolved.kind as SnapType, s, 6);
    const label = SNAP_LABELS[resolved.kind as SnapType][editor.lang];
    const more = resolved.candidates.length > 1 ? `  (Tab ${resolved.candidateIndex + 1}/${resolved.candidates.length})` : '';
    if (editor.prefs.dynamicInput.showTooltips) tooltip(g, label + more, s, theme.tooltipBg, theme.tooltipInk);
  } else if (resolved && (resolved.kind === 'polar' || resolved.kind === 'tracking') && pointLike && resolved.label && editor.prefs.dynamicInput.showTooltips) {
    tooltip(g, `${editor.lang === 'es' ? 'Polar' : 'Polar'}: ${resolved.label}`, editor.ownerToScreen(resolved.p), theme.tooltipBg, theme.tooltipInk);
  }

  // ventanas de selección
  if (editor.window) {
    const a = editor.ownerToScreen(editor.window.start);
    const b = editor.ownerToScreen(editor.window.current);
    const crossing = editor.selectionBoxMode === 'crossing' || (editor.selectionBoxMode === 'auto' && b.x < a.x);
    g.fillStyle = crossing ? theme.crossingFill : theme.windowFill;
    g.strokeStyle = crossing ? theme.crossingStroke : theme.windowStroke;
    g.lineWidth = 1;
    g.setLineDash(crossing ? [6, 4] : []);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    g.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.setLineDash([]);
  }
  if (editor.fence || editor.polygonSelect) {
    const pts = editor.fence ?? editor.polygonSelect!.points;
    g.strokeStyle = editor.polygonSelect && !editor.polygonSelect.crossing ? theme.windowStroke : theme.crossingStroke;
    g.setLineDash([6, 4]);
    g.beginPath();
    pts.forEach((p, i) => {
      const s = editor.ownerToScreen(p);
      if (i) g.lineTo(s.x, s.y);
      else g.moveTo(s.x, s.y);
    });
    if (pts.length) g.lineTo(cur.x, cur.y);
    if (editor.polygonSelect && pts.length > 1) g.closePath();
    g.stroke();
    g.setLineDash([]);
  }

  // cursor en cruz
  const cp = pointLike && resolved ? editor.ownerToScreen(resolved.p) : cur;
  const size = editor.prefs.crosshairSize >= 100 ? Math.max(view.width, view.height) : (Math.max(view.width, view.height) * editor.prefs.crosshairSize) / 100;
  g.strokeStyle = theme.cursor;
  g.lineWidth = 1;
  g.beginPath();
  const x = Math.round(cp.x) + 0.5;
  const y = Math.round(cp.y) + 0.5;
  const pb = editor.prefs.pickboxPx;
  const showPickbox = !pointLike;
  const gap = showPickbox ? pb : 0;
  g.moveTo(x - size, y);
  g.lineTo(x - gap, y);
  g.moveTo(x + gap, y);
  g.lineTo(x + size, y);
  g.moveTo(x, y - size);
  g.lineTo(x, y - gap);
  g.moveTo(x, y + gap);
  g.lineTo(x, y + size);
  if (showPickbox && !(editor.window?.dragging)) g.rect(x - pb, y - pb, pb * 2, pb * 2);
  g.stroke();

  // icono del SCU en modelo
  if (editor.spaceKind !== 'layout') {
    const o = { x: 28, y: view.height - 28 };
    g.strokeStyle = theme.axisX.replace(/[\d.]+\)$/, '0.9)');
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(o.x, o.y);
    g.lineTo(o.x + 30, o.y);
    g.stroke();
    g.strokeStyle = theme.axisY.replace(/[\d.]+\)$/, '0.9)');
    g.beginPath();
    g.moveTo(o.x, o.y);
    g.lineTo(o.x, o.y - 30);
    g.stroke();
    g.fillStyle = theme.cursor;
    g.font = '600 10px "IBM Plex Mono", monospace';
    g.fillText('X', o.x + 34, o.y + 4);
    g.fillText('Y', o.x - 3, o.y - 36);
  }
  void dist;
}
