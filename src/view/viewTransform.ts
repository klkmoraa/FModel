import type { BBox } from '../geometry/bbox';
import { boxHeight, boxWidth, isEmptyBox } from '../geometry/bbox';
import type { Mat2D } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';

/**
 * Transformación mundo ↔ pantalla. El mundo usa Y hacia arriba; la pantalla Y hacia abajo.
 * `scale` = píxeles CSS por unidad de dibujo.
 */
export class ViewTransform {
  center: Vec2 = { x: 0, y: 0 };
  scale = 4;
  width = 800;
  height = 600;
  minScale = 1e-9;
  maxScale = 1e9;

  private maxFiniteScale(center: Vec2): number {
    const magnitude = Math.max(1, Math.abs(center.x), Math.abs(center.y));
    return Math.min(this.maxScale, (Number.MAX_VALUE / 2) / magnitude);
  }

  clone(): ViewTransform {
    const v = new ViewTransform();
    Object.assign(v, { center: { ...this.center }, scale: this.scale, width: this.width, height: this.height });
    return v;
  }

  setSize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
  }

  toScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.center.x) * this.scale + this.width / 2, y: this.height / 2 - (p.y - this.center.y) * this.scale };
  }

  toWorld(p: Vec2): Vec2 {
    return { x: (p.x - this.width / 2) / this.scale + this.center.x, y: (this.height / 2 - p.y) / this.scale + this.center.y };
  }

  get worldPerPixel(): number {
    return 1 / this.scale;
  }

  /** Matriz mundo → pantalla (para ctx.setTransform, multiplicar por devicePixelRatio fuera). */
  matrix(): Mat2D {
    return { a: this.scale, b: 0, c: 0, d: -this.scale, e: this.width / 2 - this.center.x * this.scale, f: this.height / 2 + this.center.y * this.scale };
  }

  visibleBox(margin = 0): BBox {
    const a = this.toWorld({ x: -margin, y: this.height + margin });
    const b = this.toWorld({ x: this.width + margin, y: -margin });
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }

  zoomAt(screen: Vec2, factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = this.toWorld(screen);
    this.scale = Math.min(this.maxFiniteScale(this.center), Math.max(this.minScale, this.scale * factor));
    const after = this.toWorld(screen);
    this.center = { x: this.center.x + (before.x - after.x), y: this.center.y + (before.y - after.y) };
  }

  panPixels(dx: number, dy: number) {
    this.center = { x: this.center.x - dx / this.scale, y: this.center.y + dy / this.scale };
  }

  fit(box: BBox, marginPx = 32) {
    if (isEmptyBox(box) || ![box.minX, box.minY, box.maxX, box.maxY, marginPx].every(Number.isFinite) || marginPx < 0) return;
    const width = boxWidth(box);
    const height = boxHeight(box);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    const center = { x: box.minX / 2 + box.maxX / 2, y: box.minY / 2 + box.maxY / 2 };
    const maxScale = this.maxFiniteScale(center);
    if (this.width < 4 * marginPx || this.height < 4 * marginPx) {
      // vista aún sin tamaño real: solo centrar
      this.center = center;
      this.scale = Math.min(this.scale, maxScale);
      return;
    }
    const w = Math.max(width, 1e-6);
    const h = Math.max(height, 1e-6);
    const sx = (this.width - 2 * marginPx) / w;
    const sy = (this.height - 2 * marginPx) / h;
    this.scale = Math.max(this.minScale, Math.min(maxScale, sx, sy));
    this.center = center;
  }

  /** Altura de vista en unidades (vistas guardadas). */
  get viewHeight(): number {
    return this.height / this.scale;
  }

  setViewHeight(h: number) {
    if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(this.height) || this.height <= 0) return;
    this.scale = Math.min(this.maxFiniteScale(this.center), Math.max(this.minScale, this.height / h));
  }
}
