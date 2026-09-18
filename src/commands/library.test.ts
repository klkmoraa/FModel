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
