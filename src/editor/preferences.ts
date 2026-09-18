import type { Lang } from '../commands/types';
import type { SnapSettings } from '../snap/snapEngine';
import { DEFAULT_SNAP_SETTINGS } from '../snap/snapEngine';

export type ThemePref = 'system' | 'dia' | 'noche';
export type CanvasBg = 'auto' | 'paper' | 'charcoal' | 'black';
/** Qué hace la rueda / el desplazamiento de dos dedos: deducirlo, hacer zoom siempre o encuadrar siempre. */
export type WheelMode = 'auto' | 'zoom' | 'pan';

export interface Preferences {
  lang: Lang;
  theme: ThemePref;
  canvasBackground: CanvasBg;
  wheelMode: WheelMode;
  snap: SnapSettings;
  grid: { on: boolean; spacing: number; majorEvery: number; adaptive: boolean };
  dynamicInput: { on: boolean; relative: boolean; showTooltips: boolean };
  lineweightDisplay: boolean;
  transparencyDisplay: boolean;
  selectionCycling: boolean;
  rolloverHighlight: boolean;
  /** tarjeta flotante de propiedades al seleccionar (QP) */
  quickProperties: boolean;
  crosshairSize: number; // % de la pantalla, 100 = completa
  pickboxPx: number;
  gripSizePx: number;
  aliases: Record<string, string>;
  shortcuts: Record<string, string>;
  favorites: string[];
  autosaveMinutes: number;
  onboardingDone: boolean;
  recentFiles: { name: string; id: string; at: number }[];
  drawingPresets: { name: string; layer?: string; color?: string; linetype?: string; lineweight?: number }[];
  panels: { left: string[]; right: string[]; collapsed: string[]; floating: string[] };
}

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'Ctrl+Z': 'U',
  'Ctrl+Y': 'REDO',
  'Ctrl+Shift+Z': 'REDO',
  'Ctrl+S': 'QSAVE',
  'Ctrl+Shift+S': 'SAVEAS',
  'Ctrl+O': 'OPEN',
  'Ctrl+N': 'NEW',
  'Ctrl+P': 'PLOT',
  'Ctrl+C': 'COPYCLIP',
  'Ctrl+X': 'CUTCLIP',
  'Ctrl+V': 'PASTECLIP',
  'Ctrl+A': 'SELECTALL',
  'Ctrl+1': 'PROPERTIES',
  'Ctrl+0': 'CLEANSCREENON',
  'Ctrl+3': 'TOOLPALETTES',
  'Delete': 'ERASE',
  F1: 'HELP',
  F2: 'TEXTSCR',
  F3: 'OSNAPTOGGLE',
  F7: 'GRIDTOGGLE',
  F8: 'ORTHOTOGGLE',
  F9: 'SNAPTOGGLE',
  F10: 'POLARTOGGLE',
  F11: 'OTRACKTOGGLE',
  F12: 'DYNTOGGLE',
};

export const DEFAULT_PREFERENCES: Preferences = {
  lang: typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es',
  theme: 'system',
  canvasBackground: 'auto',
  wheelMode: 'auto',
  snap: DEFAULT_SNAP_SETTINGS,
  grid: { on: true, spacing: 10, majorEvery: 5, adaptive: true },
  dynamicInput: { on: true, relative: true, showTooltips: true },
  lineweightDisplay: true,
  transparencyDisplay: true,
  selectionCycling: true,
  rolloverHighlight: true,
  quickProperties: false,
  crosshairSize: 5,
  pickboxPx: 6,
  gripSizePx: 7,
  aliases: {},
  shortcuts: DEFAULT_SHORTCUTS,
  favorites: ['LINE', 'PLINE', 'CIRCLE', 'TRIM', 'OFFSET', 'DIMLINEAR'],
  autosaveMinutes: 2,
  onboardingDone: false,
  recentFiles: [],
  drawingPresets: [],
  panels: { left: ['palettes'], right: ['properties', 'layers', 'blocks'], collapsed: [], floating: [] },
};

const KEY = 'fmodel.cad.preferences.v1';

export function loadPreferences(): Preferences {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PREFERENCES);
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...structuredClone(DEFAULT_PREFERENCES),
      ...parsed,
      snap: { ...DEFAULT_SNAP_SETTINGS, ...parsed.snap },
      grid: { ...DEFAULT_PREFERENCES.grid, ...parsed.grid },
      dynamicInput: { ...DEFAULT_PREFERENCES.dynamicInput, ...parsed.dynamicInput },
      shortcuts: { ...DEFAULT_SHORTCUTS, ...parsed.shortcuts },
      panels: { ...DEFAULT_PREFERENCES.panels, ...parsed.panels },
    };
  } catch {
    return structuredClone(DEFAULT_PREFERENCES);
  }
}

export function savePreferences(p: Preferences) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* almacenamiento no disponible: las preferencias duran la sesión */
  }
}
