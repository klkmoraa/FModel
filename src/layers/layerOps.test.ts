import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults, LAYER0_ID } from '../document/defaults';
import type { CadDocument } from '../document/document';
import type { Id, LayerRecord, LineEntity } from '../document/types';
import { canDeleteLayer, captureLayerState, createLayer, isolateLayers, layerMatchesFilter, layerUsage, mergeLayers, purgeEmptyLayers, restoreLayerState, unisolateLayers, uniqueLayerName, validateLayerName, wildcardMatch } from './layerOps';

const fresh = () => createDocument();
const addLayer = (doc: CadDocument, props: Partial<LayerRecord>) => doc.transact('LAYER', (tx) => createLayer(tx, doc, props));
const addLine = (doc: CadDocument, layer: Id, id: string) => doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), id, order: 1, type: 'line', layer, start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }));

describe('nombres de capa', () => {
  it('rechaza vacíos, caracteres prohibidos y duplicados', () => {
    const doc = fresh();
    addLayer(doc, { name: 'Muros' });
    expect(validateLayerName(doc, 'Cimentación').ok).toBe(true);
    expect(validateLayerName(doc, '').ok).toBe(false);
    expect(validateLayerName(doc, 'A/B').ok).toBe(false);
    expect(validateLayerName(doc, 'muros').ok).toBe(false);
    const muros = [...doc.data.layers.values()].find((l) => l.name === 'Muros')!;
    expect(validateLayerName(doc, 'Muros', muros.id).ok).toBe(true);
  });

  it('propone un nombre libre a partir de uno en uso', () => {
    const doc = fresh();
    addLayer(doc, { name: 'Cotas' });
    expect(uniqueLayerName(doc, 'Cotas')).toBe('Cotas2');
    addLayer(doc, { name: 'Cotas2' });
    expect(uniqueLayerName(doc, 'Cotas')).toBe('Cotas3');
  });
});

describe('uso y borrado', () => {
  it('cuenta los objetos por capa', () => {
    const doc = fresh();
    const muros = addLayer(doc, { name: 'Muros' });
    addLine(doc, muros.id, 'e1');
    addLine(doc, muros.id, 'e2');
    expect(layerUsage(doc).get(muros.id)).toBe(2);
    expect(layerUsage(doc).get(LAYER0_ID) ?? 0).toBe(0);
  });

  it('protege la capa 0, la actual y las que tienen objetos', () => {
    const doc = fresh();
    const muros = addLayer(doc, { name: 'Muros' });
    addLine(doc, muros.id, 'e1');
    expect(canDeleteLayer(doc, LAYER0_ID).ok).toBe(false);
    expect(canDeleteLayer(doc, doc.settings.currentLayer).ok).toBe(false);
    expect(canDeleteLayer(doc, muros.id).ok).toBe(false);
    const vacia = addLayer(doc, { name: 'Vacía' });
    expect(canDeleteLayer(doc, vacia.id).ok).toBe(true);
  });

  it('fusionar lleva los objetos a la capa destino y elimina el origen', () => {
    const doc = fresh();
    const origen = addLayer(doc, { name: 'Provisional' });
    const destino = addLayer(doc, { name: 'Definitiva' });
    addLine(doc, origen.id, 'e1');
    const movidos = doc.transact('LAYMRG', (tx) => mergeLayers(tx, doc, [origen.id], destino.id));
    expect(movidos).toBe(1);
    expect(doc.entity('e1')!.layer).toBe(destino.id);
    expect(doc.data.layers.has(origen.id)).toBe(false);
  });

  it('purgar quita solo las capas vacías que no son del sistema', () => {
    const doc = fresh();
    const usada = addLayer(doc, { name: 'Usada' });
    addLayer(doc, { name: 'Sobrante' });
    addLine(doc, usada.id, 'e1');
    const nombres = doc.transact('PURGE', (tx) => purgeEmptyLayers(tx, doc));
    expect(nombres).toContain('Sobrante');
    expect(nombres).not.toContain('Usada');
    expect(doc.data.layers.has(LAYER0_ID)).toBe(true);
  });
});

describe('aislar y estados', () => {
  it('aislar apaga las demás y desaislar devuelve el estado anterior', () => {
    const doc = fresh();
    const muros = addLayer(doc, { name: 'Muros' });
    const cotas = addLayer(doc, { name: 'Cotas' });
    doc.transact('LAYISO', (tx) => isolateLayers(tx, doc, [muros.id], 'off'));
    expect(doc.data.layers.get(cotas.id)!.on).toBe(false);
    expect(doc.data.layers.get(muros.id)!.on).toBe(true);
    expect(doc.settings.currentLayer).toBe(muros.id);
    expect(doc.transact('LAYUNISO', (tx) => unisolateLayers(tx, doc))).toBe(true);
    expect(doc.data.layers.get(cotas.id)!.on).toBe(true);
    expect(doc.transact('LAYUNISO', (tx) => unisolateLayers(tx, doc))).toBe(false);
  });

  it('aislar bloqueando deja ver las demás capas', () => {
    const doc = fresh();
    const muros = addLayer(doc, { name: 'Muros' });
    const cotas = addLayer(doc, { name: 'Cotas' });
    doc.transact('LAYISO', (tx) => isolateLayers(tx, doc, [muros.id], 'lock'));
    expect(doc.data.layers.get(cotas.id)!.on).toBe(true);
    expect(doc.data.layers.get(cotas.id)!.locked).toBe(true);
  });

  it('un estado de capas guarda y restituye colores y conmutadores', () => {
    const doc = fresh();
    const muros = addLayer(doc, { name: 'Muros', color: '#7657D5' });
    const estado = captureLayerState(doc, 'Planta');
    doc.transact('CAMBIO', (tx) => tx.update('layers', muros.id, { on: false, color: '#000000', locked: true }));
    doc.transact('RESTITUIR', (tx) => restoreLayerState(tx, doc, estado));
    const l = doc.data.layers.get(muros.id)!;
    expect(l.on).toBe(true);
    expect(l.locked).toBe(false);
    expect(l.color).toBe('#7657D5');
  });
});

describe('filtros', () => {
  it('los comodines siguen el estilo de AutoCAD', () => {
    expect(wildcardMatch('MUR*', 'MUROS')).toBe(true);
    expect(wildcardMatch('mur*', 'Muros')).toBe(true);
    expect(wildcardMatch('C?TAS', 'COTAS')).toBe(true);
    expect(wildcardMatch('E-##', 'E-07')).toBe(true);
    expect(wildcardMatch('~*COTA*', 'MUROS')).toBe(true);
    expect(wildcardMatch('~*COTA*', 'COTAS')).toBe(false);
    expect(wildcardMatch('A*,B*', 'B-1')).toBe(true);
    expect(wildcardMatch('', 'lo que sea')).toBe(true);
  });

  it('el filtro combina nombre, estado y uso', () => {
    const doc = fresh();
    const muros = addLayer(doc, { name: 'M-Muros', on: false });
    addLine(doc, muros.id, 'e1');
    const usage = layerUsage(doc);
    const l = doc.data.layers.get(muros.id)!;
    expect(layerMatchesFilter(doc, l, { id: 'f1', name: 'f', rule: { name: 'M-*' } }, usage)).toBe(true);
    expect(layerMatchesFilter(doc, l, { id: 'f1', name: 'f', rule: { name: 'C-*' } }, usage)).toBe(false);
    expect(layerMatchesFilter(doc, l, { id: 'f1', name: 'f', rule: { on: false } }, usage)).toBe(true);
    expect(layerMatchesFilter(doc, l, { id: 'f1', name: 'f', rule: { used: true } }, usage)).toBe(true);
    expect(layerMatchesFilter(doc, l, { id: 'f1', name: 'f', rule: {}, layers: [muros.id] }, usage)).toBe(true);
    expect(layerMatchesFilter(doc, l, { id: 'f1', name: 'f', rule: {}, layers: ['otra'] }, usage)).toBe(false);
  });
});
