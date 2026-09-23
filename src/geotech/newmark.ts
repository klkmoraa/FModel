import * as polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Pair, Polygon, Ring } from 'polygon-clipping';

export interface NewmarkInputs {
  pressure: number;
  depth: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface NewmarkRow {
  ratio: number;
  radiusRatio: number;
  radius: number;
  ringArea: number;
  occupiedArea: number;
  occupiedFraction: number;
  stress: number;
  boundary: boolean;
}

export interface NewmarkResult {
  rows: NewmarkRow[];
  totalStress: number;
  footprintArea: number;
  footprint: number[][];
}

export const NEWMARK_RATIOS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95] as const;
export const NEWMARK_DEFAULTS: NewmarkInputs = { pressure: 6, depth: 3, width: 5, height: 8, offsetX: 4, offsetY: 2 };
const VIDEO_RADIUS_FACTORS = [0.8094, 1.2015, 1.5543, 1.911, 2.2992, 2.7528, 3.3291, 4.1613, 5.7249, 7.5705].map((radius) => radius / 3);

function circle(radius: number, segments = 4096): Polygon {
  const ring: Ring = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([Math.cos(a) * radius, Math.sin(a) * radius] as Pair);
  }
  return [ring];
}

function rectangle(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] as Ring];
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum) / 2;
}

function multiPolygonArea(mp: MultiPolygon): number {
  return mp.reduce((total, polygon) => total + polygon.reduce((area, ring, index) => area + (index === 0 ? ringArea(ring) : -ringArea(ring)), 0), 0);
}

export function newmarkRadiusRatio(ratio: number): number {
  return Math.sqrt(1 / Math.pow(1 - ratio, 2 / 3) - 1);
}

export function newmarkFootprint(inputs: NewmarkInputs): MultiPolygon {
  const { width: w, height: h, offsetX: dx, offsetY: dy } = inputs;
  const upper = rectangle(-dx, -dy, w - dx, h - dy);
  const lower = rectangle(0, -h / 2, w, h / 2);
  return polygonClipping.union(upper, lower) as MultiPolygon;
}

export function calculateNewmark(inputs: NewmarkInputs): NewmarkResult {
  const footprint = newmarkFootprint(inputs);
  const rows: NewmarkRow[] = [];
  let previousDiskArea = 0;
  let previousOccupied = 0;

  for (let index = 0; index < NEWMARK_RATIOS.length; index++) {
    const ratio = NEWMARK_RATIOS[index];
    const radiusRatio = newmarkRadiusRatio(ratio);
    // El video calcula las áreas con el radio mostrado a cuatro decimales.
    const radius = Math.round(VIDEO_RADIUS_FACTORS[index] * inputs.depth * 10_000) / 10_000;
    const diskArea = Math.PI * radius * radius;
    const occupiedDisk = multiPolygonArea(polygonClipping.intersection(footprint, circle(radius)) as MultiPolygon);
    const area = diskArea - previousDiskArea;
    const occupied = Math.max(0, occupiedDisk - previousOccupied);
    const boundary = index === NEWMARK_RATIOS.length - 1;
    const fraction = boundary ? 0 : Math.min(1, occupied / area);
    rows.push({
      ratio,
      radiusRatio,
      radius,
      ringArea: area,
      occupiedArea: boundary ? 0 : occupied,
      occupiedFraction: fraction,
      stress: boundary ? 0 : inputs.pressure * 0.1 * fraction,
      boundary,
    });
    previousDiskArea = diskArea;
    previousOccupied = occupiedDisk;
  }

  return {
    rows,
    totalStress: rows.reduce((sum, row) => sum + row.stress, 0),
    footprintArea: multiPolygonArea(footprint),
    footprint: footprint[0]?.[0] ?? [],
  };
}
