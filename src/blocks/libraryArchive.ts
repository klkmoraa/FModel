import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { LibraryBlock } from './library';
import type { LibraryCategory } from './libraryCategories';
import { assertZipLimits } from '../io/limits';

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

function isLibraryBlock(value: unknown): value is LibraryBlock {
  if (!value || typeof value !== 'object') return false;
  const block = value as Record<string, unknown>;
  const pkg = block.package;
  if (typeof block.id !== 'string' || !block.id || typeof block.name !== 'string' || typeof block.categoryId !== 'string' || !Array.isArray(block.tags) || typeof block.dynamic !== 'boolean' || !Number.isFinite(block.savedAt) || !pkg || typeof pkg !== 'object') return false;
  const packageRecord = pkg as Record<string, unknown>;
  return packageRecord.format === 'fmodel-block' && packageRecord.version === 1 && typeof packageRecord.root === 'string' && ['blocks', 'entities', 'layers', 'linetypes', 'textStyles'].every((key) => Array.isArray(packageRecord[key]));
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
  assertZipLimits(bytes, 'biblioteca');
  try {
    files = unzipSync(bytes);
    manifest = JSON.parse(strFromU8(files['manifest.json'])) as Manifest;
  } catch {
    throw new Error('El archivo no es una biblioteca de FModel (.fmodellib). / Not an FModel library (.fmodellib).');
  }
  if (!manifest || typeof manifest !== 'object' || manifest.format !== FORMAT || !Number.isInteger(manifest.version) || !Array.isArray(manifest.categories) || !Array.isArray(manifest.blocks)) {
    throw new Error('El archivo no es una biblioteca de FModel (.fmodellib). / Not an FModel library (.fmodellib).');
  }
  if (manifest.version > VERSION) throw new Error(`Biblioteca de una versión posterior (${manifest.version}); actualiza FModel. / Library from a newer version; update FModel.`);
  const blocks = manifest.blocks.map((entry) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.file !== 'string' || !entry.file.startsWith('blocks/')) throw new Error('El índice de la biblioteca no es válido. / The library index is invalid.');
    const raw = files[entry.file];
    if (!raw) throw new Error(`Falta ${entry.file} en la biblioteca. / Missing ${entry.file} in the library.`);
    const block = JSON.parse(strFromU8(raw)) as unknown;
    if (!isLibraryBlock(block)) throw new Error(`Bloque inválido: ${entry.file}. / Invalid block: ${entry.file}.`);
    return block;
  });
  return { categories: manifest.categories ?? [], blocks };
}
