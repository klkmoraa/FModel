import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, LineEntity } from '../document/types';
import { createContext } from '../model/context';
import { blockThumbnailOf, documentThumbnail } from './thumbnail';

vi.mock('./traverse', () => ({ drawEntity: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe('document thumbnails', () => {
  it('fits a finite line with opposite extreme coordinates at a positive scale', () => {
    const transforms: number[][] = [];
    const g = {
      fillRect: vi.fn(),
      setTransform: (...values: number[]) => transforms.push(values),
      setLineDash: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g, toDataURL: () => 'data:image/png;base64,eA==' }) });
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('wide line', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(doc), type: 'line', start: { x: -1e308, y: 0 }, end: { x: 1e308, y: 0 },
    }));

    documentThumbnail(doc, ctx, 'wide-line', 96, 72, false);

    expect(transforms[0][0]).toBeGreaterThan(0);
    expect(transforms[0].every(Number.isFinite)).toBe(true);
    ctx.dispose();
  });

  it('keeps the transform finite for a zero-length line at an extreme position', () => {
    const transforms: number[][] = [];
    const g = {
      fillRect: vi.fn(),
      setTransform: (...values: number[]) => transforms.push(values),
      setLineDash: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g, toDataURL: () => 'data:image/png;base64,eA==' }) });
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('extreme point', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(doc), type: 'line', start: { x: 1e308, y: 0 }, end: { x: 1e308, y: 0 },
    }));

    documentThumbnail(doc, ctx, 'extreme-point', 96, 72, false);

    expect(transforms[0].every(Number.isFinite)).toBe(true);
    ctx.dispose();
  });

  it('keeps the canvas transform finite when only Y overflows in one entity box', () => {
    const transforms: number[][] = [];
    const g = {
      fillRect: vi.fn(),
      setTransform: (...values: number[]) => transforms.push(values),
      setLineDash: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g, toDataURL: () => 'data:image/png;base64,eA==' }) });
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('thumbnail bounds', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 10 } });
      tx.addEntity<CircleEntity>({ ...entityDefaults(doc), type: 'circle', center: { x: 0, y: 1e308 }, radius: 1e308 });
    });

    expect(documentThumbnail(doc, ctx, 'y-overflow', 96, 72, false)).toMatch(/^data:image\/png/);
    expect(transforms.length).toBeGreaterThan(0);
    expect(transforms[0].every(Number.isFinite)).toBe(true);
    ctx.dispose();
  });

  it('keeps a block thumbnail transform finite when one member box overflows', () => {
    const transforms: number[][] = [];
    const g = {
      setTransform: (...values: number[]) => transforms.push(values),
      setLineDash: vi.fn(),
      globalAlpha: 1,
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g, toDataURL: () => 'data:image/png;base64,eA==' }) });
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('block thumbnail bounds', (tx) => {
      tx.add('blocks', { id: 'thumbnail-block', name: 'Thumbnail', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1 });
      tx.addEntity<LineEntity>({ ...entityDefaults(doc, 'thumbnail-block'), type: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 10 } });
      tx.addEntity<CircleEntity>({ ...entityDefaults(doc, 'thumbnail-block'), type: 'circle', center: { x: 0, y: 1e308 }, radius: 1e308 });
    });

    expect(blockThumbnailOf(doc, ctx, 'thumbnail-block')).toMatch(/^data:image\/png/);
    expect(transforms.length).toBeGreaterThan(0);
    expect(transforms[0].every(Number.isFinite)).toBe(true);
    ctx.dispose();
  });
});
