import type { CadDocument } from '../document/document';
import { createDocument } from '../document/defaults';
import type { DrawingUnits, Id } from '../document/types';
import { importDxfIntoDocument } from '../io/dxf/importDxf';
import type { ModelContext } from '../model/context';
import { createContext } from '../model/context';
import { installDynamicBlocks } from './install';
import type { LibraryBlock } from './library';
import { makeLibraryBlock, packageBlock } from './library';
import type { LibraryCategory } from './libraryCategories';
import { DEFAULT_CATEGORIES } from './libraryCategories';
import { modelSpaceToBlock } from './libraryImport';
import { stretchablePackage } from './stretchable';

/** Entrada del manifiesto `public/library/librecad/index.json`. */
export interface StarterItem {
  file: string;
  name: string;
  category: string;
  units: DrawingUnits;
  stretchable: boolean;
}

export interface StarterManifest {
  source: string;
  license: string;
  items: StarterItem[];
}

export type ThumbFn = (doc: CadDocument, ctx: ModelContext, id: Id) => string | undefined;

/**
 * Convierte un DXF de la biblioteca inicial en un bloque de biblioteca: el espacio modelo pasa a
 * ser el bloque (con las unidades reales del manifiesto) y, si procede, se hace estirable.
 */
export function starterBlock(text: string, item: StarterItem, thumb?: ThumbFn): LibraryBlock {
  const doc = createDocument({ title: item.name });
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  importDxfIntoDocument(doc, text);
  doc.transact('UNITS', (tx) => tx.setSettings({ units: item.units, insUnits: item.units }));
  const id = modelSpaceToBlock(doc, ctx, item.name);
  if (!id) throw new Error(`«${item.file}» no tiene geometría.`);
  let pkg = packageBlock(doc, id);
  if (item.stretchable) pkg = stretchablePackage(pkg);
  return makeLibraryBlock(pkg, { name: item.name, categoryId: item.category, tags: ['LibreCAD'], thumbnail: thumb ? packageThumbnail(pkg, thumb) : undefined, source: { kind: 'dxf', file: `LibreCAD/${item.file}`, importedAt: Date.now() } });
}

/** Miniatura de un paquete con su definición final (estirable o no), dibujada en un documento aparte. */
export function packageThumbnail(pkg: LibraryBlock['package'], thumb: ThumbFn): string | undefined {
  const view = createDocument();
  const ctx = createContext(view);
  installDynamicBlocks(ctx);
  view.transact('THUMB', (tx) => {
    for (const b of pkg.blocks) tx.add('blocks', b);
    for (const e of pkg.entities) tx.addEntity(e as never);
  });
  return thumb(view, ctx, pkg.root);
}

/** Categorías que la biblioteca inicial necesita y aún no existen (p. ej. en bibliotecas antiguas). */
export function missingStarterCategories(cats: LibraryCategory[], items: { category: string }[]): LibraryCategory[] {
  const have = new Set(cats.map((c) => c.id));
  const need = new Set<string>();
  for (const it of items) {
    const c = DEFAULT_CATEGORIES.find((d) => d.id === it.category);
    if (!c) continue;
    need.add(c.id);
    if (c.parent) need.add(c.parent);
  }
  return DEFAULT_CATEGORIES.filter((c) => need.has(c.id) && !have.has(c.id));
}
