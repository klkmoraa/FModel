import { arcFrom3Points } from '../geometry/construct';
import { curvePoint } from '../geometry/curves';
import type { Mat2D } from '../geometry/matrix';
import { translation } from '../geometry/matrix';
import { pointInPolygon } from '../geometry/polyline';
import { splineThroughPoints } from '../geometry/spline';
import type { Vec2 } from '../geometry/vec';
import { add } from '../geometry/vec';
import type { Entity } from '../document/types';
import { arcOf } from './kinds/common';
import type { EvalContext } from './registry';
import { kindOf } from './registry';

export type Inside = (p: Vec2) => boolean;

export const insidePolygon = (poly: Vec2[]): Inside => (p) => pointInPolygon(p, poly);
export const insideBox =
  (b: { minX: number; minY: number; maxX: number; maxY: number }): Inside =>
  (p) =>
    p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/**
 * Estira una entidad: los puntos definidores dentro de la región se desplazan `d`.
 * Si todos están dentro, la entidad se traslada completa. Devuelve null si nada cambia.
 */
export function stretchEntity(e: Entity, inside: Inside, d: Vec2, ctx: EvalContext): Entity | null {
  const mv = (p: Vec2) => (inside(p) ? add(p, d) : p);
  const translate = (m: Mat2D = translation(d.x, d.y)) => kindOf(e).transform(e, m, ctx);
  switch (e.type) {
    case 'line': {
      const a = inside(e.start);
      const b = inside(e.end);
      if (!a && !b) return null;
      return { ...e, start: mv(e.start), end: mv(e.end) };
    }
    case 'lwpolyline':
    case 'polyline2d': {
      const flags = e.vertices.map((v) => inside(v));
      if (!flags.some(Boolean)) return null;
      if (flags.every(Boolean)) return translate();
      return { ...e, vertices: e.vertices.map((v, i) => (flags[i] ? { ...v, x: v.x + d.x, y: v.y + d.y } : v)), ...(e.type === 'lwpolyline' ? { shape: undefined } : {}) } as Entity;
    }
    case 'arc': {
      const c = arcOf(e);
      const s = curvePoint(c, 0);
      const m = curvePoint(c, 0.5);
      const en = curvePoint(c, 1);
      const fs = inside(s);
      const fe = inside(en);
      const fm = inside(m);
      if (!fs && !fe && !fm) return inside(e.center) ? translate() : null;
      if (fs && fe) return translate();
      const arc = arcFrom3Points(mv(s), fm ? add(m, d) : fs || fe ? add(m, { x: d.x / 2, y: d.y / 2 }) : m, mv(en));
      if (!arc) return null;
      const start = arc.sweep >= 0 ? arc.a0 : arc.a0 + arc.sweep;
      return { ...e, center: arc.c, radius: arc.r, startAngle: start, endAngle: start + Math.abs(arc.sweep) };
    }
    case 'spline': {
      const pts = e.spline.fit ?? e.spline.ctrl;
      const flags = pts.map((p) => inside(p));
      if (!flags.some(Boolean)) return null;
      if (flags.every(Boolean)) return translate();
      if (e.spline.fit) return { ...e, spline: { ...splineThroughPoints(pts.map(mv), e.spline.degree), closed: e.spline.closed } };
      return { ...e, spline: { ...e.spline, ctrl: e.spline.ctrl.map(mv) } };
    }
    case 'dimension': {
      const keys = ['p1', 'p2', 'p3', 'p4', 'center', 'arcPoint', 'textPosition', 'origin'] as const;
      let changed = false;
      const out = { ...e } as Record<string, unknown>;
      for (const k of keys) {
        const p = e[k];
        if (p && inside(p)) {
          out[k] = add(p, d);
          changed = true;
        }
      }
      if (!changed) return null;
      return { ...(out as unknown as Entity), assoc: undefined } as Entity;
    }
    case 'hatch':
    case 'region': {
      const flags = e.loops.flatMap((l) => l.vertices.map((v) => inside(v)));
      if (!flags.some(Boolean)) return null;
      if (flags.every(Boolean)) return translate();
      return { ...e, loops: e.loops.map((l) => ({ ...l, vertices: l.vertices.map((v) => (inside(v) ? { ...v, x: v.x + d.x, y: v.y + d.y } : v)) })) } as Entity;
    }
    case 'leader':
    case 'wipeout':
    case 'mline': {
      const flags = e.vertices.map((v) => inside(v));
      if (!flags.some(Boolean)) return null;
      return { ...e, vertices: e.vertices.map(mv) } as Entity;
    }
    case 'mleader': {
      const lf = inside(e.landing);
      const vf = e.leaders.some((l) => l.vertices.some(inside));
      if (!lf && !vf) return null;
      return { ...e, landing: mv(e.landing), leaders: e.leaders.map((l) => ({ vertices: l.vertices.map(mv) })) };
    }
    default: {
      // entidades con un punto de inserción/centro: se trasladan si ese punto está dentro
      const anchor = (e as { position?: Vec2; center?: Vec2; origin?: Vec2; basePoint?: Vec2 }).position ?? (e as { center?: Vec2 }).center ?? (e as { origin?: Vec2 }).origin ?? (e as { basePoint?: Vec2 }).basePoint;
      if (anchor && inside(anchor)) return translate();
      return null;
    }
  }
}
