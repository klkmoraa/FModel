import { describe, expect, it } from 'vitest';
import { cleanWallFaces, WallCleanupError, type CleanupSegment, type CleanupWall } from './wallCleanup';
import type { WallJustification } from './walls';

const wall = (key: string, coords: number[][], scale = 300, justification: WallJustification = 'zero'): CleanupWall => ({
  key, path: { vertices: coords.map(([x, y]) => ({ x, y })), closed: false, scale, justification },
  startCap: false, endCap: false,
});
const horizontal = wall('horizontal', [[0, 0], [6000, 0]]);
const spans = (segments: CleanupSegment[], key: string, y: number) => segments
  .filter(s => s.sourceKey === key && s.start.y === y && s.end.y === y)
  .map(s => [Math.min(s.start.x, s.end.x), Math.max(s.start.x, s.end.x)])
  .sort((a, b) => a[0] - b[0]);
const canonical = (segments: CleanupSegment[]) => segments.map(s => {
  const points = [s.start, s.end].sort((a, b) => a.x - b.x || a.y - b.y);
  return JSON.stringify([s.sourceKey, ...points]);
}).sort();

describe('native wall face cleanup', () => {
  it('removes only interior T/X face spans and keeps native source identity', () => {
    const vertical = wall(' vertical fragment ', [[3000, 0], [3000, 3000]], 200);
    const t = cleanWallFaces([horizontal, vertical], []);
    expect(spans(t, 'horizontal', 150)).toEqual([[0, 2900], [3100, 6000]]);
    expect(spans(t, 'horizontal', -150)).toEqual([[0, 6000]]);
    expect(t.filter(s => s.sourceKey === vertical.key).map(s => [s.start.x, s.start.y, s.end.y]).sort())
      .toEqual([[2900, 150, 3000], [3100, 150, 3000]]);
    expect(t).toHaveLength(5);
    const x = cleanWallFaces([horizontal, wall(vertical.key, [[3000, -3000], [3000, 3000]], 200)], []);
    expect(spans(x, horizontal.key, 150)).toEqual([[0, 2900], [3100, 6000]]);
    expect(spans(x, horizontal.key, -150)).toEqual([[0, 2900], [3100, 6000]]);
    expect(x).toHaveLength(8);
    expect(new Set(canonical(x)).size).toBe(8);
  });

  it('uses unequal top/bottom material and emits caps only when native flags request them', () => {
    const top = wall('top', [[0, 0], [6000, 0]], 300, 'top');
    const bottom = wall('bottom', [[3000, 0], [3000, 3000]], 200, 'bottom');
    const t = cleanWallFaces([top, bottom], []);
    expect(spans(t, top.key, 0)).toEqual([[0, 2800], [3000, 6000]]);
    expect(spans(t, top.key, -300)).toEqual([[0, 6000]]);
    expect(t.filter(s => s.sourceKey === bottom.key).map(s => s.start.x).sort()).toEqual([2800, 3000]);
    expect(cleanWallFaces([horizontal], [])).toHaveLength(2);
    expect(cleanWallFaces([{ ...horizontal, startCap: true }], [])).toHaveLength(3);
    expect(cleanWallFaces([{ ...horizontal, endCap: true }], [])).toHaveLength(3);
    expect(cleanWallFaces([{ ...horizontal, startCap: true, endCap: true }], [])).toHaveLength(4);
    const room = { ...wall('room', [[0, 0], [6000, 0], [6000, 4000], [0, 4000]]),
      path: { ...horizontal.path, closed: true, vertices: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }] },
      startCap: true, endCap: true };
    expect(cleanWallFaces([room], [])).toHaveLength(8);
  });

  it('removes shared material seams and deterministically assigns partial duplicate faces', () => {
    const a = { ...wall('a', [[0, 0], [4000, 0]]), startCap: true, endCap: true };
    const b = { ...wall('b', [[2000, 0], [6000, 0]]), startCap: true, endCap: true };
    const result = cleanWallFaces([b, a], []);
    expect(spans(result, 'a', 150)).toEqual([[0, 4000]]);
    expect(spans(result, 'b', 150)).toEqual([[4000, 6000]]);
    expect(result).toHaveLength(6);
    expect(canonical(cleanWallFaces([a, b], []))).toEqual(canonical(result));
    const twin = { ...a, key: 'z' };
    expect(cleanWallFaces([twin, a], []).every(s => s.sourceKey === 'a')).toBe(true);
    expect(cleanWallFaces([twin, a], [])).toHaveLength(4);
    const adjacent = cleanWallFaces([wall('top', [[0, 0], [6000, 0]], 300, 'top'),
      wall('bottom', [[0, 0], [6000, 0]], 300, 'bottom')], []);
    expect(adjacent).toHaveLength(2);
    expect(adjacent.every(s => s.start.y !== 0 && s.end.y !== 0)).toBe(true);
    const joined = cleanWallFaces([{ ...wall('left', [[0, 0], [3000, 0]]), startCap: true, endCap: true },
      { ...wall('right', [[3000, 0], [6000, 0]]), startCap: true, endCap: true }], []);
    expect(joined.some(s => s.start.x === 3000 && s.end.x === 3000)).toBe(false);
  });

  it('retains the 900-unit opening between existing fragments without joining nearby ends', () => {
    const fragments = [wall('left', [[0, 0], [2550, 0]]), wall('right', [[3450, 0], [6000, 0]])];
    const before = JSON.stringify(fragments);
    const result = cleanWallFaces(fragments, []);
    expect(spans(result, 'left', 150)).toEqual([[0, 2550]]);
    expect(spans(result, 'right', 150)).toEqual([[3450, 6000]]);
    expect(result).toHaveLength(4);
    result[0].start.x = -99;
    expect(JSON.stringify(fragments)).toBe(before);
  });

  it('clips polygon columns exactly and circular columns at analytic intersections', () => {
    const polygon = { kind: 'polygon' as const, vertices: [
      { x: 2700, y: -1000 }, { x: 3300, y: -1000 }, { x: 3300, y: 1000 }, { x: 2700, y: 1000 },
    ] };
    const rectangle = cleanWallFaces([horizontal], [polygon]);
    expect(spans(rectangle, horizontal.key, 150)).toEqual([[0, 2700], [3300, 6000]]);
    expect(spans(rectangle, horizontal.key, -150)).toEqual([[0, 2700], [3300, 6000]]);
    const circle = cleanWallFaces([horizontal], [{ kind: 'circle', center: { x: 3000, y: 0 }, radius: 500 }]);
    const cut = Math.sqrt(500 ** 2 - 150 ** 2);
    for (const y of [-150, 150]) {
      const actual = spans(circle, horizontal.key, y);
      expect(actual).toHaveLength(2);
      expect(actual[0][0]).toBe(0);
      expect(actual[0][1]).toBeCloseTo(3000 - cut, 9);
      expect(actual[1][0]).toBeCloseTo(3000 + cut, 9);
      expect(actual[1][1]).toBe(6000);
    }
    const tangent = cleanWallFaces([horizontal], [{ kind: 'circle', center: { x: 3000, y: 650 }, radius: 500 }]);
    expect(canonical(tangent)).toEqual(canonical(cleanWallFaces([horizontal], [])));
    const concave = { kind: 'polygon' as const, vertices: [[2000, -1000], [4000, -1000], [4000, 1000],
      [3500, 1000], [3500, -500], [2500, -500], [2500, 1000], [2000, 1000]].map(([x, y]) => ({ x, y })) };
    expect(spans(cleanWallFaces([horizontal], [concave]), horizontal.key, 150))
      .toEqual([[0, 2000], [2500, 3500], [4000, 6000]]);
  });

  it('keeps equivalent millimetre/metre intersections after UTM translation', () => {
    for (const factor of [1, 0.001]) for (const origin of [0, 1e6]) {
      const transform = (p: { x: number; y: number }) => ({ x: origin + p.x * factor, y: origin + p.y * factor });
      const h = { ...horizontal, path: { ...horizontal.path, scale: 300 * factor, vertices: horizontal.path.vertices.map(transform) } };
      const v = wall('v', [[origin + 3000 * factor, origin], [origin + 3000 * factor, origin + 3000 * factor]], 200 * factor);
      const t = cleanWallFaces([h, v], []);
      const upper = spans(t, h.key, origin + 150 * factor);
      expect(upper).toHaveLength(2);
      expect((upper[0][1] - origin) / factor).toBeCloseTo(2900, 5);
      expect((upper[1][0] - origin) / factor).toBeCloseTo(3100, 5);
      const circle = cleanWallFaces([h], [{ kind: 'circle', center: transform({ x: 3000, y: 0 }), radius: 500 * factor }]);
      const upperCircle = spans(circle, h.key, origin + 150 * factor);
      expect((upperCircle[0][1] - origin) / factor).toBeCloseTo(3000 - Math.sqrt(500 ** 2 - 150 ** 2), 5);
      expect((upperCircle[1][0] - origin) / factor).toBeCloseTo(3000 + Math.sqrt(500 ** 2 - 150 ** 2), 5);
      expect(circle.every(s => Object.values(s.start).every(Number.isFinite) && Object.values(s.end).every(Number.isFinite))).toBe(true);
    }
  });

  it('retains a small wall when an unrelated distant column is selected', () => {
    const small = wall('small', [[0, 0], [6, 0]], 0.3);
    const withoutColumn = cleanWallFaces([small], []);
    expect(spans(withoutColumn, small.key, 0.15)).toEqual([[0, 6]]);
    expect(spans(withoutColumn, small.key, -0.15)).toEqual([[0, 6]]);
    const withColumn = cleanWallFaces([small], [{ kind: 'circle', center: { x: 1e14, y: 0 }, radius: 1000 }]);
    expect(canonical(withColumn)).toEqual(canonical(withoutColumn));
  });

  it('rejects malformed, nonfinite, collapsed or fully obscured geometry with bilingual domain errors', () => {
    const invalid = [
      () => cleanWallFaces([], []),
      () => cleanWallFaces([wall('bad', [[0, 0], [NaN, 0]])], []),
      () => cleanWallFaces([wall('bad', [[0, 0], [Infinity, 0]])], []),
      () => cleanWallFaces([wall('bad', [[0, 0], [0, 0]])], []),
      () => cleanWallFaces([wall('bad', [[0, 0], [1e155, 0]])], []),
      () => cleanWallFaces([wall('bad', [[0, 0], [100, 0]], Number.MAX_VALUE)], []),
      () => cleanWallFaces([wall('bad', [[0, 0], [100, 0]], 1e-12)], []),
      () => cleanWallFaces([wall('bad', [[0, 0], [100, 0], [100, 10]], 300)], []),
      () => cleanWallFaces([horizontal, horizontal], []),
      () => cleanWallFaces([horizontal], [{ kind: 'circle', center: { x: 0, y: 0 }, radius: -1 }]),
      () => cleanWallFaces([horizontal], [{ kind: 'circle', center: { x: Infinity, y: 0 }, radius: 500 }]),
      () => cleanWallFaces([horizontal], [{ kind: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }] }]),
      () => cleanWallFaces([horizontal], [{ kind: 'circle', center: { x: 3000, y: 0 }, radius: 10000 }]),
    ];
    for (const run of invalid) {
      let caught: unknown;
      try { run(); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(WallCleanupError);
      expect((caught as WallCleanupError).messageI18n.es).toBeTruthy();
      expect((caught as WallCleanupError).messageI18n.en).toBeTruthy();
    }
  });

  it('rejects source, input-point and candidate-operation budgets before geometry work', () => {
    const many = Array.from({ length: 101 }, (_, i) => wall(String(i), [[i * 10000, 0], [i * 10000 + 6000, 0]]));
    expect(() => cleanWallFaces(many, [])).toThrow(WallCleanupError);
    const paths = Array.from({ length: 10 }, (_, i) => wall(String(i), Array.from({ length: 500 }, (_, j) => [j * 100, i * 1000])));
    expect(() => cleanWallFaces(paths, [{ kind: 'circle', center: { x: 0, y: 0 }, radius: 1 }])).toThrow(WallCleanupError);
    const expensive = Array.from({ length: 100 }, (_, i) => wall(String(i), Array.from({ length: 20 }, (_, j) => [j * 100, i * 1000])));
    expect(() => cleanWallFaces(expensive, [])).toThrow(WallCleanupError);
  });
});
