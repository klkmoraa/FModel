import { evaluate } from '../lib/expr';
import { boxCenter } from '../geometry/bbox';
import type { Entity } from '../document/types';
import { formatLength } from './format';
import type { EvalContext } from './registry';
import { kindOf } from './registry';

/**
 * Campos vinculados a propiedades (equivalente a FIELD). Sintaxis `{{campo}}`:
 *
 * - `{{date}}`, `{{date:iso}}`, `{{time}}`
 * - `{{title}}`, `{{author}}`, `{{filename}}`, `{{sheet}}`
 * - `{{prop:NOMBRE}}` propiedad personalizada del dibujo
 * - `{{entity:ID.length|area|radius|layer|x|y|count}}` propiedad de un objeto
 * - `{{self.length}}` propiedad del objeto propietario
 * - `{{calc:EXPRESIÓN}}` cálculo con variables del dibujo y propiedades personalizadas
 * - `{{scale}}` escala de anotación activa (1:N)
 */
export function resolveFieldsText(text: string, ctx: EvalContext & { sheetName?: string; fileName?: string }, owner?: Entity): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, body: string) => {
    try {
      return resolveField(body, ctx, owner);
    } catch {
      return '####';
    }
  });
}

function fmt(ctx: EvalContext, v: number): string {
  if (!Number.isFinite(v)) return '####';
  const s = ctx.doc.settings;
  return formatLength(v, s.linearFormat, s.linearPrecision, '.');
}

function entityProp(ctx: EvalContext, e: Entity | undefined, prop: string): string {
  if (!e) return '####';
  const k = kindOf(e);
  switch (prop) {
    case 'length': {
      const l = k.length?.(e, ctx);
      return l === null || l === undefined ? '####' : fmt(ctx, l);
    }
    case 'area': {
      const a = k.area?.(e, ctx);
      return a === null || a === undefined ? '####' : fmt(ctx, a);
    }
    case 'radius':
      return 'radius' in e ? fmt(ctx, (e as { radius: number }).radius) : '####';
    case 'layer':
      return ctx.doc.data.layers.get(e.layer)?.name ?? '####';
    case 'type':
      return e.type;
    case 'x':
    case 'y': {
      const b = k.bbox(e, ctx);
      const center = boxCenter(b);
      return fmt(ctx, prop === 'x' ? center.x : center.y);
    }
    default: {
      const v = (e as unknown as Record<string, unknown>)[prop];
      return typeof v === 'number' ? fmt(ctx, v) : typeof v === 'string' ? v : '####';
    }
  }
}

function resolveField(body: string, ctx: EvalContext & { sheetName?: string; fileName?: string }, owner?: Entity): string {
  const s = ctx.doc.settings;
  const [head, ...restParts] = body.split(':');
  const rest = restParts.join(':');
  switch (head.trim().toLowerCase()) {
    case 'date': {
      const d = new Date();
      if (rest === 'iso') return d.toISOString().slice(0, 10);
      return d.toLocaleDateString();
    }
    case 'time':
      return new Date().toLocaleTimeString();
    case 'title':
      return s.title;
    case 'author':
      return s.author;
    case 'filename':
      return ctx.fileName || s.title;
    case 'sheet':
      return ctx.sheetName ?? '';
    case 'scale': {
      const k = ctx.annotationScale || 1;
      return k >= 1 ? `${k}:1` : `1:${Math.round((1 / k) * 1000) / 1000}`;
    }
    case 'prop':
      return s.customProperties[rest] ?? '####';
    case 'calc': {
      const v = evaluate(rest, (name) => {
        const p = s.customProperties[name];
        return p !== undefined ? Number(p) : undefined;
      });
      return fmt(ctx, v);
    }
    case 'entity': {
      const [id, prop = 'length'] = rest.split('.');
      return entityProp(ctx, ctx.doc.data.entities.get(id), prop);
    }
  }
  if (body.startsWith('self.')) return entityProp(ctx, owner, body.slice(5));
  return '####';
}
