import { TOL } from '../tolerance';
import type { Vec2 } from '../vec';
import { requireLayout } from './schema';
import type { ComponentPrimitive } from './types';
export const point = (x: number, y: number): Vec2 => ({ x, y });
export const line = (key: string, x: number, y: number, xx: number, yy: number): ComponentPrimitive => ({ key, type: 'line', start: point(x, y), end: point(xx, yy) });
export const poly = (key: string, coordinates: number[][], closed = true): ComponentPrimitive => ({ key, type: 'lwpolyline', vertices: coordinates.map(([x, y]) => point(x, y)), closed });
export const rect = (key: string, x: number, y: number, xx: number, yy: number) => poly(key, [[x, y], [xx, y], [xx, yy], [x, yy]]);
export function validatePrimitives(primitives: ComponentPrimitive[]): void {
  requireLayout(primitives.length > 0 && primitives.length <= 2000, 'Máximo 2000 primitivas por pieza.', 'Maximum 2000 primitives per component.');
  const keys = new Set<string>();
  const finitePoint = (p: Vec2) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  for (const p of primitives) {
    requireLayout(typeof p.key === 'string' && !!p.key && !keys.has(p.key)); keys.add(p.key);
    if (p.type === 'line') requireLayout(finitePoint(p.start) && finitePoint(p.end) && Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y) > TOL.LINEAR);
    else if (p.type === 'lwpolyline') {
      requireLayout(p.vertices.length >= (p.closed ? 3 : 2) && p.vertices.every(finitePoint));
      for (let i = 1; i < p.vertices.length + Number(p.closed); i++) { const a = p.vertices[i - 1], b = p.vertices[i % p.vertices.length]; requireLayout(Math.hypot(a.x - b.x, a.y - b.y) > TOL.LINEAR); }
    } else if (p.type === 'arc' || p.type === 'circle') {
      requireLayout(finitePoint(p.center) && Number.isFinite(p.radius) && p.radius > TOL.LINEAR);
      if (p.type === 'arc') requireLayout(Number.isFinite(p.startAngle) && Number.isFinite(p.endAngle) && p.endAngle - p.startAngle > TOL.ANGULAR && p.endAngle - p.startAngle < Math.PI * 2);
    } else if (p.type === 'text') requireLayout(finitePoint(p.position) && Number.isFinite(p.height) && p.height > TOL.LINEAR && Number.isFinite(p.rotation) && typeof p.text === 'string' && p.text.length > 0 && p.text.length < 100);
    else requireLayout(false);
  }
}
/** Same rigid transformation for command preview, insertion and parametric edits. */
export function transformComponent(primitives: ComponentPrimitive[], insertion: Vec2, rotation: number): ComponentPrimitive[] {
  requireLayout(Number.isFinite(insertion.x) && Number.isFinite(insertion.y) && Number.isFinite(rotation), 'Punto o giro inválido.', 'Invalid insertion point or rotation.');
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const at = (p: Vec2) => point(insertion.x + p.x * c - p.y * s, insertion.y + p.x * s + p.y * c);
  const result = primitives.map(p => p.type === 'line' ? { ...p, start: at(p.start), end: at(p.end) } : p.type === 'lwpolyline' ? { ...p, vertices: p.vertices.map(at) } : p.type === 'arc' ? { ...p, center: at(p.center), startAngle: p.startAngle + rotation, endAngle: p.endAngle + rotation } : p.type === 'circle' ? { ...p, center: at(p.center) } : { ...p, position: at(p.position), rotation: p.rotation + rotation });
  validatePrimitives(result); return result;
}
