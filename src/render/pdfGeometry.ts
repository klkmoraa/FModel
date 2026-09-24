import RBush from 'rbush';
import type { BBox } from '../geometry/bbox';
import type { Mat2D } from '../geometry/matrix';
import { applyToPoint, IDENTITY, multiply } from '../geometry/matrix';
import type { CadDocument } from '../document/document';
import type { PdfSegmentIndex } from '../model/registry';

interface SegmentItem extends BBox {
  offset: number;
}

/** Índice espacial con una entrada por segmento, incluso si cruza toda la página. */
export function buildSegmentIndex(segs: Float32Array, cells = 64): PdfSegmentIndex {
  const count = segs.length / 4;
  const items: SegmentItem[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const x0 = segs[o];
    const y0 = segs[o + 1];
    const x1 = segs[o + 2];
    const y1 = segs[o + 3];
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue;
    items.push({ minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1), offset: o });
  }
  const tree = new RBush<SegmentItem>(Math.max(4, Math.min(64, Math.floor(cells))));
  tree.load(items);
  return {
    count,
    query(box: BBox) {
      if (box.maxX < 0 || box.maxY < 0 || box.minX > 1 || box.minY > 1) return [];
      if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)) return [];
      return tree.search(box).sort((a, b) => a.offset - b.offset).map(({ offset }) => [segs[offset], segs[offset + 1], segs[offset + 2], segs[offset + 3]]);
    },
  };
}

export interface PathOps {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  endPath: number;
}

/** Operadores de trazado de pdf.js 5 (DrawOPS). */
const MOVE = 0;
const LINE = 1;
const CURVE = 2;
const CLOSE = 3;
const MAX_SEGMENTS = 250_000;
const MAX_PATH_COMMANDS = MAX_SEGMENTS * 4;

/**
 * Convierte la lista de operadores de una página en segmentos en el cuadrado unidad
 * (0–1, Y hacia arriba). `pageToCanvas` es la transformación del viewport a escala 1
 * (espacio de usuario PDF → píxeles con Y hacia abajo). Las curvas se aproximan con 6 tramos;
 * los trazados solo de recorte (endPath) se descartan.
 */
export function segmentsFromOperators(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: PathOps, pageToCanvas: number[], width: number, height: number): Float32Array {
  const out: number[] = [];
  let pathCommands = 0;
  let ctm: Mat2D = IDENTITY;
  const stack: Mat2D[] = [];
  const view: Mat2D = { a: pageToCanvas[0], b: pageToCanvas[1], c: pageToCanvas[2], d: pageToCanvas[3], e: pageToCanvas[4], f: pageToCanvas[5] };
  const toUnit = (x: number, y: number) => {
    const p = applyToPoint(view, applyToPoint(ctm, { x, y }));
    return { x: p.x / width, y: 1 - p.y / height };
  };
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (out.length >= MAX_SEGMENTS * 4 || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 1e-7) return;
    out.push(a.x, a.y, b.x, b.y);
  };
  for (let i = 0; i < fnArray.length && out.length / 4 < MAX_SEGMENTS && pathCommands < MAX_PATH_COMMANDS; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === ops.transform) {
      const [a, b, c, d, e, f] = args as number[];
      ctm = multiply(ctm, { a, b, c, d, e, f });
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0] as number[] | null;
      if (m && m.length === 6) ctm = multiply(ctm, { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
    else if (fn === ops.constructPath) {
      const paintOp = args?.[0];
      const data = (args?.[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined;
      if (paintOp === ops.endPath || !data || typeof data.length !== 'number') continue;
      let cur = { x: 0, y: 0 };
      let start = cur;
      let raw = { x: 0, y: 0 };
      for (let j = 0; j < data.length && out.length / 4 < MAX_SEGMENTS && pathCommands < MAX_PATH_COMMANDS; pathCommands++) {
        const op = data[j++];
        if (op === MOVE) {
          raw = { x: data[j++], y: data[j++] };
          cur = toUnit(raw.x, raw.y);
          start = cur;
        } else if (op === LINE) {
          raw = { x: data[j++], y: data[j++] };
          const p = toUnit(raw.x, raw.y);
          seg(cur, p);
          cur = p;
        } else if (op === CURVE) {
          const x1 = data[j++];
          const y1 = data[j++];
          const x2 = data[j++];
          const y2 = data[j++];
          const x3 = data[j++];
          const y3 = data[j++];
          const p0 = raw;
          for (let t = 1; t <= 6; t++) {
            const s = t / 6;
            const ms = 1 - s;
            const p = toUnit(ms * ms * ms * p0.x + 3 * ms * ms * s * x1 + 3 * ms * s * s * x2 + s * s * s * x3, ms * ms * ms * p0.y + 3 * ms * ms * s * y1 + 3 * ms * s * s * y2 + s * s * s * y3);
            seg(cur, p);
            cur = p;
          }
          raw = { x: x3, y: y3 };
        } else if (op === CLOSE) {
          seg(cur, start);
          cur = start;
        } else break;
      }
    }
  }
  return Float32Array.from(out);
}

/**
 * Caché de geometría vectorial de calcos PDF por recurso y página. La primera consulta lanza
 * la extracción en segundo plano y devuelve null; al terminar se avisa para redibujar.
 */
export class PdfGeometryCache {
  private entries = new Map<string, PdfSegmentIndex | 'loading' | 'error'>();
  private generation = 0;
  private controller = new AbortController();

  constructor(
    private doc: () => CadDocument,
    private onReady: () => void,
  ) {}

  get(assetId: string, page: number): PdfSegmentIndex | null {
    const key = `${assetId}#${page}`;
    const hit = this.entries.get(key);
    if (hit === 'loading' || hit === 'error') return null;
    if (hit) return hit;
    const asset = this.doc().data.assets.get(assetId);
    if (!asset?.dataUrl || asset.mime !== 'application/pdf') return null;
    this.entries.set(key, 'loading');
    const generation = this.generation;
    void this.extract(asset.dataUrl, page, this.controller.signal)
      .then((index) => {
        if (generation !== this.generation) return;
        this.entries.set(key, index);
        this.onReady();
      })
      .catch((err) => {
        if (generation !== this.generation || (err instanceof Error && err.name === 'AbortError')) return;
        console.warn('PDF geometry', err);
        this.entries.set(key, 'error');
      });
    return null;
  }

  clear(): void {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.entries.clear();
  }

  private async extract(dataUrl: string, pageNumber: number, signal: AbortSignal): Promise<PdfSegmentIndex> {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const abortLoading = () => void loadingTask.destroy();
    signal.addEventListener('abort', abortLoading, { once: true });
    let pdf: Awaited<typeof loadingTask.promise> | undefined;
    try {
      pdf = await loadingTask.promise;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) throw new Error('Invalid PDF page count');
      const page = await pdf.getPage(Math.max(1, Math.min(pdf.numPages, pageNumber)));
      const viewport = page.getViewport({ scale: 1 });
      if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) throw new Error('Invalid PDF page dimensions');
      const list = await page.getOperatorList();
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const segs = segmentsFromOperators(list.fnArray, list.argsArray, pdfjs.OPS as unknown as PathOps, viewport.transform, viewport.width, viewport.height);
      return buildSegmentIndex(segs);
    } catch (error) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      throw error;
    } finally {
      signal.removeEventListener('abort', abortLoading);
      await (pdf ? pdf.destroy() : loadingTask.destroy()).catch(() => undefined);
    }
  }
}
