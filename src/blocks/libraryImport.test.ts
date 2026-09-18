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
import { candidatesFromArchive, candidatesFromDocument, planLibraryWrite } from './libraryImport';
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
