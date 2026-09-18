import { newId } from '../document/ids';

/** Categoría de la biblioteca de bloques: dos niveles como máximo. */
export interface LibraryCategory {
  id: string;
  name: string;
  parent?: string;
  order: number;
}

export const UNCLASSIFIED = 'cat-sin-clasificar';

const C = (id: string, name: string, order: number, parent?: string): LibraryCategory => (parent ? { id, name, parent, order } : { id, name, order });

/** Base inicial (editable). Los IDs son estables para que la sugerencia por palabras clave funcione. */
export const DEFAULT_CATEGORIES: LibraryCategory[] = [
  C('cat-arq', 'Arquitectura', 0),
  C('cat-arq-puertas', 'Puertas', 0, 'cat-arq'),
  C('cat-arq-ventanas', 'Ventanas', 1, 'cat-arq'),
  C('cat-arq-escaleras', 'Escaleras', 2, 'cat-arq'),
  C('cat-mob', 'Mobiliario', 1),
  C('cat-mob-oficina', 'Oficina', 0, 'cat-mob'),
  C('cat-mob-cocina', 'Cocina', 1, 'cat-mob'),
  C('cat-mob-bano', 'Baño', 2, 'cat-mob'),
  C('cat-mob-dormitorio', 'Dormitorio', 3, 'cat-mob'),
  C('cat-mob-salon', 'Salón y comedor', 4, 'cat-mob'),
  C('cat-est', 'Estructura', 2),
  C('cat-est-perfiles', 'Perfiles', 0, 'cat-est'),
  C('cat-est-anclajes', 'Anclajes', 1, 'cat-est'),
  C('cat-ins', 'Instalaciones', 3),
  C('cat-ins-electricas', 'Eléctricas', 0, 'cat-ins'),
  C('cat-ins-sanitarias', 'Sanitarias', 1, 'cat-ins'),
  C('cat-ins-clima', 'Climatización', 2, 'cat-ins'),
  C('cat-urbanismo', 'Urbanismo', 4),
  C('cat-vehiculos', 'Vehículos', 5),
  C('cat-personas', 'Personas', 6),
  C('cat-ano', 'Anotación', 7),
  C('cat-ano-cajetines', 'Cajetines', 0, 'cat-ano'),
  C('cat-ano-simbolos', 'Símbolos', 1, 'cat-ano'),
  C(UNCLASSIFIED, 'Sin clasificar', 99),
];

/** Palabras clave (sin acentos, en minúsculas) por categoría, en orden de prioridad. */
const KEYWORDS: [string, RegExp][] = [
  ['cat-ano-cajetines', /cajetin|title ?block|rotulo|membrete/],
  ['cat-arq-puertas', /puert|door|porton|\bgate\b/],
  ['cat-arq-ventanas', /ventan|window|vidrier/],
  ['cat-arq-escaleras', /escaler|stair|rampa|\bramp\b/],
  ['cat-mob-bano', /\bbano|bath|\bwc\b|inodoro|toilet|lavabo|lavamanos|ducha|shower|banera|\btina\b|urinal|bidet/],
  ['cat-mob-cocina', /cocin|kitchen|nevera|fridge|frigor|horno|\boven|fregadero|estufa|stove/],
  ['cat-mob-dormitorio', /\bcama|\bbed\b|dormitorio|bedroom|armario|wardrobe|closet|ropero/],
  ['cat-mob-salon', /\bsofa|sillon|butaca|couch|televis|\btv\b|mesa de centro|coffee table|comedor|dining|tumbona|lounger/],
  ['cat-mob-oficina', /escritorio|\bdesk|silla|chair|oficina|office|archivador|sillon|\bmesa|\btable\b/],
  ['cat-est-perfiles', /perfil|profile|\b(ipe|hea|heb|upn|ipn)\b|\bviga|\bbeam|column|pilar/],
  ['cat-est-anclajes', /anclaj|anchor|placa base|base plate|perno|\bbolt|tornillo/],
  ['cat-ins-electricas', /enchuf|\btoma|socket|outlet|interruptor|switch|lumin|light|lampar|electr|cuadro electrico/],
  ['cat-ins-sanitarias', /tuber|\bpipe|desag|drain|valvul|valve|sanitar|plumb|fontaner/],
  ['cat-ins-clima', /clima|hvac|aire acond|\bsplit\b|difusor|diffuser|rejilla|grille|ventil|\bfan\b|conduct|\bduct/],
  ['cat-urbanismo', /arbol|\btree|arbust|shrub|farola|streetlight|\bbanco\b|bench|jardin|garden|bordillo|\bcurb/],
  ['cat-vehiculos', /coche|\bcar\b|\bauto\b|vehic|camion|truck|\bbus\b|\bmoto|bicicl|\bbike/],
  ['cat-personas', /persona|people|person|human|hombre|mujer|\bman\b|woman|nino|child/],
  ['cat-ano-simbolos', /simbolo|symbol|\bnorte\b|\bnorth\b|flecha|arrow|\bnivel\b|\blevel\b|marca de corte|section mark/],
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function suggestCategory(text: string, cats: LibraryCategory[]): string {
  const t = fold(text);
  const exists = new Set(cats.map((c) => c.id));
  for (const [id, re] of KEYWORDS) if (exists.has(id) && re.test(t)) return id;
  return UNCLASSIFIED;
}

export function categoryPath(cats: LibraryCategory[], id: string | undefined): string {
  const c = cats.find((x) => x.id === id);
  if (!c) return 'Sin clasificar';
  const p = c.parent ? cats.find((x) => x.id === c.parent) : undefined;
  return p ? `${p.name} › ${c.name}` : c.name;
}

const byOrder = (a: LibraryCategory, b: LibraryCategory) => a.order - b.order || a.name.localeCompare(b.name);

export function categoryTree(cats: LibraryCategory[]): { cat: LibraryCategory; children: LibraryCategory[] }[] {
  return cats
    .filter((c) => !c.parent)
    .sort(byOrder)
    .map((cat) => ({ cat, children: cats.filter((c) => c.parent === cat.id).sort(byOrder) }));
}

export function descendantIds(cats: LibraryCategory[], id: string): Set<string> {
  return new Set([id, ...cats.filter((c) => c.parent === id).map((c) => c.id)]);
}

/** Fusiona categorías entrantes con las existentes por ruta de nombre (sin distinguir mayúsculas). */
export function mergeCategories(existing: LibraryCategory[], incoming: LibraryCategory[]): { categories: LibraryCategory[]; idMap: Map<string, string> } {
  const categories = existing.map((c) => ({ ...c }));
  const idMap = new Map<string, string>();
  const key = (name: string, parent?: string) => `${parent ?? ''}|${fold(name)}`;
  const index = new Map(categories.map((c) => [key(c.name, c.parent), c.id]));
  const roots = incoming.filter((c) => !c.parent || !incoming.some((p) => p.id === c.parent));
  const children = incoming.filter((c) => !roots.includes(c));
  for (const c of [...roots, ...children]) {
    const parent = c.parent && roots.includes(c) ? undefined : c.parent ? idMap.get(c.parent) : undefined;
    const k = key(c.name, parent);
    let id = index.get(k);
    if (!id) {
      id = newId('cat');
      const order = categories.filter((x) => x.parent === parent).length;
      categories.push(parent ? { id, name: c.name, parent, order } : { id, name: c.name, order });
      index.set(k, id);
    }
    idMap.set(c.id, id);
  }
  return { categories, idMap };
}
