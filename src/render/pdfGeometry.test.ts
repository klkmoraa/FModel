import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { PdfUnderlayEntity } from '../document/types';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import type { PathOps } from './pdfGeometry';
import { buildSegmentIndex, segmentsFromOperators } from './pdfGeometry';

const OPS: PathOps = { save: 10, restore: 11, transform: 12, endPath: 28, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, constructPath: 91 };
const FILL = 22;
// página de 100 × 200 pt: el viewport de pdf.js a escala 1 invierte la Y
const VIEW = [1, 0, 0, -1, 0, 200];
const path = (...data: number[]) => [FILL, [Float32Array.from(data)], null];
const round = (segs: Float32Array) => [...segs].map((v) => Math.round(v * 1000) / 1000);

describe('segmentos de un calco PDF', () => {
  it('pasa del espacio de usuario PDF al cuadrado unidad', () => {
    const segs = segmentsFromOperators([OPS.constructPath], [path(0, 0, 0, 1, 100, 200)], OPS, VIEW, 100, 200);
    expect(round(segs)).toEqual([0, 0, 1, 1]);
  });

  it('aplica cm con save/restore y cierra los rectángulos', () => {
    const fn = [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath];
    const args = [null, [0.5, 0, 0, 0.5, 50, 100], path(0, 0, 0, 1, 100, 0, 1, 100, 200, 1, 0, 200, 3), null, path(0, 0, 0, 1, 10, 0)];
    const segs = round(segmentsFromOperators(fn, args, OPS, VIEW, 100, 200));
    expect(segs.length / 4).toBe(5);
    // el rectángulo transformado ocupa el cuadrante superior derecho
    expect(segs.slice(0, 16)).toEqual([0.5, 0.5, 1, 0.5, 1, 0.5, 1, 1, 1, 1, 0.5, 1, 0.5, 1, 0.5, 0.5]);
    // tras restore vuelve la identidad
    expect(segs.slice(16)).toEqual([0, 0, 0.1, 0]);
  });

  it('respeta la matriz de los formularios y descarta trazados de solo recorte', () => {
    const fn = [OPS.paintFormXObjectBegin, OPS.constructPath, OPS.paintFormXObjectEnd, OPS.constructPath];
    const args = [[[1, 0, 0, 1, 0, 100], null], path(0, 0, 0, 1, 50, 0), null, [OPS.endPath, [Float32Array.from([0, 0, 0, 1, 50, 50])], null]];
    expect(round(segmentsFromOperators(fn, args, OPS, VIEW, 100, 200))).toEqual([0, 0.5, 0.5, 0.5]);
  });

  it('aproxima las curvas de Bézier con tramos rectos', () => {
    const segs = segmentsFromOperators([OPS.constructPath], [path(0, 0, 0, 2, 0, 50, 50, 100, 100, 100)], OPS, VIEW, 100, 200);
    expect(segs.length / 4).toBe(6);
    expect(round(segs.slice(-2))).toEqual([1, 0.5]);
  });
});

describe('índice de segmentos', () => {
  const segs = Float32Array.from([0.1, 0.1, 0.2, 0.1, 0.8, 0.8, 0.9, 0.9, 0, 0.5, 1, 0.5]);
  const index = buildSegmentIndex(segs, 16);

  it('devuelve solo los segmentos que tocan la caja', () => {
    expect(index.count).toBe(3);
    expect(index.query({ minX: 0.05, minY: 0.05, maxX: 0.15, maxY: 0.15 })).toHaveLength(1);
    expect(index.query({ minX: 0.4, minY: 0.45, maxX: 0.6, maxY: 0.55 })).toHaveLength(1);
    expect(index.query({ minX: 0.3, minY: 0.2, maxX: 0.4, maxY: 0.3 })).toHaveLength(0);
    expect(index.query({ minX: 2, minY: 2, maxX: 3, maxY: 3 })).toHaveLength(0);
  });
});

describe('referencias a objetos sobre un calco PDF', () => {
  const doc = createDocument();
  doc.transact('ASSET', (tx) => tx.add('assets', { id: 'pdf1', name: 'plano.pdf', mime: 'application/pdf', size: 1, width: 100, height: 200 }));
  const ctx = createContext(doc);
  ctx.pdfGeometry = () => buildSegmentIndex(Float32Array.from([0, 0.5, 1, 0.5]));
  const underlay: PdfUnderlayEntity = { ...entityDefaults(doc), id: 'u1', order: 1, type: 'pdfunderlay', assetId: 'pdf1', page: 1, position: { x: 10, y: 20 }, scale: 2, rotation: 0, clipEnabled: false, opacity: 1, fade: 0, monochrome: false };
  const kind = kindOf(underlay);

  it('ofrece extremos y punto medio de la geometría vectorial en coordenadas de dibujo', () => {
    const box = { minX: 100, minY: 210, maxX: 120, maxY: 230 };
    const pts = kind.snapPointsNear!(underlay, ctx, box);
    const mid = pts.find((s) => s.type === 'midpoint');
    expect(mid?.p.x).toBeCloseTo(110);
    expect(mid?.p.y).toBeCloseTo(220);
    expect(pts.filter((s) => s.type === 'endpoint').some((s) => Math.abs(s.p.x - 210) < 1e-9 && Math.abs(s.p.y - 220) < 1e-9)).toBe(true);
    expect(kind.curvesNear!(underlay, ctx, box).some((c) => c.kind === 'line' && Math.abs(c.a.y - 220) < 1e-9)).toBe(true);
  });

  it('con recorte activo ignora los segmentos fuera del contorno', () => {
    const clipped = { ...underlay, clipEnabled: true, clip: [{ x: 0.6, y: 0 }, { x: 0.9, y: 0 }, { x: 0.9, y: 0.4 }, { x: 0.6, y: 0.4 }] };
    const pts = kind.snapPointsNear!(clipped, ctx, { minX: 100, minY: 210, maxX: 120, maxY: 230 });
    expect(pts.some((s) => s.type === 'midpoint')).toBe(false);
  });
});
