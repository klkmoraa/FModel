import type { CadDocument } from '../document/document';
import type { ImageSource } from './canvasSink';

type PdfRenderer = (dataUrl: string, page: number) => Promise<HTMLCanvasElement | ImageBitmap>;

let pdfRenderer: PdfRenderer | null = null;

/** Carga perezosa de pdf.js solo cuando hay calcos PDF. */
async function getPdfRenderer(): Promise<PdfRenderer> {
  if (pdfRenderer) return pdfRenderer;
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  pdfRenderer = async (dataUrl, page) => {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
    const viewport = p.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await p.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise;
    return canvas;
  };
  return pdfRenderer;
}

/** Caché de mapas de bits de imágenes y páginas PDF referenciadas por el documento. */
export class AssetImageCache implements ImageSource {
  private images = new Map<string, CanvasImageSource | 'loading' | 'error'>();

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
    if (asset.mime === 'application/pdf') {
      getPdfRenderer()
        .then((render) => render(asset.dataUrl!, page ?? 1))
        .then((bmp) => {
          this.images.set(key, bmp);
          this.onLoaded();
        })
        .catch((err) => {
          console.warn('PDF underlay', err);
          this.images.set(key, 'error');
        });
      return null;
    }
    const img = new Image();
    img.onload = () => {
      this.images.set(key, img);
      this.onLoaded();
    };
    img.onerror = () => this.images.set(key, 'error');
    img.src = asset.dataUrl;
    return null;
  }

  clear() {
    this.images.clear();
  }
}
