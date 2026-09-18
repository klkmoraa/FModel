import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeDxfBytes } from '../io/dxf/importDxf';
import { DEFAULT_CATEGORIES } from './libraryCategories';
import type { StarterManifest } from './starterLibrary';
import { missingStarterCategories, starterBlock } from './starterLibrary';

const dir = new URL('../../public/library/librecad/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as StarterManifest;

describe('biblioteca inicial (LibreCAD)', () => {
  it('el manifiesto tiene 100 bloques con categorías existentes y nombres únicos', () => {
    expect(manifest.items).toHaveLength(100);
    expect(new Set(manifest.items.map((i) => i.name)).size).toBe(100);
    const ids = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    expect(manifest.items.every((i) => ids.has(i.category))).toBe(true);
  });

  it('cada DXF se convierte en un bloque con geometría, sus unidades y, si toca, estirable', () => {
    for (const item of manifest.items) {
      const text = decodeDxfBytes(new Uint8Array(readFileSync(new URL(item.file, dir))));
      const b = starterBlock(text, item);
      const root = b.package.blocks.find((x) => x.id === b.package.root)!;
      expect(b.package.entities.filter((e) => e.owner === root.id).length, item.file).toBeGreaterThan(0);
      expect(root.units, item.file).toBe(item.units);
      expect(b.dynamic, item.file).toBe(item.stretchable);
      if (item.stretchable) expect(root.dynamic!.parameters.map((p) => p.name)).toEqual(['Ancho', 'Fondo']);
    }
  }, 60_000);

  it('añade las categorías que falten en bibliotecas antiguas', () => {
    const old = DEFAULT_CATEGORIES.filter((c) => c.id !== 'cat-mob-salon');
    expect(missingStarterCategories(old, manifest.items).map((c) => c.id)).toEqual(['cat-mob-salon']);
  });
});
