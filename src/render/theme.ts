/** Colores del lienzo derivados del brandbook (familia Modelo). */
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

export const THEME_NIGHT: RenderTheme = {
  dark: true,
  background: '#0e1113',
  paperBackground: '#252a2e',
  sheet: '#fffefa',
  sheetShadow: 'rgba(0,0,0,0.55)',
  gridMinor: 'rgba(242,244,243,0.05)',
  gridMajor: 'rgba(242,244,243,0.11)',
  axisX: 'rgba(255,142,128,0.45)',
  axisY: 'rgba(85,201,144,0.45)',
  accent: '#a990ff',
  accentSoft: 'rgba(169,144,255,0.18)',
  hover: '#c9bbff',
  gripFill: '#a990ff',
  gripHot: '#ff8e80',
  gripHover: '#f3c553',
  windowFill: 'rgba(114,161,255,0.12)',
  windowStroke: '#72a1ff',
  crossingFill: 'rgba(85,201,144,0.12)',
  crossingStroke: '#55c990',
  snap: '#f3c553',
  tracking: 'rgba(169,144,255,0.85)',
  preview: '#a990ff',
  cursor: 'rgba(242,244,243,0.9)',
  tooltipBg: 'rgba(27,31,34,0.94)',
  tooltipInk: '#f2f4f3',
  construction: 'rgba(169,144,255,0.55)',
  marginLine: 'rgba(20,23,26,0.25)',
  diffAdded: '#55c990',
  diffModified: '#f3c553',
  diffRemoved: '#ff8e80',
};

export const THEME_DAY: RenderTheme = {
  dark: false,
  background: '#f7f6f1',
  paperBackground: '#dde2dc',
  sheet: '#ffffff',
  sheetShadow: 'rgba(20,23,26,0.22)',
  gridMinor: 'rgba(20,23,26,0.05)',
  gridMajor: 'rgba(20,23,26,0.1)',
  axisX: 'rgba(237,75,70,0.4)',
  axisY: 'rgba(70,140,9,0.4)',
  accent: '#7657d5',
  accentSoft: 'rgba(118,87,213,0.14)',
  hover: '#5b3fc0',
  gripFill: '#7657d5',
  gripHot: '#ed4b46',
  gripHover: '#d9720a',
  windowFill: 'rgba(58,114,227,0.1)',
  windowStroke: '#3a72e3',
  crossingFill: 'rgba(70,140,9,0.1)',
  crossingStroke: '#468c09',
  snap: '#d9720a',
  tracking: 'rgba(118,87,213,0.85)',
  preview: '#7657d5',
  cursor: 'rgba(20,23,26,0.85)',
  tooltipBg: 'rgba(20,23,26,0.92)',
  tooltipInk: '#f7f6f1',
  construction: 'rgba(118,87,213,0.5)',
  marginLine: 'rgba(20,23,26,0.3)',
  diffAdded: '#468c09',
  diffModified: '#d9720a',
  diffRemoved: '#ed4b46',
};

export function themeFor(dark: boolean, bg: 'auto' | 'paper' | 'charcoal' | 'black'): RenderTheme {
  const base = dark ? THEME_NIGHT : THEME_DAY;
  if (bg === 'auto') return base;
  if (bg === 'paper') return { ...THEME_DAY, background: '#f7f6f1' };
  if (bg === 'black') return { ...THEME_NIGHT, background: '#000000' };
  return { ...THEME_NIGHT, background: '#14171a' };
}
