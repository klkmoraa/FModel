import type { CadDocument } from '../document/document';
import type { DimensionEntity, Entity, Id } from '../document/types';
import type { BBox } from '../geometry/bbox';
import type { Curve } from '../geometry/curves';
import { intersectCurves } from '../geometry/intersect';
import { linearTol } from '../geometry/tolerance';
import { cross, dist, len, sub } from '../geometry/vec';
import { buildDimension, DEFAULT_BREAK_SIZE, dimScaleFactor, effectiveDimStyle } from '../model/dimension';
import type { EvalContext } from '../model/registry';
import { kindOf } from '../model/registry';

/** Tipos que cortan cotas: geometría de trazo (no textos, rellenos ni imágenes). */
const BREAKERS = new Set<Entity['type']>(['line', 'arc', 'circle', 'ellipse', 'lwpolyline', 'polyline2d', 'spline', 'ray', 'xline', 'mline', 'leader', 'dimension', 'centermark']);

const overlaps = (a: BBox, b: BBox) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** Curvas de un objeto que corta; las cotas se miden sin sus propios cortes. */
function breakerCurves(e: Entity, ctx: EvalContext): Curve[] {
  if (e.type === 'dimension') return buildDimension({ ...e, breaks: undefined }, ctx).curves;
  return kindOf(e).curves(e, ctx);
}

/**
 * Puntos donde otros objetos del mismo espacio cruzan las líneas de cota y de extensión.
 * Los cortes manuales (con tamaño propio) se conservan.
 */
export function dimensionBreakPoints(dim: DimensionEntity, ctx: EvalContext, candidates: Iterable<Entity>): { p: { x: number; y: number }; size?: number }[] {
  const g = buildDimension({ ...dim, breaks: undefined }, ctx);
  const lines = g.curves.filter((c) => c.kind === 'line');
  const box = kindOf(dim).bbox({ ...dim, breaks: undefined }, ctx);
  const out: { p: { x: number; y: number }; size?: number }[] = (dim.breaks ?? []).filter((b) => b.size !== undefined);
  const tol = linearTol(Math.max(Math.abs(box.minX), Math.abs(box.maxX), Math.abs(box.minY), Math.abs(box.maxY))) * 100;
  const props = effectiveDimStyle(dim, ctx);
  const gap = (dim.breakSize ?? DEFAULT_BREAK_SIZE) * dimScaleFactor(props, ctx, dim.annotative);
  for (const other of candidates) {
    if (other.id === dim.id || other.owner !== dim.owner || !BREAKERS.has(other.type) || !other.visible) continue;
    if (!overlaps(kindOf(other).bbox(other, ctx), box)) continue;
    for (const c of breakerCurves(other, ctx)) {
      for (const line of lines) {
        const d = sub(line.b, line.a);
        const l = len(d);
        if (!(l > 0)) continue;
        const edge = Math.min(0.5, gap / 2 / l);
        for (const hit of intersectCurves(line, c)) {
          // solo cruces reales: ni toques en los extremos (puntas de flecha, orígenes) ni tramos colineales
          if (hit.t1 <= edge || hit.t1 >= 1 - edge) continue;
          if (c.kind === 'line' && Math.abs(cross(d, sub(c.b, c.a))) <= 1e-9 * l * len(sub(c.b, c.a))) continue;
          if (out.some((b) => dist(b.p, hit.p) <= tol)) continue;
          out.push({ p: hit.p });
        }
      }
    }
  }
  return out;
}

function sameBreaks(a: DimensionEntity['breaks'], b: DimensionEntity['breaks']): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  return x.every((br, i) => br.size === y[i].size && Math.abs(br.p.x - y[i].p.x) < 1e-9 && Math.abs(br.p.y - y[i].p.y) < 1e-9);
}

/**
 * Reactor de DIMBREAK automático: cuando cambia una cota con cortes automáticos o algo que
 * la cruza (antes o después del cambio), recalcula sus cortes en la misma transacción.
 */
export function installDimensionBreaks(doc: CadDocument, ctx: EvalContext): () => void {
  return doc.addReactor((tx, changes) => {
    const changed = changes.filter((c) => c.coll === 'entities');
    if (!changed.length) return;
    const autos: DimensionEntity[] = [];
    for (const e of doc.data.entities.values()) if (e.type === 'dimension' && e.breakAuto) autos.push(e);
    if (!autos.length) return;
    const boxes: { owner: Id; box: BBox }[] = [];
    for (const c of changed) {
      for (const state of [c.before, c.after] as (Entity | undefined)[]) {
        if (!state || !BREAKERS.has(state.type)) continue;
        try {
          boxes.push({ owner: state.owner, box: kindOf(state).bbox(state, ctx) });
        } catch {
          /* una entidad inconsistente no impide el resto */
        }
      }
    }
    const changedIds = new Set(changed.map((c) => c.id));
    for (const dim of autos) {
      const box = kindOf(dim).bbox({ ...dim, breaks: undefined }, ctx);
      const relevant = changedIds.has(dim.id) || boxes.some((b) => b.owner === dim.owner && overlaps(b.box, box));
      if (!relevant) continue;
      const breaks = dimensionBreakPoints(dim, ctx, doc.data.entities.values());
      const next = breaks.length ? breaks : undefined;
      if (!sameBreaks(dim.breaks, next)) tx.put('entities', { ...dim, breaks: next });
    }
  });
}
