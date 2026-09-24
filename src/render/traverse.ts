import type { BBox } from '../geometry/bbox';
import { transformBox } from '../geometry/bbox';
import type { Mat2D } from '../geometry/matrix';
import { invert } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import { displayColor, toGrayscale } from '../document/colors';
import type { CadDocument } from '../document/document';
import { LAYER0_ID } from '../document/defaults';
import type { ColorValue, Entity, Id, LayerRecord, ViewportEntity } from '../document/types';
import type { ModelContext } from '../model/context';
import type { DisplayItem, ImageItem, PathCmd, PathItem, PointItem, TextItem, WipeoutItem } from '../model/graphics';
import { kindOf } from '../model/registry';
import { entityVisible, layerVisible } from '../model/visibility';
import type { SpatialIndex } from '../spatial/spatialIndex';

export interface ResolvedStyle {
  /** color CSS #rrggbb */
  color: string;
  alpha: number;
  /** centésimas de mm (≥ 0) */
  lineweight: number;
  /** patrón en unidades del espacio actual, null = continua */
  dash: number[] | null;
  layer: Id;
}

/** Contexto de herencia para PorBloque. */
export interface InheritCtx {
  color: ColorValue;
  linetype: string;
  lineweight: number;
  transparency: number;
  layer: LayerRecord | undefined;
  colorHex: string;
}

export interface DrawSink {
  save(): void;
  restore(): void;
  transform(m: Mat2D): void;
  clip(cmds: PathCmd[]): void;
  stroke(item: PathItem, style: ResolvedStyle, owner: Entity): void;
  fill(item: PathItem, style: ResolvedStyle, fillColor: string, owner: Entity): void;
  text(item: TextItem, style: ResolvedStyle, owner: Entity): void;
  image(item: ImageItem, style: ResolvedStyle, owner: Entity): void;
  point(item: PointItem, style: ResolvedStyle, owner: Entity): void;
  wipeout(item: WipeoutItem, style: ResolvedStyle, owner: Entity): void;
  /** línea infinita recortada a la vista */
  infinite(o: Vec2, d: Vec2, ray: boolean, style: ResolvedStyle, owner: Entity): void;
  /** límite de profundidad/cancelación */
  aborted?(): boolean;
}

export interface TraverseEnv {
  doc: CadDocument;
  ctx: ModelContext;
  dark: boolean;
  background: string;
  plotting: boolean;
  plotStyle: 'color' | 'monochrome' | 'grayscale';
  hidden?: ReadonlySet<Id>;
  isolated?: ReadonlySet<Id> | null;
  viewport: ViewportEntity | null;
  /** factor para patrones de línea (1/escala de viewport con PSLTSCALE) */
  dashScale: number;
  /** color de sustitución (resaltado de selección) */
  forceColor?: string;
  /** atenuación de todo lo dibujado (0–1), p. ej. edición en contexto */
  fade?: number;
  /** false: la transparencia de objetos y capas no se muestra (TRANSPARENCYDISPLAY) */
  showTransparency?: boolean;
  construction?: string;
}

// ------------------------------------------------------------------ cachés

const itemCache = new WeakMap<Entity, { key: string; items: DisplayItem[] }>();
const fieldCache = new WeakMap<Entity, { hasFields: boolean; hasClockFields: boolean }>();

function fieldTexts(e: Entity): string[] {
  switch (e.type) {
    case 'text': return [e.text];
    case 'mtext': return [e.contents];
    case 'dimension': return e.textOverride ? [e.textOverride] : [];
    case 'insert': return e.attributes.map((attribute) => attribute.value);
    case 'mleader':
      return e.content.type === 'mtext' ? [e.content.text] : e.content.type === 'block' ? Object.values(e.content.attributes) : [];
    case 'table': return e.cells.flatMap((row) => row.map((cell) => cell.text));
    default: return [];
  }
}

function fieldsFor(e: Entity): { hasFields: boolean; hasClockFields: boolean } {
  const cached = fieldCache.get(e);
  if (cached) return cached;
  const texts = fieldTexts(e);
  const fields = texts.flatMap((text) => [...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1].trim()));
  const value = {
    hasFields: fields.length > 0,
    hasClockFields: fields.some((field) => /^(date|time)(?::|$)/i.test(field)),
  };
  fieldCache.set(e, value);
  return value;
}

function cacheKey(e: Entity, ctx: ModelContext): string {
  const base = `${ctx.blocksVersion}|${ctx.annotationScale}`;
  const fields = fieldsFor(e);
  if (!fields.hasFields) return base;
  const clock = fields.hasClockFields ? Math.floor(Date.now() / 1000) : '';
  return `${base}|${ctx.doc.version}|${ctx.sheetName}|${ctx.fileName}|${clock}`;
}

export function displayItems(e: Entity, ctx: ModelContext): DisplayItem[] {
  const key = cacheKey(e, ctx);
  const c = itemCache.get(e);
  if (c && c.key === key) return c.items;
  let items: DisplayItem[];
  try {
    items = kindOf(e).graphics(e, ctx);
  } catch (err) {
    console.warn('graphics failed', e.type, e.id, err);
    items = [];
  }
  itemCache.set(e, { key, items });
  return items;
}

// ------------------------------------------------------------------ estilos

function layerOf(doc: CadDocument, id: Id): LayerRecord | undefined {
  return doc.data.layers.get(id);
}

function transparencyAlpha(t: number): number {
  return Math.max(0.1, 1 - Math.max(0, Math.min(90, t)) / 100);
}

export function resolveEntityInherit(env: TraverseEnv, e: Entity, parent: InheritCtx | null): InheritCtx {
  const doc = env.doc;
  let layer = layerOf(doc, e.layer);
  if (parent && e.layer === LAYER0_ID && parent.layer) layer = parent.layer;
  const ovr = env.viewport && layer ? env.viewport.layerOverrides[layer.id] : undefined;
  const layerColor = ovr?.color ?? layer?.color ?? 'aci:7';
  const color = e.color === 'ByLayer' ? layerColor : e.color === 'ByBlock' ? (parent?.color ?? 'aci:7') : e.color;
  const linetype = e.linetype === 'ByLayer' ? (ovr?.linetype ?? layer?.linetype ?? 'lt-continuous') : e.linetype === 'ByBlock' ? (parent?.linetype ?? 'lt-continuous') : e.linetype;
  const lwLayer = ovr?.lineweight ?? layer?.lineweight ?? -3;
  const lineweight = e.lineweight === -1 ? lwLayer : e.lineweight === -2 ? (parent?.lineweight ?? -3) : e.lineweight;
  const trLayer = ovr?.transparency ?? layer?.transparency ?? 0;
  const transparency = e.transparency === 'ByLayer' ? trLayer : e.transparency === 'ByBlock' ? (parent?.transparency ?? 0) : e.transparency;
  return { color, linetype, lineweight, transparency, layer, colorHex: displayColor(color, env.dark) };
}

function plotColor(env: TraverseEnv, hex: string): string {
  if (env.forceColor) return env.forceColor;
  if (env.plotStyle === 'monochrome') return '#000000';
  if (env.plotStyle === 'grayscale') return toGrayscale(hex);
  return hex;
}

export function resolveItemStyle(env: TraverseEnv, inh: InheritCtx, e: Entity, override?: { color?: ColorValue; lineweight?: number; linetype?: string }, solid = false): ResolvedStyle {
  let colorHex = inh.colorHex;
  if (override?.color && override.color !== 'ByBlock') {
    colorHex = override.color === 'ByLayer' ? displayColor(inh.layer?.color ?? 'aci:7', env.dark) : displayColor(override.color, env.dark);
  }
  if (e.construction && env.construction && !env.forceColor) colorHex = env.construction;
  let lineweight = inh.lineweight;
  if (override?.lineweight !== undefined && override.lineweight !== -2) lineweight = override.lineweight === -1 ? (inh.layer?.lineweight ?? -3) : override.lineweight;
  if (lineweight < 0) lineweight = 25;
  let dash: number[] | null = null;
  if (!solid) {
    const ltId = override?.linetype && override.linetype !== 'ByBlock' ? override.linetype : inh.linetype;
    const lt = env.doc.data.linetypes.get(ltId) ?? [...env.doc.data.linetypes.values()].find((l) => l.name.toLowerCase() === String(ltId).toLowerCase());
    if (lt && lt.pattern.length) {
      const k = env.doc.settings.ltscale * (e.linetypeScale || 1) * env.dashScale;
      dash = lt.pattern.map((v) => v * k);
    }
    if (e.construction && !dash) dash = null;
  }
  const fade = env.fade ?? 0;
  return {
    color: plotColor(env, colorHex),
    alpha: (env.showTransparency === false ? 1 : transparencyAlpha(inh.transparency)) * (1 - fade),
    lineweight,
    dash,
    layer: inh.layer?.id ?? LAYER0_ID,
  };
}

// ------------------------------------------------------------------ recorrido

export function drawEntity(sink: DrawSink, env: TraverseEnv, e: Entity, parent: InheritCtx | null, depth = 0) {
  if (depth > 12) return;
  const inh = resolveEntityInherit(env, e, parent);
  const items = displayItems(e, env.ctx);
  for (const it of items) {
    switch (it.k) {
      case 'path': {
        if (it.infinite) {
          sink.infinite(it.infinite.o, it.infinite.d, it.infinite.ray, resolveItemStyle(env, inh, e, it.style), e);
          break;
        }
        if (it.fill) {
          const st = resolveItemStyle(env, inh, e, it.style, true);
          let fillColor = st.color;
          if (it.style?.fillColor && !env.forceColor) {
            fillColor = it.style.fillColor === 'ByBlock' ? inh.colorHex : it.style.fillColor === 'ByLayer' ? displayColor(inh.layer?.color ?? 'aci:7', env.dark) : displayColor(it.style.fillColor, env.dark);
            fillColor = plotColor(env, fillColor);
          }
          sink.fill(it, st, fillColor, e);
        }
        if (it.stroke) sink.stroke(it, resolveItemStyle(env, inh, e, it.style, it.solid), e);
        break;
      }
      case 'text':
        sink.text(it, resolveItemStyle(env, inh, e, it.style, true), e);
        break;
      case 'image':
        sink.image(it, resolveItemStyle(env, inh, e, undefined, true), e);
        break;
      case 'wipeout':
        sink.wipeout(it, resolveItemStyle(env, inh, e, undefined, true), e);
        break;
      case 'point':
        sink.point(it, resolveItemStyle(env, inh, e, it.style, true), e);
        break;
      case 'block': {
        const ev = env.ctx.evaluateBlock(it.blockId, (e as { dynamic?: never }).dynamic);
        sink.save();
        try {
          sink.transform(it.m);
          for (const be of ev.entities) {
            if (be.type === 'attdef' && !be.constant) continue;
            if (!be.visible) continue;
            const bl = layerOf(env.doc, be.layer);
            if (be.layer === LAYER0_ID ? !layerVisible(inh.layer, { viewport: env.viewport, plotting: env.plotting }) : !layerVisible(bl, { viewport: env.viewport, plotting: env.plotting })) continue;
            if (env.plotting && be.construction) continue;
            if (be.type === 'attdef') {
              // atributo constante: se muestra su valor
              drawEntity(sink, env, { ...be, type: 'text', text: be.defaultValue, widthFactor: 1, oblique: 0 } as unknown as Entity, inh, depth + 1);
              continue;
            }
            drawEntity(sink, env, be, inh, depth + 1);
          }
        } finally {
          sink.restore();
        }
        break;
      }
    }
  }
}

/** Entidades visibles de un espacio, ordenadas por orden de dibujo. */
export function visibleEntities(env: TraverseEnv, owner: Id, index: SpatialIndex | null, box: BBox | null): Entity[] {
  const doc = env.doc;
  let list: Entity[];
  if (index && box) {
    list = [];
    for (const id of index.query(owner, box)) {
      const e = doc.entity(id);
      if (e) list.push(e);
    }
    list.sort((a, b) => a.order - b.order);
  } else list = doc.entitiesOf(owner);
  return list.filter((e) => entityVisible(doc, e, { hidden: env.hidden, isolated: env.isolated, viewport: env.viewport, plotting: env.plotting }));
}

export function drawSpace(sink: DrawSink, env: TraverseEnv, owner: Id, index: SpatialIndex | null, box: BBox | null) {
  const list = visibleEntities(env, owner, index, box);
  for (const e of list) {
    if (e.type === 'viewport') continue;
    if (sink.aborted?.()) return;
    drawEntity(sink, env, e, null);
  }
}

/** Caja visible del modelo dentro de un viewport (coordenadas de modelo). */
export function viewportModelBox(vp: ViewportEntity, matrix: Mat2D, paperBox: BBox): BBox {
  return transformBox(paperBox, invert(matrix));
}
