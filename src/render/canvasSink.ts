import type { Mat2D } from '../geometry/matrix';
import { applyToPoint, applyToVector, determinant, IDENTITY, multiply } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import type { Entity } from '../document/types';
import type { ImageItem, PathCmd, PathItem, PointItem, TextItem, WipeoutItem } from '../model/graphics';
import { sweepOf } from '../model/graphics';
import { CAP_HEIGHT_RATIO, cssFontFamily } from '../model/text';
import type { DrawSink, ResolvedStyle } from './traverse';

type Ctx2D = CanvasRenderingContext2D;

const pathCache = new WeakMap<PathCmd[], Path2D>();

function drawablePath(cmds: readonly PathCmd[]): boolean {
  return cmds.every((c) => {
    if (Object.values(c).some((value) => typeof value === 'number' && !Number.isFinite(value))) return false;
    if (c.t === 'A' || c.t === 'E') {
      const sweep = sweepOf(c.a0, c.a1, c.ccw);
      if (!Number.isFinite(sweep) || !Number.isFinite(c.a0 + sweep)) return false;
      if (c.t === 'A' && c.r < 0) return false;
    }
    return true;
  });
}

export function toPath2D(cmds: PathCmd[]): Path2D {
  let p = pathCache.get(cmds);
  if (p) return p;
  p = new Path2D();
  if (!drawablePath(cmds)) {
    pathCache.set(cmds, p);
    return p;
  }
  for (const c of cmds) {
    switch (c.t) {
      case 'M':
        p.moveTo(c.x, c.y);
        break;
      case 'L':
        p.lineTo(c.x, c.y);
        break;
      case 'A': {
        const sweep = sweepOf(c.a0, c.a1, c.ccw);
        p.arc(c.cx, c.cy, c.r, c.a0, c.a0 + sweep, sweep < 0);
        break;
      }
      case 'E': {
        const sweep = sweepOf(c.a0, c.a1, c.ccw);
        p.ellipse(c.cx, c.cy, Math.max(0, c.rx), Math.max(0, c.ry), c.rot, c.a0, c.a0 + sweep, sweep < 0);
        break;
      }
      case 'C':
        p.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        break;
      case 'Z':
        p.closePath();
        break;
    }
  }
  pathCache.set(cmds, p);
  return p;
}

export interface ImageSource {
  get(assetId: string, page?: number): CanvasImageSource | null;
}

export interface CanvasSinkOptions {
  /** matriz base mundo → píxeles del dispositivo */
  base: Mat2D;
  /** píxeles de dispositivo por píxel CSS */
  dpr: number;
  lineweightDisplay: boolean;
  /** escala de grosores (px por centésima de mm) */
  lwPxPerHundredth: number;
  background: string;
  images?: ImageSource;
  /** caja visible en píxeles de dispositivo */
  deviceWidth: number;
  deviceHeight: number;
  /** grosor mínimo en px CSS */
  minWidthPx?: number;
  /** multiplicador de grosor (resaltados) */
  widthBoost?: number;
  /** trazo discontinuo forzado en px (resaltado de selección) */
  forceDashPx?: number[] | null;
  deadline?: number;
}

/**
 * Sumidero Canvas 2D. Agrupa trazos consecutivos con el mismo estilo en un único
 * Path2D (reduce llamadas stroke) y reutiliza los Path2D de cada lista de
 * visualización mientras la entidad no cambie.
 */
export class CanvasSink implements DrawSink {
  private stack: { m: Mat2D; invalid: boolean }[] = [];
  private m: Mat2D;
  private invalid = false;
  private batch: { key: string; path: Path2D; style: ResolvedStyle; widthPx: number } | null = null;

  constructor(
    private g: Ctx2D,
    private o: CanvasSinkOptions,
  ) {
    this.m = o.base;
    g.setTransform(o.base.a, o.base.b, o.base.c, o.base.d, o.base.e, o.base.f);
    g.lineCap = 'round';
    g.lineJoin = 'round';
  }

  aborted(): boolean {
    return this.o.deadline !== undefined && performance.now() > this.o.deadline;
  }

  private get scale(): number {
    return Math.sqrt(Math.abs(determinant(this.m)));
  }

  save() {
    this.flush();
    this.stack.push({ m: this.m, invalid: this.invalid });
    this.g.save();
  }

  restore() {
    this.flush();
    const state = this.stack.pop();
    this.m = state?.m ?? this.o.base;
    this.invalid = state?.invalid ?? false;
    this.g.restore();
  }

  transform(t: Mat2D) {
    this.flush();
    if (this.invalid) return;
    const next = multiply(this.m, t);
    if (!Object.values(next).every(Number.isFinite)) {
      this.invalid = true;
      return;
    }
    this.m = next;
    this.g.setTransform(this.m.a, this.m.b, this.m.c, this.m.d, this.m.e, this.m.f);
  }

  clip(cmds: PathCmd[]) {
    if (this.invalid) return;
    this.flush();
    this.g.clip(toPath2D(cmds), 'evenodd');
  }

  private widthPx(style: ResolvedStyle): number {
    const base = this.o.lineweightDisplay ? Math.max(1, style.lineweight * this.o.lwPxPerHundredth) : 1;
    return Math.max(this.o.minWidthPx ?? 1, base) * (this.o.widthBoost ?? 1) * this.o.dpr;
  }

  private applyStroke(style: ResolvedStyle, widthPx: number) {
    const g = this.g;
    const s = this.scale || 1;
    g.strokeStyle = style.color;
    g.globalAlpha = style.alpha;
    g.lineWidth = widthPx / s;
    if (this.o.forceDashPx) {
      g.setLineDash(this.o.forceDashPx.map((d) => (d * this.o.dpr) / s));
    } else if (style.dash) {
      const total = style.dash.reduce((a, b) => a + Math.abs(b), 0);
      if (total * s < 3 * this.o.dpr) g.setLineDash([]);
      else {
        const minDot = (1.2 * this.o.dpr) / s;
        const d = style.dash.map((v) => (v === 0 ? minDot : Math.abs(v)));
        // patrón que empieza con hueco: se rota para que empiece por trazo
        g.setLineDash(d);
        g.lineDashOffset = 0;
      }
    } else g.setLineDash([]);
  }

  private flush() {
    const b = this.batch;
    if (!b) return;
    this.batch = null;
    this.applyStroke(b.style, b.widthPx);
    this.g.stroke(b.path);
  }

  stroke(item: PathItem, style: ResolvedStyle, _owner: Entity) {
    if (this.invalid || !item.cmds.length) return;
    if (item.width && item.width > 0) {
      this.flush();
      const g = this.g;
      g.strokeStyle = style.color;
      g.globalAlpha = style.alpha;
      g.setLineDash([]);
      g.lineWidth = Math.max(item.width, (this.o.dpr * 1) / (this.scale || 1));
      g.lineCap = 'butt';
      g.lineJoin = 'miter';
      g.stroke(toPath2D(item.cmds));
      g.lineCap = 'round';
      g.lineJoin = 'round';
      return;
    }
    const widthPx = this.widthPx(style);
    const key = `${style.color}|${style.alpha}|${widthPx}|${style.dash?.join(',') ?? ''}`;
    if (!this.batch || this.batch.key !== key) {
      this.flush();
      this.batch = { key, path: new Path2D(), style, widthPx };
    }
    this.batch.path.addPath(toPath2D(item.cmds));
  }

  fill(item: PathItem, style: ResolvedStyle, fillColor: string, _owner: Entity) {
    if (this.invalid) return;
    this.flush();
    const g = this.g;
    g.fillStyle = fillColor;
    g.globalAlpha = style.alpha;
    g.fill(toPath2D(item.cmds), item.fill === 'nonzero' ? 'nonzero' : 'evenodd');
  }

  wipeout(item: WipeoutItem, style: ResolvedStyle, owner: Entity) {
    if (this.invalid) return;
    this.flush();
    const g = this.g;
    g.fillStyle = this.o.background;
    g.globalAlpha = 1;
    g.fill(toPath2D(item.cmds), 'nonzero');
    if (item.frame) this.stroke({ k: 'path', cmds: item.cmds, stroke: true }, style, owner);
  }

  point(item: PointItem, style: ResolvedStyle, _owner: Entity) {
    if (this.invalid) return;
    this.flush();
    const g = this.g;
    const s = this.scale || 1;
    const px = this.o.dpr;
    const size = item.size > 0 ? item.size : (this.o.deviceHeight * 0.02) / s;
    const x = item.x;
    const y = item.y;
    const h = size / 2;
    if (h < 0 || ![s, size, h, x - h, x + h, y - h, y + h, x - px / s, x + px / s, y - px / s, y + px / s].every(Number.isFinite)) return;
    g.strokeStyle = style.color;
    g.fillStyle = style.color;
    g.globalAlpha = style.alpha;
    g.setLineDash([]);
    g.lineWidth = px / s;
    const mode = item.mode & 7;
    g.beginPath();
    if (mode === 0 || mode === 1) {
      if (mode === 0) {
        g.fillRect(x - px / s, y - px / s, (2 * px) / s, (2 * px) / s);
      }
    } else if (mode === 2) {
      g.moveTo(x - h, y);
      g.lineTo(x + h, y);
      g.moveTo(x, y - h);
      g.lineTo(x, y + h);
    } else if (mode === 3) {
      g.moveTo(x - h, y - h);
      g.lineTo(x + h, y + h);
      g.moveTo(x - h, y + h);
      g.lineTo(x + h, y - h);
    } else if (mode === 4) {
      g.moveTo(x, y);
      g.lineTo(x, y + h);
    }
    if (item.mode & 32) {
      g.moveTo(x + h, y);
      g.arc(x, y, h, 0, Math.PI * 2);
    }
    if (item.mode & 64) g.rect(x - h, y - h, size, size);
    g.stroke();
  }

  infinite(o: Vec2, d: Vec2, ray: boolean, style: ResolvedStyle, owner: Entity) {
    if (this.invalid) return;
    if (![o.x, o.y, d.x, d.y].every(Number.isFinite)) return;
    const directionScale = Math.max(Math.abs(d.x), Math.abs(d.y));
    if (!(directionScale > 0)) return;
    const scaledDirection = { x: d.x / directionScale, y: d.y / directionScale };
    const directionLength = Math.hypot(scaledDirection.x, scaledDirection.y);
    const direction = { x: scaledDirection.x / directionLength, y: scaledDirection.y / directionLength };
    // recorte a la caja de pantalla transformada al espacio local
    const inv = invertSafe(this.m);
    const W = this.o.deviceWidth;
    const H = this.o.deviceHeight;
    const corners = [applyToPoint(inv, { x: 0, y: 0 }), applyToPoint(inv, { x: W, y: 0 }), applyToPoint(inv, { x: W, y: H }), applyToPoint(inv, { x: 0, y: H })];
    if (corners.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) return;
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const diag = Math.hypot(maxX - minX, maxY - minY);
    if (!Number.isFinite(diag)) return;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const t0 = (cx - o.x) * direction.x + (cy - o.y) * direction.y;
    if (!Number.isFinite(t0)) return;
    const a = ray ? Math.max(0, t0 - diag) : t0 - diag;
    const b = t0 + diag;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return;
    const start = { x: o.x + direction.x * a, y: o.y + direction.y * a };
    const end = { x: o.x + direction.x * b, y: o.y + direction.y * b };
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return;
    this.stroke(
      {
        k: 'path',
        cmds: [
          { t: 'M', x: start.x, y: start.y },
          { t: 'L', x: end.x, y: end.y },
        ],
        stroke: true,
      },
      style,
      owner,
    );
  }

  text(item: TextItem, style: ResolvedStyle, _owner: Entity) {
    if (this.invalid) return;
    this.flush();
    const g = this.g;
    const m = this.m;
    const p = applyToPoint(m, { x: item.x, y: item.y });
    const ux = applyToVector(m, { x: Math.cos(item.rotation), y: Math.sin(item.rotation) });
    const uy = applyToVector(m, { x: -Math.sin(item.rotation), y: Math.cos(item.rotation) });
    const hPx = Math.hypot(uy.x, uy.y) * item.height;
    if (![p.x, p.y, ux.x, ux.y, uy.x, uy.y, hPx, style.alpha].every(Number.isFinite)) return;
    if (hPx < 1.2) {
      // demasiado pequeño: representación simplificada
      if (hPx < 0.15) return;
      const wPx = hPx * 0.6 * item.text.length * item.widthFactor;
      const ang = Math.atan2(ux.y, ux.x);
      const startY = p.y - hPx / 2;
      const endX = p.x + Math.cos(ang) * wPx;
      const endY = startY + Math.sin(ang) * wPx;
      if (![wPx, ang, startY, endX, endY].every(Number.isFinite)) return;
      g.save();
      try {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = style.alpha * 0.5;
        g.strokeStyle = style.color;
        g.lineWidth = Math.max(0.5, hPx * 0.5);
        g.beginPath();
        g.moveTo(p.x, startY);
        g.lineTo(endX, endY);
        g.stroke();
      } finally {
        g.restore();
      }
      return;
    }
    const fontPx = hPx / CAP_HEIGHT_RATIO;
    const angle = Math.atan2(ux.y, ux.x);
    // si la matriz refleja, el texto se mantiene legible
    const mirrored = determinant(m) > 0; // y de pantalla invertida: det>0 significa reflejo en mundo
    const wf = item.widthFactor || 1;
    const oblique = Math.tan(item.oblique || 0);
    const margin = item.background ? item.background.margin * Math.hypot(uy.x, uy.y) : 0;
    if (![fontPx, angle, wf, oblique, margin].every(Number.isFinite)) return;
    g.save();
    try {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.translate(p.x, p.y);
      g.rotate(angle);
      if (mirrored) g.scale(1, 1);
      g.transform(wf, 0, -oblique, 1, 0, 0);
      g.font = `${item.italic ? 'italic ' : ''}${item.bold ? '700' : '400'} ${fontPx}px ${cssFontFamily(item.font)}`;
      g.textBaseline = 'alphabetic';
      g.textAlign = item.align;
      if (item.background) {
        const w = g.measureText(item.text).width;
        const mask = [-margin, -hPx - margin, w + 2 * margin, hPx * 1.25 + 2 * margin] as const;
        if (mask.every(Number.isFinite)) {
          g.fillStyle = this.o.background;
          g.globalAlpha = 1;
          g.fillRect(...mask);
        }
      }
      g.fillStyle = style.color;
      g.globalAlpha = style.alpha;
      g.fillText(item.text, 0, 0);
    } finally {
      g.restore();
    }
  }

  image(item: ImageItem, style: ResolvedStyle, _owner: Entity) {
    if (this.invalid) return;
    this.flush();
    const g = this.g;
    const src = this.o.images?.get(item.assetId, item.pdfPage);
    const mm = multiply(this.m, multiply(item.m, { a: 1, b: 0, c: 0, d: -1, e: 0, f: 1 }));
    if (!Object.values(mm).every(Number.isFinite) || item.clip?.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
    const corners = [
      applyToPoint(mm, { x: 0, y: 0 }),
      applyToPoint(mm, { x: 1, y: 0 }),
      applyToPoint(mm, { x: 0, y: 1 }),
      applyToPoint(mm, { x: 1, y: 1 }),
    ];
    if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
    if (item.clip?.some((p) => {
      const screen = applyToPoint(this.m, p);
      return !Number.isFinite(screen.x) || !Number.isFinite(screen.y);
    })) return;
    g.save();
    try {
      if (item.clip && item.clip.length > 2) {
        const path = new Path2D();
        item.clip.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
        path.closePath();
        g.clip(path);
      }
      g.setTransform(mm.a, mm.b, mm.c, mm.d, mm.e, mm.f);
      if (src) {
        g.globalAlpha = Math.max(0, Math.min(1, item.opacity ?? 1)) * style.alpha;
        if (item.monochrome || (item.contrast !== undefined && item.contrast !== 50) || (item.brightness !== undefined && item.brightness !== 50)) {
          const filters: string[] = [];
          if (item.monochrome) filters.push('grayscale(1)');
          if (item.brightness !== undefined && item.brightness !== 50) filters.push(`brightness(${item.brightness / 50})`);
          if (item.contrast !== undefined && item.contrast !== 50) filters.push(`contrast(${item.contrast / 50})`);
          try {
            g.filter = filters.join(' ');
          } catch {
            /* filtros no admitidos */
          }
        }
        g.imageSmoothingEnabled = true;
        g.drawImage(src, 0, 0, 1, 1);
        g.filter = 'none';
        if (item.fade > 0) {
          g.globalAlpha = Math.min(0.9, item.fade / 100);
          g.fillStyle = this.o.background;
          g.fillRect(0, 0, 1, 1);
        }
      } else {
        g.globalAlpha = 0.5;
        g.fillStyle = 'rgba(128,128,128,0.15)';
        g.fillRect(0, 0, 1, 1);
      }
    } finally {
      g.restore();
    }
    if (item.frame) {
      const corners = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ].map((q) => applyToPoint(item.m, q));
      const cmds: PathCmd[] = corners.map((q, i) => ({ t: i ? 'L' : 'M', x: q.x, y: q.y }) as PathCmd);
      cmds.push({ t: 'Z' });
      this.stroke({ k: 'path', cmds, stroke: true, solid: true }, { ...style, dash: null, lineweight: 0 }, _owner);
    }
  }

  end() {
    this.flush();
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.globalAlpha = 1;
    this.g.setLineDash([]);
  }
}

function invertSafe(m: Mat2D): Mat2D {
  const det = determinant(m);
  if (Math.abs(det) < 1e-300) return IDENTITY;
  const id = 1 / det;
  return { a: m.d * id, b: -m.b * id, c: -m.c * id, d: m.a * id, e: (m.c * m.f - m.d * m.e) * id, f: (m.b * m.e - m.a * m.f) * id };
}
