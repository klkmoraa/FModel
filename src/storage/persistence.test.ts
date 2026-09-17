import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { Persistence } from './persistence';

const newLine = (doc: ReturnType<typeof createDocument>, x: number) =>
  doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: `l${x}`, order: x, type: 'line', start: { x, y: 0 }, end: { x, y: 10 } }));

let doc = createDocument();
let persistence = new Persistence(() => doc, () => 'Plano');

beforeEach(() => {
  doc = createDocument({ title: 'Plano' });
  persistence = new Persistence(() => doc, () => 'Plano');
});

describe('autoguardado y recuperación', () => {
  it('solo guarda el borrador si hay cambios sin guardar', async () => {
    expect(await persistence.autosave()).toBe(false);
    newLine(doc, 1);
    expect(await persistence.autosave()).toBe(true);
    const rec = await persistence.pendingRecovery();
    expect(rec?.documentId).toBe(doc.id);
    expect(rec?.file.collections.entities).toHaveLength(1);
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
});

describe('versiones', () => {
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
