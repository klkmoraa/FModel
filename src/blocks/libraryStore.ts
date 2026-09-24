import { idbAll, idbGet, idbWrite, openDb } from '../storage/idb';
import { INPUT_LIMITS } from '../io/limits';
import type { LibraryBlock } from './library';
import { isLibraryBlock, validateLibraryBlock, validateLibraryCategories } from './libraryArchive';
import type { LibraryCategory } from './libraryCategories';
import { DEFAULT_CATEGORIES, suggestCategory, UNCLASSIFIED } from './libraryCategories';

/** Clave de la biblioteca antigua (localStorage, formato v1). */
export const LEGACY_KEY = 'fmodel.cad.blocklibrary.v1';
const READY = 'library-ready-v2';
const CC0_READY = 'library-cc0-ready-v1';

interface LegacyBlock {
  id: string;
  name: string;
  category?: string;
  savedAt: number;
  thumbnail?: string;
  package: LibraryBlock['package'];
}

function parseLegacyBlocks(raw: string | null | undefined): LegacyBlock[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const blocks: LegacyBlock[] = [];
  for (const value of parsed.slice(0, INPUT_LIMITS.maxBlocks)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const block = value as Record<string, unknown>;
    if (
      typeof block.id !== 'string' ||
      typeof block.name !== 'string' ||
      typeof block.savedAt !== 'number' ||
      !Number.isFinite(block.savedAt) ||
      block.savedAt < 0 ||
      (block.category !== undefined && typeof block.category !== 'string') ||
      (block.thumbnail !== undefined && typeof block.thumbnail !== 'string') ||
      !block.package ||
      typeof block.package !== 'object' ||
      Array.isArray(block.package)
    ) continue;
    blocks.push(block as unknown as LegacyBlock);
  }
  return blocks;
}

let ready: Promise<void> | null = null;

async function readStoredLibrary(): Promise<LibraryBlock[]> {
  return (await idbAll<unknown>('library')).filter(isLibraryBlock);
}

async function readStoredCategories(): Promise<LibraryCategory[]> {
  const values = await idbAll<unknown>('libraryCategories');
  const candidates: LibraryCategory[] = [];
  const ids = new Set<string>();
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const category = value as Record<string, unknown>;
    if (
      typeof category.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(category.id) || ids.has(category.id) ||
      typeof category.name !== 'string' || !category.name.trim() ||
      typeof category.order !== 'number' || !Number.isFinite(category.order) ||
      (category.parent !== undefined && (typeof category.parent !== 'string' || !category.parent.trim()))
    ) continue;
    ids.add(category.id);
    candidates.push(category as unknown as LibraryCategory);
  }
  let pruned = candidates.filter((category) => category.parent !== category.id && (!category.parent || ids.has(category.parent)));
  while (true) {
    const safeIds = new Set(pruned.map((category) => category.id));
    const next = pruned.filter((category) => !category.parent || safeIds.has(category.parent));
    if (next.length === pruned.length) break;
    pruned = next;
  }
  const byId = new Map(pruned.map((category) => [category.id, category]));
  const shallow = pruned.filter((category) => !category.parent || !byId.get(category.parent)?.parent);
  try {
    validateLibraryCategories(shallow);
    return shallow;
  } catch {
    return [];
  }
}

/** Siembra las categorías, migra la biblioteca antigua e incorpora la colección incluida. */
function ensureReady(): Promise<void> {
  ready ??= (async () => {
    if (!(await idbGet('meta', READY))) {
      let legacy: LegacyBlock[];
      try {
        legacy = parseLegacyBlocks(globalThis.localStorage?.getItem(LEGACY_KEY));
      } catch {
        legacy = [];
      }
      const items: LibraryBlock[] = [];
      for (const b of legacy) {
        try {
          const candidate: LibraryBlock = { id: b.id, name: b.name, categoryId: UNCLASSIFIED, tags: b.category ? [b.category] : [], description: '', dynamic: false, savedAt: b.savedAt, thumbnail: b.thumbnail, package: b.package, source: { kind: 'fmodel', importedAt: b.savedAt } };
          validateLibraryBlock(candidate);
          const root = candidate.package.blocks.find((block) => block.id === candidate.package.root);
          candidate.categoryId = suggestCategory(`${candidate.name} ${b.category ?? ''} ${root?.description ?? ''}`, DEFAULT_CATEGORIES);
          candidate.description = root?.description ?? '';
          candidate.dynamic = !!root?.dynamic;
          items.push(candidate);
        } catch {
          // No migres miniaturas remotas ni paquetes heredados que ya no sean válidos.
        }
      }
      await idbWrite(['libraryCategories', 'library', 'meta'], (s) => {
        for (const c of DEFAULT_CATEGORIES) s('libraryCategories').put(c);
        for (const it of items) s('library').put(it);
        s('meta').put({ id: READY, at: Date.now() });
      });
      try {
        globalThis.localStorage?.removeItem(LEGACY_KEY);
      } catch {
        // IndexedDB ya contiene el resultado; el bloqueo de localStorage no debe impedir abrirlo.
      }
    }
    // En las pruebas de núcleo no hay fetch ni recurso público. En navegador la colección
    // se instala una vez y queda disponible sin una acción adicional del usuario.
    if (typeof window === 'undefined' || await idbGet('meta', CC0_READY)) return;
    const response = await fetch(`${import.meta.env.BASE_URL}library/fmodel-cc0.fmodellib`);
    if (!response.ok) throw new Error('No se pudo cargar la biblioteca incluida de FModel. / Could not load the included FModel library.');
    const [{ prepareCc0Library }, bytes, existing, categories] = await Promise.all([
      import('./cc0Library'),
      response.arrayBuffer(),
      readStoredLibrary(),
      readStoredCategories(),
    ]);
    const { put, categories: missing } = prepareCc0Library(new Uint8Array(bytes), existing, categories);
    await idbWrite(['library', 'libraryCategories', 'meta'], (s) => {
      for (const category of missing) s('libraryCategories').put(category);
      for (const block of put) s('library').put(block);
      s('meta').put({ id: CC0_READY, at: Date.now() });
    });
  })();
  ready.catch(() => (ready = null));
  return ready;
}

export async function loadLibrary(): Promise<LibraryBlock[]> {
  await ensureReady();
  return (await readStoredLibrary()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCategories(): Promise<LibraryCategory[]> {
  await ensureReady();
  return readStoredCategories();
}

/** Aplica todos los cambios en una transacción. Borrar una categoría pasa sus bloques (y los de sus hijas) a «Sin clasificar». */
export async function commitLibrary(c: { put?: LibraryBlock[]; remove?: string[]; categories?: LibraryCategory[]; removeCategories?: string[] }): Promise<void> {
  await ensureReady();
  const existingCats = await readStoredCategories();
  const combined = new Map<string, LibraryCategory>(existingCats.map((cat) => [cat.id, cat]));
  if (c.categories?.length) {
    for (const cat of c.categories) combined.set(cat.id, cat);
    validateLibraryCategories([...combined.values()]);
  }
  if (c.put?.length) {
    for (const b of c.put) {
      validateLibraryBlock(b);
    }
  }
  let moved: LibraryBlock[] = [];
  let removedCats = new Set<string>();
  if (c.removeCategories?.length) {
    removedCats = new Set(c.removeCategories.filter((id) => id !== UNCLASSIFIED));
    for (const cat of existingCats) if (cat.parent && removedCats.has(cat.parent)) removedCats.add(cat.id);
    const putIds = new Set((c.put ?? []).map((b) => b.id));
    moved = (await readStoredLibrary()).filter((b) => removedCats.has(b.categoryId) && !putIds.has(b.id)).map((b) => ({ ...b, categoryId: UNCLASSIFIED }));
  }
  await idbWrite(['library', 'libraryCategories'], (s) => {
    for (const cat of c.categories ?? []) s('libraryCategories').put(cat);
    for (const id of removedCats) s('libraryCategories').delete(id);
    for (const b of [...moved, ...(c.put ?? []).map((b) => (removedCats.has(b.categoryId) || !combined.has(b.categoryId) ? { ...b, categoryId: UNCLASSIFIED } : b))]) s('library').put(b);
    for (const id of c.remove ?? []) s('library').delete(id);
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fmodel:library'));
}

export function onLibraryChanged(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('fmodel:library', fn);
  return () => window.removeEventListener('fmodel:library', fn);
}

/** Solo pruebas: vacía la base y reinicia el estado de la migración. */
export async function resetLibraryForTests(): Promise<void> {
  await openDb();
  await idbWrite(['library', 'libraryCategories', 'meta'], (s) => {
    s('library').clear();
    s('libraryCategories').clear();
    s('meta').delete(READY);
    s('meta').delete(CC0_READY);
  });
  ready = null;
}
