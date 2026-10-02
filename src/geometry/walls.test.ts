import { describe, expect, it } from 'vitest';
import { wallFaces, wallOpening } from './walls';
import type { WallPath } from './walls';
import { dist } from './vec';

const wall: WallPath = { vertices: [{ x: 0, y: 0 }, { x: 5000, y: 0 }], closed: false, scale: 150, justification: 'zero' };
describe('wall geometry', () => {
  it.each(['zero', 'top', 'bottom'] as const)('horizontal, vertical and rotated faces: %s', justification => {
    for (const angle of [0, Math.PI / 2, 0.7]) {
      const w = { ...wall, justification, vertices: [{ x: 0, y: 0 }, { x: 5000 * Math.cos(angle), y: 5000 * Math.sin(angle) }] };
      const faces = wallFaces(w);
      expect(dist(faces[0][0], faces[1][0])).toBeCloseTo(150);
      expect(dist(faces[0][0], faces[0][1])).toBeCloseTo(5000);
      if (justification === 'top') expect(faces[0][0]).toEqual(w.vertices[0]);
      if (justification === 'bottom') expect(faces[1][0]).toEqual(w.vertices[0]);
    }
  });
  it('rejects duplicate points, reversal, non-finite inputs and excessive miters', () => {
    for (const vertices of [[{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 0, y: 0 }], [{ x: NaN, y: 0 }, { x: 5000, y: 0 }], [{ x: 0, y: 0 }, { x: Infinity, y: 0 }], [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 0, y: 10 }]]) expect(() => wallFaces({ ...wall, vertices })).toThrow();
    expect(() => wallFaces({ ...wall, scale: -1 })).toThrow();
    expect(() => wallFaces({ ...wall, scale: Infinity })).toThrow();
    expect(() => wallFaces({ ...wall, closed: true })).toThrow();
  });
  it('splits an open path preserving untouched faces and properties for every reference', () => {
    for (const justification of ['zero', 'top', 'bottom'] as const) {
      const w = { ...wall, justification, vertices: [...wall.vertices, { x: 5000, y: 4000 }] };
      const before = wallFaces(w), gap = wallOpening(w, { x: 2500, y: 300 }, 900);
      expect(gap.paths).toEqual([[{ x: 0, y: 0 }, { x: 2050, y: 0 }], [{ x: 2950, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }]]);
      const after = gap.paths.map(vertices => wallFaces({ ...w, vertices }));
      for (let i = 0; i < 2; i++) expect(after[1][i].slice(1)).toEqual(before[i].slice(1));
    }
  });
  it('opens a closed wall as one path preserving all other corners', () => {
    const w = { ...wall, closed: true, vertices: [...wall.vertices, { x: 5000, y: 4000 }, { x: 0, y: 4000 }] };
    const before = wallFaces(w), gap = wallOpening(w, { x: 2500, y: 0 }, 1200);
    expect(gap.paths).toHaveLength(1);
    const after = wallFaces({ ...w, vertices: gap.paths[0], closed: false });
    for (let i = 0; i < 2; i++) expect(after[i].slice(1, -1)).toEqual([...before[i].slice(1), before[i][0]]);
  });
  it('rejects openings outside segments, touching or invading mitered corners, and invalid widths', () => {
    const w = { ...wall, vertices: [...wall.vertices, { x: 5000, y: 4000 }] };
    for (const pick of [{ x: -1000, y: 0 }, { x: 450, y: 0 }, { x: 4540, y: 0 }]) expect(() => wallOpening(w, pick, 900)).toThrow();
    for (const width of [0, -1, Infinity, NaN, 6000]) expect(() => wallOpening(w, { x: 2500, y: 0 }, width)).toThrow();
  });
  it('uses the nearest segment and projects without a zoom parameter', () => {
    const w = { ...wall, vertices: [...wall.vertices, { x: 5000, y: 4000 }] };
    const gap = wallOpening(w, { x: 5200, y: 2000 }, 900);
    expect(gap.segment).toBe(1);
    expect(gap.start).toEqual({ x: 5000, y: 1550 });
    expect(gap.end).toEqual({ x: 5000, y: 2450 });
  });
});
