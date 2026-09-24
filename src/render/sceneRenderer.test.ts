import { describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { Editor } from '../editor/editor';
import { createContext } from '../model/context';
import { SpatialIndex } from '../spatial/spatialIndex';
import type { DrawSink, TraverseEnv } from './traverse';
import { drawViewportContent } from './sceneRenderer';

describe('renderizado de viewports', () => {
  it('omite una escala cero antes de transformar o dibujar el espacio modelo', () => {
    const doc = createDocument();
    const layoutId = [...doc.data.layouts.keys()][0];
    const viewport: ViewportEntity = {
      ...entityDefaults(doc, layoutId),
      id: 'viewport-singular',
      type: 'viewport',
      center: { x: 100, y: 100 },
      width: 200,
      height: 200,
      viewCenter: { x: 0, y: 0 },
      scale: 0,
      viewTwist: 0,
      displayLocked: false,
      on: true,
      frozenLayers: [],
      layerOverrides: {},
      order: 0,
    };
    doc.transact('viewport render test', (tx) => {
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, MODEL_SPACE_ID),
        type: 'line',
        start: { x: 10, y: 10 },
        end: { x: 20, y: 20 },
      });
    });

    const ctx = createContext(doc);
    const index = new SpatialIndex(ctx);
    const editor = { doc, ctx, index } as unknown as Editor;
    const sink = {
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      clip: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      text: vi.fn(),
      image: vi.fn(),
      point: vi.fn(),
      wipeout: vi.fn(),
      infinite: vi.fn(),
    } as unknown as DrawSink;
    const env: TraverseEnv = {
      doc,
      ctx,
      dark: false,
      background: '#ffffff',
      plotting: false,
      plotStyle: 'color',
      viewport: null,
      dashScale: 1,
    };

    drawViewportContent(sink, editor, env, viewport, { minX: 0, minY: 0, maxX: 200, maxY: 200 });

    expect(sink.save).not.toHaveBeenCalled();
    expect(sink.transform).not.toHaveBeenCalled();
    expect(sink.stroke).not.toHaveBeenCalled();
    expect(ctx.annotationScale).toBe(1);

    index.dispose();
    ctx.dispose();
  });

  it('restaura el estado del lienzo y la escala de anotación si falla el dibujo del modelo', () => {
    const doc = createDocument();
    const layoutId = [...doc.data.layouts.keys()][0];
    doc.transact('viewport model', (tx) => {
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, MODEL_SPACE_ID), type: 'line',
        start: { x: 10, y: 10 }, end: { x: 20, y: 20 },
      });
    });
    const viewport: ViewportEntity = {
      ...entityDefaults(doc, layoutId), id: 'viewport-error', type: 'viewport', order: 1,
      center: { x: 100, y: 100 }, width: 200, height: 200,
      viewCenter: { x: 0, y: 0 }, scale: 0.5, viewTwist: 0,
      displayLocked: false, on: true, frozenLayers: [], layerOverrides: {},
    };
    const ctx = createContext(doc);
    const index = new SpatialIndex(ctx);
    const editor = { doc, ctx, index } as unknown as Editor;
    const sink = {
      save: vi.fn(), restore: vi.fn(), transform: vi.fn(), clip: vi.fn(),
      stroke: vi.fn(() => { throw new Error('falló canvas'); }),
      fill: vi.fn(), text: vi.fn(), image: vi.fn(), point: vi.fn(),
      wipeout: vi.fn(), infinite: vi.fn(),
    } as unknown as DrawSink;
    const env: TraverseEnv = {
      doc, ctx, dark: false, background: '#ffffff', plotting: false,
      plotStyle: 'color', viewport: null, dashScale: 1,
    };

    expect(() => drawViewportContent(sink, editor, env, viewport, { minX: 0, minY: 0, maxX: 200, maxY: 200 })).toThrow('falló canvas');
    expect(sink.stroke).toHaveBeenCalled();
    expect(sink.restore).toHaveBeenCalledTimes(1);
    expect(ctx.annotationScale).toBe(1);
    index.dispose();
    ctx.dispose();
  });
});
