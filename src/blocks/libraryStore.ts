import { idbAll, idbGet, idbWrite, openDb } from '../storage/idb';
import type { LibraryBlock } from './library';
import { validateLibraryBlock, validateLibraryCategories } from './libraryArchive';
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

let ready: Promise<void> | null = null;

/** Siembra las categorías, migra la biblioteca antigua e incorpora la colección incluida. */
function ensureReady(): Promise<void> {
  ready ??= (async () => {
    if (!(await idbGet('meta', READY))) {
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
    }
    // En las pruebas de núcleo no hay fetch ni recurso público. En navegador la colección
    // se instala una vez y queda disponible sin una acción adicional del usuario.
    if (typeof window === 'undefined' || await idbGet('meta', CC0_READY)) return;
    const response = await fetch(`${import.meta.env.BASE_URL}library/fmodel-cc0.fmodellib`);
    if (!response.ok) throw new Error('No se pudo cargar la biblioteca incluida de FModel. / Could not load the included FModel library.');
    const [{ prepareCc0Library }, bytes, existing, categories] = await Promise.all([
      import('./cc0Library'),
      response.arrayBuffer(),
      idbAll<LibraryBlock>('library'),
      idbAll<LibraryCategory>('libraryCategories'),
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
  return (await idbAll<LibraryBlock>('library')).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCategories(): Promise<LibraryCategory[]> {
  await ensureReady();
  return idbAll<LibraryCategory>('libraryCategories');
}

/** Aplica todos los cambios en una transacción. Borrar una categoría pasa sus bloques (y los de sus hijas) a «Sin clasificar». */
export async function commitLibrary(c: { put?: LibraryBlock[]; remove?: string[]; categories?: LibraryCategory[]; removeCategories?: string[] }): Promise<void> {
  await ensureReady();
  const existingCats = await idbAll<LibraryCategory>('libraryCategories');
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
    moved = (await idbAll<LibraryBlock>('library')).filter((b) => removedCats.has(b.categoryId) && !putIds.has(b.id)).map((b) => ({ ...b, categoryId: UNCLASSIFIED }));
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
