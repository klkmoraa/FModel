import type { BBox } from '../geometry/bbox';
import { emptyBox, expandBox, isEmptyBox } from '../geometry/bbox';
import type { Id } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { CadDocument } from '../document/document';
import type { Editor } from '../editor/editor';
import type { ModelContext } from '../model/context';
import { kindOf } from '../model/registry';
import { CanvasSink } from './canvasSink';
import type { TraverseEnv } from './traverse';
import { drawEntity } from './traverse';

const cache = new Map<string, string>();

/** Miniatura PNG (data URL) de una definición de bloque, cacheada por revisión. */
export function blockThumbnail(editor: Editor, blockId: Id, size = 96, dark = false): string | null {
  return blockThumbnailOf(editor.doc, editor.ctx, blockId, size, dark);
}

/**
 * Miniatura PNG del espacio modelo de un documento con sus colores reales, encuadrada con
 * un margen. `key` identifica el contenido para la caché (p. ej. id de plantilla).
 */
export function documentThumbnail(doc: CadDocument, ctx: ModelContext, key: string, width: number, height: number, dark: boolean): string | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = `doc|${key}|${width}x${height}|${dark}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const entities = doc.entitiesOf(MODEL_SPACE_ID).filter((e) => e.visible);
  const box: BBox = emptyBox();
  for (const e of entities) {
    try {
      const b = kindOf(e).bbox(e, ctx);
      if (Number.isFinite(b.minX)) expandBox(box, b);
    } catch {
      /* entidad sin caja */
    }
  }
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const background = dark ? '#14171a' : '#fffefa';
  g.fillStyle = background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (!isEmptyBox(box)) {
    const pad = 0.06;
    const w = Math.max(box.maxX - box.minX, 1e-9);
    const h = Math.max(box.maxY - box.minY, 1e-9);
    const s = (Math.min(width / w, height / h) * (1 - pad * 2) * dpr);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const base = { a: s, b: 0, c: 0, d: -s, e: (width * dpr) / 2 - cx * s, f: (height * dpr) / 2 + cy * s };
    // Grosores proporcionales al trazado a papel: una lámina A3 ocupa ~ el ancho de la miniatura
    const sink = new CanvasSink(g, { base, dpr, lineweightDisplay: true, lwPxPerHundredth: (width / 420) * 0.02, background, deviceWidth: width * dpr, deviceHeight: height * dpr, minWidthPx: 0.6 });
    const env: TraverseEnv = { doc, ctx, dark, background, plotting: false, plotStyle: 'color', viewport: null, dashScale: 1 };
    for (const e of entities) drawEntity(sink, env, e, null);
    sink.end();
  }
  const url = canvas.toDataURL('image/png');
  if (cache.size > 500) cache.clear();
  cache.set(cacheKey, url);
  return url;
}

/** Miniatura de un bloque de cualquier documento (p. ej. uno temporal al importar a la biblioteca). */
export function blockThumbnailOf(doc: CadDocument, ctx: ModelContext, blockId: Id, size = 96, dark = false): string | null {
  const block = doc.data.blocks.get(blockId);
  if (!block || typeof document === 'undefined') return null;
  const key = `${doc.id}|${blockId}|${block.revision}|${ctx.blocksVersion}|${size}|${dark}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ev = ctx.evaluateBlock(blockId);
  const box: BBox = emptyBox();
  for (const e of ev.entities) {
    try {
      const b = kindOf(e).bbox(e, ctx);
      if (Number.isFinite(b.minX)) expandBox(box, b);
    } catch {
      /* entidad sin caja */
    }
  }
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const g = canvas.getContext('2d');
  if (!g) return null;
  if (!isEmptyBox(box)) {
    const w = Math.max(box.maxX - box.minX, 1e-9);
    const h = Math.max(box.maxY - box.minY, 1e-9);
    const s = ((size - 12) * dpr) / Math.max(w, h);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const base = { a: s, b: 0, c: 0, d: -s, e: (size * dpr) / 2 - cx * s, f: (size * dpr) / 2 + cy * s };
    const sink = new CanvasSink(g, { base, dpr, lineweightDisplay: false, lwPxPerHundredth: 0, background: dark ? '#1b1f22' : '#fffefa', deviceWidth: size * dpr, deviceHeight: size * dpr, minWidthPx: 1 });
    const env: TraverseEnv = { doc: doc, ctx: ctx, dark, background: 'transparent', plotting: false, plotStyle: 'color', viewport: null, dashScale: 1, forceColor: dark ? '#f2f4f3' : '#14171a' };
    for (const e of ev.entities) {
      if (e.type === 'attdef') continue;
      drawEntity(sink, env, e, null);
    }
    sink.end();
  }
  const url = canvas.toDataURL('image/png');
  if (cache.size > 500) cache.clear();
  cache.set(key, url);
  return url;
}
