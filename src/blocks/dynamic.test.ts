import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { Vec2 } from '../geometry/vec';
import type { BlockRecord, DynamicBlockDefinition, DynamicInstanceState, Entity, LineEntity } from '../document/types';
import { createContext } from '../model/context';
import { applyValueSet, buildScope, evaluateDynamic } from './dynamic';

const doc = createDocument();
const ctx = createContext(doc);
let seq = 0;
const line = (ax: number, ay: number, bx: number, by: number, id?: string): LineEntity => ({ ...entityDefaults(doc), id: id ?? `d${++seq}`, order: ++seq, type: 'line', start: { x: ax, y: ay }, end: { x: bx, y: by } });

const emptyDef = (): DynamicBlockDefinition => ({ parameters: [], actions: [], constraints: [], lookups: [], variables: [], propertyOrder: [] });
const block = (def: Partial<DynamicBlockDefinition>): BlockRecord => ({ id: 'b1', name: 'Puerta', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1, dynamic: { ...emptyDef(), ...def } });

const linear = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'p1',
  type: 'linear' as const,
  name: 'Ancho',
  label: 'Ancho',
  showInProperties: true,
  chainActions: false,
  gripCount: 1 as const,
  base: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  baseLocation: 'start' as const,
  valueSet: { kind: 'none' as const },
  ...over,
});

const evalWith = (def: Partial<DynamicBlockDefinition>, entities: Entity[], state?: DynamicInstanceState) => evaluateDynamic(ctx, block(def), entities, state);
const at = (list: Entity[], id: string) => list.find((e) => e.id === id) as LineEntity;

describe('conjuntos de valores', () => {
  it('ajusta al incremento dentro de sus límites', () => {
    const set = { kind: 'increment' as const, increment: 5, min: 0, max: 20 };
    expect(applyValueSet(7, set)).toBe(5);
    expect(applyValueSet(8, set)).toBe(10);
    expect(applyValueSet(-3, set)).toBe(0);
    expect(applyValueSet(99, set)).toBe(20);
  });

  it('elige el valor más cercano de una lista', () => {
    const set = { kind: 'list' as const, list: [10, 25, 40] };
    expect(applyValueSet(12, set)).toBe(10);
    expect(applyValueSet(30, set)).toBe(25);
    expect(applyValueSet(1000, set)).toBe(40);
  });

  it('sin conjunto el valor pasa tal cual', () => {
    expect(applyValueSet(7.37, { kind: 'none' })).toBeCloseTo(7.37);
    expect(applyValueSet(7.37, undefined)).toBeCloseTo(7.37);
  });
});

describe('acciones', () => {
  it('desplazar mueve solo los objetos de la acción', () => {
    const def = {
      parameters: [linear()],
      actions: [{ id: 'a1', type: 'move' as const, name: 'Mover', paramId: 'p1', selection: ['e1'], paramPoint: 'end' as const, axis: 'xy' as const, distanceMultiplier: 1, angleOffset: 0 }],
    };
    const res = evalWith(def, [line(0, 0, 2, 0, 'e1'), line(0, 5, 2, 5, 'e2')], { values: { p1: 14 } });
    expect(at(res.entities, 'e1').start.x).toBeCloseTo(4);
    expect(at(res.entities, 'e2').start.x).toBeCloseTo(0);
  });

  it('estirar mueve solo los vértices dentro del marco', () => {
    const def = {
      parameters: [linear()],
      actions: [{ id: 'a1', type: 'stretch' as const, name: 'Estirar', paramId: 'p1', selection: ['e1'], paramPoint: 'end' as const, frame: [{ x: 8, y: -2 }, { x: 12, y: -2 }, { x: 12, y: 2 }, { x: 8, y: 2 }] as Vec2[], axis: 'xy' as const, distanceMultiplier: 1, angleOffset: 0 }],
    };
    const res = evalWith(def, [line(0, 0, 10, 0, 'e1')], { values: { p1: 13 } });
    const e = at(res.entities, 'e1');
    expect(e.start).toEqual({ x: 0, y: 0 });
    expect(e.end.x).toBeCloseTo(13);
  });

  it('simetría invierte los objetos respecto al eje del parámetro', () => {
    const def = {
      parameters: [{ id: 'f1', type: 'flip' as const, name: 'Voltear', label: 'Voltear', showInProperties: true, chainActions: false, gripCount: 1 as const, base: { x: 0, y: 0 }, end: { x: 0, y: 10 }, labelNotFlipped: 'No', labelFlipped: 'Sí' }],
      actions: [{ id: 'a1', type: 'flip' as const, name: 'Simetría', paramId: 'f1', selection: ['e1'] }],
    };
    const sinVoltear = at(evalWith(def, [line(2, 0, 6, 0, 'e1')], { values: {} }).entities, 'e1');
    expect(sinVoltear.end.x).toBeCloseTo(6);
    const volteado = at(evalWith(def, [line(2, 0, 6, 0, 'e1')], { values: { f1: true } }).entities, 'e1');
    expect(volteado.start.x).toBeCloseTo(-2);
    expect(volteado.end.x).toBeCloseTo(-6);
  });

  it('la matriz repite los objetos cuantas veces caben en la distancia', () => {
    const def = {
      parameters: [linear()],
      actions: [{ id: 'a1', type: 'array' as const, name: 'Matriz', paramId: 'p1', selection: ['e1'], columnOffset: 5, rowOffset: 0 }],
    };
    // con paso 5, en 16 unidades caben tres columnas completas (0, 5 y 10)
    expect(evalWith(def, [line(0, 0, 1, 0, 'e1')], { values: { p1: 16 } }).entities).toHaveLength(3);
    expect(evalWith(def, [line(0, 0, 1, 0, 'e1')], { values: { p1: 4 } }).entities).toHaveLength(1);
    const copias = evalWith(def, [line(0, 0, 1, 0, 'e1')], { values: { p1: 16 } }).entities as LineEntity[];
    expect(copias.map((e) => Math.round(e.start.x))).toEqual([0, 5, 10]);
  });

  it('girar usa el ángulo del parámetro de rotación', () => {
    const def = {
      parameters: [{ id: 'r1', type: 'rotation' as const, name: 'Giro', label: 'Giro', showInProperties: true, chainActions: false, gripCount: 1 as const, base: { x: 0, y: 0 }, radius: 5, angle: 0, valueSet: { kind: 'none' as const } }],
      actions: [{ id: 'a1', type: 'rotate' as const, name: 'Girar', paramId: 'r1', selection: ['e1'], baseType: 'dependent' as const }],
    };
    const res = evalWith(def, [line(0, 0, 10, 0, 'e1')], { values: { r1: Math.PI / 2 } });
    const e = at(res.entities, 'e1');
    expect(e.end.x).toBeCloseTo(0);
    expect(e.end.y).toBeCloseTo(10);
  });
});

describe('estados de visibilidad', () => {
  const def = {
    parameters: [{ id: 'v1', type: 'visibility' as const, name: 'Vista', label: 'Vista', showInProperties: true, chainActions: false, gripCount: 1 as const, position: { x: 0, y: 0 }, states: [{ name: 'Abierta', visible: ['e1'] }, { name: 'Cerrada', visible: ['e2'] }], defaultState: 'Abierta' }],
  };
  const entidades = () => [line(0, 0, 1, 0, 'e1'), line(0, 1, 1, 1, 'e2')];

  it('muestra solo los objetos del estado activo', () => {
    const abierta = evalWith(def, entidades(), { values: {} }).entities.map((e) => e.id);
    expect(abierta).toEqual(['e1']);
    const cerrada = evalWith(def, entidades(), { values: { v1: 'Cerrada' } }).entities.map((e) => e.id);
    expect(cerrada).toEqual(['e2']);
  });

  it('un estado desconocido recae en el predeterminado', () => {
    const res = evalWith(def, entidades(), { values: { v1: 'Inexistente' } });
    expect(res.entities.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('fórmulas y tablas de consulta', () => {
  it('la escala expone parámetros y variables para las expresiones', () => {
    const def = { ...emptyDef(), parameters: [linear()], variables: [{ name: 'Alto', expression: 'Ancho / 2', exposed: true, readOnly: true }] };
    const scope = buildScope(def, { values: { p1: 30 } });
    expect(scope.Ancho).toBe(30);
    expect(scope.Alto).toBe(15);
  });

  it('una variable del usuario sustituye a su expresión', () => {
    const def = { ...emptyDef(), parameters: [linear()], variables: [{ name: 'Alto', expression: 'Ancho / 2', exposed: true, readOnly: false }] };
    expect(buildScope(def, { values: { p1: 30 }, userValues: { Alto: 7 } }).Alto).toBe(7);
  });

  it('un parámetro con fórmula sigue a otro', () => {
    const def = {
      parameters: [linear(), linear({ id: 'p2', name: 'Fondo', expression: 'Ancho / 2', end: { x: 0, y: 10 } })],
      actions: [{ id: 'a1', type: 'move' as const, name: 'Mover', paramId: 'p2', selection: ['e1'], paramPoint: 'end' as const, axis: 'xy' as const, distanceMultiplier: 1, angleOffset: 0 }],
    };
    const res = evalWith(def, [line(0, 0, 1, 0, 'e1')], { values: { p1: 30 } });
    // Fondo = 15 sobre un parámetro cuya longitud inicial es 10: el objeto sube 5
    expect(at(res.entities, 'e1').start.y).toBeCloseTo(5);
  });

  it('la tabla de consulta fija los parámetros de la fila elegida', () => {
    const def = {
      parameters: [linear(), { id: 'l1', type: 'lookup' as const, name: 'Medida', label: 'Medida', showInProperties: true, chainActions: false, gripCount: 1 as const, position: { x: 0, y: 0 }, tableId: 't1' }],
      lookups: [{ id: 't1', name: 'Medidas', inputs: ['p1'], lookupName: 'Medida', rows: [{ label: 'Estrecha', inputs: [10] }, { label: 'Ancha', inputs: [40] }], reverse: true }],
      actions: [{ id: 'a1', type: 'move' as const, name: 'Mover', paramId: 'p1', selection: ['e1'], paramPoint: 'end' as const, axis: 'xy' as const, distanceMultiplier: 1, angleOffset: 0 }],
    };
    const res = evalWith(def, [line(0, 0, 1, 0, 'e1')], { values: { l1: 'Ancha' } });
    expect(at(res.entities, 'e1').start.x).toBeCloseTo(30);
  });
});

describe('robustez', () => {
  it('una acción que apunta a objetos inexistentes no rompe la evaluación', () => {
    const def = {
      parameters: [linear()],
      actions: [{ id: 'a1', type: 'move' as const, name: 'Mover', paramId: 'p1', selection: ['fantasma'], paramPoint: 'end' as const, axis: 'xy' as const, distanceMultiplier: 1, angleOffset: 0 }],
    };
    const res = evalWith(def, [line(0, 0, 1, 0, 'e1')], { values: { p1: 20 } });
    expect(res.entities).toHaveLength(1);
    expect(at(res.entities, 'e1').start).toEqual({ x: 0, y: 0 });
  });

  it('sin estado se usan los valores por defecto de la definición', () => {
    const def = {
      parameters: [linear()],
      actions: [{ id: 'a1', type: 'move' as const, name: 'Mover', paramId: 'p1', selection: ['e1'], paramPoint: 'end' as const, axis: 'xy' as const, distanceMultiplier: 1, angleOffset: 0 }],
    };
    const res = evalWith(def, [line(0, 0, 1, 0, 'e1')], undefined);
    expect(at(res.entities, 'e1').start).toEqual({ x: 0, y: 0 });
  });
});
