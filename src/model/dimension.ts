import { normAngle, TAU } from '../geometry/angle';
import type { Curve } from '../geometry/curves';
import { intersectCurves } from '../geometry/intersect';
import type { Vec2 } from '../geometry/vec';
import { add, angleOf, cross, dist, dot, len, normalize, perp, polar, scale, sub } from '../geometry/vec';
import type { ArrowType, DimensionEntity, DimStyleProps } from '../document/types';
import type { DisplayItem, StyleOverride, TextItem } from './graphics';
import { PathBuilder } from './graphics';
import { formatDimValue } from './format';
import type { EvalContext } from './registry';
import { styleFont } from './kinds/text';

/** Longitud de corte por defecto de DIMBREAK, en unidades de papel (como AutoCAD, 3.75 mm). */
export const DEFAULT_BREAK_SIZE = 3.75;

export interface DimGeometry {
  items: DisplayItem[];
  curves: Curve[];
  measurement: number;
  text: string;
  textPosition: Vec2;
  textBox: Vec2[];
}

export function effectiveDimStyle(e: DimensionEntity, ctx: EvalContext): DimStyleProps {
  const base = ctx.doc.data.dimStyles.get(e.style) ?? [...ctx.doc.data.dimStyles.values()][0];
  return { ...(base as DimStyleProps), ...e.overrides };
}

/** Factor global de tamaño: DIMSCALE, o 1/escala de anotación si es anotativo. */
export function dimScaleFactor(props: DimStyleProps, ctx: EvalContext, annotative?: boolean): number {
  if (props.annotative || annotative) return 1 / (ctx.annotationScale || 1);
  return props.overallScale > 0 ? props.overallScale : 1;
}

/** Punta de flecha en `tip` apuntando en dirección `dir` (unitaria, hacia la punta). */
export function arrowItems(type: ArrowType, tip: Vec2, dir: Vec2, size: number, style: StyleOverride): DisplayItem[] {
  if (type === 'none' || size <= 0) return [];
  const n = perp(dir);
  const back = sub(tip, scale(dir, size));
  switch (type) {
    case 'closed-filled': {
      const a = add(back, scale(n, size / 6));
      const b = sub(back, scale(n, size / 6));
      return [{ k: 'path', cmds: new PathBuilder().polyline([tip, a, b], true).cmds, stroke: false, fill: 'nonzero', solid: true, style }];
    }
    case 'closed': {
      const a = add(back, scale(n, size / 6));
      const b = sub(back, scale(n, size / 6));
      return [{ k: 'path', cmds: new PathBuilder().polyline([tip, a, b], true).cmds, stroke: true, solid: true, style }];
    }
    case 'open':
    case 'open30': {
      const w = type === 'open30' ? Math.tan(Math.PI / 12) * size : size / 6;
      const a = add(back, scale(n, w));
      const b = sub(back, scale(n, w));
      return [{ k: 'path', cmds: new PathBuilder().polyline([a, tip, b]).cmds, stroke: true, solid: true, style }];
    }
    case 'dot':
    case 'dot-small': {
      const r = type === 'dot' ? size / 2 : size / 8;
      return [{ k: 'path', cmds: new PathBuilder().curve({ kind: 'arc', c: tip, r, a0: 0, sweep: TAU }).cmds, stroke: false, fill: 'nonzero', solid: true, style }];
    }
    case 'tick':
    case 'architectural': {
      const d = normalize(add(dir, n));
      const h = size / 2;
      return [{ k: 'path', cmds: new PathBuilder().polyline([sub(tip, scale(d, h)), add(tip, scale(d, h))]).cmds, stroke: true, solid: true, style, width: type === 'architectural' ? size / 10 : undefined }];
    }
    case 'integral': {
      const r = size / 2;
      return [
        {
          k: 'path',
          cmds: new PathBuilder()
            .curve({ kind: 'arc', c: add(tip, scale(n, r)), r, a0: angleOf(scale(n, -1)), sweep: Math.PI / 2 })
            .curve({ kind: 'arc', c: sub(tip, scale(n, r)), r, a0: angleOf(n), sweep: Math.PI / 2 }).cmds,
          stroke: true,
          solid: true,
          style,
        },
      ];
    }
  }
  return [];
}

function lineItem(a: Vec2, b: Vec2, style: StyleOverride): DisplayItem {
  return { k: 'path', cmds: new PathBuilder().polyline([a, b]).cmds, stroke: true, style };
}

/** Texto legible: rota 180° si quedaría de cabeza. */
function readableAngle(a: number): number {
  const n = normAngle(a);
  return n > Math.PI / 2 + 1e-9 && n <= (3 * Math.PI) / 2 + 1e-9 ? n - Math.PI : n;
}

interface TextSpec {
  text: string;
  tolUpper?: string;
  tolLower?: string;
  alt?: string;
}

function textItems(spec: TextSpec, center: Vec2, rotation: number, height: number, props: DimStyleProps, ctx: EvalContext, style: StyleOverride, gap: number): { items: TextItem[]; box: Vec2[] } {
  const f = styleFont(ctx, props.textStyle);
  const mainW = ctx.measureText(spec.text, f.font, height, f) * f.widthFactor;
  const tolH = height * (props.tolHeightFactor || 1);
  const tolW = spec.tolUpper ? Math.max(ctx.measureText(spec.tolUpper, f.font, tolH, f), ctx.measureText(spec.tolLower ?? '', f.font, tolH, f)) : 0;
  const altW = spec.alt ? ctx.measureText(spec.alt, f.font, height, f) + height * 0.3 : 0;
  const totalW = mainW + (tolW ? tolW + height * 0.25 : 0) + altW;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const at = (x: number, y: number): Vec2 => ({ x: center.x + x * c - y * s, y: center.y + x * s + y * c });
  const base = { k: 'text' as const, rotation, widthFactor: f.widthFactor, oblique: f.oblique, font: f.font, bold: f.bold, italic: f.italic, align: 'left' as const, baseline: 'alphabetic' as const, style };
  const items: TextItem[] = [];
  let x = -totalW / 2;
  const p0 = at(x, -height / 2);
  items.push({ ...base, text: spec.text, x: p0.x, y: p0.y, height, background: props.textFill === 'background' ? { color: 'Background', margin: gap } : undefined });
  x += mainW;
  if (spec.tolUpper) {
    x += height * 0.25;
    const pu = at(x, 0.1 * height);
    const pl = at(x, -height * 0.1 - tolH);
    items.push({ ...base, text: spec.tolUpper, x: pu.x, y: pu.y, height: tolH });
    items.push({ ...base, text: spec.tolLower ?? '', x: pl.x, y: pl.y, height: tolH });
    x += tolW;
  }
  if (spec.alt) {
    x += height * 0.3;
    const pa = at(x, -height / 2);
    items.push({ ...base, text: spec.alt, x: pa.x, y: pa.y, height });
  }
  const g = gap;
  const box = [at(-totalW / 2 - g, -height / 2 - g - 0.22 * height), at(totalW / 2 + g, -height / 2 - g - 0.22 * height), at(totalW / 2 + g, height / 2 + g), at(-totalW / 2 - g, height / 2 + g)];
  return { items, box };
}

function resolveText(e: DimensionEntity, formatted: ReturnType<typeof formatDimValue>): TextSpec {
  if (e.textOverride !== undefined && e.textOverride !== '' && e.textOverride !== '<>') {
    if (e.textOverride === ' ') return { text: '' };
    return { text: e.textOverride.replace('<>', formatted.main) };
  }
  return { text: formatted.main, tolUpper: formatted.tolUpper, tolLower: formatted.tolLower, alt: formatted.alt };
}

/** Genera la geometría completa de una cota. */
export function buildDimension(e: DimensionEntity, ctx: EvalContext): DimGeometry {
  const props = effectiveDimStyle(e, ctx);
  const S = dimScaleFactor(props, ctx, e.annotative);
  const arrow = props.arrowSize * S;
  const th = props.textHeight * S;
  const gap = props.textGap * S;
  const exo = props.extLineOffset * S;
  const exe = props.extLineExtension * S;
  const dimStyle: StyleOverride = { color: props.dimColor, lineweight: props.dimLineweight };
  const extStyle: StyleOverride = { color: props.extColor, lineweight: props.extLineweight };
  const txtStyle: StyleOverride = { color: props.textColor };
  const items: DisplayItem[] = [];
  const curves: Curve[] = [];
  const breakGap = (e.breakSize ?? DEFAULT_BREAK_SIZE) * S;
  const emit = (a: Vec2, b: Vec2, st: StyleOverride) => {
    if (dist(a, b) < 1e-12) return;
    items.push(lineItem(a, b, st));
    curves.push({ kind: 'line', a, b });
  };
  // DIMBREAK: se omiten los tramos alrededor de cada corte que cae sobre la línea
  const push = (a: Vec2, b: Vec2, st: StyleOverride) => {
    if (!e.breaks?.length) return emit(a, b, st);
    const d = sub(b, a);
    const l = len(d);
    if (l < 1e-12) return;
    const tol = Math.max(1e-9, l * 1e-9, breakGap * 1e-3);
    const cuts: [number, number][] = [];
    for (const br of e.breaks) {
      const q = sub(br.p, a);
      if (Math.abs(cross(d, q)) / l > tol) continue;
      const t = dot(q, d) / (l * l);
      const h = (br.size ?? breakGap) / 2 / l;
      if (t + h <= 0 || t - h >= 1) continue;
      cuts.push([t - h, t + h]);
    }
    if (!cuts.length) return emit(a, b, st);
    cuts.sort((x, y) => x[0] - y[0]);
    let from = 0;
    const at = (t: number) => add(a, scale(d, t));
    for (const [c0, c1] of cuts) {
      if (c0 > from) emit(at(from), at(Math.min(c0, 1)), st);
      from = Math.max(from, c1);
    }
    if (from < 1) emit(at(from), b, st);
  };

  switch (e.dimType) {
    case 'linear':
    case 'aligned': {
      const u = e.dimType === 'aligned' ? normalize(sub(e.p2, e.p1)) : { x: Math.cos(e.rotation), y: Math.sin(e.rotation) };
      if (len(u) < 1e-12) return empty(e);
      const d1 = add(e.p3, scale(u, dot(sub(e.p1, e.p3), u)));
      const d2 = add(e.p3, scale(u, dot(sub(e.p2, e.p3), u)));
      const measurement = Math.abs(dot(sub(e.p2, e.p1), u));
      // líneas de extensión
      for (const [p, d, suppress] of [
        [e.p1, d1, props.suppressExt1],
        [e.p2, d2, props.suppressExt2],
      ] as [Vec2, Vec2, boolean][]) {
        if (suppress) continue;
        let dir = sub(d, p);
        if (len(dir) < 1e-12) dir = perp(u);
        dir = normalize(dir);
        push(add(p, scale(dir, exo)), add(d, scale(dir, exe)), extStyle);
      }
      const formatted = formatDimValue(measurement, props, 'linear');
      const spec = resolveText(e, formatted);
      const f = styleFont(ctx, props.textStyle);
      const textW = ctx.measureText(spec.text, f.font, th, f) * f.widthFactor;
      const inside = measurement >= 2 * arrow + (props.fitTextInside ? 0 : textW + 2 * gap) - 1e-9;
      const dirA = normalize(sub(d1, d2));
      const dirB = scale(dirA, -1);
      // línea de cota
      const dimExt = props.dimLineExtension * S;
      const centeredGap = props.textVertical === 'centered' && !e.textPosition && measurement > textW + 2 * gap + 2 * arrow;
      if (inside && centeredGap) {
        const m0 = scale(add(d1, d2), 0.5);
        const half = textW / 2 + gap;
        push(add(d1, scale(dirA, dimExt)), add(m0, scale(dirA, half)), dimStyle);
        push(add(m0, scale(dirB, half)), add(d2, scale(dirB, dimExt)), dimStyle);
        items.push(...arrowItems(props.arrow1, d1, dirA, arrow, dimStyle));
        items.push(...arrowItems(props.arrow2, d2, dirB, arrow, dimStyle));
      } else if (inside) {
        push(add(d1, scale(dirA, dimExt)), add(d2, scale(dirB, dimExt)), dimStyle);
        items.push(...arrowItems(props.arrow1, d1, measurement > 1e-12 ? dirA : scale(u, -1), arrow, dimStyle));
        items.push(...arrowItems(props.arrow2, d2, measurement > 1e-12 ? dirB : u, arrow, dimStyle));
      } else {
        push(d1, d2, dimStyle);
        push(d1, add(d1, scale(dirA, arrow * 2)), dimStyle);
        push(d2, add(d2, scale(dirB, arrow * 2)), dimStyle);
        items.push(...arrowItems(props.arrow1, d1, dirB, arrow, dimStyle));
        items.push(...arrowItems(props.arrow2, d2, dirA, arrow, dimStyle));
      }
      const mid = scale(add(d1, d2), 0.5);
      const lineAngle = angleOf(u);
      const rot = props.textAlignment === 'horizontal' ? 0 : readableAngle(lineAngle);
      const nrm = perp({ x: Math.cos(rot), y: Math.sin(rot) });
      let tp = e.textPosition ?? (props.textVertical === 'centered' || props.textAlignment === 'horizontal' ? mid : add(mid, scale(nrm, gap + th / 2)));
      if (props.textVertical === 'below' && !e.textPosition) tp = sub(mid, scale(nrm, gap + th / 2));
      const t = textItems(spec, tp, rot, th, props, ctx, txtStyle, gap);
      items.push(...t.items);
      return { items, curves, measurement, text: spec.text, textPosition: tp, textBox: t.box };
    }

    case 'angular':
    case 'angular3p': {
      let center: Vec2;
      let dirs: Vec2[];
      if (e.dimType === 'angular') {
        const l1: Curve = { kind: 'line', a: e.p1, b: e.p2 };
        const l2: Curve = { kind: 'line', a: e.p3, b: e.p4 ?? e.p3 };
        const hits = intersectCurves(l1, l2, { extend1: true, extend2: true });
        if (!hits.length) return empty(e);
        center = hits[0].p;
        const u1 = normalize(sub(e.p2, e.p1));
        const u2 = normalize(sub(e.p4 ?? e.p3, e.p3));
        dirs = [u1, scale(u1, -1), u2, scale(u2, -1)];
      } else {
        center = e.center ?? e.p3;
        dirs = [normalize(sub(e.p1, center)), normalize(sub(e.p2, center))];
      }
      const arcPt = e.arcPoint ?? add(center, scale(add(dirs[0], dirs[dirs.length - 1]), 5));
      const radius = dist(center, arcPt);
      const target = angleOf(sub(arcPt, center));
      let a0 = 0;
      let sweep = 0;
      if (e.dimType === 'angular') {
        // elegir el par de semirrectas (una de cada línea) cuyo barrido CCW < π contiene el punto de arco
        let best: [number, number] | null = null;
        for (const da of [dirs[0], dirs[1]]) {
          for (const db of [dirs[2], dirs[3]]) {
            for (const [x, y] of [
              [da, db],
              [db, da],
            ] as [Vec2, Vec2][]) {
              const s0 = angleOf(x);
              const sw = normAngle(angleOf(y) - s0);
              if (sw <= Math.PI + 1e-9 && normAngle(target - s0) <= sw + 1e-9) best = [s0, sw];
            }
          }
        }
        if (!best) return empty(e);
        [a0, sweep] = best;
      } else {
        const s1 = angleOf(dirs[0]);
        const s2 = angleOf(dirs[1]);
        const sw = normAngle(s2 - s1);
        if (normAngle(target - s1) <= sw) {
          a0 = s1;
          sweep = sw;
        } else {
          a0 = s2;
          sweep = TAU - sw;
        }
      }
      const arc: Curve = { kind: 'arc', c: center, r: radius, a0, sweep };
      items.push({ k: 'path', cmds: new PathBuilder().curve(arc).cmds, stroke: true, style: dimStyle });
      curves.push(arc);
      const pA = polar(center, a0, radius);
      const pB = polar(center, a0 + sweep, radius);
      // líneas de extensión si el arco queda fuera de las entidades
      const extFrom = e.dimType === 'angular' ? [e.p1, e.p2, e.p3, e.p4 ?? e.p3] : [e.p1, e.p2];
      for (const [ang, _p] of [
        [a0, pA],
        [a0 + sweep, pB],
      ] as [number, Vec2][]) {
        const u = { x: Math.cos(ang), y: Math.sin(ang) };
        const along = extFrom.map((q) => dot(sub(q, center), u)).filter((t) => t > 0);
        const far = along.length ? Math.max(...along) : 0;
        if (far < radius - 1e-9) push(polar(center, ang, far + exo), polar(center, ang, radius + exe), extStyle);
      }
      const tipDirA = { x: -Math.sin(a0), y: Math.cos(a0) };
      const tipDirB = { x: Math.sin(a0 + sweep), y: -Math.cos(a0 + sweep) };
      const arcLen = radius * sweep;
      const inside = arcLen >= 2 * arrow;
      items.push(...arrowItems(props.arrow1, pA, inside ? scale(tipDirA, -1) : tipDirA, arrow, dimStyle));
      items.push(...arrowItems(props.arrow2, pB, inside ? scale(tipDirB, -1) : tipDirB, arrow, dimStyle));
      const measurement = sweep;
      const formatted = formatDimValue(measurement, props, 'angular');
      const spec = resolveText(e, formatted);
      const midA = a0 + sweep / 2;
      const rot = props.textAlignment === 'horizontal' ? 0 : readableAngle(midA - Math.PI / 2);
      const tp = e.textPosition ?? polar(center, midA, radius + (props.textVertical === 'centered' ? 0 : gap + th / 2));
      const t = textItems(spec, tp, rot, th, props, ctx, txtStyle, gap);
      items.push(...t.items);
      return { items, curves, measurement, text: spec.text, textPosition: tp, textBox: t.box };
    }

    case 'radial':
    case 'diametric': {
      const center = e.center ?? e.p2;
      const r = dist(center, e.p1);
      if (r < 1e-12) return empty(e);
      const loc = e.textPosition ?? e.p3;
      let dir = normalize(sub(loc, center));
      if (len(dir) < 1e-12) dir = normalize(sub(e.p1, center));
      const onArc = add(center, scale(dir, r));
      const opposite = sub(center, scale(dir, r));
      const outside = dist(loc, center) > r;
      const measurement = e.dimType === 'radial' ? r : 2 * r;
      const formatted = formatDimValue(measurement, props, 'linear', e.dimType === 'radial' ? 'R' : 'Ø');
      const spec = resolveText(e, formatted);
      const f = styleFont(ctx, props.textStyle);
      const textW = ctx.measureText(spec.text, f.font, th, f);
      const rot = props.textAlignment === 'horizontal' ? 0 : readableAngle(angleOf(dir));
      if (outside) {
        push(e.dimType === 'diametric' ? opposite : onArc, loc, dimStyle);
        items.push(...arrowItems(props.arrow1, onArc, scale(dir, -1), arrow, dimStyle));
        if (e.dimType === 'diametric') items.push(...arrowItems(props.arrow2, opposite, dir, arrow, dimStyle));
      } else {
        push(e.dimType === 'diametric' ? opposite : center, onArc, dimStyle);
        items.push(...arrowItems(props.arrow1, onArc, dir, arrow, dimStyle));
        if (e.dimType === 'diametric') items.push(...arrowItems(props.arrow2, opposite, scale(dir, -1), arrow, dimStyle));
      }
      if (props.centerMark !== 0) {
        const cm = Math.abs(props.centerMark) * S;
        push(add(center, { x: -cm, y: 0 }), add(center, { x: cm, y: 0 }), dimStyle);
        push(add(center, { x: 0, y: -cm }), add(center, { x: 0, y: cm }), dimStyle);
      }
      const nrm = perp({ x: Math.cos(rot), y: Math.sin(rot) });
      const along = { x: Math.cos(rot), y: Math.sin(rot) };
      const side = dot(dir, along) >= 0 ? 1 : -1;
      const tp = e.textPosition ? add(loc, scale(along, side * (textW / 2 + gap))) : add(add(loc, scale(along, side * (textW / 2 + gap))), scale(nrm, props.textVertical === 'centered' ? 0 : 0));
      const t = textItems(spec, tp, rot, th, props, ctx, txtStyle, gap);
      items.push(...t.items);
      return { items, curves, measurement, text: spec.text, textPosition: tp, textBox: t.box };
    }

    case 'arclength': {
      const center = e.center ?? e.p3;
      const r0 = e.radius ?? dist(center, e.p1);
      const a1 = angleOf(sub(e.p1, center));
      const a2 = angleOf(sub(e.p2, center));
      const sweep = normAngle(a2 - a1) || TAU;
      const arcPt = e.arcPoint ?? polar(center, a1 + sweep / 2, r0 * 1.2);
      const R = dist(center, arcPt);
      const arc: Curve = { kind: 'arc', c: center, r: R, a0: a1, sweep };
      items.push({ k: 'path', cmds: new PathBuilder().curve(arc).cmds, stroke: true, style: dimStyle });
      curves.push(arc);
      push(polar(center, a1, r0 + exo), polar(center, a1, R + exe), extStyle);
      push(polar(center, a2, r0 + exo), polar(center, a2, R + exe), extStyle);
      const pA = polar(center, a1, R);
      const pB = polar(center, a1 + sweep, R);
      items.push(...arrowItems(props.arrow1, pA, { x: Math.sin(a1), y: -Math.cos(a1) }, arrow, dimStyle));
      items.push(...arrowItems(props.arrow2, pB, { x: -Math.sin(a1 + sweep), y: Math.cos(a1 + sweep) }, arrow, dimStyle));
      const measurement = r0 * sweep;
      const formatted = formatDimValue(measurement, props, 'linear', '⌒');
      const spec = resolveText(e, formatted);
      const midA = a1 + sweep / 2;
      const rot = readableAngle(midA - Math.PI / 2);
      const tp = e.textPosition ?? polar(center, midA, R + gap + th / 2);
      const t = textItems(spec, tp, rot, th, props, ctx, txtStyle, gap);
      items.push(...t.items);
      return { items, curves, measurement, text: spec.text, textPosition: tp, textBox: t.box };
    }

    case 'ordinate': {
      const origin = e.origin ?? { x: 0, y: 0 };
      const axis = e.axis ?? (Math.abs(e.p2.x - e.p1.x) > Math.abs(e.p2.y - e.p1.y) ? 'y' : 'x');
      const measurement = axis === 'x' ? e.p1.x - origin.x : e.p1.y - origin.y;
      const formatted = formatDimValue(Math.abs(measurement) < 1e-12 ? 0 : measurement, props, 'linear');
      const spec = resolveText(e, formatted);
      const f = styleFont(ctx, props.textStyle);
      const textW = ctx.measureText(spec.text, f.font, th, f);
      // directriz: vertical para datum X, horizontal para datum Y, con quiebro
      const start = axis === 'x' ? add(e.p1, { x: 0, y: Math.sign(e.p2.y - e.p1.y || 1) * exo }) : add(e.p1, { x: Math.sign(e.p2.x - e.p1.x || 1) * exo, y: 0 });
      const jogA = axis === 'x' ? { x: e.p1.x, y: e.p1.y + (e.p2.y - e.p1.y) * 0.6 } : { x: e.p1.x + (e.p2.x - e.p1.x) * 0.6, y: e.p1.y };
      const jogB = axis === 'x' ? { x: e.p2.x, y: e.p1.y + (e.p2.y - e.p1.y) * 0.8 } : { x: e.p1.x + (e.p2.x - e.p1.x) * 0.8, y: e.p2.y };
      push(start, jogA, extStyle);
      push(jogA, jogB, extStyle);
      push(jogB, e.p2, extStyle);
      const rot = axis === 'x' ? Math.PI / 2 : 0;
      const dirEnd = normalize(sub(e.p2, jogB));
      const tp = e.textPosition ?? add(e.p2, scale(len(dirEnd) ? dirEnd : { x: 1, y: 0 }, textW / 2 + gap));
      const t = textItems(spec, tp, readableAngle(rot), th, props, ctx, txtStyle, gap);
      items.push(...t.items);
      return { items, curves, measurement, text: spec.text, textPosition: tp, textBox: t.box };
    }
  }
  return empty(e);
}

function empty(e: DimensionEntity): DimGeometry {
  return { items: [], curves: [], measurement: 0, text: '', textPosition: e.p3, textBox: [e.p3, e.p3, e.p3, e.p3] };
}

/** Valor medido de una cota sin generar gráficos (para campos, auditoría). */
export function dimensionMeasurement(e: DimensionEntity, ctx: EvalContext): number {
  return buildDimension(e, ctx).measurement;
}

export const crossSign = (a: Vec2, b: Vec2): number => Math.sign(cross(a, b));
