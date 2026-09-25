import { CadDocument } from './document';
import { newId } from './ids';
import type {
  DimStyleProps,
  DimStyleRecord,
  DocumentData,
  DocumentSettings,
  DrawingUnits,
  Entity,
  EntityBase,
  Id,
  LayerRecord,
  LayoutRecord,
  LinetypeRecord,
  MLeaderStyleRecord,
  MLineStyleRecord,
  PageSetup,
  TableStyleRecord,
  TextStyleRecord,
} from './types';
import { LW_BYLAYER, MODEL_SPACE_ID } from './types';

export const LAYER0_ID = 'layer-0';
export const LT_CONTINUOUS_ID = 'lt-continuous';
export const TEXTSTYLE_STANDARD_ID = 'ts-standard';
export const DIMSTYLE_ISO_ID = 'ds-iso25';
export const DIMSTYLE_STANDARD_ID = 'ds-standard';
export const MLEADERSTYLE_STANDARD_ID = 'mls-standard';
export const TABLESTYLE_STANDARD_ID = 'tbs-standard';
export const MLINESTYLE_STANDARD_ID = 'mlns-standard';
export const DEFPOINTS_LAYER_ID = 'layer-defpoints';

/** Tipos de línea ISO (acadiso.lin), valores en mm. */
export const STANDARD_LINETYPES: Omit<LinetypeRecord, 'id'>[] = [
  { name: 'Continuous', description: 'Continua ________________', pattern: [] },
  { name: 'DASHED', description: 'Trazos __ __ __ __', pattern: [12.7, -6.35] },
  { name: 'DASHED2', description: 'Trazos (.5x) _ _ _ _', pattern: [6.35, -3.175] },
  { name: 'HIDDEN', description: 'Oculta __ __ __ __', pattern: [6.35, -3.175] },
  { name: 'HIDDEN2', description: 'Oculta (.5x) _ _ _ _', pattern: [3.175, -1.5875] },
  { name: 'CENTER', description: 'Centro ____ _ ____ _', pattern: [31.75, -6.35, 6.35, -6.35] },
  { name: 'CENTER2', description: 'Centro (.5x) ___ _ ___', pattern: [19.05, -3.175, 3.175, -3.175] },
  { name: 'PHANTOM', description: 'Fantasma ____ _ _ ____', pattern: [31.75, -6.35, 6.35, -6.35, 6.35, -6.35] },
  { name: 'DOT', description: 'Puntos . . . . . .', pattern: [0, -6.35] },
  { name: 'DASHDOT', description: 'Trazo-punto __ . __ .', pattern: [12.7, -6.35, 0, -6.35] },
  { name: 'BORDER', description: 'Borde __ __ . __ __ .', pattern: [12.7, -6.35, 12.7, -6.35, 0, -6.35] },
  { name: 'DIVIDE', description: 'Divisoria __ . . __ . .', pattern: [12.7, -6.35, 0, -6.35, 0, -6.35] },
  { name: 'ACAD_ISO02W100', description: 'ISO trazos __ __ __', pattern: [12, -3] },
  { name: 'ACAD_ISO03W100', description: 'ISO trazos espaciados __    __', pattern: [12, -18] },
  { name: 'ACAD_ISO04W100', description: 'ISO trazo largo-punto ____ . ____', pattern: [24, -3, 0.5, -3] },
  { name: 'ACAD_ISO10W100', description: 'ISO trazo-punto __ . __ .', pattern: [12, -3, 0, -3] },
];

export const PAPER_SIZES: { name: string; width: number; height: number }[] = [
  { name: 'ISO A4', width: 210, height: 297 },
  { name: 'ISO A3', width: 297, height: 420 },
  { name: 'ISO A2', width: 420, height: 594 },
  { name: 'ISO A1', width: 594, height: 841 },
  { name: 'ISO A0', width: 841, height: 1189 },
  { name: 'ANSI A (Letter)', width: 215.9, height: 279.4 },
  { name: 'ANSI B (Tabloid)', width: 279.4, height: 431.8 },
  { name: 'ANSI C', width: 431.8, height: 558.8 },
  { name: 'ANSI D', width: 558.8, height: 863.6 },
  { name: 'ANSI E', width: 863.6, height: 1117.6 },
  { name: 'ARCH D', width: 609.6, height: 914.4 },
];

export const STANDARD_SCALES: { name: string; paper: number; drawing: number }[] = [
  { name: '1:1', paper: 1, drawing: 1 },
  { name: '1:2', paper: 1, drawing: 2 },
  { name: '1:5', paper: 1, drawing: 5 },
  { name: '1:10', paper: 1, drawing: 10 },
  { name: '1:20', paper: 1, drawing: 20 },
  { name: '1:25', paper: 1, drawing: 25 },
  { name: '1:50', paper: 1, drawing: 50 },
  { name: '1:75', paper: 1, drawing: 75 },
  { name: '1:100', paper: 1, drawing: 100 },
  { name: '1:200', paper: 1, drawing: 200 },
  { name: '1:250', paper: 1, drawing: 250 },
  { name: '1:500', paper: 1, drawing: 500 },
  { name: '1:1000', paper: 1, drawing: 1000 },
  { name: '2:1', paper: 2, drawing: 1 },
  { name: '5:1', paper: 5, drawing: 1 },
  { name: '10:1', paper: 10, drawing: 1 },
];

/** Factor para convertir 1 unidad a milímetros. */
export const UNIT_TO_MM: Record<DrawingUnits, number> = {
  unitless: 1,
  mm: 1,
  cm: 10,
  m: 1000,
  km: 1_000_000,
  in: 25.4,
  ft: 304.8,
  yd: 914.4,
  mi: 1_609_344,
};

export function unitConversion(from: DrawingUnits, to: DrawingUnits): number {
  if (from === 'unitless' || to === 'unitless') return 1;
  return UNIT_TO_MM[from] / UNIT_TO_MM[to];
}

export const ISO_DIMSTYLE: DimStyleProps = {
  arrow1: 'closed-filled',
  arrow2: 'closed-filled',
  leaderArrow: 'closed-filled',
  arrowSize: 2.5,
  centerMark: 2.5,
  extLineOffset: 0.625,
  extLineExtension: 1.25,
  dimLineExtension: 0,
  baselineSpacing: 3.75,
  suppressExt1: false,
  suppressExt2: false,
  dimColor: 'ByBlock',
  extColor: 'ByBlock',
  textColor: 'ByBlock',
  dimLineweight: -2,
  extLineweight: -2,
  textStyle: TEXTSTYLE_STANDARD_ID,
  textHeight: 2.5,
  textGap: 0.625,
  textVertical: 'above',
  textAlignment: 'aligned',
  textFill: 'none',
  fitTextInside: true,
  overallScale: 1,
  linearFactor: 1,
  unitFormat: 'decimal',
  precision: 2,
  decimalSeparator: ',',
  roundOff: 0,
  prefix: '',
  suffix: '',
  suppressLeadingZeros: false,
  suppressTrailingZeros: true,
  angleFormat: 'degrees',
  anglePrecision: 0,
  tolerance: 'none',
  tolUpper: 0,
  tolLower: 0,
  tolPrecision: 2,
  tolHeightFactor: 1,
  altUnits: false,
  altFactor: 1 / 25.4,
  altPrecision: 2,
  altPrefix: '',
  altSuffix: ' in',
  annotative: false,
};

export function defaultPageSetup(paperName = 'ISO A3', orientation: 'portrait' | 'landscape' = 'landscape'): PageSetup {
  const p = PAPER_SIZES.find((s) => s.name === paperName) ?? PAPER_SIZES[1];
  return {
    paper: p.name,
    width: p.width,
    height: p.height,
    orientation,
    margins: { top: 10, right: 10, bottom: 10, left: 20 },
    plotArea: 'layout',
    plotScale: 1,
    plotLineweights: true,
    plotStyle: 'color',
    plotTransparency: false,
    plotPaperspaceLast: true,
    hidePaperspaceObjects: false,
    center: false,
    offset: { x: 0, y: 0 },
  };
}

export function paperExtents(page: PageSetup): { width: number; height: number } {
  return page.orientation === 'landscape'
    ? { width: Math.max(page.width, page.height), height: Math.min(page.width, page.height) }
    : { width: Math.min(page.width, page.height), height: Math.max(page.width, page.height) };
}

export function createDocumentData(opts: { title?: string; units?: DrawingUnits; author?: string } = {}): DocumentData {
  const now = Date.now();
  const linetypes = new Map<Id, LinetypeRecord>();
  for (const lt of STANDARD_LINETYPES) {
    const id = lt.name === 'Continuous' ? LT_CONTINUOUS_ID : `lt-${lt.name.toLowerCase()}`;
    linetypes.set(id, { id, ...lt });
  }
  const layers = new Map<Id, LayerRecord>();
  layers.set(LAYER0_ID, {
    id: LAYER0_ID,
    name: '0',
    color: 'aci:7',
    linetype: LT_CONTINUOUS_ID,
    lineweight: -3,
    transparency: 0,
    on: true,
    frozen: false,
    locked: false,
    plot: true,
    description: '',
    order: 0,
  });
  layers.set(DEFPOINTS_LAYER_ID, {
    id: DEFPOINTS_LAYER_ID,
    name: 'Defpoints',
    color: 'aci:7',
    linetype: LT_CONTINUOUS_ID,
    lineweight: -3,
    transparency: 0,
    on: true,
    frozen: false,
    locked: false,
    plot: false,
    description: 'Puntos de definición de cotas y contornos de viewport (no se trazan)',
    order: 1,
  });
  const textStyles = new Map<Id, TextStyleRecord>();
  textStyles.set(TEXTSTYLE_STANDARD_ID, {
    id: TEXTSTYLE_STANDARD_ID,
    name: 'Standard',
    font: 'Inter',
    height: 0,
    widthFactor: 1,
    oblique: 0,
    annotative: false,
  });
  textStyles.set('ts-annotative', {
    id: 'ts-annotative',
    name: 'Annotative',
    font: 'Inter',
    height: 0,
    widthFactor: 1,
    oblique: 0,
    annotative: true,
  });
  textStyles.set('ts-mono', {
    id: 'ts-mono',
    name: 'Técnico mono',
    font: 'IBM Plex Mono',
    height: 0,
    widthFactor: 1,
    oblique: 0,
    annotative: false,
  });
  const dimStyles = new Map<Id, DimStyleRecord>();
  dimStyles.set(DIMSTYLE_ISO_ID, { id: DIMSTYLE_ISO_ID, name: 'ISO-25', ...ISO_DIMSTYLE });
  dimStyles.set(DIMSTYLE_STANDARD_ID, { id: DIMSTYLE_STANDARD_ID, name: 'Standard', ...ISO_DIMSTYLE, decimalSeparator: '.', precision: 4, suppressTrailingZeros: false, textVertical: 'centered', textAlignment: 'horizontal' });
  dimStyles.set('ds-annotative', { id: 'ds-annotative', name: 'Annotative', ...ISO_DIMSTYLE, annotative: true });
  const mleaderStyles = new Map<Id, MLeaderStyleRecord>();
  mleaderStyles.set(MLEADERSTYLE_STANDARD_ID, {
    id: MLEADERSTYLE_STANDARD_ID,
    name: 'Standard',
    arrow: 'closed-filled',
    arrowSize: 2.5,
    leaderColor: 'ByBlock',
    leaderLineweight: -2,
    leaderType: 'straight',
    landing: true,
    doglegLength: 5,
    landingGap: 1,
    contentType: 'mtext',
    textStyle: TEXTSTYLE_STANDARD_ID,
    textHeight: 2.5,
    textColor: 'ByBlock',
    textFrame: false,
    blockScale: 1,
    maxLeaderPoints: 2,
    annotative: false,
    overallScale: 1,
  });
  const tableStyles = new Map<Id, TableStyleRecord>();
  tableStyles.set(TABLESTYLE_STANDARD_ID, {
    id: TABLESTYLE_STANDARD_ID,
    name: 'Standard',
    textStyle: TEXTSTYLE_STANDARD_ID,
    title: { textHeight: 5, align: 5 },
    header: { textHeight: 3.5, align: 5 },
    data: { textHeight: 2.5, align: 5 },
    cellMargin: 1.5,
    gridColor: 'ByBlock',
    gridLineweight: -2,
    flow: 'down',
  });
  const mlineStyles = new Map<Id, MLineStyleRecord>();
  mlineStyles.set(MLINESTYLE_STANDARD_ID, {
    id: MLINESTYLE_STANDARD_ID,
    name: 'Standard',
    description: 'Dos líneas a ±0.5',
    elements: [
      { offset: 0.5, color: 'ByLayer', linetype: 'ByLayer' },
      { offset: -0.5, color: 'ByLayer', linetype: 'ByLayer' },
    ],
    startCap: 'none',
    endCap: 'none',
  });
  const layouts = new Map<Id, LayoutRecord>();
  const layoutId = 'layout-1';
  layouts.set(layoutId, { id: layoutId, name: 'Presentación1', tabOrder: 1, page: defaultPageSetup() });

  const units = opts.units ?? 'mm';
  const settings: DocumentSettings = {
    id: 'settings',
    title: opts.title ?? 'Sin título',
    units,
    insUnits: units,
    linearFormat: 'decimal',
    linearPrecision: 2,
    angleFormat: 'degrees',
    anglePrecision: 0,
    angleBase: 0,
    ltscale: 1,
    psltscale: true,
    annotationScale: 1,
    annotationScales: STANDARD_SCALES,
    currentLayer: LAYER0_ID,
    currentColor: 'ByLayer',
    currentLinetype: 'ByLayer',
    currentLineweight: LW_BYLAYER,
    currentTransparency: 'ByLayer',
    currentTextStyle: TEXTSTYLE_STANDARD_ID,
    currentDimStyle: DIMSTYLE_ISO_ID,
    currentMLeaderStyle: MLEADERSTYLE_STANDARD_ID,
    currentTableStyle: TABLESTYLE_STANDARD_ID,
    currentMLineStyle: MLINESTYLE_STANDARD_ID,
    pointDisplay: { mode: 0, size: 0 },
    filletRadius: 0,
    chamferDistances: [0, 0],
    offsetDistance: 1,
    textHeight: 2.5,
    author: opts.author ?? '',
    createdAt: now,
    modifiedAt: now,
    customProperties: {},
  };
  return {
    settings,
    entities: new Map(),
    layers,
    linetypes,
    textStyles,
    dimStyles,
    mleaderStyles,
    tableStyles,
    mlineStyles,
    blocks: new Map(),
    layouts,
    groups: new Map(),
    views: new Map(),
    layerStates: new Map(),
    layerFilters: new Map(),
    assets: new Map(),
    constraints: new Map(),
    parameters: new Map(),
    parameterSets: new Map(),
  };
}

export function createDocument(opts: Parameters<typeof createDocumentData>[0] = {}): CadDocument {
  return new CadDocument(createDocumentData(opts));
}

/** Propiedades base de una entidad nueva según las propiedades actuales del documento. */
export function entityDefaults(doc: CadDocument, owner: Id = MODEL_SPACE_ID): Omit<EntityBase, 'id' | 'type' | 'order'> {
  const s = doc.settings;
  return {
    owner,
    layer: doc.data.layers.has(s.currentLayer) ? s.currentLayer : LAYER0_ID,
    color: s.currentColor,
    linetype: s.currentLinetype,
    linetypeScale: 1,
    lineweight: s.currentLineweight,
    transparency: s.currentTransparency,
    visible: true,
  };
}

/** Crea una entidad completa (fuera de transacción) para pruebas o previsualización. */
export function makeEntity<E extends Entity>(doc: CadDocument, props: Omit<E, keyof EntityBase> & { type: E['type'] } & Partial<EntityBase>): E {
  return { ...entityDefaults(doc, props.owner), id: props.id ?? newId(), order: props.order ?? 0, ...props } as E;
}
