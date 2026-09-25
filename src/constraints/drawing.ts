import type { CadDocument, Transaction } from '../document/document';
import { newId } from '../document/ids';
import { MODEL_SPACE_ID } from '../document/types';
import type { DimConstraint, DocumentData, DrawingConstraint, DrawingParameter, Entity, GeoConstraintType, GeoRef, Id, LwPolylineEntity, ParameterSet } from '../document/types';
import type { ChangeRecord } from '../history/history';
import { linearTol } from '../geometry/tolerance';
import { dependencies, evaluate, ExprError, parseExpr, renameVariable } from '../lib/expr';
import type { FreedomState } from './solver';
import { analyzeFreedom, anchorKeys, constraintRank, entityVarPaths, isConstrainable, measureConstraint, refPoint, refResolvable, refSegment, solveConstraints } from './solver';

/**
 * Diseño paramétrico del dibujo: restricciones geométricas y dimensionales entre
 * entidades de un mismo espacio, parámetros de usuario con fórmulas y variantes.
 *
 * El documento guarda solo las relaciones; la geometría resuelta vive en las propias
 * entidades. Un reactor transaccional mantiene ambas coherentes dentro de la misma
 * transacción que las edita, de modo que deshacer devuelve todo a la vez.
 */

type L10n = { es: string; en: string };

export class ConstraintError extends Error {
  constructor(readonly l10n: L10n) {
    super(`${l10n.es} / ${l10n.en}`);
  }
}

const fail = (es: string, en: string): never => {
  throw new ConstraintError({ es, en });
};

export const MAX_EXPRESSION_LENGTH = 500;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validParameterName(name: string): boolean {
  return name.length <= 64 && NAME_RE.test(name) && !['pi', 'e'].includes(name.toLowerCase());
}

export function isSpaceOwner(data: DocumentData, owner: Id): boolean {
  return owner === MODEL_SPACE_ID || data.layouts.has(owner);
}

const POSITIVE_DIMS = new Set(['linear-h', 'linear-v', 'aligned', 'radius', 'diameter']);

// ------------------------------------------------------------------ parámetros y fórmulas

export interface NamedExpression {
  name: string;
  expression: string;
  kind: 'parameter' | 'constraint';
  id: Id;
}

/** Parámetros de usuario y cotas de restricción, que comparten espacio de nombres. */
export function namedExpressions(data: DocumentData): NamedExpression[] {
  const out: NamedExpression[] = [];
  for (const p of data.parameters.values()) out.push({ name: p.name, expression: p.expression, kind: 'parameter', id: p.id });
  for (const c of data.constraints.values()) if (c.kind === 'dimensional') out.push({ name: c.name, expression: c.expression, kind: 'constraint', id: c.id });
  return out;
}

export function usedNames(data: DocumentData): Set<string> {
  return new Set(namedExpressions(data).map((n) => n.name));
}

export function nextParameterName(data: DocumentData, prefix: string): string {
  const used = new Set([...usedNames(data)].map((n) => n.toLowerCase()));
  let i = 1;
  while (used.has(`${prefix}${i}`.toLowerCase())) i++;
  return `${prefix}${i}`;
}

export interface ParameterScope {
  /** nombre → valor (grados en las cotas angulares) */
  values: Map<string, number>;
  errors: Map<string, L10n>;
}

/**
 * Evalúa todas las fórmulas del dibujo en orden de dependencias. Un ciclo, una variable
 * desconocida o un valor no representable quedan como error del nombre afectado; nunca
 * se propaga NaN a la geometría.
 */
export function parameterScope(data: DocumentData, overrides?: ReadonlyMap<string, string>): ParameterScope {
  const named = namedExpressions(data);
  const exprs = new Map<string, string>(named.map((n) => [n.name, overrides?.get(n.name) ?? n.expression]));
  const dimType = new Map<string, string>();
  for (const c of data.constraints.values()) if (c.kind === 'dimensional') dimType.set(c.name, c.type);
  const values = new Map<string, number>();
  const errors = new Map<string, L10n>();
  const deps = new Map<string, string[]>();
  for (const [name, ex] of exprs) {
    if (ex.length > MAX_EXPRESSION_LENGTH) {
      errors.set(name, { es: 'La fórmula es demasiado larga.', en: 'The formula is too long.' });
      continue;
    }
    try {
      parseExpr(ex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.set(name, { es: `Fórmula no válida: ${msg}`, en: `Invalid formula: ${msg}` });
      continue;
    }
    deps.set(name, dependencies(ex).filter((d) => exprs.has(d)));
  }
  // Kahn: lo que queda sin ordenar está en un ciclo o depende de uno
  const pending = new Map([...deps].map(([n, d]) => [n, new Set(d)]));
  const ready = [...pending].filter(([, d]) => !d.size).map(([n]) => n);
  const order: string[] = [];
  while (ready.length) {
    const n = ready.shift()!;
    order.push(n);
    pending.delete(n);
    for (const [m, d] of pending) if (d.delete(n) && !d.size) ready.push(m);
  }
  for (const n of pending.keys()) errors.set(n, { es: 'Dependencia circular entre fórmulas.', en: 'Circular dependency between formulas.' });
  for (const name of order) {
    try {
      const v = evaluate(exprs.get(name)!, (id) => (values.has(id) ? values.get(id) : undefined));
      if (!Number.isFinite(v)) fail('El resultado no es un número finito.', 'The result is not a finite number.');
      if (POSITIVE_DIMS.has(dimType.get(name) ?? '') && !(v > 0)) fail('La medida debe ser mayor que cero.', 'The measure must be greater than zero.');
      values.set(name, v);
    } catch (err) {
      if (err instanceof ConstraintError) errors.set(name, err.l10n);
      else {
        const msg = err instanceof ExprError || err instanceof Error ? err.message : String(err);
        errors.set(name, { es: `No se puede evaluar: ${msg}`, en: `Cannot evaluate: ${msg}` });
      }
    }
  }
  return { values, errors };
}

/** Valores objetivo del solver (radianes en las angulares) de las cotas evaluables. */
function dimTargets(constraints: Iterable<DrawingConstraint>, scope: ParameterScope): Record<Id, number> {
  const out: Record<Id, number> = {};
  for (const c of constraints) {
    if (c.kind !== 'dimensional') continue;
    const v = scope.values.get(c.name);
    if (v === undefined) continue;
    out[c.id] = c.type === 'angular' ? (v * Math.PI) / 180 : v;
  }
  return out;
}

// ------------------------------------------------------------------ validez de referencias

type RefKind = 'point' | 'segment' | 'curve' | 'centered' | 'any';

function refIs(e: Entity, part: string, kind: RefKind): boolean {
  switch (kind) {
    case 'point':
      return refPoint(e, part) !== null;
    case 'segment':
      return refSegment(e, part) !== null;
    case 'curve':
      return e.type === 'circle' || e.type === 'arc';
    case 'centered':
      return e.type === 'circle' || e.type === 'arc' || e.type === 'ellipse';
    case 'any':
      return part === 'edge' ? isConstrainable(e) : refResolvable(e, part);
  }
}

/** Combinaciones de referencias admitidas por cada tipo de restricción. */
const SIGNATURES: Record<string, RefKind[][]> = {
  horizontal: [['segment'], ['point', 'point']],
  vertical: [['segment'], ['point', 'point']],
  parallel: [['segment', 'segment']],
  perpendicular: [['segment', 'segment']],
  collinear: [['segment', 'segment']],
  coincident: [['point', 'point']],
  tangent: [['segment', 'curve'], ['curve', 'curve']],
  concentric: [['centered', 'centered']],
  equal: [['curve', 'curve'], ['segment', 'segment']],
  symmetric: [['point', 'point', 'segment']],
  fixed: [['any']],
  'linear-h': [['segment'], ['point', 'point']],
  'linear-v': [['segment'], ['point', 'point']],
  aligned: [['segment'], ['point', 'point']],
  angular: [['segment', 'segment']],
  radius: [['curve']],
  diameter: [['curve']],
};

/** Motivo por el que una restricción no es válida en el dibujo, o null si lo es. */
export function constraintProblem(data: DocumentData, c: DrawingConstraint, entities?: ReadonlyMap<Id, Entity>): L10n | null {
  if (!isSpaceOwner(data, c.owner)) return { es: 'La restricción no pertenece a un espacio del dibujo.', en: 'The constraint does not belong to a drawing space.' };
  const ents: Entity[] = [];
  for (const r of c.refs) {
    const e = entities?.get(r.entityId) ?? data.entities.get(r.entityId);
    if (!e) return { es: 'La restricción apunta a un objeto inexistente.', en: 'The constraint references a missing object.' };
    if (e.owner !== c.owner) return { es: 'Los objetos restringidos deben estar en el mismo espacio.', en: 'Constrained objects must be in the same space.' };
    if (!isConstrainable(e)) return { es: 'Ese tipo de objeto no admite restricciones.', en: 'That object type does not support constraints.' };
    ents.push(e);
  }
  const options = SIGNATURES[c.type];
  const fits = options?.some((sig) => sig.length === c.refs.length && sig.every((k, i) => refIs(ents[i], c.refs[i].part, k)));
  if (!fits) return { es: 'Esos objetos no admiten esta restricción.', en: 'Those objects do not support this constraint.' };
  const keys = c.refs.map((r) => `${r.entityId}|${r.part}`);
  if (new Set(keys).size !== keys.length) return { es: 'Designa características distintas.', en: 'Pick different features.' };
  if (c.kind === 'dimensional' && !validParameterName(c.name)) return { es: 'El nombre de la cota no es válido.', en: 'The dimension name is not valid.' };
  return null;
}

/** Firma para detectar restricciones duplicadas. */
function signatureOf(c: { type: string; refs: GeoRef[] }): string {
  return `${c.type}|${c.refs.map((r) => `${r.entityId}:${r.part}`).sort().join(',')}`;
}

function constraintsByEntity(constraints: Iterable<DrawingConstraint>): Map<Id, DrawingConstraint[]> {
  const out = new Map<Id, DrawingConstraint[]>();
  for (const c of constraints) {
    for (const id of new Set(c.refs.map((r) => r.entityId))) {
      let list = out.get(id);
      if (!list) out.set(id, (list = []));
      list.push(c);
    }
  }
  return out;
}

// ------------------------------------------------------------------ resolución

export interface DrawingSolveOptions {
  /** entidades cuyos grupos de restricciones se resuelven (todas si se omite) */
  seeds?: Iterable<Id>;
  previous?: ReadonlyMap<Id, Entity>;
  prefer?: ReadonlySet<Id>;
  preferKeys?: ReadonlySet<string>;
  /** restricciones que aún no están en el documento (al añadirlas) */
  extra?: readonly DrawingConstraint[];
  /** geometría sustituta (previsualización) */
  entities?: ReadonlyMap<Id, Entity>;
  scope?: ParameterScope;
}

export interface DrawingSolveResult {
  /** entidades que cambian */
  updates: Map<Id, Entity>;
  /** restricciones sin satisfacer (o con fórmula errónea) */
  conflicts: Id[];
  consistent: boolean;
}

function componentOf(all: readonly DrawingConstraint[], seeds: Iterable<Id>): DrawingConstraint[] {
  const byEntity = constraintsByEntity(all);
  const seen = new Set<Id>();
  const picked = new Set<DrawingConstraint>();
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const c of byEntity.get(id) ?? []) {
      if (picked.has(c)) continue;
      picked.add(c);
      for (const r of c.refs) if (!seen.has(r.entityId)) stack.push(r.entityId);
    }
  }
  // en orden de creación: la primera cota creada tiene prioridad al anclar
  return all.filter((c) => picked.has(c));
}

function finiteEntity(e: Entity): boolean {
  for (const p of entityVarPaths(e)) {
    let cur: unknown = e;
    for (const k of p.split('.')) cur = (cur as Record<string, unknown>)?.[k];
    if (typeof cur !== 'number' || !Number.isFinite(cur)) return false;
  }
  if ((e.type === 'circle' || e.type === 'arc') && !(e.radius > linearTol(Math.abs(e.center.x) + Math.abs(e.center.y)))) return false;
  return true;
}

/**
 * Resuelve las restricciones del dibujo sin modificarlo. Solo devuelve cambios de grupos
 * satisfechos por completo: un grupo imposible conserva su geometría y se marca en conflicto.
 */
export function solveDrawing(data: DocumentData, opts: DrawingSolveOptions = {}): DrawingSolveResult {
  const all = [...data.constraints.values(), ...(opts.extra ?? [])];
  const selected = opts.seeds ? componentOf(all, opts.seeds) : all;
  const updates = new Map<Id, Entity>();
  if (!selected.length) return { updates, conflicts: [], consistent: true };
  const get = (id: Id) => opts.entities?.get(id) ?? data.entities.get(id);
  const ids = new Set(selected.flatMap((c) => c.refs.map((r) => r.entityId)));
  const entities: Entity[] = [];
  for (const id of ids) {
    const e = get(id);
    if (e) entities.push(e);
  }
  const scope = opts.scope ?? parameterScope(data);
  const targets = dimTargets(selected, scope);
  const broken = selected.filter((c) => c.kind === 'dimensional' && !(c.id in targets)).map((c) => c.id);
  const byId = new Map(entities.map((e) => [e.id, e]));
  // cotas cuyo valor cambió: se ancla su primer punto (prioridad por orden de creación)
  const preferKeyGroups: Set<string>[] = [];
  for (const c of selected) {
    if (c.kind !== 'dimensional' || !(c.id in targets)) continue;
    const measured = measureConstraint(c, byId);
    const want = c.type === 'angular' ? (targets[c.id] * 180) / Math.PI : targets[c.id];
    if (measured === null || Math.abs(measured - want) > 1e-9 * Math.max(1, Math.abs(want))) preferKeyGroups.push(new Set(anchorKeys(c, byId)));
  }
  const res = solveConstraints(entities, selected, targets, { previous: opts.previous, prefer: opts.prefer, preferKeys: opts.preferKeys, preferKeyGroups, onlyConsistent: true, skipAccepted: true });
  let consistent = res.status !== 'inconsistent';
  for (const [id, e] of res.entities) if (e !== byId.get(id)) updates.set(id, e);
  if ([...updates.values()].some((e) => !finiteEntity(e))) {
    updates.clear();
    consistent = false;
  }
  return { updates, conflicts: [...new Set([...res.conflicts, ...broken])], consistent: consistent && !broken.length };
}

/** Si una polilínea cambió de número de vértices, ¿sigue significando lo mismo la referencia? */
function polylineRefSurvives(before: LwPolylineEntity, after: LwPolylineEntity, part: string): boolean {
  if (before.vertices.length === after.vertices.length && before.closed === after.closed) return true;
  const n = Math.min(before.vertices.length, after.vertices.length);
  for (let i = 0; i < n; i++) {
    const a = before.vertices[i];
    const b = after.vertices[i];
    if (Math.abs(a.x - b.x) > linearTol(a.x) || Math.abs(a.y - b.y) > linearTol(a.y)) return false;
  }
  if (part === 'end') return false;
  const seg = /^segment:(\d+)$/.exec(part);
  if (seg) return before.closed === after.closed && Number(seg[1]) < n - 1;
  const vert = /^vertex:(\d+)$/.exec(part);
  if (vert) return Number(vert[1]) < n;
  return true;
}

export interface DrawingConstraintOptions {
  /** inferir restricciones al dibujar (preferencia del usuario) */
  infer?: () => boolean;
}

/**
 * Reactor de restricciones: cuando cambia geometría restringida, un parámetro o una
 * restricción, resuelve los grupos afectados dentro de la misma transacción; cuando un
 * objeto desaparece o cambia de espacio, retira las restricciones que lo usaban.
 */
export function installDrawingConstraints(doc: CadDocument, opts: DrawingConstraintOptions = {}): () => void {
  return doc.addReactor((tx, changes) => react(doc, tx, changes, opts));
}

function react(doc: CadDocument, tx: Transaction, changes: ChangeRecord[], opts: DrawingConstraintOptions) {
  const data = doc.data;
  const inferOn = !!opts.infer?.();
  if (!data.constraints.size && !inferOn) return;
  const entityChanges: ChangeRecord[] = [];
  const touched: Id[] = [];
  let exprDirty = false;
  for (const c of changes) {
    if (c.coll === 'entities') entityChanges.push(c);
    else if (c.coll === 'parameters') exprDirty = true;
    else if (c.coll === 'constraints') {
      touched.push(c.id);
      if (((c.after ?? c.before) as DrawingConstraint | undefined)?.kind === 'dimensional') exprDirty = true;
    }
  }
  if (!entityChanges.length && !touched.length && !exprDirty) return;

  if (data.constraints.size) {
    // 1. restricciones que dejaron de tener sentido
    const byEntity = constraintsByEntity(data.constraints.values());
    const remove = new Set<Id>();
    for (const ch of entityChanges) {
      const list = byEntity.get(ch.id);
      if (!list) continue;
      const before = ch.before as Entity | undefined;
      const after = ch.after as Entity | undefined;
      for (const c of list) {
        if (!after || after.owner !== c.owner || (before && before.type !== after.type)) remove.add(c.id);
        else if (before?.type === 'lwpolyline' && after.type === 'lwpolyline' && c.refs.some((r) => r.entityId === ch.id && !polylineRefSurvives(before, after, r.part))) remove.add(c.id);
        else if (constraintProblem(data, c)) remove.add(c.id);
      }
    }
    for (const id of touched) {
      const c = data.constraints.get(id);
      if (c && constraintProblem(data, c)) remove.add(id);
    }
    for (const id of remove) tx.remove('constraints', id);

    // 2. resolver los grupos afectados
    const seeds = new Set<Id>();
    const previous = new Map<Id, Entity>();
    for (const ch of entityChanges) {
      if (!ch.after || !byEntity.has(ch.id)) continue;
      seeds.add(ch.id);
      if (ch.before) previous.set(ch.id, ch.before as Entity);
    }
    for (const id of touched) for (const r of data.constraints.get(id)?.refs ?? []) seeds.add(r.entityId);
    if (exprDirty) for (const c of data.constraints.values()) if (c.kind === 'dimensional') for (const r of c.refs) seeds.add(r.entityId);
    if (seeds.size && data.constraints.size) {
      const res = solveDrawing(data, { seeds, previous });
      for (const e of res.updates.values()) tx.put('entities', e);
    }
  }

  // 3. inferencia al dibujar
  if (inferOn) {
    const focus: Id[] = [];
    for (const ch of entityChanges) {
      const after = ch.after as Entity | undefined;
      const before = ch.before as Entity | undefined;
      if (!after || !isSpaceOwner(data, after.owner) || !isConstrainable(after)) continue;
      if (!before || (before.type === 'lwpolyline' && after.type === 'lwpolyline' && after.vertices.length > before.vertices.length)) focus.push(ch.id);
    }
    if (focus.length && focus.length <= 20) {
      for (const c of inferConstraints(data, focus, { distTol: 0, angleTol: 0 })) tx.add('constraints', c);
    }
  }
}

// ------------------------------------------------------------------ alta de restricciones

export interface ConstraintPlan {
  updates: Map<Id, Entity>;
}

/**
 * Comprueba una restricción nueva y calcula cómo se adapta la geometría. Rechaza duplicadas,
 * redundantes (ya implicadas por las existentes) e imposibles, sin tocar el documento.
 * `prefer`: objetos que deben moverse lo menos posible (el primero designado).
 */
export function planConstraint(data: DocumentData, c: DrawingConstraint, prefer?: ReadonlySet<Id>, scope?: ParameterScope): ConstraintPlan {
  const problem = constraintProblem(data, c);
  if (problem) throw new ConstraintError(problem);
  const sig = signatureOf(c);
  for (const other of data.constraints.values()) if (other.owner === c.owner && signatureOf(other) === sig) fail('Esa restricción ya existe.', 'That constraint already exists.');
  if (c.kind === 'dimensional' && usedNames(data).has(c.name)) fail(`El nombre «${c.name}» ya está en uso.`, `The name "${c.name}" is already in use.`);
  const sc = scope ?? parameterScope(c.kind === 'dimensional' ? { ...data, constraints: new Map([...data.constraints, [c.id, c]]) } : data);
  if (c.kind === 'dimensional') {
    const err = sc.errors.get(c.name);
    if (err) throw new ConstraintError(err);
  }
  const seeds = c.refs.map((r) => r.entityId);
  const res = solveDrawing(data, { seeds, extra: [c], prefer, scope: sc });
  if (!res.consistent) fail('La restricción entra en conflicto con las existentes o con la geometría.', 'The constraint conflicts with existing constraints or the geometry.');
  if (c.kind === 'geometric' && c.type === 'fixed') return { updates: res.updates };
  // redundante: no aumenta el rango del sistema en la geometría resuelta
  const merged = new Map(data.entities);
  for (const [id, e] of res.updates) merged.set(id, e);
  const group = componentOf([...data.constraints.values()], seeds);
  const ents = [...new Set([...group, c].flatMap((k) => k.refs.map((r) => r.entityId)))].map((id) => merged.get(id)!).filter(Boolean);
  const targets = dimTargets([...group, c], sc);
  if (constraintRank(ents, [...group, c], targets) <= constraintRank(ents, group, targets)) fail('La restricción es redundante: las existentes ya la imponen.', 'The constraint is redundant: existing constraints already impose it.');
  return { updates: res.updates };
}

/** Añade una restricción validada y aplica la geometría resultante. */
export function addDrawingConstraint(tx: Transaction, c: DrawingConstraint, prefer?: ReadonlySet<Id>): ConstraintPlan {
  const plan = planConstraint(tx.doc.data, c, prefer);
  for (const e of plan.updates.values()) tx.put('entities', e);
  tx.add('constraints', c);
  return plan;
}

/**
 * Acepta candidatas mientras el sistema siga siendo satisfacible. Devuelve las aceptadas y
 * la geometría ajustada; prueba primero todas juntas y, si fallan, una a una.
 */
export function admitConstraints(data: DocumentData, candidates: readonly DrawingConstraint[]): { accepted: DrawingConstraint[]; updates: Map<Id, Entity>; rejected: DrawingConstraint[] } {
  if (!candidates.length) return { accepted: [], updates: new Map(), rejected: [] };
  const seedsOf = (list: readonly DrawingConstraint[]) => list.flatMap((c) => c.refs.map((r) => r.entityId));
  const scope = parameterScope(data);
  const all = solveDrawing(data, { seeds: seedsOf(candidates), extra: candidates, scope });
  if (all.consistent) return { accepted: [...candidates], updates: all.updates, rejected: [] };
  const accepted: DrawingConstraint[] = [];
  const rejected: DrawingConstraint[] = [];
  let updates = new Map<Id, Entity>();
  for (const c of candidates) {
    const trial = [...accepted, c];
    const overrides = new Map(updates);
    const res = solveDrawing(data, { seeds: seedsOf(trial), extra: trial, entities: overrides, scope });
    if (!res.consistent) {
      rejected.push(c);
      continue;
    }
    accepted.push(c);
    updates = new Map([...updates, ...res.updates]);
  }
  return { accepted, updates, rejected };
}

// ------------------------------------------------------------------ inferencia

export interface InferOptions {
  /** distancia máxima para considerar dos puntos coincidentes (0 = exacto) */
  distTol: number;
  /** desviación angular máxima en radianes (0 = exacto) */
  angleTol: number;
  /** candidatos: solo estos objetos (AUTOCONSTRAIN); si se omite, todo el espacio */
  pool?: Iterable<Id>;
}

interface PointFeature {
  entityId: Id;
  part: string;
  p: { x: number; y: number };
}

interface SegmentFeature {
  entityId: Id;
  part: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** extremos como partes de punto (para saber si comparten vértice) */
  ends: [string, string];
}

function pointFeatures(e: Entity): PointFeature[] {
  const out: PointFeature[] = [];
  const add = (part: string) => {
    const p = refPoint(e, part);
    if (p) out.push({ entityId: e.id, part, p });
  };
  if (e.type === 'line' || e.type === 'arc') {
    add('start');
    add('end');
  } else if (e.type === 'lwpolyline') e.vertices.forEach((_, i) => add(`vertex:${i}`));
  else if (e.type === 'point') add('point');
  return out;
}

function segmentFeatures(e: Entity): SegmentFeature[] {
  if (e.type === 'line') return [{ entityId: e.id, part: 'edge', a: e.start, b: e.end, ends: ['start', 'end'] }];
  if (e.type !== 'lwpolyline') return [];
  const n = e.closed ? e.vertices.length : e.vertices.length - 1;
  const out: SegmentFeature[] = [];
  for (let i = 0; i < n; i++) {
    if (e.vertices[i].bulge) continue;
    const j = (i + 1) % e.vertices.length;
    out.push({ entityId: e.id, part: `segment:${i}`, a: e.vertices[i], b: e.vertices[j], ends: [`vertex:${i}`, `vertex:${j}`] });
  }
  return out;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    let r = a;
    while (this.parent.has(r) && this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = a;
    while (this.parent.has(c) && this.parent.get(c) !== r) {
      const next = this.parent.get(c)!;
      this.parent.set(c, r);
      c = next;
    }
    return r;
  }
  union(a: string, b: string): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent.set(ra, rb);
    this.parent.set(rb, rb);
    return true;
  }
}

/**
 * Propone restricciones geométricas que la geometría ya cumple (dentro de la tolerancia):
 * coincidencias de extremos, horizontales/verticales, perpendiculares entre tramos unidos,
 * paralelas entre los tramos enfocados, tangencias en uniones y concentricidades. Evita
 * duplicados y relaciones que las existentes ya implican (árboles de uniones).
 */
export function inferConstraints(data: DocumentData, focusIds: Iterable<Id>, opts: InferOptions): DrawingConstraint[] {
  const focus = new Set<Id>();
  for (const id of focusIds) {
    const e = data.entities.get(id);
    if (e && isSpaceOwner(data, e.owner) && isConstrainable(e)) focus.add(id);
  }
  if (!focus.size) return [];
  const owners = new Set([...focus].map((id) => data.entities.get(id)!.owner));
  const poolIds = opts.pool ? new Set(opts.pool) : null;
  const pool: Entity[] = [];
  for (const e of data.entities.values()) {
    if (!owners.has(e.owner) || !isConstrainable(e)) continue;
    if (poolIds && !poolIds.has(e.id) && !focus.has(e.id)) continue;
    pool.push(e);
  }
  const existing = [...data.constraints.values()].filter((c) => owners.has(c.owner));
  const signatures = new Set(existing.map(signatureOf));
  const out: DrawingConstraint[] = [];
  const propose = (owner: Id, type: GeoConstraintType, refs: GeoRef[]) => {
    const c: DrawingConstraint = { id: newId('cns'), kind: 'geometric', type, refs, enabled: true, owner };
    const sig = signatureOf(c);
    if (signatures.has(sig)) return;
    signatures.add(sig);
    out.push(c);
  };
  const ownerOf = (id: Id) => data.entities.get(id)!.owner;
  const key = (id: Id, part: string) => `${id}|${part}`;

  // magnitud para las tolerancias exactas
  let mag = 0;
  const points: PointFeature[] = [];
  for (const e of pool) for (const f of pointFeatures(e)) {
    points.push(f);
    mag = Math.max(mag, Math.abs(f.p.x), Math.abs(f.p.y));
  }
  const dTol = Math.max(opts.distTol, linearTol(mag) * 10);
  const aTol = Math.max(opts.angleTol, 1e-9);

  // coincidencias (árbol de uniones sembrado con las existentes)
  const joints = new UnionFind();
  for (const c of existing) if (c.kind === 'geometric' && c.type === 'coincident' && c.refs.length === 2) joints.union(key(c.refs[0].entityId, c.refs[0].part), key(c.refs[1].entityId, c.refs[1].part));
  const cell = dTol * 2;
  const grid = new Map<string, PointFeature[]>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const f of points) {
    const k = cellKey(f.p.x, f.p.y);
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(f);
  }
  for (const f of points) {
    if (!focus.has(f.entityId)) continue;
    const cx = Math.floor(f.p.x / cell);
    const cy = Math.floor(f.p.y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const g of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (g.entityId === f.entityId || Math.hypot(g.p.x - f.p.x, g.p.y - f.p.y) > dTol) continue;
        if (!joints.union(key(g.entityId, g.part), key(f.entityId, f.part))) continue;
        propose(ownerOf(f.entityId), 'coincident', [{ entityId: g.entityId, part: g.part }, { entityId: f.entityId, part: f.part }]);
      }
    }
  }
  const joined = (a: string, b: string) => joints.find(a) === joints.find(b);

  // horizontales y verticales
  const axisOf = new Map<string, 'h' | 'v'>();
  for (const c of existing) {
    if (c.kind === 'geometric' && (c.type === 'horizontal' || c.type === 'vertical') && c.refs.length === 1) axisOf.set(key(c.refs[0].entityId, c.refs[0].part), c.type === 'horizontal' ? 'h' : 'v');
  }
  const segments = pool.flatMap(segmentFeatures);
  const sinTol = Math.sin(aTol);
  const dir = (s: SegmentFeature) => {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const l = Math.hypot(dx, dy);
    return l > dTol ? { x: dx / l, y: dy / l } : null;
  };
  for (const s of segments) {
    if (!focus.has(s.entityId)) continue;
    const d = dir(s);
    const k = key(s.entityId, s.part);
    if (!d || axisOf.has(k)) continue;
    if (Math.abs(d.y) <= sinTol) {
      axisOf.set(k, 'h');
      propose(ownerOf(s.entityId), 'horizontal', [{ entityId: s.entityId, part: s.part }]);
    } else if (Math.abs(d.x) <= sinTol) {
      axisOf.set(k, 'v');
      propose(ownerOf(s.entityId), 'vertical', [{ entityId: s.entityId, part: s.part }]);
    }
  }

  // perpendiculares entre tramos que comparten un extremo (sin ejes: ya implicadas)
  const sharesEnd = (s: SegmentFeature, t: SegmentFeature) => s.ends.some((pa) => t.ends.some((pb) => (s.entityId === t.entityId && pa === pb) || joined(key(s.entityId, pa), key(t.entityId, pb))));
  const free = segments.filter((s) => !axisOf.has(key(s.entityId, s.part)));
  for (let i = 0; i < free.length; i++) {
    const s = free[i];
    const ds = dir(s);
    if (!ds) continue;
    for (let j = 0; j < free.length; j++) {
      const t = free[j];
      if (j === i || (!focus.has(s.entityId) && !focus.has(t.entityId)) || (focus.has(t.entityId) && j < i)) continue;
      if (s.entityId === t.entityId && s.part === t.part) continue;
      const dt = dir(t);
      if (!dt || Math.abs(ds.x * dt.x + ds.y * dt.y) > sinTol || !sharesEnd(s, t)) continue;
      propose(ownerOf(s.entityId), 'perpendicular', [{ entityId: s.entityId, part: s.part }, { entityId: t.entityId, part: t.part }]);
    }
  }

  // paralelas entre tramos enfocados sin eje: una cadena por dirección
  const classes: { d: { x: number; y: number }; members: SegmentFeature[] }[] = [];
  for (const s of free) {
    if (!focus.has(s.entityId)) continue;
    const d = dir(s);
    if (!d) continue;
    const cls = classes.find((c) => Math.abs(c.d.x * d.y - c.d.y * d.x) <= sinTol);
    if (cls) cls.members.push(s);
    else classes.push({ d, members: [s] });
  }
  for (const cls of classes) {
    for (let i = 1; i < cls.members.length; i++) {
      const a = cls.members[i - 1];
      const b = cls.members[i];
      propose(ownerOf(a.entityId), 'parallel', [{ entityId: a.entityId, part: a.part }, { entityId: b.entityId, part: b.part }]);
    }
  }

  // tangencias en uniones: tramo-arco y arco-arco
  const arcs = pool.filter((e): e is Extract<Entity, { type: 'arc' }> => e.type === 'arc');
  for (const a of arcs) {
    for (const s of segments) {
      if (!focus.has(a.id) && !focus.has(s.entityId)) continue;
      const touches = (['start', 'end'] as const).some((ap) => s.ends.some((sp) => joined(key(a.id, ap), key(s.entityId, sp))));
      if (!touches) continue;
      const d = dir(s);
      if (!d) continue;
      const dist = Math.abs((a.center.x - s.a.x) * d.y - (a.center.y - s.a.y) * d.x);
      if (Math.abs(dist - a.radius) <= dTol) propose(a.owner, 'tangent', [{ entityId: s.entityId, part: s.part }, { entityId: a.id, part: 'edge' }]);
    }
    for (const b of arcs) {
      if (b.id <= a.id || (!focus.has(a.id) && !focus.has(b.id))) continue;
      const touches = (['start', 'end'] as const).some((ap) => (['start', 'end'] as const).some((bp) => joined(key(a.id, ap), key(b.id, bp))));
      if (!touches) continue;
      const d = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
      if (Math.abs(d - (a.radius + b.radius)) <= dTol || Math.abs(d - Math.abs(a.radius - b.radius)) <= dTol) propose(a.owner, 'tangent', [{ entityId: a.id, part: 'edge' }, { entityId: b.id, part: 'edge' }]);
    }
  }

  // concéntricas
  const centers = new UnionFind();
  for (const c of existing) if (c.kind === 'geometric' && c.type === 'concentric') centers.union(c.refs[0].entityId, c.refs[1].entityId);
  const round = pool.filter((e): e is Extract<Entity, { type: 'arc' | 'circle' }> => e.type === 'arc' || e.type === 'circle');
  for (const a of round) {
    if (!focus.has(a.id)) continue;
    for (const b of round) {
      if (b.id === a.id || Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) > dTol) continue;
      if (!centers.union(b.id, a.id)) continue;
      propose(a.owner, 'concentric', [{ entityId: b.id, part: 'center' }, { entityId: a.id, part: 'center' }]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ estado para la vista

export interface DrawingConstraintState {
  constraints: DrawingConstraint[];
  conflicts: Set<Id>;
  /** estado de libertad por entidad (null si el sistema es demasiado grande) */
  freedom: Map<Id, FreedomState> | null;
  scope: ParameterScope;
}

/** Conflictos y grados de libertad de las restricciones de un espacio. */
export function drawingConstraintState(data: DocumentData, owner: Id): DrawingConstraintState {
  const constraints = [...data.constraints.values()].filter((c) => c.owner === owner);
  const scope = parameterScope(data);
  if (!constraints.length) return { constraints, conflicts: new Set(), freedom: new Map(), scope };
  const entities = [...new Set(constraints.flatMap((c) => c.refs.map((r) => r.entityId)))].map((id) => data.entities.get(id)).filter((e): e is Entity => !!e);
  const targets = dimTargets(constraints, scope);
  const res = solveConstraints(entities, constraints, targets, { maxIter: 0, onlyConsistent: true });
  const conflicts = new Set(res.conflicts);
  for (const c of constraints) if (c.kind === 'dimensional' && !(c.id in targets)) conflicts.add(c.id);
  return { constraints, conflicts, freedom: analyzeFreedom(entities, constraints, targets), scope };
}

/**
 * Previsualización: aplica la geometría arrastrada y devuelve también los objetos que
 * las restricciones moverían. Si no hay solución, devuelve solo lo arrastrado.
 */
export function previewConstrained(data: DocumentData, moved: readonly Entity[]): Entity[] {
  if (!data.constraints.size || !moved.length) return [...moved];
  const overrides = new Map(moved.map((e) => [e.id, e]));
  const previous = new Map<Id, Entity>();
  for (const e of moved) {
    const cur = data.entities.get(e.id);
    if (cur) previous.set(e.id, cur);
  }
  const res = solveDrawing(data, { seeds: overrides.keys(), previous, entities: overrides });
  if (!res.consistent) return [...moved];
  const out = new Map(overrides);
  for (const [id, e] of res.updates) out.set(id, e);
  return [...out.values()];
}

// ------------------------------------------------------------------ parámetros de usuario

export type NamedRecord = { kind: 'parameter'; record: DrawingParameter } | { kind: 'constraint'; record: DrawingConstraint & DimConstraint };

export function findNamed(data: DocumentData, name: string): NamedRecord | null {
  for (const p of data.parameters.values()) if (p.name === name) return { kind: 'parameter', record: p };
  for (const c of data.constraints.values()) if (c.kind === 'dimensional' && c.name === name) return { kind: 'constraint', record: c };
  return null;
}

/** Comprueba que las fórmulas nuevas no introducen errores; devuelve el ámbito antes y después. */
function assertScopeChange(data: DocumentData, overrides: ReadonlyMap<string, string>): { before: ParameterScope; after: ParameterScope } {
  const before = parameterScope(data);
  const after = parameterScope(data, overrides);
  for (const [name, err] of after.errors) {
    if (!before.errors.has(name) || overrides.has(name)) throw new ConstraintError({ es: `«${name}»: ${err.es}`, en: `"${name}": ${err.en}` });
  }
  return { before, after };
}

/** Rechaza un cambio de valores que deja sin solución un grupo que antes la tenía. */
function assertSolvable(data: DocumentData, scopes: { before: ParameterScope; after: ParameterScope }) {
  const changed = [...data.constraints.values()].filter((c) => c.kind === 'dimensional' && scopes.before.values.get(c.name) !== scopes.after.values.get(c.name));
  if (!changed.length) return;
  const seeds = changed.flatMap((c) => c.refs.map((r) => r.entityId));
  if (solveDrawing(data, { seeds, scope: scopes.after }).consistent) return;
  if (solveDrawing(data, { seeds, scope: scopes.before }).consistent) fail('Las restricciones no admiten ese valor: la geometría no tiene solución.', 'The constraints do not accept that value: the geometry has no solution.');
}

/** Cambia la fórmula de un parámetro o cota; rechaza errores, ciclos y valores sin solución. */
export function setNamedExpression(tx: Transaction, name: string, expression: string): void {
  const data = tx.doc.data;
  const target = findNamed(data, name);
  if (!target) fail(`No existe «${name}».`, `"${name}" does not exist.`);
  const ex = expression.trim();
  if (!ex) fail('La fórmula no puede estar vacía.', 'The formula cannot be empty.');
  const scopes = assertScopeChange(data, new Map([[name, ex]]));
  if (target!.kind === 'parameter') tx.update('parameters', target!.record.id, { expression: ex });
  else tx.update('constraints', target!.record.id, { expression: ex } as Partial<DrawingConstraint>);
  assertSolvable(tx.doc.data, scopes);
}

export function addParameter(tx: Transaction, name: string, expression: string, description = ''): DrawingParameter {
  const data = tx.doc.data;
  if (!validParameterName(name)) fail('Nombre no válido: usa letras, dígitos y _ (sin empezar por dígito).', 'Invalid name: use letters, digits and _ (not starting with a digit).');
  if ([...usedNames(data)].some((n) => n.toLowerCase() === name.toLowerCase())) fail(`El nombre «${name}» ya está en uso.`, `The name "${name}" is already in use.`);
  const ex = expression.trim() || '0';
  const record: DrawingParameter = { id: newId('par'), name, expression: ex, description };
  const trial = { ...data, parameters: new Map([...data.parameters, [record.id, record]]) };
  const err = parameterScope(trial).errors.get(name);
  if (err) throw new ConstraintError(err);
  return tx.add('parameters', record);
}

/** Renombra un parámetro o cota y actualiza todas las fórmulas y variantes que lo usan. */
export function renameNamed(tx: Transaction, from: string, to: string): void {
  const data = tx.doc.data;
  const target = findNamed(data, from);
  if (!target) fail(`No existe «${from}».`, `"${from}" does not exist.`);
  if (from === to) return;
  if (!validParameterName(to)) fail('Nombre no válido: usa letras, dígitos y _ (sin empezar por dígito).', 'Invalid name: use letters, digits and _ (not starting with a digit).');
  if ([...usedNames(data)].some((n) => n !== from && n.toLowerCase() === to.toLowerCase())) fail(`El nombre «${to}» ya está en uso.`, `The name "${to}" is already in use.`);
  for (const p of data.parameters.values()) {
    const expression = renameVariable(p.expression, from, to);
    const name = p.name === from ? to : p.name;
    if (expression !== p.expression || name !== p.name) tx.update('parameters', p.id, { expression, name });
  }
  for (const c of data.constraints.values()) {
    if (c.kind !== 'dimensional') continue;
    const expression = renameVariable(c.expression, from, to);
    const name = c.name === from ? to : c.name;
    if (expression !== c.expression || name !== c.name) tx.update('constraints', c.id, { expression, name } as Partial<DrawingConstraint>);
  }
  for (const s of data.parameterSets.values()) {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.values)) values[k === from ? to : k] = renameVariable(v, from, to);
    tx.update('parameterSets', s.id, { values });
  }
}

/** Nombres cuyas fórmulas usan `name`. */
export function dependentsOf(data: DocumentData, name: string): string[] {
  return namedExpressions(data).filter((n) => n.name !== name && dependencies(n.expression).includes(name)).map((n) => n.name);
}

export function removeParameter(tx: Transaction, id: Id): void {
  const p = tx.doc.data.parameters.get(id);
  if (!p) return;
  const users = dependentsOf(tx.doc.data, p.name);
  if (users.length) fail(`«${p.name}» se usa en: ${users.join(', ')}.`, `"${p.name}" is used by: ${users.join(', ')}.`);
  tx.remove('parameters', id);
}

/** Elimina una restricción; si es una cota usada por fórmulas, lo impide. */
export function removeDrawingConstraint(tx: Transaction, id: Id): void {
  const c = tx.doc.data.constraints.get(id);
  if (!c) return;
  if (c.kind === 'dimensional') {
    const users = dependentsOf(tx.doc.data, c.name);
    if (users.length) fail(`«${c.name}» se usa en: ${users.join(', ')}.`, `"${c.name}" is used by: ${users.join(', ')}.`);
  }
  tx.remove('constraints', id);
}

export function saveParameterSet(tx: Transaction, name: string): ParameterSet {
  const data = tx.doc.data;
  const clean = name.trim();
  if (!clean || clean.length > 64) fail('Escribe un nombre de variante (hasta 64 caracteres).', 'Enter a variant name (up to 64 characters).');
  const values = Object.fromEntries(namedExpressions(data).map((n) => [n.name, n.expression]));
  const existing = [...data.parameterSets.values()].find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (existing) return tx.update('parameterSets', existing.id, { values });
  return tx.add('parameterSets', { id: newId('pset'), name: clean, values });
}

/** Aplica una variante: cambia las fórmulas de los nombres que existan en el dibujo. */
export function applyParameterSet(tx: Transaction, id: Id): { applied: number; missing: string[] } {
  const data = tx.doc.data;
  const set = data.parameterSets.get(id);
  if (!set) fail('La variante no existe.', 'The variant does not exist.');
  const overrides = new Map<string, string>();
  const missing: string[] = [];
  for (const [name, ex] of Object.entries(set!.values)) {
    const target = findNamed(data, name);
    if (!target) missing.push(name);
    else if (target.record.expression !== ex) overrides.set(name, ex);
  }
  const scopes = assertScopeChange(data, overrides);
  for (const [name, ex] of overrides) {
    const target = findNamed(data, name)!;
    if (target.kind === 'parameter') tx.update('parameters', target.record.id, { expression: ex });
    else tx.update('constraints', target.record.id, { expression: ex } as Partial<DrawingConstraint>);
  }
  assertSolvable(tx.doc.data, scopes);
  return { applied: overrides.size, missing };
}
