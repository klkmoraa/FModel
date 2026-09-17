import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerAllCommands } from '../commands';
import { allCommands, findCommand } from '../commands/registry';
import { DIALOGS } from '../ui/Dialogs';
import { PANELS } from '../ui/Docks';
import { hasCadIcon } from '../ui/icons';
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

  const uiExists = (ui: string) => ui === 'clean-screen' || (ui.startsWith('panel:') ? !!PANELS[ui.slice(6)] : !!DIALOGS[ui]);

  it('every command opens a real dialog or panel', () => {
    const dangling = allCommands()
      .filter((c) => c.ui && !uiExists(c.ui))
      .map((c) => `${c.name} → ${c.ui}`);
    expect(dangling).toEqual([]);
  });

  it('every interface requested from a command is registered', () => {
    const dir = new URL('../commands/', import.meta.url).pathname;
    const ids = new Set<string>();
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/requestUi\(\s*'([^']+)'/g)) ids.add(m[1]);
    }
    expect(ids.size).toBeGreaterThan(5);
    expect([...ids].filter((id) => !uiExists(id))).toEqual([]);
  });

  it('every command is named, described and iconed in both languages', () => {
    const bad: string[] = [];
    for (const c of allCommands()) {
      for (const [field, l10n] of [['label', c.label], ['description', c.description]] as const) {
        if (!l10n?.es?.trim() || !l10n?.en?.trim()) bad.push(`${c.name}: ${field}`);
        if (l10n?.es === l10n?.en && /[áéíóúñ¿¡]/i.test(l10n?.es ?? '')) bad.push(`${c.name}: ${field} sin traducir`);
      }
      if (c.icon && !hasCadIcon(c.icon)) bad.push(`${c.name}: icono «${c.icon}»`);
    }
    expect(bad).toEqual([]);
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
