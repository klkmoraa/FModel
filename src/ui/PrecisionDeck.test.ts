import { describe, expect, it } from 'vitest';
import { toolsForRibbonTab } from './PrecisionDeck';

describe('Precision Deck tool discovery', () => {
  it('keeps every tool family available without duplicating identical actions', () => {
    const home = toolsForRibbonTab('home');
    expect(home.some((group) => group.tools.some((tool) => tool.cmd === 'LINE'))).toBe(true);
    expect(home.some((group) => group.tools.some((tool) => tool.cmd === 'TRIM'))).toBe(true);

    const keys = home.flatMap((group) => group.tools.map((tool) => `${tool.cmd}:${tool.args?.join(',') ?? ''}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('falls back to the home family when the requested family does not exist', () => {
    expect(toolsForRibbonTab('missing')).toEqual(toolsForRibbonTab('home'));
  });
});
