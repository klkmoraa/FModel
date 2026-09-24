import type { CadDocument } from '../document/document';
import type { ImageSource } from './canvasSink';

type PdfRenderer = (dataUrl: string, page: number, signal?: AbortSignal) => Promise<HTMLCanvasElement | ImageBitmap>;

let pdfRenderer: PdfRenderer | null = null;
const MAX_RASTER_PIXELS = 16_777_216;
const MAX_RASTER_SIDE = 8192;

function closeBitmap(value: unknown): void {
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) value.close();
}

/** Carga perezosa de pdf.js solo cuando hay calcos PDF. */
async function getPdfRenderer(): Promise<PdfRenderer> {
  if (pdfRenderer) return pdfRenderer;
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  pdfRenderer = async (dataUrl, page, signal) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const abortLoading = () => void loadingTask.destroy();
    signal?.addEventListener('abort', abortLoading, { once: true });
    let doc: Awaited<typeof loadingTask.promise> | undefined;
    try {
      doc = await loadingTask.promise;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!Number.isInteger(doc.numPages) || doc.numPages < 1) throw new Error('Invalid PDF page count');
      const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
      const base = p.getViewport({ scale: 1 });
      if (!Number.isFinite(base.width) || !Number.isFinite(base.height) || base.width <= 0 || base.height <= 0) throw new Error('Invalid PDF page dimensions');
      const scale = Math.min(2.5, Math.sqrt(MAX_RASTER_PIXELS / (base.width * base.height)), MAX_RASTER_SIDE / base.width, MAX_RASTER_SIDE / base.height);
      const viewport = p.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable');
      await p.render({ canvasContext: context, viewport, canvas }).promise;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return canvas;
    } finally {
      signal?.removeEventListener('abort', abortLoading);
      await (doc ? doc.destroy() : loadingTask.destroy()).catch(() => undefined);
    }
  };
  return pdfRenderer;
}

/** Caché de mapas de bits de imágenes y páginas PDF referenciadas por el documento. */
export class AssetImageCache implements ImageSource {
  private images = new Map<string, CanvasImageSource | 'loading' | 'error'>();
  private generation = 0;
  private controller = new AbortController();

  constructor(
    private doc: () => CadDocument,
    private onLoaded: () => void,
  ) {}

  get(assetId: string, page?: number): CanvasImageSource | null {
    const key = page ? `${assetId}#${page}` : assetId;
    const cached = this.images.get(key);
    if (cached === 'loading' || cached === 'error') return null;
    if (cached) return cached;
    const asset = this.doc().data.assets.get(assetId);
    if (!asset?.dataUrl) return null;
    this.images.set(key, 'loading');
    const generation = this.generation;
    if (asset.mime === 'application/pdf') {
      const signal = this.controller.signal;
      getPdfRenderer()
        .then((render) => render(asset.dataUrl!, page ?? 1, signal))
        .then((bmp) => {
          if (generation !== this.generation) {
            closeBitmap(bmp);
            return;
          }
          this.images.set(key, bmp);
          this.onLoaded();
        })
        .catch((err) => {
          if (generation !== this.generation) return;
          console.warn('PDF underlay', err);
          this.images.set(key, 'error');
        });
      return null;
    }
    const img = new Image();
    img.onload = () => {
      if (generation !== this.generation) return;
      this.images.set(key, img);
      this.onLoaded();
    };
    img.onerror = () => {
      if (generation === this.generation) this.images.set(key, 'error');
    };
    img.src = asset.dataUrl;
    return null;
  }

  clear() {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    for (const value of this.images.values()) closeBitmap(value);
    this.images.clear();
  }
}

async function decodeImage(dataUrl: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const img = new Image();
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      img.src = '';
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
  img.src = dataUrl;
  try {
    await Promise.race([img.decode(), cancelled]);
  } catch (error) {
    if (signal?.aborted) throw error;
    img.src = '';
    return null;
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    img.src = '';
    return null;
  }
  return img;
}

async function rasterToPng(dataUrl: string, signal?: AbortSignal): Promise<string | null> {
  const img = await decodeImage(dataUrl, signal);
  if (!img) return null;
  try {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const scale = Math.min(1, Math.sqrt(MAX_RASTER_PIXELS / (width * height)), MAX_RASTER_SIDE / width, MAX_RASTER_SIDE / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return canvas.toDataURL('image/png');
  } finally {
    img.src = '';
  }
}

/**
 * Prepara las imágenes referenciadas para exportación vectorial: PNG/JPEG se usan tal cual;
 * otros formatos (SVG, GIF, WebP) y páginas de calcos PDF se rasterizan a PNG.
 */
export interface PreparedExportImages {
  get(assetId: string, page?: number): string | null;
  omittedAssets: string[];
}

export async function prepareExportImages(doc: CadDocument, signal?: AbortSignal): Promise<PreparedExportImages> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const ready = new Map<string, string>();
  const omittedAssets: string[] = [];
  const wanted = new Map<string, { assetId: string; page?: number }>();
  for (const e of doc.data.entities.values()) {
    if (e.type === 'image') wanted.set(e.assetId, { assetId: e.assetId });
    else if (e.type === 'pdfunderlay') wanted.set(`${e.assetId}#${e.page}`, { assetId: e.assetId, page: e.page });
  }
  for (const [key, w] of wanted) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const asset = doc.data.assets.get(w.assetId);
    if (!asset?.dataUrl) {
      omittedAssets.push(asset?.name ?? w.assetId);
      continue;
    }
    try {
      if (/^data:image\/(png|jpe?g)/i.test(asset.dataUrl)) {
        const img = await decodeImage(asset.dataUrl, signal);
        if (img) {
          ready.set(key, asset.dataUrl);
          img.src = '';
        } else omittedAssets.push(asset.name);
      } else if (asset.mime === 'application/pdf') {
        const render = await getPdfRenderer();
        const bmp = await render(asset.dataUrl, w.page ?? 1, signal);
        try {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          const canvas = bmp instanceof HTMLCanvasElement ? bmp : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
          if (!(bmp instanceof HTMLCanvasElement)) {
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas 2D is unavailable');
            context.drawImage(bmp, 0, 0);
          }
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          ready.set(key, canvas.toDataURL('image/png'));
        } finally {
          if (!(bmp instanceof HTMLCanvasElement)) closeBitmap(bmp);
        }
      } else {
        const png = await rasterToPng(asset.dataUrl, signal);
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (png) ready.set(key, png);
        else omittedAssets.push(asset.name);
      }
    } catch (err) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      console.warn('export image', w.assetId, err);
      omittedAssets.push(asset.name);
    }
  }
  return { get: (assetId, page) => ready.get(page ? `${assetId}#${page}` : assetId) ?? null, omittedAssets };
}
