import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installDynamicBlocks } from '../blocks/install';
import { installDynamicSamples } from '../blocks/samples';
import { createDocument, entityDefaults } from '../document/defaults';
import type { ImageEntity, LineEntity } from '../document/types';
import { Editor } from '../editor/editor';
import { plotContext, savePdf, saveSvg } from './output';
import type { CommandApi } from './types';

const imagePreparation = vi.hoisted(() => ({
  promise: Promise.resolve({ get: (() => null) as (assetId: string, page?: number) => string | null, omittedAssets: [] as string[] }),
  resolve: undefined as undefined | ((prepared: { get: (assetId: string, page?: number) => string | null; omittedAssets: string[] }) => void),
}));

vi.mock('../render/assets', () => ({
  prepareExportImages: vi.fn(() => imagePreparation.promise),
}));

vi.mock('../storage/fileAccess', () => ({
  saveFile: vi.fn().mockResolvedValue({ kind: 'download-started' }),
}));

beforeEach(() => {
  imagePreparation.promise = new Promise((resolve) => { imagePreparation.resolve = resolve; });
});

describe('instantánea de trazado', () => {
  it('no mezcla un dibujo sustituido mientras se preparan sus imágenes', async () => {
    const original = createDocument({ title: 'Original' });
    original.transact('LINE', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(original), id: 'linea-original', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 },
    }));
    const editor = new Editor(original);
    const controller = new AbortController();
    const preparing = plotContext({ editor, signal: controller.signal } as CommandApi);

    const replacement = createDocument({ title: 'Reemplazo' });
    replacement.transact('LINE', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(replacement), id: 'linea-nueva', type: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 0 },
    }));
    editor.doc.replaceData(replacement.data, replacement.id);
    imagePreparation.resolve?.({ get: () => null, omittedAssets: [] });

    const context = await preparing;
    expect(context.doc.settings.title).toBe('Original');
    expect(context.doc.entity('linea-original')).toBeDefined();
    expect(context.doc.entity('linea-nueva')).toBeUndefined();
    context.dispose();
  });

  it('descarta la instantánea si la orden se cancela durante la preparación', async () => {
    const editor = new Editor(createDocument());
    const controller = new AbortController();
    const preparing = plotContext({ editor, signal: controller.signal } as CommandApi);

    controller.abort();
    imagePreparation.resolve?.({ get: () => null, omittedAssets: [] });

    await expect(preparing).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('evalúa bloques dinámicos con las entidades de la instantánea', async () => {
    const original = createDocument();
    const [, blockId] = installDynamicSamples(original);
    const editor = new Editor(original);
    installDynamicBlocks(editor.ctx);
    const preparing = plotContext({ editor, signal: new AbortController().signal } as CommandApi);

    editor.doc.replaceData(createDocument().data);
    imagePreparation.resolve?.({ get: () => null, omittedAssets: [] });

    const context = await preparing;
    const parameterId = context.doc.data.blocks.get(blockId)?.dynamic?.parameters[0]?.id;
    expect(parameterId).toBeDefined();
    expect(context.ctx.evaluateBlock(blockId, { values: { [parameterId!]: 'Toma doble' } }).entities).toHaveLength(6);
    context.dispose();
  });

  it('advierte antes de guardar cuando un recurso se omitió', async () => {
    const editor = new Editor(createDocument());
    const warn = vi.fn();
    const api = { editor, signal: new AbortController().signal, warn, info: vi.fn(), t: (value: { es: string }) => value.es } as unknown as CommandApi;
    const saving = saveSvg(api, editor.space);
    imagePreparation.resolve?.({ get: () => null, omittedAssets: ['calco.pdf'] });

    await saving;
    expect(warn).toHaveBeenCalledWith({
      es: 'No se incluyó el recurso «calco.pdf» en la exportación.',
      en: 'The asset “calco.pdf” could not be included in the export.',
    });
  });

  it('advierte si el backend PDF rechaza una imagen incrustada', async () => {
    const doc = createDocument();
    const brokenPng = 'data:image/png;base64,eA==';
    doc.transact('IMAGE', (tx) => {
      tx.add('assets', { id: 'broken', name: 'plano.png', mime: 'image/png', size: 1, dataUrl: brokenPng });
      tx.addEntity<ImageEntity>({
        ...entityDefaults(doc), type: 'image', assetId: 'broken', position: { x: 0, y: 0 },
        u: { x: 10, y: 0 }, v: { x: 0, y: 10 }, clipEnabled: false,
        opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });
    const editor = new Editor(doc);
    const warn = vi.fn();
    const api = { editor, signal: new AbortController().signal, warn, info: vi.fn() } as unknown as CommandApi;
    const saving = savePdf(api, [editor.space], 'modelo');
    imagePreparation.resolve?.({ get: () => brokenPng, omittedAssets: [] });

    await saving;
    expect(warn).toHaveBeenCalledWith({
      es: 'No se incluyó el recurso «plano.png» en la exportación.',
      en: 'The asset “plano.png” could not be included in the export.',
    });
  });
});
