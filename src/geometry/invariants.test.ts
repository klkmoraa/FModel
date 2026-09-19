import { describe, expect, it } from 'vitest';
import { curveBBox, curveLength, curvePoint, subCurve } from './curves';
import type { ArcCurve, Curve, LineCurve } from './curves';
import { intersectCurves } from './intersect';
import {
  applyToPoint,
  compose,
  invert,
  rotation,
  scaling,
  translation,
} from './matrix';
import { offsetCurve } from './offset';
import { TOL, linearTol, nearEqual } from './tolerance';
import { dist, samePoint } from './vec';
import { createDocument, entityDefaults } from '../document/defaults';
import type { BlockConstraint, GeoRef, LineEntity } from '../document/types';
import { solveConstraints } from '../constraints/solver';

describe('Invariantes geométricas y entradas degeneradas (GEO-001)', () => {
  describe('Invariante 1: Transformación e inversa', () => {
    it('recupera puntos originales tras aplicar matriz y su inversa', () => {
      const pts = [
        { x: 0, y: 0 },
        { x: 100, y: 250 },
        { x: -500.25, y: 1200.75 },
        { x: 1e6, y: 2e6 }, // Coordenadas grandes georreferenciadas
      ];

      const m = compose(
        translation(125.4, -450.8),
        rotation(Math.PI / 3),
        scaling(2.5, 1.8),
        translation(-50, 100)
      );
      const inv = invert(m);

      for (const p of pts) {
        const transformed = applyToPoint(m, p);
        const restored = applyToPoint(inv, transformed);
        const tol = linearTol(Math.max(Math.abs(p.x), Math.abs(p.y)));
        expect(nearEqual(restored.x, p.x, tol)).toBe(true);
        expect(nearEqual(restored.y, p.y, tol)).toBe(true);
      }
    });

    it('maneja matrices singulares (escala cero) sin generar NaN ni Infinity', () => {
      const singular = scaling(0, 0);
      const inv = invert(singular);
      const p = { x: 50, y: 75 };
      const res = applyToPoint(inv, p);

      expect(Number.isFinite(res.x)).toBe(true);
      expect(Number.isFinite(res.y)).toBe(true);
      expect(Number.isNaN(res.x)).toBe(false);
      expect(Number.isNaN(res.y)).toBe(false);
    });
  });

  describe('Invariante 2: Simetría y finitud de intersecciones', () => {
    it('intersección es simétrica y no devuelve coordenadas no finitas', () => {
      const l1: LineCurve = { kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };
      const l2: LineCurve = { kind: 'line', a: { x: 0, y: 10 }, b: { x: 10, y: 0 } };

      const hits1 = intersectCurves(l1, l2);
      const hits2 = intersectCurves(l2, l1);

      expect(hits1).toHaveLength(1);
      expect(hits2).toHaveLength(1);
      expect(nearEqual(hits1[0].p.x, hits2[0].p.x, TOL.LINEAR)).toBe(true);
      expect(nearEqual(hits1[0].p.y, hits2[0].p.y, TOL.LINEAR)).toBe(true);
      expect(Number.isFinite(hits1[0].p.x)).toBe(true);
      expect(Number.isFinite(hits1[0].p.y)).toBe(true);
    });

    it('resiste segmentos degenerados de longitud cero sin lanzar excepciones ni dar NaNs', () => {
      const zeroLine: LineCurve = { kind: 'line', a: { x: 5, y: 5 }, b: { x: 5, y: 5 } };
      const normalLine: LineCurve = { kind: 'line', a: { x: 0, y: 5 }, b: { x: 10, y: 5 } };

      const hits = intersectCurves(zeroLine, normalLine);
      for (const h of hits) {
        expect(Number.isFinite(h.p.x)).toBe(true);
        expect(Number.isFinite(h.p.y)).toBe(true);
      }
    });

    it('maneja círculos/arcos casi tangentes sin bucles infinitos ni NaNs', () => {
      const a1: ArcCurve = { kind: 'arc', c: { x: 0, y: 0 }, r: 10, a0: 0, sweep: Math.PI * 2 };
      const a2: ArcCurve = { kind: 'arc', c: { x: 20 - TOL.LINEAR, y: 0 }, r: 10, a0: 0, sweep: Math.PI * 2 };

      const hits = intersectCurves(a1, a2);
      for (const h of hits) {
        expect(Number.isFinite(h.p.x)).toBe(true);
        expect(Number.isFinite(h.p.y)).toBe(true);
      }
    });
  });

  describe('Invariante 3: Offset y reversibilidad', () => {
    it('offset con distancia 0 conserva exactamente la geometría', () => {
      const l: LineCurve = { kind: 'line', a: { x: 10, y: 20 }, b: { x: 50, y: 80 } };
      const off0 = offsetCurve(l, 0);

      expect(off0).not.toBeNull();
      if (off0 && off0.kind === 'line') {
        expect(samePoint(off0.a, l.a, TOL.LINEAR)).toBe(true);
        expect(samePoint(off0.b, l.b, TOL.LINEAR)).toBe(true);
      }
    });

    it('doble offset inverso recupera la geometría inicial dentro de tolerancia', () => {
      const l: LineCurve = { kind: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
      const d = 15;
      const off1 = offsetCurve(l, d);
      expect(off1).not.toBeNull();

      const restored = offsetCurve(off1!, -d);
      expect(restored).not.toBeNull();
      if (restored && restored.kind === 'line') {
        expect(dist(restored.a, l.a)).toBeLessThan(TOL.LINEAR);
        expect(dist(restored.b, l.b)).toBeLessThan(TOL.LINEAR);
      }
    });

    it('arco colapsa a null cuando el radio resultante es <= 0', () => {
      const arc: ArcCurve = { kind: 'arc', c: { x: 0, y: 0 }, r: 5, a0: 0, sweep: Math.PI };
      const collapsed = offsetCurve(arc, 6);
      expect(collapsed).toBeNull();
    });

    it('segmento de longitud cero en offset no produce NaNs', () => {
      const zeroLine: LineCurve = { kind: 'line', a: { x: 10, y: 10 }, b: { x: 10, y: 10 } };
      const off = offsetCurve(zeroLine, 5);
      expect(off).not.toBeNull();
      if (off && off.kind === 'line') {
        expect(Number.isFinite(off.a.x)).toBe(true);
        expect(Number.isFinite(off.a.y)).toBe(true);
        expect(Number.isNaN(off.a.x)).toBe(false);
      }
    });
  });

  describe('Invariante 4: Split y conservación de longitud/extremos', () => {
    it('partir una curva y sumar longitudes conserva longitud original y extremos', () => {
      const l: LineCurve = { kind: 'line', a: { x: 10, y: 10 }, b: { x: 70, y: 90 } };
      const originalLen = curveLength(l);

      const part1 = subCurve(l, 0, 0.4);
      const part2 = subCurve(l, 0.4, 1.0);

      const len1 = curveLength(part1);
      const len2 = curveLength(part2);

      expect(nearEqual(len1 + len2, originalLen, TOL.LINEAR)).toBe(true);
      expect(samePoint(curvePoint(part1, 0), l.a, TOL.LINEAR)).toBe(true);
      expect(samePoint(curvePoint(part1, 1), curvePoint(part2, 0), TOL.LINEAR)).toBe(true);
      expect(samePoint(curvePoint(part2, 1), l.b, TOL.LINEAR)).toBe(true);
    });

    it('arco subdividido conserva longitud y puntos de control', () => {
      const arc: ArcCurve = { kind: 'arc', c: { x: 0, y: 0 }, r: 25, a0: 0, sweep: Math.PI / 2 };
      const origLen = curveLength(arc);

      const part1 = subCurve(arc, 0, 0.5);
      const part2 = subCurve(arc, 0.5, 1.0);

      const combinedLen = curveLength(part1) + curveLength(part2);
      expect(nearEqual(combinedLen, origLen, TOL.LINEAR)).toBe(true);
    });
  });

  describe('Invariante 5: BBox contiene todos los puntos muestreados', () => {
    it('BBox engloba la totalidad de puntos evaluados en la curva', () => {
      const curves: Curve[] = [
        { kind: 'line', a: { x: -10, y: -20 }, b: { x: 50, y: 30 } },
        { kind: 'arc', c: { x: 10, y: 10 }, r: 20, a0: 0.2, sweep: 3.3 },
        {
          kind: 'poly',
          pts: [
            { x: 0, y: 0 },
            { x: 10, y: 50 },
            { x: 40, y: -20 },
            { x: 80, y: 30 },
            { x: 100, y: 0 },
          ],
        },
      ];

      for (const c of curves) {
        const box = curveBBox(c);
        const steps = 50;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const pt = curvePoint(c, t);
          expect(pt.x).toBeGreaterThanOrEqual(box.minX - TOL.LINEAR);
          expect(pt.x).toBeLessThanOrEqual(box.maxX + TOL.LINEAR);
          expect(pt.y).toBeGreaterThanOrEqual(box.minY - TOL.LINEAR);
          expect(pt.y).toBeLessThanOrEqual(box.maxY + TOL.LINEAR);
        }
      }
    });
  });

  describe('Invariante 6: Solver de restricciones sin NaNs y detección de conflictos', () => {
    const doc = createDocument();
    const lineEnt = (id: string, ax: number, ay: number, bx: number, by: number): LineEntity => ({
      ...entityDefaults(doc),
      id,
      order: 1,
      type: 'line',
      start: { x: ax, y: ay },
      end: { x: bx, y: by },
    });
    const ref = (entityId: string, part: string): GeoRef => ({ entityId, part });

    it('solver nunca devuelve NaN ni Infinity ante entradas degeneradas', () => {
      const l0 = lineEnt('l0', 10, 10, 10, 10);
      const c: BlockConstraint = { id: 'c1', kind: 'geometric', type: 'horizontal', refs: [ref('l0', 'edge')], enabled: true };

      const res = solveConstraints([l0], [c], {});
      const solved = res.entities.get('l0') as LineEntity;

      expect(Number.isFinite(solved.start.x)).toBe(true);
      expect(Number.isFinite(solved.start.y)).toBe(true);
      expect(Number.isFinite(solved.end.x)).toBe(true);
      expect(Number.isFinite(solved.end.y)).toBe(true);
      expect(Number.isNaN(solved.start.x)).toBe(false);
      expect(Number.isNaN(solved.end.x)).toBe(false);
    });

    it('marca conflictos ante restricciones incompatibles sin corromper la geometría con NaNs', () => {
      const l = lineEnt('l1', 0, 0, 10, 0);
      const d1: BlockConstraint = {
        id: 'd1',
        kind: 'dimensional',
        type: 'linear-h',
        name: 'A',
        refs: [ref('l1', 'start'), ref('l1', 'end')],
        expression: '10',
        isParameter: true,
        valueSet: { kind: 'none' },
      };
      const d2: BlockConstraint = {
        id: 'd2',
        kind: 'dimensional',
        type: 'linear-h',
        name: 'B',
        refs: [ref('l1', 'start'), ref('l1', 'end')],
        expression: '20',
        isParameter: true,
        valueSet: { kind: 'none' },
      };

      const res = solveConstraints([l], [d1, d2], { d1: 10, d2: 20 });
      expect(res.status).toBe('inconsistent');
      expect(res.conflicts.length).toBeGreaterThan(0);
      expect(res.residual).toBeGreaterThan(0);

      const solved = res.entities.get('l1') as LineEntity;
      expect(Number.isFinite(solved.start.x)).toBe(true);
      expect(Number.isFinite(solved.start.y)).toBe(true);
      expect(Number.isFinite(solved.end.x)).toBe(true);
      expect(Number.isFinite(solved.end.y)).toBe(true);
    });
  });
});
