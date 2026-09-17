import { boxFromPoints } from '../../geometry/bbox';
import { arcFrom3Points } from '../../geometry/construct';
import type { Curve } from '../../geometry/curves';
import { curveLength, curvePoint, tessellateCurve } from '../../geometry/curves';
import type { Mat2D } from '../../geometry/matrix';
import { applyToPoint, determinant, isSimilarity, rotationOf, uniformScale } from '../../geometry/matrix';
import type { PolyVertex } from '../../geometry/polyline';
import {
  polylineCentroid,
  polylineSegments,
  polylineSignedArea,
  segmentFromVertices,
  sweepToBulge,
  tessellatePolyline,
} from '../../geometry/polyline';
import { splineFromControl, splineThroughPoints } from '../../geometry/spline';
import type { Vec2 } from '../../geometry/vec';
import { add, dot, normalize, perp, scale, sub } from '../../geometry/vec';
import type {
  Entity,
  LineEntity,
  Loop,
  LwPolylineEntity,
  MLineEntity,
  Polyline2dEntity,
  RegionEntity,
  SplineEntity,
  WipeoutEntity,
  ArcEntity,
} from '../../document/types';
import type { DisplayItem, PathItem } from '../graphics';
import { curvesItem, PathBuilder, strokePath } from '../graphics';
import type { EntityKind, GripDef, SnapPointDef } from '../registry';
import { registerKind } from '../registry';
import { baseProps, curvesBBox } from './common';

/** Transforma vértices con bulge. Bajo transformaciones no conformes los arcos se aproximan. */
export function transformVertices(vertices: PolyVertex[], closed: boolean, m: Mat2D): PolyVertex[] {
  const mirror = determinant(m) < 0;
  if (isSimilarity(m) || !vertices.some((v) => Math.abs(v.bulge ?? 0) > 1e-12)) {
    const s = uniformScale(m);
    return vertices.map((v) => {
      const p = applyToPoint(m, v);
      return {
        ...v,
        x: p.x,
        y: p.y,
        bulge: v.bulge ? (mirror ? -v.bulge : v.bulge) : v.bulge,
        startWidth: v.startWidth !== undefined ? v.startWidth * s : undefined,
        endWidth: v.endWidth !== undefined ? v.endWidth * s : undefined,
      };
    });
  }
  const pts = tessellatePolyline(vertices, closed, 1e-3);
  return pts.map((p) => {
    const q = applyToPoint(m, p);
    return { x: q.x, y: q.y, bulge: 0 };
  });
}

export function explodeSegments(e: Entity, segs: Curve[]): Entity[] {
  const base = baseProps(e);
  const out: Entity[] = [];
  for (const s of segs) {
    if (s.kind === 'line') out.push({ ...base, id: '', type: 'line', start: s.a, end: s.b } as LineEntity);
    else if (s.kind === 'arc') {
      const start = s.sweep >= 0 ? s.a0 : s.a0 + s.sweep;
      out.push({ ...base, id: '', type: 'arc', center: s.c, radius: s.r, startAngle: start, endAngle: start + Math.abs(s.sweep) } as ArcEntity);
    } else {
      const pts = tessellateCurve(s, 1e-3);
      for (let i = 1; i < pts.length; i++) out.push({ ...base, id: '', type: 'line', start: pts[i - 1], end: pts[i] } as LineEntity);
    }
  }
  return out;
}

export function polylineSnaps(vertices: PolyVertex[], closed: boolean): SnapPointDef[] {
  const segs = polylineSegments(vertices, closed);
  const pts: SnapPointDef[] = vertices.map((v) => ({ type: 'endpoint', p: { x: v.x, y: v.y } }));
  for (const s of segs) {
    pts.push({ type: 'midpoint', p: curvePoint(s, 0.5) });
    if (s.kind === 'arc') pts.push({ type: 'center', p: s.c });
  }
  if (closed && vertices.length > 2) pts.push({ type: 'geocenter', p: polylineCentroid(vertices) });
  return pts;
}

function polylineGrips(vertices: PolyVertex[], closed: boolean): GripDef[] {
  const g: GripDef[] = vertices.map((v, i) => ({ id: `v:${i}`, p: { x: v.x, y: v.y }, shape: 'square' }));
  polylineSegments(vertices, closed).forEach((s, i) => g.push({ id: `m:${i}`, p: curvePoint(s, 0.5), shape: 'rect-mid' }));
  return g;
}

/** Mueve un grip de vértice o de segmento de una polilínea. */
export function movePolylineGrip(vertices: PolyVertex[], closed: boolean, gripId: string, to: Vec2): PolyVertex[] {
  const [kind, idxStr] = gripId.split(':');
  const i = Number(idxStr);
  const vs = vertices.map((v) => ({ ...v }));
  if (kind === 'v') {
    vs[i] = { ...vs[i], x: to.x, y: to.y };
    return vs;
  }
  if (kind === 'm') {
    const j = (i + 1) % vs.length;
    const a = vs[i];
    const b = vs[j];
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) > 1e-12) {
      const arc = arcFrom3Points(a, to, b);
      if (arc) vs[i] = { ...a, bulge: sweepToBulge(arc.sweep) };
      return vs;
    }
    const seg = segmentFromVertices(a, b);
    const midp = curvePoint(seg, 0.5);
    const d = sub(to, midp);
    vs[i] = { ...a, x: a.x + d.x, y: a.y + d.y };
    vs[j] = { ...b, x: b.x + d.x, y: b.y + d.y };
    void closed;
    return vs;
  }
  return vs;
}

function widthItems(e: LwPolylineEntity): DisplayItem[] {
  const segs = polylineSegments(e.vertices, e.closed);
  const items: DisplayItem[] = [];
  const cw = e.constantWidth ?? 0;
  const varying = e.vertices.some((v) => (v.startWidth ?? cw) !== cw || (v.endWidth ?? cw) !== cw);
  if (!varying) {
    const item: PathItem = { ...curvesItem(segs, e.closed), width: cw };
    return [item];
  }
  // Grosor variable: cada tramo como polígono relleno
  segs.forEach((s, i) => {
    const v = e.vertices[i];
    const w0 = v.startWidth ?? cw;
    const w1 = v.endWidth ?? cw;
    const pts = tessellateCurve(s, 1e-3);
    const n = pts.length;
    const left: Vec2[] = [];
    const right: Vec2[] = [];
    for (let k = 0; k < n; k++) {
      const t = n > 1 ? k / (n - 1) : 0;
      const w = (w0 + (w1 - w0) * t) / 2;
      const dirv = k < n - 1 ? sub(pts[k + 1], pts[k]) : sub(pts[k], pts[k - 1]);
      const nrm = perp(normalize(dirv));
      left.push(add(pts[k], scale(nrm, w)));
      right.push(sub(pts[k], scale(nrm, w)));
    }
    const poly = [...left, ...right.reverse()];
    items.push({ k: 'path', cmds: new PathBuilder().polyline(poly, true).cmds, stroke: false, fill: 'nonzero', solid: true });
  });
  return items;
}

export const lwpolylineKind: EntityKind<LwPolylineEntity> = {
  type: 'lwpolyline',
  curves: (e) => polylineSegments(e.vertices, e.closed),
  bbox: (e) => {
    const segs = polylineSegments(e.vertices, e.closed);
    return segs.length ? curvesBBox(segs) : boxFromPoints(e.vertices);
  },
  graphics: (e) => {
    const hasWidth = (e.constantWidth ?? 0) > 0 || e.vertices.some((v) => (v.startWidth ?? 0) > 0 || (v.endWidth ?? 0) > 0);
    if (hasWidth) return widthItems(e);
    return [curvesItem(polylineSegments(e.vertices, e.closed), e.closed)];
  },
  transform: (e, m) => {
    let shape = e.shape;
    if (shape && isSimilarity(m) && determinant(m) > 0) {
      const s = uniformScale(m);
      const r = rotationOf(m);
      if (shape.kind === 'rectangle') shape = { ...shape, corner: applyToPoint(m, shape.corner), width: shape.width * s, height: shape.height * s, rotation: shape.rotation + r };
      else if (shape.kind === 'polygon') shape = { ...shape, center: applyToPoint(m, shape.center), radius: shape.radius * s, rotation: shape.rotation + r };
      else shape = { ...shape, arcLength: shape.arcLength * s };
    } else shape = undefined;
    const s = uniformScale(m);
    return {
      ...e,
      vertices: transformVertices(e.vertices, e.closed, m),
      constantWidth: e.constantWidth !== undefined ? e.constantWidth * s : undefined,
      shape,
    };
  },
  snapPoints: (e) => polylineSnaps(e.vertices, e.closed),
  grips: (e) => polylineGrips(e.vertices, e.closed),
  moveGrip: (e, g, to) => ({ ...e, vertices: movePolylineGrip(e.vertices, e.closed, g, to), shape: undefined }),
  explode: (e) => explodeSegments(e, polylineSegments(e.vertices, e.closed)),
  length: (e) => polylineSegments(e.vertices, e.closed).reduce((s, c) => s + curveLength(c), 0),
  area: (e) => (e.closed ? Math.abs(polylineSignedArea(e.vertices)) : null),
};

/** Curva suavizada de una polilínea 2D. */
export function smoothedCurves(e: Polyline2dEntity): Curve[] {
  if (e.smoothing === 'none' || e.vertices.length < 3) return polylineSegments(e.vertices, e.closed);
  const pts = e.vertices.map((v) => ({ x: v.x, y: v.y }));
  if (e.smoothing === 'fit') {
    const fit = e.closed ? [...pts, pts[0]] : pts;
    return [{ kind: 'spline', s: splineThroughPoints(fit, 3) }];
  }
  const degree = e.smoothing === 'quadratic' ? 2 : 3;
  return [{ kind: 'spline', s: splineFromControl(pts, degree, e.closed) }];
}

export const polyline2dKind: EntityKind<Polyline2dEntity> = {
  type: 'polyline2d',
  curves: (e) => smoothedCurves(e),
  bbox: (e) => curvesBBox(smoothedCurves(e)),
  graphics: (e) => [curvesItem(smoothedCurves(e), e.closed && e.smoothing === 'none')],
  transform: (e, m) => ({ ...e, vertices: transformVertices(e.vertices, e.closed, m) }),
  snapPoints: (e) =>
    e.smoothing === 'none'
      ? polylineSnaps(e.vertices, e.closed)
      : [
          { type: 'endpoint', p: curvePoint(smoothedCurves(e)[0], 0) },
          { type: 'endpoint', p: curvePoint(smoothedCurves(e)[0], 1) },
        ],
  grips: (e) => (e.smoothing === 'none' ? polylineGrips(e.vertices, e.closed) : e.vertices.map((v, i) => ({ id: `v:${i}`, p: { x: v.x, y: v.y }, shape: 'square' as const }))),
  moveGrip: (e, g, to) => ({ ...e, vertices: movePolylineGrip(e.vertices, e.closed, g, to) }),
  explode: (e) => explodeSegments(e, smoothedCurves(e)),
  length: (e) => smoothedCurves(e).reduce((s, c) => s + curveLength(c), 0),
};

export const splineKind: EntityKind<SplineEntity> = {
  type: 'spline',
  curves: (e) => [{ kind: 'spline', s: e.spline }],
  bbox: (e) => curvesBBox([{ kind: 'spline', s: e.spline }]),
  graphics: (e) => [curvesItem([{ kind: 'spline', s: e.spline }])],
  transform: (e, m) => ({
    ...e,
    spline: { ...e.spline, ctrl: e.spline.ctrl.map((p) => applyToPoint(m, p)), fit: e.spline.fit?.map((p) => applyToPoint(m, p)) },
  }),
  snapPoints: (e) => {
    const c: Curve = { kind: 'spline', s: e.spline };
    const pts: SnapPointDef[] = [
      { type: 'endpoint', p: curvePoint(c, 0) },
      { type: 'endpoint', p: curvePoint(c, 1) },
    ];
    if (e.spline.fit) for (const f of e.spline.fit) pts.push({ type: 'node', p: f });
    return pts;
  },
  grips: (e) =>
    e.method === 'fit' && e.spline.fit
      ? e.spline.fit.map((p, i) => ({ id: `f:${i}`, p, shape: 'square' as const }))
      : e.spline.ctrl.map((p, i) => ({ id: `cv:${i}`, p, shape: 'square' as const })),
  moveGrip: (e, g, to) => {
    const [k, idx] = g.split(':');
    const i = Number(idx);
    if (k === 'f' && e.spline.fit) {
      const fit = e.spline.fit.map((p, j) => (j === i ? to : p));
      return { ...e, spline: { ...splineThroughPoints(fit, e.spline.degree), closed: e.spline.closed } };
    }
    const ctrl = e.spline.ctrl.map((p, j) => (j === i ? to : p));
    return { ...e, method: 'cv', spline: { ...e.spline, ctrl, fit: undefined } };
  },
  length: (e) => curveLength({ kind: 'spline', s: e.spline }),
};

/** Geometría de cada elemento de una multilínea (inglete en los vértices). */
export function mlineElements(e: MLineEntity, offsets: number[]): Vec2[][] {
  const pts = e.vertices;
  const n = pts.length;
  if (n < 2) return [];
  const maxO = Math.max(...offsets);
  const minO = Math.min(...offsets);
  const shift = e.justification === 'top' ? -maxO : e.justification === 'bottom' ? -minO : 0;
  const normals: Vec2[] = [];
  const segCount = e.closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) normals.push(perp(normalize(sub(pts[(i + 1) % n], pts[i]))));
  const miter = (i: number): Vec2 => {
    const prev = e.closed ? normals[(i - 1 + segCount) % segCount] : normals[i - 1];
    const next = e.closed ? normals[i % segCount] : normals[i];
    if (!prev) return next;
    if (!next) return prev;
    const mdir = normalize(add(prev, next));
    const c = dot(mdir, next);
    return Math.abs(c) < 1e-6 ? next : scale(mdir, 1 / c);
  };
  return offsets.map((o) => {
    const d = (o + shift) * e.scale;
    const line = pts.map((p, i) => add(p, scale(miter(i), d)));
    if (e.closed) line.push(line[0]);
    return line;
  });
}

export const mlineKind: EntityKind<MLineEntity> = {
  type: 'mline',
  curves: (e, ctx) => {
    const style = ctx.doc.data.mlineStyles.get(e.style);
    const offsets = style ? style.elements.map((el) => el.offset) : [0.5, -0.5];
    const out: Curve[] = [];
    for (const poly of mlineElements(e, offsets)) for (let i = 1; i < poly.length; i++) out.push({ kind: 'line', a: poly[i - 1], b: poly[i] });
    return out;
  },
  bbox: (e, ctx) => curvesBBox(mlineKind.curves(e, ctx)),
  graphics: (e, ctx) => {
    const style = ctx.doc.data.mlineStyles.get(e.style);
    const elements = style?.elements ?? [
      { offset: 0.5, color: 'ByLayer', linetype: 'ByLayer' },
      { offset: -0.5, color: 'ByLayer', linetype: 'ByLayer' },
    ];
    const polys = mlineElements(e, elements.map((el) => el.offset));
    const items: DisplayItem[] = polys.map((poly, i) =>
      strokePath(new PathBuilder().polyline(poly).cmds, {
        color: elements[i].color === 'ByLayer' ? undefined : elements[i].color,
        linetype: elements[i].linetype === 'ByLayer' ? undefined : elements[i].linetype,
      }),
    );
    if (!e.closed && polys.length > 1) {
      const firsts = polys.map((p) => p[0]);
      const lasts = polys.map((p) => p[p.length - 1]);
      if (style?.startCap === 'line') items.push(strokePath(new PathBuilder().polyline([firsts[0], firsts[firsts.length - 1]]).cmds));
      if (style?.endCap === 'line') items.push(strokePath(new PathBuilder().polyline([lasts[0], lasts[lasts.length - 1]]).cmds));
    }
    return items;
  },
  transform: (e, m) => ({ ...e, vertices: e.vertices.map((p) => applyToPoint(m, p)), scale: e.scale * uniformScale(m) }),
  snapPoints: (e) => e.vertices.map((p) => ({ type: 'endpoint' as const, p })),
  grips: (e) => e.vertices.map((p, i) => ({ id: `v:${i}`, p, shape: 'square' as const })),
  moveGrip: (e, g, to) => {
    const i = Number(g.split(':')[1]);
    return { ...e, vertices: e.vertices.map((p, j) => (j === i ? to : p)) };
  },
  explode: (e, ctx) => explodeSegments(e, mlineKind.curves(e, ctx)),
};

export function loopsCurves(loops: Loop[]): Curve[] {
  return loops.flatMap((l) => polylineSegments(l.vertices, true));
}

export function loopsPath(loops: Loop[]): PathBuilder {
  const pb = new PathBuilder();
  for (const l of loops) pb.curves(polylineSegments(l.vertices, true), true);
  return pb;
}

export function loopsArea(loops: Loop[]): number {
  if (!loops.length) return 0;
  const areas = loops.map((l) => Math.abs(polylineSignedArea(l.vertices)));
  const max = Math.max(...areas);
  const outerIdx = areas.indexOf(max);
  return areas.reduce((s, a, i) => (i === outerIdx ? s + a : s - a), 0);
}

export const regionKind: EntityKind<RegionEntity> = {
  type: 'region',
  curves: (e) => loopsCurves(e.loops),
  bbox: (e) => curvesBBox(loopsCurves(e.loops)),
  graphics: (e) => [strokePath(loopsPath(e.loops).cmds)],
  transform: (e, m) => ({
    ...e,
    loops: e.loops.map((l) => ({ ...l, vertices: transformVertices(l.vertices, true, m) })),
  }),
  snapPoints: (e) => e.loops.flatMap((l) => polylineSnaps(l.vertices, true)),
  grips: (e) => [{ id: 'centroid', p: polylineCentroid(e.loops[0]?.vertices ?? []), shape: 'square' }],
  moveGrip: (e, _g, to) => {
    const c = polylineCentroid(e.loops[0]?.vertices ?? []);
    const d = sub(to, c);
    return { ...e, loops: e.loops.map((l) => ({ ...l, vertices: l.vertices.map((v) => ({ ...v, x: v.x + d.x, y: v.y + d.y })) })) };
  },
  explode: (e) => explodeSegments(e, loopsCurves(e.loops)),
  area: (e) => loopsArea(e.loops),
  length: (e) => loopsCurves(e.loops).reduce((s, c) => s + curveLength(c), 0),
  outline: (e) => tessellatePolyline(e.loops[0]?.vertices ?? [], true, 1e-2),
};

export const wipeoutKind: EntityKind<WipeoutEntity> = {
  type: 'wipeout',
  curves: (e) => polylineSegments(e.vertices, true),
  bbox: (e) => boxFromPoints(e.vertices),
  graphics: (e) => [{ k: 'wipeout', cmds: new PathBuilder().polyline(e.vertices, true).cmds, frame: e.frame }],
  transform: (e, m) => ({ ...e, vertices: e.vertices.map((p) => applyToPoint(m, p)) }),
  snapPoints: (e) => (e.frame ? e.vertices.map((p) => ({ type: 'endpoint' as const, p })) : []),
  grips: (e) => e.vertices.map((p, i) => ({ id: `v:${i}`, p, shape: 'square' as const })),
  moveGrip: (e, g, to) => {
    const i = Number(g.split(':')[1]);
    return { ...e, vertices: e.vertices.map((p, j) => (j === i ? to : p)) };
  },
  outline: (e) => e.vertices,
  filledHit: () => true,
  area: (e) => Math.abs(polylineSignedArea(e.vertices)),
};

export function registerPolylineKinds() {
  registerKind<'lwpolyline'>(lwpolylineKind);
  registerKind<'polyline2d'>(polyline2dKind);
  registerKind<'spline'>(splineKind);
  registerKind<'mline'>(mlineKind);
  registerKind<'region'>(regionKind);
  registerKind<'wipeout'>(wipeoutKind);
}
