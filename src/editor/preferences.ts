import type { Lang } from '../commands/types';
import type { SnapSettings } from '../snap/snapEngine';
import { DEFAULT_SNAP_SETTINGS } from '../snap/snapEngine';
import { ALL_SNAP_TYPES, type SnapType } from '../model/registry';
import { DEFAULT_WORKSPACE_PANELS, normalizeWorkspacePanels, type WorkspacePanelPreferences } from './workspaceChrome';

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
  /** muestra los glifos y cotas de las restricciones del dibujo */
  constraintBar: boolean;
  /** crea restricciones al dibujar sobre referencias exactas */
  inferConstraints: boolean;
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
  panels: WorkspacePanelPreferences;
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
  constraintBar: true,
  inferConstraints: false,
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
  panels: structuredClone(DEFAULT_WORKSPACE_PANELS),
};

const KEY = 'fmodel.cad.preferences.v1';

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [...fallback];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function finiteIn(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function recentFiles(value: unknown): Preferences['recentFiles'] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Preferences['recentFiles'][number] => {
    const item = object(entry);
    return typeof item.name === 'string' && typeof item.id === 'string' && typeof item.at === 'number' && Number.isFinite(item.at);
  }).slice(0, 50);
}

function drawingPresets(value: unknown): Preferences['drawingPresets'] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Preferences['drawingPresets'][number] => {
    const item = object(entry);
    return typeof item.name === 'string' && ['layer', 'color', 'linetype'].every((key) => item[key] === undefined || typeof item[key] === 'string') &&
      (item.lineweight === undefined || (typeof item.lineweight === 'number' && Number.isFinite(item.lineweight)));
  }).slice(0, 100);
}

export function loadPreferences(): Preferences {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PREFERENCES);
    const parsed = object(JSON.parse(raw));
    const rawSnap = object(parsed.snap);
    const rawSpacing = object(rawSnap.snapSpacing);
    const snap: SnapSettings = {
      osnap: bool(rawSnap.osnap, DEFAULT_SNAP_SETTINGS.osnap),
      types: Array.isArray(rawSnap.types)
        ? rawSnap.types.filter((type): type is SnapType => ALL_SNAP_TYPES.includes(type as SnapType))
        : [...DEFAULT_SNAP_SETTINGS.types],
      otrack: bool(rawSnap.otrack, DEFAULT_SNAP_SETTINGS.otrack),
      polar: bool(rawSnap.polar, DEFAULT_SNAP_SETTINGS.polar),
      polarIncrement: finiteIn(rawSnap.polarIncrement, DEFAULT_SNAP_SETTINGS.polarIncrement, Number.EPSILON, Math.PI * 2),
      polarAdditional: Array.isArray(rawSnap.polarAdditional)
        ? rawSnap.polarAdditional.filter((angle): angle is number => typeof angle === 'number' && Number.isFinite(angle)).slice(0, 360)
        : [],
      trackAllPolar: bool(rawSnap.trackAllPolar, DEFAULT_SNAP_SETTINGS.trackAllPolar),
      ortho: bool(rawSnap.ortho, DEFAULT_SNAP_SETTINGS.ortho),
      gridSnap: bool(rawSnap.gridSnap, DEFAULT_SNAP_SETTINGS.gridSnap),
      snapSpacing: {
        x: finiteIn(rawSpacing.x, DEFAULT_SNAP_SETTINGS.snapSpacing.x, Number.EPSILON, 1e12),
        y: finiteIn(rawSpacing.y, DEFAULT_SNAP_SETTINGS.snapSpacing.y, Number.EPSILON, 1e12),
      },
      aperturePx: finiteIn(rawSnap.aperturePx, DEFAULT_SNAP_SETTINGS.aperturePx, 2, 100),
      trackingTolPx: finiteIn(rawSnap.trackingTolPx, DEFAULT_SNAP_SETTINGS.trackingTolPx, 1, 100),
    };
    const rawGrid = object(parsed.grid);
    const rawDynamic = object(parsed.dynamicInput);
    return {
      ...structuredClone(DEFAULT_PREFERENCES),
      lang: parsed.lang === 'es' || parsed.lang === 'en' ? parsed.lang : DEFAULT_PREFERENCES.lang,
      theme: parsed.theme === 'system' || parsed.theme === 'dia' || parsed.theme === 'noche' ? parsed.theme : DEFAULT_PREFERENCES.theme,
      canvasBackground: ['auto', 'paper', 'charcoal', 'black'].includes(String(parsed.canvasBackground)) ? parsed.canvasBackground as CanvasBg : DEFAULT_PREFERENCES.canvasBackground,
      wheelMode: ['auto', 'zoom', 'pan'].includes(String(parsed.wheelMode)) ? parsed.wheelMode as WheelMode : DEFAULT_PREFERENCES.wheelMode,
      lineweightDisplay: bool(parsed.lineweightDisplay, DEFAULT_PREFERENCES.lineweightDisplay),
      transparencyDisplay: bool(parsed.transparencyDisplay, DEFAULT_PREFERENCES.transparencyDisplay),
      selectionCycling: bool(parsed.selectionCycling, DEFAULT_PREFERENCES.selectionCycling),
      rolloverHighlight: bool(parsed.rolloverHighlight, DEFAULT_PREFERENCES.rolloverHighlight),
      quickProperties: bool(parsed.quickProperties, DEFAULT_PREFERENCES.quickProperties),
      constraintBar: bool(parsed.constraintBar, DEFAULT_PREFERENCES.constraintBar),
      inferConstraints: bool(parsed.inferConstraints, DEFAULT_PREFERENCES.inferConstraints),
      crosshairSize: finiteIn(parsed.crosshairSize, DEFAULT_PREFERENCES.crosshairSize, 1, 100),
      pickboxPx: finiteIn(parsed.pickboxPx, DEFAULT_PREFERENCES.pickboxPx, 2, 20),
      gripSizePx: finiteIn(parsed.gripSizePx, DEFAULT_PREFERENCES.gripSizePx, 4, 20),
      aliases: stringRecord(parsed.aliases),
      favorites: stringArray(parsed.favorites, DEFAULT_PREFERENCES.favorites),
      autosaveMinutes: finiteIn(parsed.autosaveMinutes, DEFAULT_PREFERENCES.autosaveMinutes, 0, 60),
      onboardingDone: bool(parsed.onboardingDone, DEFAULT_PREFERENCES.onboardingDone),
      recentFiles: recentFiles(parsed.recentFiles),
      drawingPresets: drawingPresets(parsed.drawingPresets),
      snap,
      grid: {
        on: bool(rawGrid.on, DEFAULT_PREFERENCES.grid.on),
        spacing: finiteIn(rawGrid.spacing, DEFAULT_PREFERENCES.grid.spacing, Number.EPSILON, 1e12),
        majorEvery: Math.round(finiteIn(rawGrid.majorEvery, DEFAULT_PREFERENCES.grid.majorEvery, 1, 100)),
        adaptive: bool(rawGrid.adaptive, DEFAULT_PREFERENCES.grid.adaptive),
      },
      dynamicInput: {
        on: bool(rawDynamic.on, DEFAULT_PREFERENCES.dynamicInput.on),
        relative: bool(rawDynamic.relative, DEFAULT_PREFERENCES.dynamicInput.relative),
        showTooltips: bool(rawDynamic.showTooltips, DEFAULT_PREFERENCES.dynamicInput.showTooltips),
      },
      shortcuts: { ...DEFAULT_SHORTCUTS, ...stringRecord(parsed.shortcuts) },
      panels: normalizeWorkspacePanels(parsed.panels),
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
