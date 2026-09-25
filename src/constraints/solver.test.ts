import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { BlockConstraint, CircleEntity, Entity, GeoRef, Id, LineEntity, LwPolylineEntity } from '../document/types';
import { analyzeFreedom, constraintRank, solveConstraints } from './solver';

const doc = createDocument();
const line = (id: string, ax: number, ay: number, bx: number, by: number): LineEntity => ({ ...entityDefaults(doc), id, order: 1, type: 'line', start: { x: ax, y: ay }, end: { x: bx, y: by } });
const circle = (id: string, x: number, y: number, r: number): CircleEntity => ({ ...entityDefaults(doc), id, order: 1, type: 'circle', center: { x, y }, radius: r });
const polyline = (id: string, vertices: LwPolylineEntity['vertices'], closed = false): LwPolylineEntity => ({ ...entityDefaults(doc), id, order: 1, type: 'lwpolyline', vertices, closed });

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

describe('tangencia línea-círculo', () => {
  it('converge cuando el centro inicia sobre la línea y el radio está acotado', () => {
    const r = solve(
      [line('l1', 0, 0, 10, 0), circle('c1', 5, 0, 5)],
      [
        geo('g1', 'tangent', [ref('l1', 'edge'), ref('c1', 'edge')]),
        dim('d1', 'radius', [ref('c1', 'edge')], 'R'),
        geo('g2', 'fixed', [ref('l1', 'edge')]),
      ],
      { d1: 5 },
    );
    const c = out<CircleEntity>(r, 'c1');

    expect(r.status).toBe('solved');
    expect(c.radius).toBeCloseTo(5, 5);
    expect(Math.abs(c.center.y)).toBeCloseTo(c.radius, 5);
  });
});

describe('referencias de polilínea', () => {
  it('ignora un índice de vértice fuera de rango sin devolver residuo NaN', () => {
    const p = polyline('p1', [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    const r = solve([p], [geo('g1', 'coincident', [ref('p1', 'vertex:0'), ref('p1', 'vertex:99')])]);

    expect(r.residual).toBe(0);
    expect(Number.isFinite(r.residual)).toBe(true);
    expect(r.status).toBe('unchanged');
    expect(out<LwPolylineEntity>(r, 'p1').vertices).toEqual(p.vertices);
  });

  it('no envuelve el último segmento de una polilínea abierta', () => {
    const p = polyline('p1', [{ x: 0, y: 0 }, { x: 10, y: 2 }]);
    const r = solve([p], [geo('g1', 'horizontal', [ref('p1', 'segment:1')])]);

    expect(r.residual).toBe(0);
    expect(r.status).toBe('unchanged');
    expect(out<LwPolylineEntity>(r, 'p1').vertices).toEqual(p.vertices);
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

const arc = (id: string, x: number, y: number, r: number, a0: number, a1: number): Entity => ({ ...entityDefaults(doc), id, order: 1, type: 'arc', center: { x, y }, radius: r, startAngle: a0, endAngle: a1 }) as Entity;

describe('solver del dibujo', () => {
  it('une el extremo de un arco con el de una línea', () => {
    const r = solve([line('l1', 0, 0, 10, 0), arc('a1', 12, 5, 5, -Math.PI / 2, 0)], [geo('c1', 'coincident', [ref('l1', 'end'), ref('a1', 'start')])]);
    expect(r.status).toBe('solved');
    const l = out<LineEntity>(r, 'l1');
    const a = r.entities.get('a1') as Entity & { center: { x: number; y: number }; radius: number; startAngle: number };
    expect(a.center.x + a.radius * Math.cos(a.startAngle)).toBeCloseTo(l.end.x, 6);
    expect(a.center.y + a.radius * Math.sin(a.startAngle)).toBeCloseTo(l.end.y, 6);
  });

  it('conserva lo que el usuario acaba de mover y adapta el resto', () => {
    const before = [line('l1', 0, 0, 10, 0), line('l2', 10, 0, 10, 10)];
    const moved = [line('l1', 0, 0, 14, 3), before[1]];
    const r = solveConstraints(moved, [geo('c1', 'coincident', [ref('l1', 'end'), ref('l2', 'start')])], {}, { previous: new Map(before.map((e) => [e.id, e])) });
    expect(out<LineEntity>(r, 'l1').end).toEqual({ x: 14, y: 3 });
    expect(out<LineEntity>(r, 'l2').start.x).toBeCloseTo(14, 8);
    expect(out<LineEntity>(r, 'l2').start.y).toBeCloseTo(3, 8);
  });

  it('prefiere no mover el objeto indicado', () => {
    const r = solveConstraints([line('l1', 0, 0, 10, 0), line('l2', 0, 5, 9, 7)], [geo('c1', 'parallel', [ref('l1', 'edge'), ref('l2', 'edge')])], {}, { prefer: new Set(['l1']) });
    expect(out<LineEntity>(r, 'l1').end).toEqual({ x: 10, y: 0 });
    const b = out<LineEntity>(r, 'l2');
    expect(b.end.y - b.start.y).toBeCloseTo(0, 6);
  });

  it('resuelve cadenas grandes por grupos dispersos sin tocar grupos satisfechos', () => {
    const entities: Entity[] = [];
    const constraints: BlockConstraint[] = [];
    for (let i = 0; i < 300; i++) {
      entities.push(line(`a${i}`, i * 10, 0, i * 10 + 9, 0.5));
      if (i) constraints.push(geo(`c${i}`, 'coincident', [ref(`a${i - 1}`, 'end'), ref(`a${i}`, 'start')]));
      constraints.push(geo(`h${i}`, 'horizontal', [ref(`a${i}`, 'edge')]));
    }
    const untouched = line('z', 0, 100, 10, 100);
    entities.push(untouched);
    constraints.push(geo('hz', 'horizontal', [ref('z', 'edge')]));
    const t0 = performance.now();
    const r = solveConstraints(entities, constraints, {});
    const ms = performance.now() - t0;
    expect(r.status).toBe('solved');
    expect(r.conflicts).toEqual([]);
    for (let i = 1; i < 300; i++) {
      const p = out<LineEntity>(r, `a${i - 1}`);
      const q = out<LineEntity>(r, `a${i}`);
      expect(Math.hypot(p.end.x - q.start.x, p.end.y - q.start.y)).toBeLessThan(1e-6);
      expect(Math.abs(q.end.y - q.start.y)).toBeLessThan(1e-6);
    }
    expect(r.entities.get('z')).toBe(untouched);
    expect(ms).toBeLessThan(5000);
  });

  it('con onlyConsistent no deforma un grupo imposible', () => {
    const l = line('l1', 0, 0, 10, 0);
    const r = solveConstraints([l], [dim('d1', 'linear-h', [ref('l1', 'start'), ref('l1', 'end')], 'A'), dim('d2', 'linear-h', [ref('l1', 'start'), ref('l1', 'end')], 'B')], { d1: 10, d2: 30 }, { onlyConsistent: true });
    expect(r.status).toBe('inconsistent');
    expect(r.entities.get('l1')).toBe(l);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
});

describe('grados de libertad', () => {
  const rect = () => [line('b', 0, 0, 10, 0), line('r', 10, 0, 10, 5), line('t', 10, 5, 0, 5), line('l', 0, 5, 0, 0)];
  const closed: BlockConstraint[] = [
    geo('k1', 'coincident', [ref('b', 'end'), ref('r', 'start')]),
    geo('k2', 'coincident', [ref('r', 'end'), ref('t', 'start')]),
    geo('k3', 'coincident', [ref('t', 'end'), ref('l', 'start')]),
    geo('k4', 'coincident', [ref('l', 'end'), ref('b', 'start')]),
    geo('h1', 'horizontal', [ref('b', 'edge')]),
    geo('h2', 'horizontal', [ref('t', 'edge')]),
    geo('v1', 'vertical', [ref('r', 'edge')]),
    geo('v2', 'vertical', [ref('l', 'edge')]),
  ];

  it('un rectángulo sin cotas ni fijación queda parcialmente restringido', () => {
    const state = analyzeFreedom(rect(), closed, {});
    expect(state?.get('b')).toBe('partial');
  });

  it('con esquina fija, ancho y alto queda totalmente restringido', () => {
    const cs = [...closed, geo('f', 'fixed', [ref('b', 'start')]), dim('w', 'linear-h', [ref('b', 'start'), ref('b', 'end')], '10'), dim('hgt', 'linear-v', [ref('r', 'start'), ref('r', 'end')], '5')];
    const state = analyzeFreedom(rect(), cs, { w: 10, hgt: 5 });
    for (const id of ['b', 'r', 't', 'l']) expect(state?.get(id)).toBe('full');
  });

  it('detecta una restricción redundante por el rango', () => {
    const base = constraintRank(rect(), closed, {});
    const extra = constraintRank(rect(), [...closed, geo('p', 'parallel', [ref('b', 'edge'), ref('t', 'edge')])], {});
    expect(extra).toBe(base);
    const useful = constraintRank(rect(), [...closed, dim('w', 'linear-h', [ref('b', 'start'), ref('b', 'end')], '10')], { w: 10 });
    expect(useful).toBe(base + 1);
  });
});
