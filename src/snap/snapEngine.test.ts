import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, Entity, LineEntity } from '../document/types';
import { arcCurve } from '../geometry/curves';
import { createContext } from '../model/context';
import { SpatialIndex } from '../spatial/spatialIndex';
import type { SnapQuery, SnapSettings } from './snapEngine';
import { AcquisitionState, DEFAULT_SNAP_SETTINGS, findOsnapCandidates, polarConstrain, resolvePoint, trackingConstrain } from './snapEngine';

const doc = createDocument();
let seq = 0;
const add = <E extends Entity>(e: Omit<E, 'id' | 'order' | keyof ReturnType<typeof entityDefaults>> & Partial<E>): E =>
  doc.transact('TEST', (tx) => tx.addEntity({ ...entityDefaults(doc), id: `e${++seq}`, order: seq, ...e } as E)) as E;

const line = add<LineEntity>({ type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
const cross = add<LineEntity>({ type: 'line', start: { x: 4, y: -5 }, end: { x: 4, y: 5 } });
const circle = add<CircleEntity>({ type: 'circle', center: { x: 20, y: 0 }, radius: 4 });
const ctx = createContext(doc);
const index = new SpatialIndex(ctx);

/** Consulta con 1 unidad de dibujo por píxel: la apertura de 12 px equivale a 12 unidades. */
const query = (cursor: { x: number; y: number }, settings: Partial<SnapSettings> = {}, extra: Partial<SnapQuery> = {}): SnapQuery => ({
  ctx,
  index,
  owner: line.owner,
  cursor,
  worldPerPixel: 0.05,
  settings: { ...DEFAULT_SNAP_SETTINGS, ...settings },
  ...extra,
});

const best = (q: SnapQuery) => findOsnapCandidates(q).candidates.sort((a, b) => a.score - b.score)[0];

describe('referencias a objetos', () => {
  it('prefiere el punto final sobre el punto medio cuando ambos están en la apertura', () => {
    const c = best(query({ x: 0.2, y: 0.1 }));
    expect(c.type).toBe('endpoint');
    expect(c.p).toEqual({ x: 0, y: 0 });
  });

  it('encuentra punto medio, centro e intersección', () => {
    expect(best(query({ x: 5.1, y: 0.1 }))).toMatchObject({ type: 'midpoint', p: { x: 5, y: 0 } });
    expect(best(query({ x: 20.2, y: 0.2 }))).toMatchObject({ type: 'center', p: { x: 20, y: 0 } });
    const inter = findOsnapCandidates(query({ x: 4.1, y: 0.1 })).candidates.find((c) => c.type === 'intersection');
    expect(inter?.p.x).toBeCloseTo(4);
    expect(inter?.p.y).toBeCloseTo(0);
  });

  it('el cuadrante del círculo se refiere a los ejes', () => {
    const c = best(query({ x: 20.1, y: 3.8 }, { types: ['quadrant'] }));
    expect(c.p.x).toBeCloseTo(20);
    expect(c.p.y).toBeCloseTo(4);
  });

  it('la perpendicular necesita un punto de partida', () => {
    const sin = findOsnapCandidates(query({ x: 6, y: 0.2 }, { types: ['perpendicular'] })).candidates;
    expect(sin).toHaveLength(0);
    const con = findOsnapCandidates(query({ x: 6, y: 0.2 }, { types: ['perpendicular'] }, { lastPoint: { x: 6, y: 7 } })).candidates;
    expect(con[0]?.p).toMatchObject({ x: 6, y: 0 });
  });

  it('desde el centro de una circunferencia toma el punto del arco más cercano al cursor', () => {
    const candidates = findOsnapCandidates(query({ x: 20, y: 4 }, { types: ['perpendicular'] }, { lastPoint: { x: 20, y: 0 } })).candidates;
    expect(candidates.find((c) => c.type === 'perpendicular')?.p).toEqual({ x: 20, y: 4 });
  });

  it('no ofrece una perpendicular situada fuera de un arco parcial', () => {
    const arc = arcCurve({ x: 0, y: 0 }, 0.4, Math.PI / 4, Math.PI / 2);
    const candidates = findOsnapCandidates(
      query(
        { x: 0, y: 0.4 },
        { types: ['perpendicular'] },
        { lastPoint: { x: 0.4, y: 0 }, exclude: new Set(doc.data.entities.keys()), extraCurves: [arc] },
      ),
    ).candidates.filter((c) => c.type === 'perpendicular');
    expect(candidates).toHaveLength(0);
  });

  it('respeta la apertura y las entidades excluidas', () => {
    // 12 px × 0,05 = 0,6 unidades de apertura
    expect(findOsnapCandidates(query({ x: 0, y: 0.5 })).candidates.length).toBeGreaterThan(0);
    expect(findOsnapCandidates(query({ x: 0, y: 0.9 })).candidates).toHaveLength(0);
    expect(findOsnapCandidates(query({ x: 0.2, y: 0.1 }, {}, { exclude: new Set([line.id, cross.id]) })).candidates).toHaveLength(0);
  });

  it('sin referencias activas no propone candidatos', () => {
    expect(findOsnapCandidates(query({ x: 0.1, y: 0.1 }, { osnap: false })).candidates).toHaveLength(0);
    // la anulación temporal manda sobre el ajuste general
    expect(findOsnapCandidates(query({ x: 5.1, y: 0.05 }, { osnap: false }, { override: ['midpoint'] })).candidates[0]?.type).toBe('midpoint');
  });
});

describe('resolución del punto', () => {
  it('la referencia gana al rastreo polar', () => {
    const r = resolvePoint(query({ x: 0.1, y: 0.1 }, {}, { lastPoint: { x: -10, y: 0 } }));
    expect(r.kind).toBe('endpoint');
  });

  it('el ángulo polar se aplica cuando no hay referencia cerca', () => {
    const r = resolvePoint(query({ x: -5.2, y: -4.8 }, { types: [] }, { lastPoint: { x: 0, y: 0 } }));
    expect(r.kind).toBe('polar');
    expect(r.p.x).toBeCloseTo(r.p.y, 6);
  });

  it('orto restringe a los ejes y la rejilla actúa en último lugar', () => {
    const o = resolvePoint(query({ x: 7, y: 0.9 }, { types: [], ortho: true }, { lastPoint: { x: 0, y: 0 } }));
    expect(o.kind).toBe('ortho');
    expect(o.p.x).toBeCloseTo(7);
    expect(o.p.y).toBeCloseTo(0);
    const g = resolvePoint(query({ x: 43, y: 57 }, { types: [], polar: false, gridSnap: true, snapSpacing: { x: 10, y: 10 } }));
    expect(g.kind).toBe('grid');
    expect(g.p).toEqual({ x: 40, y: 60 });
  });

  it('Tab recorre los candidatos del mismo punto', () => {
    const q = query({ x: 4.05, y: 0.05 });
    const all = findOsnapCandidates(q).candidates.length;
    expect(all).toBeGreaterThan(1);
    const a = resolvePoint({ ...q, candidateIndex: 0 });
    const b = resolvePoint({ ...q, candidateIndex: 1 });
    expect(a.kind).not.toBe(b.kind);
    // el índice se normaliza al recorrer más allá del final
    expect(resolvePoint({ ...q, candidateIndex: all }).kind).toBe(a.kind);
  });

  it('el rastreo de referencias alinea con los puntos adquiridos', () => {
    const acquisition = new AcquisitionState();
    acquisition.togglePoint({ x: 10, y: 0 });
    const r = resolvePoint(query({ x: 10.1, y: 8 }, { types: [] }, { acquisition }));
    expect(r.kind).toBe('tracking');
    expect(r.p.x).toBeCloseTo(10);
  });
});

describe('restricciones angulares', () => {
  it('polarConstrain devuelve el ángulo múltiplo del incremento', () => {
    const r = polarConstrain({ x: 10, y: 0.3 }, { x: 0, y: 0 }, { ...DEFAULT_SNAP_SETTINGS, polarIncrement: Math.PI / 4 }, 0.6)!;
    expect(r.p.y).toBeCloseTo(0);
    expect(r.dist).toBeCloseTo(10);
    expect(polarConstrain({ x: 10, y: 4 }, { x: 0, y: 0 }, DEFAULT_SNAP_SETTINGS, 0.6)).toBeNull();
  });

  it('trackingConstrain solo alinea dentro de la tolerancia', () => {
    const s = { ...DEFAULT_SNAP_SETTINGS, trackAllPolar: false };
    expect(trackingConstrain({ x: 5.1, y: 9 }, [{ x: 5, y: 0 }], s, 0.5)!.p.x).toBeCloseTo(5);
    expect(trackingConstrain({ x: 6, y: 9 }, [{ x: 5, y: 0 }], s, 0.5)).toBeNull();
  });
});

describe('geometría cercana', () => {
  it('devuelve las curvas próximas al cursor para referencias derivadas', () => {
    const { near } = findOsnapCandidates(query({ x: 5, y: 0.1 }));
    expect(near.some((n) => n.id === line.id)).toBe(true);
    expect(near.some((n) => n.id === circle.id)).toBe(false);
  });
});
