export const WORKSPACE_PANEL_IDS = ['properties', 'layers', 'blocks', 'palettes', 'authoring', 'parameters'] as const;

export type WorkspacePanelId = (typeof WORKSPACE_PANEL_IDS)[number];

export interface WorkspacePanelPreferences {
  version: 4;
  left: WorkspacePanelId[];
  right: WorkspacePanelId[];
  collapsed: Array<'left' | 'right'>;
  floating: WorkspacePanelId[];
}

export const DEFAULT_WORKSPACE_PANELS: WorkspacePanelPreferences = {
  version: 4,
  left: ['palettes'],
  right: ['properties', 'layers', 'blocks', 'parameters'],
  collapsed: [],
  floating: ['palettes', 'properties', 'layers', 'blocks', 'parameters'],
};

/** Paneles incorporados después de la versión 4 de las preferencias. */
const PANELS_ADDED_LATER: readonly WorkspacePanelId[] = ['parameters'];

function uniqueAllowed<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<T>(allowed);
  return [...new Set(value.filter((entry): entry is T => typeof entry === 'string' && valid.has(entry as T)))];
}

/** Keeps the canvas clear by default; older docked layouts migrate once. */
export function normalizeWorkspacePanels(value: unknown): WorkspacePanelPreferences {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_WORKSPACE_PANELS);
  const candidate = value as Partial<WorkspacePanelPreferences>;
  const isCurrent = candidate.version === 4;
  const left = uniqueAllowed(candidate.left, WORKSPACE_PANEL_IDS);
  const right = uniqueAllowed(candidate.right, WORKSPACE_PANEL_IDS).filter((panel) => !left.includes(panel));
  // un panel posterior a estas preferencias llega flotante: no abre un dock que el usuario no pidió
  const added: WorkspacePanelId[] = [];
  for (const [side, defaults] of [[left, DEFAULT_WORKSPACE_PANELS.left], [right, DEFAULT_WORKSPACE_PANELS.right]] as const) {
    for (const panel of defaults) {
      if (left.includes(panel) || right.includes(panel)) continue;
      side.push(panel);
      added.push(panel);
    }
  }
  const floating = isCurrent && Array.isArray(candidate.floating) ? uniqueAllowed(candidate.floating, WORKSPACE_PANEL_IDS) : [...DEFAULT_WORKSPACE_PANELS.floating];
  for (const panel of added) if (PANELS_ADDED_LATER.includes(panel) && !floating.includes(panel)) floating.push(panel);
  return {
    version: 4,
    left,
    right,
    collapsed: uniqueAllowed(candidate.collapsed, ['left', 'right'] as const),
    floating,
  };
}

export function setPanelFloating(panels: WorkspacePanelPreferences, panel: WorkspacePanelId, floating: boolean): WorkspacePanelPreferences {
  const next = panels.floating.filter((id) => id !== panel);
  if (floating) next.push(panel);
  return { ...panels, floating: next };
}

export function isWorkspacePanelId(value: string): value is WorkspacePanelId {
  return (WORKSPACE_PANEL_IDS as readonly string[]).includes(value);
}

export function uniqueFavoriteCommands(names: string[], limit = 6): string[] {
  const normalized = names.map((name) => name.trim().toUpperCase()).filter(Boolean);
  return [...new Set(normalized)].slice(0, Math.max(0, limit));
}

export function normalizeDockWidth(value: unknown, fallback: number): number {
  const width = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(width) ? Math.max(200, Math.min(720, Math.round(width))) : fallback;
}
