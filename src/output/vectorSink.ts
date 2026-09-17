import type { Mat2D } from '../geometry/matrix';
import { applyToPoint, applyToVector, determinant, invert, multiply } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import type { Entity } from '../document/types';
import type { ImageItem, PathCmd, PathItem, PointItem, TextItem, WipeoutItem } from '../model/graphics';
import type { DrawSink, ResolvedStyle } from '../render/traverse';
import type { OutCmd } from './bezier';
import { toOutPath } from './bezier';

/**
 * Salida vectorial independiente del formato. Todas las coordenadas llegan en milímetros
 * de papel con Y hacia arriba y origen en la esquina inferior izquierda de la hoja.
 */
export interface StrokeSpec {
  color: string;
  alpha: number;
  /** ancho en mm */
  width: number;
  /** patrón en mm (trazo, hueco, …) o null */
  dash: number[] | null;
  cap: 'round' | 'butt';
}

export interface FillSpec {
  color: string;
  alpha: number;
  rule: 'nonzero' | 'evenodd';
}

export interface TextSpec {
  text: string;
  /** punto de inserción (línea base) en mm */
  x: number;
  y: number;
  /** ángulo de la línea base en radianes (antihorario) */
  angle: number;
  /** altura de mayúsculas en mm */
  capHeight: number;
  widthFactor: number;
  /** ángulo de oblicuidad en radianes */
  oblique: number;
  font: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  alpha: number;
  /** máscara de fondo (color de papel) con margen en mm */
  mask?: { margin: number };
}

export interface ImageSpec {
  /** PNG o JPEG como data URL */
  dataUrl: string;
  /** cuadrado unidad (origen abajo-izquierda) → mm de papel */
  m: Mat2D;
  opacity: number;
  clip?: Vec2[];
}

export interface VectorBackend {
  save(): void;
  restore(): void;
  clip(path: OutCmd[], rule: 'nonzero' | 'evenodd'): void;
  path(path: OutCmd[], stroke: StrokeSpec | null, fill: FillSpec | null): void;
  text(t: TextSpec): void;
  image(img: ImageSpec): void;
}

/** Proveedor síncrono de imágenes ya rasterizadas (PNG/JPEG). */
export type ImageProvider = (assetId: string, page?: number) => string | null;

export interface VectorSinkOptions {
  /** matriz del espacio dibujado → mm de papel */
  base: Mat2D;
  /** hoja en mm (para recortar líneas infinitas) */
  paper: { width: number; height: number };
  plotLineweights: boolean;
  images?: ImageProvider;
  paperColor?: string;
  /** false: la transparencia de objetos y capas se ignora (todo opaco) */
  plotTransparency?: boolean;
}

/** Ancho de línea cuando no se trazan grosores (≈ 0,13 mm, estándar de trazado fino). */
export const HAIRLINE_MM = 0.13;
/** Grosor mínimo reproducible. */
const MIN_WIDTH_MM = 0.05;

/**
 * Sumidero vectorial: aplica la pila de matrices, convierte arcos a Bézier exactas,
 * y traduce estilos resueltos (grosor en centésimas de mm, patrón en unidades del espacio)
 * a milímetros de papel.
 */
export class VectorSink implements DrawSink {
  private stack: Mat2D[] = [];
  private m: Mat2D;

  constructor(
    private backend: VectorBackend,
    private o: VectorSinkOptions,
  ) {
    this.m = o.base;
  }

  private get scale(): number {
    return Math.sqrt(Math.abs(determinant(this.m)));
  }

  save() {
    this.stack.push(this.m);
    this.backend.save();
  }

  restore() {
    this.m = this.stack.pop() ?? this.o.base;
    this.backend.restore();
  }

  transform(t: Mat2D) {
    this.m = multiply(this.m, t);
  }

  clip(cmds: PathCmd[]) {
    this.backend.clip(toOutPath(cmds, this.m), 'evenodd');
  }

  /** Recorta a un rectángulo expresado directamente en mm de papel. */
  clipPaper(b: { minX: number; minY: number; maxX: number; maxY: number }) {
    this.backend.clip(
      [
        { t: 'M', x: b.minX, y: b.minY },
        { t: 'L', x: b.maxX, y: b.minY },
        { t: 'L', x: b.maxX, y: b.maxY },
        { t: 'L', x: b.minX, y: b.maxY },
        { t: 'Z' },
      ],
      'nonzero',
    );
  }

  private alpha(a: number): number {
    return this.o.plotTransparency === false ? 1 : a;
  }

  private strokeSpec(style: ResolvedStyle, width?: number): StrokeSpec {
    const s = this.scale || 1;
    if (width && width > 0) return { color: style.color, alpha: this.alpha(style.alpha), width: Math.max(MIN_WIDTH_MM, width * s), dash: null, cap: 'butt' };
    const w = this.o.plotLineweights ? Math.max(MIN_WIDTH_MM, style.lineweight / 100) : HAIRLINE_MM;
    let dash: number[] | null = null;
    if (style.dash) {
      const mm = style.dash.map((v) => Math.abs(v) * s);
      const total = mm.reduce((a, b) => a + b, 0);
      // patrones más cortos que medio milímetro se trazan continuos (ilegibles impresos)
      if (total >= 0.5) dash = mm.map((v) => (v === 0 ? Math.max(w, 0.1) : v));
    }
    return { color: style.color, alpha: this.alpha(style.alpha), width: w, dash, cap: 'round' };
  }

  stroke(item: PathItem, style: ResolvedStyle, _owner: Entity) {
    if (!item.cmds.length) return;
    this.backend.path(toOutPath(item.cmds, this.m), this.strokeSpec(style, item.width), null);
  }

  fill(item: PathItem, style: ResolvedStyle, fillColor: string, _owner: Entity) {
    if (!item.cmds.length) return;
    this.backend.path(toOutPath(item.cmds, this.m), null, { color: fillColor, alpha: this.alpha(style.alpha), rule: item.fill === 'nonzero' ? 'nonzero' : 'evenodd' });
  }

  wipeout(item: WipeoutItem, style: ResolvedStyle, owner: Entity) {
    this.backend.path(toOutPath(item.cmds, this.m), null, { color: this.o.paperColor ?? '#ffffff', alpha: 1, rule: 'nonzero' });
    if (item.frame) this.stroke({ k: 'path', cmds: item.cmds, stroke: true, solid: true }, style, owner);
  }

  point(item: PointItem, style: ResolvedStyle, owner: Entity) {
    const s = this.scale || 1;
    // tamaño relativo a pantalla (≤ 0): 1,5 mm impresos
    const size = item.size > 0 ? item.size : 1.5 / s;
    const h = size / 2;
    const { x, y } = item;
    const cmds: PathCmd[] = [];
    const mode = item.mode & 7;
    if (mode === 0) {
      const r = 0.15 / s;
      cmds.push({ t: 'M', x: x + r, y }, { t: 'A', cx: x, cy: y, r, a0: 0, a1: Math.PI * 2, ccw: true });
      const out = toOutPath(cmds, this.m);
      this.backend.path(out, null, { color: style.color, alpha: this.alpha(style.alpha), rule: 'nonzero' });
      cmds.length = 0;
    } else if (mode === 2) cmds.push({ t: 'M', x: x - h, y }, { t: 'L', x: x + h, y }, { t: 'M', x, y: y - h }, { t: 'L', x, y: y + h });
    else if (mode === 3) cmds.push({ t: 'M', x: x - h, y: y - h }, { t: 'L', x: x + h, y: y + h }, { t: 'M', x: x - h, y: y + h }, { t: 'L', x: x + h, y: y - h });
    else if (mode === 4) cmds.push({ t: 'M', x, y }, { t: 'L', x, y: y + h });
    if (item.mode & 32) cmds.push({ t: 'M', x: x + h, y }, { t: 'A', cx: x, cy: y, r: h, a0: 0, a1: Math.PI * 2, ccw: true });
    if (item.mode & 64) cmds.push({ t: 'M', x: x - h, y: y - h }, { t: 'L', x: x + h, y: y - h }, { t: 'L', x: x + h, y: y + h }, { t: 'L', x: x - h, y: y + h }, { t: 'Z' });
    if (cmds.length) this.stroke({ k: 'path', cmds, stroke: true, solid: true }, { ...style, dash: null, lineweight: 0 }, owner);
  }

  infinite(o: Vec2, d: Vec2, ray: boolean, style: ResolvedStyle, owner: Entity) {
    const inv = invert(this.m);
    const { width: W, height: H } = this.o.paper;
    const corners = [applyToPoint(inv, { x: 0, y: 0 }), applyToPoint(inv, { x: W, y: 0 }), applyToPoint(inv, { x: W, y: H }), applyToPoint(inv, { x: 0, y: H })];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const diag = Math.hypot(maxX - minX, maxY - minY);
    const t0 = ((minX + maxX) / 2 - o.x) * d.x + ((minY + maxY) / 2 - o.y) * d.y;
    const a = ray ? Math.max(0, t0 - diag) : t0 - diag;
    const b = t0 + diag;
    if (b <= a) return;
    this.stroke({ k: 'path', cmds: [{ t: 'M', x: o.x + d.x * a, y: o.y + d.y * a }, { t: 'L', x: o.x + d.x * b, y: o.y + d.y * b }], stroke: true }, style, owner);
  }

  text(item: TextItem, style: ResolvedStyle, _owner: Entity) {
    if (!item.text) return;
    const m = this.m;
    const p = applyToPoint(m, { x: item.x, y: item.y });
    const ux = applyToVector(m, { x: Math.cos(item.rotation), y: Math.sin(item.rotation) });
    const uy = applyToVector(m, { x: -Math.sin(item.rotation), y: Math.cos(item.rotation) });
    const capHeight = Math.hypot(uy.x, uy.y) * item.height;
    if (capHeight < 0.05) return;
    this.backend.text({
      text: item.text,
      x: p.x,
      y: p.y,
      angle: Math.atan2(ux.y, ux.x),
      capHeight,
      widthFactor: item.widthFactor || 1,
      oblique: item.oblique || 0,
      font: item.font,
      bold: !!item.bold,
      italic: !!item.italic,
      align: item.align,
      color: style.color,
      alpha: this.alpha(style.alpha),
      mask: item.background ? { margin: item.background.margin * Math.hypot(uy.x, uy.y) } : undefined,
    });
  }

  image(item: ImageItem, style: ResolvedStyle, owner: Entity) {
    const url = this.o.images?.(item.assetId, item.pdfPage);
    if (url) {
      this.backend.image({
        dataUrl: url,
        m: multiply(this.m, item.m),
        opacity: Math.max(0, Math.min(1, item.opacity ?? 1)) * this.alpha(style.alpha),
        clip: item.clip && item.clip.length > 2 ? item.clip.map((q) => applyToPoint(this.m, q)) : undefined,
      });
    }
    if (item.frame || !url) {
      const corners = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ].map((q) => applyToPoint(item.m, q));
      const cmds: PathCmd[] = corners.map((q, i) => ({ t: i ? 'L' : 'M', x: q.x, y: q.y }) as PathCmd);
      cmds.push({ t: 'Z' });
      this.stroke({ k: 'path', cmds, stroke: true, solid: true }, { ...style, dash: null, lineweight: 0 }, owner);
    }
  }
}
