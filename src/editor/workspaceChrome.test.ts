import { expect, it } from 'vitest';
import { normalizeWorkspacePanels, setPanelFloating } from './workspaceChrome';
it('adds Architecture once as floating while preserving deliberate v4 panel choices', () => {
  const result = normalizeWorkspacePanels({ version: 4, left: ['layers', 'palettes'], right: ['properties', 'blocks', 'parameters'], floating: ['blocks'], collapsed: ['right'] });
  expect(result).toEqual({ version: 4, left: ['layers', 'palettes'], right: ['properties', 'blocks', 'parameters', 'architecture'], floating: ['blocks', 'architecture'], collapsed: ['right'] });
  expect(normalizeWorkspacePanels(result)).toEqual(result);
  const pinned = setPanelFloating(result, 'architecture', false);
  expect(normalizeWorkspacePanels(pinned)).toEqual(pinned);
});
