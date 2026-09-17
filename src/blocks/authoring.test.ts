import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { removeParameter, paramsWithoutAction } from './authoring';
import { installDynamicSamples } from './samples';

describe('block authoring', () => {
  it('removing a parameter drops its actions and lookup columns', () => {
    const doc = createDocument();
    installDynamicSamples(doc);
    const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
    const def = panel.dynamic!;
    const width = def.parameters.find((p) => p.name === 'Ancho')!;
    const withTable = {
      ...def,
      lookups: [{ id: 'lk', name: 'Tamaños', inputs: [width.id, def.parameters[1].id], lookupName: 'Tamaño', rows: [{ label: 'S', inputs: [600, 600] as (number | string)[] }], reverse: true }],
    };
    const next = removeParameter(withTable, width.id);
    expect(next.parameters.some((p) => p.id === width.id)).toBe(false);
    expect(next.actions.some((a) => a.paramId === width.id)).toBe(false);
    expect(next.actions.length).toBe(1);
    expect(next.lookups[0].inputs).toEqual([def.parameters[1].id]);
    expect(next.lookups[0].rows[0].inputs).toEqual([600]);
    expect(next.propertyOrder).not.toContain(width.id);
  });

  it('flags parameters that need an action', () => {
    const doc = createDocument();
    installDynamicSamples(doc);
    const panel = doc.findByName('blocks', 'FM Panel ajustable')!;
    const def = panel.dynamic!;
    expect(paramsWithoutAction(def)).toEqual([]);
    const alto = def.parameters.find((p) => p.name === 'Alto')!;
    const stripped = { ...def, actions: def.actions.filter((a) => a.paramId !== alto.id) };
    expect(paramsWithoutAction(stripped).map((p) => p.name)).toEqual(['Alto']);
  });
});

describe('history groups', () => {
  it('nested groups merge per command and an outer abort reverts the whole session', () => {
    const doc = createDocument();
    const before = doc.entitiesOf('*model').length;
    doc.history.beginGroup('BEDIT');
    doc.history.beginGroup('LINE');
    doc.transact('a', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }));
    doc.transact('b', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 1 }, end: { x: 1, y: 1 } }));
    doc.history.endGroup();
    expect(doc.history.entries().length).toBe(1);
    doc.transact('c', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 2 }, end: { x: 1, y: 2 } }));
    // deshacer dentro de la sesión: un paso por comando, sin salir del grupo
    doc.undo();
    expect(doc.entitiesOf('*model').length).toBe(before + 2);
    doc.undo();
    expect(doc.entitiesOf('*model').length).toBe(before);
    expect(doc.undo()).toBeFalsy();
    doc.redo();
    expect(doc.entitiesOf('*model').length).toBe(before + 2);
    doc.history.abortGroup();
    expect(doc.entitiesOf('*model').length).toBe(before);
    expect(doc.history.inGroup).toBe(false);
  });

  it('closing the outer group leaves a single undo step', () => {
    const doc = createDocument();
    doc.history.beginGroup('BEDIT');
    doc.history.beginGroup('X');
    doc.transact('a', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }));
    doc.history.endGroup();
    doc.transact('b', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 1 }, end: { x: 1, y: 1 } }));
    doc.history.endGroup();
    expect(doc.history.entries().length).toBe(1);
    expect(doc.history.entries()[0].label).toBe('BEDIT');
    doc.undo();
    expect(doc.entitiesOf('*model').length).toBe(0);
  });
});
