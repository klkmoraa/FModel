import type { BBox } from '../geometry/bbox';
import type { Mat2D } from '../geometry/matrix';
import { applyToPoint, IDENTITY, multiply } from '../geometry/matrix';
import type { CadDocument } from '../document/document';
import type { PdfSegmentIndex } from '../model/registry';

/** Rejilla uniforme sobre el cuadrado unidad para consultar segmentos por caja. */
export function buildSegmentIndex(segs: Float32Array, cells = 64): PdfSegmentIndex {
  const count = segs.length / 4;
  const grid = new Map<number, number[]>();
  const cell = (v: number) => Math.max(0, Math.min(cells - 1, Math.floor(v * cells)));
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const x0 = cell(Math.min(segs[o], segs[o + 2]));
    const x1 = cell(Math.max(segs[o], segs[o + 2]));
    const y0 = cell(Math.min(segs[o + 1], segs[o + 3]));
    const y1 = cell(Math.max(segs[o + 1], segs[o + 3]));
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++) {
        const k = gy * cells + gx;
        const list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
  }
  return {
    count,
    query(box: BBox) {
      if (box.maxX < 0 || box.maxY < 0 || box.minX > 1 || box.minY > 1) return [];
      const seen = new Set<number>();
      const out: number[][] = [];
      for (let gx = cell(box.minX); gx <= cell(box.maxX); gx++)
        for (let gy = cell(box.minY); gy <= cell(box.maxY); gy++)
          for (const i of grid.get(gy * cells + gx) ?? []) {
            if (seen.has(i)) continue;
            seen.add(i);
            const o = i * 4;
            const sx0 = Math.min(segs[o], segs[o + 2]);
            const sx1 = Math.max(segs[o], segs[o + 2]);
            const sy0 = Math.min(segs[o + 1], segs[o + 3]);
            const sy1 = Math.max(segs[o + 1], segs[o + 3]);
            if (sx1 < box.minX || sx0 > box.maxX || sy1 < box.minY || sy0 > box.maxY) continue;
            out.push([segs[o], segs[o + 1], segs[o + 2], segs[o + 3]]);
          }
      return out;
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

/**
 * Convierte la lista de operadores de una página en segmentos en el cuadrado unidad
 * (0–1, Y hacia arriba). `pageToCanvas` es la transformación del viewport a escala 1
 * (espacio de usuario PDF → píxeles con Y hacia abajo). Las curvas se aproximan con 6 tramos;
 * los trazados solo de recorte (endPath) se descartan.
 */
export function segmentsFromOperators(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: PathOps, pageToCanvas: number[], width: number, height: number): Float32Array {
  const out: number[] = [];
  let ctm: Mat2D = IDENTITY;
  const stack: Mat2D[] = [];
  const view: Mat2D = { a: pageToCanvas[0], b: pageToCanvas[1], c: pageToCanvas[2], d: pageToCanvas[3], e: pageToCanvas[4], f: pageToCanvas[5] };
  const toUnit = (x: number, y: number) => {
    const p = applyToPoint(view, applyToPoint(ctm, { x, y }));
    return { x: p.x / width, y: 1 - p.y / height };
  };
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 1e-7) return;
    out.push(a.x, a.y, b.x, b.y);
  };
  for (let i = 0; i < fnArray.length && out.length / 4 < MAX_SEGMENTS; i++) {
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
      for (let j = 0; j < data.length; ) {
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
    void this.extract(asset.dataUrl, page)
      .then((index) => {
        this.entries.set(key, index);
        this.onReady();
      })
      .catch((err) => {
        console.warn('PDF geometry', err);
        this.entries.set(key, 'error');
      });
    return null;
  }

  private async extract(dataUrl: string, pageNumber: number): Promise<PdfSegmentIndex> {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(Math.max(1, Math.min(pdf.numPages, pageNumber)));
    const viewport = page.getViewport({ scale: 1 });
    const list = await page.getOperatorList();
    const segs = segmentsFromOperators(list.fnArray, list.argsArray, pdfjs.OPS as unknown as PathOps, viewport.transform, viewport.width, viewport.height);
    void pdf.destroy();
    return buildSegmentIndex(segs);
  }
}
