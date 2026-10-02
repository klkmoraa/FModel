import { line, point, poly, rect } from './primitives';
import { requireLayout } from './schema';
import type { ComponentParameters, ComponentPrimitive } from './types';
export function stairplan(p: ComponentParameters): ComponentPrimitive[] {
  const w = p.width as number, t = p.tread as number, n = p.steps as number, l = p.landing as number, r = p.innerRadius as number, turn = p.turn as number, a: ComponentPrimitive[] = [];
  if (p.variant === 'curved') {
    // Native concentric arcs with radial tread marks. Tread is retained for other variants.
    a.push({ key: 'inner', type: 'arc', center: point(0, 0), radius: r, startAngle: 0, endAngle: turn }, { key: 'outer', type: 'arc', center: point(0, 0), radius: r + w, startAngle: 0, endAngle: turn });
    for (let i = 0; i < n; i++) { const angle = i * turn / n; a.push(line(`tread-${i}`, r * Math.cos(angle), r * Math.sin(angle), (r + w) * Math.cos(angle), (r + w) * Math.sin(angle))); }
    a.push(line('end', r * Math.cos(turn), r * Math.sin(turn), (r + w) * Math.cos(turn), (r + w) * Math.sin(turn)));
  } else if (p.variant === 'straight') {
    a.push(rect('outline', 0, 0, w, n * t));
    for (let i = 0; i < n; i++) a.push(line(`tread-${i}`, 0, i * t, w, i * t));
  } else {
    requireLayout(l >= w, 'El descanso debe admitir el ancho de escalera.', 'The landing must fit the stair width.', ['landing', 'width']);
    const first = Math.ceil(n / 2), second = n - first, run = first * t;
    a.push(rect('flight-0', 0, 0, w, run));
    for (let i = 0; i < first; i++) a.push(line(`tread-${i}`, 0, i * t, w, i * t));
    if (p.variant === 'l') {
      a.push(rect('landing', 0, run, l, run + w), rect('flight-1', l, run, l + second * t, run + w));
      for (let i = 0; i < second; i++) a.push(line(`tread-${i + first}`, l + i * t, run, l + i * t, run + w));
    } else {
      a.push(rect('landing', 0, run, 2 * w + l, run + l), rect('flight-1', w + l, run - second * t, 2 * w + l, run));
      for (let i = 0; i < second; i++) a.push(line(`tread-${i + first}`, w + l, run - i * t, 2 * w + l, run - i * t));
    }
  }
  return a;
}
export function stairsection(p: ComponentParameters): ComponentPrimitive[] {
  const t = p.tread as number, r = p.rise as number, n = p.steps as number, slab = p.slab as number;
  requireLayout(slab < n * r && slab < n * t, undefined, undefined, ['slab', 'steps', 'rise', 'tread']);
  const a: ComponentPrimitive[] = [];
  for (let i = 0; i < n; i++) a.push(line(`riser-${i}`, i * t, i * r, i * t, (i + 1) * r), line(`tread-${i}`, i * t, (i + 1) * r, (i + 1) * t, (i + 1) * r));
  a.push(line('slab', 0, -slab, n * t, n * r - slab), line('slab-start', 0, 0, 0, -slab), line('slab-end', n * t, n * r, n * t, n * r - slab)); return a;
}
export function escalator(p: ComponentParameters): ComponentPrimitive[] {
  const w = p.width as number, h = p.height as number, l = p.platform as number, span = h / Math.tan(p.angle as number);
  if (p.view === 'elevation') return [line('platform-start', 0, 0, l, 0), line('run', l, 0, l + span, h), line('platform-end', l + span, h, 2 * l + span, h), line('handrail', l, w / 2, l + span, h + w / 2)];
  return [rect('outline', 0, 0, span + 2 * l, w), line('run', l, w / 2, l + span, w / 2), line('platform-start', l, 0, l, w), line('platform-end', l + span, 0, l + span, w)];
}
export function liftplan(p: ComponentParameters): ComponentPrimitive[] {
  const w = p.width as number, d = p.depth as number, cw = p.cabinWidth as number, cd = p.cabinDepth as number, door = p.door as number, wall = p.wall as number;
  requireLayout(cw + 2 * wall < w && cd + 2 * wall < d && door < cw && door < w - 2 * wall, undefined, undefined, ['width', 'depth', 'cabinWidth', 'cabinDepth', 'door', 'wall']);
  const x = (w - cw) / 2, y = (d - cd) / 2, left = (w - door) / 2, right = (w + door) / 2;
  return [poly('shaft', [[right, 0], [w, 0], [w, d], [0, d], [0, 0], [left, 0]], false), poly('wall-inner', [[right, wall], [w - wall, wall], [w - wall, d - wall], [wall, d - wall], [wall, wall], [left, wall]], false), poly('cabin', [[right, y], [x + cw, y], [x + cw, y + cd], [x, y + cd], [x, y], [left, y]], false), line('jamb-left', left, 0, left, wall), line('jamb-right', right, 0, right, wall)];
}
