import tokensCss from '../styles/tokens.css?raw';

/** Tema del lienzo.
 * Los neutros, señales y color de familia se derivan del brandbook.
 * Ejes, grips, ventanas y tracking son semántica propia del CAD (no definida por el brandbook).
 */
export interface RenderTheme {
  dark: boolean;
  background: string;
  paperBackground: string;
  sheet: string;
  sheetShadow: string;
  gridMinor: string;
  gridMajor: string;
  axisX: string;
  axisY: string;
  accent: string;
  accentSoft: string;
  hover: string;
  gripFill: string;
  gripHot: string;
  gripHover: string;
  windowFill: string;
  windowStroke: string;
  crossingFill: string;
  crossingStroke: string;
  snap: string;
  tracking: string;
  preview: string;
  cursor: string;
  tooltipBg: string;
  tooltipInk: string;
  construction: string;
  marginLine: string;
  /** comparación de revisiones: señales de dato del brandbook */
  diffAdded: string;
  diffModified: string;
  diffRemoved: string;
}


/**
 * Una sola fuente de color: `src/styles/tokens.css`.
 *
 * El lienzo no puede leer variables CSS al dibujar (lo hace en un canvas 2D y
 * también en pruebas sin DOM), así que lee el mismo archivo como texto y toma de
 * ahí los neutros y las familias de Día (`:root`) y de Noche
 * (`:root[data-theme='noche']`). Cambiar un color en `tokens.css` cambia la
 * interfaz y el dibujo a la vez; aquí sólo viven las opacidades propias del CAD.
 */
type Hex = `#${string}`;

const block = (css: string, selector: string): string => {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`tokens.css: falta el bloque ${selector}`);
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};

const readVars = (body: string): Record<string, string> => {
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[match[1]!] = match[2]!.trim();
  return vars;
};

const DAY_VARS = readVars(block(tokensCss, ':root {'));
const NIGHT_VARS = { ...DAY_VARS, ...readVars(block(tokensCss, ":root[data-theme='noche'] {")) };

const hex = (vars: Record<string, string>, name: string): Hex => {
  const value = vars[name]?.toLowerCase();
  if (!value || !/^#[0-9a-f]{6}$/.test(value)) throw new Error(`tokens.css: --${name} debe ser un hex de 6 dígitos`);
  return value as Hex;
};

const palette = (vars: Record<string, string>) => ({
  n000: hex(vars, 'n-000'),
  n050: hex(vars, 'n-050'),
  n100: hex(vars, 'n-100'),
  n200: hex(vars, 'n-200'),
  n900: hex(vars, 'n-900'),
  model: hex(vars, 'fs-family-modelo'),
  analysis: hex(vars, 'fs-family-analisis'),
  civil: hex(vars, 'fs-family-civil'),
  project: hex(vars, 'fs-family-proyecto'),
  interop: hex(vars, 'fs-family-interop'),
  interactionText: hex(vars, 'fs-interaction-text'),
});

const FS = { day: palette(DAY_VARS), night: palette(NIGHT_VARS) } as const;

/** `#rrggbb` + opacidad → `rgba(r,g,b,a)`. */
const alpha = (color: Hex, a: number): string => {
  const n = Number.parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const FM_DOCUMENT_PAPER = hex(DAY_VARS, 'fm-document-paper');
/** Tinta del dibujo sobre la hoja física, que es blanca en ambos temas. */
const SHEET_INK = FS.day.n900;

/** Estados exclusivos del canvas: no se promueven a tokens globales de FusionStructure. */
const FM_CANVAS = {
  day: {
    hover: FS.day.interactionText,
    axisX: alpha(FS.day.analysis, 0.4),
    axisY: alpha(FS.day.civil, 0.4),
    accentSoft: alpha(FS.day.model, 0.14),
    windowFill: alpha(FS.day.interop, 0.1),
    crossingFill: alpha(FS.day.civil, 0.1),
    tracking: alpha(FS.day.model, 0.85),
    cursor: alpha(FS.day.n900, 0.85),
    tooltipBg: alpha(FS.day.n900, 0.92),
    construction: alpha(FS.day.model, 0.5),
    marginLine: alpha(SHEET_INK, 0.3),
  },
  night: {
    hover: FS.night.interactionText,
    axisX: alpha(FS.night.analysis, 0.45),
    axisY: alpha(FS.night.civil, 0.45),
    accentSoft: alpha(FS.night.model, 0.18),
    windowFill: alpha(FS.night.interop, 0.12),
    crossingFill: alpha(FS.night.civil, 0.12),
    tracking: alpha(FS.night.model, 0.85),
    cursor: alpha(FS.night.n900, 0.9),
    tooltipBg: alpha(FS.night.n100, 0.94),
    construction: alpha(FS.night.model, 0.55),
    marginLine: alpha(SHEET_INK, 0.25),
  },
} as const;

export const THEME_NIGHT: RenderTheme = {
  dark: true,
  background: FS.night.n000,
  paperBackground: FS.night.n200,
  sheet: FM_DOCUMENT_PAPER,
  sheetShadow: 'rgba(0,0,0,0.55)',
  gridMinor: alpha(FS.night.n900, 0.05),
  gridMajor: alpha(FS.night.n900, 0.11),
  axisX: FM_CANVAS.night.axisX,
  axisY: FM_CANVAS.night.axisY,
  accent: FS.night.model,
  accentSoft: FM_CANVAS.night.accentSoft,
  hover: FM_CANVAS.night.hover,
  gripFill: FS.night.model,
  gripHot: FS.night.analysis,
  gripHover: FS.night.project,
  windowFill: FM_CANVAS.night.windowFill,
  windowStroke: FS.night.interop,
  crossingFill: FM_CANVAS.night.crossingFill,
  crossingStroke: FS.night.civil,
  snap: FS.night.project,
  tracking: FM_CANVAS.night.tracking,
  preview: FS.night.model,
  cursor: FM_CANVAS.night.cursor,
  tooltipBg: FM_CANVAS.night.tooltipBg,
  tooltipInk: FS.night.n900,
  construction: FM_CANVAS.night.construction,
  marginLine: FM_CANVAS.night.marginLine,
  diffAdded: FS.night.civil,
  diffModified: FS.night.project,
  diffRemoved: FS.night.analysis,
};

export const THEME_DAY: RenderTheme = {
  dark: false,
  background: FS.day.n050,
  paperBackground: FS.day.n200,
  sheet: FM_DOCUMENT_PAPER,
  sheetShadow: alpha(FS.day.n900, 0.22),
  gridMinor: alpha(FS.day.n900, 0.05),
  gridMajor: alpha(FS.day.n900, 0.1),
  axisX: FM_CANVAS.day.axisX,
  axisY: FM_CANVAS.day.axisY,
  accent: FS.day.model,
  accentSoft: FM_CANVAS.day.accentSoft,
  hover: FM_CANVAS.day.hover,
  gripFill: FS.day.model,
  gripHot: FS.day.analysis,
  gripHover: FS.day.project,
  windowFill: FM_CANVAS.day.windowFill,
  windowStroke: FS.day.interop,
  crossingFill: FM_CANVAS.day.crossingFill,
  crossingStroke: FS.day.civil,
  snap: FS.day.project,
  tracking: FM_CANVAS.day.tracking,
  preview: FS.day.model,
  cursor: FM_CANVAS.day.cursor,
  tooltipBg: FM_CANVAS.day.tooltipBg,
  tooltipInk: FS.day.n050,
  construction: FM_CANVAS.day.construction,
  marginLine: FM_CANVAS.day.marginLine,
  diffAdded: FS.day.civil,
  diffModified: FS.day.project,
  diffRemoved: FS.day.analysis,
};

export function themeFor(dark: boolean, bg: 'auto' | 'paper' | 'charcoal' | 'black'): RenderTheme {
  const base = dark ? THEME_NIGHT : THEME_DAY;
  if (bg === 'auto') return base;
  if (bg === 'paper') return { ...THEME_DAY, background: FS.day.n050 };
  if (bg === 'black') return { ...THEME_NIGHT, background: '#000000' };
  return { ...THEME_NIGHT, background: FS.night.n050 };
}
