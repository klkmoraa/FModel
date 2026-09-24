import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SNAP_SETTINGS } from '../snap/snapEngine';
import { DEFAULT_PREFERENCES, loadPreferences } from './preferences';

afterEach(() => vi.unstubAllGlobals());

describe('loadPreferences', () => {
  it('restaura valores seguros cuando las preferencias guardadas tienen tipos inválidos', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({
        lang: 'fr',
        theme: 'purple',
        aliases: { L: 42, C: 'CIRCLE' },
        shortcuts: { 'Ctrl+Z': 42 },
        favorites: null,
        canvasBackground: 'transparent',
        wheelMode: 'spin',
        crosshairSize: 'full',
        pickboxPx: -2,
        gripSizePx: Infinity,
        autosaveMinutes: 999,
        lineweightDisplay: 'yes',
        grid: { on: 'yes', spacing: 0, majorEvery: -3, adaptive: null },
        dynamicInput: { on: 1, relative: false, showTooltips: 'yes' },
        recentFiles: [{ name: 'Plano', id: null, at: 'hoy' }, { name: 'Válido', id: 'd1', at: 12 }],
        drawingPresets: [{ name: 'Roto', lineweight: '25' }, { name: 'Muros', layer: 'Muros', lineweight: 25 }],
        snap: { types: null, polarAdditional: null, osnap: 'yes', polarIncrement: 0, snapSpacing: { x: -1, y: '10' }, aperturePx: 1000 },
      }),
    });

    const prefs = loadPreferences();
    expect(prefs.lang).toBe(DEFAULT_PREFERENCES.lang);
    expect(prefs.theme).toBe('system');
    expect(prefs.aliases).toEqual({ C: 'CIRCLE' });
    expect(prefs.shortcuts['Ctrl+Z']).toBe(DEFAULT_PREFERENCES.shortcuts['Ctrl+Z']);
    expect(prefs.favorites).toEqual(DEFAULT_PREFERENCES.favorites);
    expect(prefs.snap.types).toEqual(DEFAULT_SNAP_SETTINGS.types);
    expect(prefs.snap.polarAdditional).toEqual([]);
    expect(prefs.canvasBackground).toBe(DEFAULT_PREFERENCES.canvasBackground);
    expect(prefs.wheelMode).toBe(DEFAULT_PREFERENCES.wheelMode);
    expect(prefs.crosshairSize).toBe(DEFAULT_PREFERENCES.crosshairSize);
    expect(prefs.pickboxPx).toBe(DEFAULT_PREFERENCES.pickboxPx);
    expect(prefs.gripSizePx).toBe(DEFAULT_PREFERENCES.gripSizePx);
    expect(prefs.autosaveMinutes).toBe(DEFAULT_PREFERENCES.autosaveMinutes);
    expect(prefs.lineweightDisplay).toBe(DEFAULT_PREFERENCES.lineweightDisplay);
    expect(prefs.grid).toEqual(DEFAULT_PREFERENCES.grid);
    expect(prefs.dynamicInput).toEqual({ ...DEFAULT_PREFERENCES.dynamicInput, relative: false });
    expect(prefs.recentFiles).toEqual([{ name: 'Válido', id: 'd1', at: 12 }]);
    expect(prefs.drawingPresets).toEqual([{ name: 'Muros', layer: 'Muros', lineweight: 25 }]);
    expect(prefs.snap).toMatchObject({
      osnap: DEFAULT_SNAP_SETTINGS.osnap,
      polarIncrement: DEFAULT_SNAP_SETTINGS.polarIncrement,
      snapSpacing: DEFAULT_SNAP_SETTINGS.snapSpacing,
      aperturePx: DEFAULT_SNAP_SETTINGS.aperturePx,
    });
  });

  it('conserva valores válidos dentro de los límites soportados', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({
        canvasBackground: 'black',
        wheelMode: 'pan',
        crosshairSize: 100,
        pickboxPx: 20,
        gripSizePx: 4,
        autosaveMinutes: 0,
        grid: { on: false, spacing: 2.5, majorEvery: 8, adaptive: false },
        snap: { osnap: false, snapSpacing: { x: 2, y: 3 }, aperturePx: 16 },
      }),
    });

    expect(loadPreferences()).toMatchObject({
      canvasBackground: 'black',
      wheelMode: 'pan',
      crosshairSize: 100,
      pickboxPx: 20,
      gripSizePx: 4,
      autosaveMinutes: 0,
      grid: { on: false, spacing: 2.5, majorEvery: 8, adaptive: false },
      snap: { osnap: false, snapSpacing: { x: 2, y: 3 }, aperturePx: 16 },
    });
  });
});
