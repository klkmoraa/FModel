import { ACTION_TYPE_LABEL, paramsWithoutAction } from '../blocks/authoring';
import { buildScope, evaluateDynamic } from '../blocks/dynamic';
import { refPoint, refSegment } from '../constraints/solver';
import { evaluate } from '../lib/expr';
import type { Vec2 } from '../geometry/vec';
import { add, angleOf, dist, len, mid, normalize, perp, scale, sub } from '../geometry/vec';
import type { BlockConstraint, BlockRecord, DimConstraint, DynParam, Entity, GeoConstraintType, Id } from '../document/types';
import type { FreedomState } from '../constraints/solver';
import type { Editor } from '../editor/editor';
import type { RenderTheme } from './theme';

/**
 * Representación de autoría en el Editor de bloques: cada parámetro con su geometría,
 * nombre y valor; marcos de estiramiento; y una insignia ⚠ si el parámetro no tiene acción.
 * Se dibuja en píxeles CSS sobre el overlay (no forma parte del bloque ni se traza).
 */
export function drawAuthoringOverlay(g: CanvasRenderingContext2D, editor: Editor, theme: RenderTheme) {
  const s = editor.blockEdit;
  if (!s || s.testing || editor.space !== s.blockId) return;
  const def = editor.doc.data.blocks.get(s.blockId)?.dynamic;
  if (!def) return;
  const lang = editor.lang;
  const toS = (p: Vec2) => editor.ownerToScreen(p);
  const paramColor = theme.accent;
  const warnColor = theme.dark ? '#f3c553' : '#d9720a';
  const frameColor = theme.dark ? 'rgba(169,144,255,0.55)' : 'rgba(118,87,213,0.5)';
  const noAction = new Set(paramsWithoutAction(def).map((p) => p.id));
  const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

  g.save();
  g.lineWidth = 1;

  // marcos de estiramiento
  g.strokeStyle = frameColor;
  g.setLineDash([6, 4]);
  for (const a of def.actions) {
    if ((a.type !== 'stretch' && a.type !== 'polarstretch') || a.frame.length < 3) continue;
    g.beginPath();
    a.frame.forEach((p, i) => {
      const q = toS(p);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.closePath();
    g.stroke();
  }

  const label = (text: string, at: Vec2, warn: boolean, sub?: string) => {
    g.setLineDash([]);
    g.font = '600 11px "IBM Plex Mono", ui-monospace, monospace';
    const w = g.measureText(text).width + 10 + (warn ? 16 : 0);
    const x = Math.round(at.x - w / 2);
    const y = Math.round(at.y - 22);
    g.fillStyle = theme.tooltipBg;
    g.strokeStyle = warn ? warnColor : paramColor;
    g.beginPath();
    const rr = (g as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
    if (typeof rr === 'function') rr.call(g, x, y, w, 18, 5);
    else g.rect(x, y, w, 18);
    g.fill();
    g.stroke();
    g.fillStyle = theme.tooltipInk;
    g.textBaseline = 'middle';
    g.fillText(text, x + 5, y + 9.5);
    if (warn) {
      const cx = x + w - 10;
      g.fillStyle = warnColor;
      g.beginPath();
      g.moveTo(cx, y + 3);
      g.lineTo(cx + 6, y + 15);
      g.lineTo(cx - 6, y + 15);
      g.closePath();
      g.fill();
      g.fillStyle = theme.dark ? '#0e1113' : '#ffffff';
      g.font = '700 9px "IBM Plex Mono", monospace';
      g.fillText('!', cx - 1.5, y + 11);
    }
    if (sub) {
      g.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      g.fillStyle = paramColor;
      const sw = g.measureText(sub).width;
      g.fillText(sub, Math.round(at.x - sw / 2), y + 28);
    }
  };

  const tick = (p: Vec2, dir: Vec2) => {
    const n = scale(perp(normalize(dir)), 5);
    g.moveTo(p.x - n.x, p.y - n.y);
    g.lineTo(p.x + n.x, p.y + n.y);
  };

  const gripSquare = (p: Vec2) => g.rect(Math.round(p.x - 3) + 0.5, Math.round(p.y - 3) + 0.5, 6, 6);

  for (const p of def.parameters) {
    const warn = noAction.has(p.id);
    const acts = def.actions.filter((a) => a.paramId === p.id).map((a) => ACTION_TYPE_LABEL[a.type][lang]);
    const subText = acts.length ? acts.join(' · ') : undefined;
    g.strokeStyle = warn ? warnColor : paramColor;
    g.fillStyle = warn ? warnColor : paramColor;
    g.setLineDash(p.type === 'flip' || p.type === 'alignment' ? [2, 3] : [5, 3]);
    const anchor = drawParam(g, p, toS, tick, gripSquare);
    label(`${p.label || p.name}${valueText(p, fmt)}`, anchor, warn, subText);
  }
  g.restore();
  drawConstraints(g, editor, theme);
}

const GLYPH: Record<GeoConstraintType, string> = {
  horizontal: 'H',
  vertical: 'V',
  parallel: '∥',
  perpendicular: '⊥',
  coincident: '•',
  tangent: 'T',
  concentric: '◎',
  equal: '=',
  symmetric: '[ ]',
  fixed: 'F',
  collinear: '⋯',
};

/** Conflictos de la definición con sus valores por defecto, cacheados por versión de bloques. */
let conflictCache: { key: string; ids: Set<Id> } | null = null;
function conflictsOf(editor: Editor, block: BlockRecord): Set<Id> {
  const key = `${block.id}|${block.revision}|${editor.ctx.blocksVersion}|${editor.doc.version}`;
  if (conflictCache?.key === key) return conflictCache.ids;
  let ids = new Set<Id>();
  try {
    ids = new Set(evaluateDynamic(editor.ctx, block, editor.doc.entitiesOf(block.id), undefined).conflicts);
  } catch {
    /* la validación del panel informa del error */
  }
  conflictCache = { key, ids };
  return ids;
}

/** Datos para dibujar las marcas de un conjunto de restricciones. */
export interface ConstraintMarkers {
  constraints: readonly BlockConstraint[];
  conflicts: ReadonlySet<Id>;
  entity: (id: Id) => Entity | undefined;
  toScreen: (p: Vec2) => Vec2;
  /** valor evaluado de una cota (grados en las angulares), o null si su fórmula falla */
  value: (c: DimConstraint) => number | null;
  /** estado de libertad por entidad: las marcas de objetos aún libres van discontinuas */
  freedom?: ReadonlyMap<Id, FreedomState> | null;
  /** tamaño del lienzo para descartar marcas fuera de pantalla */
  viewport?: { width: number; height: number };
}

/**
 * Glifos de restricciones geométricas junto a cada objeto referenciado y cotas de las
 * restricciones dimensionales con su nombre y valor; en conflicto, en color de aviso.
 */
function drawConstraints(g: CanvasRenderingContext2D, editor: Editor, theme: RenderTheme) {
  const s = editor.blockEdit;
  if (!s || s.testing || editor.space !== s.blockId) return;
  const block = editor.doc.data.blocks.get(s.blockId);
  const def = block?.dynamic;
  if (!block || !def?.constraints.length) return;
  let scope: Record<string, number> = {};
  try {
    scope = buildScope(def, undefined);
  } catch {
    scope = {};
  }
  drawConstraintMarkers(g, theme, {
    constraints: def.constraints,
    conflicts: conflictsOf(editor, block),
    entity: (id) => editor.doc.entity(id),
    toScreen: (p) => editor.ownerToScreen(p),
    value: (c) => {
      try {
        return evaluate(c.expression, scope);
      } catch {
        return null;
      }
    },
  });
}

export function drawConstraintMarkers(g: CanvasRenderingContext2D, theme: RenderTheme, m: ConstraintMarkers) {
  const toS = m.toScreen;
  const warn = theme.dark ? '#f3c553' : '#d9720a';
  const ink = theme.dark ? '#63c5ff' : '#0f95d1';
  const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
  const margin = 60;
  const visible = (p: Vec2) => !m.viewport || (p.x > -margin && p.y > -margin && p.x < m.viewport.width + margin && p.y < m.viewport.height + margin);
  const loose = (c: BlockConstraint) => !!m.freedom && c.refs.some((r) => m.freedom!.get(r.entityId) === 'partial');

  const badge = (text: string, at: Vec2, color: string, alpha: number, dashed: boolean) => {
    if (!visible(at)) return;
    g.globalAlpha = alpha;
    g.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    const w = Math.max(14, g.measureText(text).width + 8);
    const x = Math.round(at.x - w / 2);
    const y = Math.round(at.y - 8);
    g.fillStyle = theme.tooltipBg;
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.setLineDash(dashed ? [2, 2] : []);
    g.beginPath();
    const rr = (g as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
    if (typeof rr === 'function') rr.call(g, x, y, w, 16, 4);
    else g.rect(x, y, w, 16);
    g.fill();
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(text, at.x, y + 8.5);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  };

  /** Anclaje en pantalla de una referencia: punto medio del tramo desplazado, o el punto. */
  const anchorOf = (entityId: Id, part: string, offset: number): Vec2 | null => {
    const e = m.entity(entityId);
    if (!e) return null;
    const seg = refSegment(e, part === 'edge' ? 'segment:0' : part);
    if (seg && (part === 'edge' || part.startsWith('segment:'))) {
      const a = toS(seg[0]);
      const b = toS(seg[1]);
      const n = normalize(perp(sub(b, a)));
      return add(mid(a, b), scale(len(n) ? n : { x: 0, y: -1 }, offset));
    }
    if (part === 'edge' && (e.type === 'circle' || e.type === 'arc')) {
      const a = e.type === 'arc' ? (e.startAngle + e.endAngle) / 2 + (e.endAngle < e.startAngle ? Math.PI : 0) : Math.PI / 4;
      return add(toS({ x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) }), { x: offset * 0.7, y: -offset * 0.7 });
    }
    const p = refPoint(e, part === 'edge' ? 'center' : part) ?? refPoint(e, 'start') ?? refPoint(e, 'point');
    return p ? add(toS(p), { x: offset * 0.7, y: -offset * 0.7 }) : null;
  };

  g.save();
  m.constraints.forEach((c, index) => {
    const conflict = m.conflicts.has(c.id);
    const color = conflict ? warn : ink;
    const dashed = loose(c);
    if (c.kind === 'geometric') {
      const alpha = c.enabled ? 1 : 0.4;
      c.refs.forEach((r, i) => {
        const at = anchorOf(r.entityId, r.part, 14 + i * 2);
        if (at) badge(`${GLYPH[c.type]}${c.refs.length > 1 ? String(index + 1) : ''}`, at, color, alpha, dashed);
      });
      return;
    }
    const value = m.value(c);
    const numeric = /^\s*-?\d+(\.\d+)?\s*$/.test(c.expression);
    const text = `${c.type === 'radius' ? 'R ' : c.type === 'diameter' ? 'Ø ' : ''}${c.name} = ${numeric || value === null ? c.expression : `${c.expression} (${fmt(value)})`}${c.type === 'angular' ? '°' : ''}`;
    const [r0, r1] = c.refs;
    const e0 = r0 ? m.entity(r0.entityId) : undefined;
    const e1 = r1 ? m.entity(r1.entityId) : undefined;
    if ((c.type === 'radius' || c.type === 'diameter') && e0 && (e0.type === 'circle' || e0.type === 'arc')) {
      const center = toS(e0.center);
      const edge = toS({ x: e0.center.x + e0.radius * Math.SQRT1_2, y: e0.center.y + e0.radius * Math.SQRT1_2 });
      g.strokeStyle = color;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(center.x, center.y);
      g.lineTo(edge.x, edge.y);
      g.stroke();
      g.setLineDash([]);
      badge(text, add(edge, { x: 18, y: -10 }), color, 1, dashed);
      return;
    }
    if (c.type === 'angular' && e0) {
      const at = anchorOf(r0.entityId, r0.part, 22);
      if (at) badge(text, at, color, 1, dashed);
      return;
    }
    let p0: Vec2 | null = null;
    let p1: Vec2 | null = null;
    if (e0 && e1) {
      p0 = refPoint(e0, r0.part);
      p1 = refPoint(e1, r1.part);
    } else if (e0) {
      const seg = refSegment(e0, r0.part === 'edge' ? 'segment:0' : r0.part);
      if (seg) [p0, p1] = seg;
    }
    if (!p0 || !p1) return;
    const a = toS(p0);
    let b = toS(p1);
    if (!visible(a) && !visible(b)) return;
    if (c.type === 'linear-h') b = { x: b.x, y: a.y };
    if (c.type === 'linear-v') b = { x: a.x, y: b.y };
    const d = sub(b, a);
    const n = len(d) > 1e-9 ? normalize(perp(d)) : { x: 0, y: -1 };
    const off = scale(n, -18);
    const a2 = add(a, off);
    const b2 = add(b, off);
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.setLineDash(dashed ? [4, 3] : []);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(a2.x, a2.y);
    g.moveTo(b.x, b.y);
    g.lineTo(b2.x, b2.y);
    g.moveTo(a2.x, a2.y);
    g.lineTo(b2.x, b2.y);
    g.stroke();
    g.setLineDash([]);
    badge(text, mid(a2, b2), color, 1, dashed);
  });
  g.restore();
}

function valueText(p: DynParam, fmt: (v: number) => string): string {
  switch (p.type) {
    case 'linear':
      return ` = ${fmt(dist(p.base, p.end))}`;
    case 'polar':
      return ` = ${fmt(dist(p.base, p.end))}`;
    case 'xy':
      return ` = ${fmt(Math.abs(p.corner.x - p.base.x))} × ${fmt(Math.abs(p.corner.y - p.base.y))}`;
    case 'rotation':
      return ` = ${fmt((p.angle * 180) / Math.PI)}°`;
    default:
      return '';
  }
}

/** Dibuja la geometría del parámetro en pantalla y devuelve dónde colocar su etiqueta. */
function drawParam(g: CanvasRenderingContext2D, p: DynParam, toS: (p: Vec2) => Vec2, tick: (p: Vec2, d: Vec2) => void, grip: (p: Vec2) => void): Vec2 {
  switch (p.type) {
    case 'linear':
    case 'polar':
    case 'flip': {
      const a = toS(p.base);
      const b = toS(p.end);
      const d = sub(b, a);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      if (len(d) > 1e-9) {
        tick(a, d);
        tick(b, d);
      }
      g.stroke();
      g.beginPath();
      grip(b);
      if (p.type === 'linear' && p.gripCount === 2) grip(a);
      g.fill();
      return mid(a, b);
    }
    case 'xy': {
      const a = toS(p.base);
      const c = toS(p.corner);
      g.beginPath();
      g.rect(Math.min(a.x, c.x), Math.min(a.y, c.y), Math.abs(c.x - a.x), Math.abs(c.y - a.y));
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      grip(c);
      g.fill();
      return { x: (a.x + c.x) / 2, y: Math.min(a.y, c.y) };
    }
    case 'rotation': {
      const c = toS(p.base);
      const r = Math.max(8, dist(toS({ x: p.base.x + p.radius, y: p.base.y }), c));
      g.beginPath();
      g.arc(c.x, c.y, r, 0, Math.PI * 2);
      g.stroke();
      const e = add(c, { x: Math.cos(p.angle) * r, y: -Math.sin(p.angle) * r });
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(c.x, c.y);
      g.lineTo(e.x, e.y);
      g.stroke();
      g.beginPath();
      g.arc(e.x, e.y, 3.5, 0, Math.PI * 2);
      g.fill();
      return { x: c.x, y: c.y - r };
    }
    case 'alignment': {
      const a = toS(p.base);
      const dir = normalize({ x: p.direction.x, y: -p.direction.y });
      const b = add(a, scale(dir, 40));
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      const ang = angleOf(dir);
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - 7 * Math.cos(ang - 0.4), b.y - 7 * Math.sin(ang - 0.4));
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - 7 * Math.cos(ang + 0.4), b.y - 7 * Math.sin(ang + 0.4));
      g.stroke();
      return a;
    }
    case 'point':
    case 'basepoint': {
      const a = toS(p.point);
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(a.x - 6, a.y);
      g.lineTo(a.x + 6, a.y);
      g.moveTo(a.x, a.y - 6);
      g.lineTo(a.x, a.y + 6);
      g.stroke();
      g.beginPath();
      g.arc(a.x, a.y, 3, 0, Math.PI * 2);
      g.stroke();
      return a;
    }
    case 'visibility':
    case 'lookup': {
      const a = toS(p.position);
      g.setLineDash([]);
      g.beginPath();
      g.rect(Math.round(a.x - 6) + 0.5, Math.round(a.y - 6) + 0.5, 12, 12);
      g.stroke();
      g.beginPath();
      g.moveTo(a.x - 3, a.y - 1);
      g.lineTo(a.x + 3, a.y - 1);
      g.lineTo(a.x, a.y + 3);
      g.closePath();
      g.fill();
      return a;
    }
  }
}
