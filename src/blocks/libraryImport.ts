import type { BBox } from '../geometry/bbox';
import { emptyBox, expandBox, isEmptyBox } from '../geometry/bbox';
import type { CadDocument } from '../document/document';
import { newId } from '../document/ids';
import type { BlockRecord, Id } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import type { ModelContext } from '../model/context';
import { kindOf } from '../model/registry';
import { isInsertableBlock } from './blockOps';
import type { BlockPackage, LibraryBlock, LibrarySourceKind } from './library';
import { makeLibraryBlock, packageBlock } from './library';
import type { LibraryArchive } from './libraryArchive';
import type { LibraryCategory } from './libraryCategories';
import { descendantIds, mergeCategories, suggestCategory, UNCLASSIFIED } from './libraryCategories';
import { stretchablePackage } from './stretchable';

export interface ImportCandidate {
  key: string;
  name: string;
  description: string;
  pkg: BlockPackage;
  dynamic: boolean;
  thumbnail?: string;
  categoryId: string;
  tags: string[];
  selected: boolean;
  /** conserva la fecha original al importar desde .fmodellib */
  savedAt?: number;
  /** al guardar, hacerlo estirable (Ancho y Fondo) si no es dinámico */
  stretchable?: boolean;
}

/** Lo que el diálogo de la biblioteca necesita para guardar: candidatos y categorías (ya fusionadas). */
export interface LibraryImportSession {
  mode: 'import' | 'save';
  source: { kind: LibrarySourceKind; file?: string };
  candidates: ImportCandidate[];
  categories: LibraryCategory[];
  /** informe de conversión del DXF/DWG de origen */
  report?: unknown;
}

export type Resolution = 'replace' | 'rename' | 'skip';

/** Convierte el espacio modelo en un bloque con punto base en la esquina inferior izquierda de su extensión. */
export function modelSpaceToBlock(doc: CadDocument, ctx: ModelContext, name: string): Id | null {
  const ents = doc.entitiesOf(MODEL_SPACE_ID);
  if (!ents.length) return null;
  const box: BBox = emptyBox();
  for (const e of ents) {
    try {
      const b = kindOf(e).bbox(e, ctx);
      if (Number.isFinite(b.minX)) expandBox(box, b);
    } catch {
      /* entidad sin caja */
    }
  }
  const base = isEmptyBox(box) ? { x: 0, y: 0 } : { x: box.minX, y: box.minY };
  const id = newId('blk');
  let unique = name;
  for (let i = 2; doc.findByName('blocks', unique); i++) unique = `${name} (${i})`;
  doc.transact('MODEL AS BLOCK', (tx) => {
    const rec: BlockRecord = { id, name: unique, kind: 'normal', basePoint: base, description: '', units: doc.settings.insUnits, explodable: true, scaleUniformly: false, annotative: false, revision: 1 };
    tx.add('blocks', rec);
    for (const e of ents) tx.updateEntity(e.id, { owner: id });
  });
  return id;
}

/** Los muebles se ofrecen estirables por defecto. */
export const isFurniture = (cats: LibraryCategory[], categoryId: string) => descendantIds(cats, 'cat-mob').has(categoryId);

const baseName = (file: string) => file.replace(/\.[^.]+$/, '').trim() || 'Dibujo';

/** Bloques con nombre del documento y, además, el espacio modelo entero como bloque. */
export function candidatesFromDocument(doc: CadDocument, ctx: ModelContext, cats: LibraryCategory[], opts: { file: string; thumb?: (id: Id) => string | undefined }): ImportCandidate[] {
  const named = [...doc.data.blocks.values()].filter((b) => isInsertableBlock(b) && !b.name.startsWith('*'));
  const out: ImportCandidate[] = named
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({
      key: b.id,
      name: b.name,
      description: b.description,
      pkg: packageBlock(doc, b.id),
      dynamic: !!b.dynamic,
      thumbnail: opts.thumb?.(b.id),
      categoryId: suggestCategory(`${b.name} ${b.description}`, cats),
      tags: [],
      selected: true,
    }))
    .map((c) => ({ ...c, stretchable: !c.dynamic && isFurniture(cats, c.categoryId) }));
  const name = baseName(opts.file);
  const modelId = modelSpaceToBlock(doc, ctx, name);
  if (modelId) {
    out.push({
      key: '*model',
      name,
      description: '',
      pkg: packageBlock(doc, modelId),
      dynamic: false,
      thumbnail: opts.thumb?.(modelId),
      categoryId: suggestCategory(name, cats),
      tags: [],
      selected: !out.length,
      stretchable: isFurniture(cats, suggestCategory(name, cats)),
    });
  }
  return out;
}

export function candidatesFromArchive(archive: LibraryArchive, cats: LibraryCategory[]): { candidates: ImportCandidate[]; categories: LibraryCategory[] } {
  const { categories, idMap } = mergeCategories(cats, archive.categories);
  const candidates = archive.blocks.map((b) => ({
    key: b.id,
    name: b.name,
    description: b.description ?? '',
    pkg: b.package,
    dynamic: b.dynamic,
    thumbnail: b.thumbnail,
    categoryId: idMap.get(b.categoryId) ?? (categories.some((c) => c.id === b.categoryId) ? b.categoryId : UNCLASSIFIED),
    tags: b.tags ?? [],
    selected: true,
    savedAt: b.savedAt,
  }));
  return { candidates, categories };
}

const fold = (s: string) => s.trim().toLowerCase();

/** Bloques a escribir y a borrar según la elección de cada candidato con nombre repetido. */
export function planLibraryWrite(session: LibraryImportSession, existing: LibraryBlock[], resolution: (key: string) => Resolution): { put: LibraryBlock[]; remove: string[] } {
  const names = new Set(existing.map((b) => fold(b.name)));
  const put: LibraryBlock[] = [];
  const remove: string[] = [];
  for (const c of session.candidates) {
    if (!c.selected) continue;
    let name = c.name.trim() || 'Bloque';
    const clash = existing.find((b) => fold(b.name) === fold(name));
    if (clash || names.has(fold(name))) {
      const r = resolution(c.key);
      if (r === 'skip') continue;
      if (r === 'replace' && clash) remove.push(clash.id);
      else {
        let i = 2;
        while (names.has(fold(`${name} (${i})`))) i++;
        name = `${name} (${i})`;
      }
    }
    names.add(fold(name));
    const pkg = c.stretchable && !c.dynamic ? stretchablePackage(c.pkg) : c.pkg;
    const item = makeLibraryBlock(pkg, { name, categoryId: c.categoryId, tags: c.tags, description: c.description, thumbnail: c.thumbnail, source: { kind: session.source.kind, file: session.source.file, importedAt: Date.now() } });
    put.push(c.savedAt ? { ...item, savedAt: c.savedAt } : item);
  }
  return { put, remove };
}
