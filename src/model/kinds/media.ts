import type { BBox } from '../../geometry/bbox';
import { boxFromPoints, transformBox } from '../../geometry/bbox';
import type { Mat2D } from '../../geometry/matrix';
import { applyToPoint, applyToVector, invert, uniformScale } from '../../geometry/matrix';
import { pointInPolygon, polylineSegments } from '../../geometry/polyline';
import type { Vec2 } from '../../geometry/vec';
import { add, dist, dot, len, normalize, scale, sub } from '../../geometry/vec';
import type { ImageEntity, PdfUnderlayEntity, ViewportEntity } from '../../document/types';
import { PathBuilder } from '../graphics';
import type { EntityKind, EvalContext, GripDef, SnapPointDef } from '../registry';
import { registerKind } from '../registry';
import { rotOf } from './common';

function imageCorners(position: Vec2, u: Vec2, v: Vec2): Vec2[] {
  return [position, add(position, u), add(add(position, u), v), add(position, v)];
}

function imageMatrix(position: Vec2, u: Vec2, v: Vec2): Mat2D {
  return { a: u.x, b: u.y, c: v.x, d: v.y, e: position.x, f: position.y };
}

function clipWorld(m: Mat2D, clip: Vec2[] | undefined, enabled: boolean): Vec2[] | undefined {
  return enabled && clip && clip.length > 2 ? clip.map((p) => applyToPoint(m, p)) : undefined;
}

/** Grips de esquina que escalan proporcionalmente desde la esquina opuesta. */
function scaleFromCorner(position: Vec2, u: Vec2, v: Vec2, gripIndex: number, to: Vec2): { position: Vec2; u: Vec2; v: Vec2 } {
  const corners = imageCorners(position, u, v);
  const opposite = corners[(gripIndex + 2) % 4];
  const moved = corners[gripIndex];
  const d0 = dist(opposite, moved);
  if (d0 < 1e-12) return { position, u, v };
  const diag = normalize(sub(moved, opposite));
  const s = dot(sub(to, opposite), diag) / d0;
  if (s <= 1e-6) return { position, u, v };
  const np = add(opposite, scale(sub(position, opposite), s));
  return { position: np, u: scale(u, s), v: scale(v, s) };
}

export const imageKind: EntityKind<ImageEntity> = {
  type: 'image',
  curves: (e) => polylineSegments(imageCorners(e.position, e.u, e.v), true),
  bbox: (e) => boxFromPoints(imageCorners(e.position, e.u, e.v)),
  graphics: (e) => {
    const m = imageMatrix(e.position, e.u, e.v);
    return [{ k: 'image', assetId: e.assetId, m, clip: clipWorld(m, e.clip, e.clipEnabled), opacity: e.opacity, fade: e.fade, brightness: e.brightness, contrast: e.contrast, monochrome: e.monochrome, frame: true }];
  },
  transform: (e, m) => ({ ...e, position: applyToPoint(m, e.position), u: applyToVector(m, e.u), v: applyToVector(m, e.v) }),
  snapPoints: (e) => imageCorners(e.position, e.u, e.v).map((p) => ({ type: 'endpoint' as const, p })),
  grips: (e) => imageCorners(e.position, e.u, e.v).map((p, i): GripDef => ({ id: `c:${i}`, p, shape: 'square' })),
  moveGrip: (e, g, to) => {
    const i = Number(g.split(':')[1]);
    return { ...e, ...scaleFromCorner(e.position, e.u, e.v, i, to) };
  },
  outline: (e) => {
    const m = imageMatrix(e.position, e.u, e.v);
    return clipWorld(m, e.clip, e.clipEnabled) ?? imageCorners(e.position, e.u, e.v);
  },
  filledHit: () => true,
  area: (e) => Math.abs(e.u.x * e.v.y - e.u.y * e.v.x),
};

export function underlaySize(e: PdfUnderlayEntity, ctx: EvalContext): { w: number; h: number } {
  const asset = ctx.doc.data.assets.get(e.assetId);
  return { w: (asset?.width ?? 595) * e.scale, h: (asset?.height ?? 842) * e.scale };
}

function underlayVectors(e: PdfUnderlayEntity, ctx: EvalContext) {
  const { w, h } = underlaySize(e, ctx);
  const c = Math.cos(e.rotation);
  const s = Math.sin(e.rotation);
  return { u: { x: w * c, y: w * s }, v: { x: -h * s, y: h * c } };
}

/** Segmentos vectoriales de la página del calco que tocan una caja, en coordenadas de dibujo. */
function underlaySegmentsNear(e: PdfUnderlayEntity, ctx: EvalContext, box: BBox): [Vec2, Vec2][] {
  const index = ctx.pdfGeometry?.(e.assetId, e.page);
  if (!index) return [];
  const { u, v } = underlayVectors(e, ctx);
  const m = imageMatrix(e.position, u, v);
  const inv = invert(m);
  const unitBox = transformBox(box, inv);
  // con recorte activo solo se ofrecen segmentos con algún extremo dentro del contorno visible
  const clip = e.clipEnabled && e.clip && e.clip.length > 2 ? e.clip : null;
  const out: [Vec2, Vec2][] = [];
  for (const [x1, y1, x2, y2] of index.query(unitBox)) {
    if (clip && !(pointInPolygon({ x: x1, y: y1 }, clip) || pointInPolygon({ x: x2, y: y2 }, clip))) continue;
    out.push([applyToPoint(m, { x: x1, y: y1 }), applyToPoint(m, { x: x2, y: y2 })]);
    if (out.length >= 400) break;
  }
  return out;
}

export const pdfUnderlayKind: EntityKind<PdfUnderlayEntity> = {
  type: 'pdfunderlay',
  curves: (e, ctx) => {
    const { u, v } = underlayVectors(e, ctx);
    return polylineSegments(imageCorners(e.position, u, v), true);
  },
  bbox: (e, ctx) => {
    const { u, v } = underlayVectors(e, ctx);
    return boxFromPoints(imageCorners(e.position, u, v));
  },
  graphics: (e, ctx) => {
    const { u, v } = underlayVectors(e, ctx);
    const m = imageMatrix(e.position, u, v);
    return [{ k: 'image', assetId: e.assetId, m, clip: clipWorld(m, e.clip, e.clipEnabled), opacity: e.opacity, fade: e.fade, monochrome: e.monochrome, pdfPage: e.page, frame: true }];
  },
  transform: (e, m) => ({ ...e, position: applyToPoint(m, e.position), scale: e.scale * uniformScale(m), rotation: e.rotation + rotOf(m) }),
  snapPoints: (e, ctx) => {
    const { u, v } = underlayVectors(e, ctx);
    return imageCorners(e.position, u, v).map((p) => ({ type: 'endpoint' as const, p }));
  },
  grips: (e, ctx) => {
    const { u, v } = underlayVectors(e, ctx);
    return imageCorners(e.position, u, v).map((p, i): GripDef => ({ id: `c:${i}`, p, shape: 'square' }));
  },
  moveGrip: (e, g, to, ctx) => {
    const { u, v } = underlayVectors(e, ctx);
    const i = Number(g.split(':')[1]);
    const r = scaleFromCorner(e.position, u, v, i, to);
    return { ...e, position: r.position, scale: (e.scale * len(r.u)) / (len(u) || 1) };
  },
  outline: (e, ctx) => {
    const { u, v } = underlayVectors(e, ctx);
    const m = imageMatrix(e.position, u, v);
    return clipWorld(m, e.clip, e.clipEnabled) ?? imageCorners(e.position, u, v);
  },
  snapPointsNear: (e, ctx, box) => {
    const { u, v } = underlayVectors(e, ctx);
    const pts: SnapPointDef[] = imageCorners(e.position, u, v).map((p) => ({ type: 'endpoint' as const, p }));
    for (const [a, b] of underlaySegmentsNear(e, ctx, box)) {
      pts.push({ type: 'endpoint', p: a }, { type: 'endpoint', p: b }, { type: 'midpoint', p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
    }
    return pts;
  },
  curvesNear: (e, ctx, box) => {
    const { u, v } = underlayVectors(e, ctx);
    const frame = polylineSegments(imageCorners(e.position, u, v), true);
    return [...frame, ...underlaySegmentsNear(e, ctx, box).map(([a, b]) => ({ kind: 'line' as const, a, b }))];
  },
  filledHit: () => true,
};

export function viewportOutline(e: ViewportEntity): Vec2[] {
  if (e.clipBoundary && e.clipBoundary.length > 2) return e.clipBoundary;
  const hw = e.width / 2;
  const hh = e.height / 2;
  return [
    { x: e.center.x - hw, y: e.center.y - hh },
    { x: e.center.x + hw, y: e.center.y - hh },
    { x: e.center.x + hw, y: e.center.y + hh },
    { x: e.center.x - hw, y: e.center.y + hh },
  ];
}

/** Matriz modelo → papel de un viewport. */
export function viewportMatrix(e: ViewportEntity): Mat2D {
  const c = Math.cos(e.viewTwist);
  const s = Math.sin(e.viewTwist);
  const k = e.scale;
  // p_papel = center + R(twist)·k·(p_modelo − viewCenter)
  return {
    a: c * k,
    b: s * k,
    c: -s * k,
    d: c * k,
    e: e.center.x - k * (c * e.viewCenter.x - s * e.viewCenter.y),
    f: e.center.y - k * (s * e.viewCenter.x + c * e.viewCenter.y),
  };
}

export const viewportKind: EntityKind<ViewportEntity> = {
  type: 'viewport',
  curves: (e) => polylineSegments(viewportOutline(e), true),
  bbox: (e) => boxFromPoints(viewportOutline(e)),
  graphics: (e) => [{ k: 'path', cmds: new PathBuilder().polyline(viewportOutline(e), true).cmds, stroke: true }],
  transform: (e, m) => {
    const s = uniformScale(m);
    return {
      ...e,
      center: applyToPoint(m, e.center),
      width: e.width * s,
      height: e.height * s,
      scale: e.scale * s,
      clipBoundary: e.clipBoundary?.map((p) => applyToPoint(m, p)),
    };
  },
  snapPoints: (e) => viewportOutline(e).map((p) => ({ type: 'endpoint' as const, p })),
  grips: (e) => [
    { id: 'center', p: e.center, shape: 'square' },
    ...viewportOutline(e).map((p, i): GripDef => ({ id: e.clipBoundary ? `v:${i}` : `c:${i}`, p, shape: 'square' })),
  ],
  moveGrip: (e, g, to) => {
    if (g === 'center') {
      const d = sub(to, e.center);
      return { ...e, center: to, clipBoundary: e.clipBoundary?.map((p) => add(p, d)) };
    }
    const [k, idx] = g.split(':');
    const i = Number(idx);
    if (k === 'v' && e.clipBoundary) return { ...e, clipBoundary: e.clipBoundary.map((p, j) => (j === i ? to : p)) };
    const corners = viewportOutline(e);
    const opp = corners[(i + 2) % 4];
    const width = Math.max(1, Math.abs(to.x - opp.x));
    const height = Math.max(1, Math.abs(to.y - opp.y));
    return { ...e, width, height, center: { x: (to.x + opp.x) / 2, y: (to.y + opp.y) / 2 } };
  },
  outline: (e) => viewportOutline(e),
};

export function registerMediaKinds() {
  registerKind<'image'>(imageKind);
  registerKind<'pdfunderlay'>(pdfUnderlayKind);
  registerKind<'viewport'>(viewportKind);
}
