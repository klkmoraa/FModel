import type { BBox } from '../geometry/bbox';
import { emptyBox, expandBox, isEmptyBox } from '../geometry/bbox';
import type { Id } from '../document/types';
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
