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
