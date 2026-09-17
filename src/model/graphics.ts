import type { BBox } from '../geometry/bbox';
import { emptyBox, expandPoint } from '../geometry/bbox';
import type { Curve } from '../geometry/curves';
import { ellipsePointAtAngle, tessellateCurve } from '../geometry/curves';
import type { Mat2D } from '../geometry/matrix';
import { applyToPoint } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { len } from '../geometry/vec';
import type { ColorValue, Id } from '../document/types';

/**
 * Lista de visualización independiente del backend (Canvas, SVG, PDF).
 * Las coordenadas están en el espacio del propietario de la entidad.
 */
export type PathCmd =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  /** arco circular: ángulos en radianes, ccw según el barrido */
  | { t: 'A'; cx: number; cy: number; r: number; a0: number; a1: number; ccw: boolean }
  /** arco elíptico, rot = ángulo del eje mayor */
  | { t: 'E'; cx: number; cy: number; rx: number; ry: number; rot: number; a0: number; a1: number; ccw: boolean }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' };

export interface StyleOverride {
  color?: ColorValue;
  lineweight?: number;
  linetype?: string;
  /** relleno explícito (p. ej. degradados simplificados) */
  fillColor?: ColorValue;
}

export interface PathItem {
  k: 'path';
  cmds: PathCmd[];
  stroke: boolean;
  fill?: 'nonzero' | 'evenodd';
  style?: StyleOverride;
  /** no aplicar tipo de línea (flechas, rellenos) */
  solid?: boolean;
  /** ancho de trazo en unidades de dibujo (polilíneas con grosor) */
  width?: number;
  /** geometría infinita (rayo/xline): el renderizador la recorta a la vista */
  infinite?: { o: Vec2; d: Vec2; ray: boolean };
}

export interface TextItem {
  k: 'text';
  text: string;
  x: number;
  y: number;
  height: number;
  rotation: number;
  widthFactor: number;
  oblique: number;
  font: string;
  align: 'left' | 'center' | 'right';
  baseline: 'alphabetic' | 'middle' | 'top' | 'bottom';
  bold?: boolean;
  italic?: boolean;
  style?: StyleOverride;
  /** relleno de fondo detrás del texto (cotas, mtext con máscara) */
  background?: { color: ColorValue | 'Background'; margin: number };
}

export interface ImageItem {
  k: 'image';
  assetId: Id;
  /** transforma el cuadrado unidad [0,1]² (origen abajo-izquierda) al espacio del propietario */
  m: Mat2D;
  clip?: Vec2[];
  opacity: number;
  fade: number;
  brightness?: number;
  contrast?: number;
  monochrome?: boolean;
  pdfPage?: number;
  frame: boolean;
}

export interface WipeoutItem {
  k: 'wipeout';
  cmds: PathCmd[];
  frame: boolean;
}

export interface BlockItem {
  k: 'block';
  blockId: Id;
  /** clave de variante (bloques dinámicos) */
  variant: string;
  m: Mat2D;
}

/** Punto con estilo PDMODE; size ≤ 0 = relativo a la pantalla (porcentaje de la altura de vista). */
export interface PointItem {
  k: 'point';
  x: number;
  y: number;
  mode: number;
  size: number;
  style?: StyleOverride;
}

export type DisplayItem = PathItem | TextItem | ImageItem | WipeoutItem | BlockItem | PointItem;

export class PathBuilder {
  cmds: PathCmd[] = [];
  moveTo(p: Vec2) {
    this.cmds.push({ t: 'M', x: p.x, y: p.y });
    return this;
  }
  lineTo(p: Vec2) {
    this.cmds.push({ t: 'L', x: p.x, y: p.y });
    return this;
  }
  close() {
    this.cmds.push({ t: 'Z' });
    return this;
  }
  polyline(pts: readonly Vec2[], closed = false) {
    if (!pts.length) return this;
    this.moveTo(pts[0]);
    for (let i = 1; i < pts.length; i++) this.lineTo(pts[i]);
    if (closed) this.close();
    return this;
  }
  /** Añade una curva continuando el subtrazado actual (connect=true) o empezando uno nuevo. */
  curve(c: Curve, connect = false) {
    switch (c.kind) {
      case 'line':
        if (!connect) this.moveTo(c.a);
        this.lineTo(c.b);
        break;
      case 'arc': {
        const a1 = c.a0 + c.sweep;
        if (!connect) this.moveTo({ x: c.c.x + c.r * Math.cos(c.a0), y: c.c.y + c.r * Math.sin(c.a0) });
        this.cmds.push({ t: 'A', cx: c.c.x, cy: c.c.y, r: c.r, a0: c.a0, a1, ccw: c.sweep >= 0 });
        break;
      }
      case 'ellipse': {
        const rx = len(c.major);
        const rot = Math.atan2(c.major.y, c.major.x);
        if (!connect) this.moveTo(ellipsePointAtAngle(c, c.a0));
        this.cmds.push({ t: 'E', cx: c.c.x, cy: c.c.y, rx, ry: rx * c.ratio, rot, a0: c.a0, a1: c.a0 + c.sweep, ccw: c.sweep >= 0 });
        break;
      }
      default: {
        const pts = tessellateCurve(c, 1e-3);
        if (!pts.length) break;
        if (!connect) this.moveTo(pts[0]);
        for (let i = 1; i < pts.length; i++) this.lineTo(pts[i]);
      }
    }
    return this;
  }
  curves(cs: readonly Curve[], closed = false) {
    cs.forEach((c, i) => this.curve(c, i > 0));
    if (closed && cs.length) this.close();
    return this;
  }
}

export const strokePath = (cmds: PathCmd[], style?: StyleOverride, solid = false): PathItem => ({ k: 'path', cmds, stroke: true, style, solid });
export const fillPath = (cmds: PathCmd[], rule: 'nonzero' | 'evenodd' = 'evenodd', style?: StyleOverride): PathItem => ({
  k: 'path',
  cmds,
  stroke: false,
  fill: rule,
  style,
  solid: true,
});

export function curvesItem(cs: readonly Curve[], closed = false, style?: StyleOverride): PathItem {
  return strokePath(new PathBuilder().curves(cs, closed).cmds, style);
}

/** Aproxima los comandos de trazado a una lista de puntos (para cajas y exportadores sin arcos). */
export function flattenPath(cmds: readonly PathCmd[], tol = 1e-3): Vec2[][] {
  const out: Vec2[][] = [];
  let cur: Vec2[] = [];
  let start: Vec2 | null = null;
  for (const c of cmds) {
    switch (c.t) {
      case 'M':
        if (cur.length) out.push(cur);
        cur = [{ x: c.x, y: c.y }];
        start = { x: c.x, y: c.y };
        break;
      case 'L':
        cur.push({ x: c.x, y: c.y });
        break;
      case 'A': {
        const sweep = sweepOf(c.a0, c.a1, c.ccw);
        const pts = tessellateCurve({ kind: 'arc', c: { x: c.cx, y: c.cy }, r: c.r, a0: c.a0, sweep }, tol);
        cur.push(...pts);
        break;
      }
      case 'E': {
        const sweep = sweepOf(c.a0, c.a1, c.ccw);
        const pts = tessellateCurve(
          { kind: 'ellipse', c: { x: c.cx, y: c.cy }, major: { x: c.rx * Math.cos(c.rot), y: c.rx * Math.sin(c.rot) }, ratio: c.rx ? c.ry / c.rx : 1, a0: c.a0, sweep },
          tol,
        );
        cur.push(...pts);
        break;
      }
      case 'C': {
        const p0 = cur[cur.length - 1] ?? { x: c.x, y: c.y };
        for (let i = 1; i <= 16; i++) {
          const t = i / 16;
          const mt = 1 - t;
          cur.push({
            x: mt * mt * mt * p0.x + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t * t * t * c.x,
            y: mt * mt * mt * p0.y + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t * t * t * c.y,
          });
        }
        break;
      }
      case 'Z':
        if (start) cur.push({ ...start });
        break;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function sweepOf(a0: number, a1: number, ccw: boolean): number {
  // a1 − a0 conserva el signo del barrido original salvo círculos completos
  const s = a1 - a0;
  if (Math.abs(s) >= Math.PI * 2 - 1e-12) return s;
  if (ccw && s < 0) return s + Math.PI * 2;
  if (!ccw && s > 0) return s - Math.PI * 2;
  return s;
}

export function pathBBox(cmds: readonly PathCmd[]): BBox {
  const b = emptyBox();
  for (const poly of flattenPath(cmds, 1e-2)) for (const p of poly) expandPoint(b, p);
  return b;
}

export function transformPathCmds(cmds: readonly PathCmd[], m: Mat2D): PathCmd[] {
  // Los arcos no se conservan bajo transformaciones generales: se aplanan.
  const out: PathCmd[] = [];
  for (const poly of flattenPath(cmds, 1e-3)) {
    poly.forEach((p, i) => {
      const q = applyToPoint(m, p);
      out.push({ t: i === 0 ? 'M' : 'L', x: q.x, y: q.y });
    });
  }
  return out;
}
