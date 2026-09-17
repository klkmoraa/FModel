import type { BBox } from '../geometry/bbox';
import type { Curve } from '../geometry/curves';
import type { Mat2D } from '../geometry/matrix';
import type { Vec2 } from '../geometry/vec';
import type { CadDocument } from '../document/document';
import type { DynamicInstanceState, Entity, EntityOf, EntityType, Id } from '../document/types';
import type { DisplayItem } from './graphics';

export type SnapType =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'node'
  | 'geocenter'
  | 'quadrant'
  | 'intersection'
  | 'extension'
  | 'insertion'
  | 'perpendicular'
  | 'tangent'
  | 'nearest'
  | 'parallel'
  | 'appint';

export const ALL_SNAP_TYPES: SnapType[] = [
  'endpoint',
  'midpoint',
  'center',
  'node',
  'geocenter',
  'quadrant',
  'intersection',
  'extension',
  'insertion',
  'perpendicular',
  'tangent',
  'nearest',
  'parallel',
  'appint',
];

export interface SnapPointDef {
  type: SnapType;
  p: Vec2;
}

export type GripShape = 'square' | 'rect-mid' | 'triangle' | 'arrow' | 'circle' | 'diamond' | 'lookup' | 'flip' | 'visibility' | 'rotation';

export interface GripDef {
  id: string;
  p: Vec2;
  shape: GripShape;
  /** dirección para flechas/triángulos */
  dir?: Vec2;
  hint?: string;
  /** grip de parámetro dinámico */
  paramId?: Id;
}

export interface TextMeasurer {
  (text: string, font: string, height: number, opts?: { bold?: boolean; italic?: boolean }): number;
}

export interface BlockEvaluation {
  entities: Entity[];
  /** clave de variante para cachés (dinámicos) */
  variant: string;
  basePoint: Vec2;
}

export interface BlockCacheEntry {
  /** curvas en coordenadas del bloque (sin atributos) */
  curves: Curve[];
  bbox: BBox;
  snaps: SnapPointDef[];
  /** definiciones de atributo evaluadas */
  attdefs: Entity[];
}

export interface EvalContext {
  doc: CadDocument;
  measureText: TextMeasurer;
  /** Entidades evaluadas de una definición (aplicando parámetros/acciones/visibilidad si es dinámico). */
  evaluateBlock(blockId: Id, dyn?: DynamicInstanceState): BlockEvaluation;
  /** Geometría derivada cacheada de una definición/variante. */
  blockCache(blockId: Id, dyn?: DynamicInstanceState): BlockCacheEntry;
  /** Grips de parámetros dinámicos en coordenadas del propietario. */
  dynamicGrips?(e: Entity): GripDef[];
  /** Arrastre de un grip dinámico; devuelve la instancia actualizada. */
  moveDynamicGrip?(e: Entity, gripId: string, to: Vec2): Entity | null;
  /** Escala de anotación activa para objetos anotativos (papel/modelo). */
  annotationScale: number;
  /** Resuelve un campo {{…}} en texto. */
  resolveFields(text: string, owner?: Entity): string;
  /** Profundidad de anidamiento de bloques para evitar recursión infinita. */
  depth: number;
  /**
   * Segmentos vectoriales de una página PDF en coordenadas del cuadrado unidad (0–1, Y arriba),
   * con consulta por caja. null mientras se extraen o si el PDF no tiene geometría vectorial.
   */
  pdfGeometry?(assetId: Id, page: number): PdfSegmentIndex | null;
}

export interface PdfSegmentIndex {
  /** número de segmentos */
  count: number;
  /** segmentos [x1, y1, x2, y2] que tocan la caja (coordenadas del cuadrado unidad) */
  query(box: BBox): number[][];
}

export interface EntityKind<E extends Entity = Entity> {
  type: E['type'];
  /** Descomposición geométrica en el espacio del propietario (snaps, intersecciones, recorte). */
  curves(e: E, ctx: EvalContext): Curve[];
  bbox(e: E, ctx: EvalContext): BBox;
  graphics(e: E, ctx: EvalContext): DisplayItem[];
  /** Devuelve la entidad transformada (puede cambiar de tipo, p. ej. círculo → elipse) o null si no se admite. */
  transform(e: E, m: Mat2D, ctx: EvalContext): Entity | null;
  snapPoints(e: E, ctx: EvalContext): SnapPointDef[];
  grips(e: E, ctx: EvalContext): GripDef[];
  moveGrip(e: E, gripId: string, to: Vec2, ctx: EvalContext): Entity | null;
  /** Contorno cerrado para selección por área (textos, imágenes, rellenos). */
  outline?(e: E, ctx: EvalContext): Vec2[] | null;
  /** Relleno que captura clics interiores. */
  filledHit?(e: E, ctx: EvalContext): boolean;
  explode?(e: E, ctx: EvalContext): Entity[] | null;
  /** Referencias a objetos solo cerca de una caja (objetos con mucha geometría, como calcos PDF). */
  snapPointsNear?(e: E, ctx: EvalContext, box: BBox): SnapPointDef[];
  /** Curvas solo cerca de una caja (referencias a objetos, cercano, intersección). */
  curvesNear?(e: E, ctx: EvalContext, box: BBox): Curve[];
  length?(e: E, ctx: EvalContext): number | null;
  area?(e: E, ctx: EvalContext): number | null;
}

const registry = new Map<EntityType, EntityKind>();

export function registerKind<T extends EntityType>(kind: EntityKind<EntityOf<T>>): void {
  registry.set(kind.type, kind as unknown as EntityKind);
}

export function kindOf<E extends Entity>(e: E | EntityType): EntityKind<E> {
  const type = typeof e === 'string' ? e : e.type;
  const k = registry.get(type);
  if (!k) throw new Error(`Tipo de entidad no registrado: ${type}`);
  return k as unknown as EntityKind<E>;
}

export function hasKind(type: string): type is EntityType {
  return registry.has(type as EntityType);
}

export function registeredTypes(): EntityType[] {
  return [...registry.keys()];
}
