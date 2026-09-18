import type { TemplateDefinition } from '../../templates';
import type { StoredDrawing } from '../../storage/persistence';
import type { LibraryBlock } from '../../blocks/library';

/** Minúsculas y sin diacríticos: «Lámina» ≡ «lamina». */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Todas las palabras de la consulta deben aparecer en alguno de los campos. */
export function matchesQuery(query: string, fields: Array<string | undefined>): boolean {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = foldText(fields.filter(Boolean).join(' '));
  return terms.every((t) => haystack.includes(t));
}

export interface WelcomeSearchSources {
  drawings: StoredDrawing[];
  templates: TemplateDefinition[];
  blocks: LibraryBlock[];
}

export interface WelcomeSearchResults {
  drawings: StoredDrawing[];
  templates: TemplateDefinition[];
  blocks: LibraryBlock[];
  total: number;
}

export function searchWelcome(query: string, lang: 'es' | 'en', sources: WelcomeSearchSources): WelcomeSearchResults {
  const drawings = sources.drawings.filter((d) => matchesQuery(query, [d.name]));
  const templates = sources.templates.filter((t) =>
    matchesQuery(query, [t.name[lang], t.description[lang], t.badge[lang], t.format]),
  );
  const blocks = sources.blocks.filter((b) => matchesQuery(query, [b.name, b.description, ...b.tags]));
  return { drawings, templates, blocks, total: drawings.length + templates.length + blocks.length };
}
