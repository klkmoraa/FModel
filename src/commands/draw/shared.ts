import type { ArcCurve, Curve } from '../../geometry/curves';
import { curvePoint } from '../../geometry/curves';
import type { Vec2 } from '../../geometry/vec';
import { dist } from '../../geometry/vec';
import type { ArcEntity, Id } from '../../document/types';
import { kindOf } from '../../model/registry';
import { make } from '../helpers';
import type { CommandApi } from '../types';

export function arcEntityFrom(api: CommandApi, a: ArcCurve): ArcEntity {
  const start = a.sweep >= 0 ? a.a0 : a.a0 + a.sweep;
  return make<ArcEntity>(api, { type: 'arc', center: a.c, radius: a.r, startAngle: start, endAngle: start + Math.abs(a.sweep) });
}

export function nearestCurve(api: CommandApi, id: Id, p: Vec2): Curve | null {
  const e = api.editor.doc.entity(id);
  if (!e) return null;
  let best: Curve | null = null;
  let bd = Infinity;
  for (const c of kindOf(e).curves(e, api.editor.ctx)) {
    const t = c.kind === 'line' ? Math.min(1, Math.max(0, ((p.x - c.a.x) * (c.b.x - c.a.x) + (p.y - c.a.y) * (c.b.y - c.a.y)) / Math.max(1e-30, (c.b.x - c.a.x) ** 2 + (c.b.y - c.a.y) ** 2))) : 0;
    const d = c.kind === 'line' ? dist(curvePoint(c, t), p) : c.kind === 'arc' ? Math.abs(dist(c.c, p) - c.r) : Infinity;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
