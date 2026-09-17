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
    const before = this.toWorld(screen);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const after = this.toWorld(screen);
    this.center = { x: this.center.x + before.x - after.x, y: this.center.y + before.y - after.y };
  }

  panPixels(dx: number, dy: number) {
    this.center = { x: this.center.x - dx / this.scale, y: this.center.y + dy / this.scale };
  }

  fit(box: BBox, marginPx = 32) {
    if (isEmptyBox(box) || !Number.isFinite(box.minX)) return;
    if (this.width < 4 * marginPx || this.height < 4 * marginPx) {
      // vista aún sin tamaño real: solo centrar
      this.center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
      return;
    }
    const w = Math.max(boxWidth(box), 1e-6);
    const h = Math.max(boxHeight(box), 1e-6);
    const sx = (this.width - 2 * marginPx) / w;
    const sy = (this.height - 2 * marginPx) / h;
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, Math.min(sx, sy)));
    this.center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  }

  /** Altura de vista en unidades (vistas guardadas). */
  get viewHeight(): number {
    return this.height / this.scale;
  }

  setViewHeight(h: number) {
    if (h > 0) this.scale = this.height / h;
  }
}
