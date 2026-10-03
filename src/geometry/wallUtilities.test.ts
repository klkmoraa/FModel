import { describe, expect, it } from 'vitest';
import { wallFaces } from './walls';
import type { WallPath } from './walls';
import { parallelWall, wallCenterAxis, WallUtilityError } from './wallUtilities';

const source: WallPath = { vertices: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], closed: false, scale: 150, justification: 'zero' };
const xy = (coordinates: number[][]) => coordinates.map(([x, y]) => ({ x, y }));
const expectCode = (run: () => unknown, name: string) => {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(WallUtilityError);
    expect((error as WallUtilityError).code).toBe(name);
    expect((error as WallUtilityError).messageI18n.es).toBeTruthy();
    expect((error as WallUtilityError).messageI18n.en).toBeTruthy();
    return;
  }
  throw new Error(`Expected ${name} error`);
};

describe('physical wall axis', () => {
  it('bisects real faces for each justification and does not share vertices', () => {
    expect(wallCenterAxis(source)).toEqual({ vertices: xy([[0, 0], [6000, 0]]), closed: false });
    expect(wallCenterAxis({ ...source, justification: 'top' }).vertices.map(p => p.y)).toEqual([-75, -75]);
    expect(wallCenterAxis({ ...source, justification: 'bottom' }).vertices.map(p => p.y)).toEqual([75, 75]);
    const axis = wallCenterAxis(source);
    expect(axis.vertices).not.toBe(source.vertices);
    expect(axis.vertices[0]).not.toBe(source.vertices[0]);
  });

  it('preserves closed vertex order and validates source paths and the 500 vertex cap', () => {
    const room = { ...source, closed: true, vertices: xy([[0, 0], [6000, 0], [6000, 4000], [0, 4000]]) };
    expect(wallCenterAxis(room)).toEqual({ vertices: room.vertices, closed: true });
    expect(() => wallCenterAxis({ ...source, vertices: xy([[0, 0], [0, 0]]) })).toThrow();
    expectCode(() => wallCenterAxis({ ...source, vertices: Array.from({ length: 501 }, (_, i) => ({ x: i * 100, y: 0 })) }), 'limit');
  });
});

describe('parallel wall clear distance', () => {
  it('measures the straight fixture between physical faces, including zero', () => {
    const copy = parallelWall(source, 1000, 1, 300);
    expect(copy).toEqual({ ...source, scale: 300, justification: 'zero', vertices: xy([[0, 1225], [6000, 1225]]) });
    expect(wallFaces(copy)[1][0].y - wallFaces(source)[0][0].y).toBe(1000);
    expect(parallelWall(source, 0, 1, 300).vertices[0].y).toBe(225);
    expect(parallelWall(source, 1000, -1, 300).vertices[0].y).toBe(-1225);
    expect(parallelWall({ ...source, justification: 'top' }, 1000, 1, 300).vertices[0].y).toBe(1150);
    expect(parallelWall({ ...source, justification: 'bottom' }, 1000, 1, 300).vertices[0].y).toBe(1300);
    expect(parallelWall(source, 1000, 1).scale).toBe(150);
  });

  it('keeps direction, rotation, translation and input independence', () => {
    const reversed = { ...source, vertices: [...source.vertices].reverse() };
    expect(parallelWall(reversed, 1000, 1, 300).vertices).toEqual(xy([[6000, -1225], [0, -1225]]));
    const diagonal = { ...source, vertices: xy([[0, 0], [6000, 6000]]) };
    const delta = 1225 / Math.SQRT2;
    const shifted = parallelWall(diagonal, 1000, 1, 300);
    expect(shifted.vertices[0].x).toBeCloseTo(-delta, 8);
    expect(shifted.vertices[0].y).toBeCloseTo(delta, 8);
    const vertical = { ...source, vertices: xy([[0, 0], [0, 6000]]) };
    expect(parallelWall(vertical, 1000, 1, 300).vertices).toEqual(xy([[-1225, 0], [-1225, 6000]]));
    const translated = { ...source, vertices: source.vertices.map(p => ({ x: p.x + 1e6, y: p.y + 1e6 })) };
    expect(parallelWall(translated, 1000, 1, 300).vertices).toEqual(xy([[1e6, 1001225], [1006000, 1001225]]));
    expect(source.vertices).toEqual(xy([[0, 0], [6000, 0]]));
    shifted.vertices[0].x = 9;
    expect(diagonal.vertices[0].x).toBe(0);
  });

  it('uses native straight miters for L and room, with actual face clearance', () => {
    const l = { ...source, vertices: xy([[0, 0], [6000, 0], [6000, 4000]]) };
    const copy = parallelWall(l, 1000, 1, 300);
    expect(copy.vertices).toEqual(xy([[0, 1225], [4775, 1225], [4775, 4000]]));
    expect(wallFaces(copy)[1][0].y - wallFaces(l)[0][0].y).toBe(1000);
    expect(wallFaces(l)[0][1].x - wallFaces(copy)[1][1].x).toBe(1000);
    const room = { ...source, closed: true, vertices: xy([[0, 0], [6000, 0], [6000, 4000], [0, 4000]]) };
    const inner = parallelWall(room, 1000, 1, 300);
    expect(inner.vertices).toEqual(xy([[1225, 1225], [4775, 1225], [4775, 2775], [1225, 2775]]));
    expect(wallFaces(inner)[1][0].y - wallFaces(room)[0][0].y).toBe(1000);
  });

  it('rejects impossible clearance, crossing, overlap and pathological geometry', () => {
    const room = { ...source, closed: true, vertices: xy([[0, 0], [2000, 0], [2000, 2000], [0, 2000]]) };
    expectCode(() => parallelWall(room, 1000, 1, 300), 'collapse');
    const u = { ...source, vertices: xy([[0, 0], [6000, 0], [6000, 800], [0, 800]]) };
    expectCode(() => parallelWall(u, 1000, 1, 300), 'collapse');
    const bowtie = { ...source, vertices: xy([[0, 0], [4000, 4000], [0, 4000], [4000, 0]]) };
    expectCode(() => parallelWall(bowtie, 100, 1), 'path');
    const overlap = { ...source, vertices: xy([[0, 0], [6000, 0], [6000, 1000], [1000, 1000], [1000, 0], [4000, 0]]) };
    expectCode(() => parallelWall(overlap, 100, 1), 'path');
    expectCode(() => parallelWall({ ...source, vertices: xy([[0, 0], [6000, 0], [0, 0]]) }, 100, 1), 'path');
  });

  it('rejects malformed measures, side, path and the 200 vertex cap before pairwise work', () => {
    for (const gap of [-1, NaN, Infinity]) expectCode(() => parallelWall(source, gap, 1), 'measure');
    for (const thickness of [0, -1, NaN, Infinity]) expectCode(() => parallelWall(source, 100, 1, thickness), 'measure');
    expectCode(() => parallelWall(source, 100, 0 as 1), 'side');
    expectCode(() => parallelWall({ ...source, vertices: xy([[NaN, 0], [6000, 0]]) }, 100, 1), 'path');
    expectCode(() => parallelWall({ ...source, vertices: Array.from({ length: 201 }, (_, i) => ({ x: i * 100, y: 0 })) }, 100, 1), 'limit');
  });
});
