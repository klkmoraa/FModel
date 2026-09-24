import { describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { Entity, ImageEntity, PointEntity, TextEntity } from '../document/types';
import { scaling } from '../geometry/matrix';
import { CanvasSink, toPath2D } from './canvasSink';

describe('Canvas path numeric safety', () => {
  it('does not pass non-finite coordinates to the native Path2D API', () => {
    const moves: [number, number][] = [];
    class StrictPath2D {
      moveTo(x: number, y: number) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Non-finite Path2D coordinate');
        moves.push([x, y]);
      }
    }
    vi.stubGlobal('Path2D', StrictPath2D);
    try {
      expect(() => toPath2D([{ t: 'M', x: Infinity, y: 0 }])).not.toThrow();
      expect(moves).toEqual([]);
      toPath2D([{ t: 'M', x: 12, y: 8 }]);
      expect(moves).toEqual([[12, 8]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('normalizes small non-zero directions when clipping an infinite line', () => {
    const g = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(1, 1), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300,
    });
    const stroke = vi.spyOn(sink, 'stroke').mockImplementation(() => {});
    const owner = {} as Entity;
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: '0' };

    sink.infinite({ x: 0, y: 150 }, { x: 1e-12, y: 0 }, false, style, owner);

    const item = stroke.mock.calls[0]?.[0];
    expect(item?.cmds[0]).toMatchObject({ t: 'M', y: 150 });
    expect(item?.cmds[1]).toMatchObject({ t: 'L', y: 150 });
    expect(item?.cmds[0].t === 'M' && item.cmds[0].x).toBeLessThan(0);
    expect(item?.cmds[1].t === 'L' && item.cmds[1].x).toBeGreaterThan(400);
  });

  it('skips text whose screen coordinates overflow before calling canvas', () => {
    const doc = createDocument();
    let owner!: TextEntity;
    doc.transact('text', (tx) => {
      owner = tx.addEntity<TextEntity>({
        ...entityDefaults(doc), type: 'text', text: 'extremo', position: { x: 0, y: 0 },
        height: 10, rotation: 0, widthFactor: 1, oblique: 0,
        style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline',
      });
    });
    const translate = vi.fn((x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Non-finite canvas translation');
    });
    const g = { setTransform: vi.fn(), save: vi.fn(), translate, rotate: vi.fn(), scale: vi.fn(), transform: vi.fn(), fillText: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(20, 20), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300,
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };

    expect(() => sink.text({
      k: 'text', text: 'extremo', x: 1e308, y: 0, height: 10, rotation: 0,
      widthFactor: 1, oblique: 0, font: 'Inter', align: 'left', baseline: 'alphabetic',
    }, style, owner)).not.toThrow();
    expect(translate).not.toHaveBeenCalled();
  });

  it('skips an overflowing image transform before saving canvas state', () => {
    const doc = createDocument();
    let owner!: ImageEntity;
    doc.transact('image', (tx) => {
      owner = tx.addEntity<ImageEntity>({
        ...entityDefaults(doc), type: 'image', assetId: 'asset', position: { x: 0, y: 0 },
        u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, clipEnabled: false,
        opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });
    const setTransform = vi.fn((...values: number[]) => {
      if (!values.every(Number.isFinite)) throw new TypeError('Non-finite canvas transform');
    });
    const save = vi.fn();
    const g = { setTransform, save, restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(20, 20), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300, images: { get: () => null },
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };

    expect(() => sink.image({
      k: 'image', assetId: 'asset', m: { a: 1e308, b: 0, c: 0, d: 1, e: 0, f: 0 },
      opacity: 1, fade: 0, frame: false,
    }, style, owner)).not.toThrow();
    expect(setTransform).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('isolates an overflowing nested transform and restores the parent transform', () => {
    const doc = createDocument();
    let owner!: PointEntity;
    doc.transact('point', (tx) => {
      owner = tx.addEntity<PointEntity>({ ...entityDefaults(doc), type: 'point', position: { x: 0, y: 0 } });
    });
    const setTransform = vi.fn((...values: number[]) => {
      if (!values.every(Number.isFinite)) throw new TypeError('Non-finite canvas transform');
    });
    const beginPath = vi.fn();
    const g = { setTransform, save: vi.fn(), restore: vi.fn(), beginPath } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(20, 20), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300,
    });

    sink.save();
    expect(() => sink.transform({ a: 1e308, b: 0, c: 0, d: 1, e: 0, f: 0 })).not.toThrow();
    expect(setTransform).toHaveBeenCalledTimes(1);
    sink.point({ k: 'point', x: 0, y: 0, size: 1, mode: 2 }, { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer }, owner);
    expect(beginPath).not.toHaveBeenCalled();
    sink.restore();
    sink.transform(scaling(2, 2));
    expect(setTransform).toHaveBeenCalledTimes(2);
    expect(setTransform.mock.lastCall?.every(Number.isFinite)).toBe(true);
  });

  it('does not send overflowing point markers to canvas path methods', () => {
    const doc = createDocument();
    let owner!: PointEntity;
    doc.transact('point', (tx) => {
      owner = tx.addEntity<PointEntity>({ ...entityDefaults(doc), type: 'point', position: { x: 0, y: 0 } });
    });
    const moveTo = vi.fn((x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Non-finite canvas point');
    });
    const lineTo = vi.fn((x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Non-finite canvas point');
    });
    const g = { setTransform: vi.fn(), beginPath: vi.fn(), moveTo, lineTo, stroke: vi.fn(), setLineDash: vi.fn() } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(1, 1), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300,
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };

    expect(() => sink.point({ k: 'point', x: 1.5e308, y: 0, size: 1.5e308, mode: 2 }, style, owner)).not.toThrow();
    expect(moveTo).not.toHaveBeenCalled();
    expect(lineTo).not.toHaveBeenCalled();
  });

  it('skips simplified text when adding a finite screen width overflows its endpoint', () => {
    const doc = createDocument();
    let owner!: TextEntity;
    doc.transact('text', (tx) => {
      owner = tx.addEntity<TextEntity>({
        ...entityDefaults(doc), type: 'text', text: 'x', position: { x: 0, y: 0 },
        height: 1, rotation: 0, widthFactor: 1, oblique: 0,
        style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline',
      });
    });
    const lineTo = vi.fn((x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Non-finite simplified text endpoint');
    });
    const save = vi.fn();
    const g = { setTransform: vi.fn(), save, restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo, stroke: vi.fn() } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(1, 1), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300,
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };

    expect(() => sink.text({
      k: 'text', text: 'x', x: 1.4e308, y: 0, height: 1, rotation: 0,
      widthFactor: 1.5e308, oblique: 0, font: 'Inter', align: 'left', baseline: 'alphabetic',
    }, style, owner)).not.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(lineTo).not.toHaveBeenCalled();
    sink.text({
      k: 'text', text: 'x', x: 0, y: 0, height: 1, rotation: 0,
      widthFactor: 1, oblique: 0, font: 'Inter', align: 'left', baseline: 'alphabetic',
    }, style, owner);
    expect(save).toHaveBeenCalledTimes(1);
    expect(lineTo).toHaveBeenCalledTimes(1);
  });

  it('skips an image whose finite matrix maps a unit corner beyond numeric range', () => {
    const doc = createDocument();
    let owner!: ImageEntity;
    doc.transact('image', (tx) => {
      owner = tx.addEntity<ImageEntity>({
        ...entityDefaults(doc), type: 'image', assetId: 'asset', position: { x: 0, y: 0 },
        u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, clipEnabled: false,
        opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });
    const save = vi.fn();
    const g = { setTransform: vi.fn(), save, restore: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(1, 1), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300, images: { get: () => null },
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };

    sink.image({
      k: 'image', assetId: 'asset', m: { a: 1e308, b: 0, c: 0, d: 1, e: 1e308, f: 0 },
      opacity: 1, fade: 0, frame: false,
    }, style, owner);
    expect(save).not.toHaveBeenCalled();
  });

  it('skips an image clip whose finite local vertices overflow on screen', () => {
    const doc = createDocument();
    let owner!: ImageEntity;
    doc.transact('image', (tx) => {
      owner = tx.addEntity<ImageEntity>({
        ...entityDefaults(doc), type: 'image', assetId: 'asset', position: { x: 0, y: 0 },
        u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, clipEnabled: false,
        opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
    });
    const save = vi.fn();
    const g = { setTransform: vi.fn(), save, restore: vi.fn(), clip: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(20, 20), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300, images: { get: () => null },
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };
    class FakePath2D { moveTo() {} lineTo() {} closePath() {} }
    vi.stubGlobal('Path2D', FakePath2D);
    try {
      sink.image({
        k: 'image', assetId: 'asset', m: scaling(1, 1),
        clip: [{ x: 1e308, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
        opacity: 1, fade: 0, frame: false,
      }, style, owner);
      expect(save).not.toHaveBeenCalled();
      sink.image({
        k: 'image', assetId: 'asset', m: scaling(1, 1),
        clip: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
        opacity: 1, fade: 0, frame: false,
      }, style, owner);
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('omits an overflowing text mask while retaining the text', () => {
    const doc = createDocument();
    let owner!: TextEntity;
    doc.transact('text', (tx) => {
      owner = tx.addEntity<TextEntity>({
        ...entityDefaults(doc), type: 'text', text: 'x', position: { x: 0, y: 0 },
        height: 1, rotation: 0, widthFactor: 1, oblique: 0,
        style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline',
      });
    });
    const fillRect = vi.fn((...values: number[]) => {
      if (!values.every(Number.isFinite)) throw new TypeError('Non-finite text mask');
    });
    const fillText = vi.fn();
    const g = {
      setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), transform: vi.fn(),
      measureText: vi.fn(() => ({ width: 1 })), fillRect, fillText,
    } as unknown as CanvasRenderingContext2D;
    const sink = new CanvasSink(g, {
      base: scaling(1, 1), dpr: 1, lineweightDisplay: false, lwPxPerHundredth: 0,
      background: '#ffffff', deviceWidth: 400, deviceHeight: 300,
    });
    const style = { color: '#000000', alpha: 1, lineweight: 25, dash: null, layer: owner.layer };

    expect(() => sink.text({
      k: 'text', text: 'x', x: 0, y: 0, height: 1e308, rotation: 0,
      widthFactor: 1, oblique: 0, font: 'Inter', align: 'left', baseline: 'alphabetic',
      background: { color: 'Background', margin: 1e308 },
    }, style, owner)).not.toThrow();
    expect(fillRect).not.toHaveBeenCalled();
    expect(fillText).toHaveBeenCalledWith('x', 0, 0);
    sink.text({
      k: 'text', text: 'x', x: 0, y: 0, height: 10, rotation: 0,
      widthFactor: 1, oblique: 0, font: 'Inter', align: 'left', baseline: 'alphabetic',
      background: { color: 'Background', margin: 2 },
    }, style, owner);
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(fillText).toHaveBeenCalledTimes(2);
  });
});
