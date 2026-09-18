# Parte 2 — Biblioteca de bloques por categorías: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biblioteca de bloques en IndexedDB con categorías de dos niveles y etiquetas, importación desde DXF (bloques con nombre o el espacio modelo entero) y desde `.fmodellib`, exportación a `.fmodellib` e interfaz nueva en el panel Bloques.

**Architecture:** Lógica pura en `blocks/` (categorías, archivo `.fmodellib`, candidatos de importación), persistencia en `blocks/libraryStore.ts` sobre `storage/idb.ts` (versión 2 de la base, una transacción por cambio), comandos `LIBRARYIMPORT`/`LIBRARYEXPORT` en `commands/library.ts` que construyen una *sesión de importación* y la entregan al diálogo `library-import`; `WBLOCK` usa el mismo diálogo. El panel muestra la biblioteca con árbol de categorías, rejilla, búsqueda y edición.

**Tech Stack:** TypeScript, React 19, IndexedDB (`fake-indexeddb` en pruebas), fflate, vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-bloques-biblioteca-dwg-design.md` (Parte 2)

## Global Constraints

- Categorías: máximo dos niveles; base inicial editable; «Sin clasificar» (`cat-sin-clasificar`) siempre existe y recibe los bloques de categorías borradas.
- La sugerencia de categoría solo propone; la persona confirma en el diálogo.
- `.fmodellib`: ZIP con `manifest.json` (`format: 'fmodel-library'`, `version: 1`) y `blocks/<id>.json`; versión posterior o formato ajeno → error ES/EN, nada se escribe.
- Migración única desde `localStorage['fmodel.cad.blocklibrary.v1']`; la clave se borra solo tras escribir con éxito.
- Guardado atómico: una transacción IndexedDB por importación.
- Capas: `blocks`/`storage` (3) no importan `render` (4) ni `ui`; las miniaturas se pasan como función desde `commands` (5).
- Textos de interfaz en ES/EN con `tr`/`L`; estilos con los tokens de `src/styles/tokens.css` (acento `--fm-accent`).
- `pnpm verify` debe pasar.

Entorno: `P=/Users/crismora/.cache/codex-runtimes/codex-primary-runtime/dependencies; export PATH="$P/node/bin:$P/bin/fallback:$PATH"`.

---

### Task 1: Categorías (puro)

**Files:** Create `src/blocks/libraryCategories.ts`, Test `src/blocks/libraryCategories.test.ts`

**Interfaces — Produces:**
- `interface LibraryCategory { id: string; name: string; parent?: string; order: number }`
- `UNCLASSIFIED = 'cat-sin-clasificar'`, `DEFAULT_CATEGORIES: LibraryCategory[]`
- `categoryPath(cats, id): string` · `suggestCategory(text: string, cats: LibraryCategory[]): string`
- `mergeCategories(existing, incoming): { categories: LibraryCategory[]; idMap: Map<string, string> }`
- `categoryTree(cats): { cat: LibraryCategory; children: LibraryCategory[] }[]` · `descendantIds(cats, id): Set<string>`

- [ ] **Step 1: Pruebas**

File: src/blocks/libraryCategories.test.ts
```ts
import { describe, expect, it } from 'vitest';
import { categoryPath, categoryTree, DEFAULT_CATEGORIES, descendantIds, mergeCategories, suggestCategory, UNCLASSIFIED } from './libraryCategories';

const cats = DEFAULT_CATEGORIES;

describe('categorías de la biblioteca', () => {
  it('base inicial de dos niveles con «Sin clasificar»', () => {
    expect(cats.some((c) => c.id === UNCLASSIFIED)).toBe(true);
    for (const c of cats) if (c.parent) expect(cats.find((p) => p.id === c.parent)?.parent).toBeUndefined();
    expect(categoryPath(cats, 'cat-arq-puertas')).toBe('Arquitectura › Puertas');
    expect(categoryTree(cats).find((n) => n.cat.id === 'cat-arq')?.children.map((c) => c.name)).toEqual(['Puertas', 'Ventanas', 'Escaleras']);
    expect(descendantIds(cats, 'cat-arq')).toEqual(new Set(['cat-arq', 'cat-arq-puertas', 'cat-arq-ventanas', 'cat-arq-escaleras']));
  });

  it('sugiere por palabras clave en español e inglés, sin acentos ni mayúsculas', () => {
    expect(suggestCategory('Puerta abatible 90', cats)).toBe('cat-arq-puertas');
    expect(suggestCategory('Double DOOR', cats)).toBe('cat-arq-puertas');
    expect(suggestCategory('Inodoro suspendido', cats)).toBe('cat-mob-bano');
    expect(suggestCategory('Toma doble', cats)).toBe('cat-ins-electricas');
    expect(suggestCategory('HEB 200', cats)).toBe('cat-est-perfiles');
    expect(suggestCategory('Árbol copa ancha', cats)).toBe('cat-urbanismo');
    expect(suggestCategory('Cajetín A3', cats)).toBe('cat-ano-cajetines');
    expect(suggestCategory('FM Panel ajustable', cats)).toBe(UNCLASSIFIED);
  });

  it('solo sugiere categorías que existen', () => {
    const few = cats.filter((c) => c.id !== 'cat-arq-puertas');
    expect(suggestCategory('Puerta', few)).toBe(UNCLASSIFIED);
  });

  it('fusiona por ruta de nombre y crea las que faltan', () => {
    const incoming = [
      { id: 'x1', name: 'arquitectura', order: 0 },
      { id: 'x2', name: 'Puertas', parent: 'x1', order: 0 },
      { id: 'x3', name: 'Mamparas', parent: 'x1', order: 1 },
    ];
    const { categories, idMap } = mergeCategories(cats, incoming);
    expect(idMap.get('x1')).toBe('cat-arq');
    expect(idMap.get('x2')).toBe('cat-arq-puertas');
    const created = categories.find((c) => c.id === idMap.get('x3'))!;
    expect(created).toMatchObject({ name: 'Mamparas', parent: 'cat-arq' });
    expect(categories.length).toBe(cats.length + 1);
  });
});
```

- [ ] **Step 2:** `pnpm vitest run src/blocks/libraryCategories.test.ts` → FAIL.

- [ ] **Step 3: Implementación**

File: src/blocks/libraryCategories.ts
```ts
import { newId } from '../document/ids';

/** Categoría de la biblioteca de bloques: dos niveles como máximo. */
export interface LibraryCategory {
  id: string;
  name: string;
  parent?: string;
  order: number;
}

export const UNCLASSIFIED = 'cat-sin-clasificar';

const C = (id: string, name: string, order: number, parent?: string): LibraryCategory => (parent ? { id, name, parent, order } : { id, name, order });

/** Base inicial (editable). Los IDs son estables para que la sugerencia por palabras clave funcione. */
export const DEFAULT_CATEGORIES: LibraryCategory[] = [
  C('cat-arq', 'Arquitectura', 0),
  C('cat-arq-puertas', 'Puertas', 0, 'cat-arq'),
  C('cat-arq-ventanas', 'Ventanas', 1, 'cat-arq'),
  C('cat-arq-escaleras', 'Escaleras', 2, 'cat-arq'),
  C('cat-mob', 'Mobiliario', 1),
  C('cat-mob-oficina', 'Oficina', 0, 'cat-mob'),
  C('cat-mob-cocina', 'Cocina', 1, 'cat-mob'),
  C('cat-mob-bano', 'Baño', 2, 'cat-mob'),
  C('cat-mob-dormitorio', 'Dormitorio', 3, 'cat-mob'),
  C('cat-est', 'Estructura', 2),
  C('cat-est-perfiles', 'Perfiles', 0, 'cat-est'),
  C('cat-est-anclajes', 'Anclajes', 1, 'cat-est'),
  C('cat-ins', 'Instalaciones', 3),
  C('cat-ins-electricas', 'Eléctricas', 0, 'cat-ins'),
  C('cat-ins-sanitarias', 'Sanitarias', 1, 'cat-ins'),
  C('cat-ins-clima', 'Climatización', 2, 'cat-ins'),
  C('cat-urbanismo', 'Urbanismo', 4),
  C('cat-vehiculos', 'Vehículos', 5),
  C('cat-personas', 'Personas', 6),
  C('cat-ano', 'Anotación', 7),
  C('cat-ano-cajetines', 'Cajetines', 0, 'cat-ano'),
  C('cat-ano-simbolos', 'Símbolos', 1, 'cat-ano'),
  C(UNCLASSIFIED, 'Sin clasificar', 99),
];

/** Palabras clave (sin acentos, en minúsculas) por categoría, en orden de prioridad. */
const KEYWORDS: [string, RegExp][] = [
  ['cat-ano-cajetines', /cajetin|title ?block|rotulo|membrete/],
  ['cat-arq-puertas', /puert|door|porton|\bgate\b/],
  ['cat-arq-ventanas', /ventan|window|vidrier/],
  ['cat-arq-escaleras', /escaler|stair|rampa|\bramp\b/],
  ['cat-mob-bano', /\bbano|bath|\bwc\b|inodoro|toilet|lavabo|lavamanos|ducha|shower|banera|\btina\b|urinal|bidet/],
  ['cat-mob-cocina', /cocin|kitchen|nevera|fridge|frigor|horno|\boven|fregadero|estufa|stove/],
  ['cat-mob-dormitorio', /\bcama|\bbed\b|dormitorio|bedroom|armario|wardrobe|closet|ropero/],
  ['cat-mob-oficina', /escritorio|\bdesk|silla|chair|oficina|office|archivador|sillon|\bmesa|\btable\b/],
  ['cat-est-perfiles', /perfil|profile|\b(ipe|hea|heb|upn|ipn)\b|\bviga|\bbeam|column|pilar/],
  ['cat-est-anclajes', /anclaj|anchor|placa base|base plate|perno|\bbolt|tornillo/],
  ['cat-ins-electricas', /enchuf|\btoma|socket|outlet|interruptor|switch|lumin|light|lampar|electr|cuadro electrico/],
  ['cat-ins-sanitarias', /tuber|\bpipe|desag|drain|valvul|valve|sanitar|plumb|fontaner/],
  ['cat-ins-clima', /clima|hvac|aire acond|\bsplit\b|difusor|diffuser|rejilla|grille|ventil|\bfan\b|conduct|\bduct/],
  ['cat-urbanismo', /arbol|\btree|arbust|shrub|farola|streetlight|\bbanco\b|bench|jardin|garden|bordillo|\bcurb/],
  ['cat-vehiculos', /coche|\bcar\b|\bauto\b|vehic|camion|truck|\bbus\b|\bmoto|bicicl|\bbike/],
  ['cat-personas', /persona|people|person|human|hombre|mujer|\bman\b|woman|nino|child/],
  ['cat-ano-simbolos', /simbolo|symbol|\bnorte\b|\bnorth\b|flecha|arrow|\bnivel\b|\blevel\b|marca de corte|section mark/],
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function suggestCategory(text: string, cats: LibraryCategory[]): string {
  const t = fold(text);
  const exists = new Set(cats.map((c) => c.id));
  for (const [id, re] of KEYWORDS) if (exists.has(id) && re.test(t)) return id;
  return UNCLASSIFIED;
}

export function categoryPath(cats: LibraryCategory[], id: string | undefined): string {
  const c = cats.find((x) => x.id === id);
  if (!c) return 'Sin clasificar';
  const p = c.parent ? cats.find((x) => x.id === c.parent) : undefined;
  return p ? `${p.name} › ${c.name}` : c.name;
}

const byOrder = (a: LibraryCategory, b: LibraryCategory) => a.order - b.order || a.name.localeCompare(b.name);

export function categoryTree(cats: LibraryCategory[]): { cat: LibraryCategory; children: LibraryCategory[] }[] {
  return cats
    .filter((c) => !c.parent)
    .sort(byOrder)
    .map((cat) => ({ cat, children: cats.filter((c) => c.parent === cat.id).sort(byOrder) }));
}

export function descendantIds(cats: LibraryCategory[], id: string): Set<string> {
  return new Set([id, ...cats.filter((c) => c.parent === id).map((c) => c.id)]);
}

/** Fusiona categorías entrantes con las existentes por ruta de nombre (sin distinguir mayúsculas). */
export function mergeCategories(existing: LibraryCategory[], incoming: LibraryCategory[]): { categories: LibraryCategory[]; idMap: Map<string, string> } {
  const categories = existing.map((c) => ({ ...c }));
  const idMap = new Map<string, string>();
  const key = (name: string, parent?: string) => `${parent ?? ''}|${fold(name)}`;
  const index = new Map(categories.map((c) => [key(c.name, c.parent), c.id]));
  const roots = incoming.filter((c) => !c.parent || !incoming.some((p) => p.id === c.parent));
  const children = incoming.filter((c) => !roots.includes(c));
  for (const c of [...roots, ...children]) {
    const parent = c.parent && roots.includes(c) ? undefined : c.parent ? idMap.get(c.parent) : undefined;
    const k = key(c.name, parent);
    let id = index.get(k);
    if (!id) {
      id = newId('cat');
      const order = categories.filter((x) => x.parent === parent).length;
      categories.push(parent ? { id, name: c.name, parent, order } : { id, name: c.name, order });
      index.set(k, id);
    }
    idMap.set(c.id, id);
  }
  return { categories, idMap };
}
```

- [ ] **Step 4:** prueba → PASS. **Step 5:** Commit `Categorías de la biblioteca de bloques con sugerencia por palabras clave`.

---

### Task 2: Almacenamiento en IndexedDB con migración

**Files:** Modify `src/storage/idb.ts`; Modify `src/blocks/library.ts`; Create `src/blocks/libraryStore.ts`; Test `src/blocks/libraryStore.test.ts`

**Interfaces — Produces:**
- `idb.ts`: `STORES` añade `'library'`, `'libraryCategories'`; `DB_VERSION = 2`; `idbWrite(stores: StoreName[], fn: (get: (s: StoreName) => IDBObjectStore) => void): Promise<void>` (una transacción).
- `library.ts`: `LibraryBlock` pasa a `{ id; name; categoryId: string; tags: string[]; description?: string; source?: { kind: LibrarySourceKind; file?: string; importedAt: number }; dynamic: boolean; savedAt: number; thumbnail?: string; package: BlockPackage }`, `type LibrarySourceKind = 'fmodel' | 'dxf' | 'dwg' | 'fmodellib'`; `makeLibraryBlock(pkg, meta): LibraryBlock`; `insertLibraryBlock(doc, item): string` (reutiliza la definición ya traída si no cambió). Se eliminan `loadLibrary/saveLibrary/removeFromLibrary/saveToLibrary/importLibraryBlock` de este archivo.
- `libraryStore.ts`: `loadLibrary(): Promise<LibraryBlock[]>`, `loadCategories(): Promise<LibraryCategory[]>`, `commitLibrary(c: { put?: LibraryBlock[]; remove?: string[]; categories?: LibraryCategory[]; removeCategories?: string[] }): Promise<void>`, `onLibraryChanged(fn): () => void`, `LEGACY_KEY`.
- `BlockRecord` (types.ts) añade `libraryItem?: string; librarySavedAt?: number`.

- [ ] **Step 1: Pruebas**

File: src/blocks/libraryStore.test.ts
```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import { installDynamicSamples } from './samples';
import { insertLibraryBlock, makeLibraryBlock, packageBlock } from './library';
import { UNCLASSIFIED } from './libraryCategories';
import { commitLibrary, LEGACY_KEY, loadCategories, loadLibrary, resetLibraryForTests } from './libraryStore';

const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

function samplePkg(name = 'FM Panel ajustable') {
  const doc = createDocument();
  installDynamicSamples(doc);
  return { doc, pkg: packageBlock(doc, doc.findByName('blocks', name)!.id) };
}

describe('almacén de la biblioteca', () => {
  beforeEach(async () => {
    mem.clear();
    await resetLibraryForTests();
  });

  it('siembra las categorías iniciales una sola vez', async () => {
    const a = await loadCategories();
    expect(a.length).toBeGreaterThan(10);
    await commitLibrary({ removeCategories: ['cat-vehiculos'] });
    expect((await loadCategories()).some((c) => c.id === 'cat-vehiculos')).toBe(false);
  });

  it('migra la biblioteca de localStorage y borra la clave antigua', async () => {
    const { pkg } = samplePkg('FM Símbolo eléctrico');
    mem.set(LEGACY_KEY, JSON.stringify([{ id: 'lib-1', name: 'Toma doble', category: 'Electricidad', savedAt: 5, package: pkg }]));
    const items = await loadLibrary();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'lib-1', name: 'Toma doble', categoryId: 'cat-ins-electricas', tags: ['Electricidad'], dynamic: true, savedAt: 5 });
    expect(mem.has(LEGACY_KEY)).toBe(false);
  });

  it('guarda, sustituye y borra en una transacción; borrar una categoría manda sus bloques a Sin clasificar', async () => {
    const { pkg } = samplePkg();
    const a = makeLibraryBlock(pkg, { name: 'Panel', categoryId: 'cat-est-perfiles', tags: ['acero'], source: { kind: 'fmodel', importedAt: 1 } });
    await commitLibrary({ put: [a] });
    expect((await loadLibrary()).map((b) => b.name)).toEqual(['Panel']);
    await commitLibrary({ removeCategories: ['cat-est-perfiles'] });
    expect((await loadLibrary())[0].categoryId).toBe(UNCLASSIFIED);
    await commitLibrary({ remove: [a.id] });
    expect(await loadLibrary()).toEqual([]);
  });

  it('insertar desde la biblioteca reutiliza la definición si no cambió', () => {
    const { pkg } = samplePkg();
    const item = makeLibraryBlock(pkg, { name: 'Panel', categoryId: UNCLASSIFIED, tags: [] });
    const doc = createDocument();
    const n1 = insertLibraryBlock(doc, item);
    const n2 = insertLibraryBlock(doc, item);
    expect(n1).toBe(n2);
    expect(doc.findByName('blocks', n1)?.dynamic).toBeTruthy();
    const n3 = insertLibraryBlock(doc, { ...item, savedAt: item.savedAt + 1 });
    expect(n3).not.toBe(n1);
  });
});
```

- [ ] **Step 2:** → FAIL.

- [ ] **Step 3: Implementación**
  1. `src/storage/idb.ts`: `DB_VERSION = 2`; `STORES = ['drawings', 'versions', 'recovery', 'meta', 'library', 'libraryCategories'] as const`; añadir:
     ```ts
     /** Varias escrituras en una sola transacción: o se guardan todas o ninguna. */
     export function idbWrite(stores: StoreName[], fn: (get: (s: StoreName) => IDBObjectStore) => void): Promise<void> {
       return openDb().then(
         (db) =>
           new Promise<void>((resolve, reject) => {
             const t = db.transaction(stores, 'readwrite');
             t.oncomplete = () => resolve();
             t.onerror = () => reject(t.error);
             t.onabort = () => reject(t.error ?? new Error('Transacción cancelada'));
             try {
               fn((s) => t.objectStore(s));
             } catch (err) {
               t.abort();
               reject(err);
             }
           }),
       );
     }
     /** Solo pruebas: cierra y olvida la conexión. */
     export function closeDbForTests() {
       dbPromise?.then((db) => db.close()).catch(() => undefined);
       dbPromise = null;
     }
     ```
  2. `src/document/types.ts` `BlockRecord`: tras `category?: string;` añadir `/** elemento de la biblioteca del que procede y su fecha de guardado */ libraryItem?: string; librarySavedAt?: number;`.
  3. `src/blocks/library.ts`: sustituir la interfaz `LibraryBlock`, borrar `KEY`, `loadLibrary`, `saveLibrary`, `removeFromLibrary`, `saveToLibrary`, `importLibraryBlock`; añadir:

File: src/blocks/library.ts (fragmento: nueva interfaz y funciones; conservar `BlockPackage`, `packageBlock`, `importBlockPackage`)
```ts
export type LibrarySourceKind = 'fmodel' | 'dxf' | 'dwg' | 'fmodellib';

export interface LibraryBlock {
  id: string;
  name: string;
  categoryId: string;
  tags: string[];
  description?: string;
  source?: { kind: LibrarySourceKind; file?: string; importedAt: number };
  /** tiene parámetros dinámicos (insignia y filtro) */
  dynamic: boolean;
  savedAt: number;
  thumbnail?: string;
  package: BlockPackage;
}

export function makeLibraryBlock(pkg: BlockPackage, meta: { name: string; categoryId: string; tags: string[]; description?: string; thumbnail?: string; source?: LibraryBlock['source']; id?: string }): LibraryBlock {
  const root = pkg.blocks.find((b) => b.id === pkg.root);
  return {
    id: meta.id ?? newId('lib'),
    name: meta.name,
    categoryId: meta.categoryId,
    tags: meta.tags,
    description: meta.description ?? root?.description ?? '',
    source: meta.source,
    dynamic: !!root?.dynamic,
    savedAt: Date.now(),
    thumbnail: meta.thumbnail,
    package: pkg,
  };
}

/**
 * Trae un bloque de la biblioteca al dibujo y devuelve el nombre con el que insertarlo. Si ya se
 * trajo esa misma versión, reutiliza la definición en vez de duplicarla.
 */
export function insertLibraryBlock(doc: CadDocument, item: LibraryBlock): string {
  const existing = [...doc.data.blocks.values()].find((b) => b.libraryItem === item.id && b.librarySavedAt === item.savedAt);
  if (existing) return existing.name;
  const pkg = { ...item.package, blocks: item.package.blocks.map((b) => (b.id === item.package.root ? { ...b, name: item.name } : b)) };
  const name = importBlockPackage(doc, pkg);
  const b = doc.findByName('blocks', name)!;
  doc.transact('BLOCK LIBRARY LINK', (tx) => tx.update('blocks', b.id, { libraryItem: item.id, librarySavedAt: item.savedAt }));
  return name;
}
```
  4. `src/blocks/libraryStore.ts`:

File: src/blocks/libraryStore.ts
```ts
import { closeDbForTests, idbAll, idbGet, idbWrite, openDb } from '../storage/idb';
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
  void closeDbForTests;
}
```
  5. Ajustar usos (quedan en tareas 4–5): `commands/blocks.ts` (WBLOCK) y `ui/panels/BlocksPanel.tsx` se reescriben allí; para que compile ya en esta tarea, WBLOCK pasa a:
     ```ts
     const pkg = packageBlock(api.editor.doc, b.id);
     const cats = await loadCategories();
     await commitLibrary({ put: [makeLibraryBlock(pkg, { name: b.name, categoryId: suggestCategory(`${b.name} ${b.description}`, cats), tags: [], thumbnail: blockThumbnail(api.editor, b.id, 64) ?? undefined, source: { kind: 'fmodel', importedAt: Date.now() } })] });
     ```
     y la pestaña Biblioteca del panel usa `loadLibrary()` asíncrono (`useEffect` + `onLibraryChanged`) e `insertLibraryBlock`.
- [ ] **Step 4:** `pnpm vitest run src/blocks src/storage` y `pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `La biblioteca de bloques pasa a IndexedDB con categorías y migración`.

---

### Task 3: Archivo `.fmodellib` y candidatos de importación (puro)

**Files:** Create `src/blocks/libraryArchive.ts`, `src/blocks/libraryImport.ts`; Test `src/blocks/libraryArchive.test.ts`, `src/blocks/libraryImport.test.ts`

**Interfaces — Produces:**
- `writeLibraryArchive(a: { categories: LibraryCategory[]; blocks: LibraryBlock[] }): Uint8Array`
- `readLibraryArchive(bytes: Uint8Array): { categories: LibraryCategory[]; blocks: LibraryBlock[] }` (lanza `Error` con mensaje «ES / EN»)
- `interface ImportCandidate { key: string; name: string; description: string; pkg: BlockPackage; dynamic: boolean; thumbnail?: string; categoryId: string; tags: string[]; selected: boolean; savedAt?: number }`
- `interface LibraryImportSession { mode: 'import' | 'save'; source: { kind: LibrarySourceKind; file?: string }; candidates: ImportCandidate[]; categories: LibraryCategory[]; report?: unknown }`
- `modelSpaceToBlock(doc: CadDocument, ctx: ModelContext, name: string): Id | null`
- `candidatesFromDocument(doc, ctx, cats, opts: { file: string; thumb?: (id: Id) => string | undefined }): ImportCandidate[]`
- `candidatesFromArchive(archive, cats): { candidates: ImportCandidate[]; categories: LibraryCategory[] }`
- `type Resolution = 'replace' | 'rename' | 'skip'`; `planLibraryWrite(session, existing: LibraryBlock[], resolution: (key: string) => Resolution): { put: LibraryBlock[]; remove: string[] }`

- [ ] **Step 1: Pruebas**

File: src/blocks/libraryArchive.test.ts
```ts
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import { importBlockPackage, makeLibraryBlock, packageBlock } from './library';
import { readLibraryArchive, writeLibraryArchive } from './libraryArchive';
import { DEFAULT_CATEGORIES } from './libraryCategories';
import { installDynamicSamples } from './samples';

describe('archivo .fmodellib', () => {
  it('ida y vuelta con un bloque dinámico', () => {
    const doc = createDocument();
    installDynamicSamples(doc);
    const pkg = packageBlock(doc, doc.findByName('blocks', 'FM Panel ajustable')!.id);
    const item = makeLibraryBlock(pkg, { name: 'Panel', categoryId: 'cat-est-perfiles', tags: ['acero'] });
    const back = readLibraryArchive(writeLibraryArchive({ categories: DEFAULT_CATEGORIES, blocks: [item] }));
    expect(back.categories).toEqual(DEFAULT_CATEGORIES);
    expect(back.blocks).toEqual([item]);
    const target = createDocument();
    const name = importBlockPackage(target, back.blocks[0].package);
    expect(target.findByName('blocks', name)?.dynamic?.parameters.length).toBe(pkg.blocks.find((b) => b.id === pkg.root)!.dynamic!.parameters.length);
  });

  it('rechaza archivos ajenos o de versión posterior', () => {
    expect(() => readLibraryArchive(new Uint8Array([1, 2, 3]))).toThrow(/biblioteca/);
    const future = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 9, categories: [], blocks: [] })) });
    expect(() => readLibraryArchive(future)).toThrow(/versión/);
    const missing = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 1, categories: [], blocks: [{ id: 'x', file: 'blocks/x.json' }] })) });
    expect(() => readLibraryArchive(missing)).toThrow(/blocks\/x\.json/);
  });
});
```

File: src/blocks/libraryImport.test.ts
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { createContext } from '../model/context';
import { decodeDxfBytes, importDxfIntoDocument } from '../io/dxf/importDxf';
import { installDynamicBlocks } from './install';
import { makeLibraryBlock, packageBlock } from './library';
import { DEFAULT_CATEGORIES } from './libraryCategories';
import type { LibraryImportSession } from './libraryImport';
import { candidatesFromArchive, candidatesFromDocument, modelSpaceToBlock, planLibraryWrite } from './libraryImport';
import { installDynamicSamples } from './samples';

describe('candidatos de importación a la biblioteca', () => {
  it('un DXF sin bloques ofrece el espacio modelo como bloque con base en la esquina inferior izquierda', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    doc.transact('seed', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 10, y: 20 }, end: { x: 30, y: 50 } });
    });
    const c = candidatesFromDocument(doc, ctx, DEFAULT_CATEGORIES, { file: 'silla-oficina.dxf' });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ key: '*model', name: 'silla-oficina', selected: true, categoryId: 'cat-mob-oficina' });
    const root = c[0].pkg.blocks.find((b) => b.id === c[0].pkg.root)!;
    expect(root.basePoint).toEqual({ x: 10, y: 20 });
    expect(doc.entitiesOf(MODEL_SPACE_ID)).toHaveLength(0);
  });

  it('un DXF con bloques los ofrece todos y el espacio modelo sin marcar', () => {
    const doc = createDocument();
    const ctx = createContext(doc);
    importDxfIntoDocument(doc, decodeDxfBytes(new Uint8Array(readFileSync(new URL('../io/dxf/fixtures/ezdxf-r2010.dxf', import.meta.url)))));
    const c = candidatesFromDocument(doc, ctx, DEFAULT_CATEGORIES, { file: 'x.dxf' });
    const named = c.filter((x) => x.key !== '*model');
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((x) => x.selected)).toBe(true);
    expect(c.find((x) => x.key === '*model')?.selected ?? false).toBe(false);
  });

  it('resuelve conflictos de nombre: sustituir, renombrar u omitir', () => {
    const doc = createDocument();
    installDynamicSamples(doc);
    const ctx = createContext(doc);
    installDynamicBlocks(ctx);
    const pkg = packageBlock(doc, doc.findByName('blocks', 'FM Panel ajustable')!.id);
    const existing = [makeLibraryBlock(pkg, { name: 'FM Panel ajustable', categoryId: 'cat-arq', tags: [] })];
    const cands = candidatesFromDocument(doc, ctx, DEFAULT_CATEGORIES, { file: 'a.dxf' }).filter((x) => x.name === 'FM Panel ajustable');
    const session: LibraryImportSession = { mode: 'import', source: { kind: 'dxf', file: 'a.dxf' }, candidates: cands, categories: DEFAULT_CATEGORIES };
    expect(planLibraryWrite(session, existing, () => 'replace')).toMatchObject({ remove: [existing[0].id] });
    expect(planLibraryWrite(session, existing, () => 'rename').put[0].name).toBe('FM Panel ajustable (2)');
    expect(planLibraryWrite(session, existing, () => 'skip').put).toEqual([]);
  });

  it('un archivo .fmodellib aporta sus categorías fusionadas', () => {
    const doc = createDocument();
    installDynamicSamples(doc);
    const pkg = packageBlock(doc, doc.findByName('blocks', 'FM Panel ajustable')!.id);
    const item = makeLibraryBlock(pkg, { name: 'Mampara', categoryId: 'x2', tags: ['vidrio'] });
    const { candidates, categories } = candidatesFromArchive({ categories: [{ id: 'x1', name: 'Arquitectura', order: 0 }, { id: 'x2', name: 'Mamparas', parent: 'x1', order: 0 }], blocks: [item] }, DEFAULT_CATEGORIES);
    const cat = categories.find((c) => c.id === candidates[0].categoryId)!;
    expect(cat).toMatchObject({ name: 'Mamparas', parent: 'cat-arq' });
    expect(candidates[0]).toMatchObject({ name: 'Mampara', tags: ['vidrio'], selected: true, dynamic: true });
  });
});
```

- [ ] **Step 2:** → FAIL.

- [ ] **Step 3: Implementación**

File: src/blocks/libraryArchive.ts
```ts
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { LibraryBlock } from './library';
import type { LibraryCategory } from './libraryCategories';

/** Biblioteca exportable (.fmodellib): ZIP con manifiesto y un JSON por bloque. */
export interface LibraryArchive {
  categories: LibraryCategory[];
  blocks: LibraryBlock[];
}

const FORMAT = 'fmodel-library';
const VERSION = 1;

interface Manifest {
  format: string;
  version: number;
  categories: LibraryCategory[];
  blocks: { id: string; name: string; file: string }[];
}

export function writeLibraryArchive(a: LibraryArchive): Uint8Array {
  const manifest: Manifest = { format: FORMAT, version: VERSION, categories: a.categories, blocks: a.blocks.map((b) => ({ id: b.id, name: b.name, file: `blocks/${b.id}.json` })) };
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 1)) };
  for (const b of a.blocks) files[`blocks/${b.id}.json`] = strToU8(JSON.stringify(b));
  return zipSync(files, { level: 6 });
}

export function readLibraryArchive(bytes: Uint8Array): LibraryArchive {
  let files: Record<string, Uint8Array>;
  let manifest: Manifest;
  try {
    files = unzipSync(bytes);
    manifest = JSON.parse(strFromU8(files['manifest.json'])) as Manifest;
  } catch {
    throw new Error('El archivo no es una biblioteca de FModel (.fmodellib). / Not an FModel library (.fmodellib).');
  }
  if (manifest?.format !== FORMAT) throw new Error('El archivo no es una biblioteca de FModel (.fmodellib). / Not an FModel library (.fmodellib).');
  if (manifest.version > VERSION) throw new Error(`Biblioteca de una versión posterior (${manifest.version}); actualiza FModel. / Library from a newer version; update FModel.`);
  const blocks = manifest.blocks.map((entry) => {
    const raw = files[entry.file];
    if (!raw) throw new Error(`Falta ${entry.file} en la biblioteca. / Missing ${entry.file} in the library.`);
    return JSON.parse(strFromU8(raw)) as LibraryBlock;
  });
  return { categories: manifest.categories ?? [], blocks };
}
```

File: src/blocks/libraryImport.ts
```ts
import type { BBox } from '../geometry/bbox';
import { emptyBox, expandBox, isEmptyBox } from '../geometry/bbox';
import type { CadDocument } from '../document/document';
import { newId } from '../document/ids';
import type { BlockRecord, Id } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { ModelContext } from '../model/context';
import { kindOf } from '../model/registry';
import { isInsertableBlock } from './blockOps';
import type { BlockPackage, LibraryBlock, LibrarySourceKind } from './library';
import { makeLibraryBlock, packageBlock } from './library';
import type { LibraryArchive } from './libraryArchive';
import type { LibraryCategory } from './libraryCategories';
import { mergeCategories, suggestCategory, UNCLASSIFIED } from './libraryCategories';

export interface ImportCandidate {
  key: string;
  name: string;
  description: string;
  pkg: BlockPackage;
  dynamic: boolean;
  thumbnail?: string;
  categoryId: string;
  tags: string[];
  selected: boolean;
  /** conserva la fecha original al importar desde .fmodellib */
  savedAt?: number;
}

/** Lo que el diálogo de la biblioteca necesita para guardar: candidatos y categorías (ya fusionadas). */
export interface LibraryImportSession {
  mode: 'import' | 'save';
  source: { kind: LibrarySourceKind; file?: string };
  candidates: ImportCandidate[];
  categories: LibraryCategory[];
  /** informe de conversión del DXF/DWG de origen */
  report?: unknown;
}

export type Resolution = 'replace' | 'rename' | 'skip';

/** Convierte el espacio modelo en un bloque con punto base en la esquina inferior izquierda de su extensión. */
export function modelSpaceToBlock(doc: CadDocument, ctx: ModelContext, name: string): Id | null {
  const ents = doc.entitiesOf(MODEL_SPACE_ID);
  if (!ents.length) return null;
  const box: BBox = emptyBox();
  for (const e of ents) {
    try {
      const b = kindOf(e).bbox(e, ctx);
      if (Number.isFinite(b.minX)) expandBox(box, b);
    } catch {
      /* entidad sin caja */
    }
  }
  const base = isEmptyBox(box) ? { x: 0, y: 0 } : { x: box.minX, y: box.minY };
  const id = newId('blk');
  let unique = name;
  for (let i = 2; doc.findByName('blocks', unique); i++) unique = `${name} (${i})`;
  doc.transact('MODEL AS BLOCK', (tx) => {
    const rec: BlockRecord = { id, name: unique, kind: 'normal', basePoint: base, description: '', units: doc.settings.insUnits, explodable: true, scaleUniformly: false, annotative: false, revision: 1 };
    tx.add('blocks', rec);
    for (const e of ents) tx.updateEntity(e.id, { owner: id });
  });
  return id;
}

const baseName = (file: string) => file.replace(/\.[^.]+$/, '').trim() || 'Dibujo';

/** Bloques con nombre del documento y, además, el espacio modelo entero como bloque. */
export function candidatesFromDocument(doc: CadDocument, ctx: ModelContext, cats: LibraryCategory[], opts: { file: string; thumb?: (id: Id) => string | undefined }): ImportCandidate[] {
  const named = [...doc.data.blocks.values()].filter((b) => isInsertableBlock(b) && !b.name.startsWith('*'));
  const out: ImportCandidate[] = named
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({
      key: b.id,
      name: b.name,
      description: b.description,
      pkg: packageBlock(doc, b.id),
      dynamic: !!b.dynamic,
      thumbnail: opts.thumb?.(b.id),
      categoryId: suggestCategory(`${b.name} ${b.description}`, cats),
      tags: [],
      selected: true,
    }));
  const name = baseName(opts.file);
  const modelId = modelSpaceToBlock(doc, ctx, name);
  if (modelId) {
    out.push({
      key: '*model',
      name,
      description: '',
      pkg: packageBlock(doc, modelId),
      dynamic: false,
      thumbnail: opts.thumb?.(modelId),
      categoryId: suggestCategory(name, cats),
      tags: [],
      selected: !out.length,
    });
  }
  return out;
}

export function candidatesFromArchive(archive: LibraryArchive, cats: LibraryCategory[]): { candidates: ImportCandidate[]; categories: LibraryCategory[] } {
  const { categories, idMap } = mergeCategories(cats, archive.categories);
  const candidates = archive.blocks.map((b) => ({
    key: b.id,
    name: b.name,
    description: b.description ?? '',
    pkg: b.package,
    dynamic: b.dynamic,
    thumbnail: b.thumbnail,
    categoryId: idMap.get(b.categoryId) ?? (categories.some((c) => c.id === b.categoryId) ? b.categoryId : UNCLASSIFIED),
    tags: b.tags ?? [],
    selected: true,
    savedAt: b.savedAt,
  }));
  return { candidates, categories };
}

const fold = (s: string) => s.trim().toLowerCase();

/** Bloques a escribir y a borrar según la elección de cada candidato con nombre repetido. */
export function planLibraryWrite(session: LibraryImportSession, existing: LibraryBlock[], resolution: (key: string) => Resolution): { put: LibraryBlock[]; remove: string[] } {
  const names = new Set(existing.map((b) => fold(b.name)));
  const put: LibraryBlock[] = [];
  const remove: string[] = [];
  for (const c of session.candidates) {
    if (!c.selected) continue;
    let name = c.name.trim() || 'Bloque';
    const clash = existing.find((b) => fold(b.name) === fold(name));
    if (clash || names.has(fold(name))) {
      const r = resolution(c.key);
      if (r === 'skip') continue;
      if (r === 'replace' && clash) remove.push(clash.id);
      else {
        let i = 2;
        while (names.has(fold(`${name} (${i})`))) i++;
        name = `${name} (${i})`;
      }
    }
    names.add(fold(name));
    const item = makeLibraryBlock(c.pkg, { name, categoryId: c.categoryId, tags: c.tags, description: c.description, thumbnail: c.thumbnail, source: { kind: session.source.kind, file: session.source.file, importedAt: Date.now() } });
    put.push(c.savedAt ? { ...item, savedAt: c.savedAt } : item);
  }
  return { put, remove };
}
```

- [ ] **Step 4:** `pnpm vitest run src/blocks` → PASS; `pnpm check:layers` → sin infracciones.
- [ ] **Step 5:** Commit `Archivo .fmodellib y candidatos de importación a la biblioteca`.

---

### Task 4: Comandos y diálogo de importación

**Files:** Create `src/commands/library.ts`, `src/ui/dialogs/LibraryImportDialog.tsx`; Modify `src/commands/index.ts`, `src/commands/blocks.ts` (quitar WBLOCK de ahí), `src/render/thumbnail.ts`, `src/ui/Dialogs.tsx`, `src/ui/ribbonConfig.ts`, `src/app/features.ts`, `src/styles/app.css`; Test `src/commands/library.test.ts`

**Interfaces:**
- Consumes: todo lo de las tareas 1–3.
- Produces: `thumbnail.ts` → `blockThumbnailOf(doc: CadDocument, ctx: ModelContext, blockId: Id, size?: number, dark?: boolean): string | null` (y `blockThumbnail(editor, …)` delega en ella); `library.ts` (comandos) → `buildImportSession(file: { name: string; bytes: Uint8Array }, cats: LibraryCategory[], thumb?: ThumbFn): Promise<LibraryImportSession>`, `LIBRARY_COMMANDS`; diálogo `'library-import'` con `payload: LibraryImportSession`.

- [ ] **Step 1: Prueba** (lógica sin UI de `buildImportSession`)

File: src/commands/library.test.ts
```ts
import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { DEFAULT_CATEGORIES } from '../blocks/libraryCategories';
import { writeLibraryArchive } from '../blocks/libraryArchive';
import { buildImportSession } from './library';

const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1024', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '5', '21', '5', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

describe('sesión de importación a la biblioteca', () => {
  it('desde DXF: espacio modelo como bloque e informe de conversión', async () => {
    const s = await buildImportSession({ name: 'Puerta 80.dxf', bytes: strToU8(dxf) }, DEFAULT_CATEGORIES);
    expect(s.source).toEqual({ kind: 'dxf', file: 'Puerta 80.dxf' });
    expect(s.candidates.map((c) => [c.name, c.categoryId, c.selected])).toEqual([['Puerta 80', 'cat-arq-puertas', true]]);
    expect(s.report).toBeTruthy();
  });

  it('desde .fmodellib vacío y rechazo de extensiones desconocidas', async () => {
    const s = await buildImportSession({ name: 'b.fmodellib', bytes: writeLibraryArchive({ categories: [], blocks: [] }) }, DEFAULT_CATEGORIES);
    expect(s.source.kind).toBe('fmodellib');
    expect(s.candidates).toEqual([]);
    await expect(buildImportSession({ name: 'x.txt', bytes: new Uint8Array() }, DEFAULT_CATEGORIES)).rejects.toThrow(/Formato no admitido/);
  });
});
```

- [ ] **Step 2:** → FAIL.

- [ ] **Step 3: Implementación**
  1. `render/thumbnail.ts`: extraer el cuerpo en `blockThumbnailOf(doc, ctx, blockId, size = 96, dark = false)` (usa `doc` y `ctx` donde hoy usa `editor.doc`/`editor.ctx`; la clave de caché incluye `doc.id`) y dejar `blockThumbnail = (editor, id, size, dark) => blockThumbnailOf(editor.doc, editor.ctx, id, size, dark)`.

File: src/commands/library.ts
```ts
import { requestUi } from '../app/services';
import { installDynamicBlocks } from '../blocks/install';
import { makeLibraryBlock, packageBlock } from '../blocks/library';
import { readLibraryArchive, writeLibraryArchive } from '../blocks/libraryArchive';
import type { LibraryCategory } from '../blocks/libraryCategories';
import { descendantIds, suggestCategory } from '../blocks/libraryCategories';
import type { LibraryImportSession } from '../blocks/libraryImport';
import { candidatesFromArchive, candidatesFromDocument } from '../blocks/libraryImport';
import { commitLibrary, loadCategories, loadLibrary } from '../blocks/libraryStore';
import { createDocument } from '../document/defaults';
import type { Id } from '../document/types';
import { decodeDxfBytes, importDxfIntoDocument } from '../io/dxf/importDxf';
import { createContext } from '../model/context';
import { blockThumbnailOf } from '../render/thumbnail';
import { openFile, saveFile } from '../storage/fileAccess';
import { L } from './helpers';
import type { CommandDef } from './types';
import { CommandError } from './types';

type ThumbFn = (doc: ReturnType<typeof createDocument>, ctx: ReturnType<typeof createContext>, id: Id) => string | undefined;
const defaultThumb: ThumbFn = (doc, ctx, id) => blockThumbnailOf(doc, ctx, id, 64) ?? undefined;

/** Lee un archivo (.dxf o .fmodellib) en un documento temporal y prepara los candidatos. No toca el dibujo abierto. */
export async function buildImportSession(file: { name: string; bytes: Uint8Array }, cats: LibraryCategory[], thumb: ThumbFn = defaultThumb): Promise<LibraryImportSession> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'fmodellib') {
    const { candidates, categories } = candidatesFromArchive(readLibraryArchive(file.bytes), cats);
    return { mode: 'import', source: { kind: 'fmodellib', file: file.name }, candidates, categories };
  }
  if (ext === 'dxf') {
    const doc = createDocument({ title: file.name });
    const ctx = createContext(doc);
    installDynamicBlocks(ctx);
    const report = importDxfIntoDocument(doc, decodeDxfBytes(file.bytes));
    const candidates = candidatesFromDocument(doc, ctx, cats, { file: file.name, thumb: (id) => thumb(doc, ctx, id) });
    return { mode: 'import', source: { kind: 'dxf', file: file.name }, candidates, categories: cats, report };
  }
  throw new Error(`Formato no admitido: .${ext ?? '?'} (usa .dxf o .fmodellib). / Unsupported format.`);
}

const LIBRARYIMPORT: CommandDef = {
  name: 'LIBRARYIMPORT',
  aliases: ['BIBLIOTECAIMPORTAR', 'LIBIMPORT'],
  category: 'block',
  readOnly: true,
  label: L('Importar a la biblioteca', 'Import to library'),
  description: L('Añade a la biblioteca los bloques de un DXF (o el dibujo entero como bloque) o de un archivo .fmodellib, con categoría y etiquetas.', 'Adds the blocks of a DXF (or the whole drawing as a block) or of a .fmodellib file to the library, with category and tags.'),
  icon: 'insert',
  async run(api) {
    const f = await openFile({ 'application/octet-stream': ['.dxf', '.fmodellib'] }, 'DXF / FModel library');
    if (!f) return;
    const session = await buildImportSession(f, await loadCategories());
    if (!session.candidates.length) throw new CommandError(L('El archivo no contiene bloques ni geometría que guardar.', 'The file has no blocks or geometry to save.'));
    requestUi('library-import', session);
  },
};

const LIBRARYEXPORT: CommandDef = {
  name: 'LIBRARYEXPORT',
  aliases: ['BIBLIOTECAEXPORTAR', 'LIBEXPORT'],
  category: 'block',
  readOnly: true,
  label: L('Exportar biblioteca', 'Export library'),
  description: L('Guarda la biblioteca (o una categoría) en un archivo .fmodellib para compartirla.', 'Saves the library (or one category) to a .fmodellib file for sharing.'),
  icon: 'export',
  async run(api, args) {
    const cats = await loadCategories();
    let blocks = await loadLibrary();
    const catId = args?.[0];
    if (catId) {
      const ids = descendantIds(cats, catId);
      blocks = blocks.filter((b) => ids.has(b.categoryId));
    }
    if (!blocks.length) throw new CommandError(L('No hay bloques que exportar.', 'There are no blocks to export.'));
    const bytes = writeLibraryArchive({ categories: cats, blocks });
    const cat = cats.find((c) => c.id === catId);
    const name = `${cat ? cat.name : 'biblioteca'}.fmodellib`;
    const handle = await saveFile(new Blob([bytes], { type: 'application/zip' }), name, { 'application/zip': ['.fmodellib'] }, 'FModel library');
    api.info(L(`${blocks.length} bloque(s) exportado(s)${handle ? ` → ${handle.name}` : ''}.`, `${blocks.length} block(s) exported${handle ? ` → ${handle.name}` : ''}.`));
  },
};

const WBLOCK: CommandDef = {
  name: 'WBLOCK',
  aliases: ['W', 'BLOQUEDISCO'],
  category: 'block',
  readOnly: true,
  label: L('Enviar bloque a biblioteca', 'Write block to library'),
  description: L('Guarda un bloque (con dependencias) en la biblioteca con categoría y etiquetas.', 'Saves a block (with dependencies) to the library with category and tags.'),
  async run(api, args) {
    let name = args?.[0];
    if (!name) {
      const r = await api.getString({ prompt: L('Nombre del bloque', 'Block name'), allowSpaces: true });
      if (r.kind !== 'string') return;
      name = r.value;
    }
    const b = api.editor.doc.findByName('blocks', name);
    if (!b) throw new CommandError(L(`No existe el bloque «${name}».`, `Block "${name}" not found.`));
    const cats = await loadCategories();
    const candidate = { key: b.id, name: b.name, description: b.description, pkg: packageBlock(api.editor.doc, b.id), dynamic: !!b.dynamic, thumbnail: blockThumbnailOf(api.editor.doc, api.editor.ctx, b.id, 64) ?? undefined, categoryId: suggestCategory(`${b.name} ${b.description}`, cats), tags: [], selected: true };
    if (typeof window === 'undefined') {
      await commitLibrary({ put: [makeLibraryBlock(candidate.pkg, { ...candidate, source: { kind: 'fmodel', importedAt: Date.now() } })] });
      api.info(L(`«${b.name}» guardado en la biblioteca.`, `"${b.name}" saved to the library.`));
      return;
    }
    requestUi('library-import', { mode: 'save', source: { kind: 'fmodel' }, candidates: [candidate], categories: cats } satisfies LibraryImportSession);
  },
};

export const LIBRARY_COMMANDS: CommandDef[] = [LIBRARYIMPORT, LIBRARYEXPORT, WBLOCK];
```
  2. `commands/blocks.ts`: borrar `WBLOCK`, su entrada en `BLOCK_COMMANDS` y los imports ya sin uso (`saveToLibrary`, `blockThumbnail` si no se usa). `commands/index.ts`: `import { LIBRARY_COMMANDS } from './library';` y `registerCommands(LIBRARY_COMMANDS);` tras `BLOCK_COMMANDS`.
  3. `ui/dialogs/LibraryImportDialog.tsx`:

File: src/ui/dialogs/LibraryImportDialog.tsx
```tsx
import { useEffect, useMemo, useState } from 'react';
import type { LibraryBlock } from '../../blocks/library';
import { categoryTree } from '../../blocks/libraryCategories';
import type { ImportCandidate, LibraryImportSession, Resolution } from '../../blocks/libraryImport';
import { planLibraryWrite } from '../../blocks/libraryImport';
import { commitLibrary, loadLibrary } from '../../blocks/libraryStore';
import type { Editor } from '../../editor/editor';
import { Dialog } from '../Dialogs';
import { tr } from '../controls';

/** Revisión antes de guardar en la biblioteca: qué bloques, con qué nombre, categoría y etiquetas. */
export function LibraryImportDialog({ editor, session, onClose, onUi }: { editor: Editor; session: LibraryImportSession | undefined; onClose: () => void; onUi: (ui: string, cmd?: string, payload?: unknown) => void }) {
  const lang = editor.lang;
  const [items, setItems] = useState<ImportCandidate[]>(() => session?.candidates.map((c) => ({ ...c, tags: [...c.tags] })) ?? []);
  const [existing, setExisting] = useState<LibraryBlock[]>([]);
  const [resolution, setResolution] = useState<Record<string, Resolution>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => void loadLibrary().then(setExisting), []);
  const tree = useMemo(() => categoryTree(session?.categories ?? []), [session]);
  if (!session) return null;
  const clashes = new Set(items.filter((c) => existing.some((b) => b.name.trim().toLowerCase() === c.name.trim().toLowerCase())).map((c) => c.key));
  const selected = items.filter((c) => c.selected);
  const patch = (key: string, p: Partial<ImportCandidate>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const plan = planLibraryWrite({ ...session, candidates: items }, existing, (k) => resolution[k] ?? 'rename');
      await commitLibrary({ ...plan, categories: session.categories });
      editor.runner.message('info', { es: `${plan.put.length} bloque(s) guardado(s) en la biblioteca.`, en: `${plan.put.length} block(s) saved to the library.` });
      onClose();
      onUi('panel:blocks');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const title = session.mode === 'save' ? tr(lang, 'Guardar en la biblioteca', 'Save to library') : tr(lang, `Importar a la biblioteca · ${session.source.file ?? ''}`, `Import to library · ${session.source.file ?? ''}`);
  return (
    <Dialog
      wide
      lang={lang}
      title={title}
      onClose={onClose}
      footer={
        <>
          {session.report ? (
            <button className="btn" onClick={() => onUi('conversion-report', undefined, { kind: 'import', name: session.source.file ?? '', report: session.report })}>
              {tr(lang, 'Informe de conversión', 'Conversion report')}
            </button>
          ) : null}
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)' }}>{tr(lang, `${selected.length} de ${items.length} seleccionados`, `${selected.length} of ${items.length} selected`)}</span>
          {error && <span style={{ color: 'var(--fm-danger)', fontSize: 12 }}>{error}</span>}
          <button className="btn" onClick={onClose}>{tr(lang, 'Cancelar', 'Cancel')}</button>
          <button className="btn btn--primary" disabled={busy || !selected.length} onClick={save}>
            {tr(lang, `Guardar ${selected.length}`, `Save ${selected.length}`)}
          </button>
        </>
      }
    >
      {items.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className="btn btn--sm" onClick={() => setItems((xs) => xs.map((x) => ({ ...x, selected: true })))}>{tr(lang, 'Todos', 'All')}</button>
          <button className="btn btn--sm" onClick={() => setItems((xs) => xs.map((x) => ({ ...x, selected: false })))}>{tr(lang, 'Ninguno', 'None')}</button>
        </div>
      )}
      <div className="libimp">
        {items.map((c) => (
          <div key={c.key} className={`libimp__row${c.selected ? ' is-on' : ''}`}>
            <label className="libimp__pick">
              <input type="checkbox" checked={c.selected} onChange={(e) => patch(c.key, { selected: e.target.checked })} aria-label={tr(lang, `Incluir ${c.name}`, `Include ${c.name}`)} />
              <span className="libimp__thumb">{c.thumbnail ? <img src={c.thumbnail} width={56} height={56} alt="" /> : null}</span>
            </label>
            <div className="libimp__fields">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="input" value={c.name} onChange={(e) => patch(c.key, { name: e.target.value })} aria-label={tr(lang, 'Nombre', 'Name')} />
                {c.dynamic && <span className="libbadge">{tr(lang, 'Dinámico', 'Dynamic')}</span>}
                {c.key === '*model' && <span className="libbadge libbadge--muted">{tr(lang, 'Dibujo entero', 'Whole drawing')}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select className="select" value={c.categoryId} onChange={(e) => patch(c.key, { categoryId: e.target.value })} aria-label={tr(lang, 'Categoría', 'Category')}>
                  {tree.map((n) => (
                    <optgroup key={n.cat.id} label={n.cat.name}>
                      <option value={n.cat.id}>{n.cat.name}</option>
                      {n.children.map((ch) => (
                        <option key={ch.id} value={ch.id}>{`${n.cat.name} › ${ch.name}`}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder={tr(lang, 'Etiquetas, separadas por comas', 'Tags, comma separated')} value={c.tags.join(', ')} onChange={(e) => patch(c.key, { tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
              </div>
              {clashes.has(c.key) && c.selected && (
                <div className="libimp__clash">
                  {tr(lang, 'Ya hay un bloque con este nombre:', 'A block with this name exists:')}
                  <select className="select" value={resolution[c.key] ?? 'rename'} onChange={(e) => setResolution((r) => ({ ...r, [c.key]: e.target.value as Resolution }))}>
                    <option value="rename">{tr(lang, 'Guardar con otro nombre', 'Keep both (rename)')}</option>
                    <option value="replace">{tr(lang, 'Sustituir', 'Replace')}</option>
                    <option value="skip">{tr(lang, 'Omitir', 'Skip')}</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
```
  4. `ui/Dialogs.tsx`: importar el diálogo y registrar `'library-import': (e, close, onUi, st) => <LibraryImportDialog editor={e} session={st.payload as LibraryImportSession | undefined} onClose={close} onUi={onUi} />`. Si el tipo de `onUi` de `DialogRenderer` no admite `payload`, ampliarlo a `(ui: string, cmd?: string, payload?: unknown) => void` en `Dialogs.tsx` y en `App.tsx` (su `openUi` ya acepta `payload`).
  5. `styles/app.css` (al final):
     ```css
     /* biblioteca de bloques */
     .libimp { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow: auto; }
     .libimp__row { display: flex; gap: 10px; padding: 8px; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); opacity: 0.62; }
     .libimp__row.is-on { opacity: 1; border-color: var(--fm-accent-line); box-shadow: inset 0 0 0 1px var(--fm-accent-soft); }
     .libimp__pick { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; }
     .libimp__thumb { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 10px; background: var(--surface-sunken); }
     .libimp__fields { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
     .libimp__clash { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--fs-signal-attention); flex-wrap: wrap; }
     .libbadge { font: 600 10px/1 var(--fs-font-data); letter-spacing: 0.05em; text-transform: uppercase; padding: 4px 7px; border-radius: var(--radius-pill); background: var(--fm-accent-soft); color: var(--fm-accent); white-space: nowrap; }
     .libbadge--muted { background: var(--surface-sunken); color: var(--ink-muted); }
     ```
  6. `ui/ribbonConfig.ts`: en el grupo «Bloque», tras `WBLOCK`, añadir `t('LIBRARYIMPORT', 'insert', 'Importar a biblioteca', 'Import to library')`.
  7. `app/features.ts`: nueva fila en «Bloques» tras la de definiciones: `F('Bloques', 'Blocks', 'Biblioteca por categorías con etiquetas, importación desde DXF (bloques o dibujo entero) y bibliotecas compartibles .fmodellib', 'Categorized library with tags, import from DXF (blocks or whole drawing) and shareable .fmodellib libraries', 'available', ['LIBRARYIMPORT', 'LIBRARYEXPORT', 'WBLOCK'])`; y en la fila de definiciones cambiar «biblioteca compartida local» por «envío a la biblioteca» y quitar `WBLOCK` de sus comandos. `pnpm docs:features`.
- [ ] **Step 4:** `pnpm vitest run src/commands/library.test.ts`, `pnpm typecheck`, `pnpm check:layers` → PASS.
- [ ] **Step 5:** Commit `Importación a la biblioteca desde DXF y .fmodellib, exportación y WBLOCK con categoría`.

---

### Task 5: Pestaña Biblioteca del panel Bloques

**Files:** Create `src/ui/panels/LibraryView.tsx`; Modify `src/ui/panels/BlocksPanel.tsx`, `src/styles/app.css`

**Interfaces — Consumes:** `loadLibrary`, `loadCategories`, `commitLibrary`, `onLibraryChanged`, `insertLibraryBlock`, `categoryTree`, `categoryPath`, `descendantIds`, `UNCLASSIFIED`.

- [ ] **Step 1: Implementación**

File: src/ui/panels/LibraryView.tsx
```tsx
import { Download, FolderPlus, Pencil, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LibraryBlock } from '../../blocks/library';
import { insertLibraryBlock } from '../../blocks/library';
import type { LibraryCategory } from '../../blocks/libraryCategories';
import { categoryPath, categoryTree, descendantIds, UNCLASSIFIED } from '../../blocks/libraryCategories';
import { commitLibrary, loadCategories, loadLibrary, onLibraryChanged } from '../../blocks/libraryStore';
import { newId } from '../../document/ids';
import type { Editor } from '../../editor/editor';
import { useMediaQuery } from '../hooks';
import { tr } from '../controls';

const ALL = '*all';

/** Biblioteca de bloques: árbol de categorías, búsqueda, rejilla con miniaturas y edición. */
export function LibraryView({ editor, query }: { editor: Editor; query: string }) {
  const lang = editor.lang;
  const narrow = useMediaQuery('(max-width: 720px)');
  const [items, setItems] = useState<LibraryBlock[]>([]);
  const [cats, setCats] = useState<LibraryCategory[]>([]);
  const [current, setCurrent] = useState(ALL);
  const [onlyDynamic, setOnlyDynamic] = useState(false);
  const [editing, setEditing] = useState<LibraryBlock | null>(null);
  const [manage, setManage] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    Promise.all([loadLibrary(), loadCategories()])
      .then(([b, c]) => (setItems(b), setCats(c), setError('')))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  useEffect(() => (refresh(), onLibraryChanged(refresh)), [refresh]);

  const tree = useMemo(() => categoryTree(cats), [cats]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of items) {
      m.set(b.categoryId, (m.get(b.categoryId) ?? 0) + 1);
      const parent = cats.find((c) => c.id === b.categoryId)?.parent;
      if (parent) m.set(parent, (m.get(parent) ?? 0) + 1);
    }
    return m;
  }, [items, cats]);
  const inCat = current === ALL ? null : descendantIds(cats, current);
  const q = query.trim().toLowerCase();
  const shown = items.filter((b) => (!inCat || inCat.has(b.categoryId)) && (!onlyDynamic || b.dynamic) && (!q || `${b.name} ${b.tags.join(' ')} ${b.description ?? ''}`.toLowerCase().includes(q)));

  const insert = (b: LibraryBlock) => {
    try {
      const name = insertLibraryBlock(editor.doc, b);
      editor.command('INSERT', [name]);
    } catch (err) {
      editor.runner.message('error', { es: String(err instanceof Error ? err.message : err), en: String(err instanceof Error ? err.message : err) });
    }
  };

  const catLabel = (c: LibraryCategory, child: boolean) => `${child ? '  ' : ''}${c.name} (${counts.get(c.id) ?? 0})`;

  return (
    <div className={`libview${narrow ? ' libview--narrow' : ''}`}>
      <div className="libview__bar">
        <button className="btn btn--sm" onClick={() => editor.command('LIBRARYIMPORT')} title={tr(lang, 'Importar DXF o .fmodellib', 'Import DXF or .fmodellib')}>
          <Upload size={13} /> {tr(lang, 'Importar', 'Import')}
        </button>
        <button className="btn btn--sm" onClick={() => editor.command('LIBRARYEXPORT', current === ALL ? [] : [current])} disabled={!shown.length} title={tr(lang, 'Exportar a .fmodellib', 'Export to .fmodellib')}>
          <Download size={13} /> {current === ALL ? tr(lang, 'Exportar', 'Export') : tr(lang, 'Exportar categoría', 'Export category')}
        </button>
        <button className={`btn btn--sm${manage ? ' btn--accent' : ''}`} onClick={() => setManage((m) => !m)}>
          <FolderPlus size={13} /> {tr(lang, 'Categorías', 'Categories')}
        </button>
        <label className="libview__toggle">
          <input type="checkbox" checked={onlyDynamic} onChange={(e) => setOnlyDynamic(e.target.checked)} /> {tr(lang, 'Solo dinámicos', 'Dynamic only')}
        </label>
      </div>
      {error && <div className="empty" style={{ color: 'var(--fm-danger)' }}>{error}</div>}
      {manage && <CategoryManager lang={lang} cats={cats} onDone={() => setManage(false)} />}
      <div className="libview__body">
        {narrow ? (
          <select className="select" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label={tr(lang, 'Categoría', 'Category')}>
            <option value={ALL}>{tr(lang, `Todos (${items.length})`, `All (${items.length})`)}</option>
            {tree.flatMap((n) => [
              <option key={n.cat.id} value={n.cat.id}>{catLabel(n.cat, false)}</option>,
              ...n.children.map((c) => <option key={c.id} value={c.id}>{catLabel(c, true)}</option>),
            ])}
          </select>
        ) : (
          <nav className="libtree" aria-label={tr(lang, 'Categorías', 'Categories')}>
            <button className={`libtree__item${current === ALL ? ' is-active' : ''}`} onClick={() => setCurrent(ALL)}>
              <span>{tr(lang, 'Todos', 'All')}</span>
              <span className="libtree__count">{items.length}</span>
            </button>
            {tree.map((n) => (
              <div key={n.cat.id}>
                <button className={`libtree__item${current === n.cat.id ? ' is-active' : ''}`} onClick={() => setCurrent(n.cat.id)}>
                  <span>{n.cat.name}</span>
                  <span className="libtree__count">{counts.get(n.cat.id) ?? 0}</span>
                </button>
                {n.children.map((c) => (
                  <button key={c.id} className={`libtree__item libtree__item--child${current === c.id ? ' is-active' : ''}`} onClick={() => setCurrent(c.id)}>
                    <span>{c.name}</span>
                    <span className="libtree__count">{counts.get(c.id) ?? 0}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
        <div className="libgrid">
          {shown.map((b) => (
            <div key={b.id} className="libcard" title={`${b.name}\n${categoryPath(cats, b.categoryId)}${b.tags.length ? `\n#${b.tags.join(' #')}` : ''}`}>
              <button className="libcard__thumb" onClick={() => insert(b)} aria-label={tr(lang, `Insertar ${b.name}`, `Insert ${b.name}`)}>
                {b.thumbnail ? <img src={b.thumbnail} width={64} height={64} alt="" draggable={false} /> : null}
                {b.dynamic && <span className="libbadge libcard__badge">◆</span>}
              </button>
              <div className="libcard__name">{b.name}</div>
              <div className="libcard__meta">
                <span>{categoryPath(cats, b.categoryId)}</span>
                <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setEditing(b)} title={tr(lang, 'Editar', 'Edit')}>
                  <Pencil size={12} />
                </button>
                <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => void commitLibrary({ remove: [b.id] })} title={tr(lang, 'Quitar de la biblioteca', 'Remove from library')}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {!shown.length && (
            <div className="empty">
              {items.length
                ? tr(lang, 'Ningún bloque coincide con el filtro.', 'No block matches the filter.')
                : tr(lang, 'La biblioteca está vacía. Importa un DXF o un .fmodellib, o envía un bloque del dibujo con WBLOCK.', 'The library is empty. Import a DXF or .fmodellib, or send a drawing block with WBLOCK.')}
            </div>
          )}
        </div>
      </div>
      {editing && <BlockEditor lang={lang} item={editing} tree={tree} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BlockEditor({ lang, item, tree, onClose }: { lang: 'es' | 'en'; item: LibraryBlock; tree: ReturnType<typeof categoryTree>; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [tags, setTags] = useState(item.tags.join(', '));
  const save = async () => {
    await commitLibrary({ put: [{ ...item, name: name.trim() || item.name, categoryId, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }] });
    onClose();
  };
  return (
    <div className="libedit" role="group" aria-label={tr(lang, 'Editar bloque de la biblioteca', 'Edit library block')}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Nombre', 'Name')} />
      <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={tr(lang, 'Categoría', 'Category')}>
        {tree.flatMap((n) => [<option key={n.cat.id} value={n.cat.id}>{n.cat.name}</option>, ...n.children.map((c) => <option key={c.id} value={c.id}>{`${n.cat.name} › ${c.name}`}</option>)])}
      </select>
      <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={tr(lang, 'Etiquetas, separadas por comas', 'Tags, comma separated')} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn--sm" onClick={onClose}>{tr(lang, 'Cancelar', 'Cancel')}</button>
        <button className="btn btn--sm btn--primary" onClick={() => void save()}>{tr(lang, 'Guardar', 'Save')}</button>
      </div>
    </div>
  );
}

function CategoryManager({ lang, cats, onDone }: { lang: 'es' | 'en'; cats: LibraryCategory[]; onDone: () => void }) {
  const tree = categoryTree(cats);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const order = cats.filter((c) => (c.parent ?? '') === parent).length;
    await commitLibrary({ categories: [parent ? { id: newId('cat'), name: n, parent, order } : { id: newId('cat'), name: n, order }] });
    setName('');
  };
  const rename = (c: LibraryCategory) => {
    const n = window.prompt(tr(lang, 'Nuevo nombre', 'New name'), c.name)?.trim();
    if (n) void commitLibrary({ categories: [{ ...c, name: n }] });
  };
  const remove = (c: LibraryCategory) => {
    if (window.confirm(tr(lang, `¿Borrar «${c.name}»? Sus bloques pasan a «Sin clasificar».`, `Delete "${c.name}"? Its blocks move to "Unclassified".`))) void commitLibrary({ removeCategories: [c.id] });
  };
  return (
    <div className="libedit">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 120 }} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && void add())} placeholder={tr(lang, 'Nueva categoría', 'New category')} />
        <select className="select" value={parent} onChange={(e) => setParent(e.target.value)} aria-label={tr(lang, 'Dentro de', 'Inside')}>
          <option value="">{tr(lang, '(nivel principal)', '(top level)')}</option>
          {tree.map((n) => <option key={n.cat.id} value={n.cat.id}>{n.cat.name}</option>)}
        </select>
        <button className="btn btn--sm btn--primary" onClick={() => void add()}>{tr(lang, 'Añadir', 'Add')}</button>
        <button className="btn btn--sm" onClick={onDone}>{tr(lang, 'Listo', 'Done')}</button>
      </div>
      <div className="list" style={{ maxHeight: 180, overflow: 'auto' }}>
        {tree.flatMap((n) => [n.cat, ...n.children]).map((c) => (
          <div key={c.id} className="list-row" style={{ paddingLeft: c.parent ? 20 : 8 }}>
            <span style={{ flex: 1 }}>{c.name}</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => rename(c)} title={tr(lang, 'Renombrar', 'Rename')}><Pencil size={12} /></button>
            {c.id !== UNCLASSIFIED && <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => remove(c)} title={tr(lang, 'Borrar', 'Delete')}><Trash2 size={12} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
```
  2. `BlocksPanel.tsx`: quitar imports y estado de la biblioteca antigua (`loadLibrary`, `removeFromLibrary`, `importLibraryBlock`, `lib`), sustituir la rama `: (<div className="list">…)` de la pestaña biblioteca por `<LibraryView editor={editor} query={q} />`, y en cada tarjeta del dibujo añadir un botón «Enviar a biblioteca» (`editor.command('WBLOCK', [b.name])`, icono `BookmarkPlus` de lucide) junto a los existentes.
  3. `app.css` (tras lo de la tarea 4):
     ```css
     .libview { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
     .libview__bar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
     .libview__bar .btn { gap: 5px; }
     .libview__toggle { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; color: var(--ink-secondary); margin-left: auto; }
     .libview__body { display: grid; grid-template-columns: minmax(120px, 34%) 1fr; gap: 8px; min-height: 0; }
     .libview--narrow .libview__body { grid-template-columns: 1fr; }
     .libtree { display: flex; flex-direction: column; gap: 1px; overflow: auto; max-height: 60vh; }
     .libtree__item { display: flex; justify-content: space-between; gap: 6px; width: 100%; padding: 5px 8px; border-radius: 8px; font: 500 12px/1.2 var(--fs-font-ui); color: var(--ink-strong); text-align: left; }
     .libtree__item:hover { background: var(--surface-hover); }
     .libtree__item--child { padding-left: 20px; font-weight: 400; color: var(--ink-secondary); }
     .libtree__item.is-active { background: var(--fm-accent-soft); color: var(--fm-accent); box-shadow: inset 0 0 0 1px var(--fm-accent-line); }
     .libtree__count { font: 500 10.5px/1.2 var(--fs-font-data); color: var(--ink-muted); }
     .libgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; align-content: start; overflow: auto; max-height: 60vh; }
     .libcard { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 12px; border: 1px solid var(--line-soft); background: var(--surface); }
     .libcard__thumb { position: relative; display: grid; place-items: center; height: 76px; border-radius: 9px; background: var(--surface-sunken); }
     .libcard__thumb:hover { box-shadow: inset 0 0 0 1px var(--fm-accent-line); }
     .libcard__badge { position: absolute; top: 4px; right: 4px; padding: 3px 5px; }
     .libcard__name { font: 600 11.5px/1.2 var(--fs-font-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
     .libcard__meta { display: flex; align-items: center; gap: 2px; font-size: 10.5px; color: var(--ink-muted); }
     .libcard__meta > span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
     .libedit { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 12px; border: 1px solid var(--fm-accent-line); background: var(--surface); }
     ```
- [ ] **Step 2:** `pnpm typecheck`, `pnpm lint` → sin errores nuevos.
- [ ] **Step 3: Verificación en el navegador:** arrancar el servidor de desarrollo (preview), abrir el panel Bloques › Biblioteca; comprobar: árbol con categorías iniciales, «Ejemplos dinámicos» → enviar «FM Panel ajustable» con el botón de biblioteca → diálogo con categoría sugerida → Guardar → aparece con insignia ◆ y contador; clic en la tarjeta → inicia INSERT; editar categoría; crear y borrar categoría; vista en 375 px (selector en lugar de árbol); modo noche. Sin errores en consola. Capturas.
- [ ] **Step 4:** Commit `Pestaña Biblioteca con categorías, búsqueda y edición`.

---

### Task 6: Verificación completa y documentación

- [ ] **Step 1:** `docs/arquitectura.md` («Salida y formatos» o nueva sección «Biblioteca de bloques»): IndexedDB (`library`, `libraryCategories`), migración, `.fmodellib`, flujo sesión → diálogo.
- [ ] **Step 2:** `pnpm verify` → PASS.
- [ ] **Step 3:** Commit `Documenta la biblioteca de bloques`.
