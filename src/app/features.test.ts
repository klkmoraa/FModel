import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerAllCommands } from '../commands';
import { allCommands, findCommand } from '../commands/registry';
import { DIALOGS } from '../ui/Dialogs';
import { PANELS } from '../ui/Docks';
import { hasCadIcon } from '../ui/icons';
import { RIBBON } from '../ui/ribbonConfig';
import { DEFAULT_SHORTCUTS } from '../editor/preferences';
import { EVIDENCE_CATALOG } from '../audit/evidence';
import { COMMAND_EVIDENCE_REGISTRY } from '../commands/behavior/evidence';
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

  const uiExists = (ui: string) => ui === 'clean-screen' || ui === 'welcome' || ui === 'workspace' || (ui.startsWith('panel:') ? !!PANELS[ui.slice(6)] : !!DIALOGS[ui]);

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

  it('every available feature has verified evidence (DOC-002)', () => {
    const missing = FEATURES.filter((f) => f.status === 'available' && (!f.evidence || f.evidence.length === 0)).map((f) => f.name.es);
    expect(missing).toEqual([]);
  });

  it('all feature evidence refs resolve to executable test files (DOC-002)', () => {
    const unknown: string[] = [];
    const root = new URL('../../', import.meta.url);
    for (const f of FEATURES) {
      for (const ev of f.evidence ?? []) {
        const record = EVIDENCE_CATALOG[ev.ref];
        if (!record) {
          unknown.push(`${f.name.es} -> ${ev.ref}`);
          continue;
        }
        try {
          const source = readFileSync(new URL(record.testFile, root), 'utf8');
          if (!source.includes(record.testName)) unknown.push(`${ev.ref}: marcador ausente en ${record.testFile}`);
        } catch {
          unknown.push(`${ev.ref}: archivo inexistente ${record.testFile}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('every catalog record has an existing marker and executable command (DOC-002)', () => {
    const invalid = Object.entries(EVIDENCE_CATALOG).flatMap(([ref, record]) => {
      const path = new URL(`../../${record.testFile}`, import.meta.url);
      if (!record.testCommand.trim() || !existsSync(path)) return [`${ref}: archivo o comando ausente`];
      return readFileSync(path, 'utf8').includes(record.testName) ? [] : [`${ref}: marcador ausente`];
    });
    expect(invalid).toEqual([]);
  });

  it('every available command resolves to a catalogued test (CMD-001)', () => {
    const missing = FEATURES
      .filter((feature) => feature.status === 'available')
      .flatMap((feature) => (feature.commands ?? []).filter((command) => !COMMAND_EVIDENCE_REGISTRY[command.toUpperCase()]))
      .map((command) => command.toUpperCase());
    expect([...new Set(missing)]).toEqual([]);
  });

  it('every available command points to the catalogued test that covers it (CMD-001)', () => {
    const invalid: string[] = [];
    for (const feature of FEATURES.filter((item) => item.status === 'available')) {
      for (const command of feature.commands ?? []) {
        const entry = COMMAND_EVIDENCE_REGISTRY[command.toUpperCase()];
        const record = entry && EVIDENCE_CATALOG[entry.evidenceRef];
        if (!entry || !record || !record.commands?.includes(command.toUpperCase())) {
          invalid.push(`${feature.name.es}: ${command}`);
          continue;
        }
        const path = new URL(`../../${entry.testFile}`, import.meta.url);
        if (!existsSync(path) || !readFileSync(path, 'utf8').includes(entry.testName) || !entry.testCommand.trim()) invalid.push(`${feature.name.es}: ${command} -> ${entry.testFile}`);
      }
    }
    expect(invalid).toEqual([]);
  });

  it('experimental features document limitations in both languages (DOC-002)', () => {
    const undocumented = FEATURES.filter((f) => f.status === 'experimental' && (!f.note?.es?.trim() || !f.note?.en?.trim())).map((f) => f.name.es);
    expect(undocumented).toEqual([]);
  });
});
