import type { Loop } from '../document/types';
import type { BBox } from '../geometry/bbox';
import { boxFromPoints } from '../geometry/bbox';
import { DEG } from '../geometry/angle';
import { pointInPolygon, polylineSignedArea, tessellatePolyline } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';

/** Línea de patrón (formato .pat): ángulo en grados, origen, desplazamiento (dx a lo largo, dy perpendicular), trazos. */
export interface PatternLine {
  angle: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  dashes: number[];
}

export interface HatchPatternDef {
  name: string;
  description: string;
  lines: PatternLine[];
}

const L = (angle: number, x: number, y: number, dx: number, dy: number, ...dashes: number[]): PatternLine => ({ angle, x, y, dx, dy, dashes });

/** Subconjunto de acadiso.pat (valores en mm). */
export const HATCH_PATTERNS: HatchPatternDef[] = [
  { name: 'ANSI31', description: 'ANSI hierro, ladrillo, piedra', lines: [L(45, 0, 0, 0, 3.175)] },
  { name: 'ANSI32', description: 'ANSI acero', lines: [L(45, 0, 0, 0, 9.525), L(45, 4.49013, 0, 0, 9.525)] },
  { name: 'ANSI33', description: 'ANSI bronce, latón, cobre', lines: [L(45, 0, 0, 0, 6.35), L(45, 4.49013, 0, 0, 6.35, 3.175, -1.5875)] },
  { name: 'ANSI34', description: 'ANSI plástico, caucho', lines: [L(45, 0, 0, 0, 19.05), L(45, 4.49013, 0, 0, 19.05), L(45, 8.98026, 0, 0, 19.05), L(45, 13.4704, 0, 0, 19.05)] },
  { name: 'ANSI35', description: 'ANSI ladrillo refractario', lines: [L(45, 0, 0, 0, 6.35), L(45, 4.49013, 0, 0, 6.35, 7.9375, -1.5875, 0, -1.5875)] },
  { name: 'ANSI36', description: 'ANSI mármol, pizarra, vidrio', lines: [L(45, 0, 0, 5.55625, 3.175, 7.9375, -1.5875, 0, -1.5875)] },
  { name: 'ANSI37', description: 'ANSI plomo, zinc, magnesio', lines: [L(45, 0, 0, 0, 3.175), L(135, 0, 0, 0, 3.175)] },
  { name: 'ANSI38', description: 'ANSI aluminio', lines: [L(45, 0, 0, 0, 3.175), L(135, 0, 0, 6.35, 3.175, 7.9375, -4.7625)] },
  { name: 'ANGLE', description: 'Perfil angular de acero', lines: [L(0, 0, 0, 0, 6.985, 5.08, -1.905), L(90, 0, 0, 0, 6.985, 5.08, -1.905)] },
  { name: 'BRICK', description: 'Ladrillo', lines: [L(0, 0, 0, 0, 6.35), L(90, 0, 0, 6.35, 6.35, 6.35, -6.35), L(90, 3.175, 0, 6.35, 6.35, -6.35, 6.35)] },
  { name: 'CLAY', description: 'Arcilla', lines: [L(0, 0, 0, 0, 4.7625), L(0, 0, 0.79375, 0, 4.7625), L(0, 0, 1.5875, 0, 4.7625), L(0, 0, 3.175, 0, 4.7625, 4.7625, -3.175)] },
  { name: 'CROSS', description: 'Cruces', lines: [L(0, 0, 0, 6.35, 6.35, 3.175, -9.525), L(90, 1.5875, -1.5875, 6.35, 6.35, 3.175, -9.525)] },
  { name: 'DASH', description: 'Trazos', lines: [L(0, 0, 0, 3.175, 3.175, 3.175, -3.175)] },
  { name: 'DOTS', description: 'Puntos', lines: [L(0, 0, 0, 0.79375, 1.5875, 0, -1.5875)] },
  {
    name: 'EARTH',
    description: 'Tierra',
    lines: [
      L(0, 0, 0, 6.35, 6.35, 6.35, -6.35),
      L(0, 0, 2.38125, 6.35, 6.35, 6.35, -6.35),
      L(0, 0, 4.7625, 6.35, 6.35, 6.35, -6.35),
      L(90, 0.79375, 5.55625, 6.35, 6.35, 6.35, -6.35),
      L(90, 3.175, 5.55625, 6.35, 6.35, 6.35, -6.35),
      L(90, 5.55625, 5.55625, 6.35, 6.35, 6.35, -6.35),
    ],
  },
  { name: 'HEX', description: 'Hexágonos', lines: [L(0, 0, 0, 0, 5.49926, 3.175, -6.35), L(120, 0, 0, 0, 5.49926, 3.175, -6.35), L(60, 3.175, 0, 0, 5.49926, 3.175, -6.35)] },
  { name: 'HONEY', description: 'Panal', lines: [L(0, 0, 0, 4.7625, 2.74963, 3.175, -6.35), L(120, 0, 0, 4.7625, 2.74963, 3.175, -6.35), L(60, 0, 0, 4.7625, 2.74963, -6.35, 3.175)] },
  { name: 'INSUL', description: 'Aislamiento', lines: [L(0, 0, 0, 0, 9.525), L(0, 0, 3.175, 0, 9.525, 3.175, -3.175), L(0, 0, 6.35, 0, 9.525, 3.175, -3.175)] },
  { name: 'LINE', description: 'Líneas paralelas', lines: [L(0, 0, 0, 0, 3.175)] },
  { name: 'NET', description: 'Rejilla', lines: [L(0, 0, 0, 0, 3.175), L(90, 0, 0, 0, 3.175)] },
  { name: 'NET3', description: 'Rejilla triple', lines: [L(0, 0, 0, 0, 3.175), L(60, 0, 0, 0, 3.175), L(120, 0, 0, 0, 3.175)] },
  { name: 'SQUARE', description: 'Cuadrados', lines: [L(0, 0, 0, 0, 3.175, 3.175, -3.175), L(90, 0, 0, 0, 3.175, 3.175, -3.175)] },
  { name: 'STARS', description: 'Estrellas', lines: [L(0, 0, 0, 0, 5.49926, 3.175, -3.175), L(60, 0, 0, 0, 5.49926, 3.175, -3.175), L(120, 1.5875, 2.74963, 0, 5.49926, 3.175, -3.175)] },
  { name: 'STEEL', description: 'Acero', lines: [L(45, 0, 0, 0, 3.175), L(45, 0, 1.5875, 0, 3.175)] },
  { name: 'TRIANG', description: 'Triángulos', lines: [L(60, 0, 0, 4.7625, 8.24889, 4.7625, -4.7625), L(120, 0, 0, 4.7625, 8.24889, 4.7625, -4.7625), L(0, -2.38125, 4.12444, 4.7625, 8.24889, 4.7625, -4.7625)] },
  { name: 'ZIGZAG', description: 'Zigzag', lines: [L(0, 0, 0, 3.175, 3.175, 3.175, -3.175), L(90, 3.175, 0, 3.175, 3.175, 3.175, -3.175)] },
  { name: 'AR-B816', description: 'Bloque de hormigón 8x16', lines: [L(0, 0, 0, 0, 203.2), L(90, 0, 0, 203.2, 203.2, 203.2, -203.2)] },
  { name: 'AR-SAND', description: 'Arena (aprox.)', lines: [L(37.5, 0, 0, 1.123, 1.97, 0, -1.6, 0, -2.1), L(7.5, 0, 0, 2.1, 1.3, 0, -1.9, 0, -2.4)] },
  { name: 'AR-CONC', description: 'Hormigón (aprox.)', lines: [L(50, 0, 0, 4.12, -2.2, 0.75, -8.25), L(355, 0, 0, -2.44, 4.66, 0.6, -6.6), L(100.45, 0.6, -0.06, 4.36, 4.87, 0.64, -7.0)] },
];

export function findPattern(name: string): HatchPatternDef | undefined {
  const n = name.toUpperCase();
  return HATCH_PATTERNS.find((p) => p.name === n);
}

export interface HatchSegments {
  segments: [Vec2, Vec2][];
  dots: Vec2[];
  /** true si se omitió por densidad excesiva */
  tooDense: boolean;
}

/** Clasifica lazos por profundidad de anidamiento. */
export function classifyLoops(polys: Vec2[][]): number[] {
  return polys.map((poly, i) => {
    const probe = poly[0];
    let depth = 0;
    polys.forEach((other, j) => {
      if (i !== j && other.length > 2 && Math.abs(signedArea(other)) > Math.abs(signedArea(poly)) && pointInPolygon(probe, other)) depth++;
    });
    return depth;
  });
}

function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) a += pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y;
  return a / 2;
}

export function hatchPolygons(loops: Loop[], islandStyle: 'normal' | 'outer' | 'ignore', tol = 1e-2): Vec2[][] {
  const polys = loops.map((l) => tessellatePolyline(l.vertices, true, tol)).filter((p) => p.length > 2);
  if (islandStyle === 'normal' || polys.length <= 1) return polys;
  const depth = classifyLoops(polys);
  if (islandStyle === 'ignore') return polys.filter((_, i) => depth[i] === 0);
  return polys.filter((_, i) => depth[i] <= 1);
}

export function hatchBox(polys: Vec2[][]): BBox {
  return boxFromPoints(polys.flat());
}

/**
 * Genera los segmentos de un patrón dentro de los lazos (regla par-impar).
 * `angle` y `scale` son los del sombreado; `origin` es el origen del patrón.
 */
export function generateHatch(
  polys: Vec2[][],
  lines: PatternLine[],
  angle: number,
  scale: number,
  origin: Vec2,
  maxLines = 12000,
): HatchSegments {
  const segments: [Vec2, Vec2][] = [];
  const dots: Vec2[] = [];
  const box = hatchBox(polys);
  if (!polys.length || !(box.maxX > box.minX)) return { segments, dots, tooDense: false };
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const edges: [Vec2, Vec2][] = [];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) edges.push([poly[i], poly[(i + 1) % poly.length]]);

  let totalLines = 0;
  for (const pl of lines) {
    const a = pl.angle * DEG + angle;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const n = { x: -u.y, y: u.x };
    const ox = pl.x * scale;
    const oy = pl.y * scale;
    const base = { x: origin.x + ox * ca - oy * sa, y: origin.y + ox * sa + oy * ca };
    const dy = pl.dy * scale;
    const dx = pl.dx * scale;
    if (Math.abs(dy) < 1e-12) continue;
    const projs = corners.map((c) => (c.x - base.x) * n.x + (c.y - base.y) * n.y);
    const kmin = Math.floor(Math.min(...projs) / dy);
    const kmax = Math.ceil(Math.max(...projs) / dy);
    const lo = Math.min(kmin, kmax);
    const hi = Math.max(kmin, kmax);
    totalLines += hi - lo + 1;
    if (totalLines > maxLines) return { segments: [], dots: [], tooDense: true };
    const dashes = pl.dashes.map((d) => d * scale);
    const patLen = dashes.reduce((s, d) => s + Math.abs(d), 0);
    for (let k = lo; k <= hi; k++) {
      const p = { x: base.x + k * (dx * u.x + dy * n.x), y: base.y + k * (dx * u.y + dy * n.y) };
      const ts: number[] = [];
      for (const [e0, e1] of edges) {
        const ex = e1.x - e0.x;
        const ey = e1.y - e0.y;
        const den = u.x * ey - u.y * ex;
        if (Math.abs(den) < 1e-15) continue;
        const wx = e0.x - p.x;
        const wy = e0.y - p.y;
        const t = (wx * ey - wy * ex) / den;
        const s = (wx * u.y - wy * u.x) / den;
        // semiabierto para no contar dos veces el vértice compartido
        if (s >= 0 && s < 1) ts.push(t);
      }
      if (ts.length < 2) continue;
      ts.sort((x, y) => x - y);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const s0 = ts[i];
        const s1 = ts[i + 1];
        if (s1 - s0 < 1e-12) continue;
        if (!dashes.length || patLen < 1e-12) {
          segments.push([
            { x: p.x + u.x * s0, y: p.y + u.y * s0 },
            { x: p.x + u.x * s1, y: p.y + u.y * s1 },
          ]);
          continue;
        }
        const j0 = Math.floor(s0 / patLen);
        const j1 = Math.ceil(s1 / patLen);
        if (j1 - j0 > 5000) {
          segments.push([
            { x: p.x + u.x * s0, y: p.y + u.y * s0 },
            { x: p.x + u.x * s1, y: p.y + u.y * s1 },
          ]);
          continue;
        }
        for (let j = j0; j <= j1; j++) {
          let pos = j * patLen;
          for (const d of dashes) {
            if (d > 0) {
              const a0 = Math.max(pos, s0);
              const a1 = Math.min(pos + d, s1);
              if (a1 > a0) segments.push([
                { x: p.x + u.x * a0, y: p.y + u.y * a0 },
                { x: p.x + u.x * a1, y: p.y + u.y * a1 },
              ]);
            } else if (d === 0 && pos >= s0 && pos <= s1) {
              dots.push({ x: p.x + u.x * pos, y: p.y + u.y * pos });
            }
            pos += Math.abs(d);
          }
        }
      }
    }
  }
  return { segments, dots, tooDense: false };
}

/** Líneas de patrón para un sombreado definido por el usuario. */
export function userPatternLines(spacing: number, double: boolean): PatternLine[] {
  const lines = [L(0, 0, 0, 0, spacing)];
  if (double) lines.push(L(90, 0, 0, 0, spacing));
  return lines;
}

export function loopArea(loop: Loop): number {
  return Math.abs(polylineSignedArea(loop.vertices));
}
