import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import { installDynamicSamples } from './samples';
import { insertLibraryBlock, makeLibraryBlock, packageBlock } from './library';
import { readLibraryArchive } from './libraryArchive';
import { DEFAULT_CATEGORIES, UNCLASSIFIED } from './libraryCategories';
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

  it('la instalación es atómica: un archivo con varios bloques donde el último es inválido no modifica la base de datos persistida', async () => {
    const { pkg } = samplePkg();
    const initial = makeLibraryBlock(pkg, { name: 'Bloque inicial', categoryId: 'cat-arq', tags: ['base'] });
    await commitLibrary({ put: [initial] });
    const before = await loadLibrary();
    expect(before).toHaveLength(1);
    expect(before[0].name).toBe('Bloque inicial');

    const validNew = makeLibraryBlock(pkg, { name: 'Bloque nuevo', categoryId: 'cat-arq', tags: ['nuevo'] });
    const invalidNew = structuredClone(validNew);
    invalidNew.id = 'lib-bad';
    invalidNew.package.entities[0].layer = 'layer-fantasma';

    const badArchiveBytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: DEFAULT_CATEGORIES,
        blocks: [
          { id: validNew.id, name: validNew.name, file: `blocks/${validNew.id}.json` },
          { id: invalidNew.id, name: invalidNew.name, file: `blocks/${invalidNew.id}.json` },
        ],
      })),
      [`blocks/${validNew.id}.json`]: strToU8(JSON.stringify(validNew)),
      [`blocks/${invalidNew.id}.json`]: strToU8(JSON.stringify(invalidNew)),
    });

    // 1. La lectura del archivo (.fmodellib) falla atómicamente antes de preparar o escribir nada
    expect(() => readLibraryArchive(badArchiveBytes)).toThrow(/capa inexistente|missing layer/i);

    // 2. Intentar llamar commitLibrary directamente con un lote que incluye un bloque inválido falla sin escribir nada
    await expect(commitLibrary({ put: [validNew, invalidNew] })).rejects.toThrow(/capa inexistente|missing layer/i);

    // 3. La base de datos persistida permanece intacta sin modificaciones parciales
    const after = await loadLibrary();
    expect(after).toEqual(before);
  });

  it('asigna bloques con categoría desconocida a Sin clasificar sin fallar la persistencia', async () => {
    const { pkg } = samplePkg();
    const blockWithUnknownCat = makeLibraryBlock(pkg, {
      name: 'Bloque con categoría huérfana',
      categoryId: 'cat-inexistente-pero-valida',
      tags: ['test'],
    });
    await commitLibrary({ put: [blockWithUnknownCat] });
    const items = await loadLibrary();
    const stored = items.find((b) => b.name === 'Bloque con categoría huérfana');
    expect(stored).toBeDefined();
    expect(stored?.categoryId).toBe(UNCLASSIFIED);
  });
});
