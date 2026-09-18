import { idbAll, idbGet, idbWrite, openDb } from '../storage/idb';
import type { LibraryBlock } from './library';
import type { LibraryCategory } from './libraryCategories';
import { DEFAULT_CATEGORIES, suggestCategory, UNCLASSIFIED } from './libraryCategories';

/** Clave de la biblioteca antigua (localStorage, formato v1). */
export const LEGACY_KEY = 'fmodel.cad.blocklibrary.v1';
const READY = 'library-ready-v2';

interface LegacyBlock {
  id: string;
  name: string;
  category?: string;
  savedAt: number;
  thumbnail?: string;
  package: LibraryBlock['package'];
}

let ready: Promise<void> | null = null;

/** Siembra las categorías y migra la biblioteca antigua una sola vez. */
function ensureReady(): Promise<void> {
  ready ??= (async () => {
    if (await idbGet('meta', READY)) return;
    let legacy: LegacyBlock[] = [];
    try {
      legacy = JSON.parse(globalThis.localStorage?.getItem(LEGACY_KEY) ?? '[]') as LegacyBlock[];
    } catch {
      legacy = [];
    }
    const items: LibraryBlock[] = legacy.map((b) => {
      const root = b.package.blocks.find((x) => x.id === b.package.root);
      const categoryId = suggestCategory(`${b.name} ${b.category ?? ''} ${root?.description ?? ''}`, DEFAULT_CATEGORIES);
      return { id: b.id, name: b.name, categoryId, tags: b.category ? [b.category] : [], description: root?.description ?? '', dynamic: !!root?.dynamic, savedAt: b.savedAt, thumbnail: b.thumbnail, package: b.package, source: { kind: 'fmodel', importedAt: b.savedAt } };
    });
    await idbWrite(['libraryCategories', 'library', 'meta'], (s) => {
      for (const c of DEFAULT_CATEGORIES) s('libraryCategories').put(c);
      for (const it of items) s('library').put(it);
      s('meta').put({ id: READY, at: Date.now() });
    });
    globalThis.localStorage?.removeItem(LEGACY_KEY);
  })();
  ready.catch(() => (ready = null));
  return ready;
}

export async function loadLibrary(): Promise<LibraryBlock[]> {
  await ensureReady();
  return (await idbAll<LibraryBlock>('library')).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCategories(): Promise<LibraryCategory[]> {
  await ensureReady();
  return idbAll<LibraryCategory>('libraryCategories');
}

/** Aplica todos los cambios en una transacción. Borrar una categoría pasa sus bloques (y los de sus hijas) a «Sin clasificar». */
export async function commitLibrary(c: { put?: LibraryBlock[]; remove?: string[]; categories?: LibraryCategory[]; removeCategories?: string[] }): Promise<void> {
  await ensureReady();
  let moved: LibraryBlock[] = [];
  let removedCats = new Set<string>();
  if (c.removeCategories?.length) {
    const cats = await idbAll<LibraryCategory>('libraryCategories');
    removedCats = new Set(c.removeCategories.filter((id) => id !== UNCLASSIFIED));
    for (const cat of cats) if (cat.parent && removedCats.has(cat.parent)) removedCats.add(cat.id);
    const putIds = new Set((c.put ?? []).map((b) => b.id));
    moved = (await idbAll<LibraryBlock>('library')).filter((b) => removedCats.has(b.categoryId) && !putIds.has(b.id)).map((b) => ({ ...b, categoryId: UNCLASSIFIED }));
  }
  await idbWrite(['library', 'libraryCategories'], (s) => {
    for (const cat of c.categories ?? []) s('libraryCategories').put(cat);
    for (const id of removedCats) s('libraryCategories').delete(id);
    for (const b of [...moved, ...(c.put ?? []).map((b) => (removedCats.has(b.categoryId) ? { ...b, categoryId: UNCLASSIFIED } : b))]) s('library').put(b);
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
  });
  ready = null;
}
