import { describe, expect, it } from 'vitest';
import { normalizeDockWidth, normalizeWorkspacePanels, setPanelFloating, uniqueFavoriteCommands } from '../editor/workspaceChrome';

describe('workspace chrome preferences', () => {
  it('migrates the previous docked workspace to a canvas-first floating layout', () => {
    expect(
      normalizeWorkspacePanels({
        left: ['palettes'],
        right: ['properties', 'layers', 'blocks'],
        collapsed: [],
        floating: [],
      }),
    ).toEqual({
      version: 4,
      left: ['palettes'],
      right: ['properties', 'layers', 'blocks', 'parameters'],
      collapsed: [],
      floating: ['palettes', 'properties', 'layers', 'blocks', 'parameters'],
    });
  });

  it('keeps a deliberate version 4 panel layout and removes invalid values', () => {
    expect(
      normalizeWorkspacePanels({
        version: 4,
        left: ['palettes', 'unknown'],
        right: ['properties', 'authoring'],
        collapsed: ['left', 'other'],
        floating: ['layers', 'layers', 'unknown'],
      }),
    ).toEqual({
      version: 4,
      left: ['palettes'],
      right: ['properties', 'authoring', 'layers', 'blocks', 'parameters'],
      collapsed: ['left'],
      floating: ['layers', 'parameters'],
    });
  });

  it('restores panel assignments when current preferences are incomplete', () => {
    expect(normalizeWorkspacePanels({ version: 4, left: [], right: [], floating: [] })).toEqual({
      version: 4,
      left: ['palettes'],
      right: ['properties', 'layers', 'blocks', 'parameters'],
      collapsed: [],
      floating: ['parameters'],
    });
  });

  it('pins and floats panels without mutating the original preference', () => {
    const panels = normalizeWorkspacePanels(undefined);
    const pinned = setPanelFloating(panels, 'properties', false);
    const floated = setPanelFloating(pinned, 'properties', true);

    expect(panels.floating).toContain('properties');
    expect(pinned.floating).not.toContain('properties');
    expect(floated.floating.filter((id) => id === 'properties')).toHaveLength(1);
  });

  it('keeps a stable, normalized set of favorite commands', () => {
    expect(uniqueFavoriteCommands([' line ', 'LINE', '', 'circle', 'TRIM'], 3)).toEqual(['LINE', 'CIRCLE', 'TRIM']);
  });

  it('restores or clamps persisted dock widths', () => {
    expect(normalizeDockWidth('Infinity', 340)).toBe(340);
    expect(normalizeDockWidth('120', 340)).toBe(200);
    expect(normalizeDockWidth(900, 260)).toBe(720);
    expect(normalizeDockWidth('412.4', 260)).toBe(412);
  });
});
