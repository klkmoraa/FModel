import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, LineEntity, TextEntity, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { createContext } from '../model/context';
import { ellipseArcToCubics, toOutPath } from './bezier';
import { MM_TO_PT } from './pdfBackend';
import { exportPdf, exportSvg, planSheet } from './plot';

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
});
