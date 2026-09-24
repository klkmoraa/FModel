import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { ArrayEntity, AssetRecord, DocumentData, LineEntity, ViewportEntity } from '../document/types';
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
  it('rechaza una escala de viewport no positiva antes de abrir el dibujo', () => {
    const doc = createDocument();
    const layoutId = [...doc.data.layouts.keys()][0];
    doc.transact('VIEWPORT', (tx) => tx.addEntity<ViewportEntity>({
      ...entityDefaults(doc, layoutId), type: 'viewport', center: { x: 100, y: 100 }, width: 100, height: 100,
      viewCenter: { x: 0, y: 0 }, scale: 0, viewTwist: 0, displayLocked: false, on: true,
      frozenLayers: [], layerOverrides: {},
    }));
    expect(() => fromNativeFile(toNativeFile(doc.data, doc.id))).toThrow(NativeFormatError);
  });

  it('rechaza una matriz importada cuya expansión excede el límite de entidades', () => {
    const doc = createDocument();
    doc.transact('MATRIZ GRANDE', (tx) => {
      tx.add('blocks', {
        id: 'array-source', name: '*A1', kind: 'array', basePoint: { x: 0, y: 0 }, description: '',
        units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1,
      });
      for (const id of ['source-1', 'source-2']) {
        tx.addEntity<LineEntity>({
          ...entityDefaults(doc, 'array-source'), id, type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 },
        });
      }
      tx.addEntity<ArrayEntity>({
        ...entityDefaults(doc), id: 'array-1', type: 'array', sourceBlockId: 'array-source', basePoint: { x: 0, y: 0 },
        params: { kind: 'rect', columns: 300, rows: 500, columnSpacing: 10, rowSpacing: 10, angle: 0 },
      });
    });

    expect(() => fromNativeFile(toNativeFile(doc.data, doc.id))).toThrow(NativeFormatError);
  });

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

  it('conserva la matriz afín de una matriz asociativa movida', () => {
    const doc = createDocument();
    doc.transact('MATRIZ', (tx) => {
      tx.add('blocks', {
        id: 'array-source',
        name: '*U1',
        kind: 'array',
        basePoint: { x: 0, y: 0 },
        description: '',
        units: 'unitless',
        explodable: true,
        scaleUniformly: false,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<ArrayEntity>({
        ...entityDefaults(doc),
        id: 'array-1',
        type: 'array',
        sourceBlockId: 'array-source',
        sourceMatrix: { a: 1, b: 0, c: 0, d: 1, e: 25, f: -10 },
        basePoint: { x: 25, y: -10 },
        params: { kind: 'rect', columns: 2, rows: 2, columnSpacing: 10, rowSpacing: 5, angle: 0 },
      });
    });

    const result = fromNativeFile(toNativeFile(doc.data, doc.id));

    expect((result.data.entities.get('array-1') as ArrayEntity).sourceMatrix).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 25, f: -10 });
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

  it('no escribe un paquete con más entradas ZIP de las que admite el lector', () => {
    const { data, id } = sample();
    const asset = data.assets.get('a1')!;
    for (let i = 2; i <= INPUT_LIMITS.maxZipEntries - 1; i++) {
      data.assets.set(`a${i}`, { ...asset, id: `a${i}` });
    }

    expect(() => writePackage(data, id)).toThrow(/demasiado grande|too large/i);
  });

  it('no escribe colecciones nativas que el lector rechazará por tamaño', () => {
    const { data, id } = sample();
    const asset = data.assets.get('a1')!;
    for (let i = 2; i <= INPUT_LIMITS.maxAssets + 1; i++) data.assets.set(`a${i}`, { ...asset, id: `a${i}` });

    expect(() => writePackage(data, id)).toThrow(/assets.*too large/i);
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

  it('rechaza versiones fraccionarias del formato', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);

    expect(() => fromNativeFile({ ...file, version: 1.5 })).toThrow(NativeFormatError);
  });

  it('rechaza unidades desconocidas antes de abrir el dibujo', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);

    expect(() => fromNativeFile({ ...file, settings: { ...file.settings, units: 'invalid' } })).toThrow(NativeFormatError);
    expect(() => fromNativeFile({ ...file, settings: { ...file.settings, insUnits: 'invalid' } })).toThrow(NativeFormatError);
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

  it('rechaza IDs de recursos que escaparían del directorio assets del ZIP', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id, { embedAssets: true });
    const asset = (file.collections.assets as AssetRecord[])[0];

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, assets: [{ ...asset, id: '../plano' }] } })).toThrow(NativeFormatError);
    data.assets.set('../plano', { ...asset, id: '../plano' });
    expect(() => writePackage(data, id)).toThrow(NativeFormatError);
  });

  it('rechaza recursos remotos y SVG que intentan cargar contenido externo', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id, { embedAssets: true });
    const asset = (file.collections.assets as AssetRecord[])[0];
    const remote = { ...asset, dataUrl: 'https://example.com/tracker.png' };
    const unsafeSvg = btoa('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/tracker.png"/></svg>');
    const svg = { ...asset, mime: 'image/svg+xml', dataUrl: `data:image/svg+xml;base64,${unsafeSvg}` };

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, assets: [remote] } })).toThrow(NativeFormatError);
    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, assets: [svg] } })).toThrow(NativeFormatError);

    data.assets.set(asset.id, remote);
    expect(() => writePackage(data, id)).toThrow(NativeFormatError);
  });

  it('rechaza imágenes con MIME PNG pero bytes de otro formato, también dentro del ZIP', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id, { embedAssets: true });
    const asset = (file.collections.assets as AssetRecord[])[0];
    const invalid = { ...asset, dataUrl: 'data:image/png;base64,eA==' };

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, assets: [invalid] } })).toThrow(NativeFormatError);

    const metadataOnly = toNativeFile(data, id);
    const zipped = zipSync({
      'document.json': strToU8(JSON.stringify(metadataOnly)),
      [`assets/${asset.id}`]: strToU8('x'),
    });
    expect(() => readPackage(zipped)).toThrow(NativeFormatError);
  });

  it('valida también el SVG binario extraído de un paquete ZIP', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const asset = (file.collections.assets as AssetRecord[])[0];
    (file.collections.assets as AssetRecord[])[0] = { ...asset, mime: 'image/svg+xml' };
    const unsafeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/tracker.png"/></svg>';
    const bytes = zipSync({
      'document.json': strToU8(JSON.stringify(file)),
      [`assets/${asset.id}`]: strToU8(unsafeSvg),
    });

    expect(() => readPackage(bytes)).toThrow(NativeFormatError);
  });

  it('conserva SVG local con referencias internas y gradientes', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id, { embedAssets: true });
    const asset = (file.collections.assets as AssetRecord[])[0];
    const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0"/></linearGradient><path id="p" d="M0 0L1 1"/></defs><rect width="1" height="1" fill="url(#g)"/><use href="#p"/></svg>';
    const svg = { ...asset, mime: 'image/svg+xml', size: safeSvg.length, dataUrl: `data:image/svg+xml;base64,${btoa(safeSvg)}` };

    const result = fromNativeFile({ ...file, collections: { ...file.collections, assets: [svg] } });

    expect(result.data.assets.get(asset.id)?.dataUrl).toBe(svg.dataUrl);
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

  it('rechaza entidades cuyo discriminante no coincide con una estructura completa', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];
    const { end: _end, ...lineWithoutEnd } = line;

    expect(() => fromNativeFile({
      ...file,
      collections: { ...file.collections, entities: [lineWithoutEnd] },
    })).toThrow(NativeFormatError);
  });

  it('rechaza tablas CAD y grupos truncados con un error de formato controlado', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);

    expect(() => fromNativeFile({
      ...file,
      collections: { ...file.collections, mlineStyles: [{ id: 'ml-roto', name: 'Roto' }] },
    })).toThrow(NativeFormatError);
    expect(() => fromNativeFile({
      ...file,
      collections: { ...file.collections, groups: [{ id: 'g-roto', name: 'Roto' }] },
    })).toThrow(NativeFormatError);
  });

  it('rechaza ajustes estructuralmente inválidos antes de crear el documento', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);

    expect(() => fromNativeFile({
      ...file,
      settings: { ...file.settings, annotationScales: null },
    })).toThrow(NativeFormatError);
    expect(() => fromNativeFile({
      ...file,
      settings: { ...file.settings, pointDisplay: null },
    })).toThrow(NativeFormatError);
  });

  it('rechaza definiciones dinámicas truncadas antes de evaluar el bloque', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const block = {
      id: 'blk-dinamico-roto', name: 'Dinámico roto', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '',
      units: 'unitless', explodable: true, scaleUniformly: false, annotative: false, revision: 1,
      dynamic: { parameters: [{}], actions: [], constraints: [], lookups: [], variables: [], propertyOrder: [] },
    };

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, blocks: [block] } })).toThrow(NativeFormatError);
  });

  it('rechaza referencias colgantes dentro de una definición dinámica', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const block = {
      id: 'blk-dinamico', name: 'Dinámico', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '',
      units: 'unitless', explodable: true, scaleUniformly: false, annotative: false, revision: 1,
      dynamic: {
        parameters: [{
          id: 'p1', type: 'linear', name: 'Longitud', label: 'Longitud', showInProperties: true,
          chainActions: false, gripCount: 2, base: { x: 0, y: 0 }, end: { x: 10, y: 0 },
          baseLocation: 'start', valueSet: { kind: 'none' },
        }],
        actions: [{
          id: 'a1', type: 'move', name: 'Mover', paramId: 'p1', selection: ['entidad-ausente'],
          paramPoint: 'end', axis: 'x', distanceMultiplier: 1, angleOffset: 0,
        }],
        constraints: [], lookups: [], variables: [], propertyOrder: ['p1'],
      },
    };

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, blocks: [block] } })).toThrow(NativeFormatError);
  });

  it('rechaza contenido de directriz que apunta a un bloque inexistente', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];
    const mleader = {
      ...line,
      id: 'ml1',
      type: 'mleader',
      style: 'standard',
      leaders: [{ vertices: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }],
      landing: { x: 5, y: 5 },
      doglegLength: 2,
      direction: 1,
      content: { type: 'block', blockId: 'bloque-ausente', scale: 1, rotation: 0, attributes: {} },
    };

    expect(() => fromNativeFile({
      ...file,
      collections: { ...file.collections, entities: [mleader] },
    })).toThrow(NativeFormatError);
  });

  it('repara referencias no esenciales sin dejar IDs colgantes', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const line = (file.collections.entities as LineEntity[])[0];
    const altered = {
      ...file,
      collections: {
        ...file.collections,
        entities: [{ ...line, linetype: 'lt-ausente' }],
        groups: [{ id: 'g1', name: 'Grupo', description: '', members: ['l1', 'entidad-ausente'], selectable: true }],
      },
    };

    const result = fromNativeFile(altered);

    expect(result.data.entities.get('l1')?.linetype).toBe('ByLayer');
    expect(result.data.groups.get('g1')?.members).toEqual(['l1']);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('repara ajustes y estilos que apuntan a tablas inexistentes y lo advierte', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const missing = 'referencia-ausente';
    const replaceTextStyle = (records: unknown[] | undefined) => (records ?? []).map((record) => ({
      ...(record as Record<string, unknown>),
      textStyle: missing,
    }));
    const mlineStyles = (file.collections.mlineStyles ?? []).map((record) => {
      const style = record as Record<string, unknown>;
      return {
        ...style,
        elements: (style.elements as Record<string, unknown>[]).map((element) => ({ ...element, linetype: missing })),
      };
    });
    const altered = {
      ...file,
      settings: {
        ...file.settings,
        currentLayer: missing,
        currentTextStyle: missing,
        currentDimStyle: missing,
        currentMLeaderStyle: missing,
        currentTableStyle: missing,
        currentMLineStyle: missing,
        currentLinetype: missing,
      },
      collections: {
        ...file.collections,
        layers: (file.collections.layers ?? []).map((record) => ({ ...(record as Record<string, unknown>), linetype: missing })),
        dimStyles: replaceTextStyle(file.collections.dimStyles),
        mleaderStyles: replaceTextStyle(file.collections.mleaderStyles),
        tableStyles: replaceTextStyle(file.collections.tableStyles),
        mlineStyles,
      },
    };

    const result = fromNativeFile(altered);

    expect(result.data.layers.has(result.data.settings.currentLayer)).toBe(true);
    expect(result.data.textStyles.has(result.data.settings.currentTextStyle)).toBe(true);
    expect(result.data.dimStyles.has(result.data.settings.currentDimStyle)).toBe(true);
    expect(result.data.mleaderStyles.has(result.data.settings.currentMLeaderStyle)).toBe(true);
    expect(result.data.tableStyles.has(result.data.settings.currentTableStyle)).toBe(true);
    expect(result.data.mlineStyles.has(result.data.settings.currentMLineStyle)).toBe(true);
    expect(result.data.settings.currentLinetype).toBe('ByLayer');
    expect([...result.data.layers.values()].every((layer) => result.data.linetypes.has(layer.linetype))).toBe(true);
    expect([...result.data.dimStyles.values()].every((style) => result.data.textStyles.has(style.textStyle))).toBe(true);
    expect([...result.data.mleaderStyles.values()].every((style) => result.data.textStyles.has(style.textStyle))).toBe(true);
    expect([...result.data.tableStyles.values()].every((style) => result.data.textStyles.has(style.textStyle))).toBe(true);
    expect([...result.data.mlineStyles.values()].every((style) => style.elements.every((element) => element.linetype === 'ByLayer'))).toBe(true);
    expect(result.warnings).toContain('Se reparó la referencia «currentLayer» de los ajustes. / Repaired settings reference "currentLayer".');
  });

  it('repara referencias de vistas, estados y filtros de capas', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id);
    const layer = (file.collections.layers as Record<string, unknown>[]).find((entry) => entry.id === 'muros')!;
    const snapshot = {
      on: layer.on,
      frozen: layer.frozen,
      locked: layer.locked,
      plot: layer.plot,
      color: layer.color,
      linetype: layer.linetype,
      lineweight: layer.lineweight,
      transparency: layer.transparency,
    };
    const altered = {
      ...file,
      collections: {
        ...file.collections,
        views: [{ id: 'v1', name: 'Vista', space: 'espacio-ausente', center: { x: 0, y: 0 }, height: 100, rotation: 0, layerState: 'estado-ausente' }],
        layerStates: [{ id: 'ls1', name: 'Estado', description: '', currentLayer: 'capa-ausente', layers: { muros: snapshot, 'capa-ausente': snapshot } }],
        layerFilters: [{ id: 'lf1', name: 'Filtro', rule: {}, layers: ['muros', 'capa-ausente'] }],
      },
    };

    const result = fromNativeFile(altered);

    expect(result.data.views.get('v1')).toMatchObject({ space: '*model', layerState: undefined });
    expect(result.data.layerStates.get('ls1')?.currentLayer).toBe(result.data.settings.currentLayer);
    expect(Object.keys(result.data.layerStates.get('ls1')?.layers ?? {})).toEqual(['muros']);
    expect(result.data.layerFilters.get('lf1')?.layers).toEqual(['muros']);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('rechaza imágenes y calcos con recursos inexistentes o de tipo incompatible', () => {
    const { data, id } = sample();
    const file = toNativeFile(data, id, { embedAssets: true });
    const line = (file.collections.entities as LineEntity[])[0];
    const base = { ...line, position: { x: 0, y: 0 }, clipEnabled: false, opacity: 1, fade: 0 };
    const image = { ...base, type: 'image', assetId: 'ausente', u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, brightness: 50, contrast: 50 };
    const pdf = { ...base, type: 'pdfunderlay', assetId: 'a1', page: 1, scale: 1, rotation: 0, monochrome: false };

    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, entities: [image] } })).toThrow(NativeFormatError);
    expect(() => fromNativeFile({ ...file, collections: { ...file.collections, entities: [pdf] } })).toThrow(NativeFormatError);
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
    expect(() => readPackage(new Uint8Array([0x50, 0x4b, 0x03]))).toThrow(/dañado|damaged/i);

    const bytes = zipSync({ 'document.json': strToU8('{}') });
    const centralDirectory = bytes.findIndex((_, i) => bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x01 && bytes[i + 3] === 0x02);
    expect(centralDirectory).toBeGreaterThanOrEqual(0);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(centralDirectory + 24, INPUT_LIMITS.maxExpandedBytes + 1, true);

    expect(() => readPackage(bytes)).toThrow(/demasiado grande|too large/i);
  });

  it('convierte JSON dañado del paquete o del modo depuración en un error de formato', () => {
    const damagedPackage = zipSync({ 'document.json': strToU8('{"format":') });

    expect(() => readPackage(damagedPackage)).toThrow(NativeFormatError);
    expect(() => readPackage(strToU8('{"format":'))).toThrow(NativeFormatError);
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
