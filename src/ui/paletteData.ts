export type PaletteItem =
  | { kind: 'block'; name: string; scale?: number; rotation?: number }
  | { kind: 'hatch'; pattern: string; scale: number; angle: number }
  | { kind: 'command'; cmd: string; args?: string[]; label: { es: string; en: string }; icon: string }
  | { kind: 'preset'; name: string; layer?: string; color?: string; linetype?: string; lineweight?: number }
  | { kind: 'dimstyle'; style: string; cmd: string };

export interface StoredPalette {
  id: string;
  name: { es: string; en: string };
  custom: true;
  items: PaletteItem[];
}

const MAX_PALETTES = 20;
const MAX_ITEMS_PER_PALETTE = 500;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
}

function optionalText(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPaletteItem(value: unknown): value is PaletteItem {
  if (!record(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'block':
      return text(value.name) && (value.scale === undefined || finite(value.scale)) &&
        (value.rotation === undefined || finite(value.rotation));
    case 'hatch':
      return text(value.pattern) && finite(value.scale) && value.scale > 0 && finite(value.angle);
    case 'command':
      return text(value.cmd) && optionalText(value.icon) && record(value.label) &&
        typeof value.label.es === 'string' && typeof value.label.en === 'string' &&
        (value.args === undefined || (Array.isArray(value.args) && value.args.length <= 50 && value.args.every((arg) => typeof arg === 'string')));
    case 'preset':
      return text(value.name) && optionalText(value.layer) && optionalText(value.color) && optionalText(value.linetype) &&
        (value.lineweight === undefined || finite(value.lineweight));
    case 'dimstyle':
      return text(value.style) && text(value.cmd);
    default:
      return false;
  }
}

export function parseStoredPalettes(raw: string | null): StoredPalette[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const palettes: StoredPalette[] = [];
  for (const candidate of value.slice(0, MAX_PALETTES)) {
    if (!record(candidate) || !text(candidate.id) || seen.has(candidate.id) || candidate.custom !== true ||
      !record(candidate.name) || typeof candidate.name.es !== 'string' || typeof candidate.name.en !== 'string' ||
      !Array.isArray(candidate.items) || candidate.items.length > MAX_ITEMS_PER_PALETTE || !candidate.items.every(isPaletteItem)) continue;
    seen.add(candidate.id);
    palettes.push({
      id: candidate.id,
      name: { es: candidate.name.es, en: candidate.name.en },
      custom: true,
      items: candidate.items,
    });
  }
  return palettes;
}

