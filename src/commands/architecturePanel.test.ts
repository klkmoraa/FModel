import { expect, it } from 'vitest';
import { registerAllCommands } from './index';
import { findCommand } from './registry';
import { toolsForRibbonTab } from '../ui/PrecisionDeck';
it('opens Architecture through its canonical read-only command and unique Spanish alias', () => {
  registerAllCommands();
  const command = findCommand('ARCHITECTURE');
  expect(command).toMatchObject({ name: 'ARCHITECTURE', ui: 'panel:architecture', readOnly: true });
  expect(findCommand('ARQUITECTURA')).toBe(command);
  expect(findCommand('PARAMETERS')?.ui).toBe('panel:parameters');
  expect(findCommand('COLUMN')?.ui).toBeUndefined();
  const tools = toolsForRibbonTab('architecture').flatMap(group => group.tools);
  expect(tools.map(tool => tool.cmd)).toEqual(expect.arrayContaining(['ARCHITECTURE', 'COLUMN', 'STAIRPLAN', 'WINDOWELEVATION', 'COMPONENTEDIT']));
});
