import type { ArcCurve, Curve } from '../../geometry/curves';
import { distanceToCurve } from '../../geometry/curves';
import type { Vec2 } from '../../geometry/vec';
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
    const d = c.kind === 'line' || c.kind === 'arc' || c.kind === 'ray' || c.kind === 'xline' ? distanceToCurve(c, p) : Infinity;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
