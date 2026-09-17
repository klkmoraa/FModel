import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { mergeChanges, VIEWPORT_VIEW_LABEL } from './history';

const newDoc = () => {
  const doc = createDocument();
  let seq = 0;
  const line = (x: number) =>
    doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: `l${++seq}`, order: seq, type: 'line', start: { x, y: 0 }, end: { x, y: 10 } }));
  return { doc, line, ids: () => [...doc.data.entities.keys()] };
};

describe('historial transaccional', () => {
  it('deshace y rehace una transacción completa', () => {
    const { doc, line, ids } = newDoc();
    line(0);
    line(5);
    expect(ids()).toEqual(['l1', 'l2']);
    doc.undo();
    expect(ids()).toEqual(['l1']);
    doc.undo();
    expect(ids()).toEqual([]);
    expect(doc.history.canUndo()).toBe(false);
    doc.redo();
    doc.redo();
    expect(ids()).toEqual(['l1', 'l2']);
    expect(doc.history.canRedo()).toBe(false);
  });

  it('una transacción nueva descarta lo rehacible', () => {
    const { doc, line, ids } = newDoc();
    line(0);
    doc.undo();
    line(9);
    expect(doc.history.canRedo()).toBe(false);
    expect(ids()).toEqual(['l2']);
  });

  it('restituye el estado anterior de un registro modificado', () => {
    const { doc, line } = newDoc();
    line(0);
    doc.transact('MOVE', (tx) => tx.updateEntity('l1', (e) => ({ ...(e as LineEntity), start: { x: 3, y: 3 } })));
    expect((doc.entity('l1') as LineEntity).start).toEqual({ x: 3, y: 3 });
    doc.undo();
    expect((doc.entity('l1') as LineEntity).start).toEqual({ x: 0, y: 0 });
    doc.redo();
    expect((doc.entity('l1') as LineEntity).start).toEqual({ x: 3, y: 3 });
  });

  it('una transacción cancelada no deja entrada ni cambios', () => {
    const { doc, line, ids } = newDoc();
    line(0);
    const before = doc.history.entries().length;
    expect(() =>
      doc.transact('FALLA', (tx) => {
        tx.addEntity<LineEntity>({ ...entityDefaults(doc), id: 'x', order: 9, type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
        throw new Error('interrumpida');
      }),
    ).toThrow('interrumpida');
    expect(doc.history.entries().length).toBe(before);
    expect(ids()).toEqual(['l1']);
  });

  it('un grupo se deshace en un solo paso', () => {
    const { doc, line, ids } = newDoc();
    doc.history.beginGroup('SESIÓN');
    line(0);
    line(5);
    line(10);
    doc.history.endGroup();
    expect(doc.history.entries()).toHaveLength(1);
    expect(doc.history.peekUndo()?.label).toBe('SESIÓN');
    doc.undo();
    expect(ids()).toEqual([]);
  });

  it('los grupos anidados se fusionan con el exterior', () => {
    const { doc, line, ids } = newDoc();
    doc.history.beginGroup('BEDIT');
    line(0);
    doc.history.beginGroup('COMANDO');
    line(5);
    line(10);
    doc.history.endGroup();
    // dentro de la sesión, el comando interior es un único paso
    expect(doc.history.entries()).toHaveLength(2);
    doc.history.endGroup();
    expect(doc.history.entries()).toHaveLength(1);
    doc.undo();
    expect(ids()).toEqual([]);
  });

  it('dentro de un grupo abierto no se deshace más allá de su inicio', () => {
    const { doc, line, ids } = newDoc();
    line(0);
    doc.history.beginGroup('BEDIT');
    line(5);
    expect(doc.undo()).not.toBeNull();
    expect(doc.undo()).toBeNull();
    expect(ids()).toEqual(['l1']);
    doc.history.endGroup();
  });

  it('abortar un grupo revierte sus cambios sin dejarlos en rehacer', () => {
    const { doc, line, ids } = newDoc();
    line(0);
    doc.history.beginGroup('PRUEBA');
    line(5);
    line(10);
    doc.history.abortGroup();
    expect(ids()).toEqual(['l1']);
    expect(doc.history.canRedo()).toBe(false);
    expect(doc.history.entries()).toHaveLength(1);
  });

  it('el encuadre continuo de un viewport se fusiona en un paso', () => {
    const { doc } = newDoc();
    const pan = (x: number) => doc.transact(VIEWPORT_VIEW_LABEL, (tx) => tx.setSettings({ currentColor: `#00000${x}` }));
    pan(1);
    pan(2);
    pan(3);
    expect(doc.history.entries()).toHaveLength(1);
    doc.undo();
    expect(doc.settings.currentColor).not.toBe('#000003');
  });

  it('el límite de entradas descarta las más antiguas', () => {
    const { doc, line } = newDoc();
    doc.history.limit = 3;
    for (let i = 0; i < 5; i++) line(i);
    expect(doc.history.entries()).toHaveLength(3);
  });

  it('abrir otro dibujo vacía el historial', () => {
    const { doc, line } = newDoc();
    line(0);
    doc.replaceData(createDocument().data, doc.id);
    expect(doc.history.canUndo()).toBe(false);
    expect(doc.history.canRedo()).toBe(false);
  });
});

describe('fusión de cambios', () => {
  it('conserva el primer before y el último after de cada registro', () => {
    const merged = mergeChanges([
      { coll: 'entities', id: 'a', before: undefined, after: { v: 1 } },
      { coll: 'entities', id: 'a', before: { v: 1 }, after: { v: 2 } },
      { coll: 'entities', id: 'b', before: { v: 0 }, after: { v: 9 } },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 'a', before: undefined, after: { v: 2 } });
    expect(merged[1]).toMatchObject({ id: 'b', before: { v: 0 }, after: { v: 9 } });
  });

  it('descarta los registros creados y borrados dentro del mismo paso', () => {
    const merged = mergeChanges([
      { coll: 'entities', id: 'a', before: undefined, after: { v: 1 } },
      { coll: 'entities', id: 'a', before: { v: 1 }, after: undefined },
    ]);
    expect(merged).toHaveLength(0);
  });
});
