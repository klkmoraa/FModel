import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { createDocument, defaultPageSetup, entityDefaults } from '../document/defaults';
import type { CircleEntity, ImageEntity, LineEntity, TextEntity, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { scaling } from '../geometry/matrix';
import { createContext } from '../model/context';
import { ellipseArcToCubics, toOutPath } from './bezier';
import { MM_TO_PT } from './pdfBackend';
import { exportPdf, exportSvg, planSheet, plotExtents } from './plot';
import { VectorSink } from './vectorSink';

function cubicPoint(p0: { x: number; y: number }, c: { x1: number; y1: number; x2: number; y2: number; x: number; y: number }, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t * t * t * c.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t * t * t * c.y,
  };
}

function sampleDoc() {
  const doc = createDocument({ title: 'Prueba' });
  const ctx = createContext(doc);
  doc.transact('seed', (tx) => {
    tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 200, y: 100 } });
    tx.addEntity<CircleEntity>({ ...entityDefaults(doc), type: 'circle', center: { x: 100, y: 50 }, radius: 25 });
    tx.addEntity<TextEntity>({ ...entityDefaults(doc), type: 'text', text: 'Ø 50 ⌀ ✓', position: { x: 10, y: 10 }, height: 5, rotation: 0, widthFactor: 1, oblique: 0, style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline' } as TextEntity);
  });
  return { doc, ctx };
}

describe('vector output', () => {
  it('fits finite opposite extreme coordinates without overflowing the sheet matrix', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('extreme line', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(doc), type: 'line', start: { x: -1e308, y: 0 }, end: { x: 1e308, y: 0 },
    }));

    const plan = planSheet({ doc, ctx }, MODEL_SPACE_ID);
    expect(plan.scale).toBeGreaterThan(0);
    expect(Object.values(plan.base).every(Number.isFinite)).toBe(true);
    const svg = exportSvg({ doc, ctx }, MODEL_SPACE_ID).data;
    expect(svg).toContain('<path ');
    expect(svg).not.toMatch(/NaN|Infinity/);
    ctx.dispose();
  });

  it('rejects a manually chosen plot scale that makes the sheet transform non-finite', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('extreme position', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(doc), type: 'line', start: { x: 1e308, y: 0 }, end: { x: 1.1e308, y: 0 },
    }));
    const page = { ...defaultPageSetup('ISO A3', 'landscape'), plotArea: 'extents' as const, plotScale: 1e308, center: true };

    expect(() => planSheet({ doc, ctx }, MODEL_SPACE_ID, page)).toThrow(/escala|scale/i);
    ctx.dispose();
  });

  it('keeps a Y-overflowing entity out of finite plot extents', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('plot bounds', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 10 } });
      tx.addEntity<CircleEntity>({ ...entityDefaults(doc), type: 'circle', center: { x: 0, y: 1e308 }, radius: 1e308 });
    });
    expect(plotExtents({ doc, ctx }, MODEL_SPACE_ID)).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 10 });
    expect(Object.values(planSheet({ doc, ctx }, MODEL_SPACE_ID).base).every(Number.isFinite)).toBe(true);
    ctx.dispose();
  });

  it('rejects non-finite SVG and PDF coordinates from a circle with finite primitive fields', async () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('extreme circle', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 10 } });
      tx.addEntity<CircleEntity>({ ...entityDefaults(doc), type: 'circle', center: { x: 0, y: 1e308 }, radius: 1e308 });
    });

    expect(() => exportSvg({ doc, ctx }, MODEL_SPACE_ID)).toThrow(/coordenadas|coordinates/i);
    await expect(exportPdf({ doc, ctx }, [MODEL_SPACE_ID])).rejects.toThrow(/coordenadas|coordinates/i);
    ctx.dispose();
  });

  it('rejects non-finite text coordinates instead of emitting invalid SVG or PDF', async () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('extreme text', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 10 } });
      tx.addEntity<TextEntity>({
        ...entityDefaults(doc), type: 'text', text: 'extremo', position: { x: 1e308, y: 0 },
        height: 1e308, rotation: 0, widthFactor: 1, oblique: 0,
        style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline',
      });
    });

    expect(() => exportSvg({ doc, ctx }, MODEL_SPACE_ID)).toThrow(/coordenadas|coordinates/i);
    await expect(exportPdf({ doc, ctx }, [MODEL_SPACE_ID])).rejects.toThrow(/coordenadas|coordinates/i);
    ctx.dispose();
  });

  it('rejects an image matrix that overflows before handing it to the backend', () => {
    const doc = createDocument();
    let owner!: ImageEntity;
    doc.transact('image', (tx) => {
      owner = tx.addEntity<ImageEntity>({
        ...entityDefaults(doc), type: 'image', assetId: 'asset', position: { x: 0, y: 0 },
        u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, clipEnabled: false,
        opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });
    const image = vi.fn();
    const sink = new VectorSink({ save() {}, restore() {}, clip() {}, path() {}, text() {}, image }, {
      base: scaling(20, 20), paper: { width: 420, height: 297 }, plotLineweights: true,
      images: () => 'data:image/png;base64,eA==',
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };

    expect(() => sink.image({
      k: 'image', assetId: 'asset', m: { a: 1e308, b: 0, c: 0, d: 1, e: 0, f: 0 },
      opacity: 1, fade: 0, frame: false,
    }, style, owner)).toThrow(/coordenadas|coordinates/i);
    expect(image).not.toHaveBeenCalled();
  });

  it('does not draw model contents through a zero-scale paper viewport', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    const layoutId = [...doc.data.layouts.keys()][0];
    let viewport!: ViewportEntity;
    doc.transact('zero-scale viewport', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 10, y: 10 }, end: { x: 20, y: 20 } });
      viewport = tx.addEntity<ViewportEntity>({
        ...entityDefaults(doc, layoutId), type: 'viewport', center: { x: 100, y: 100 }, width: 100, height: 100,
        viewCenter: { x: 0, y: 0 }, scale: 0, viewTwist: 0, displayLocked: false, on: false,
        frozenLayers: [], layerOverrides: {},
      });
    });
    const off = exportSvg({ doc, ctx }, layoutId).data;
    doc.transact('enable viewport', (tx) => tx.updateEntity<ViewportEntity>(viewport.id, { on: true }));
    expect(exportSvg({ doc, ctx }, layoutId).data).toBe(off);
    ctx.dispose();
  });

  it('approximates circular arcs with cubic Béziers within 3e-4·r', () => {
    const r = 100;
    const segs = ellipseArcToCubics(0, 0, r, r, 0, 0.3, Math.PI * 1.7);
    expect(segs.length).toBe(Math.ceil(1.7 / 0.5));
    let p0 = { x: r * Math.cos(0.3), y: r * Math.sin(0.3) };
    let worst = 0;
    for (const s of segs) {
      if (s.t !== 'C') continue;
      for (let t = 0; t <= 1; t += 0.05) {
        const p = cubicPoint(p0, s, t);
        worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.y) - r));
      }
      p0 = { x: s.x, y: s.y };
    }
    expect(worst).toBeLessThan(3e-4 * r);
    const end = segs[segs.length - 1];
    expect(end.t === 'C' && Math.hypot(end.x - r * Math.cos(0.3 + Math.PI * 1.7), end.y - r * Math.sin(0.3 + Math.PI * 1.7))).toBeLessThan(1e-9);
  });

  it('rejects an arc that would allocate excessive Bézier segments', () => {
    expect(() => ellipseArcToCubics(0, 0, 1, 1, 0, 0, (4097 * Math.PI) / 2)).toThrow(/demasiados segmentos.*too many segments/i);
  });

  it('keeps arcs exact under non-uniform transforms (affine invariance)', () => {
    const path = toOutPath([{ t: 'M', x: 10, y: 0 }, { t: 'A', cx: 0, cy: 0, r: 10, a0: 0, a1: Math.PI / 2, ccw: true }], { a: 2, b: 0, c: 0, d: 0.5, e: 5, f: 5 });
    const last = path[path.length - 1];
    expect(last.t).toBe('C');
    if (last.t === 'C') {
      expect(last.x).toBeCloseTo(5);
      expect(last.y).toBeCloseTo(10);
    }
  });

  it('fits model extents inside the printable area and writes an SVG in millimetres', () => {
    const { doc, ctx } = sampleDoc();
    const plan = planSheet({ doc, ctx }, MODEL_SPACE_ID);
    expect(plan.paper).toEqual({ width: 420, height: 297 });
    const pw = 420 - plan.page.margins.left - plan.page.margins.right;
    expect(200 * plan.scale).toBeLessThanOrEqual(pw + 1e-9);
    const { data } = exportSvg({ doc, ctx }, MODEL_SPACE_ID);
    expect(data).toContain('width="420mm"');
    expect(data).toContain('viewBox="0 0 420 297"');
    expect((data.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(data).toContain('Ø 50');
    expect(data).toContain('<clipPath');
  });

  it('writes a vector PDF with one page per sheet and reports substituted glyphs', async () => {
    const { doc, ctx } = sampleDoc();
    const layoutId = [...doc.data.layouts.keys()][0];
    doc.transact('vp', (tx) =>
      tx.addEntity<ViewportEntity>({
        ...entityDefaults(doc),
        owner: layoutId,
        type: 'viewport',
        center: { x: 200, y: 150 },
        width: 300,
        height: 200,
        viewCenter: { x: 100, y: 50 },
        scale: 1,
        viewTwist: 0,
        displayLocked: false,
        on: true,
        frozenLayers: [],
        layerOverrides: {},
      } as Omit<ViewportEntity, 'id' | 'order'>),
    );
    const { data, warnings } = await exportPdf({ doc, ctx }, [MODEL_SPACE_ID, layoutId]);
    expect(new TextDecoder().decode(data.slice(0, 5))).toBe('%PDF-');
    const back = await PDFDocument.load(data);
    expect(back.getPageCount()).toBe(2);
    const { width, height } = back.getPage(0).getSize();
    expect(width).toBeCloseTo(420 * MM_TO_PT, 3);
    expect(height).toBeCloseTo(297 * MM_TO_PT, 3);
    expect(warnings.some((w) => w.includes('«?»'))).toBe(true);
    const svg = exportSvg({ doc, ctx }, layoutId).data;
    expect(svg).toContain('clip-path');
  });

  it('restores paper-space annotation scale after drawing a viewport', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    ctx.annotationScale = 0.25;
    const layoutId = [...doc.data.layouts.keys()][0];
    doc.transact('paper scale', (tx) => {
      tx.addEntity<ViewportEntity>({
        ...entityDefaults(doc, layoutId), type: 'viewport', center: { x: 200, y: 150 }, width: 100, height: 100,
        viewCenter: { x: 0, y: 0 }, scale: 0.5, viewTwist: 0, displayLocked: false, on: true,
        frozenLayers: [], layerOverrides: {},
      });
      tx.addEntity<TextEntity>({
        ...entityDefaults(doc, layoutId), type: 'text', text: '{{scale}}', position: { x: 20, y: 20 },
        height: 5, rotation: 0, widthFactor: 1, oblique: 0,
        style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline',
      });
    });

    const svg = exportSvg({ doc, ctx }, layoutId).data;
    expect(svg).toContain('>1:1</text>');
    expect(svg).not.toContain('>1:2</text>');
    expect(ctx.annotationScale).toBe(0.25);
    ctx.dispose();
  });

  it('reports an image that PDF cannot embed instead of silently omitting it', async () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    const brokenPng = 'data:image/png;base64,eA==';
    doc.transact('broken image', (tx) => {
      tx.add('assets', { id: 'broken', name: 'plano.png', mime: 'image/png', size: 1, dataUrl: brokenPng });
      tx.addEntity<ImageEntity>({
        ...entityDefaults(doc), type: 'image', assetId: 'broken', position: { x: 0, y: 0 },
        u: { x: 10, y: 0 }, v: { x: 0, y: 10 }, clipEnabled: false,
        opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });

    const result = await exportPdf({ doc, ctx, images: () => brokenPng }, [MODEL_SPACE_ID]);
    expect(result.omittedAssets).toEqual(['plano.png']);
    expect((await PDFDocument.load(result.data)).getPageCount()).toBe(1);
    ctx.dispose();
  });
});
