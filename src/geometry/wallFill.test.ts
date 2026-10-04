import { describe, expect, it } from 'vitest';
import { polylineSignedArea } from './polyline';
import { circleFillLoop, polygonFillLoop, wallFillLoops, WallFillError } from './wallFill';
import { wallFaces, type WallPath } from './walls';
import { WallUtilityError } from './wallUtilities';
import type { Vec2 } from './vec';

const xy = (coords: number[][]): Vec2[] => coords.map(([x, y]) => ({ x, y }));
const area = (vertices: ReadonlyArray<Vec2 & { bulge: number }>) => Math.abs(polylineSignedArea(vertices));
const wall: WallPath = { vertices: xy([[0, 0], [6000, 0]]), closed: false, scale: 300, justification: 'zero' };
const domain = (run: () => unknown, code: string) => {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(WallFillError);
    expect((error as WallFillError).code).toBe(code);
    expect((error as WallFillError).messageI18n.es).toBeTruthy();
    expect((error as WallFillError).messageI18n.en).toBeTruthy();
    return;
  }
  throw new Error(`Expected ${code}`);
};

describe('native material fill geometry', () => {
  it('material_band_and_closed_room', () => {
    const [band] = wallFillLoops(wall);
    expect(band.closed).toBe(true);
    expect(band.vertices).toEqual(xy([[0, 150], [6000, 150], [6000, -150], [0, -150]]).map(p => ({ ...p, bulge: 0 })));
    expect(area(band.vertices)).toBe(1800000);
    const room = { ...wall, closed: true, vertices: xy([[0, 0], [6000, 0], [6000, 4000], [0, 4000]]) };
    for (const vertices of [room.vertices, [...room.vertices].reverse()]) {
      const loops = wallFillLoops({ ...room, vertices });
      expect(loops).toHaveLength(2);
      expect(loops.every(l => l.closed && l.vertices.every(v => v.bulge === 0))).toBe(true);
      expect(loops.map(l => area(l.vertices))).toEqual([27090000, 21090000]);
      expect(area(loops[0].vertices) - area(loops[1].vertices)).toBe(6000000);
      expect(Math.min(...loops[1].vertices.map(v => v.x))).toBe(150);
      expect(Math.max(...loops[1].vertices.map(v => v.x))).toBe(5850);
    }
    for (const justification of ['top', 'bottom'] as const) {
      const path = { ...wall, justification };
      const faces = wallFaces(path);
      expect(wallFillLoops(path)[0].vertices.map(({ x, y }) => ({ x, y }))).toEqual([...faces[0], ...faces[1].reverse()]);
    }
    for (const vertices of [xy([[0, 0], [6000, 0], [6000, 4000]]), xy([[0, 0], [6000, 6000]])]) {
      const path = { ...wall, vertices };
      const [first, second] = wallFaces(path);
      expect(wallFillLoops(path)[0].vertices.map(({ x, y }) => ({ x, y }))).toEqual([...first, ...second.reverse()]);
    }
    const before = JSON.stringify(wall);
    const result = wallFillLoops(wall);
    result[0].vertices[0].x = 99;
    expect(JSON.stringify(wall)).toBe(before);
    expect(result[0].vertices[0]).not.toBe(wall.vertices[0]);
    expect(wallFillLoops(wall)[0].vertices[0].x).toBe(0);
  });

  it('polygon_concave_and_circle_exact', () => {
    const contours = [
      [xy([[0, 0], [400, 0], [400, 600], [0, 600]]), 240000],
      [xy([[0, 0], [600, 0], [600, 100], [100, 100], [100, 500], [0, 500]]), 100000],
      [xy([[0, 400], [250, 400], [250, 0], [350, 0], [350, 400], [600, 400], [600, 500], [0, 500]]), 100000],
      [xy([[250, 0], [350, 0], [350, 200], [600, 200], [600, 300], [350, 300], [350, 500], [250, 500], [250, 300], [0, 300], [0, 200], [250, 200]]), 100000],
    ] as const;
    for (const [points, expected] of contours) {
      const loop = polygonFillLoop(points);
      expect(loop.closed).toBe(true);
      expect(area(loop.vertices)).toBe(expected);
      expect(loop.vertices.every(v => v.bulge === 0)).toBe(true);
      loop.vertices[0].x = 900;
      expect(points[0].x).not.toBe(900);
    }
    const circle = circleFillLoop({ x: 1300, y: 1300 }, 300);
    expect(circle).toEqual({ closed: true, vertices: [{ x: 1600, y: 1300, bulge: 1 }, { x: 1000, y: 1300, bulge: 1 }] });
    expect(area(circle.vertices)).toBeCloseTo(90000 * Math.PI, 7);
    for (const center of [{ x: 1001300, y: 1001300 }, { x: -1300, y: 1300 }]) {
      const shifted = circleFillLoop(center, 300);
      expect(area(shifted.vertices)).toBeCloseTo(90000 * Math.PI, 7);
      expect(shifted.vertices.every(v => Math.hypot(v.x - center.x, v.y - center.y) === 300)).toBe(true);
    }
    const rotated = contours[1][0].map(p => ({ x: 1e6 - p.y, y: 1e6 + p.x }));
    expect(area(polygonFillLoop(rotated).vertices)).toBe(100000);
  });

  it('malformed_and_bounded', () => {
    for (const points of [null, xy([[0, 0], [1, 1]]), [null, ...xy([[0, 0], [2, 0]])],
      [Object.create({ x: 0, y: 0 }), ...xy([[2, 0], [0, 2]])],
      xy([[0, 0], [2, 0], [Number.NaN, 2]]), xy([[0, 0], [2, 0], [0, Infinity]]),
      xy([[0, 0], [2, 0], [2, 0], [0, 2]]), xy([[0, 0], [0, 0], [2, 0], [0, 2]]),
      xy([[0, 0], [4, 4], [0, 4], [4, 0]]),
      xy([[0, 0], [4, 0], [2, 0], [2, 4], [0, 4]]),
      xy([[0, 0], [4, 0], [4, 4], [0, 4], [0, 2], [3, 2], [3, 0]])]) {
      domain(() => polygonFillLoop(points as Vec2[]), 'contour');
    }
    const sparse = xy([[0, 0], [2, 0], [0, 2]]); delete sparse[1];
    domain(() => polygonFillLoop(sparse), 'contour');
    domain(() => polygonFillLoop(Array.from({ length: 501 }, (_, i) => ({ x: i, y: i * i }))), 'limit');
    domain(() => polygonFillLoop(xy([[0, 0], [1e155, 0], [0, 1e155]])), 'range');
    for (const radius of [0, -1, NaN, Infinity, 1e-12]) domain(() => circleFillLoop({ x: 0, y: 0 }, radius), 'measure');
    domain(() => circleFillLoop({ x: 1e155, y: 0 }, 300), 'range');
    domain(() => circleFillLoop({ x: 1e6, y: 0 }, 1e-7), 'measure');
    domain(() => circleFillLoop(null as unknown as Vec2, 300), 'contour');
    domain(() => circleFillLoop(Object.create({ x: 0, y: 0 }) as Vec2, 300), 'contour');
    const badWall = { ...wall, vertices: xy([[0, 0], [0, 0]]) };
    expect(() => wallFillLoops(badWall)).toThrow(WallUtilityError);
    expect(() => wallFillLoops({ ...wall, vertices: xy([[0, 0], [1e155, 0]]) })).toThrow(WallUtilityError);
    expect(() => wallFillLoops({ ...wall, vertices: Array.from({ length: 501 }, (_, i) => ({ x: i * 100, y: 0 })) })).toThrow(WallUtilityError);
    const translated = { ...wall, vertices: xy([[1e6, 1e6], [1e6, 1006000]]) };
    expect(area(wallFillLoops(translated)[0].vertices)).toBe(1800000);
  });
});
