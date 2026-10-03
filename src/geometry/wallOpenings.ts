import type { Vec2 } from './vec';
import { wallFaces, wallOffsets, type WallPath } from './walls';
import { add, sub, scale, dot, dist, perp } from './vec';
import { TOL, linearTol } from './tolerance';
export interface WallOpeningSpec { id: string; segment: number; offset: number; width: number; type: 'single' | 'double' | 'sliding' | 'fixed' | 'empty'; side: 1 | -1; hingeEnd: boolean }
export type WallOpeningSymbol = { key: string; openingId: string } & ({ type: 'line'; start: Vec2; end: Vec2 } | { type: 'arc'; center: Vec2; radius: number; startAngle: number; endAngle: number });
export interface WallAssemblyGeometry { fragments: Array<{ key: string; vertices: Vec2[]; closed: boolean }>; symbols: WallOpeningSymbol[] }
export class WallOpeningError extends Error {
  readonly messageI18n = { es: 'El hueco debe caber en un tramo recto, sin tocar otros huecos ni esquinas, con medidas finitas positivas.', en: 'The opening must fit a straight segment, clear of other openings and corners, with positive finite dimensions.' };
  constructor(readonly code: string) { super(`Invalid wall opening: ${code}`); }
}
function requireOpening(condition: unknown, code: string): asserts condition { if (!condition) throw new WallOpeningError(code); }
const finite = (p: Vec2) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
interface Interval { spec: WallOpeningSpec; lo: number; hi: number; start: Vec2; end: Vec2; direction: Vec2 }
function symbolsFor(path: WallPath, interval: Interval): WallOpeningSymbol[] {
  const { spec: o, start, end, direction } = interval, normal = perp(direction), offsets = wallOffsets(path);
  const result: WallOpeningSymbol[] = [], prefix = `opening:${JSON.stringify(o.id)}:`;
  const point = (p: Vec2, offset: number) => add(p, scale(normal, offset));
  const line = (role: string, a: Vec2, b: Vec2) => result.push({ key: prefix + role, openingId: o.id, type: 'line', start: a, end: b });
  line('jamb-start', point(start, offsets[0]), point(start, offsets[1]));
  line('jamb-end', point(end, offsets[0]), point(end, offsets[1]));
  const leaf = (role: string, atEnd: boolean, radius: number) => {
    const hinge = point(atEnd ? end : start, o.side > 0 ? offsets[0] : offsets[1]);
    line(role + '-leaf', hinge, point(hinge, o.side * radius));
    const closedDirection = scale(direction, atEnd ? -1 : 1);
    const closedAngle = Math.atan2(closedDirection.y, closedDirection.x), openAngle = Math.atan2(o.side * normal.y, o.side * normal.x);
    const ccw = (atEnd ? -1 : 1) * o.side > 0;
    result.push({ key: prefix + role + '-arc', openingId: o.id, type: 'arc', center: hinge, radius, startAngle: ccw ? closedAngle : openAngle, endAngle: ccw ? openAngle : closedAngle });
  };
  if (o.type === 'single') leaf('door', o.hingeEnd, o.width);
  if (o.type === 'double') { leaf('door-start', false, o.width / 2); leaf('door-end', true, o.width / 2); }
  if (o.type === 'fixed') for (const [i, fraction] of [0.25, 0.75].entries()) {
    const offset = offsets[1] + path.scale * fraction;
    line(`frame-${i}`, point(start, offset), point(end, offset));
  }
  if (o.type === 'sliding') {
    const middle = add(start, scale(direction, o.width / 2));
    line('slide-start', point(start, offsets[1] + path.scale * 0.25), point(middle, offsets[1] + path.scale * 0.25));
    line('slide-end', point(middle, offsets[1] + path.scale * 0.75), point(end, offsets[1] + path.scale * 0.75));
    const center = point(middle, (offsets[0] + offsets[1]) / 2), along = scale(direction, o.hingeEnd ? -1 : 1);
    const tip = add(center, scale(along, o.width / 4)), tail = add(center, scale(along, -o.width / 4));
    line('direction', tail, tip);
    const back = add(tip, scale(along, -o.width / 10));
    line('direction-left', tip, point(back, path.scale / 8));
    line('direction-right', tip, point(back, -path.scale / 8));
  }
  for (const s of result) {
    if (s.type === 'line') requireOpening(finite(s.start) && finite(s.end) && dist(s.start, s.end) > TOL.LINEAR, 'symbol');
    else requireOpening(finite(s.center) && Number.isFinite(s.radius) && s.radius > TOL.LINEAR && Number.isFinite(s.startAngle) && Number.isFinite(s.endAngle), 'symbol');
  }
  return result;
}
/** Pure, bounded cuts on the complete source. Fragment zero always retains the anchor role. */
export function buildWallAssembly(path: WallPath, openings: WallOpeningSpec[]): WallAssemblyGeometry {
  requireOpening(path && Array.isArray(path.vertices) && path.vertices.length <= 500 && typeof path.closed === 'boolean' && ['zero', 'top', 'bottom'].includes(path.justification), 'path');
  requireOpening(Array.isArray(openings) && openings.length <= 200, 'count');
  let faces: Vec2[][];
  try { faces = wallFaces(path); } catch { throw new WallOpeningError('path'); }
  const pts = path.vertices, count = path.closed ? pts.length : pts.length - 1;
  const magnitude = pts.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y)), path.scale), tol = linearTol(magnitude);
  const distances = [0];
  for (let i = 0; i < count; i++) distances.push(distances[i] + dist(pts[i], pts[(i + 1) % pts.length]));
  requireOpening(distances.every(Number.isFinite), 'path');
  const ids = new Set<string>();
  const intervals: Interval[] = openings.map(o => {
    requireOpening(o && typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 128 && !ids.has(o.id), 'id'); ids.add(o.id);
    requireOpening(Number.isInteger(o.segment) && o.segment >= 0 && o.segment < count && Number.isFinite(o.offset) && Number.isFinite(o.width) && o.width > TOL.LINEAR, 'measure');
    requireOpening(['single', 'double', 'sliding', 'fixed', 'empty'].includes(o.type) && (o.side === 1 || o.side === -1) && typeof o.hingeEnd === 'boolean', 'type');
    const a = pts[o.segment], next = (o.segment + 1) % pts.length, length = dist(a, pts[next]), direction = scale(sub(pts[next], a), 1 / length);
    const lo = o.offset - o.width / 2, hi = o.offset + o.width / 2;
    const first = Math.max(0, ...faces.map(f => dot(sub(f[o.segment], a), direction)));
    const last = Math.min(length, ...faces.map(f => dot(sub(f[next], a), direction)));
    requireOpening(lo > first + tol && hi < last - tol, 'corner');
    return { spec: o, lo: distances[o.segment] + lo, hi: distances[o.segment] + hi, start: add(a, scale(direction, lo)), end: add(a, scale(direction, hi)), direction };
  }).sort((a, b) => a.lo - b.lo);
  for (let i = 1; i < intervals.length; i++) requireOpening(intervals[i].lo - intervals[i - 1].hi > tol, 'overlap');
  const fragments: WallAssemblyGeometry['fragments'] = [];
  const append = (key: string, start: Vec2, end: Vec2, from: number, to: number) => {
    const vertices = [start];
    const total = distances[count];
    for (let cycle = 0; cycle <= (to > total ? 1 : 0); cycle++) {
      for (let i = 0; i < pts.length; i++) {
        const distance = distances[i] + cycle * total;
        if (distance > from && distance < to) vertices.push(pts[i]);
      }
    }
    vertices.push(end);
    try { wallFaces({ ...path, vertices, closed: false }); } catch { throw new WallOpeningError('fragment'); }
    fragments.push({ key, vertices: vertices.map(p => ({ ...p })), closed: false });
  };
  if (!intervals.length) fragments.push({ key: 'wall:anchor', vertices: pts.map(p => ({ ...p })), closed: path.closed });
  else if (path.closed) {
    intervals.forEach((current, i) => {
      const next = intervals[(i + 1) % intervals.length];
      append(i === 0 ? 'wall:anchor' : `wall:after:${JSON.stringify(current.spec.id)}`, current.end, next.start, current.hi, next.lo + (i === intervals.length - 1 ? distances[count] : 0));
    });
  } else {
    append('wall:anchor', pts[0], intervals[0].start, 0, intervals[0].lo);
    intervals.forEach((current, i) => {
      const next = intervals[i + 1];
      append(`wall:after:${JSON.stringify(current.spec.id)}`, current.end, next?.start ?? pts[pts.length - 1], current.hi, next?.lo ?? distances[count]);
    });
  }
  const symbols = intervals.flatMap(interval => symbolsFor(path, interval));
  requireOpening(fragments.length + symbols.length <= 2000, 'output-count');
  return { fragments, symbols };
}
