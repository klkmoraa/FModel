import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { BlockConstraint, CircleEntity, Entity, GeoRef, Id, LineEntity } from '../document/types';
import { solveConstraints } from './solver';

const doc = createDocument();
const line = (id: string, ax: number, ay: number, bx: number, by: number): LineEntity => ({ ...entityDefaults(doc), id, order: 1, type: 'line', start: { x: ax, y: ay }, end: { x: bx, y: by } });
const circle = (id: string, x: number, y: number, r: number): CircleEntity => ({ ...entityDefaults(doc), id, order: 1, type: 'circle', center: { x, y }, radius: r });

const ref = (entityId: Id, part: string): GeoRef => ({ entityId, part });
const geo = (id: string, type: string, refs: GeoRef[]): BlockConstraint => ({ id, kind: 'geometric', type: type as never, refs, enabled: true });
const dim = (id: string, type: string, refs: GeoRef[], expression: string): BlockConstraint => ({ id, kind: 'dimensional', type: type as never, name: id, refs, expression, isParameter: true, valueSet: { kind: 'none' } });

const solve = (entities: Entity[], constraints: BlockConstraint[], values: Record<Id, number> = {}) => solveConstraints(entities, constraints, values);
const out = <E extends Entity>(r: ReturnType<typeof solve>, id: string) => r.entities.get(id) as E;

describe('restricciones geométricas', () => {
  it('sin restricciones la geometría no se toca', () => {
    const r = solve([line('l1', 0, 0, 10, 1)], []);
    expect(r.status).toBe('no-constraints');
    expect(out<LineEntity>(r, 'l1').end).toEqual({ x: 10, y: 1 });
  });

  it('horizontal iguala las alturas moviendo lo mínimo', () => {
    const r = solve([line('l1', 0, 0, 10, 2)], [geo('c1', 'horizontal', [ref('l1', 'edge')])]);
    expect(r.status).toBe('solved');
    const l = out<LineEntity>(r, 'l1');
    expect(l.end.y - l.start.y).toBeCloseTo(0, 6);
    // el reparto es simétrico: ninguno de los dos extremos carga con todo
    expect(l.start.y).toBeCloseTo(1, 4);
    expect(l.end.y).toBeCloseTo(1, 4);
  });

  it('vertical y perpendicular ponen los segmentos en ángulo recto', () => {
    const r = solve([line('l1', 0, 0, 10, 0), line('l2', 10, 0, 12, 8)], [geo('c1', 'horizontal', [ref('l1', 'edge')]), geo('c2', 'perpendicular', [ref('l1', 'edge'), ref('l2', 'edge')])]);
    expect(r.status).toBe('solved');
    const a = out<LineEntity>(r, 'l1');
    const b = out<LineEntity>(r, 'l2');
    const dot = (a.end.x - a.start.x) * (b.end.x - b.start.x) + (a.end.y - a.start.y) * (b.end.y - b.start.y);
    expect(dot).toBeCloseTo(0, 4);
  });

  it('paralela alinea las direcciones', () => {
    const r = solve([line('l1', 0, 0, 10, 0), line('l2', 0, 5, 9, 7)], [geo('c1', 'parallel', [ref('l1', 'edge'), ref('l2', 'edge')])]);
    const a = out<LineEntity>(r, 'l1');
    const b = out<LineEntity>(r, 'l2');
    const cross = (a.end.x - a.start.x) * (b.end.y - b.start.y) - (a.end.y - a.start.y) * (b.end.x - b.start.x);
    expect(cross).toBeCloseTo(0, 4);
  });

  it('coincidente junta dos extremos', () => {
    const r = solve([line('l1', 0, 0, 10, 0), line('l2', 11, 1, 20, 5)], [geo('c1', 'coincident', [ref('l1', 'end'), ref('l2', 'start')])]);
    const a = out<LineEntity>(r, 'l1');
    const b = out<LineEntity>(r, 'l2');
    expect(a.end.x).toBeCloseTo(b.start.x, 5);
    expect(a.end.y).toBeCloseTo(b.start.y, 5);
  });

  it('concéntrica junta los centros e igual iguala los radios', () => {
    const r = solve([circle('c1', 0, 0, 5), circle('c2', 3, 4, 9)], [geo('g1', 'concentric', [ref('c1', 'center'), ref('c2', 'center')]), geo('g2', 'equal', [ref('c1', 'edge'), ref('c2', 'edge')])]);
    const a = out<CircleEntity>(r, 'c1');
    const b = out<CircleEntity>(r, 'c2');
    expect(a.center.x).toBeCloseTo(b.center.x, 5);
    expect(a.center.y).toBeCloseTo(b.center.y, 5);
    expect(a.radius).toBeCloseTo(b.radius, 5);
  });

  it('fija inmoviliza su objeto y el resto se adapta', () => {
    const r = solve([line('l1', 0, 0, 10, 0), line('l2', 0, 3, 10, 6)], [geo('g0', 'fixed', [ref('l1', 'edge')]), geo('g1', 'parallel', [ref('l1', 'edge'), ref('l2', 'edge')])]);
    const a = out<LineEntity>(r, 'l1');
    expect(a.start).toEqual({ x: 0, y: 0 });
    expect(a.end).toEqual({ x: 10, y: 0 });
    const b = out<LineEntity>(r, 'l2');
    expect(b.end.y - b.start.y).toBeCloseTo(0, 4);
  });

  it('las restricciones desactivadas se ignoran', () => {
    const c = { ...geo('c1', 'horizontal', [ref('l1', 'edge')]), enabled: false };
    const r = solve([line('l1', 0, 0, 10, 2)], [c]);
    expect(out<LineEntity>(r, 'l1').end).toEqual({ x: 10, y: 2 });
  });
});

describe('restricciones dimensionales', () => {
  it('una cota horizontal lleva el segmento a la medida pedida', () => {
    const r = solve([line('l1', 0, 0, 10, 0)], [dim('d1', 'linear-h', [ref('l1', 'start'), ref('l1', 'end')], 'Ancho')], { d1: 25 });
    const l = out<LineEntity>(r, 'l1');
    expect(Math.abs(l.end.x - l.start.x)).toBeCloseTo(25, 4);
  });

  it('el radio obedece al valor del parámetro', () => {
    const r = solve([circle('c1', 0, 0, 5)], [dim('d1', 'radius', [ref('c1', 'edge')], 'R')], { d1: 12 });
    expect(out<CircleEntity>(r, 'c1').radius).toBeCloseTo(12, 5);
  });

  it('solo aplica las medidas que recibe resueltas: las fórmulas las evalúa quien lo llama', () => {
    const cota = dim('d1', 'radius', [ref('c1', 'edge')], 'R / 2');
    expect(out<CircleEntity>(solve([circle('c1', 0, 0, 5)], [cota]), 'c1').radius).toBe(5);
    expect(out<CircleEntity>(solve([circle('c1', 0, 0, 5)], [cota], { d1: 9 }), 'c1').radius).toBeCloseTo(9, 5);
  });
});

describe('conflictos', () => {
  it('dos medidas incompatibles se marcan en lugar de deformar el dibujo en silencio', () => {
    const r = solve([line('l1', 0, 0, 10, 0)], [dim('d1', 'linear-h', [ref('l1', 'start'), ref('l1', 'end')], 'A'), dim('d2', 'linear-h', [ref('l1', 'start'), ref('l1', 'end')], 'B')], { d1: 10, d2: 30 });
    expect(r.status).toBe('inconsistent');
    expect(r.conflicts.length).toBeGreaterThan(0);
    expect(r.residual).toBeGreaterThan(0);
  });

  it('una restricción sobre un objeto inexistente no rompe la resolución', () => {
    const r = solve([line('l1', 0, 0, 10, 2)], [geo('c1', 'horizontal', [ref('fantasma', 'edge')]), geo('c2', 'horizontal', [ref('l1', 'edge')])]);
    expect(out<LineEntity>(r, 'l1').end.y).toBeCloseTo(out<LineEntity>(r, 'l1').start.y, 5);
  });
});
