import { boxFromPoints, emptyBox, expandBox, expandPoint, isEmptyBox, transformBox } from '../../geometry/bbox';
import type { Curve } from '../../geometry/curves';
import { tessellateCurve } from '../../geometry/curves';
import { applyToPoint, uniformScale } from '../../geometry/matrix';
import { splineThroughPoints } from '../../geometry/spline';
import type { Vec2 } from '../../geometry/vec';
import { add, dist, normalize, sub } from '../../geometry/vec';
import type {
  DimensionEntity,
  Entity,
  HatchEntity,
  LeaderEntity,
  LineEntity,
  MLeaderEntity,
  MLeaderStyleProps,
  MTextEntity,
  TableEntity,
  TextEntity,
} from '../../document/types';
import { buildDimension, arrowItems, dimScaleFactor } from '../dimension';
import type { DisplayItem, StyleOverride } from '../graphics';
import { flattenPath, PathBuilder, pathBBox } from '../graphics';
import type { EntityKind, EvalContext, GripDef } from '../registry';
import { registerKind } from '../registry';
import { baseProps, transformAngle } from './common';
import { layoutMTextEntity } from './text';

function itemsBBox(items: DisplayItem[], extra: Vec2[] = []) {
  const b = emptyBox();
  for (const it of items) {
    if (it.k === 'path') expandBox(b, pathBBox(it.cmds));
    else if (it.k === 'text') expandPoint(b, { x: it.x, y: it.y });
  }
  for (const p of extra) expandPoint(b, p);
  return b;
}

/** Convierte una lista de visualización en entidades simples (EXPLODE de anotaciones). */
export function explodeItems(e: Entity, items: DisplayItem[], ctx: EvalContext): Entity[] {
  const base = baseProps(e);
  const out: Entity[] = [];
  for (const it of items) {
    const style = it.k === 'path' || it.k === 'text' ? it.style : undefined;
    const props = { ...base, id: '', color: style?.color && style.color !== 'ByBlock' ? style.color : base.color };
    if (it.k === 'path') {
      if (it.fill) {
        const loops = flattenPath(it.cmds).map((poly) => ({ vertices: poly.map((p) => ({ x: p.x, y: p.y, bulge: 0 })), closed: true as const }));
        out.push({ ...props, type: 'hatch', loops, pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal' } as HatchEntity);
      } else {
        for (const poly of flattenPath(it.cmds, 1e-3)) for (let i = 1; i < poly.length; i++) out.push({ ...props, type: 'line', start: poly[i - 1], end: poly[i] } as LineEntity);
      }
    } else if (it.k === 'text') {
      out.push({
        ...props,
        type: 'text',
        position: { x: it.x, y: it.y },
        text: it.text,
        height: it.height,
        rotation: it.rotation,
        widthFactor: it.widthFactor,
        oblique: it.oblique,
        style: ctx.doc.settings.currentTextStyle,
        halign: 'left',
        valign: 'baseline',
      } as TextEntity);
    }
  }
  return out;
}

// --------------------------------------------------------------------------- DIMENSION

const DIM_POINTS = ['p1', 'p2', 'p3', 'p4', 'center', 'arcPoint', 'origin', 'textPosition'] as const;

export const dimensionKind: EntityKind<DimensionEntity> = {
  type: 'dimension',
  curves: (e, ctx) => buildDimension(e, ctx).curves,
  bbox: (e, ctx) => {
    const g = buildDimension(e, ctx);
    return itemsBBox(g.items, [...g.textBox, e.p1, e.p2]);
  },
  graphics: (e, ctx) => buildDimension(e, ctx).items,
  transform: (e, m) => {
    const out: DimensionEntity = { ...e, rotation: transformAngle(m, e.rotation) };
    for (const k of DIM_POINTS) {
      const p = e[k];
      if (p) (out as unknown as Record<string, Vec2>)[k] = applyToPoint(m, p);
    }
    if (e.radius !== undefined) out.radius = e.radius * uniformScale(m);
    return out;
  },
  snapPoints: (e, ctx) => {
    const g = buildDimension(e, ctx);
    const pts = [
      { type: 'node' as const, p: e.p1 },
      { type: 'node' as const, p: e.p2 },
      { type: 'insertion' as const, p: g.textPosition },
    ];
    for (const c of g.curves) if (c.kind === 'line') pts.push({ type: 'node', p: c.a }, { type: 'node', p: c.b });
    return pts;
  },
  grips: (e, ctx) => {
    const g = buildDimension(e, ctx);
    const grips: GripDef[] = [];
    if (e.dimType === 'linear' || e.dimType === 'aligned') {
      grips.push({ id: 'p1', p: e.p1, shape: 'square' }, { id: 'p2', p: e.p2, shape: 'square' }, { id: 'p3', p: e.p3, shape: 'square' });
    } else if (e.dimType === 'radial' || e.dimType === 'diametric') {
      grips.push({ id: 'p1', p: e.p1, shape: 'square' });
    } else if (e.dimType === 'angular' || e.dimType === 'angular3p' || e.dimType === 'arclength') {
      if (e.arcPoint) grips.push({ id: 'arcPoint', p: e.arcPoint, shape: 'square' });
      grips.push({ id: 'p1', p: e.p1, shape: 'square' }, { id: 'p2', p: e.p2, shape: 'square' });
    } else if (e.dimType === 'ordinate') {
      grips.push({ id: 'p1', p: e.p1, shape: 'square' }, { id: 'p2', p: e.p2, shape: 'square' });
    }
    grips.push({ id: 'text', p: g.textPosition, shape: 'square' });
    return grips;
  },
  moveGrip: (e, g, to) => {
    if (g === 'text') {
      if (e.dimType === 'radial' || e.dimType === 'diametric') return { ...e, p3: to, textPosition: undefined };
      if (e.dimType === 'linear' || e.dimType === 'aligned') {
        // mover el texto arrastra la línea de cota
        return { ...e, p3: to, textPosition: undefined };
      }
      return { ...e, textPosition: to };
    }
    const assoc = e.assoc?.filter((a) => a.point !== g);
    return { ...e, [g]: to, assoc: assoc?.length ? assoc : undefined } as DimensionEntity;
  },
  outline: (e, ctx) => buildDimension(e, ctx).textBox,
  explode: (e, ctx) => explodeItems(e, buildDimension(e, ctx).items, ctx),
};

// --------------------------------------------------------------------------- LEADER

function leaderCurves(e: LeaderEntity): Curve[] {
  if (e.vertices.length < 2) return [];
  if (e.splined && e.vertices.length > 2) return [{ kind: 'spline', s: splineThroughPoints(e.vertices, 3) }];
  const out: Curve[] = [];
  for (let i = 1; i < e.vertices.length; i++) out.push({ kind: 'line', a: e.vertices[i - 1], b: e.vertices[i] });
  return out;
}

export const leaderKind: EntityKind<LeaderEntity> = {
  type: 'leader',
  curves: (e) => leaderCurves(e),
  bbox: (e) => boxFromPoints(e.vertices),
  graphics: (e, ctx) => {
    const cs = leaderCurves(e);
    const items: DisplayItem[] = [{ k: 'path', cmds: new PathBuilder().curves(cs).cmds, stroke: true }];
    const dimProps = ctx.doc.data.dimStyles.get(e.style);
    const size = (dimProps?.arrowSize ?? 2.5) * (dimProps ? dimScaleFactor(dimProps, ctx, e.annotative) : 1);
    if (e.vertices.length > 1) {
      const pts = cs.length ? tessellateCurve(cs[0], 1e-3) : e.vertices;
      const dir = normalize(sub(pts[0], pts[1] ?? e.vertices[1]));
      items.push(...arrowItems(e.arrow, e.vertices[0], dir, size, {}));
    }
    if (e.hookline && e.vertices.length > 1) {
      const last = e.vertices[e.vertices.length - 1];
      const prev = e.vertices[e.vertices.length - 2];
      const dx = Math.sign(last.x - prev.x) || 1;
      items.push({ k: 'path', cmds: new PathBuilder().polyline([last, add(last, { x: dx * size, y: 0 })]).cmds, stroke: true });
    }
    return items;
  },
  transform: (e, m) => ({ ...e, vertices: e.vertices.map((p) => applyToPoint(m, p)) }),
  snapPoints: (e) => e.vertices.map((p) => ({ type: 'endpoint' as const, p })),
  grips: (e) => e.vertices.map((p, i) => ({ id: `v:${i}`, p, shape: 'square' as const })),
  moveGrip: (e, g, to) => {
    const i = Number(g.split(':')[1]);
    return { ...e, vertices: e.vertices.map((p, j) => (j === i ? to : p)) };
  },
  explode: (e, ctx) => explodeItems(e, leaderKind.graphics(e, ctx), ctx),
};

// --------------------------------------------------------------------------- MLEADER

export function mleaderProps(e: MLeaderEntity, ctx: EvalContext): MLeaderStyleProps {
  const st = ctx.doc.data.mleaderStyles.get(e.style) ?? [...ctx.doc.data.mleaderStyles.values()][0];
  return { ...(st as MLeaderStyleProps), ...e.overrides };
}

export function mleaderScale(props: MLeaderStyleProps, ctx: EvalContext, annotative?: boolean): number {
  return props.annotative || annotative ? 1 / (ctx.annotationScale || 1) : props.overallScale || 1;
}

function mleaderContentFrame(e: MLeaderEntity, props: MLeaderStyleProps, S: number) {
  const dogEnd = props.landing ? add(e.landing, { x: e.direction * e.doglegLength, y: 0 }) : e.landing;
  const contentAnchor = add(dogEnd, { x: e.direction * props.landingGap * S, y: 0 });
  return { dogEnd, contentAnchor };
}

function mleaderBuild(e: MLeaderEntity, ctx: EvalContext): { items: DisplayItem[]; curves: Curve[]; outline: Vec2[] } {
  const props = mleaderProps(e, ctx);
  const S = mleaderScale(props, ctx, e.annotative);
  const leaderStyle: StyleOverride = { color: props.leaderColor, lineweight: props.leaderLineweight };
  const items: DisplayItem[] = [];
  const curves: Curve[] = [];
  const { dogEnd, contentAnchor } = mleaderContentFrame(e, props, S);
  for (const l of e.leaders) {
    const pts = [...l.vertices];
    if (!pts.length || dist(pts[pts.length - 1], e.landing) > 1e-9) pts.push(e.landing);
    if (pts.length < 2 || props.leaderType === 'none') continue;
    let cs: Curve[] = [];
    if (props.leaderType === 'spline' && pts.length > 2) cs = [{ kind: 'spline', s: splineThroughPoints(pts, 3) }];
    else for (let i = 1; i < pts.length; i++) cs.push({ kind: 'line', a: pts[i - 1], b: pts[i] });
    curves.push(...cs);
    items.push({ k: 'path', cmds: new PathBuilder().curves(cs).cmds, stroke: true, style: leaderStyle });
    const t = tessellateCurve(cs[0], 1e-3);
    const dir = normalize(sub(pts[0], t[1] ?? pts[1]));
    items.push(...arrowItems(props.arrow, pts[0], dir, props.arrowSize * S, leaderStyle));
  }
  if (props.landing && e.doglegLength > 0) {
    items.push({ k: 'path', cmds: new PathBuilder().polyline([e.landing, dogEnd]).cmds, stroke: true, style: leaderStyle });
    curves.push({ kind: 'line', a: e.landing, b: dogEnd });
  }
  let outline: Vec2[] = [contentAnchor, contentAnchor, contentAnchor, contentAnchor];
  if (e.content.type === 'mtext') {
    const lay = layoutMTextEntity(
      { contents: e.content.text, position: contentAnchor, width: e.content.width, height: e.content.height * (props.annotative || e.annotative ? S : 1), rotation: 0, style: props.textStyle, attachment: e.direction === 1 ? 4 : 6, lineSpacing: 1 },
      ctx,
      e,
    );
    for (const it of lay.items) it.style = { color: props.textColor };
    items.push(...lay.items);
    outline = lay.outline;
    if (e.content.frame || props.textFrame) items.push({ k: 'path', cmds: new PathBuilder().polyline(lay.outline, true).cmds, stroke: true, style: leaderStyle });
  } else if (e.content.type === 'block') {
    const blk = ctx.doc.data.blocks.get(e.content.blockId);
    if (blk) {
      const s = e.content.scale * S;
      items.push({ k: 'block', blockId: blk.id, variant: '', m: { a: s, b: 0, c: 0, d: s, e: contentAnchor.x - blk.basePoint.x * s, f: contentAnchor.y - blk.basePoint.y * s } });
    }
  }
  return { items, curves, outline };
}

export const mleaderKind: EntityKind<MLeaderEntity> = {
  type: 'mleader',
  curves: (e, ctx) => mleaderBuild(e, ctx).curves,
  bbox: (e, ctx) => {
    const b = mleaderBuild(e, ctx);
    const props = mleaderProps(e, ctx);
    const S = mleaderScale(props, ctx, e.annotative);
    const { dogEnd, contentAnchor } = mleaderContentFrame(e, props, S);
    const bounds = boxFromPoints([...b.outline, e.landing, dogEnd, ...e.leaders.flatMap((l) => l.vertices)]);
    if (e.content.type === 'block') {
      const block = ctx.doc.data.blocks.get(e.content.blockId);
      if (block) {
        const scale = e.content.scale * S;
        const matrix = {
          a: scale,
          b: 0,
          c: 0,
          d: scale,
          e: contentAnchor.x - block.basePoint.x * scale,
          f: contentAnchor.y - block.basePoint.y * scale,
        };
        const blockBounds = ctx.blockCache(block.id).bbox;
        if (!isEmptyBox(blockBounds)) expandBox(bounds, transformBox(blockBounds, matrix));
      }
    }
    return bounds;
  },
  graphics: (e, ctx) => mleaderBuild(e, ctx).items,
  transform: (e, m) => {
    const s = uniformScale(m);
    return {
      ...e,
      landing: applyToPoint(m, e.landing),
      leaders: e.leaders.map((l) => ({ vertices: l.vertices.map((p) => applyToPoint(m, p)) })),
      doglegLength: e.doglegLength * s,
      direction: applyToPoint(m, { x: e.direction, y: 0 }).x - applyToPoint(m, { x: 0, y: 0 }).x >= 0 ? 1 : -1,
    };
  },
  snapPoints: (e) => [...e.leaders.flatMap((l) => l.vertices.map((p) => ({ type: 'endpoint' as const, p }))), { type: 'endpoint', p: e.landing }],
  grips: (e, ctx) => {
    const props = mleaderProps(e, ctx);
    const S = mleaderScale(props, ctx, e.annotative);
    const { dogEnd } = mleaderContentFrame(e, props, S);
    const g: GripDef[] = [];
    e.leaders.forEach((l, i) => l.vertices.forEach((p, j) => g.push({ id: `lv:${i}:${j}`, p, shape: 'square' })));
    g.push({ id: 'landing', p: e.landing, shape: 'square' });
    g.push({ id: 'dogleg', p: dogEnd, shape: 'arrow', dir: { x: e.direction, y: 0 } });
    return g;
  },
  moveGrip: (e, g, to) => {
    if (g === 'landing') {
      const d = sub(to, e.landing);
      return { ...e, landing: to, leaders: e.leaders.map((l) => ({ vertices: l.vertices.map((p, j) => (j === l.vertices.length - 1 && l.vertices.length > 1 ? add(p, d) : p)) })) };
    }
    if (g === 'dogleg') {
      const dx = to.x - e.landing.x;
      return { ...e, direction: dx >= 0 ? 1 : -1, doglegLength: Math.abs(dx) };
    }
    const [, i, j] = g.split(':').map(Number);
    return { ...e, leaders: e.leaders.map((l, li) => (li === i ? { vertices: l.vertices.map((p, vj) => (vj === j ? to : p)) } : l)) };
  },
  outline: (e, ctx) => mleaderBuild(e, ctx).outline,
  explode: (e, ctx) => {
    const b = mleaderBuild(e, ctx);
    const out = explodeItems(e, b.items.filter((i) => i.k !== 'text'), ctx);
    if (e.content.type === 'mtext') {
      const props = mleaderProps(e, ctx);
      const S = mleaderScale(props, ctx, e.annotative);
      const { contentAnchor } = mleaderContentFrame(e, props, S);
      out.push({
        ...baseProps(e),
        id: '',
        type: 'mtext',
        position: contentAnchor,
        width: e.content.width,
        height: e.content.height,
        rotation: 0,
        style: props.textStyle,
        attachment: e.direction === 1 ? 4 : 6,
        lineSpacing: 1,
        contents: e.content.text,
      } as MTextEntity);
    }
    return out;
  },
};

// --------------------------------------------------------------------------- TABLE

export function tableGeometry(e: TableEntity, ctx: EvalContext) {
  const style = ctx.doc.data.tableStyles.get(e.style) ?? [...ctx.doc.data.tableStyles.values()][0];
  const c = Math.cos(e.rotation);
  const s = Math.sin(e.rotation);
  const W = e.columnWidths.reduce((a, b) => a + b, 0);
  const H = e.rowHeights.reduce((a, b) => a + b, 0);
  const at = (x: number, y: number): Vec2 => ({ x: e.position.x + x * c - y * s, y: e.position.y + x * s + y * c });
  const colX = [0];
  for (const w of e.columnWidths) colX.push(colX[colX.length - 1] + w);
  const rowY = [0];
  for (const h of e.rowHeights) rowY.push(rowY[rowY.length - 1] - h);
  return { style, W, H, at, colX, rowY };
}

export const tableKind: EntityKind<TableEntity> = {
  type: 'table',
  curves: (e, ctx) => {
    const { at, colX, rowY } = tableGeometry(e, ctx);
    const out: Curve[] = [];
    for (const y of rowY) out.push({ kind: 'line', a: at(0, y), b: at(colX[colX.length - 1], y) });
    for (const x of colX) out.push({ kind: 'line', a: at(x, 0), b: at(x, rowY[rowY.length - 1]) });
    return out;
  },
  bbox: (e, ctx) => {
    const { at, W, H } = tableGeometry(e, ctx);
    return boxFromPoints([at(0, 0), at(W, 0), at(W, -H), at(0, -H)]);
  },
  graphics: (e, ctx) => {
    const { style, at, colX, rowY } = tableGeometry(e, ctx);
    const gridStyle: StyleOverride = { color: style?.gridColor ?? 'ByBlock', lineweight: style?.gridLineweight ?? -2 };
    const items: DisplayItem[] = [];
    const rows = e.rowHeights.length;
    const cols = e.columnWidths.length;
    // rellenos
    for (let r = 0; r < rows; r++) {
      const rowKind = e.titleRow && r === 0 ? 'title' : e.headerRow && r === (e.titleRow ? 1 : 0) ? 'header' : 'data';
      for (let k = 0; k < cols; k++) {
        const cell = e.cells[r]?.[k];
        if (!cell || cell.merged) continue;
        const fill = cell.fill ?? style?.[rowKind].fill;
        if (fill) {
          const x1 = colX[Math.min(cols, k + (cell.colSpan ?? 1))];
          const y1 = rowY[Math.min(rows, r + (cell.rowSpan ?? 1))];
          items.push({ k: 'path', cmds: new PathBuilder().polyline([at(colX[k], rowY[r]), at(x1, rowY[r]), at(x1, y1), at(colX[k], y1)], true).cmds, stroke: false, fill: 'nonzero', solid: true, style: { fillColor: fill } });
        }
      }
    }
    // rejilla: segmentos horizontales y verticales omitiendo interiores de celdas combinadas
    const covered = (r: number, k: number): { r: number; k: number } | null => {
      for (let rr = 0; rr <= r; rr++) {
        for (let kk = 0; kk <= k; kk++) {
          const cell = e.cells[rr]?.[kk];
          if (!cell || cell.merged) continue;
          if (rr + (cell.rowSpan ?? 1) > r && kk + (cell.colSpan ?? 1) > k) return { r: rr, k: kk };
        }
      }
      return null;
    };
    const pb = new PathBuilder();
    for (let r = 0; r <= rows; r++) {
      for (let k = 0; k < cols; k++) {
        if (r > 0 && r < rows) {
          const a = covered(r - 1, k);
          const b = covered(r, k);
          if (a && b && a.r === b.r && a.k === b.k) continue;
        }
        pb.moveTo(at(colX[k], rowY[r])).lineTo(at(colX[k + 1], rowY[r]));
      }
    }
    for (let k = 0; k <= cols; k++) {
      for (let r = 0; r < rows; r++) {
        if (k > 0 && k < cols) {
          const a = covered(r, k - 1);
          const b = covered(r, k);
          if (a && b && a.r === b.r && a.k === b.k) continue;
        }
        pb.moveTo(at(colX[k], rowY[r])).lineTo(at(colX[k], rowY[r + 1]));
      }
    }
    items.push({ k: 'path', cmds: pb.cmds, stroke: true, style: gridStyle });
    // textos
    const margin = style?.cellMargin ?? 1.5;
    for (let r = 0; r < rows; r++) {
      const rowKind = e.titleRow && r === 0 ? 'title' : e.headerRow && r === (e.titleRow ? 1 : 0) ? 'header' : 'data';
      for (let k = 0; k < cols; k++) {
        const cell = e.cells[r]?.[k];
        if (!cell || cell.merged || !cell.text) continue;
        const x0 = colX[k];
        const x1 = colX[Math.min(cols, k + (cell.colSpan ?? 1))];
        const y0 = rowY[r];
        const y1 = rowY[Math.min(rows, r + (cell.rowSpan ?? 1))];
        const att = cell.align ?? style?.[rowKind].align ?? 5;
        const col = (att - 1) % 3;
        const row = Math.floor((att - 1) / 3);
        const lx = col === 0 ? x0 + margin : col === 1 ? (x0 + x1) / 2 : x1 - margin;
        const ly = row === 0 ? y0 - margin : row === 1 ? (y0 + y1) / 2 : y1 + margin;
        const lay = layoutMTextEntity(
          { contents: cell.text, position: at(lx, ly), width: Math.max(0, x1 - x0 - 2 * margin), height: cell.textHeight ?? style?.[rowKind].textHeight ?? 2.5, rotation: e.rotation, style: style?.textStyle ?? ctx.doc.settings.currentTextStyle, attachment: att, lineSpacing: 1 },
          ctx,
          e,
        );
        if (cell.color) for (const it of lay.items) it.style = { color: cell.color };
        items.push(...lay.items);
      }
    }
    return items;
  },
  transform: (e, m) => {
    const s = uniformScale(m);
    return {
      ...e,
      position: applyToPoint(m, e.position),
      rotation: transformAngle(m, e.rotation),
      rowHeights: e.rowHeights.map((h) => h * s),
      columnWidths: e.columnWidths.map((w) => w * s),
    };
  },
  snapPoints: (e, ctx) => {
    const { at, colX, rowY } = tableGeometry(e, ctx);
    const pts = [];
    for (const x of colX) for (const y of rowY) pts.push({ type: 'endpoint' as const, p: at(x, y) });
    return pts;
  },
  grips: (e, ctx) => {
    const { at, colX, rowY, W } = tableGeometry(e, ctx);
    const g: GripDef[] = [{ id: 'pos', p: e.position, shape: 'square' }];
    colX.slice(1).forEach((x, i) => g.push({ id: `col:${i}`, p: at(x, 0), shape: 'arrow', dir: { x: Math.cos(e.rotation), y: Math.sin(e.rotation) } }));
    rowY.slice(1).forEach((y, i) => g.push({ id: `row:${i}`, p: at(W, y), shape: 'arrow', dir: { x: Math.sin(e.rotation), y: -Math.cos(e.rotation) } }));
    return g;
  },
  moveGrip: (e, g, to, ctx) => {
    if (g === 'pos') return { ...e, position: to };
    const { colX, rowY } = tableGeometry(e, ctx);
    const c = Math.cos(e.rotation);
    const s = Math.sin(e.rotation);
    const lx = (to.x - e.position.x) * c + (to.y - e.position.y) * s;
    const ly = -(to.x - e.position.x) * s + (to.y - e.position.y) * c;
    const [kind, idx] = g.split(':');
    const i = Number(idx);
    if (kind === 'col') {
      const w = Math.max(1e-3, lx - colX[i]);
      return { ...e, columnWidths: e.columnWidths.map((cw, j) => (j === i ? w : cw)) };
    }
    const h = Math.max(1e-3, rowY[i] - ly);
    return { ...e, rowHeights: e.rowHeights.map((rh, j) => (j === i ? h : rh)) };
  },
  outline: (e, ctx) => {
    const { at, W, H } = tableGeometry(e, ctx);
    return [at(0, 0), at(W, 0), at(W, -H), at(0, -H)];
  },
  filledHit: () => true,
  explode: (e, ctx) => explodeItems(e, tableKind.graphics(e, ctx), ctx),
};

export function registerAnnotationKinds() {
  registerKind<'dimension'>(dimensionKind);
  registerKind<'leader'>(leaderKind);
  registerKind<'mleader'>(mleaderKind);
  registerKind<'table'>(tableKind);
}
