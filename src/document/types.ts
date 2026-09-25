import type { Mat2D } from '../geometry/matrix';
import type { PolyVertex } from '../geometry/polyline';
import type { SplineData } from '../geometry/spline';
import type { Vec2 } from '../geometry/vec';

/**
 * Contrato del documento FModel 2D CAD.
 *
 * - Todas las coordenadas están en unidades de dibujo (mundo), nunca en píxeles.
 * - Las referencias internas usan IDs estables, no nombres: renombrar una capa,
 *   un estilo o un bloque no toca las entidades.
 * - Los registros son inmutables: una edición crea un objeto nuevo. El historial
 *   guarda las referencias antes/después.
 */
export type Id = string;

/** 'ByLayer' | 'ByBlock' | '#rrggbb' | 'aci:N' (índice de color AutoCAD 1–255). */
export type ColorValue = string;
export const BYLAYER = 'ByLayer';
export const BYBLOCK = 'ByBlock';

/** Grosor en centésimas de mm, como DXF. */
export const LW_BYLAYER = -1;
export const LW_BYBLOCK = -2;
export const LW_DEFAULT = -3;
export const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211] as const;

export type Transparency = 'ByLayer' | 'ByBlock' | number; // 0–90 %

export const MODEL_SPACE_ID = '*model';

export interface EntityBase {
  id: Id;
  type: EntityType;
  /** Espacio propietario: '*model', id de layout o id de definición de bloque. */
  owner: Id;
  layer: Id;
  color: ColorValue;
  /** 'ByLayer' | 'ByBlock' | id de tipo de línea */
  linetype: string;
  linetypeScale: number;
  lineweight: number;
  transparency: Transparency;
  visible: boolean;
  /** Bloqueo individual (además del bloqueo de capa). */
  locked?: boolean;
  /** Geometría de construcción: visible y referenciable, nunca se trazará. */
  construction?: boolean;
  /** Clave de orden de dibujo (DRAWORDER) dentro del propietario. */
  order: number;
  annotative?: boolean;
  /** Metadatos libres de usuario / integraciones. */
  meta?: Record<string, unknown>;
}

export interface PointEntity extends EntityBase {
  type: 'point';
  position: Vec2;
}

export interface LineEntity extends EntityBase {
  type: 'line';
  start: Vec2;
  end: Vec2;
}

export interface RayEntity extends EntityBase {
  type: 'ray';
  origin: Vec2;
  /** vector unitario */
  direction: Vec2;
}

export interface XLineEntity extends EntityBase {
  type: 'xline';
  origin: Vec2;
  direction: Vec2;
}

export interface CircleEntity extends EntityBase {
  type: 'circle';
  center: Vec2;
  radius: number;
}

/** Ángulos en radianes, sentido CCW de start a end (convención DXF). */
export interface ArcEntity extends EntityBase {
  type: 'arc';
  center: Vec2;
  radius: number;
  startAngle: number;
  endAngle: number;
}

/** majorAxis relativo al centro; ratio = menor/mayor; parámetros excéntricos CCW. */
export interface EllipseEntity extends EntityBase {
  type: 'ellipse';
  center: Vec2;
  majorAxis: Vec2;
  ratio: number;
  startParam: number;
  endParam: number;
}

export type PolyShape =
  | { kind: 'rectangle'; width: number; height: number; rotation: number; corner: Vec2; fillet?: number; chamfer?: [number, number] }
  | { kind: 'polygon'; sides: number; center: Vec2; radius: number; rotation: number; inscribed: boolean }
  | { kind: 'revcloud'; arcLength: number; style: 'normal' | 'calligraphy' };

export interface LwPolylineEntity extends EntityBase {
  type: 'lwpolyline';
  vertices: PolyVertex[];
  closed: boolean;
  constantWidth?: number;
  /** Forma paramétrica de origen (RECTANG, POLYGON, REVCLOUD); se descarta si se edita un vértice. */
  shape?: PolyShape;
}

/** Polilínea 2D "pesada" con suavizado (PEDIT Ajustar / Spline). */
export interface Polyline2dEntity extends EntityBase {
  type: 'polyline2d';
  vertices: PolyVertex[];
  closed: boolean;
  smoothing: 'none' | 'fit' | 'quadratic' | 'cubic';
}

export interface SplineEntity extends EntityBase {
  type: 'spline';
  spline: SplineData;
  method: 'fit' | 'cv';
  fitTolerance: number;
}

export interface MLineEntity extends EntityBase {
  type: 'mline';
  vertices: Vec2[];
  closed: boolean;
  style: Id;
  scale: number;
  justification: 'top' | 'zero' | 'bottom';
}

export interface Loop {
  vertices: PolyVertex[];
  closed: true;
}

export interface RegionEntity extends EntityBase {
  type: 'region';
  /** Primer lazo exterior; los siguientes pueden ser huecos (regla par-impar). */
  loops: Loop[];
}

export interface HatchPatternRef {
  type: 'predefined' | 'user' | 'solid' | 'gradient';
  name: string;
  angle: number;
  scale: number;
  /** espaciado para patrón 'user' */
  spacing: number;
  double: boolean;
  gradient?: { color1: ColorValue; color2: ColorValue; angle: number; centered: boolean; name: 'linear' | 'cylinder' | 'spherical' };
}

export interface HatchEntity extends EntityBase {
  type: 'hatch';
  loops: Loop[];
  pattern: HatchPatternRef;
  origin: Vec2;
  islandStyle: 'normal' | 'outer' | 'ignore';
  /** Color de fondo opcional */
  background?: ColorValue;
  /** IDs de entidades de contorno si es asociativo */
  associative?: Id[];
}

export type TextHAlign = 'left' | 'center' | 'right' | 'aligned' | 'middle' | 'fit';
export type TextVAlign = 'baseline' | 'bottom' | 'middle' | 'top';

export interface TextEntity extends EntityBase {
  type: 'text';
  position: Vec2;
  /** Segundo punto para alineaciones distintas de izquierda/base */
  alignPoint?: Vec2;
  text: string;
  height: number;
  rotation: number;
  widthFactor: number;
  oblique: number;
  style: Id;
  halign: TextHAlign;
  valign: TextVAlign;
}

/** Adjunto MTEXT 1–9: 1=Superior izq … 9=Inferior der. */
export type MTextAttachment = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface MTextEntity extends EntityBase {
  type: 'mtext';
  position: Vec2;
  width: number;
  height: number;
  rotation: number;
  style: Id;
  attachment: MTextAttachment;
  lineSpacing: number;
  /** Contenido con marcado mínimo compatible: \P párrafo, {\b…}, {\i…}, campos {{…}} */
  contents: string;
  background?: { color: ColorValue | 'Background'; offset: number };
}

export type ArrowType = 'closed-filled' | 'closed' | 'open' | 'open30' | 'dot' | 'dot-small' | 'tick' | 'architectural' | 'integral' | 'none';

export interface LeaderEntity extends EntityBase {
  type: 'leader';
  vertices: Vec2[];
  style: Id; // dimension style
  arrow: ArrowType;
  splined: boolean;
  hookline: boolean;
  /** Anotación asociada (mtext, bloque, tolerancia) */
  annotation?: Id;
}

export type MLeaderContent =
  | { type: 'mtext'; text: string; height: number; attachment: MTextAttachment; width: number; frame: boolean }
  | { type: 'block'; blockId: Id; scale: number; rotation: number; attributes: Record<string, string> }
  | { type: 'none' };

export interface MLeaderEntity extends EntityBase {
  type: 'mleader';
  style: Id;
  /** Cada línea de directriz va de la punta de flecha al punto de rellano. */
  leaders: { vertices: Vec2[] }[];
  landing: Vec2;
  doglegLength: number;
  /** Dirección del rellano: +1 derecha, −1 izquierda */
  direction: 1 | -1;
  content: MLeaderContent;
  overrides?: Partial<MLeaderStyleProps>;
}

export interface TableCell {
  text: string;
  align?: MTextAttachment;
  /** abarca columnas/filas (celda superior izquierda de la combinación) */
  colSpan?: number;
  rowSpan?: number;
  /** celda cubierta por una combinación */
  merged?: boolean;
  textHeight?: number;
  color?: ColorValue;
  fill?: ColorValue;
}

export interface TableEntity extends EntityBase {
  type: 'table';
  /** Esquina superior izquierda */
  position: Vec2;
  rotation: number;
  style: Id;
  rowHeights: number[];
  columnWidths: number[];
  cells: TableCell[][];
  /** Filas de título y encabezado según el estilo */
  titleRow: boolean;
  headerRow: boolean;
}

export interface WipeoutEntity extends EntityBase {
  type: 'wipeout';
  vertices: Vec2[];
  frame: boolean;
}

export interface ImageEntity extends EntityBase {
  type: 'image';
  assetId: Id;
  /** Esquina inferior izquierda */
  position: Vec2;
  /** Vector del borde inferior (ancho completo en unidades de dibujo) */
  u: Vec2;
  /** Vector del borde izquierdo (alto completo) */
  v: Vec2;
  /** Contorno de recorte en coordenadas normalizadas de imagen [0,1]² */
  clip?: Vec2[];
  clipEnabled: boolean;
  opacity: number;
  fade: number;
  brightness: number;
  contrast: number;
  monochrome?: boolean;
}

export interface PdfUnderlayEntity extends EntityBase {
  type: 'pdfunderlay';
  assetId: Id;
  page: number;
  position: Vec2;
  /** Unidades de dibujo por punto PDF */
  scale: number;
  rotation: number;
  clip?: Vec2[];
  clipEnabled: boolean;
  opacity: number;
  fade: number;
  monochrome: boolean;
}

export interface AttributeValue {
  tag: Id | string;
  value: string;
  /** Posición/altura/rotación sobrescritas por el usuario (en coordenadas del propietario) */
  position?: Vec2;
  height?: number;
  rotation?: number;
  invisible?: boolean;
}

/** Valores de instancia de un bloque dinámico. */
export interface DynamicInstanceState {
  /** valor por id de parámetro: número (distancia/ángulo), punto, booleano (flip) o texto (visibilidad/lookup) */
  values: Record<Id, number | Vec2 | boolean | string>;
  visibilityState?: string;
  userValues?: Record<string, number>;
}

export interface InsertEntity extends EntityBase {
  type: 'insert';
  blockId: Id;
  position: Vec2;
  scale: Vec2;
  rotation: number;
  attributes: AttributeValue[];
  dynamic?: DynamicInstanceState;
  /** MINSERT */
  grid?: { columns: number; rows: number; columnSpacing: number; rowSpacing: number };
}

export interface AttdefEntity extends EntityBase {
  type: 'attdef';
  tag: string;
  prompt: string;
  defaultValue: string;
  position: Vec2;
  height: number;
  rotation: number;
  style: Id;
  halign: TextHAlign;
  valign: TextVAlign;
  invisible: boolean;
  constant: boolean;
  verify: boolean;
  preset: boolean;
  lockPosition: boolean;
  multiline: boolean;
}

export type DimType = 'linear' | 'aligned' | 'angular' | 'angular3p' | 'radial' | 'diametric' | 'arclength' | 'ordinate';

/** Referencia asociativa: la cota sigue a un punto característico de una entidad. */
export interface DimAssocRef {
  /** índice del punto de definición (p1, p2, …) */
  point: 'p1' | 'p2' | 'p3' | 'p4' | 'center' | 'chord';
  entityId: Id;
  /** tipo de punto característico */
  snap: 'endpoint-start' | 'endpoint-end' | 'midpoint' | 'center' | 'quadrant' | 'vertex' | 'nearest' | 'insertion';
  /** índice de vértice o parámetro normalizado para 'nearest'/'vertex' */
  index?: number;
}

export interface DimensionEntity extends EntityBase {
  type: 'dimension';
  dimType: DimType;
  style: Id;
  overrides: Partial<DimStyleProps>;
  /**
   * Puntos de definición según el tipo:
   * - linear/aligned: p1, p2 = orígenes de extensión; p3 = punto sobre la línea de cota
   * - angular (2 líneas): p1-p2 línea 1, p3-p4 línea 2, arcPoint = ubicación del arco
   * - angular3p: center, p1, p2, arcPoint
   * - radial/diametric: center, p1 = punto sobre la curva (chord), p3 = ubicación del texto/directriz
   * - arclength: center, p1, p2 extremos, arcPoint = ubicación; radius
   * - ordinate: p1 = punto medido, p2 = extremo de directriz, origin = origen del SCP, axis
   */
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  p4?: Vec2;
  center?: Vec2;
  arcPoint?: Vec2;
  /** rotación de la línea de cota para 'linear' (0 horizontal, π/2 vertical) */
  rotation: number;
  axis?: 'x' | 'y';
  origin?: Vec2;
  radius?: number;
  /** '<>' representa el valor medido */
  textOverride?: string;
  /** posición del texto movida por el usuario */
  textPosition?: Vec2;
  assoc?: DimAssocRef[];
  /**
   * Cortes (DIMBREAK): centro en coordenadas del dibujo donde otro objeto cruza la cota y,
   * en los manuales, su longitud en unidades de dibujo.
   */
  breaks?: { p: Vec2; size?: number }[];
  /** Recalcular los cortes cuando cambian la cota o los objetos que la cruzan. */
  breakAuto?: boolean;
  /** Longitud del corte en unidades de papel (se aplica la escala de la cota). */
  breakSize?: number;
}

/**
 * Marca o eje de centro (CENTERMARK / CENTERLINE). Guarda su geometría resuelta; si tiene
 * `sources`, un reactor la mantiene asociada al círculo/arco o a los dos tramos de origen.
 */
export interface CenterMarkEntity extends EntityBase {
  type: 'centermark';
  mode: 'mark' | 'line';
  /** mark: centro del círculo o arco; line: inicio del eje (sin prolongación) */
  center: Vec2;
  /** mark: radio del objeto de origen */
  radius: number;
  /** line: fin del eje (sin prolongación) */
  end?: Vec2;
  rotation: number;
  /** tamaño de la cruz como fracción del radio */
  crossSize: number;
  /** hueco entre la cruz y los ejes como fracción del radio */
  crossGap: number;
  /** prolongación más allá del objeto, en unidades de dibujo */
  extension: number;
  sources?: GeoRef[];
}

export interface ViewportEntity extends EntityBase {
  type: 'viewport';
  /** centro en papel */
  center: Vec2;
  width: number;
  height: number;
  /** centro de la vista en modelo */
  viewCenter: Vec2;
  /** unidades de papel por unidad de modelo (1:50 en mm con modelo en mm = 1/50) */
  scale: number;
  viewTwist: number;
  /** visualización bloqueada: el encuadre y la escala no cambian desde dentro */
  displayLocked: boolean;
  on: boolean;
  frozenLayers: Id[];
  layerOverrides: Record<Id, Partial<Pick<LayerRecord, 'color' | 'linetype' | 'lineweight' | 'transparency'>>>;
  /** contorno de recorte poligonal en papel */
  clipBoundary?: Vec2[];
  /** nombre de escala estándar si aplica */
  scaleName?: string;
}

export interface ArrayEntity extends EntityBase {
  type: 'array';
  /** Definición anónima con los objetos fuente */
  sourceBlockId: Id;
  /** Transformación de las coordenadas de la definición al espacio del propietario (identidad al crear). */
  sourceMatrix?: Mat2D;
  basePoint: Vec2;
  params:
    | { kind: 'rect'; columns: number; rows: number; columnSpacing: number; rowSpacing: number; angle: number }
    | { kind: 'polar'; center: Vec2; count: number; fillAngle: number; rotateItems: boolean; rows: number; rowSpacing: number }
    | { kind: 'path'; path: { vertices: PolyVertex[]; closed: boolean }; count: number; spacing: number; alignItems: boolean; method: 'divide' | 'measure' };
}

export type Entity =
  | PointEntity
  | LineEntity
  | RayEntity
  | XLineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | LwPolylineEntity
  | Polyline2dEntity
  | SplineEntity
  | MLineEntity
  | RegionEntity
  | HatchEntity
  | TextEntity
  | MTextEntity
  | LeaderEntity
  | MLeaderEntity
  | TableEntity
  | WipeoutEntity
  | ImageEntity
  | PdfUnderlayEntity
  | InsertEntity
  | AttdefEntity
  | DimensionEntity
  | ViewportEntity
  | ArrayEntity
  | CenterMarkEntity;

export type EntityType = Entity['type'];
export type EntityOf<T extends EntityType> = Extract<Entity, { type: T }>;

// ---------------------------------------------------------------------------
// Tablas y objetos con nombre
// ---------------------------------------------------------------------------

export interface LayerRecord {
  id: Id;
  name: string;
  color: ColorValue; // nunca ByLayer/ByBlock
  linetype: Id;
  lineweight: number;
  transparency: number;
  on: boolean;
  frozen: boolean;
  locked: boolean;
  plot: boolean;
  description: string;
  /** Congelada por defecto en nuevos viewports */
  newViewportFrozen?: boolean;
  order: number;
}

export interface LinetypeRecord {
  id: Id;
  name: string;
  description: string;
  /** Patrón en unidades de dibujo: positivo trazo, negativo hueco, 0 punto */
  pattern: number[];
}

export interface TextStyleRecord {
  id: Id;
  name: string;
  font: string;
  /** 0 = altura variable */
  height: number;
  widthFactor: number;
  oblique: number;
  annotative: boolean;
  bold?: boolean;
  italic?: boolean;
}

export type UnitFormat = 'decimal' | 'engineering' | 'architectural' | 'fractional' | 'scientific';
export type AngleFormat = 'degrees' | 'dms' | 'grads' | 'radians' | 'surveyor';

export interface DimStyleProps {
  arrow1: ArrowType;
  arrow2: ArrowType;
  leaderArrow: ArrowType;
  arrowSize: number;
  centerMark: number; // >0 marca, <0 líneas, 0 nada
  extLineOffset: number;
  extLineExtension: number;
  dimLineExtension: number;
  baselineSpacing: number;
  suppressExt1: boolean;
  suppressExt2: boolean;
  dimColor: ColorValue;
  extColor: ColorValue;
  textColor: ColorValue;
  dimLineweight: number;
  extLineweight: number;
  textStyle: Id;
  textHeight: number;
  textGap: number;
  textVertical: 'centered' | 'above' | 'outside' | 'below';
  textAlignment: 'horizontal' | 'aligned' | 'iso';
  textFill: 'none' | 'background';
  fitTextInside: boolean;
  /** DIMSCALE global */
  overallScale: number;
  linearFactor: number;
  unitFormat: UnitFormat;
  precision: number;
  decimalSeparator: '.' | ',';
  roundOff: number;
  prefix: string;
  suffix: string;
  suppressLeadingZeros: boolean;
  suppressTrailingZeros: boolean;
  angleFormat: AngleFormat;
  anglePrecision: number;
  tolerance: 'none' | 'symmetrical' | 'deviation' | 'limits' | 'basic';
  tolUpper: number;
  tolLower: number;
  tolPrecision: number;
  tolHeightFactor: number;
  altUnits: boolean;
  altFactor: number;
  altPrecision: number;
  altPrefix: string;
  altSuffix: string;
  annotative: boolean;
}

export interface DimStyleRecord extends DimStyleProps {
  id: Id;
  name: string;
}

export interface MLeaderStyleProps {
  arrow: ArrowType;
  arrowSize: number;
  leaderColor: ColorValue;
  leaderLineweight: number;
  leaderType: 'straight' | 'spline' | 'none';
  landing: boolean;
  doglegLength: number;
  landingGap: number;
  contentType: 'mtext' | 'block' | 'none';
  textStyle: Id;
  textHeight: number;
  textColor: ColorValue;
  textFrame: boolean;
  blockId?: Id;
  blockScale: number;
  maxLeaderPoints: number;
  annotative: boolean;
  overallScale: number;
}

export interface MLeaderStyleRecord extends MLeaderStyleProps {
  id: Id;
  name: string;
}

export interface TableStyleRecord {
  id: Id;
  name: string;
  textStyle: Id;
  title: { textHeight: number; fill?: ColorValue; align: MTextAttachment };
  header: { textHeight: number; fill?: ColorValue; align: MTextAttachment };
  data: { textHeight: number; fill?: ColorValue; align: MTextAttachment };
  cellMargin: number;
  gridColor: ColorValue;
  gridLineweight: number;
  flow: 'down' | 'up';
}

export interface MLineStyleRecord {
  id: Id;
  name: string;
  description: string;
  elements: { offset: number; color: ColorValue; linetype: string }[];
  startCap: 'none' | 'line' | 'outer-arc';
  endCap: 'none' | 'line' | 'outer-arc';
  fill?: ColorValue;
}

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

export type BlockKind = 'normal' | 'anonymous' | 'xref' | 'array' | 'dimension';

export interface XrefInfo {
  /** ruta relativa al documento anfitrión (o absoluta/URL) */
  path: string;
  mode: 'attach' | 'overlay';
  status: 'loaded' | 'unloaded' | 'not-found' | 'unresolved' | 'circular';
  /** capas del xref con sobrescrituras locales, clave = nombre de capa del xref */
  layerOverrides: Record<string, Partial<Pick<LayerRecord, 'on' | 'frozen' | 'color' | 'linetype' | 'lineweight' | 'transparency'>>>;
  lastLoaded?: number;
  /** id del documento referenciado cuando se resolvió */
  documentId?: Id;
  /** origen: archivo del usuario o dibujo guardado en la biblioteca local del navegador */
  source?: 'file' | 'library';
  /** definiciones anidadas creadas al cargar (se sustituyen al recargar) */
  ownedBlocks?: Id[];
  /** capas «xref|capa» creadas al cargar (sus propiedades locales se conservan al recargar) */
  ownedLayers?: Id[];
  /** tipos de línea creados al cargar */
  ownedLinetypes?: Id[];
  /** estilos de texto creados al cargar */
  ownedTextStyles?: Id[];
  /** estilos de cota creados al cargar */
  ownedDimStyles?: Id[];
  /** estilos de directriz múltiple creados al cargar */
  ownedMLeaderStyles?: Id[];
  /** estilos de tabla creados al cargar */
  ownedTableStyles?: Id[];
  /** estilos de multilínea creados al cargar */
  ownedMLineStyles?: Id[];
  /** recursos binarios (assets) creados al cargar */
  ownedAssets?: Id[];
  /** último error de resolución */
  error?: string;
}

export interface BlockRecord {
  id: Id;
  name: string;
  kind: BlockKind;
  basePoint: Vec2;
  description: string;
  /** unidades de inserción para autoescalado */
  units: DrawingUnits;
  explodable: boolean;
  scaleUniformly: boolean;
  annotative: boolean;
  favorite?: boolean;
  library?: 'local' | 'shared';
  category?: string;
  /** elemento de la biblioteca del que procede y su fecha de guardado */
  libraryItem?: string;
  librarySavedAt?: number;
  xref?: XrefInfo;
  dynamic?: DynamicBlockDefinition;
  /** Versión de la definición: cambia en cada redefinición (invalida cachés de instancias) */
  revision: number;
}

// ---------------------------------------------------------------------------
// Bloques dinámicos
// ---------------------------------------------------------------------------

export type DynParamType = 'basepoint' | 'point' | 'linear' | 'polar' | 'xy' | 'rotation' | 'alignment' | 'flip' | 'visibility' | 'lookup';

export interface ValueSet {
  kind: 'none' | 'increment' | 'list';
  min?: number;
  max?: number;
  increment?: number;
  list?: number[];
}

export interface DynParamBase {
  id: Id;
  type: DynParamType;
  name: string;
  label: string;
  description?: string;
  /** Mostrar en propiedades de la instancia */
  showInProperties: boolean;
  /** Acciones encadenadas: si un punto de este parámetro es movido por otra acción, sus acciones se ejecutan */
  chainActions: boolean;
  gripCount: 0 | 1 | 2 | 4;
}

export interface BasePointParam extends DynParamBase {
  type: 'basepoint';
  point: Vec2;
}
export interface PointParam extends DynParamBase {
  type: 'point';
  point: Vec2;
}
export interface LinearParam extends DynParamBase {
  type: 'linear';
  base: Vec2;
  end: Vec2;
  /** 'start': la base queda fija; 'middle': simétrico respecto al punto medio */
  baseLocation: 'start' | 'middle';
  valueSet: ValueSet;
  /** expresión opcional (fórmula) que fija el valor a partir de otros parámetros o variables */
  expression?: string;
}
export interface PolarParam extends DynParamBase {
  type: 'polar';
  base: Vec2;
  end: Vec2;
  distanceSet: ValueSet;
  angleSet: ValueSet;
}
export interface XYParam extends DynParamBase {
  type: 'xy';
  base: Vec2;
  corner: Vec2;
  xSet: ValueSet;
  ySet: ValueSet;
}
export interface RotationParam extends DynParamBase {
  type: 'rotation';
  base: Vec2;
  radius: number;
  /** ángulo por defecto (radianes) */
  angle: number;
  valueSet: ValueSet;
}
export interface AlignmentParam extends DynParamBase {
  type: 'alignment';
  base: Vec2;
  direction: Vec2;
  alignType: 'perpendicular' | 'tangent';
}
export interface FlipParam extends DynParamBase {
  type: 'flip';
  base: Vec2;
  end: Vec2;
  labelNotFlipped: string;
  labelFlipped: string;
}
export interface VisibilityParam extends DynParamBase {
  type: 'visibility';
  position: Vec2;
  states: { name: string; visible: Id[] }[];
  defaultState: string;
}
export interface LookupParam extends DynParamBase {
  type: 'lookup';
  position: Vec2;
  /** id de la tabla de consulta que controla */
  tableId: Id;
}

export type DynParam = BasePointParam | PointParam | LinearParam | PolarParam | XYParam | RotationParam | AlignmentParam | FlipParam | VisibilityParam | LookupParam;

export type DynActionType = 'move' | 'scale' | 'stretch' | 'polarstretch' | 'rotate' | 'flip' | 'array' | 'lookup';

export interface DynActionBase {
  id: Id;
  type: DynActionType;
  name: string;
  paramId: Id;
  /** entidades de la definición afectadas */
  selection: Id[];
}

export interface MoveAction extends DynActionBase {
  type: 'move';
  /** qué punto del parámetro dirige el movimiento */
  paramPoint: 'base' | 'end' | 'corner';
  axis: 'xy' | 'x' | 'y';
  distanceMultiplier: number;
  angleOffset: number;
}
export interface ScaleAction extends DynActionBase {
  type: 'scale';
  baseType: 'dependent' | 'independent';
  basePoint?: Vec2;
  axis: 'xy' | 'x' | 'y';
}
export interface StretchAction extends DynActionBase {
  type: 'stretch';
  paramPoint: 'base' | 'end' | 'corner';
  /** marco poligonal de estiramiento en coordenadas del bloque */
  frame: Vec2[];
  axis: 'xy' | 'x' | 'y';
  distanceMultiplier: number;
  angleOffset: number;
}
export interface PolarStretchAction extends DynActionBase {
  type: 'polarstretch';
  paramPoint: 'base' | 'end';
  frame: Vec2[];
  /** objetos que solo giran (sin estirarse) */
  rotateOnly: Id[];
}
export interface RotateAction extends DynActionBase {
  type: 'rotate';
  baseType: 'dependent' | 'independent';
  basePoint?: Vec2;
}
export interface FlipAction extends DynActionBase {
  type: 'flip';
}
export interface ArrayAction extends DynActionBase {
  type: 'array';
  columnOffset: number;
  rowOffset: number;
  /**
   * Extensión FModel: matriz polar alrededor de la base del parámetro. `polarCount` es una
   * expresión (p. ej. el nombre de una variable de usuario) y `fillAngle` el ángulo a llenar (grados).
   */
  polarCount?: string;
  fillAngle?: number;
}
export interface LookupAction extends DynActionBase {
  type: 'lookup';
  tableId: Id;
}

export type DynAction = MoveAction | ScaleAction | StretchAction | PolarStretchAction | RotateAction | FlipAction | ArrayAction | LookupAction;

export type GeoConstraintType =
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'coincident'
  | 'tangent'
  | 'concentric'
  | 'equal'
  | 'symmetric'
  | 'fixed'
  | 'collinear';

export type DimConstraintType = 'linear-h' | 'linear-v' | 'aligned' | 'angular' | 'radius' | 'diameter';

/** Referencia a una característica geométrica de una entidad de la definición. */
export interface GeoRef {
  entityId: Id;
  /** 'start' | 'end' | 'center' | 'mid' | 'edge' (la curva completa) | 'vertex:N' | 'segment:N' */
  part: string;
}

export interface GeoConstraint {
  id: Id;
  kind: 'geometric';
  type: GeoConstraintType;
  refs: GeoRef[];
  enabled: boolean;
}

export interface DimConstraint {
  id: Id;
  kind: 'dimensional';
  type: DimConstraintType;
  name: string;
  refs: GeoRef[];
  /** expresión: número o fórmula con nombres de parámetros/variables */
  expression: string;
  /** Parámetro de restricción (editable en la instancia) vs. restricción de definición */
  isParameter: boolean;
  valueSet: ValueSet;
  /** posición de la etiqueta en la definición */
  labelPosition?: Vec2;
}

export type BlockConstraint = GeoConstraint | DimConstraint;

/**
 * Restricción del dibujo: relaciona entidades de un mismo espacio (modelo o presentación).
 * Las dimensionales usan `isParameter: false`; su `name` comparte espacio de nombres con
 * los parámetros de usuario.
 */
export type DrawingConstraint = BlockConstraint & { owner: Id };

/** Parámetro de usuario del dibujo, usable en las fórmulas de las cotas de restricción. */
export interface DrawingParameter {
  id: Id;
  name: string;
  expression: string;
  description: string;
}

/** Variante con nombre: expresiones guardadas para parámetros y cotas de restricción. */
export interface ParameterSet {
  id: Id;
  name: string;
  /** nombre de parámetro o cota → expresión */
  values: Record<string, string>;
}

export interface LookupTable {
  id: Id;
  name: string;
  /** columnas de entrada: ids de parámetros */
  inputs: Id[];
  /** columnas de consulta: nombre visible de la propiedad */
  lookupName: string;
  rows: { label: string; inputs: (number | string)[] }[];
  /** permite el valor inverso (seleccionar fila desde la propiedad) */
  reverse: boolean;
}

export interface UserVariable {
  name: string;
  expression: string;
  /** visible como propiedad personalizada de la instancia */
  exposed: boolean;
  readOnly: boolean;
  description?: string;
}

export interface DynamicBlockDefinition {
  parameters: DynParam[];
  actions: DynAction[];
  constraints: BlockConstraint[];
  lookups: LookupTable[];
  variables: UserVariable[];
  /** orden de propiedades personalizadas visibles */
  propertyOrder: Id[];
  /** historial de validación */
  validation?: { at: number; warnings: string[]; errors: string[] };
}

// ---------------------------------------------------------------------------
// Layouts, vistas y otros objetos
// ---------------------------------------------------------------------------

export type DrawingUnits = 'unitless' | 'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft' | 'yd' | 'mi';

export interface PageSetup {
  paper: string; // 'ISO A3', 'ANSI B', 'Custom'
  width: number; // mm
  height: number; // mm
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  plotArea: 'layout' | 'extents' | 'window';
  window?: { min: Vec2; max: Vec2 };
  plotScale: number;
  plotLineweights: boolean;
  plotStyle: 'color' | 'monochrome' | 'grayscale';
  plotTransparency: boolean;
  plotPaperspaceLast: boolean;
  hidePaperspaceObjects: boolean;
  center: boolean;
  offset: Vec2;
}

export interface LayoutRecord {
  id: Id;
  name: string;
  tabOrder: number;
  page: PageSetup;
  /** limites de papel y vista actual guardada */
  view?: { center: Vec2; scale: number };
}

export interface GroupRecord {
  id: Id;
  name: string;
  description: string;
  members: Id[];
  selectable: boolean;
}

export interface NamedView {
  id: Id;
  name: string;
  space: Id;
  center: Vec2;
  /** píxeles por unidad no: guardamos la altura de vista en unidades de dibujo */
  height: number;
  rotation: number;
  layerState?: Id;
}

export interface LayerStateRecord {
  id: Id;
  name: string;
  description: string;
  layers: Record<Id, Pick<LayerRecord, 'on' | 'frozen' | 'locked' | 'plot' | 'color' | 'linetype' | 'lineweight' | 'transparency'>>;
  currentLayer: Id;
}

export interface LayerFilterRecord {
  id: Id;
  name: string;
  /** filtro por propiedades: nombre con comodines, color, estado */
  rule: { name?: string; color?: string; on?: boolean; frozen?: boolean; locked?: boolean; used?: boolean };
  /** filtro de grupo: capas explícitas */
  layers?: Id[];
}

export interface AssetRecord {
  id: Id;
  name: string;
  mime: string;
  size: number;
  /** datos embebidos (data URL base64) para el formato portable */
  dataUrl?: string;
  /** ruta externa relativa si está vinculado */
  path?: string;
  width?: number;
  height?: number;
  pages?: number;
}

export interface DocumentSettings {
  id: 'settings';
  title: string;
  units: DrawingUnits;
  insUnits: DrawingUnits;
  linearFormat: UnitFormat;
  linearPrecision: number;
  angleFormat: AngleFormat;
  anglePrecision: number;
  /** 0 = este, CCW positivo */
  angleBase: number;
  ltscale: number;
  psltscale: boolean;
  /** escala de anotación actual del espacio modelo, papel:modelo (1:50 → 1/50) */
  annotationScale: number;
  annotationScales: { name: string; paper: number; drawing: number }[];
  /** configuración de página para trazar el espacio modelo (plotScale ≤ 0 = ajustar al papel) */
  modelPage?: PageSetup;
  currentLayer: Id;
  currentColor: ColorValue;
  currentLinetype: string;
  currentLineweight: number;
  currentTransparency: Transparency;
  currentTextStyle: Id;
  currentDimStyle: Id;
  currentMLeaderStyle: Id;
  currentTableStyle: Id;
  currentMLineStyle: Id;
  pointDisplay: { mode: number; size: number };
  filletRadius: number;
  chamferDistances: [number, number];
  offsetDistance: number;
  textHeight: number;
  author: string;
  createdAt: number;
  modifiedAt: number;
  /** variables de usuario del dibujo (campos) */
  customProperties: Record<string, string>;
  /** ruta del documento para resolver rutas relativas */
  path?: string;
}

export interface DocumentData {
  settings: DocumentSettings;
  entities: Map<Id, Entity>;
  layers: Map<Id, LayerRecord>;
  linetypes: Map<Id, LinetypeRecord>;
  textStyles: Map<Id, TextStyleRecord>;
  dimStyles: Map<Id, DimStyleRecord>;
  mleaderStyles: Map<Id, MLeaderStyleRecord>;
  tableStyles: Map<Id, TableStyleRecord>;
  mlineStyles: Map<Id, MLineStyleRecord>;
  blocks: Map<Id, BlockRecord>;
  layouts: Map<Id, LayoutRecord>;
  groups: Map<Id, GroupRecord>;
  views: Map<Id, NamedView>;
  layerStates: Map<Id, LayerStateRecord>;
  layerFilters: Map<Id, LayerFilterRecord>;
  assets: Map<Id, AssetRecord>;
  constraints: Map<Id, DrawingConstraint>;
  parameters: Map<Id, DrawingParameter>;
  parameterSets: Map<Id, ParameterSet>;
}

export type CollectionName = Exclude<keyof DocumentData, 'settings'>;

export type RecordOf<C extends CollectionName> = DocumentData[C] extends Map<Id, infer R> ? R : never;
