import { ACTION_TYPE_LABEL, paramsWithoutAction } from '../blocks/authoring';
import type { Vec2 } from '../geometry/vec';
import { add, angleOf, dist, len, mid, normalize, perp, scale, sub } from '../geometry/vec';
import type { DynParam } from '../document/types';
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
