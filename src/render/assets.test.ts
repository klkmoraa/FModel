import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { ImageEntity } from '../document/types';
import { AssetImageCache, prepareExportImages } from './assets';

afterEach(() => vi.unstubAllGlobals());

describe('caché de imágenes del lienzo', () => {
  it('una carga anterior a clear no repuebla la caché ni redibuja el documento nuevo', () => {
    class FakeImage {
      static instances: FakeImage[] = [];
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        FakeImage.instances.push(this);
      }
    }
    vi.stubGlobal('Image', FakeImage);

    const doc = createDocument();
    doc.transact('ASSET', (tx) => tx.add('assets', {
      id: 'asset-shared',
      name: 'primera.png',
      mime: 'image/png',
      size: 1,
      dataUrl: 'data:image/png;base64,eA==',
    }));
    const onLoaded = vi.fn();
    const cache = new AssetImageCache(() => doc, onLoaded);

    expect(cache.get('asset-shared')).toBeNull();
    expect(FakeImage.instances).toHaveLength(1);
    cache.clear();
    FakeImage.instances[0].onload?.();
    expect(onLoaded).not.toHaveBeenCalled();

    expect(cache.get('asset-shared')).toBeNull();
    expect(FakeImage.instances).toHaveLength(2);
    FakeImage.instances[1].onload?.();
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(cache.get('asset-shared')).toBe(FakeImage.instances[1]);
  });
});

function documentWithSvg() {
  const doc = createDocument();
  doc.transact('IMAGE', (tx) => {
    tx.add('assets', { id: 'svg-asset', name: 'figura.svg', mime: 'image/svg+xml', size: 1, dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' });
    tx.addEntity<ImageEntity>({
      ...entityDefaults(doc), type: 'image', assetId: 'svg-asset', position: { x: 0, y: 0 }, u: { x: 10, y: 0 }, v: { x: 0, y: 10 },
      clipEnabled: false, opacity: 1, fade: 0, brightness: 50, contrast: 50,
    });
  });
  return doc;
}

const VALID_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2y8AAAAASUVORK5CYII=';

function documentWithPng(dataUrl = VALID_PNG) {
  const doc = createDocument();
  doc.transact('IMAGE', (tx) => {
    tx.add('assets', { id: 'png-asset', name: 'plano.png', mime: 'image/png', size: 68, dataUrl });
    tx.addEntity<ImageEntity>({
      ...entityDefaults(doc), type: 'image', assetId: 'png-asset', position: { x: 0, y: 0 }, u: { x: 10, y: 0 }, v: { x: 0, y: 10 },
      clipEnabled: false, opacity: 1, fade: 0, brightness: 50, contrast: 50,
    });
  });
  return doc;
}

describe('preparación de imágenes de exportación', () => {
  it('limita el canvas al convertir una imagen de dimensiones enormes', async () => {
    class FakeImage {
      naturalWidth = 20_000;
      naturalHeight = 20_000;
      src = '';
      decode = vi.fn().mockResolvedValue(undefined);
    }
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL: () => 'data:image/png;base64,eA==' };
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', { createElement: () => canvas });

    const images = await prepareExportImages(documentWithSvg());
    expect(images.get('svg-asset')).toBe('data:image/png;base64,eA==');
    expect(images.omittedAssets).toEqual([]);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_777_216);
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(8192);
    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, canvas.width, canvas.height);
  });

  it('cancela una decodificación pendiente sin publicar la imagen', async () => {
    class FakeImage {
      static latest: FakeImage;
      naturalWidth = 100;
      naturalHeight = 100;
      src = '';
      decode = () => new Promise<void>(() => undefined);
      constructor() { FakeImage.latest = this; }
    }
    vi.stubGlobal('Image', FakeImage);
    const controller = new AbortController();
    const preparing = prepareExportImages(documentWithSvg(), controller.signal);
    controller.abort();
    await expect(preparing).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeImage.latest.src).toBe('');
  });

  it('registra un recurso que no pudo decodificarse', async () => {
    class FakeImage {
      src = '';
      decode = vi.fn().mockRejectedValue(new Error('invalid image'));
    }
    vi.stubGlobal('Image', FakeImage);

    const images = await prepareExportImages(documentWithSvg());
    expect(images.get('svg-asset')).toBeNull();
    expect(images.omittedAssets).toEqual(['figura.svg']);
  });

  it('no publica un PNG dañado en SVG y registra su nombre', async () => {
    class FakeImage {
      static latest: FakeImage;
      src = '';
      decode = vi.fn().mockRejectedValue(new Error('invalid PNG'));
      constructor() { FakeImage.latest = this; }
    }
    vi.stubGlobal('Image', FakeImage);

    const images = await prepareExportImages(documentWithPng('data:image/png;base64,eA=='));
    expect(images.get('png-asset')).toBeNull();
    expect(images.omittedAssets).toEqual(['plano.png']);
    expect(FakeImage.latest.src).toBe('');
  });

  it('conserva los bytes originales de un PNG válido tras decodificarlo', async () => {
    class FakeImage {
      naturalWidth = 2;
      naturalHeight = 3;
      src = '';
      decode = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('Image', FakeImage);

    const images = await prepareExportImages(documentWithPng());
    expect(images.get('png-asset')).toBe(VALID_PNG);
    expect(images.omittedAssets).toEqual([]);
  });
});
