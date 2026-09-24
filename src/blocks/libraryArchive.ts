import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type {
  AssetRecord,
  BlockRecord,
  DimStyleRecord,
  Entity,
  Id,
  LayerRecord,
  LinetypeRecord,
  MLeaderStyleRecord,
  MLineStyleRecord,
  TableStyleRecord,
  TextStyleRecord,
} from '../document/types';
import {
  DEFPOINTS_LAYER_ID,
  DIMSTYLE_ISO_ID,
  DIMSTYLE_STANDARD_ID,
  LAYER0_ID,
  LT_CONTINUOUS_ID,
  MLEADERSTYLE_STANDARD_ID,
  MLINESTYLE_STANDARD_ID,
  TABLESTYLE_STANDARD_ID,
  TEXTSTYLE_STANDARD_ID,
} from '../document/defaults';
import { assertInputBytes, assertZipLimits, assertZipOutputEntries, INPUT_LIMITS } from '../io/limits';
import { assertAssetRecord, AssetValidationError } from '../io/assets';
import { assertDocumentRecord, assertDynamicBlockDefinition, assertEntityRecord, assertFiniteValues, assertPointLimits, ENTITY_TYPES, InputValidationError } from '../io/validation';
import type { BlockPackage, LibraryBlock } from './library';
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

export class LibraryFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryFormatError';
  }
}

const VALID_SOURCE_KINDS = new Set<string>(['fmodel', 'dxf', 'dwg', 'fmodellib']);
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const THUMBNAIL_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/i;
const SAFE_SVG_TAGS = new Set(['svg', 'defs', 'style', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);

function validateThumbnail(thumbnail: unknown, blockId: string): void {
  if (typeof thumbnail !== 'string') {
    throw new LibraryFormatError(`Miniatura no válida en el bloque «${blockId}». / Invalid thumbnail in block "${blockId}".`);
  }
  if (thumbnail.length > 1_048_576) {
    throw new LibraryFormatError(`Miniatura demasiado grande en el bloque «${blockId}». / Thumbnail too large in block "${blockId}".`);
  }
  const match = THUMBNAIL_DATA_URL.exec(thumbnail);
  if (!match) {
    throw new LibraryFormatError(`Miniatura no válida en el bloque «${blockId}»: solo se admiten imágenes base64 locales. / Invalid thumbnail in block "${blockId}": only local base64 images are allowed.`);
  }
  if (!thumbnail.toLowerCase().startsWith('data:image/svg+xml;')) return;

  let svg: string;
  try {
    const binary = globalThis.atob(match[1]);
    svg = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    throw new LibraryFormatError(`SVG no válido en la miniatura del bloque «${blockId}». / Invalid SVG in thumbnail for block "${blockId}".`);
  }
  const withoutNamespace = svg.replace(/\bxmlns\s*=\s*["'][^"']*["']/gi, '');
  if (
    /<\s*(?:script|foreignObject|iframe|object|embed|image|use|a)\b|(?:on[a-z]+|(?:xlink:)?href|src)\s*=|javascript\s*:|url\s*\(|@import|<\s*!doctype/i.test(withoutNamespace)
  ) {
    throw new LibraryFormatError(`SVG inseguro en la miniatura del bloque «${blockId}». / Unsafe SVG in thumbnail for block "${blockId}".`);
  }
  for (const tag of svg.matchAll(/<\s*\/?\s*([a-z][\w:-]*)\b/gi)) {
    if (!SAFE_SVG_TAGS.has(tag[1].toLowerCase())) {
      throw new LibraryFormatError(`Etiqueta SVG no permitida en la miniatura del bloque «${blockId}». / SVG tag is not allowed in thumbnail for block "${blockId}".`);
    }
  }
}

/** Valida la jerarquía de categorías: IDs únicos, padres existentes, sin ciclos y profundidad <= 2. */
export function validateLibraryCategories(categories: unknown): asserts categories is LibraryCategory[] {
  if (!Array.isArray(categories)) {
    throw new LibraryFormatError('Las categorías de la biblioteca no son válidas. / Library categories are invalid.');
  }
  if (categories.length > 1_000) {
    throw new LibraryFormatError('Demasiadas categorías en la biblioteca. / Too many categories in library.');
  }
  const categoryIds = new Set<string>();
  for (const c of categories) {
    if (!c || typeof c !== 'object') {
      throw new LibraryFormatError('Categoría no válida. / Invalid category.');
    }
    const cat = c as Record<string, unknown>;
    if (typeof cat.id !== 'string' || !cat.id.trim() || !SAFE_ID_PATTERN.test(cat.id)) {
      throw new LibraryFormatError(`Identificador de categoría no válido: «${String(cat.id)}». / Invalid category ID: "${String(cat.id)}".`);
    }
    if (typeof cat.name !== 'string' || !cat.name.trim()) {
      throw new LibraryFormatError(`Nombre no válido para la categoría «${cat.id}». / Invalid name for category "${cat.id}".`);
    }
    if (typeof cat.order !== 'number' || !Number.isFinite(cat.order)) {
      throw new LibraryFormatError(`Orden no válido para la categoría «${cat.id}». / Invalid order for category "${cat.id}".`);
    }
    if (categoryIds.has(cat.id)) {
      throw new LibraryFormatError(`Identificador de categoría duplicado: «${cat.id}». / Duplicate category ID: "${cat.id}".`);
    }
    categoryIds.add(cat.id);
  }

  const catMap = new Map<string, LibraryCategory>(categories.map((c) => [c.id, c]));

  // Comprobar auto-dependencia y existencia de parent
  for (const c of categories) {
    if (c.parent !== undefined) {
      if (typeof c.parent !== 'string' || !c.parent.trim()) {
        throw new LibraryFormatError(`La categoría «${c.id}» tiene una categoría padre no válida. / Category "${c.id}" has an invalid parent.`);
      }
      if (c.parent === c.id) {
        throw new LibraryFormatError(`La categoría «${c.id}» no puede ser su propio padre. / Category "${c.id}" cannot be its own parent.`);
      }
      const parent = catMap.get(c.parent);
      if (!parent) {
        throw new LibraryFormatError(`La categoría «${c.id}» tiene una categoría padre inexistente: «${c.parent}». / Category "${c.id}" has a missing parent category: "${c.parent}".`);
      }
    }
  }

  // Detección de ciclos
  for (const c of categories) {
    const visited = new Set<string>([c.id]);
    let curr = c;
    while (curr.parent) {
      if (visited.has(curr.parent)) {
        throw new LibraryFormatError(`Ciclo detectado en la jerarquía de categorías («${c.id}» → «${curr.parent}»). / Cycle detected in category hierarchy ("${c.id}" → "${curr.parent}").`);
      }
      visited.add(curr.parent);
      const next = catMap.get(curr.parent);
      if (!next) break;
      curr = next;
    }
  }

  // Profundidad máxima permitida: 2 niveles (un hijo no puede tener subhijos)
  for (const c of categories) {
    if (c.parent !== undefined) {
      const parent = catMap.get(c.parent)!;
      if (parent.parent !== undefined) {
        throw new LibraryFormatError(`La categoría «${c.id}» supera la profundidad máxima permitida (2 niveles). / Category "${c.id}" exceeds maximum supported depth (2 levels).`);
      }
    }
  }
}

/** Valida referencias internas de definiciones de bloques dinámicos. */
function validateDynamicBlockDefinition(dyn: unknown, entityIds: Set<string>): void {
  try {
    assertDynamicBlockDefinition(dyn, entityIds);
  } catch (error) {
    if (error instanceof InputValidationError) throw new LibraryFormatError(error.message);
    throw error;
  }
}

function validateStyleCollection(
  collection: 'dimStyles' | 'mleaderStyles' | 'tableStyles' | 'mlineStyles',
  value: unknown,
): Set<Id> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value)) {
    throw new LibraryFormatError(`La colección «${collection}» del paquete de bloque no es válida. / Collection "${collection}" in block package is invalid.`);
  }
  if (value.length > INPUT_LIMITS.maxEntities) {
    throw new LibraryFormatError(`El paquete contiene demasiados registros en «${collection}». / Package contains too many records in "${collection}".`);
  }
  const ids = new Set<Id>();
  const names = new Set<string>();
  for (const record of value) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new LibraryFormatError(`Registro no válido en «${collection}». / Invalid record in "${collection}".`);
    }
    const item = record as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || !item.name.trim()) {
      throw new LibraryFormatError(`Registro sin identidad válida en «${collection}». / Record without a valid identity in "${collection}".`);
    }
    try {
      assertDocumentRecord(collection, item);
    } catch (error) {
      if (error instanceof InputValidationError) throw new LibraryFormatError(error.message);
      throw error;
    }
    if (ids.has(item.id)) {
      throw new LibraryFormatError(`Identificador duplicado «${item.id}» en «${collection}». / Duplicate ID "${item.id}" in "${collection}".`);
    }
    if (names.has(item.name.toLowerCase())) {
      throw new LibraryFormatError(`Nombre duplicado «${item.name}» en «${collection}». / Duplicate name "${item.name}" in "${collection}".`);
    }
    ids.add(item.id);
    names.add(item.name.toLowerCase());
  }
  return ids;
}

function requireStyleReference(id: string, ids: Set<Id>, legacyIds: Set<string>, entityId: string): void {
  if (id === 'Standard' || ids.has(id) || legacyIds.has(id)) return;
  throw new LibraryFormatError(`La entidad «${entityId}» apunta a un estilo no incluido: «${id}». / Entity "${entityId}" references a style not included in the package: "${id}".`);
}

/** Valida profundamente la estructura, números finitos y referencias de un BlockPackage. */
export function validateBlockPackage(value: unknown): asserts value is BlockPackage {
  if (!value || typeof value !== 'object') {
    throw new LibraryFormatError('El paquete de bloque no es un objeto válido. / Block package is not a valid object.');
  }
  const pkg = value as Record<string, unknown>;

  if (pkg.format !== 'fmodel-block' || pkg.version !== 1) {
    throw new LibraryFormatError('Formato o versión de paquete de bloque no válido. / Invalid block package format or version.');
  }
  if (typeof pkg.root !== 'string' || !pkg.root.trim()) {
    throw new LibraryFormatError('El paquete de bloque no tiene una raíz válida. / Block package has no valid root.');
  }

  const collections = ['blocks', 'entities', 'layers', 'linetypes', 'textStyles'] as const;
  for (const c of collections) {
    if (!Array.isArray(pkg[c])) {
      throw new LibraryFormatError(`La colección «${c}» del paquete de bloque no es válida. / Collection "${c}" in block package is invalid.`);
    }
  }
  for (const c of ['dimStyles', 'mleaderStyles', 'tableStyles', 'mlineStyles', 'assets'] as const) {
    if (pkg[c] !== undefined && !Array.isArray(pkg[c])) {
      throw new LibraryFormatError(`La colección «${c}» del paquete de bloque no es válida. / Collection "${c}" in block package is invalid.`);
    }
  }

  const blocks = pkg.blocks as BlockRecord[];
  const entities = pkg.entities as Entity[];
  const layers = pkg.layers as LayerRecord[];
  const linetypes = pkg.linetypes as LinetypeRecord[];
  const textStyles = pkg.textStyles as TextStyleRecord[];
  const dimStyles = (pkg.dimStyles as DimStyleRecord[] | undefined) ?? [];
  const mleaderStyles = (pkg.mleaderStyles as MLeaderStyleRecord[] | undefined) ?? [];
  const tableStyles = (pkg.tableStyles as TableStyleRecord[] | undefined) ?? [];
  const mlineStyles = (pkg.mlineStyles as MLineStyleRecord[] | undefined) ?? [];
  const assets = (pkg.assets as AssetRecord[] | undefined) ?? [];

  if (blocks.length > INPUT_LIMITS.maxBlocks) {
    throw new LibraryFormatError('El paquete contiene demasiados bloques. / Package contains too many blocks.');
  }
  if (entities.length > INPUT_LIMITS.maxEntities) {
    throw new LibraryFormatError('El paquete contiene demasiadas entidades. / Package contains too many entities.');
  }
  if (assets.length > INPUT_LIMITS.maxAssets) {
    throw new LibraryFormatError('El paquete contiene demasiados recursos. / Package contains too many assets.');
  }

  try {
    assertFiniteValues(pkg);
    assertPointLimits(entities);
  } catch (err) {
    if (err instanceof InputValidationError) {
      throw new LibraryFormatError(err.message);
    }
    throw err;
  }

  const blockIds = new Set<Id>();
  const blockNames = new Set<string>();
  for (const b of blocks) {
    if (!b || typeof b !== 'object') {
      throw new LibraryFormatError('Bloque no válido en el paquete. / Invalid block in package.');
    }
    if (typeof b.id !== 'string' || !b.id.trim()) {
      throw new LibraryFormatError('Bloque sin identificador válido en el paquete. / Block without valid ID in package.');
    }
    if (typeof b.name !== 'string' || !b.name.trim()) {
      throw new LibraryFormatError(`Bloque «${b.id}» sin nombre válido. / Block "${b.id}" without valid name.`);
    }
    if (blockIds.has(b.id)) {
      throw new LibraryFormatError(`Identificador de bloque duplicado «${b.id}» en el paquete. / Duplicate block ID "${b.id}" in package.`);
    }
    if (blockNames.has(b.name.toLowerCase())) {
      throw new LibraryFormatError(`Nombre de bloque duplicado «${b.name}» en el paquete. / Duplicate block name "${b.name}" in package.`);
    }
    blockIds.add(b.id);
    blockNames.add(b.name.toLowerCase());
  }

  if (!blockIds.has(pkg.root as Id)) {
    throw new LibraryFormatError(`La definición raíz «${pkg.root}» no existe en el paquete. / Root block definition "${pkg.root}" missing in package.`);
  }

  const linetypeIds = new Set<Id>();
  const linetypeNames = new Set<string>();
  for (const lt of linetypes) {
    if (!lt || typeof lt !== 'object') {
      throw new LibraryFormatError('Tipo de línea no válido en el paquete. / Invalid linetype in package.');
    }
    if (typeof lt.id !== 'string' || !lt.id.trim()) {
      throw new LibraryFormatError('Tipo de línea sin identificador válido en el paquete. / Linetype without valid ID in package.');
    }
    if (typeof lt.name !== 'string' || !lt.name.trim()) {
      throw new LibraryFormatError(`Tipo de línea «${lt.id}» sin nombre válido en el paquete. / Linetype "${lt.id}" without valid name in package.`);
    }
    if (linetypeIds.has(lt.id)) {
      throw new LibraryFormatError(`Identificador de tipo de línea duplicado «${lt.id}» en el paquete. / Duplicate linetype ID "${lt.id}" in package.`);
    }
    if (linetypeNames.has(lt.name.toLowerCase())) {
      throw new LibraryFormatError(`Nombre de tipo de línea duplicado «${lt.name}» en el paquete. / Duplicate linetype name "${lt.name}" in package.`);
    }
    if (lt.pattern !== undefined && !Array.isArray(lt.pattern)) {
      throw new LibraryFormatError(`Patrón de tipo de línea no válido en «${lt.id}». / Invalid linetype pattern in "${lt.id}".`);
    }
    linetypeIds.add(lt.id);
    linetypeNames.add(lt.name.toLowerCase());
  }

  const layerIds = new Set<Id>();
  const layerNames = new Set<string>();
  for (const l of layers) {
    if (!l || typeof l !== 'object') {
      throw new LibraryFormatError('Capa no válida en el paquete. / Invalid layer in package.');
    }
    if (typeof l.id !== 'string' || !l.id.trim()) {
      throw new LibraryFormatError('Capa sin identificador válido en el paquete. / Layer without valid ID in package.');
    }
    if (typeof l.name !== 'string' || !l.name.trim()) {
      throw new LibraryFormatError(`Capa «${l.id}» sin nombre válido en el paquete. / Layer "${l.id}" without valid name in package.`);
    }
    if (layerIds.has(l.id)) {
      throw new LibraryFormatError(`Identificador de capa duplicado «${l.id}» en el paquete. / Duplicate layer ID "${l.id}" in package.`);
    }
    if (layerNames.has(l.name.toLowerCase())) {
      throw new LibraryFormatError(`Nombre de capa duplicado «${l.name}» en el paquete. / Duplicate layer name "${l.name}" in package.`);
    }
    if (l.linetype !== undefined && typeof l.linetype === 'string' && l.linetype.trim() && l.linetype !== 'Continuous' && l.linetype !== LT_CONTINUOUS_ID && !linetypeIds.has(l.linetype)) {
      throw new LibraryFormatError(`La capa «${l.id}» apunta a un tipo de línea inexistente: «${l.linetype}». / Layer "${l.id}" references a missing linetype: "${l.linetype}".`);
    }
    layerIds.add(l.id);
    layerNames.add(l.name.toLowerCase());
  }

  const textStyleIds = new Set<Id>();
  const textStyleNames = new Set<string>();
  for (const ts of textStyles) {
    if (!ts || typeof ts !== 'object') {
      throw new LibraryFormatError('Estilo de texto no válido en el paquete. / Invalid text style in package.');
    }
    if (typeof ts.id !== 'string' || !ts.id.trim()) {
      throw new LibraryFormatError('Estilo de texto sin identificador válido en el paquete. / Text style without valid ID in package.');
    }
    if (typeof ts.name !== 'string' || !ts.name.trim()) {
      throw new LibraryFormatError(`Estilo de texto «${ts.id}» sin nombre válido en el paquete. / Text style "${ts.id}" without valid name in package.`);
    }
    if (textStyleIds.has(ts.id)) {
      throw new LibraryFormatError(`Identificador de estilo de texto duplicado «${ts.id}» en el paquete. / Duplicate text style ID "${ts.id}" in package.`);
    }
    if (textStyleNames.has(ts.name.toLowerCase())) {
      throw new LibraryFormatError(`Nombre de estilo de texto duplicado «${ts.name}» en el paquete. / Duplicate text style name "${ts.name}" in package.`);
    }
    textStyleIds.add(ts.id);
    textStyleNames.add(ts.name.toLowerCase());
  }

  const dimStyleIds = validateStyleCollection('dimStyles', dimStyles);
  const mleaderStyleIds = validateStyleCollection('mleaderStyles', mleaderStyles);
  const tableStyleIds = validateStyleCollection('tableStyles', tableStyles);
  const mlineStyleIds = validateStyleCollection('mlineStyles', mlineStyles);
  const mleaderStylesById = new Map(mleaderStyles.map((style) => [style.id, style]));
  const assetIds = new Set<Id>();
  for (const asset of assets) {
    try {
      assertAssetRecord(asset);
    } catch (error) {
      if (error instanceof AssetValidationError) throw new LibraryFormatError(`${error.l10n.es} / ${error.l10n.en}`);
      throw error;
    }
    if (assetIds.has(asset.id)) {
      throw new LibraryFormatError(`Recurso duplicado «${asset.id}» en el paquete. / Duplicate asset "${asset.id}" in package.`);
    }
    // La biblioteca se comparte entre dibujos; una ruta local no basta para mantener el recurso.
    if (!asset.dataUrl) {
      throw new LibraryFormatError(`El recurso «${asset.name}» no tiene datos incrustados y no puede compartirse en la biblioteca. / Asset "${asset.name}" has no embedded data and cannot be shared in the library.`);
    }
    assetIds.add(asset.id);
  }
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  const textStyleRefs = new Set(textStyleIds);
  const legacyTextStyles = new Set([TEXTSTYLE_STANDARD_ID, 'Standard']);
  const linetypeRefs = new Set(linetypeIds);
  const legacyLinetypes = new Set(['Continuous', LT_CONTINUOUS_ID, 'ByLayer', 'ByBlock']);
  for (const style of dimStyles) {
    if (!textStyleRefs.has(style.textStyle) && !legacyTextStyles.has(style.textStyle)) {
      throw new LibraryFormatError(`El estilo de cota «${style.id}» apunta a un estilo de texto no incluido. / Dimension style "${style.id}" references a text style not included in the package.`);
    }
  }
  for (const style of mleaderStyles) {
    if (!textStyleRefs.has(style.textStyle) && !legacyTextStyles.has(style.textStyle)) {
      throw new LibraryFormatError(`El estilo de directriz «${style.id}» apunta a un estilo de texto no incluido. / Multileader style "${style.id}" references a text style not included in the package.`);
    }
    if (style.blockId && !blockIds.has(style.blockId)) {
      throw new LibraryFormatError(`El estilo de directriz «${style.id}» apunta a un bloque no incluido. / Multileader style "${style.id}" references a block not included in the package.`);
    }
  }
  for (const style of tableStyles) {
    if (!textStyleRefs.has(style.textStyle) && !legacyTextStyles.has(style.textStyle)) {
      throw new LibraryFormatError(`El estilo de tabla «${style.id}» apunta a un estilo de texto no incluido. / Table style "${style.id}" references a text style not included in the package.`);
    }
  }
  for (const style of mlineStyles) {
    for (const element of style.elements) {
      if (!linetypeRefs.has(element.linetype) && !legacyLinetypes.has(element.linetype)) {
        throw new LibraryFormatError(`El estilo de multilínea «${style.id}» apunta a un tipo de línea no incluido. / Mline style "${style.id}" references a linetype not included in the package.`);
      }
    }
  }

  const entityIds = new Set<Id>();
  const entitiesById = new Map<Id, Entity>();
  const blockChildren = new Map<Id, Set<Id>>();
  const blockEntitiesMap = new Map<Id, Set<Id>>();
  for (const id of blockIds) {
    blockChildren.set(id, new Set());
    blockEntitiesMap.set(id, new Set());
  }

  for (const e of entities) {
    if (!e || typeof e !== 'object') {
      throw new LibraryFormatError('Entidad no válida en el paquete. / Invalid entity in package.');
    }
    if (typeof e.id !== 'string' || !e.id.trim()) {
      throw new LibraryFormatError('Entidad sin identificador válido en el paquete. / Entity without valid ID in package.');
    }
    if (typeof e.type !== 'string' || !ENTITY_TYPES.has(e.type)) {
      throw new LibraryFormatError(`Tipo de entidad no válido «${String(e.type)}» en el paquete. / Invalid entity type "${String(e.type)}" in package.`);
    }
    if (entityIds.has(e.id)) {
      throw new LibraryFormatError(`Identificador de entidad duplicado «${e.id}» en el paquete. / Duplicate entity ID "${e.id}" in package.`);
    }
    try {
      assertEntityRecord(e);
    } catch (error) {
      if (error instanceof InputValidationError) throw new LibraryFormatError(error.message);
      throw error;
    }
    entityIds.add(e.id);
    entitiesById.set(e.id, e);

    if (typeof e.owner !== 'string' || !blockIds.has(e.owner)) {
      throw new LibraryFormatError(`La entidad «${e.id}» tiene un propietario inexistente: «${e.owner}». / Entity "${e.id}" has a missing owner: "${e.owner}".`);
    }
    blockEntitiesMap.get(e.owner)?.add(e.id);

    if (typeof e.layer !== 'string' || (e.layer !== '0' && e.layer !== LAYER0_ID && e.layer !== DEFPOINTS_LAYER_ID && !layerIds.has(e.layer))) {
      throw new LibraryFormatError(`La entidad «${e.id}» apunta a una capa inexistente: «${e.layer}». / Entity "${e.id}" references a missing layer: "${e.layer}".`);
    }

    if (e.linetype && e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock' && e.linetype !== 'Continuous' && e.linetype !== LT_CONTINUOUS_ID && !linetypeIds.has(e.linetype)) {
      throw new LibraryFormatError(`La entidad «${e.id}» apunta a un tipo de línea inexistente: «${e.linetype}». / Entity "${e.id}" references a missing linetype: "${e.linetype}".`);
    }

    // Paquetes v1 antiguos no tenían estas colecciones; solo pueden referir a los estilos integrados.
    if (e.type === 'dimension' || e.type === 'leader') {
      requireStyleReference(e.style, dimStyleIds, new Set([DIMSTYLE_ISO_ID, DIMSTYLE_STANDARD_ID, 'ds-annotative']), e.id);
      if (e.type === 'dimension' && e.overrides.textStyle) {
        requireStyleReference(e.overrides.textStyle, textStyleIds, legacyTextStyles, e.id);
      }
    } else if (e.type === 'mleader') {
      requireStyleReference(e.style, mleaderStyleIds, new Set([MLEADERSTYLE_STANDARD_ID]), e.id);
      if (e.overrides?.textStyle) requireStyleReference(e.overrides.textStyle, textStyleIds, legacyTextStyles, e.id);
      if (e.overrides?.blockId && !blockIds.has(e.overrides.blockId)) {
        throw new LibraryFormatError(`La directriz «${e.id}» apunta a un bloque de sobrescritura no incluido. / Multileader "${e.id}" references an override block not included in the package.`);
      }
    } else if (e.type === 'table') {
      requireStyleReference(e.style, tableStyleIds, new Set([TABLESTYLE_STANDARD_ID]), e.id);
    } else if (e.type === 'mline') {
      requireStyleReference(e.style, mlineStyleIds, new Set([MLINESTYLE_STANDARD_ID]), e.id);
    } else if (e.type === 'text' || e.type === 'mtext' || e.type === 'attdef') {
      requireStyleReference(e.style, textStyleIds, legacyTextStyles, e.id);
    }

    if (e.type === 'image' || e.type === 'pdfunderlay') {
      const asset = assetsById.get(e.assetId);
      if (!asset) {
        throw new LibraryFormatError(`La entidad «${e.id}» apunta a un recurso no incluido: «${e.assetId}». / Entity "${e.id}" references an asset not included in the package: "${e.assetId}".`);
      }
      if ((e.type === 'image' && !asset.mime.toLowerCase().startsWith('image/')) || (e.type === 'pdfunderlay' && asset.mime.toLowerCase() !== 'application/pdf')) {
        throw new LibraryFormatError(`La entidad «${e.id}» usa un recurso incompatible. / Entity "${e.id}" uses an incompatible asset.`);
      }
    }

    if (e.type === 'insert') {
      const insert = e as unknown as { blockId?: unknown };
      if (typeof insert.blockId !== 'string' || !blockIds.has(insert.blockId)) {
        throw new LibraryFormatError(`La inserción «${e.id}» apunta a un bloque inexistente: «${String(insert.blockId)}». / Insert "${e.id}" references a missing block: "${String(insert.blockId)}".`);
      }
      blockChildren.get(e.owner)?.add(insert.blockId);
    }

    if (e.type === 'array') {
      const arr = e as unknown as { sourceBlockId?: unknown };
      if (typeof arr.sourceBlockId !== 'string' || !blockIds.has(arr.sourceBlockId)) {
        throw new LibraryFormatError(`La matriz «${e.id}» apunta a un bloque inexistente: «${String(arr.sourceBlockId)}». / Array "${e.id}" references a missing block: "${String(arr.sourceBlockId)}".`);
      }
      blockChildren.get(e.owner)?.add(arr.sourceBlockId);
    }

    if (e.type === 'mleader') {
      const style = mleaderStylesById.get(e.style);
      const requiredBlocks = [e.content.type === 'block' ? e.content.blockId : undefined, e.overrides?.blockId, style?.blockId].filter(Boolean) as Id[];
      for (const blockId of requiredBlocks) {
        if (!blockIds.has(blockId)) {
          throw new LibraryFormatError(`La directriz «${e.id}» apunta a un bloque inexistente: «${blockId}». / Multileader "${e.id}" references a missing block: "${blockId}".`);
        }
        blockChildren.get(e.owner)?.add(blockId);
      }
    }
  }

  // Todas las referencias asociativas deben quedar dentro de su bloque y sobrevivir al remapeo.
  for (const e of entities) {
    const refs = e.type === 'dimension'
      ? (e.assoc ?? []).map((ref) => ref.entityId)
      : e.type === 'hatch'
        ? (e.associative ?? [])
        : e.type === 'leader' && e.annotation
          ? [e.annotation]
          : [];
    for (const ref of refs) {
      if (entitiesById.get(ref)?.owner !== e.owner) {
        throw new LibraryFormatError(`La entidad «${e.id}» apunta a una referencia asociativa no incluida en su bloque: «${ref}». / Entity "${e.id}" references an associative target not included in its block: "${ref}".`);
      }
    }
  }

  // Comprobar ciclos de inserción entre bloques
  for (const id of blockIds) {
    const visited = new Set<Id>();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = blockChildren.get(current);
      if (children) {
        for (const child of children) {
          if (child === id) {
            throw new LibraryFormatError(`Referencia circular de bloques detectada en «${id}». / Circular block reference detected in "${id}".`);
          }
          if (!visited.has(child)) {
            visited.add(child);
            stack.push(child);
          }
        }
      }
    }
  }

  for (const b of blocks) {
    if (b.dynamic) {
      const ownEntities = blockEntitiesMap.get(b.id) ?? new Set();
      validateDynamicBlockDefinition(b.dynamic, ownEntities);
    }
  }
}

/** Valida metadatos, límites y paquete de un LibraryBlock. */
export function validateLibraryBlock(value: unknown): asserts value is LibraryBlock {
  if (!value || typeof value !== 'object') {
    throw new LibraryFormatError('El bloque de biblioteca no es un objeto válido. / Library block is not a valid object.');
  }
  const block = value as Record<string, unknown>;

  if (typeof block.id !== 'string' || !block.id.trim() || !SAFE_ID_PATTERN.test(block.id)) {
    throw new LibraryFormatError(`Identificador de bloque no válido: «${String(block.id)}». / Invalid block ID: "${String(block.id)}".`);
  }
  if (typeof block.name !== 'string' || !block.name.trim() || block.name.length > 255) {
    throw new LibraryFormatError(`Nombre de bloque no válido: «${block.id}». / Invalid block name: "${block.id}".`);
  }
  if (typeof block.categoryId !== 'string' || !block.categoryId.trim() || !SAFE_ID_PATTERN.test(block.categoryId)) {
    throw new LibraryFormatError(`Categoría no válida en el bloque «${block.id}». / Invalid category in block "${block.id}".`);
  }
  if (!Array.isArray(block.tags) || block.tags.some((t) => typeof t !== 'string')) {
    throw new LibraryFormatError(`Etiquetas no válidas en el bloque «${block.id}». / Invalid tags in block "${block.id}".`);
  }
  if (block.tags.length > 100) {
    throw new LibraryFormatError(`Demasiadas etiquetas en el bloque «${block.id}». / Too many tags in block "${block.id}".`);
  }
  if (typeof block.dynamic !== 'boolean') {
    throw new LibraryFormatError(`Propiedad dynamic no válida en el bloque «${block.id}». / Invalid dynamic flag in block "${block.id}".`);
  }
  if (typeof block.savedAt !== 'number' || !Number.isFinite(block.savedAt) || block.savedAt < 0) {
    throw new LibraryFormatError(`Fecha de guardado no válida en el bloque «${block.id}». / Invalid savedAt in block "${block.id}".`);
  }
  if (block.description !== undefined && (typeof block.description !== 'string' || block.description.length > 10_000)) {
    throw new LibraryFormatError(`Descripción no válida en el bloque «${block.id}». / Invalid description in block "${block.id}".`);
  }
  if (block.thumbnail !== undefined) {
    validateThumbnail(block.thumbnail, block.id as string);
  }
  if (block.source !== undefined) {
    if (!block.source || typeof block.source !== 'object') {
      throw new LibraryFormatError(`Origen no válido en el bloque «${block.id}». / Invalid source in block "${block.id}".`);
    }
    const src = block.source as Record<string, unknown>;
    if (typeof src.kind !== 'string' || !VALID_SOURCE_KINDS.has(src.kind)) {
      throw new LibraryFormatError(`Tipo de origen no válido «${String(src.kind)}» en el bloque «${block.id}». / Invalid source kind "${String(src.kind)}" in block "${block.id}".`);
    }
    if (src.file !== undefined && typeof src.file !== 'string') {
      throw new LibraryFormatError(`Archivo de origen no válido en el bloque «${block.id}». / Invalid source file in block "${block.id}".`);
    }
    if (src.importedAt !== undefined && (typeof src.importedAt !== 'number' || !Number.isFinite(src.importedAt) || src.importedAt < 0)) {
      throw new LibraryFormatError(`Fecha de importación no válida en el bloque «${block.id}». / Invalid importedAt in block "${block.id}".`);
    }
  }

  validateBlockPackage(block.package);
}

export function isLibraryBlock(value: unknown): value is LibraryBlock {
  try {
    validateLibraryBlock(value);
    return true;
  } catch {
    return false;
  }
}

export function writeLibraryArchive(a: LibraryArchive): Uint8Array {
  validateLibraryCategories(a.categories);
  if (a.blocks.length + 1 > INPUT_LIMITS.maxZipEntries) {
    throw new LibraryFormatError('La biblioteca es demasiado grande. / Library is too large.');
  }
  const seenIds = new Set<string>();
  for (const b of a.blocks) {
    if (seenIds.has(b.id)) {
      throw new LibraryFormatError(`Identificador de bloque duplicado en la biblioteca: «${b.id}». / Duplicate block ID in library: "${b.id}".`);
    }
    seenIds.add(b.id);
    validateLibraryBlock(b);
  }

  const manifest: Manifest = {
    format: FORMAT,
    version: VERSION,
    categories: a.categories,
    blocks: a.blocks.map((b) => ({ id: b.id, name: b.name, file: `blocks/${b.id}.json` })),
  };
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 1)) };
  for (const b of a.blocks) files[`blocks/${b.id}.json`] = strToU8(JSON.stringify(b));
  assertZipOutputEntries(files, 'biblioteca');
  const bytes = zipSync(files, { level: 6 });
  assertZipLimits(bytes, 'biblioteca');
  return bytes;
}

export function readLibraryArchive(bytes: Uint8Array): LibraryArchive {
  assertInputBytes(bytes, 'biblioteca');
  assertZipLimits(bytes, 'biblioteca');

  let files: Record<string, Uint8Array>;
  let manifest: Manifest;
  try {
    files = unzipSync(bytes);
    if (!files['manifest.json']) {
      throw new Error('Missing manifest.json');
    }
    manifest = JSON.parse(strFromU8(files['manifest.json'])) as Manifest;
  } catch {
    throw new LibraryFormatError('El archivo no es una biblioteca de FModel (.fmodellib). / Not an FModel library (.fmodellib).');
  }

  if (
    !manifest ||
    typeof manifest !== 'object' ||
    manifest.format !== FORMAT ||
    !Number.isInteger(manifest.version) ||
    manifest.version < 1 ||
    !Array.isArray(manifest.categories) ||
    !Array.isArray(manifest.blocks)
  ) {
    throw new LibraryFormatError('El archivo no es una biblioteca de FModel (.fmodellib). / Not an FModel library (.fmodellib).');
  }
  if (manifest.version > VERSION) {
    throw new LibraryFormatError(`Biblioteca de una versión posterior (${manifest.version}); actualiza FModel. / Library from a newer version; update FModel.`);
  }
  if (manifest.blocks.length > INPUT_LIMITS.maxBlocks) {
    throw new LibraryFormatError('La biblioteca contiene demasiados bloques. / Library contains too many blocks.');
  }

  // 1. Validar categorías del manifiesto
  validateLibraryCategories(manifest.categories);

  // 2. Validar entradas del manifiesto
  const manifestBlockIds = new Set<string>();
  const manifestBlockFiles = new Set<string>();

  for (const entry of manifest.blocks) {
    if (!entry || typeof entry !== 'object') {
      throw new LibraryFormatError('El índice de la biblioteca no es válido. / The library index is invalid.');
    }
    if (typeof entry.id !== 'string' || !entry.id.trim() || !SAFE_ID_PATTERN.test(entry.id)) {
      throw new LibraryFormatError(`Identificador de bloque no válido en el manifiesto: «${String(entry.id)}». / Invalid block ID in manifest: "${String(entry.id)}".`);
    }
    if (entry.name !== undefined && (typeof entry.name !== 'string' || !entry.name.trim())) {
      throw new LibraryFormatError(`Nombre de bloque no válido en el manifiesto: «${entry.id}». / Invalid block name in manifest: "${entry.id}".`);
    }
    if (typeof entry.file !== 'string' || !entry.file.trim()) {
      throw new LibraryFormatError(`Ruta de archivo no válida en el manifiesto: «${entry.id}». / Invalid file path in manifest: "${entry.id}".`);
    }
    if (manifestBlockIds.has(entry.id)) {
      throw new LibraryFormatError(`Identificador de bloque duplicado en el manifiesto: «${entry.id}». / Duplicate block ID in manifest: "${entry.id}".`);
    }
    manifestBlockIds.add(entry.id);

    if (manifestBlockFiles.has(entry.file)) {
      throw new LibraryFormatError(`Ruta de archivo duplicada en el manifiesto: «${entry.file}». / Duplicate file path in manifest: "${entry.file}".`);
    }
    manifestBlockFiles.add(entry.file);
  }

  for (const entry of manifest.blocks) {
    if (entry.file !== `blocks/${entry.id}.json`) {
      throw new LibraryFormatError(`Ruta de bloque no válida en el manifiesto: «${entry.file}». / Invalid block file path in manifest: "${entry.file}".`);
    }
  }

  // 3. Validar y parsear cada bloque
  const blocks: LibraryBlock[] = manifest.blocks.map((entry) => {
    const raw = files[entry.file];
    if (!raw) {
      throw new LibraryFormatError(`Falta ${entry.file} en la biblioteca. / Missing ${entry.file} in the library.`);
    }
    let block: unknown;
    try {
      block = JSON.parse(strFromU8(raw));
    } catch {
      throw new LibraryFormatError(`JSON de bloque dañado: ${entry.file}. / Corrupted block JSON: ${entry.file}.`);
    }

    validateLibraryBlock(block);

    if (block.id !== entry.id) {
      throw new LibraryFormatError(`El identificador del bloque «${block.id}» no coincide con el manifiesto («${entry.id}»). / Block ID "${block.id}" does not match manifest ("${entry.id}").`);
    }
    if (entry.name !== undefined && block.name !== entry.name) {
      throw new LibraryFormatError(`El nombre del bloque «${block.name}» no coincide con el manifiesto («${entry.name}»). / Block name "${block.name}" does not match manifest ("${entry.name}").`);
    }

    return block;
  });

  return { categories: manifest.categories, blocks };
}
