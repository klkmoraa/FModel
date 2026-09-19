import { newId } from '../document/ids';
import { readLibraryArchive } from './libraryArchive';
import type { LibraryBlock } from './library';
import type { LibraryCategory } from './libraryCategories';
import { DEFAULT_CATEGORIES } from './libraryCategories';
import { missingStarterCategories } from './starterLibrary';

export const CC0_LIBRARY_COUNT = 398;

/** Prepara la colección incluida en la aplicación sin modificar la biblioteca del usuario. */
export function prepareCc0Library(bytes: Uint8Array, existing: LibraryBlock[], categories: LibraryCategory[]): { put: LibraryBlock[]; categories: LibraryCategory[] } {
  const archive = readLibraryArchive(bytes);
  const ids = new Set(DEFAULT_CATEGORIES.map((category) => category.id));
  if (archive.blocks.length !== CC0_LIBRARY_COUNT || archive.blocks.some((block) =>
    !ids.has(block.categoryId) ||
    block.source?.kind !== 'dxf' ||
    !block.source.file?.startsWith('caddillo-blocks/') ||
    !block.package.blocks.some((record) => record.id === block.package.root && record.units === 'in') ||
    block.package.entities.length === 0
  )) throw new Error('La colección de bloques incluida está dañada. / The bundled block collection is damaged.');

  const names = new Set(existing.map((block) => block.name.toLocaleLowerCase()));
  const sources = new Set(existing.map((block) => block.source?.file).filter(Boolean));
  const put = archive.blocks
    .filter((block) => !names.has(block.name.toLocaleLowerCase()) && !sources.has(block.source?.file))
    .map((block) => ({ ...block, id: newId('lib'), savedAt: Date.now() }));
  return { put, categories: missingStarterCategories(categories, put.map((block) => ({ category: block.categoryId }))) };
}
