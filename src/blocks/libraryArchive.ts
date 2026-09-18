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
