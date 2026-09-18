import { requestUi } from '../app/services';
import { installDynamicBlocks } from '../blocks/install';
import { makeLibraryBlock, packageBlock } from '../blocks/library';
import { readLibraryArchive, writeLibraryArchive } from '../blocks/libraryArchive';
import type { LibraryCategory } from '../blocks/libraryCategories';
import { descendantIds, suggestCategory } from '../blocks/libraryCategories';
import type { LibraryImportSession } from '../blocks/libraryImport';
import { candidatesFromArchive, candidatesFromDocument } from '../blocks/libraryImport';
import { commitLibrary, loadCategories, loadLibrary } from '../blocks/libraryStore';
import { createDocument } from '../document/defaults';
import type { Id } from '../document/types';
import { decodeDxfBytes, importDxfFile, importDxfIntoDocument } from '../io/dxf/importDxf';
import { runHeavy } from '../workers/client';
import { createContext } from '../model/context';
import { blockThumbnailOf } from '../render/thumbnail';
import { openFile, saveFile } from '../storage/fileAccess';
import { L } from './helpers';
import type { CommandDef } from './types';
import { CommandError } from './types';

type ThumbFn = (doc: ReturnType<typeof createDocument>, ctx: ReturnType<typeof createContext>, id: Id) => string | undefined;
const defaultThumb: ThumbFn = (doc, ctx, id) => blockThumbnailOf(doc, ctx, id, 64) ?? undefined;

/** Lee un archivo (.dxf, .dwg o .fmodellib) en un documento temporal y prepara los candidatos. No toca el dibujo abierto. */
export async function buildImportSession(file: { name: string; bytes: Uint8Array }, cats: LibraryCategory[], thumb: ThumbFn = defaultThumb): Promise<LibraryImportSession> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'fmodellib') {
    const { candidates, categories } = candidatesFromArchive(readLibraryArchive(file.bytes), cats);
    return { mode: 'import', source: { kind: 'fmodellib', file: file.name }, candidates, categories };
  }
  if (ext === 'dxf') {
    const doc = createDocument({ title: file.name });
    const ctx = createContext(doc);
    installDynamicBlocks(ctx);
    const report = importDxfIntoDocument(doc, decodeDxfBytes(file.bytes));
    const candidates = candidatesFromDocument(doc, ctx, cats, { file: file.name, thumb: (id) => thumb(doc, ctx, id) });
    return { mode: 'import', source: { kind: 'dxf', file: file.name }, candidates, categories: cats, report };
  }
  if (ext === 'dwg') {
    const doc = createDocument({ title: file.name });
    const ctx = createContext(doc);
    installDynamicBlocks(ctx);
    const report = importDxfFile(doc, await runHeavy('parseDwg', { bytes: file.bytes }), { format: 'DWG' });
    const candidates = candidatesFromDocument(doc, ctx, cats, { file: file.name, thumb: (id) => thumb(doc, ctx, id) });
    return { mode: 'import', source: { kind: 'dwg', file: file.name }, candidates, categories: cats, report };
  }
  throw new Error(`Formato no admitido: .${ext ?? '?'} (usa .dxf, .dwg o .fmodellib). / Unsupported format.`);
}

const LIBRARYIMPORT: CommandDef = {
  name: 'LIBRARYIMPORT',
  aliases: ['BIBLIOTECAIMPORTAR', 'LIBIMPORT'],
  category: 'block',
  readOnly: true,
  label: L('Importar a la biblioteca', 'Import to library'),
  description: L('Añade a la biblioteca los bloques de un DXF o DWG (o el dibujo entero como bloque) o de un archivo .fmodellib, con categoría y etiquetas.', 'Adds the blocks of a DXF or DWG (or the whole drawing as a block) or of a .fmodellib file to the library, with category and tags.'),
  icon: 'insert',
  async run() {
    const f = await openFile({ 'application/octet-stream': ['.dxf', '.dwg', '.fmodellib'] }, 'DXF / DWG / FModel library');
    if (!f) return;
    const session = await buildImportSession(f, await loadCategories());
    if (!session.candidates.length) throw new CommandError(L('El archivo no contiene bloques ni geometría que guardar.', 'The file has no blocks or geometry to save.'));
    requestUi('library-import', session);
  },
};

const LIBRARYEXPORT: CommandDef = {
  name: 'LIBRARYEXPORT',
  aliases: ['BIBLIOTECAEXPORTAR', 'LIBEXPORT'],
  category: 'block',
  readOnly: true,
  label: L('Exportar biblioteca', 'Export library'),
  description: L('Guarda la biblioteca (o una categoría) en un archivo .fmodellib para compartirla.', 'Saves the library (or one category) to a .fmodellib file for sharing.'),
  icon: 'export',
  async run(api, args) {
    const cats = await loadCategories();
    let blocks = await loadLibrary();
    const catId = args?.[0];
    if (catId) {
      const ids = descendantIds(cats, catId);
      blocks = blocks.filter((b) => ids.has(b.categoryId));
    }
    if (!blocks.length) throw new CommandError(L('No hay bloques que exportar.', 'There are no blocks to export.'));
    const bytes = writeLibraryArchive({ categories: cats, blocks });
    const cat = cats.find((c) => c.id === catId);
    const name = `${cat ? cat.name : 'biblioteca'}.fmodellib`;
    const handle = await saveFile(new Blob([bytes as BlobPart], { type: 'application/zip' }), name, { 'application/zip': ['.fmodellib'] }, 'FModel library');
    api.info(L(`${blocks.length} bloque(s) exportado(s)${handle ? ` → ${handle.name}` : ''}.`, `${blocks.length} block(s) exported${handle ? ` → ${handle.name}` : ''}.`));
  },
};

const WBLOCK: CommandDef = {
  name: 'WBLOCK',
  aliases: ['W', 'BLOQUEDISCO'],
  category: 'block',
  readOnly: true,
  label: L('Enviar bloque a biblioteca', 'Write block to library'),
  description: L('Guarda un bloque (con dependencias) en la biblioteca con categoría y etiquetas.', 'Saves a block (with dependencies) to the library with category and tags.'),
  async run(api, args) {
    let name = args?.[0];
    if (!name) {
      const r = await api.getString({ prompt: L('Nombre del bloque', 'Block name'), allowSpaces: true });
      if (r.kind !== 'string') return;
      name = r.value;
    }
    const b = api.editor.doc.findByName('blocks', name);
    if (!b) throw new CommandError(L(`No existe el bloque «${name}».`, `Block "${name}" not found.`));
    const cats = await loadCategories();
    const candidate = { key: b.id, name: b.name, description: b.description, pkg: packageBlock(api.editor.doc, b.id), dynamic: !!b.dynamic, thumbnail: blockThumbnailOf(api.editor.doc, api.editor.ctx, b.id, 64) ?? undefined, categoryId: suggestCategory(`${b.name} ${b.description}`, cats), tags: [], selected: true };
    if (typeof window === 'undefined') {
      await commitLibrary({ put: [makeLibraryBlock(candidate.pkg, { ...candidate, source: { kind: 'fmodel', importedAt: Date.now() } })] });
      api.info(L(`«${b.name}» guardado en la biblioteca.`, `"${b.name}" saved to the library.`));
      return;
    }
    requestUi('library-import', { mode: 'save', source: { kind: 'fmodel' }, candidates: [candidate], categories: cats } satisfies LibraryImportSession);
  },
};

export const LIBRARY_COMMANDS: CommandDef[] = [LIBRARYIMPORT, LIBRARYEXPORT, WBLOCK];
