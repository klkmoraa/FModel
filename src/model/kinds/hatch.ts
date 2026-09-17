import { rotationOf, uniformScale, determinant, applyToPoint } from '../../geometry/matrix';
import type { HatchEntity, LineEntity } from '../../document/types';
import type { DisplayItem } from '../graphics';
import { PathBuilder } from '../graphics';
import { findPattern, generateHatch, hatchPolygons, userPatternLines } from '../hatchPatterns';
import type { EntityKind } from '../registry';
import { registerKind } from '../registry';
import { baseProps, curvesBBox } from './common';
import { loopsArea, loopsCurves, loopsPath, polylineSnaps, transformVertices } from './polylines';

export function hatchSegments(e: HatchEntity) {
  const polys = hatchPolygons(e.loops, e.islandStyle);
  const lines = e.pattern.type === 'user' ? userPatternLines(e.pattern.spacing * (e.pattern.scale || 1), e.pattern.double) : (findPattern(e.pattern.name)?.lines ?? findPattern('ANSI31')!.lines);
  const scale = e.pattern.type === 'user' ? 1 : e.pattern.scale || 1;
  return generateHatch(polys, lines, e.pattern.angle, scale, e.origin);
}

function islandLoops(e: HatchEntity) {
  if (e.islandStyle === 'normal' || e.loops.length <= 1) return e.loops;
  const polys = hatchPolygons(e.loops, 'normal');
  const kept = hatchPolygons(e.loops, e.islandStyle);
  return e.loops.filter((_, i) => kept.includes(polys[i]));
}

export const hatchKind: EntityKind<HatchEntity> = {
  type: 'hatch',
  curves: (e) => loopsCurves(e.loops),
  bbox: (e) => curvesBBox(loopsCurves(e.loops)),
  graphics: (e) => {
    const items: DisplayItem[] = [];
    const boundary = loopsPath(islandLoops(e)).cmds;
    if (e.background) items.push({ k: 'path', cmds: boundary, stroke: false, fill: 'evenodd', solid: true, style: { fillColor: e.background } });
    if (e.pattern.type === 'solid') {
      items.push({ k: 'path', cmds: boundary, stroke: false, fill: 'evenodd', solid: true });
      return items;
    }
    if (e.pattern.type === 'gradient' && e.pattern.gradient) {
      items.push({ k: 'path', cmds: boundary, stroke: false, fill: 'evenodd', solid: true, style: { fillColor: e.pattern.gradient.color1 } });
      return items;
    }
    const { segments, dots, tooDense } = hatchSegments(e);
    if (tooDense) {
      // Demasiado denso para trazar líneas: se representa como relleno tenue (se avisa en auditoría).
      items.push({ k: 'path', cmds: boundary, stroke: false, fill: 'evenodd', solid: true });
      return items;
    }
    const pb = new PathBuilder();
    for (const [a, b] of segments) pb.moveTo(a).lineTo(b);
    items.push({ k: 'path', cmds: pb.cmds, stroke: true, solid: true });
    if (dots.length) for (const d of dots) items.push({ k: 'point', x: d.x, y: d.y, mode: 0, size: 0 });
    return items;
  },
  transform: (e, m) => {
    const mirror = determinant(m) < 0;
    const rot = rotationOf(m);
    const s = uniformScale(m);
    return {
      ...e,
      loops: e.loops.map((l) => ({ ...l, vertices: transformVertices(l.vertices, true, m) })),
      origin: applyToPoint(m, e.origin),
      pattern: {
        ...e.pattern,
        angle: mirror ? -e.pattern.angle + rot : e.pattern.angle + rot,
        scale: e.pattern.scale * s,
        spacing: e.pattern.spacing,
      },
      associative: undefined,
    };
  },
  snapPoints: (e) => e.loops.flatMap((l) => polylineSnaps(l.vertices, true)),
  grips: (e) => {
    const b = curvesBBox(loopsCurves(e.loops));
    return [{ id: 'center', p: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, shape: 'circle' }];
  },
  moveGrip: (e, _g, to) => {
    const b = curvesBBox(loopsCurves(e.loops));
    const dx = to.x - (b.minX + b.maxX) / 2;
    const dy = to.y - (b.minY + b.maxY) / 2;
    return {
      ...e,
      origin: { x: e.origin.x + dx, y: e.origin.y + dy },
      loops: e.loops.map((l) => ({ ...l, vertices: l.vertices.map((v) => ({ ...v, x: v.x + dx, y: v.y + dy })) })),
      associative: undefined,
    };
  },
  filledHit: () => true,
  outline: (e) => hatchPolygons(e.loops, 'ignore')[0] ?? null,
  explode: (e) => {
    if (e.pattern.type === 'solid' || e.pattern.type === 'gradient') return null;
    const base = baseProps(e);
    return hatchSegments(e).segments.map(([a, b]) => ({ ...base, id: '', type: 'line', start: a, end: b }) as LineEntity);
  },
  area: (e) => loopsArea(e.loops),
};

export function registerHatchKind() {
  registerKind<'hatch'>(hatchKind);
}
