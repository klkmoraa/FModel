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

const FS = {
  day: {
    n000: '#fffefa',
    n050: '#f7f6f1',
    n200: '#dde2dc',
    n900: '#14171a',
    model: '#7657d5',
    analysis: '#ed4b46',
    civil: '#468c09',
    project: '#d9720a',
    interop: '#3a72e3',
  },
  night: {
    n000: '#0e1113',
    n050: '#14171a',
    n200: '#252a2e',
    n900: '#f2f4f3',
    model: '#a990ff',
    analysis: '#ff8e80',
    civil: '#55c990',
    project: '#f3c553',
    interop: '#72a1ff',
  },
} as const;

const FM_DOCUMENT_PAPER = '#ffffff';

/** Estados exclusivos del canvas: no se promueven a tokens globales de FusionStructure. */
const FM_CANVAS = {
  day: {
    hover: '#5b3fc0',
    axisX: 'rgba(237,75,70,0.4)',
    axisY: 'rgba(70,140,9,0.4)',
    accentSoft: 'rgba(118,87,213,0.14)',
    windowFill: 'rgba(58,114,227,0.1)',
    crossingFill: 'rgba(70,140,9,0.1)',
    tracking: 'rgba(118,87,213,0.85)',
    cursor: 'rgba(20,23,26,0.85)',
    tooltipBg: 'rgba(20,23,26,0.92)',
    construction: 'rgba(118,87,213,0.5)',
    marginLine: 'rgba(20,23,26,0.3)',
  },
  night: {
    hover: '#c9bbff',
    axisX: 'rgba(255,142,128,0.45)',
    axisY: 'rgba(85,201,144,0.45)',
    accentSoft: 'rgba(169,144,255,0.18)',
    windowFill: 'rgba(114,161,255,0.12)',
    crossingFill: 'rgba(85,201,144,0.12)',
    tracking: 'rgba(169,144,255,0.85)',
    cursor: 'rgba(242,244,243,0.9)',
    tooltipBg: 'rgba(27,31,34,0.94)',
    construction: 'rgba(169,144,255,0.55)',
    marginLine: 'rgba(20,23,26,0.25)',
  },
} as const;

export const THEME_NIGHT: RenderTheme = {
  dark: true,
  background: FS.night.n000,
  paperBackground: FS.night.n200,
  sheet: FM_DOCUMENT_PAPER,
  sheetShadow: 'rgba(0,0,0,0.55)',
  gridMinor: 'rgba(242,244,243,0.05)',
  gridMajor: 'rgba(242,244,243,0.11)',
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
  sheetShadow: 'rgba(20,23,26,0.22)',
  gridMinor: 'rgba(20,23,26,0.05)',
  gridMajor: 'rgba(20,23,26,0.1)',
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
