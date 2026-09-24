import { requestUi } from '../app/services';
import { installDynamicBlocks } from '../blocks/install';
import type { LibraryBlock } from '../blocks/library';
import { makeLibraryBlock, packageBlock } from '../blocks/library';
import { readLibraryArchive, writeLibraryArchive } from '../blocks/libraryArchive';
import type { LibraryCategory } from '../blocks/libraryCategories';
import { descendantIds, suggestCategory } from '../blocks/libraryCategories';
import type { LibraryImportSession } from '../blocks/libraryImport';
import { candidatesFromArchive, candidatesFromDocument } from '../blocks/libraryImport';
import { commitLibrary, loadCategories, loadLibrary } from '../blocks/libraryStore';
import { furnitureLibrary } from '../blocks/furniture';
import { missingStarterCategories, packageThumbnail, parseStarterManifest, starterBlock } from '../blocks/starterLibrary';
import { createDocument } from '../document/defaults';
import type { Id } from '../document/types';
import { decodeDxfBytes, importDxfFile, importDxfIntoDocument } from '../io/dxf/importDxf';
import { assertInputBytes } from '../io/limits';
import { taskManager } from '../app/tasks';
import { runHeavy } from '../workers/client';
import { createContext } from '../model/context';
import { blockThumbnailOf } from '../render/thumbnail';
import { openFile, saveFile } from '../storage/fileAccess';
import { L } from './helpers';
import type { CommandDef } from './types';
import { CommandError } from './types';

type ThumbFn = (doc: ReturnType<typeof createDocument>, ctx: ReturnType<typeof createContext>, id: Id) => string | undefined;
const defaultThumb: ThumbFn = (doc, ctx, id) => blockThumbnailOf(doc, ctx, id, 64) ?? undefined;
const throwIfCancelled = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
};

/** Lee un archivo (.dxf, .dwg o .fmodellib) en un documento temporal y prepara los candidatos. No toca el dibujo abierto. */
export async function buildImportSession(file: { name: string; bytes: Uint8Array }, cats: LibraryCategory[], thumb: ThumbFn = defaultThumb, signal?: AbortSignal): Promise<LibraryImportSession> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  assertInputBytes(file.bytes);
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
    const dxf = await taskManager.runTask(
      'library-parse-dwg',
      { es: `Leyendo DWG: ${file.name}`, en: `Reading DWG: ${file.name}` },
      // La siguiente importación debe poder reutilizar los bytes originales.
      async (ctx2) => runHeavy('parseDwg', { bytes: file.bytes }, { signal: ctx2.signal }),
      { signal },
    );
    const report = importDxfFile(doc, dxf, { format: 'DWG' });
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
  async run(api) {
    const f = await openFile({ 'application/octet-stream': ['.dxf', '.dwg', '.fmodellib'] }, 'DXF / DWG / FModel library');
    if (!f || api.signal.aborted) return;
    const categories = await loadCategories();
    throwIfCancelled(api.signal);
    const session = await buildImportSession(f, categories, defaultThumb, api.signal);
    throwIfCancelled(api.signal);
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
    throwIfCancelled(api.signal);
    let blocks = await loadLibrary();
    throwIfCancelled(api.signal);
    const catId = args?.[0];
    if (catId) {
      const ids = descendantIds(cats, catId);
      blocks = blocks.filter((b) => ids.has(b.categoryId));
    }
    if (!blocks.length) throw new CommandError(L('No hay bloques que exportar.', 'There are no blocks to export.'));
    const bytes = writeLibraryArchive({ categories: cats, blocks });
    throwIfCancelled(api.signal);
    const cat = cats.find((c) => c.id === catId);
    const name = `${cat ? cat.name : 'biblioteca'}.fmodellib`;
    const result = await saveFile(new Blob([bytes as BlobPart], { type: 'application/zip' }), name, { 'application/zip': ['.fmodellib'] }, 'FModel library');
    throwIfCancelled(api.signal);
    if (result.kind === 'cancelled') return;
    const handle = result.kind === 'saved-to-handle' ? result.handle : null;
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
    throwIfCancelled(api.signal);
    const candidate = { key: b.id, name: b.name, description: b.description, pkg: packageBlock(api.editor.doc, b.id), dynamic: !!b.dynamic, thumbnail: blockThumbnailOf(api.editor.doc, api.editor.ctx, b.id, 64) ?? undefined, categoryId: suggestCategory(`${b.name} ${b.description}`, cats), tags: [], selected: true, units: b.units };
    if (typeof window === 'undefined') {
      throwIfCancelled(api.signal);
      await commitLibrary({ put: [makeLibraryBlock(candidate.pkg, { ...candidate, source: { kind: 'fmodel', importedAt: Date.now() } })] });
      throwIfCancelled(api.signal);
      api.info(L(`«${b.name}» guardado en la biblioteca.`, `"${b.name}" saved to the library.`));
      return;
    }
    throwIfCancelled(api.signal);
    requestUi('library-import', { mode: 'save', source: { kind: 'fmodel' }, candidates: [candidate], categories: cats } satisfies LibraryImportSession);
  },
};

const LIBRARYSTARTER: CommandDef = {
  name: 'LIBRARYSTARTER',
  aliases: ['BIBLIOTECAINICIAL'],
  category: 'block',
  readOnly: true,
  label: L('Instalar biblioteca inicial', 'Install starter library'),
  description: L('Añade a la biblioteca 100 bloques de LibreCAD (muebles, puertas, vegetación, instalaciones; GPL-2.0) y 12 muebles paramétricos de FModel. Los muebles quedan estirables. No duplica lo que ya esté.', 'Adds 100 LibreCAD blocks (furniture, doors, vegetation, services; GPL-2.0) and 12 FModel parametric furniture pieces to the library. Furniture is stretchable. Does not duplicate existing items.'),
  icon: 'insert',
  async run(api) {
    const base = `${import.meta.env.BASE_URL}library/librecad/`;
    const res = await fetch(`${base}index.json`, { signal: api.signal });
    if (!res.ok) throw new CommandError(L('No se pudo descargar el índice de la biblioteca inicial.', 'Could not download the starter library index.'));
    const manifest = parseStarterManifest(await res.json());
    throwIfCancelled(api.signal);
    const existing = new Set((await loadLibrary()).map((b) => b.name.toLowerCase()));
    throwIfCancelled(api.signal);
    const cats = await loadCategories();
    throwIfCancelled(api.signal);
    const put = furnitureLibrary()
      .filter((b) => !existing.has(b.name.toLowerCase()))
      .map((b): LibraryBlock => ({ ...b, thumbnail: packageThumbnail(b.package, defaultThumb) }));
    const failed: string[] = [];
    const todo = manifest.items.filter((i) => !existing.has(i.name.toLowerCase()));
    for (const [n, item] of todo.entries()) {
      throwIfCancelled(api.signal);
      if (n % 25 === 0) api.info(L(`Instalando bloques ${n + 1}–${Math.min(n + 25, todo.length)} de ${todo.length}…`, `Installing blocks ${n + 1}–${Math.min(n + 25, todo.length)} of ${todo.length}…`));
      try {
        const r = await fetch(`${base}${item.file}`, { signal: api.signal });
        if (!r.ok) throw new Error(String(r.status));
        const bytes = new Uint8Array(await r.arrayBuffer());
        assertInputBytes(bytes, 'bloque de biblioteca');
        put.push(starterBlock(decodeDxfBytes(bytes), item, defaultThumb));
      } catch (error) {
        if (api.signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
        failed.push(item.name);
      }
    }
    if (!put.length) {
      api.info(L('La biblioteca inicial ya estaba instalada.', 'The starter library was already installed.'));
      return;
    }
    // nunca dos bloques con el mismo nombre (la biblioteca los trata como únicos)
    const seen = new Set<string>();
    const unique = put.filter((b) => !seen.has(b.name.toLowerCase()) && seen.add(b.name.toLowerCase()));
    put.length = 0;
    put.push(...unique);
    throwIfCancelled(api.signal);
    await commitLibrary({ put, categories: missingStarterCategories(cats, [...manifest.items, { category: 'cat-mob-salon' }]) });
    throwIfCancelled(api.signal);
    api.info(L(`${put.length} bloques añadidos a la biblioteca (LibreCAD, GPL-2.0, y muebles paramétricos de FModel).`, `${put.length} blocks added to the library (LibreCAD, GPL-2.0, and FModel parametric furniture).`));
    if (failed.length) api.warn(L(`No se pudieron instalar: ${failed.join(', ')}.`, `Could not install: ${failed.join(', ')}.`));
    requestUi('panel:blocks');
  },
};

export const LIBRARY_COMMANDS: CommandDef[] = [LIBRARYIMPORT, LIBRARYEXPORT, LIBRARYSTARTER, WBLOCK];
