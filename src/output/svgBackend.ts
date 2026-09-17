import type { OutCmd } from './bezier';
import type { FillSpec, ImageSpec, StrokeSpec, TextSpec, VectorBackend } from './vectorSink';

const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Familia CSS para SVG a partir del nombre de estilo de texto. */
export function svgFontFamily(font: string): string {
  if (/mono|courier|isocp/i.test(font)) return "'IBM Plex Mono', 'Courier New', monospace";
  if (/serif|times|roman/i.test(font) && !/sans/i.test(font)) return "'Times New Roman', serif";
  return "Inter, 'Helvetica Neue', Arial, sans-serif";
}

/**
 * Backend SVG 1.1: unidades de usuario = milímetros (`width="…mm"`), Y invertida por
 * el propio emisor para que el archivo sea legible y editable en otras herramientas.
 */
export class SvgBackend implements VectorBackend {
  private body: string[] = [];
  private defs: string[] = [];
  /** grupos abiertos por cada nivel de save() */
  private openGroups: number[] = [0];
  private clipSeq = 0;

  constructor(
    private width: number,
    private height: number,
    private opts: { title?: string; background?: string } = {},
  ) {}

  private y(v: number) {
    return this.height - v;
  }

  private d(path: readonly OutCmd[]): string {
    let s = '';
    for (const c of path) {
      switch (c.t) {
        case 'M':
          s += `M${fmt(c.x)} ${fmt(this.y(c.y))}`;
          break;
        case 'L':
          s += `L${fmt(c.x)} ${fmt(this.y(c.y))}`;
          break;
        case 'C':
          s += `C${fmt(c.x1)} ${fmt(this.y(c.y1))} ${fmt(c.x2)} ${fmt(this.y(c.y2))} ${fmt(c.x)} ${fmt(this.y(c.y))}`;
          break;
        case 'Z':
          s += 'Z';
          break;
      }
    }
    return s;
  }

  save() {
    this.openGroups.push(0);
  }

  restore() {
    const n = this.openGroups.pop() ?? 0;
    for (let i = 0; i < n; i++) this.body.push('</g>');
    if (!this.openGroups.length) this.openGroups.push(0);
  }

  clip(path: OutCmd[], rule: 'nonzero' | 'evenodd') {
    const id = `clip${++this.clipSeq}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.d(path)}" clip-rule="${rule}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    this.openGroups[this.openGroups.length - 1]++;
  }

  path(path: OutCmd[], stroke: StrokeSpec | null, fill: FillSpec | null) {
    if (!path.length) return;
    const a: string[] = [`d="${this.d(path)}"`];
    if (fill) {
      a.push(`fill="${fill.color}"`, `fill-rule="${fill.rule}"`);
      if (fill.alpha < 1) a.push(`fill-opacity="${fmt(fill.alpha)}"`);
    } else a.push('fill="none"');
    if (stroke) {
      a.push(`stroke="${stroke.color}"`, `stroke-width="${fmt(stroke.width)}"`, `stroke-linecap="${stroke.cap}"`, `stroke-linejoin="${stroke.cap === 'butt' ? 'miter' : 'round'}"`);
      if (stroke.alpha < 1) a.push(`stroke-opacity="${fmt(stroke.alpha)}"`);
      if (stroke.dash) a.push(`stroke-dasharray="${stroke.dash.map(fmt).join(' ')}"`);
    }
    this.body.push(`<path ${a.join(' ')}/>`);
  }

  text(t: TextSpec) {
    const fontSize = t.capHeight / 0.718;
    const deg = (-t.angle * 180) / Math.PI;
    const skew = (t.oblique * 180) / Math.PI;
    const tf = `translate(${fmt(t.x)} ${fmt(this.y(t.y))}) rotate(${fmt(deg)})${skew ? ` skewX(${fmt(-skew)})` : ''}${t.widthFactor !== 1 ? ` scale(${fmt(t.widthFactor)} 1)` : ''}`;
    const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
    const family = svgFontFamily(t.font);
    const parts: string[] = [];
    if (t.mask) {
      // ancho estimado (el SVG no mide texto); la máscara solo evita que las líneas crucen el texto
      const w = t.text.length * fontSize * 0.55;
      const x0 = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
      parts.push(`<rect x="${fmt(x0 - t.mask.margin)}" y="${fmt(-t.capHeight - t.mask.margin)}" width="${fmt(w + 2 * t.mask.margin)}" height="${fmt(t.capHeight * 1.3 + 2 * t.mask.margin)}" fill="${this.opts.background ?? '#ffffff'}"/>`);
    }
    parts.push(
      `<text x="0" y="0" font-family="${family}" font-size="${fmt(fontSize)}"${t.bold ? ' font-weight="700"' : ''}${t.italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" fill="${t.color}"${t.alpha < 1 ? ` fill-opacity="${fmt(t.alpha)}"` : ''} xml:space="preserve">${escapeXml(t.text)}</text>`,
    );
    this.body.push(`<g transform="${tf}">${parts.join('')}</g>`);
  }

  image(img: ImageSpec) {
    // píxel de imagen (u, v hacia abajo) → cuadrado unidad (u, 1 − v) → papel → SVG (Y invertida)
    const m = img.m;
    const a = m.a;
    const b = -m.b;
    const c = -m.c;
    const d = m.d;
    const e = m.c + m.e;
    const f = this.height - (m.d + m.f);
    let open = '';
    let close = '';
    if (img.clip) {
      const id = `clip${++this.clipSeq}`;
      const path: OutCmd[] = img.clip.map((p, i) => ({ t: i ? 'L' : 'M', x: p.x, y: p.y }) as OutCmd);
      path.push({ t: 'Z' });
      this.defs.push(`<clipPath id="${id}"><path d="${this.d(path)}"/></clipPath>`);
      open = `<g clip-path="url(#${id})">`;
      close = '</g>';
    }
    this.body.push(
      `${open}<image href="${escapeXml(img.dataUrl)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${[a, b, c, d, e, f].map(fmt).join(' ')})"${img.opacity < 1 ? ` opacity="${fmt(img.opacity)}"` : ''}/>${close}`,
    );
  }

  finish(): string {
    while (this.openGroups.length > 1) this.restore();
    const n = this.openGroups[0];
    for (let i = 0; i < n; i++) this.body.push('</g>');
    this.openGroups = [0];
    const W = fmt(this.width);
    const H = fmt(this.height);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
      this.opts.title ? `<title>${escapeXml(this.opts.title)}</title>` : '',
      this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '',
      this.opts.background ? `<rect width="${W}" height="${H}" fill="${this.opts.background}"/>` : '',
      ...this.body,
      '</svg>',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
