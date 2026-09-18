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

  it('rechaza un ZIP con demasiadas entradas antes de extraerlo', () => {
    const files = Object.fromEntries(Array.from({ length: 1_001 }, (_, i) => [`blocks/${i}.json`, strToU8('{}')]));
    files['manifest.json'] = strToU8('{}');

    expect(() => readLibraryArchive(zipSync(files))).toThrow(/demasiado grande|too large/i);
  });

  it('rechaza manifiestos con índices de bloques inválidos', () => {
    const invalid = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 1, categories: [], blocks: null })) });

    expect(() => readLibraryArchive(invalid)).toThrow(/biblioteca/i);
  });

  it('rechaza bloques sin paquete válido', () => {
    const invalid = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 1, categories: [], blocks: [{ id: 'b1', file: 'blocks/b1.json' }] })),
      'blocks/b1.json': strToU8('{}'),
    });

    expect(() => readLibraryArchive(invalid)).toThrow(/bloque inválido|invalid block/i);
  });
});
