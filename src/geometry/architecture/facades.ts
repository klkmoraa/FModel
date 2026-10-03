import { line, rect } from './primitives';
import { requireLayout } from './schema';
import type { ComponentKind, ComponentParameters, ComponentPrimitive } from './types';
function panes(p: ComponentParameters, curtain: boolean): ComponentPrimitive[] {
  const w = p.width as number, h = p.height as number, f = (curtain ? p.mullion : p.frame) as number, nx = p.columns as number, ny = p.rows as number;
  const pw = (w - (nx + 1) * f) / nx, ph = (h - (ny + 1) * f) / ny;
  requireLayout(pw > 0 && ph > 0 && nx * ny * (p.opening ? 3 : 1) + 1 <= 2000, undefined, undefined, ['width', 'height', curtain ? 'mullion' : 'frame', 'columns', 'rows']);
  const a = [rect('outline', 0, 0, w, h)];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = f + i * (pw + f), y = f + j * (ph + f);
    a.push(rect(`pane-${i}-${j}`, x, y, x + pw, y + ph));
    if (p.opening) a.push(line(`opening-${i}-${j}-0`, x, y, x + pw, y + ph / 2), line(`opening-${i}-${j}-1`, x + pw, y + ph / 2, x, y + ph));
  }
  return a;
}
export function facade(kind: ComponentKind, p: ComponentParameters): ComponentPrimitive[] {
  const w = p.width as number, h = p.height as number, f = p.frame as number, wall = p.wall as number, sill = p.sill as number;
  if (kind === 'windowelevation' || kind === 'curtainwall') return panes(p, kind === 'curtainwall');
  if (kind === 'doorelevation') {
    requireLayout(2 * f < w && f < h, undefined, undefined, ['frame', 'width', 'height']);
    const a = [rect('frame-outer', 0, 0, w, h), rect('frame-inner', f, 0, w - f, h - f)], n = p.variant === 'double' ? 2 : 1, leaf = (w - 2 * f) / n;
    for (let i = 0; i < n; i++) a.push(rect(`leaf-${i}`, f + i * leaf, 0, f + (i + 1) * leaf, h - f)); return a;
  }
  if (kind === 'doorsection') {
    const threshold = p.threshold as number; requireLayout(f < wall && f + threshold < h, undefined, undefined, ['frame', 'wall', 'threshold', 'height']);
    return [rect('frame', 0, h - f, wall, h), rect('leaf', (wall - f) / 2, threshold, (wall + f) / 2, h - f), rect('threshold', 0, 0, wall, threshold)];
  }
  if (kind === 'windowsection') {
    const projection = p.projection as number; requireLayout(2 * f < h && f < wall && f < sill, undefined, undefined, ['frame', 'height', 'wall', 'sill']);
    return [rect('wall-below', 0, 0, wall, sill - f), rect('sill', -projection, sill - f, wall + projection, sill), rect('frame-bottom', 0, sill, wall, sill + f), rect('frame-top', 0, sill + h - f, wall, sill + h), line('glazing', wall / 2, sill + f, wall / 2, sill + h - f)];
  }
  if (kind === 'baywindowsection') {
    const depth = p.depth as number, slab = p.slab as number; requireLayout(slab < sill && 2 * slab < h, undefined, undefined, ['slab', 'sill', 'height']);
    return [rect('wall-below', 0, 0, wall, sill - slab), rect('slab-bottom', 0, sill - slab, wall + depth, sill), rect('slab-top', 0, sill + h, wall + depth, sill + h + slab), line('glazing', wall + depth, sill, wall + depth, sill + h), line('return', wall, sill, wall, sill + h)];
  }
  if (kind === 'glasspartition') {
    const len = p.length as number, thick = p.thickness as number, n = Math.ceil(len / (p.panel as number)); requireLayout(n >= 1 && n <= 200, undefined, undefined, ['length', 'panel']);
    const a = [line('face-front', 0, 0, len, 0), line('face-back', 0, thick, len, thick), line('end-start', 0, 0, 0, thick), line('end-end', len, 0, len, thick)];
    for (let i = 1; i < n; i++) a.push(line(`joint-${i}`, i * len / n, 0, i * len / n, thick)); return a;
  }
  const len = p.length as number, thick = p.thickness as number, n = Math.ceil(len / (p.spacing as number)); requireLayout(n >= 1 && n < 200 && thick < len / n && thick < h, undefined, undefined, ['length', 'spacing', 'thickness', 'height']);
  const a = [rect('rail', 0, p.view === 'plan' ? 0 : h - thick, len, p.view === 'plan' ? thick : h)];
  for (let i = 0; i <= n; i++) { const x = Math.min(i * len / n, len - thick); a.push(rect(`post-${i}`, x, 0, x + thick, p.view === 'plan' ? thick : h - thick)); } return a;
}
