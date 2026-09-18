import { describe, expect, it } from 'vitest';
import { TEMPLATES_CATALOG } from '../../templates';
import type { StoredDrawing } from '../../storage/persistence';
import type { LibraryBlock } from '../../blocks/library';
import { foldText, matchesQuery, searchWelcome } from './welcomeSearch';

const drawing = (name: string): StoredDrawing => ({ id: name, name, savedAt: 0, bytes: new Uint8Array(), size: 0 });
const block = (name: string, tags: string[] = []): LibraryBlock =>
  ({ id: name, name, categoryId: 'c', tags, dynamic: false, savedAt: 0 }) as unknown as LibraryBlock;

describe('búsqueda global de la pantalla de inicio', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(foldText('  Lámina ISO ')).toBe('lamina iso');
    expect(matchesQuery('lamina', ['Lámina ISO A3'])).toBe(true);
    expect(matchesQuery('LÁMINA', ['lamina iso a3'])).toBe(true);
  });

  it('exige todas las palabras, en cualquier campo', () => {
    expect(matchesQuery('a3 horizontal', ['Lámina ISO A3 Horizontal'])).toBe(true);
    expect(matchesQuery('a3 vertical', ['Lámina ISO A3 Horizontal'])).toBe(false);
    expect(matchesQuery('puerta simple', ['Puerta', undefined, 'simple'])).toBe(true);
  });

  it('una consulta vacía coincide con todo', () => {
    expect(matchesQuery('   ', ['x'])).toBe(true);
  });

  it('agrupa resultados de dibujos, plantillas y bloques', () => {
    const res = searchWelcome('a3', 'es', {
      drawings: [drawing('Planta A3 cliente'), drawing('Detalle')],
      templates: TEMPLATES_CATALOG,
      blocks: [block('Cajetín A3', ['lámina']), block('Silla')],
    });
    expect(res.drawings.map((d) => d.name)).toEqual(['Planta A3 cliente']);
    expect(res.templates.map((t) => t.id)).toContain('sheet-a3');
    expect(res.blocks.map((b) => b.name)).toEqual(['Cajetín A3']);
    expect(res.total).toBe(res.drawings.length + res.templates.length + res.blocks.length);
  });

  it('busca plantillas en el idioma activo', () => {
    const sources = { drawings: [], templates: TEMPLATES_CATALOG, blocks: [] };
    expect(searchWelcome('vivienda', 'es', sources).templates.map((t) => t.id)).toContain('residential-house');
    expect(searchWelcome('single family house', 'en', sources).templates.map((t) => t.id)).toContain('residential-house');
  });

  it('encuentra bloques por etiqueta', () => {
    const res = searchWelcome('mobiliario', 'es', { drawings: [], templates: [], blocks: [block('Mesa', ['Mobiliario'])] });
    expect(res.blocks).toHaveLength(1);
  });
});
