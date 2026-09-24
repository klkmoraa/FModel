import type { PDFDocument, PDFFont, PDFImage, PDFName, PDFPage } from 'pdf-lib';
import {
  appendBezierCurve,
  beginText,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endPath,
  endText,
  fill,
  lineTo,
  moveTo,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  StandardFonts,
  stroke,
  LineCapStyle,
  LineJoinStyle,
} from 'pdf-lib';
import type { OutCmd } from './bezier';
import type { FillSpec, ImageSpec, StrokeSpec, TextSpec, VectorBackend } from './vectorSink';

export const MM_TO_PT = 72 / 25.4;

type Op = PDFOperator;
type Pending = { k: 'ops'; ops: Op[] } | { k: 'image'; spec: ImageSpec };

interface GState {
  stroke: string;
  fill: string;
  width: number;
  cap: string;
  dash: string;
  gs: string;
}

/** Altura de mayúsculas / cuerpo de las fuentes estándar PDF. */
const CAP_RATIO: Record<string, number> = { Helvetica: 0.718, Times: 0.662, Courier: 0.571 };

/** Variantes regular, negrita, cursiva y negrita cursiva de cada familia estándar. */
const STANDARD_FONTS: Record<string, StandardFonts[]> = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

/** Sustituciones de caracteres fuera de WinAnsi habituales en planos. */
const SUBSTITUTES: Record<string, string> = { '⌀': 'Ø', '−': '-', '‐': '-', '≈': '~', '≤': '<=', '≥': '>=', '×': 'x', '\t': ' ' };

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Backend PDF vectorial sobre pdf-lib. Las coordenadas se emiten en mm con una matriz
 * inicial mm→pt; el texto usa las 14 fuentes estándar (WinAnsi): los caracteres no
 * representables se sustituyen y se cuentan en `substitutedChars`.
 */
export class PdfBackend implements VectorBackend {
  readonly page: PDFPage;
  private pending: Pending[] = [];
  private cur: Op[] = [];
  private state: GState = { stroke: '', fill: '', width: -1, cap: '', dash: '', gs: '' };
  private stateStack: GState[] = [];
  private fonts = new Map<string, { font: PDFFont; key: PDFName; family: string }>();
  private gsKeys = new Map<string, PDFName>();
  private encodable = new Map<string, boolean>();
  substitutedChars = 0;
  readonly failedAssets = new Set<string>();

  constructor(
    private pdf: PDFDocument,
    private width: number,
    private height: number,
    background?: string,
  ) {
    this.page = pdf.addPage([width * MM_TO_PT, height * MM_TO_PT]);
    this.cur.push(pushGraphicsState(), concatTransformationMatrix(MM_TO_PT, 0, 0, MM_TO_PT, 0, 0));
    if (background && background.toLowerCase() !== '#ffffff') {
      this.cur.push(setFillingRgbColor(...rgb(background)), rectangle(0, 0, width, height), fill());
    }
  }

  private flushOps() {
    if (this.cur.length) this.pending.push({ k: 'ops', ops: this.cur });
    this.cur = [];
  }

  private pathOps(path: readonly OutCmd[]): Op[] {
    const ops: Op[] = [];
    for (const c of path) {
      if (c.t === 'M') ops.push(moveTo(c.x, c.y));
      else if (c.t === 'L') ops.push(lineTo(c.x, c.y));
      else if (c.t === 'C') ops.push(appendBezierCurve(c.x1, c.y1, c.x2, c.y2, c.x, c.y));
      else ops.push(closePath());
    }
    return ops;
  }

  private gsFor(strokeAlpha: number, fillAlpha: number): PDFName {
    const key = `${strokeAlpha.toFixed(3)}|${fillAlpha.toFixed(3)}`;
    let name = this.gsKeys.get(key);
    if (!name) {
      const dict = this.pdf.context.obj({ Type: 'ExtGState', CA: strokeAlpha, ca: fillAlpha });
      name = this.page.node.newExtGState('GS', dict);
      this.gsKeys.set(key, name);
    }
    return name;
  }

  private setAlpha(strokeAlpha: number, fillAlpha: number) {
    const key = `${strokeAlpha.toFixed(3)}|${fillAlpha.toFixed(3)}`;
    if (this.state.gs === key) return;
    this.state.gs = key;
    this.cur.push(setGraphicsState(this.gsFor(strokeAlpha, fillAlpha)));
  }

  save() {
    this.cur.push(pushGraphicsState());
    this.stateStack.push({ ...this.state });
  }

  restore() {
    this.cur.push(popGraphicsState());
    this.state = this.stateStack.pop() ?? { stroke: '', fill: '', width: -1, cap: '', dash: '', gs: '' };
  }

  clip(path: OutCmd[], rule: 'nonzero' | 'evenodd') {
    this.cur.push(...this.pathOps(path), PDFOperator.of(rule === 'evenodd' ? PDFOperatorNames.ClipEvenOdd : PDFOperatorNames.ClipNonZero), endPath());
  }

  path(path: OutCmd[], s: StrokeSpec | null, f: FillSpec | null) {
    if (!path.length || (!s && !f)) return;
    this.setAlpha(s?.alpha ?? 1, f?.alpha ?? 1);
    if (f) {
      if (this.state.fill !== f.color) {
        this.state.fill = f.color;
        this.cur.push(setFillingRgbColor(...rgb(f.color)));
      }
      this.cur.push(...this.pathOps(path), PDFOperator.of(f.rule === 'evenodd' ? PDFOperatorNames.FillEvenOdd : PDFOperatorNames.FillNonZero));
    }
    if (s) {
      if (this.state.stroke !== s.color) {
        this.state.stroke = s.color;
        this.cur.push(setStrokingRgbColor(...rgb(s.color)));
      }
      if (this.state.width !== s.width) {
        this.state.width = s.width;
        this.cur.push(setLineWidth(s.width));
      }
      if (this.state.cap !== s.cap) {
        this.state.cap = s.cap;
        this.cur.push(setLineCap(s.cap === 'butt' ? LineCapStyle.Butt : LineCapStyle.Round), setLineJoin(s.cap === 'butt' ? LineJoinStyle.Miter : LineJoinStyle.Round));
      }
      const dash = s.dash ? s.dash.map((v) => Math.round(v * 1000) / 1000).join(' ') : '';
      if (this.state.dash !== dash) {
        this.state.dash = dash;
        this.cur.push(setDashPattern(s.dash ?? [], 0));
      }
      this.cur.push(...this.pathOps(path), stroke());
    }
  }

  private fontFor(t: TextSpec) {
    const family = /mono|courier|isocp/i.test(t.font) ? 'Courier' : /serif|times|roman/i.test(t.font) && !/sans/i.test(t.font) ? 'Times' : 'Helvetica';
    const variant = `${family}|${t.bold ? 'B' : ''}${t.italic ? 'I' : ''}`;
    let entry = this.fonts.get(variant);
    if (!entry) {
      const std = STANDARD_FONTS[family][(t.bold ? 1 : 0) + (t.italic ? 2 : 0)];
      const font = this.pdf.embedStandardFont(std);
      const key = this.page.node.newFontDictionary(font.name, font.ref);
      entry = { font, key, family };
      this.fonts.set(variant, entry);
    }
    return entry;
  }

  private sanitize(font: PDFFont, text: string): string {
    let out = '';
    for (const raw of text) {
      const ch = SUBSTITUTES[raw] ?? raw;
      const k = `${font.name}|${ch}`;
      let ok = this.encodable.get(k);
      if (ok === undefined) {
        try {
          font.encodeText(ch);
          ok = true;
        } catch {
          ok = false;
        }
        this.encodable.set(k, ok);
      }
      if (ok) out += ch;
      else {
        out += '?';
        this.substitutedChars++;
      }
    }
    return out;
  }

  text(t: TextSpec) {
    const { font, key, family } = this.fontFor(t);
    const text = this.sanitize(font, t.text);
    const size = t.capHeight / (CAP_RATIO[family] ?? 0.718);
    const c = Math.cos(t.angle);
    const s = Math.sin(t.angle);
    const tan = Math.tan(t.oblique);
    const w = font.widthOfTextAtSize(text, size) * t.widthFactor;
    const shift = t.align === 'center' ? -w / 2 : t.align === 'right' ? -w : 0;
    const x = t.x + c * shift;
    const y = t.y + s * shift;
    if (t.mask) {
      const m = t.mask.margin;
      this.setAlpha(1, 1);
      this.state.fill = '#ffffff';
      this.cur.push(pushGraphicsState(), concatTransformationMatrix(c, s, -s, c, x, y), setFillingRgbColor(1, 1, 1), rectangle(-m, -t.capHeight * 0.3 - m, w + 2 * m, t.capHeight * 1.3 + 2 * m), fill(), popGraphicsState());
      this.state.fill = '';
    }
    this.setAlpha(t.alpha, t.alpha);
    if (this.state.fill !== t.color) {
      this.state.fill = t.color;
      this.cur.push(setFillingRgbColor(...rgb(t.color)));
    }
    this.cur.push(beginText(), setFontAndSize(key, size), setTextMatrix(c * t.widthFactor, s * t.widthFactor, c * tan - s, s * tan + c, x, y), showText(font.encodeText(text)), endText());
  }

  image(img: ImageSpec) {
    this.flushOps();
    this.pending.push({ k: 'image', spec: img });
  }

  /** Incrusta imágenes y escribe el flujo de contenido de la página. */
  async finish(): Promise<void> {
    this.cur.push(popGraphicsState());
    this.flushOps();
    const cache = new Map<string, PDFImage | null>();
    const all: Op[] = [];
    let seq = 0;
    for (const p of this.pending) {
      if (p.k === 'ops') {
        all.push(...p.ops);
        continue;
      }
      const url = p.spec.dataUrl;
      let image = cache.get(url);
      if (image === undefined) {
        try {
          image = /^data:image\/jpe?g/i.test(url) ? await this.pdf.embedJpg(url) : await this.pdf.embedPng(url);
        } catch {
          image = null;
        }
        cache.set(url, image);
      }
      if (!image) {
        this.failedAssets.add(p.spec.assetId);
        continue;
      }
      const name = this.page.node.newXObject(`Im${++seq}`, image.ref);
      const m = p.spec.m;
      all.push(pushGraphicsState());
      if (p.spec.clip) {
        all.push(...this.pathOps(p.spec.clip.map((q, i) => ({ t: i ? 'L' : 'M', x: q.x, y: q.y }) as OutCmd).concat([{ t: 'Z' }])), PDFOperator.of(PDFOperatorNames.ClipNonZero), endPath());
      }
      if (p.spec.opacity < 1) all.push(setGraphicsState(this.gsFor(p.spec.opacity, p.spec.opacity)));
      all.push(concatTransformationMatrix(m.a, m.b, m.c, m.d, m.e, m.f), drawObject(name), popGraphicsState());
    }
    this.pending = [];
    this.page.pushOperators(...all);
  }
}
