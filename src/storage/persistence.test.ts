import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import * as idb from './idb';
import { classifyStorageError, Persistence } from './persistence';

const newLine = (doc: ReturnType<typeof createDocument>, x: number) =>
  doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: `l${x}`, order: x, type: 'line', start: { x, y: 0 }, end: { x, y: 10 } }));

let doc = createDocument();
let persistence = new Persistence(() => doc, () => 'Plano');

beforeEach(() => {
  doc = createDocument({ title: 'Plano' });
  persistence = new Persistence(() => doc, () => 'Plano');
  vi.restoreAllMocks();
});

describe('clasificación de errores de almacenamiento (classifyStorageError)', () => {
  it('clasifica QuotaExceededError estándar, códigos numéricos legacy y variantes de navegador', () => {
    expect(classifyStorageError(new DOMException('The quota has been exceeded.', 'QuotaExceededError')).kind).toBe('quota');
    expect(classifyStorageError({ name: 'NS_ERROR_DOM_QUOTA_REACHED', message: 'Quota reached' }).kind).toBe('quota');
    expect(classifyStorageError({ code: 22, message: 'quota error' }).kind).toBe('quota');
    expect(classifyStorageError({ code: 1014, message: 'quota error' }).kind).toBe('quota');
    expect(classifyStorageError(new Error('Storage full: quota exceeded')).kind).toBe('quota');
    expect(classifyStorageError(new Error('disk full')).kind).toBe('quota');
    expect(classifyStorageError(new Error('out of disk space')).kind).toBe('quota');
    expect(classifyStorageError(new Error('no space left on device')).kind).toBe('quota');
    expect(classifyStorageError({ target: { error: new DOMException('The quota has been exceeded.', 'QuotaExceededError') } }).kind).toBe('quota');
  });

  it('clasifica estados inválidos, base de datos cerrada o IndexedDB no disponible como unavailable', () => {
    expect(classifyStorageError(new DOMException('The database connection is closing.', 'InvalidStateError')).kind).toBe('unavailable');
    expect(classifyStorageError({ name: 'DatabaseClosedError', message: 'Connection closed' }).kind).toBe('unavailable');
    expect(classifyStorageError({ name: 'SecurityError', message: 'Storage is disabled' }).kind).toBe('unavailable');
    expect(classifyStorageError(new DOMException('Permission denied', 'NotAllowedError')).kind).toBe('unavailable');
    expect(classifyStorageError(new Error('IndexedDB no disponible en modo incógnito')).kind).toBe('unavailable');
  });

  it('clasifica errores desconocidos o valores nulos como unknown', () => {
    expect(classifyStorageError(new Error('Error imprevisto')).kind).toBe('unknown');
    expect(classifyStorageError(null).kind).toBe('unknown');
    expect(classifyStorageError(undefined).kind).toBe('unknown');
  });
});

describe('autoguardado tipado y modelo de salud (PersistenceHealth)', () => {
  it('autosave sin cambios retorna not-needed y conserva salud intacta', async () => {
    const res = await persistence.autosave();
    expect(res).toEqual({ status: 'not-needed' });
    expect(persistence.health.status).toBe('protected');
    expect(persistence.health.lastFailureAt).toBeNull();
  });

  it('autosave con cambios retorna saved y actualiza lastSuccessAt', async () => {
    newLine(doc, 1);
    const res = await persistence.autosave();
    expect(res.status).toBe('saved');
    expect(persistence.health.status).toBe('protected');
    expect(persistence.health.lastSuccessAt).toBeGreaterThan(0);
    const rec = await persistence.pendingRecovery();
    expect(rec?.documentId).toBe(doc.id);
    expect(rec?.file.collections.entities).toHaveLength(1);
  });

  it('QuotaExceededError en autosave retorna failed/quota y degrada la salud a degraded', async () => {
    newLine(doc, 1);
    const quotaError = new DOMException('Storage quota exceeded', 'QuotaExceededError');
    vi.spyOn(idb, 'idbWrite').mockRejectedValueOnce(quotaError);
    vi.spyOn(idb, 'idbPut').mockRejectedValueOnce(quotaError);

    const res = await persistence.autosave();
    expect(res.status).toBe('failed');
    if (res.status === 'failed') {
      expect(res.reason).toBe('quota');
      expect(res.error.kind).toBe('quota');
    }
    expect(persistence.health.status).toBe('degraded');
    expect(persistence.health.lastError?.kind).toBe('quota');
    expect(persistence.health.lastFailureAt).toBeGreaterThan(0);
  });

  it('InvalidStateError en autosave retorna failed/unavailable y marca salud como unavailable', async () => {
    newLine(doc, 1);
    const stateError = new DOMException('Database is closing', 'InvalidStateError');
    vi.spyOn(idb, 'idbWrite').mockRejectedValueOnce(stateError);
    vi.spyOn(idb, 'idbPut').mockRejectedValueOnce(stateError);

    const res = await persistence.autosave();
    expect(res.status).toBe('failed');
    if (res.status === 'failed') {
      expect(res.reason).toBe('unavailable');
    }
    expect(persistence.health.status).toBe('unavailable');
    expect(persistence.health.lastError?.kind).toBe('unavailable');
  });

  it('un fallo transitorio seguido de una operación exitosa recupera el estado a protected', async () => {
    newLine(doc, 1);
    vi.spyOn(idb, 'idbWrite').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    vi.spyOn(idb, 'idbPut').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));

    const failRes = await persistence.autosave();
    expect(failRes.status).toBe('failed');
    expect(persistence.health.status).toBe('degraded');

    // Siguiente operación exitosa
    const successRes = await persistence.autosave();
    expect(successRes.status).toBe('saved');
    expect(persistence.health.status).toBe('protected');
    expect(persistence.health.lastError).toBeNull();
  });

  it('notifica a los listeners registrados mediante onHealthChange ante transiciones', async () => {
    const transitions: string[] = [];
    const unsub = persistence.onHealthChange((h) => transitions.push(h.status));

    newLine(doc, 1);
    vi.spyOn(idb, 'idbWrite').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    vi.spyOn(idb, 'idbPut').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    await persistence.autosave();

    await persistence.autosave();
    unsub();

    expect(transitions).toEqual(['protected', 'degraded', 'protected']);
  });

  it('una salida limpia deja de ofrecer la recuperación', async () => {
    newLine(doc, 1);
    await persistence.autosave();
    expect(await persistence.pendingRecovery()).not.toBeNull();
    doc.dirty = false;
    await persistence.markCleanExit();
    expect(await persistence.pendingRecovery()).toBeNull();
  });

  it('descartar el borrador lo elimina', async () => {
    newLine(doc, 1);
    await persistence.autosave();
    await persistence.discardRecovery();
    expect(await persistence.pendingRecovery()).toBeNull();
  });

  it('el borrador lleva los recursos embebidos para poder abrirlo solo', async () => {
    doc.transact('ASSET', (tx) => tx.add('assets', { id: 'a1', name: 'plano.png', mime: 'image/png', size: 4, dataUrl: 'data:image/png;base64,AAAA' }));
    await persistence.autosave();
    const rec = await persistence.pendingRecovery();
    expect((rec!.file.collections.assets as { dataUrl?: string }[])[0].dataUrl).toBe('data:image/png;base64,AAAA');
  });

  it('pendingRecovery() propaga error y degrada la salud ante fallo de lectura', async () => {
    vi.spyOn(idb, 'idbGet').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    await expect(persistence.pendingRecovery()).rejects.toThrow();
    expect(persistence.health.status).toBe('degraded');
    expect(persistence.health.lastOp).toBe('recovery');
  });
});

describe('operación atómica dibujo + versión (storeDrawingAndVersion)', () => {
  it('guarda dibujo y versión atómicamente en una sola transacción', async () => {
    newLine(doc, 3);
    const { drawing, version } = await persistence.storeDrawingAndVersion('Plano Casa', 'Versión inicial');
    expect(drawing.name).toBe('Plano Casa');
    expect(version.label).toBe('Versión inicial');

    const drawings = await persistence.drawings();
    expect(drawings.some((d) => d.id === doc.id && d.name === 'Plano Casa')).toBe(true);

    const versions = await persistence.versions(doc.id);
    expect(versions.some((v) => v.id === version.id)).toBe(true);
    expect(persistence.health.status).toBe('protected');
  });

  it('storeDrawingAndVersion reutiliza bytes precomputados si se proporcionan', async () => {
    newLine(doc, 2);
    const customBytes = new Uint8Array([1, 2, 3, 4]);
    const { drawing, version } = await persistence.storeDrawingAndVersion('Plano Rapido', 'V Rapida', customBytes);
    expect(drawing.bytes).toBe(customBytes);
    expect(version.bytes).toBe(customBytes);
    expect(persistence.health.lastOp).toBe('storeDrawingAndVersion');
  });

  it('si falla la escritura multi-store, se degrada la salud y se propaga el error', async () => {
    newLine(doc, 3);
    vi.spyOn(idb, 'idbWrite').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));

    await expect(persistence.storeDrawingAndVersion('Plano', 'V1')).rejects.toThrow();
    expect(persistence.health.status).toBe('degraded');
    expect(persistence.health.lastError?.kind).toBe('quota');
  });
});

describe('purga controlada de versiones automáticas (purgeAutoVersions)', () => {
  it('limpieza de versiones automáticas no borra versiones manuales', async () => {
    newLine(doc, 1);
    // 3 versiones manuales
    await persistence.saveVersion('Entrega 1', false);
    await persistence.saveVersion('Entrega 2', false);
    await persistence.saveVersion('Entrega 3', false);

    // 4 versiones automáticas
    await persistence.saveVersion('Auto 1', true);
    await persistence.saveVersion('Auto 2', true);
    await persistence.saveVersion('Auto 3', true);
    await persistence.saveVersion('Auto 4', true);

    const before = await persistence.versions(doc.id);
    expect(before.filter((v) => !v.auto)).toHaveLength(3);
    expect(before.filter((v) => v.auto)).toHaveLength(4);

    // Purgar conservando solo 1 automática
    const deleted = await persistence.purgeAutoVersions(1, doc.id);
    expect(deleted).toBe(3);

    const after = await persistence.versions(doc.id);
    expect(after.filter((v) => !v.auto)).toHaveLength(3);
    expect(after.filter((v) => v.auto)).toHaveLength(1);

    // Purgar todas las automáticas
    const deletedAllAutos = await persistence.purgeAutoVersions(0, doc.id);
    expect(deletedAllAutos).toBe(1);

    const remaining = await persistence.versions(doc.id);
    expect(remaining.filter((v) => v.auto)).toHaveLength(0);
    // Las 3 versiones manuales siguen intactas
    expect(remaining.filter((v) => !v.auto)).toHaveLength(3);
    expect(remaining.map((v) => v.label)).toEqual(expect.arrayContaining(['Entrega 1', 'Entrega 2', 'Entrega 3']));
  });

  it('purgeAutoVersions no transiciona falsamente la salud a protected si no se eliminó nada', async () => {
    // Provocar fallo para degradar
    newLine(doc, 1);
    vi.spyOn(idb, 'idbWrite').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    vi.spyOn(idb, 'idbPut').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'));
    await persistence.autosave();
    expect(persistence.health.status).toBe('degraded');

    // Purgar cuando no hay automáticas
    const count = await persistence.purgeAutoVersions(0, doc.id);
    expect(count).toBe(0);
    expect(persistence.health.status).toBe('degraded');
  });
});

describe('versiones e informe de errores', () => {
  it('guarda, lista y reabre una versión con su contenido', async () => {
    newLine(doc, 1);
    const v = await persistence.saveVersion('Antes de mover');
    newLine(doc, 2);
    await persistence.saveVersion('Después');
    const list = await persistence.versions(doc.id);
    expect(list.map((x) => x.label)).toEqual(['Después', 'Antes de mover']);
    expect(list[0].entityCount).toBe(2);
    const reopened = persistence.loadVersion(v);
    expect(reopened.documentId).toBe(doc.id);
    expect(reopened.data.entities.size).toBe(1);
  });

  it('versions() propaga el fallo de lectura para no confundir error con lista vacía', async () => {
    vi.spyOn(idb, 'idbAll').mockRejectedValueOnce(new Error('I/O read error'));
    await expect(persistence.versions(doc.id)).rejects.toThrow('I/O read error');
    expect(persistence.health.status).toBe('degraded');

    vi.spyOn(idb, 'idbAll').mockRejectedValueOnce(new DOMException('Database is closing', 'InvalidStateError'));
    await expect(persistence.versions(doc.id)).rejects.toThrow();
    expect(persistence.health.status).toBe('unavailable');
  });

  it('las versiones de otros dibujos no se mezclan', async () => {
    newLine(doc, 1);
    await persistence.saveVersion('Dibujo A');
    const otro = createDocument({ title: 'Otro' });
    const p2 = new Persistence(() => otro, () => 'Otro');
    await p2.saveVersion('Dibujo B');
    expect((await persistence.versions(doc.id)).every((v) => v.documentId === doc.id)).toBe(true);
    expect((await p2.versions(otro.id)).map((v) => v.label)).toEqual(['Dibujo B']);
    expect((await persistence.versions()).length).toBeGreaterThanOrEqual(2);
  });

  it('solo se conservan las 40 versiones automáticas más recientes', async () => {
    newLine(doc, 1);
    for (let i = 0; i < 45; i++) await persistence.saveVersion(`auto ${i}`, true);
    const autos = (await persistence.versions(doc.id)).filter((v) => v.auto);
    expect(autos).toHaveLength(40);
    expect(new Set(autos.map((v) => v.id)).size).toBe(40);
    await persistence.deleteVersion(autos[0].id);
    expect((await persistence.versions(doc.id)).some((v) => v.id === autos[0].id)).toBe(false);
  });

  it('el dibujo guardado se recupera byte a byte', async () => {
    newLine(doc, 7);
    const stored = await persistence.storeDrawing('Plano de planta');
    expect(stored.size).toBeGreaterThan(0);
    const reopened = persistence.loadVersion({ ...stored, documentId: doc.id, label: '', auto: false, entityCount: 1 });
    expect((reopened.data.entities.get('l7') as LineEntity).start).toEqual({ x: 7, y: 0 });
  });
});
