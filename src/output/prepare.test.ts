import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { ImageEntity, TextEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { createContext } from '../model/context';
import { preparePlotContext, preparePlotPreview } from './prepare';
import { exportSvg, pageFor } from './plot';

afterEach(() => vi.unstubAllGlobals());

describe('vista previa del trazado', () => {
  it('incluye los mismos recursos rasterizados que el SVG exportado', async () => {
    class FakeImage {
      naturalWidth = 1;
      naturalHeight = 1;
      src = '';
      decode = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('Image', FakeImage);
    const doc = createDocument();
    const ctx = createContext(doc);
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2y8AAAAASUVORK5CYII=';
    doc.transact('IMAGE', (tx) => {
      tx.add('assets', { id: 'logo', name: 'logo.png', mime: 'image/png', size: 68, dataUrl });
      tx.addEntity<ImageEntity>({
        ...entityDefaults(doc), type: 'image', assetId: 'logo', position: { x: 0, y: 0 }, u: { x: 10, y: 0 }, v: { x: 0, y: 10 },
        clipEnabled: false, opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });
    const page = pageFor(doc, MODEL_SPACE_ID);

    const preview = await preparePlotPreview(doc, ctx, MODEL_SPACE_ID, page);
    const prepared = await preparePlotContext(doc, ctx);
    try {
      expect(preview.svg).toBe(exportSvg(prepared, MODEL_SPACE_ID, page).data);
      expect(preview.svg).toContain(`<image href="${dataUrl}"`);
      expect(preview.omittedAssets).toEqual([]);
    } finally {
      prepared.dispose();
      ctx.dispose();
    }
  });

  it('usa la escala de anotación guardada para el trazado del modelo', async () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('scale', (tx) => {
      tx.setSettings({ annotationScale: 0.25 });
      tx.addEntity<TextEntity>({
        ...entityDefaults(doc), type: 'text', text: '{{scale}}', position: { x: 20, y: 20 },
        height: 5, rotation: 0, widthFactor: 1, oblique: 0,
        style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline',
      });
    });

    const preview = await preparePlotPreview(doc, ctx, MODEL_SPACE_ID, pageFor(doc, MODEL_SPACE_ID));
    expect(preview.svg).toContain('>1:4</text>');
    ctx.dispose();
  });
});
