import { describe, expect, it } from 'vitest';
import { registerAllCommands } from '../commands';
import { allCommands, findCommand } from '../commands/registry';
import { RIBBON } from '../ui/ribbonConfig';
import { DEFAULT_SHORTCUTS } from '../editor/preferences';
import { FEATURES } from './features';

describe('feature status and UI wiring', () => {
  registerAllCommands();

  it('every command cited in the feature matrix exists', () => {
    const missing = FEATURES.flatMap((f) => f.commands ?? []).filter((c) => !findCommand(c));
    expect(missing).toEqual([]);
  });

  it('every ribbon tool and default shortcut runs a registered command', () => {
    const tools = RIBBON.flatMap((t) => t.groups.flatMap((g) => g.tools.map((x) => x.cmd)));
    expect(tools.filter((c) => !findCommand(c))).toEqual([]);
    expect(Object.values(DEFAULT_SHORTCUTS).filter((c) => !findCommand(c))).toEqual([]);
  });

  it('command names and aliases do not collide', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const c of allCommands()) {
      for (const key of [c.name, ...(c.aliases ?? [])].map((k) => k.toUpperCase())) {
        const prev = seen.get(key);
        if (prev && prev !== c.name) clashes.push(`${key}: ${prev} / ${c.name}`);
        seen.set(key, c.name);
      }
    }
    expect(clashes).toEqual([]);
  });
});
