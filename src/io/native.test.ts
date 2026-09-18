import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { AssetRecord, DocumentData, LineEntity } from '../document/types';
import { INPUT_LIMITS } from './limits';
import { FORMAT, FORMAT_VERSION, fromNativeFile, NativeFormatError, readPackage, toNativeFile, writeDebugJson, writePackage } from './native';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sample(): { data: DocumentData; id: string } {
  const doc = createDocument({ title: 'Nave industrial' });
  doc.transact('PREPARA', (tx) => {
    const layer0 = [...doc.data.layers.values()][0];
    tx.add('layers', { ...layer0, id: 'muros', name: 'Muros', color: '#7657D5' });
    tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: 'l1', order: 1, type: 'line', layer: 'muros', start: { x: 0, y: 0 }, end: { x: 12.5, y: 0 } });
    tx.add('assets', { id: 'a1', name: 'logo.png', mime: 'image/png', size: 70, dataUrl: PNG } as AssetRecord);
  });
  return { data: doc.data, id: doc.id };
}

describe('formato nativo', () => {
  it('conserva colecciones, ajustes e identidad del dibujo', () => {
    const { data, id } = sample();
    const res = fromNativeFile(toNativeFile(data, id, { embedAssets: true }));
    expect(res.documentId).toBe(id);
    expect(res.warnings).toEqual([]);
    expect(res.data.settings.title).toBe('Nave industrial');
    expect(res.data.layers.get('muros')?.name).toBe('Muros');
    expect((res.data.entities.get('l1') as LineEntity).end).toEqual({ x: 12.5, y: 0 });
    expect(res.data.assets.get('a1')?.dataUrl).toBe(PNG);
  });

  it('sin embeber recursos el JSON no lleva los binarios', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    expect((file.collections.assets as AssetRecord[])[0].dataUrl).toBeUndefined();
    expect(file.format).toBe(FORMAT);
    expect(file.version).toBe(FORMAT_VERSION);
  });

  it('el paquete ZIP guarda los recursos aparte y los devuelve al abrir', () => {
    const { data, id } = sample();
    const bytes = writePackage(data, id);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const res = readPackage(bytes);
    expect(res.documentId).toBe(id);
    expect(res.data.assets.get('a1')?.dataUrl).toBe(PNG);
    expect((res.data.entities.get('l1') as LineEntity).start).toEqual({ x: 0, y: 0 });
  });

  it('readPackage también acepta el JSON de depuración', () => {
    const { data, id } = sample();
    const res = readPackage(new TextEncoder().encode(writeDebugJson(data, id)));
    expect(res.data.entities.size).toBe(1);
  });

  it('avisa si falta un recurso del paquete', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const res = fromNativeFile(file);
    expect(res.warnings.some((w) => w.includes('logo.png'))).toBe(false);
    // el paquete sin el binario correspondiente sí avisa
    const doc = createDocument();
    doc.transact('A', (tx) => tx.add('assets', { id: 'a9', name: 'plano.pdf', mime: 'application/pdf', size: 10 } as AssetRecord));
    const pkg = readPackage(writePackage(doc.data, doc.id));
    expect(pkg.warnings.some((w) => w.includes('plano.pdf'))).toBe(true);
  });

  it('rechaza archivos ajenos o de una versión más reciente', () => {
    expect(() => fromNativeFile({ format: 'otro', version: 1 })).toThrow(NativeFormatError);
    expect(() => fromNativeFile(null)).toThrow(NativeFormatError);
    expect(() => fromNativeFile({ format: FORMAT, version: FORMAT_VERSION + 1, collections: {} })).toThrow(/más reciente/);
  });

  it('rechaza coordenadas no finitas antes de construir el documento', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];
    const altered = { ...file, collections: { ...file.collections, entities: [{ ...line, start: { x: Infinity, y: 0 } }] } };

    expect(() => fromNativeFile(altered)).toThrow(NativeFormatError);
  });

  it('rechaza identificadores duplicados en una colección', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];
    const altered = { ...file, collections: { ...file.collections, entities: [line, { ...line, end: { x: 24, y: 0 } }] } };

    expect(() => fromNativeFile(altered)).toThrow(NativeFormatError);
  });

  it('rechaza identificadores vacíos en una colección', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, entities: [{ ...line, id: '' }] } })).toThrow(NativeFormatError);
  });

  it('rechaza la identidad vacía del documento', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);

    expect(() => fromNativeFile({ ...file, documentId: '' })).toThrow(NativeFormatError);
  });

  it('rechaza una envoltura sin colecciones', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);

    expect(() => fromNativeFile({ ...file, collections: null })).toThrow(NativeFormatError);
  });

  it('rechaza entidades que apuntan a una capa inexistente', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];
    const altered = { ...file, collections: { ...file.collections, entities: [{ ...line, layer: 'capa-ausente' }] } };

    expect(() => fromNativeFile(altered)).toThrow(NativeFormatError);
  });

  it('rechaza discriminantes de entidad desconocidos', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, entities: [{ ...line, type: 'spline-3d' }] } })).toThrow(NativeFormatError);
  });

  it('rechaza paquetes ZIP con demasiadas entradas antes de extraerlos', () => {
    const entries = Object.fromEntries(Array.from({ length: 1_001 }, (_, i) => [`assets/${i}`, strToU8('x')]));
    entries['document.json'] = strToU8('{}');

    expect(() => readPackage(zipSync(entries))).toThrow(/demasiado grande|too large/i);
  });

  it('rechaza ZIP truncado y expansión declarada excesiva antes de extraerlos', () => {
    expect(() => readPackage(new Uint8Array([0x50, 0x4b, 0x03]))).toThrow();

    const bytes = zipSync({ 'document.json': strToU8('{}') });
    const centralDirectory = bytes.findIndex((_, i) => bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x01 && bytes[i + 3] === 0x02);
    expect(centralDirectory).toBeGreaterThanOrEqual(0);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(centralDirectory + 24, INPUT_LIMITS.maxExpandedBytes + 1, true);

    expect(() => readPackage(bytes)).toThrow(/demasiado grande|too large/i);
  });

  it('rechaza JSON con tipos de colecciones incorrectos', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, entities: 'no es una lista' } })).toThrow(NativeFormatError);
  });

  it('rechaza entidades con más puntos que el límite', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];
    const vertices = Array.from({ length: INPUT_LIMITS.maxPointsPerEntity + 1 }, () => ({ x: 0, y: 0 }));

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, entities: [{ ...line, type: 'lwpolyline', vertices, closed: false }] } })).toThrow(NativeFormatError);
  });

  it('migra archivos antiguos y lo hace constar', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id, { embedAssets: true });
    const old = {
      ...file,
      version: 1,
      collections: {
        ...file.collections,
        layers: (file.collections.layers as Record<string, unknown>[]).map(({ transparency: _t, ...rest }) => rest),
        layouts: (file.collections.layouts as { page: Record<string, unknown> }[]).map((l) => ({ ...l, page: { ...l.page, margins: undefined } })),
        blocks: (file.collections.blocks as Record<string, unknown>[]).map(({ revision: _r, ...rest }) => rest),
        entities: (file.collections.entities as Record<string, unknown>[]).map(({ order: _o, ...rest }) => rest),
      },
    };
    const res = fromNativeFile(old);
    expect(res.warnings).toEqual(['Migrado a formato v2.', 'Migrado a formato v3.']);
    expect(res.data.layers.get('muros')?.transparency).toBe(0);
    expect([...res.data.layouts.values()][0].page.margins).toBeTruthy();
    expect((res.data.entities.get('l1') as LineEntity).order).toBe(1);
  });

  it('un archivo sin tablas básicas recupera las de un dibujo nuevo', () => {
    const res = fromNativeFile({ format: FORMAT, version: FORMAT_VERSION, documentId: 'd1', settings: { currentLayer: 'no-existe' }, collections: { entities: [] } });
    expect(res.data.layers.size).toBeGreaterThan(0);
    expect(res.data.linetypes.size).toBeGreaterThan(0);
    expect(res.data.layouts.size).toBeGreaterThan(0);
    expect(res.data.layers.has(res.data.settings.currentLayer)).toBe(true);
  });
});
