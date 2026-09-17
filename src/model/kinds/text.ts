import { boxFromPoints } from '../../geometry/bbox';
import type { Mat2D } from '../../geometry/matrix';
import { applyToPoint, applyToVector, determinant } from '../../geometry/matrix';
import type { Vec2 } from '../../geometry/vec';
import { angleOf, dist, len } from '../../geometry/vec';
import type { AttdefEntity, Entity, MTextAttachment, MTextEntity, TextEntity, TextHAlign, TextVAlign } from '../../document/types';
import type { DisplayItem, TextItem } from '../graphics';
import { PathBuilder } from '../graphics';
import type { EntityKind, EvalContext } from '../registry';
import { registerKind } from '../registry';
import { layoutMText } from '../text';
import { baseProps, rectOutline } from './common';

export const DESCENT = 0.22;
/** Interlineado MTEXT: 5/3 de la altura por el factor. */
export const MTEXT_LINE_FACTOR = 5 / 3;

export function styleFont(ctx: EvalContext, styleId: string): { font: string; bold?: boolean; italic?: boolean; widthFactor: number; oblique: number } {
  const st = ctx.doc.data.textStyles.get(styleId);
  return { font: st?.font ?? 'Inter', bold: st?.bold, italic: st?.italic, widthFactor: st?.widthFactor ?? 1, oblique: st?.oblique ?? 0 };
}

interface TextFrame {
  /** origen de la línea base (izquierda) */
  origin: Vec2;
  rotation: number;
  height: number;
  widthFactor: number;
  width: number;
}

/** Calcula el marco real de un TEXT según su justificación. */
export function textFrame(e: { text: string; position: Vec2; alignPoint?: Vec2; height: number; rotation: number; widthFactor: number; style: string; halign: TextHAlign; valign: TextVAlign }, ctx: EvalContext): TextFrame {
  const f = styleFont(ctx, e.style);
  const text = ctx.resolveFields(e.text);
  let height = e.height;
  let rotation = e.rotation;
  let widthFactor = e.widthFactor;
  let natural = ctx.measureText(text, f.font, height, f) * widthFactor;
  if ((e.halign === 'aligned' || e.halign === 'fit') && e.alignPoint) {
    const d = dist(e.position, e.alignPoint);
    rotation = angleOf({ x: e.alignPoint.x - e.position.x, y: e.alignPoint.y - e.position.y });
    if (natural > 1e-12) {
      if (e.halign === 'aligned') {
        height = (height * d) / natural;
        natural = d;
      } else {
        widthFactor = (widthFactor * d) / natural;
        natural = d;
      }
    }
    return { origin: e.position, rotation, height, widthFactor, width: natural };
  }
  let dx = 0;
  if (e.halign === 'center' || e.halign === 'middle') dx = -natural / 2;
  else if (e.halign === 'right') dx = -natural;
  let dy = 0;
  const valign: TextVAlign = e.halign === 'middle' ? 'middle' : e.valign;
  if (valign === 'top') dy = -height;
  else if (valign === 'middle') dy = -height / 2;
  else if (valign === 'bottom') dy = DESCENT * height;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const origin = { x: e.position.x + dx * c - dy * s, y: e.position.y + dx * s + dy * c };
  return { origin, rotation, height, widthFactor, width: natural };
}

function textOutline(fr: TextFrame): Vec2[] {
  const c = Math.cos(fr.rotation);
  const s = Math.sin(fr.rotation);
  const d = DESCENT * fr.height;
  const o = { x: fr.origin.x + d * s, y: fr.origin.y - d * c };
  return rectOutline(o, Math.max(fr.width, fr.height * 0.2), fr.height + d, fr.rotation);
}

/** Transformación común de textos: altura, rotación y factor de anchura bajo afinidad. */
export function transformTextProps(m: Mat2D, position: Vec2, rotation: number, height: number, widthFactor: number) {
  const ux = applyToVector(m, { x: Math.cos(rotation), y: Math.sin(rotation) });
  const uy = applyToVector(m, { x: -Math.sin(rotation), y: Math.cos(rotation) });
  const sx = len(ux);
  const sy = len(uy);
  const mirror = determinant(m) < 0;
  let rot = Math.atan2(ux.y, ux.x);
  // MIRRTEXT = 0: el texto reflejado sigue siendo legible
  if (mirror) rot = Math.atan2(ux.y, ux.x);
  return {
    position: applyToPoint(m, position),
    rotation: rot,
    height: height * sy,
    widthFactor: sy > 1e-12 ? (widthFactor * sx) / sy : widthFactor,
  };
}

function textItemFrom(fr: TextFrame, text: string, font: ReturnType<typeof styleFont>, oblique: number): TextItem {
  return {
    k: 'text',
    text,
    x: fr.origin.x,
    y: fr.origin.y,
    height: fr.height,
    rotation: fr.rotation,
    widthFactor: fr.widthFactor,
    oblique,
    font: font.font,
    bold: font.bold,
    italic: font.italic,
    align: 'left',
    baseline: 'alphabetic',
  };
}

export const textKind: EntityKind<TextEntity> = {
  type: 'text',
  curves: () => [],
  bbox: (e, ctx) => boxFromPoints(textOutline(textFrame(e, ctx))),
  graphics: (e, ctx) => {
    const fr = textFrame(e, ctx);
    return [textItemFrom(fr, ctx.resolveFields(e.text, e), styleFont(ctx, e.style), e.oblique)];
  },
  transform: (e, m) => {
    const t = transformTextProps(m, e.position, e.rotation, e.height, e.widthFactor);
    return { ...e, ...t, alignPoint: e.alignPoint ? applyToPoint(m, e.alignPoint) : undefined };
  },
  snapPoints: (e) => [{ type: 'insertion', p: e.position }, ...(e.alignPoint ? [{ type: 'insertion' as const, p: e.alignPoint }] : [])],
  grips: (e) => [{ id: 'pos', p: e.position, shape: 'square' }, ...(e.alignPoint ? [{ id: 'align', p: e.alignPoint, shape: 'square' as const }] : [])],
  moveGrip: (e, g, to) => (g === 'align' ? { ...e, alignPoint: to } : { ...e, position: to }),
  outline: (e, ctx) => textOutline(textFrame(e, ctx)),
  filledHit: () => true,
};

// --------------------------------------------------------------------------- MTEXT

export interface MTextLayout {
  items: TextItem[];
  outline: Vec2[];
  width: number;
  height: number;
}

export function attachmentOffsets(att: MTextAttachment, w: number, h: number): { x: number; top: number } {
  const col = (att - 1) % 3; // 0 izq, 1 centro, 2 der
  const row = Math.floor((att - 1) / 3); // 0 sup, 1 medio, 2 inf
  return { x: col === 0 ? 0 : col === 1 ? -w / 2 : -w, top: row === 0 ? 0 : row === 1 ? h / 2 : h };
}

export function layoutMTextEntity(
  e: { contents: string; position: Vec2; width: number; height: number; rotation: number; style: string; attachment: MTextAttachment; lineSpacing: number },
  ctx: EvalContext,
  owner?: Entity,
): MTextLayout {
  const f = styleFont(ctx, e.style);
  const contents = ctx.resolveFields(e.contents, owner);
  const lines = layoutMText(contents, e.width, e.height, f.font, (t, font, h, o) => ctx.measureText(t, font, h, { bold: o?.bold ?? f.bold, italic: o?.italic ?? f.italic }) * f.widthFactor);
  const gap = e.height * MTEXT_LINE_FACTOR * (e.lineSpacing || 1);
  const n = Math.max(1, lines.length);
  const totalH = e.height + (n - 1) * gap;
  const maxW = Math.max(0, ...lines.map((l) => l.width));
  const boxW = e.width > 0 ? e.width : maxW;
  const off = attachmentOffsets(e.attachment, boxW, totalH);
  const c = Math.cos(e.rotation);
  const s = Math.sin(e.rotation);
  const toWorld = (x: number, y: number): Vec2 => ({ x: e.position.x + x * c - y * s, y: e.position.y + x * s + y * c });
  const col = (e.attachment - 1) % 3;
  const items: TextItem[] = [];
  lines.forEach((line, i) => {
    const baseY = off.top - e.height - i * gap;
    let x = off.x + (col === 0 ? 0 : col === 1 ? (boxW - line.width) / 2 : boxW - line.width);
    for (const run of line.runs) {
      const w = ctx.measureText(run.text, f.font, e.height, { bold: run.bold ?? f.bold, italic: run.italic ?? f.italic }) * f.widthFactor;
      const p = toWorld(x, baseY);
      items.push({
        k: 'text',
        text: run.text,
        x: p.x,
        y: p.y,
        height: e.height,
        rotation: e.rotation,
        widthFactor: f.widthFactor,
        oblique: f.oblique,
        font: f.font,
        bold: run.bold ?? f.bold,
        italic: run.italic ?? f.italic,
        align: 'left',
        baseline: 'alphabetic',
      });
      x += w;
    }
  });
  const d = DESCENT * e.height;
  const outline = [toWorld(off.x, off.top), toWorld(off.x + boxW, off.top), toWorld(off.x + boxW, off.top - totalH - d), toWorld(off.x, off.top - totalH - d)];
  return { items, outline, width: boxW, height: totalH };
}

export const mtextKind: EntityKind<MTextEntity> = {
  type: 'mtext',
  curves: () => [],
  bbox: (e, ctx) => boxFromPoints(layoutMTextEntity(e, ctx, e).outline),
  graphics: (e, ctx) => {
    const lay = layoutMTextEntity(e, ctx, e);
    const items: DisplayItem[] = [];
    if (e.background) {
      // factor de borde: 1.0 = ajustado al texto; se amplía el contorno desde su centro
      const f = Math.max(1, e.background.offset);
      const cx = lay.outline.reduce((s, p) => s + p.x, 0) / 4;
      const cy = lay.outline.reduce((s, p) => s + p.y, 0) / 4;
      const pts = lay.outline.map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f }));
      items.push({ k: 'wipeout', cmds: new PathBuilder().polyline(pts, true).cmds, frame: false });
    }
    return items.concat(lay.items);
  },
  transform: (e, m) => {
    const t = transformTextProps(m, e.position, e.rotation, e.height, 1);
    const sx = len(applyToVector(m, { x: Math.cos(e.rotation), y: Math.sin(e.rotation) }));
    return { ...e, position: t.position, rotation: t.rotation, height: t.height, width: e.width * sx };
  },
  snapPoints: (e) => [{ type: 'insertion', p: e.position }],
  grips: (e, ctx) => {
    const lay = layoutMTextEntity(e, ctx, e);
    const c = Math.cos(e.rotation);
    const s = Math.sin(e.rotation);
    const off = attachmentOffsets(e.attachment, lay.width, lay.height);
    const rightX = off.x + lay.width;
    const midY = off.top - lay.height / 2;
    return [
      { id: 'pos', p: e.position, shape: 'square' },
      { id: 'width', p: { x: e.position.x + rightX * c - midY * s, y: e.position.y + rightX * s + midY * c }, shape: 'arrow', dir: { x: c, y: s } },
    ];
  },
  moveGrip: (e, g, to, ctx) => {
    if (g === 'pos') return { ...e, position: to };
    const lay = layoutMTextEntity(e, ctx, e);
    const off = attachmentOffsets(e.attachment, lay.width, lay.height);
    const c = Math.cos(e.rotation);
    const s = Math.sin(e.rotation);
    const lx = (to.x - e.position.x) * c + (to.y - e.position.y) * s;
    return { ...e, width: Math.max(e.height, lx - off.x) };
  },
  outline: (e, ctx) => layoutMTextEntity(e, ctx, e).outline,
  filledHit: () => true,
  explode: (e, ctx) => {
    const base = baseProps(e);
    return layoutMTextEntity(e, ctx, e).items.map(
      (it) =>
        ({
          ...base,
          id: '',
          type: 'text',
          position: { x: it.x, y: it.y },
          text: it.text,
          height: it.height,
          rotation: it.rotation,
          widthFactor: it.widthFactor,
          oblique: it.oblique,
          style: e.style,
          halign: 'left',
          valign: 'baseline',
        }) as TextEntity,
    );
  },
};

export const attdefKind: EntityKind<AttdefEntity> = {
  type: 'attdef',
  curves: () => [],
  bbox: (e, ctx) => boxFromPoints(textOutline(textFrame({ ...e, text: e.tag, widthFactor: 1 }, ctx))),
  graphics: (e, ctx) => {
    const fr = textFrame({ ...e, text: e.tag, widthFactor: 1 }, ctx);
    return [textItemFrom(fr, e.tag, styleFont(ctx, e.style), 0)];
  },
  transform: (e, m) => {
    const t = transformTextProps(m, e.position, e.rotation, e.height, 1);
    return { ...e, position: t.position, rotation: t.rotation, height: t.height };
  },
  snapPoints: (e) => [{ type: 'insertion', p: e.position }],
  grips: (e) => [{ id: 'pos', p: e.position, shape: 'square' }],
  moveGrip: (e, _g, to) => ({ ...e, position: to }),
  outline: (e, ctx) => textOutline(textFrame({ ...e, text: e.tag, widthFactor: 1 }, ctx)),
  filledHit: () => true,
};

export function registerTextKinds() {
  registerKind<'text'>(textKind);
  registerKind<'mtext'>(mtextKind);
  registerKind<'attdef'>(attdefKind);
}
