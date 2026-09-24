import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CC0_LIBRARY_COUNT, prepareCc0Library } from './cc0Library';
import { DEFAULT_CATEGORIES } from './libraryCategories';

const bytes = new Uint8Array(readFileSync(new URL('../../public/library/fmodel-cc0.fmodellib', import.meta.url)));

describe('colección ampliada CC0', () => {
  it('contiene bloques nativos con geometría y unidades en pulgadas', () => {
    const { put, categories } = prepareCc0Library(bytes, [], DEFAULT_CATEGORIES);
    expect(put).toHaveLength(CC0_LIBRARY_COUNT);
    expect(categories).toEqual([]);
    expect(new Set(put.map((block) => block.name.toLowerCase())).size).toBe(CC0_LIBRARY_COUNT);
    expect(put.every((block) => block.package.entities.length > 0 && block.tags.includes('CC0') && block.thumbnail?.startsWith('data:image/svg+xml;base64,'))).toBe(true);
    expect(put.find((block) => block.name === 'PID-VALVE-GATE')?.categoryId).toBe('cat-ins');
    expect(put.find((block) => block.name === 'COFFEE-TABLE-48X24')?.categoryId).toBe('cat-mob-salon');
    expect(put.find((block) => block.name === 'DOOR-SWING-30')?.categoryId).toBe('cat-arq-puertas');
  }, 15_000);

  it('reinstalar no duplica bloques ni sustituye un bloque personalizado con el mismo nombre', () => {
    const first = prepareCc0Library(bytes, [], DEFAULT_CATEGORIES).put;
    expect(prepareCc0Library(bytes, first, DEFAULT_CATEGORIES).put).toEqual([]);
    const customized = { ...first[0], id: 'custom', source: { kind: 'fmodel' as const, importedAt: 1 } };
    const withCollision = prepareCc0Library(bytes, [customized], DEFAULT_CATEGORIES).put;
    expect(withCollision).toHaveLength(CC0_LIBRARY_COUNT - 1);
    const renamed = { ...first[0], name: 'Mi bloque' };
    expect(prepareCc0Library(bytes, [renamed], DEFAULT_CATEGORIES).put).toHaveLength(CC0_LIBRARY_COUNT - 1);
  }, 15000);

  it('rechaza un paquete dañado sin preparar cambios', () => {
    expect(() => prepareCc0Library(new Uint8Array([1, 2, 3]), [], DEFAULT_CATEGORIES)).toThrow();
  });
});
