import { TAU } from '../../geometry/angle';
import { boxFromPoints, emptyBox, expandBox, isEmptyBox, transformBox } from '../../geometry/bbox';
import type { Curve } from '../../geometry/curves';
import { curveLength, curvePoint, curveTangent, paramAtLength, transformCurve } from '../../geometry/curves';
import type { Mat2D } from '../../geometry/matrix';
import { applyToPoint, applyToVector, compose, determinant, IDENTITY, insertMatrix, multiply, rotation, translation } from '../../geometry/matrix';
import { polylineSegments } from '../../geometry/polyline';
import type { Vec2 } from '../../geometry/vec';
import { angleOf, len } from '../../geometry/vec';
import type { ArrayEntity, AttdefEntity, BlockRecord, Entity, InsertEntity, TextEntity } from '../../document/types';
import type { DisplayItem } from '../graphics';
import type { EntityKind, EvalContext, GripDef, SnapPointDef } from '../registry';
import { kindOf, registerKind } from '../registry';
import { baseProps } from './common';
import { styleFont, textFrame } from './text';

export function blockOf(ctx: EvalContext, id: string): BlockRecord | undefined {
  return ctx.doc.data.blocks.get(id);
}

export function insertMatrixOf(e: InsertEntity, block: BlockRecord | undefined): Mat2D {
  return insertMatrix(e.position, e.scale.x, e.scale.y, e.rotation, block?.basePoint ?? { x: 0, y: 0 });
}

/** Matrices de cada copia de un MINSERT (o una sola). */
export function insertMatrices(e: InsertEntity, block: BlockRecord | undefined): Mat2D[] {
  const base = insertMatrixOf(e, block);
  if (!e.grid || (e.grid.columns <= 1 && e.grid.rows <= 1)) return [base];
  const out: Mat2D[] = [];
  const u = { x: Math.cos(e.rotation), y: Math.sin(e.rotation) };
  const vv = { x: -u.y, y: u.x };
  for (let r = 0; r < e.grid.rows; r++) {
    for (let c = 0; c < e.grid.columns; c++) {
      const dx = u.x * c * e.grid.columnSpacing + vv.x * r * e.grid.rowSpacing;
      const dy = u.y * c * e.grid.columnSpacing + vv.y * r * e.grid.rowSpacing;
      out.push(multiply(translation(dx, dy), base));
    }
  }
  return out;
}

/** Descompone una matriz afín en posición, rotación y escalas (null si hay cizalla). */
export function decomposeInsert(m: Mat2D): { position: Vec2; rotation: number; sx: number; sy: number } | null {
  const a1 = { x: m.a, y: m.b };
  const a2 = { x: m.c, y: m.d };
  const sx = len(a1);
  if (sx < 1e-15) return null;
  const rot = angleOf(a1);
  const det = determinant(m);
  const sy = det / sx;
  const shear = (a1.x * a2.x + a1.y * a2.y) / (sx * (len(a2) || 1));
  if (Math.abs(shear) > 1e-6) return null;
  return { position: { x: m.e, y: m.f }, rotation: rot, sx, sy };
}

interface AttrRender {
  tag: string;
  text: string;
  position: Vec2;
  height: number;
  rotation: number;
  def: AttdefEntity;
}

export function insertAttributes(e: InsertEntity, ctx: EvalContext): AttrRender[] {
  const block = blockOf(ctx, e.blockId);
  if (!block) return [];
  const cache = ctx.blockCache(e.blockId, e.dynamic);
  const m = insertMatrixOf(e, block);
  const out: AttrRender[] = [];
  const sy = Math.abs(len(applyToVector(m, { x: 0, y: 1 })));
  const rotOffset = angleOf(applyToVector(m, { x: 1, y: 0 }));
  for (const d of cache.attdefs as AttdefEntity[]) {
    const val = e.attributes.find((a) => a.tag.toUpperCase() === d.tag.toUpperCase());
    const invisible = val?.invisible ?? d.invisible;
    if (invisible) continue;
    out.push({
      tag: d.tag,
      text: val?.value ?? d.defaultValue,
      position: val?.position ?? applyToPoint(m, d.position),
      height: val?.height ?? d.height * sy,
      rotation: val?.rotation ?? d.rotation + rotOffset,
      def: d,
    });
  }
  return out;
}

function attributeItems(e: InsertEntity, ctx: EvalContext): DisplayItem[] {
  return insertAttributes(e, ctx).map((a) => {
    const fr = textFrame({ text: a.text, position: a.position, height: a.height, rotation: a.rotation, widthFactor: 1, style: a.def.style, halign: a.def.halign, valign: a.def.valign }, ctx);
    const f = styleFont(ctx, a.def.style);
    return {
      k: 'text',
      text: ctx.resolveFields(a.text, e),
      x: fr.origin.x,
      y: fr.origin.y,
      height: fr.height,
      rotation: fr.rotation,
      widthFactor: fr.widthFactor,
      oblique: 0,
      font: f.font,
      bold: f.bold,
      italic: f.italic,
      align: 'left',
      baseline: 'alphabetic',
      style: a.def.color !== 'ByBlock' ? { color: a.def.color } : undefined,
    } as DisplayItem;
  });
}

export function variantKey(e: { dynamic?: InsertEntity['dynamic'] }): string {
  return e.dynamic ? JSON.stringify(e.dynamic) : '';
}

/** Explota entidades de bloque aplicando la matriz y resolviendo PorBloque/capa 0. */
export function explodeBlockEntities(host: Entity, entities: Entity[], m: Mat2D, ctx: EvalContext): Entity[] {
  const out: Entity[] = [];
  for (const be of entities) {
    if (be.type === 'attdef') continue;
    const t = kindOf(be).transform(be, m, ctx);
    if (!t) continue;
    out.push({
      ...t,
      id: '',
      owner: host.owner,
      layer: be.layer === 'layer-0' ? host.layer : be.layer,
      color: be.color === 'ByBlock' ? host.color : be.color,
      linetype: be.linetype === 'ByBlock' ? host.linetype : be.linetype,
      lineweight: be.lineweight === -2 ? host.lineweight : be.lineweight,
      transparency: be.transparency === 'ByBlock' ? host.transparency : be.transparency,
    } as Entity);
  }
  return out;
}

export const insertKind: EntityKind<InsertEntity> = {
  type: 'insert',
  curves: (e, ctx) => {
    const block = blockOf(ctx, e.blockId);
    if (!block || ctx.depth > 16) return [];
    const cache = ctx.blockCache(e.blockId, e.dynamic);
    const out: Curve[] = [];
    for (const m of insertMatrices(e, block)) for (const c of cache.curves) out.push(transformCurve(c, m));
    return out;
  },
  bbox: (e, ctx) => {
    const block = blockOf(ctx, e.blockId);
    const b = emptyBox();
    if (block) {
      const cache = ctx.blockCache(e.blockId, e.dynamic);
      for (const m of insertMatrices(e, block)) if (!isEmptyBox(cache.bbox)) expandBox(b, transformBox(cache.bbox, m));
    }
    for (const a of insertAttributes(e, ctx)) expandBox(b, boxFromPoints([a.position]));
    if (isEmptyBox(b)) return boxFromPoints([e.position]);
    return b;
  },
  graphics: (e, ctx) => {
    const block = blockOf(ctx, e.blockId);
    if (!block) return [];
    const variant = variantKey(e);
    const items: DisplayItem[] = insertMatrices(e, block).map((m) => ({ k: 'block', blockId: e.blockId, variant, m }));
    return items.concat(attributeItems(e, ctx));
  },
  transform: (e, m, ctx) => {
    const block = blockOf(ctx, e.blockId);
    const M = multiply(m, insertMatrix(e.position, e.scale.x, e.scale.y, e.rotation));
    const d = decomposeInsert(M);
    if (!d) return null;
    void block;
    const sy = Math.abs(len(applyToVector(m, { x: 0, y: 1 })));
    return {
      ...e,
      position: d.position,
      rotation: d.rotation,
      scale: { x: d.sx, y: d.sy },
      attributes: e.attributes.map((a) => ({
        ...a,
        position: a.position ? applyToPoint(m, a.position) : undefined,
        height: a.height !== undefined ? a.height * sy : undefined,
        rotation: a.rotation !== undefined ? angleOf(applyToVector(m, { x: Math.cos(a.rotation), y: Math.sin(a.rotation) })) : undefined,
      })),
    };
  },
  snapPoints: (e, ctx) => {
    const pts: SnapPointDef[] = [{ type: 'insertion', p: e.position }];
    const block = blockOf(ctx, e.blockId);
    if (!block) return pts;
    const cache = ctx.blockCache(e.blockId, e.dynamic);
    const m = insertMatrixOf(e, block);
    for (const s of cache.snaps) pts.push({ type: s.type, p: applyToPoint(m, s.p) });
    for (const a of insertAttributes(e, ctx)) pts.push({ type: 'insertion', p: a.position });
    return pts;
  },
  grips: (e, ctx) => {
    const g: GripDef[] = [{ id: 'ins', p: e.position, shape: 'square' }];
    for (const a of insertAttributes(e, ctx)) if (!a.def.lockPosition) g.push({ id: `att:${a.tag}`, p: a.position, shape: 'square' });
    if (ctx.dynamicGrips) g.push(...ctx.dynamicGrips(e));
    return g;
  },
  moveGrip: (e, g, to, ctx) => {
    if (g === 'ins') {
      const dx = to.x - e.position.x;
      const dy = to.y - e.position.y;
      return { ...e, position: to, attributes: e.attributes.map((a) => (a.position ? { ...a, position: { x: a.position.x + dx, y: a.position.y + dy } } : a)) };
    }
    if (g.startsWith('att:')) {
      const tag = g.slice(4);
      const existing = e.attributes.find((a) => a.tag === tag);
      const attrs = existing ? e.attributes.map((a) => (a.tag === tag ? { ...a, position: to } : a)) : [...e.attributes, { tag, value: insertAttributes(e, ctx).find((a) => a.tag === tag)?.text ?? '', position: to }];
      return { ...e, attributes: attrs };
    }
    if (g.startsWith('dyn:') && ctx.moveDynamicGrip) return ctx.moveDynamicGrip(e, g, to) as InsertEntity | null;
    return null;
  },
  explode: (e, ctx) => {
    const block = blockOf(ctx, e.blockId);
    if (!block || !block.explodable) return null;
    const ev = ctx.evaluateBlock(e.blockId, e.dynamic);
    const out: Entity[] = [];
    for (const m of insertMatrices(e, block)) out.push(...explodeBlockEntities(e, ev.entities, m, ctx));
    const base = baseProps(e);
    for (const a of insertAttributes(e, ctx)) {
      out.push({
        ...base,
        id: '',
        type: 'text',
        position: a.position,
        text: a.text,
        height: a.height,
        rotation: a.rotation,
        widthFactor: 1,
        oblique: 0,
        style: a.def.style,
        halign: a.def.halign,
        valign: a.def.valign,
      } as TextEntity);
    }
    return out;
  },
};

// --------------------------------------------------------------------------- ARRAY

export function arrayTransforms(e: ArrayEntity): Mat2D[] {
  const p = e.params;
  const out: Mat2D[] = [];
  if (p.kind === 'rect') {
    const u = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
    const v = { x: -u.y, y: u.x };
    for (let r = 0; r < Math.max(1, p.rows); r++)
      for (let c = 0; c < Math.max(1, p.columns); c++) out.push(translation(u.x * c * p.columnSpacing + v.x * r * p.rowSpacing, u.y * c * p.columnSpacing + v.y * r * p.rowSpacing));
  } else if (p.kind === 'polar') {
    const full = Math.abs(Math.abs(p.fillAngle) - TAU) < 1e-9;
    const n = Math.max(1, p.count);
    const step = n > 1 ? p.fillAngle / (full ? n : n - 1) : 0;
    for (let r = 0; r < Math.max(1, p.rows); r++) {
      for (let i = 0; i < n; i++) {
        const ang = step * i;
        const radial = { x: e.basePoint.x - p.center.x, y: e.basePoint.y - p.center.y };
        const rl = len(radial) || 1;
        const rowOff = { x: (radial.x / rl) * r * p.rowSpacing, y: (radial.y / rl) * r * p.rowSpacing };
        if (p.rotateItems) out.push(compose(translation(rowOff.x, rowOff.y), rotation(ang, p.center)));
        else {
          const moved = applyToPoint(rotation(ang, p.center), { x: e.basePoint.x + rowOff.x, y: e.basePoint.y + rowOff.y });
          out.push(translation(moved.x - e.basePoint.x, moved.y - e.basePoint.y));
        }
      }
    }
  } else {
    const segs = polylineSegments(p.path.vertices, p.path.closed);
    const total = segs.reduce((s, c) => s + curveLength(c), 0);
    const n = Math.max(1, p.count);
    const spacing = p.method === 'divide' ? (n > 1 ? total / (p.path.closed ? n : n - 1) : 0) : p.spacing;
    const start = segs.length ? curvePoint(segs[0], 0) : e.basePoint;
    const t0 = segs.length ? curveTangent(segs[0], 0) : { x: 1, y: 0 };
    for (let i = 0; i < n; i++) {
      const s = i * spacing;
      if (s > total + 1e-9) break;
      let acc = 0;
      let pt = start;
      let tan = t0;
      for (const c of segs) {
        const l = curveLength(c);
        if (acc + l >= s - 1e-12) {
          const t = paramAtLength(c, s - acc);
          pt = curvePoint(c, t);
          tan = curveTangent(c, t);
          break;
        }
        acc += l;
      }
      const moveToStart = translation(start.x - e.basePoint.x, start.y - e.basePoint.y);
      const rot = p.alignItems ? rotation(angleOf(tan) - angleOf(t0), start) : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      out.push(compose(moveToStart, rot, translation(pt.x - start.x, pt.y - start.y)));
    }
  }
  return out;
}

/** Matrices finales de cada elemento: transformación del elemento ∘ matriz de la fuente. */
export function arrayItemMatrices(e: ArrayEntity): Mat2D[] {
  const src = e.sourceMatrix ?? IDENTITY;
  return arrayTransforms(e).map((t) => multiply(t, src));
}

export const arrayKind: EntityKind<ArrayEntity> = {
  type: 'array',
  curves: (e, ctx) => {
    const cache = ctx.blockCache(e.sourceBlockId);
    return arrayItemMatrices(e).flatMap((m) => cache.curves.map((c) => transformCurve(c, m)));
  },
  bbox: (e, ctx) => {
    const cache = ctx.blockCache(e.sourceBlockId);
    const b = emptyBox();
    for (const m of arrayItemMatrices(e)) if (!isEmptyBox(cache.bbox)) expandBox(b, transformBox(cache.bbox, m));
    return isEmptyBox(b) ? boxFromPoints([e.basePoint]) : b;
  },
  graphics: (e) => arrayItemMatrices(e).map((m) => ({ k: 'block', blockId: e.sourceBlockId, variant: '', m })),
  transform: (e, m) => {
    const p = e.params;
    const lin = { ...m, e: 0, f: 0 };
    const mirror = determinant(m) < 0;
    let params = p;
    if (p.kind === 'rect') {
      const u = applyToVector(lin, { x: Math.cos(p.angle), y: Math.sin(p.angle) });
      const s = len(u);
      params = { ...p, angle: angleOf(u), columnSpacing: p.columnSpacing * s, rowSpacing: p.rowSpacing * s * (mirror ? -1 : 1) };
    } else if (p.kind === 'polar') {
      params = { ...p, center: applyToPoint(m, p.center), fillAngle: mirror ? -p.fillAngle : p.fillAngle };
    } else {
      params = {
        ...p,
        spacing: p.spacing * len(applyToVector(lin, { x: 1, y: 0 })),
        path: { ...p.path, vertices: p.path.vertices.map((v) => ({ ...v, ...applyToPoint(m, v), bulge: mirror ? -(v.bulge ?? 0) : v.bulge })) },
      };
    }
    return { ...e, basePoint: applyToPoint(m, e.basePoint), params, sourceMatrix: multiply(m, e.sourceMatrix ?? IDENTITY) };
  },
  snapPoints: (e) => [{ type: 'insertion', p: e.basePoint }],
  grips: (e) => {
    const g: GripDef[] = [{ id: 'base', p: e.basePoint, shape: 'square' }];
    const p = e.params;
    if (p.kind === 'rect') {
      const u = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
      const v = { x: -u.y, y: u.x };
      if (p.columns > 1) g.push({ id: 'colspacing', p: { x: e.basePoint.x + u.x * p.columnSpacing, y: e.basePoint.y + u.y * p.columnSpacing }, shape: 'square' });
      if (p.rows > 1) g.push({ id: 'rowspacing', p: { x: e.basePoint.x + v.x * p.rowSpacing, y: e.basePoint.y + v.y * p.rowSpacing }, shape: 'square' });
      g.push({ id: 'colcount', p: { x: e.basePoint.x + u.x * p.columnSpacing * Math.max(1, p.columns - 1), y: e.basePoint.y + u.y * p.columnSpacing * Math.max(1, p.columns - 1) }, shape: 'triangle', dir: u });
      g.push({ id: 'rowcount', p: { x: e.basePoint.x + v.x * p.rowSpacing * Math.max(1, p.rows - 1), y: e.basePoint.y + v.y * p.rowSpacing * Math.max(1, p.rows - 1) }, shape: 'triangle', dir: v });
    } else if (p.kind === 'polar') {
      g.push({ id: 'center', p: p.center, shape: 'square' });
    }
    return g;
  },
  moveGrip: (e, g, to, ctx) => {
    const p = e.params;
    if (g === 'base') return arrayKind.transform(e, translation(to.x - e.basePoint.x, to.y - e.basePoint.y), ctx);
    if (p.kind === 'polar' && g === 'center') return { ...e, params: { ...p, center: to } };
    if (p.kind !== 'rect') return null;
    const u = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
    const v = { x: -u.y, y: u.x };
    const du = (to.x - e.basePoint.x) * u.x + (to.y - e.basePoint.y) * u.y;
    const dv = (to.x - e.basePoint.x) * v.x + (to.y - e.basePoint.y) * v.y;
    if (g === 'colspacing') return { ...e, params: { ...p, columnSpacing: du } };
    if (g === 'rowspacing') return { ...e, params: { ...p, rowSpacing: dv } };
    if (g === 'colcount') return { ...e, params: { ...p, columns: Math.max(1, Math.round(du / (p.columnSpacing || 1)) + 1) } };
    if (g === 'rowcount') return { ...e, params: { ...p, rows: Math.max(1, Math.round(dv / (p.rowSpacing || 1)) + 1) } };
    return null;
  },
  explode: (e, ctx) => {
    const ev = ctx.evaluateBlock(e.sourceBlockId);
    return arrayItemMatrices(e).flatMap((m) => explodeBlockEntities(e, ev.entities, m, ctx));
  },
};

export function registerInsertKinds() {
  registerKind<'insert'>(insertKind);
  registerKind<'array'>(arrayKind);
}
