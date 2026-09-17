import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, Entity, Id, LineEntity, XLineEntity } from '../document/types';
import { createContext } from '../model/context';
import { SpatialIndex } from '../spatial/spatialIndex';
import { entityEditable, entityVisible } from '../model/visibility';
import { pickAt, quickSelect, selectByFence, selectInBox, selectInPolygon } from './pick';

const doc = createDocument();
let seq = 0;
const add = <E extends Entity>(e: Partial<E> & Pick<E, 'type'>): E => doc.transact('TEST', (tx) => tx.addEntity<E>({ ...entityDefaults(doc), id: `e${++seq}`, order: seq, ...e } as E)) as E;

// ┌──────────┐  cuadrado 0..10 formado por la línea inferior y el círculo interior
const abajo = add<LineEntity>({ type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
const arriba = add<LineEntity>({ type: 'line', start: { x: 0, y: 10 }, end: { x: 10, y: 10 } });
const circulo = add<CircleEntity>({ type: 'circle', center: { x: 5, y: 5 }, radius: 2 });
const lejos = add<LineEntity>({ type: 'line', start: { x: 100, y: 100 }, end: { x: 110, y: 100 } });
const infinita = add<XLineEntity>({ type: 'xline', origin: { x: 0, y: -50 }, direction: { x: 1, y: 0 } });

const ctx = createContext(doc);
const index = new SpatialIndex(ctx);
const owner = abajo.owner;
const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });
const sorted = (ids: Id[]) => [...ids].sort();

describe('índice espacial', () => {
  it('consulta por caja y devuelve también la geometría infinita', () => {
    expect(sorted(index.query(owner, box(-1, -1, 11, 1)))).toEqual(sorted([abajo.id, infinita.id]));
    expect(index.query(owner, box(200, 200, 210, 210))).toEqual([infinita.id]);
    expect(index.count(owner)).toBe(5);
  });

  it('la extensión ignora la geometría infinita', () => {
    const ext = index.extents(owner);
    expect(ext.minX).toBeCloseTo(0);
    expect(ext.maxX).toBeCloseTo(110);
    expect(ext.maxY).toBeCloseTo(100);
    const soloCirculo = index.extents(owner, (id) => id === circulo.id);
    expect(soloCirculo).toMatchObject({ minX: 3, minY: 3, maxX: 7, maxY: 7 });
  });

  it('se mantiene al día cuando el dibujo cambia', () => {
    doc.transact('MOVE', (tx) => tx.updateEntity(circulo.id, (e) => ({ ...(e as CircleEntity), center: { x: 50, y: 50 } })));
    expect(index.query(owner, box(3, 3, 7, 7))).not.toContain(circulo.id);
    expect(index.query(owner, box(48, 48, 52, 52))).toContain(circulo.id);
    doc.undo();
    expect(index.query(owner, box(3, 3, 7, 7))).toContain(circulo.id);
    doc.transact('ERASE', (tx) => tx.removeEntity(lejos.id));
    expect(index.bboxOf(owner, lejos.id)).toBeUndefined();
    doc.undo();
    expect(index.bboxOf(owner, lejos.id)).toBeTruthy();
  });
});

describe('designación', () => {
  it('designa el objeto bajo el cursor y prioriza el más cercano', () => {
    const hits = pickAt(ctx, index, owner, { x: 5, y: 0.05 }, 0.5);
    expect(hits[0].id).toBe(abajo.id);
    // el círculo no está relleno: se designa por su contorno, no por su interior
    expect(pickAt(ctx, index, owner, { x: 5, y: 3 }, 0.5).map((h) => h.id)).toContain(circulo.id);
    expect(pickAt(ctx, index, owner, { x: 5, y: 4 }, 0.5).map((h) => h.id)).not.toContain(circulo.id);
    expect(pickAt(ctx, index, owner, { x: 5, y: 20 }, 0.5).filter((h) => h.id !== infinita.id)).toHaveLength(0);
  });

  it('la ventana exige el objeto entero y la captura basta con tocarlo', () => {
    expect(selectInBox(ctx, index, owner, box(-1, -1, 11, 11), false)).toContain(arriba.id);
    // media línea dentro: la ventana la descarta, la captura la incluye
    expect(selectInBox(ctx, index, owner, box(-1, -1, 5, 11), false)).not.toContain(abajo.id);
    expect(selectInBox(ctx, index, owner, box(-1, -1, 5, 11), true)).toContain(abajo.id);
  });

  it('la designación por polígono distingue ventana y captura', () => {
    const rombo = [{ x: 5, y: -8 }, { x: 18, y: 5 }, { x: 5, y: 18 }, { x: -8, y: 5 }];
    expect(selectInPolygon(ctx, index, owner, rombo, false)).toContain(circulo.id);
    const cortado = [{ x: 4, y: 4 }, { x: 9, y: 4 }, { x: 9, y: 6 }, { x: 4, y: 6 }];
    expect(selectInPolygon(ctx, index, owner, cortado, false)).not.toContain(circulo.id);
    expect(selectInPolygon(ctx, index, owner, cortado, true)).toContain(circulo.id);
  });

  it('el borde designa lo que cruza la línea', () => {
    const ids = selectByFence(ctx, index, owner, [{ x: -1, y: -1 }, { x: -1, y: 11 }, { x: 11, y: 11 }]);
    expect(ids).toEqual([]);
    const cruza = selectByFence(ctx, index, owner, [{ x: 5, y: -2 }, { x: 5, y: 12 }]);
    // la línea auxiliar pasa por y = −50, fuera del borde
    expect(sorted(cruza)).toEqual(sorted([abajo.id, arriba.id, circulo.id]));
  });

  it('la selección rápida filtra por tipo y capa', () => {
    expect(quickSelect(ctx, owner, { types: ['circle'] })).toEqual([circulo.id]);
    expect(quickSelect(ctx, owner, { types: ['line'] }).length).toBe(3);
    expect(quickSelect(ctx, owner, { layers: ['no-existe'] })).toEqual([]);
  });

  it('las capas apagadas y congeladas ocultan sus objetos; las bloqueadas solo impiden editarlos', () => {
    const capa = doc.transact('LAYER', (tx) => tx.add('layers', { ...[...doc.data.layers.values()][0], id: 'oculta', name: 'Oculta', on: false }));
    doc.transact('CHPROP', (tx) => tx.updateEntity(arriba.id, (e) => ({ ...e, layer: capa.id })));
    const enCaja = () => selectInBox(ctx, index, owner, box(-1, -1, 11, 11), true);
    const arribaAhora = () => doc.entity(arriba.id)!;
    expect(enCaja()).not.toContain(arriba.id);
    doc.transact('LAYER', (tx) => tx.put('layers', { ...capa, on: true, frozen: true }));
    expect(enCaja()).not.toContain(arriba.id);
    // bloqueada: sigue viéndose y puede designarse para consultar o referenciar, pero no se edita
    doc.transact('LAYER', (tx) => tx.put('layers', { ...capa, on: true, frozen: false, locked: true }));
    expect(enCaja()).toContain(arriba.id);
    expect(entityVisible(doc, arribaAhora(), {})).toBe(true);
    expect(entityEditable(doc, arribaAhora())).toBe(false);
    doc.transact('LAYER', (tx) => tx.put('layers', { ...capa, on: true, frozen: false, locked: false }));
    expect(entityEditable(doc, arribaAhora())).toBe(true);
  });
});
