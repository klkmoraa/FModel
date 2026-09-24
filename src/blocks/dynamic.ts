import type { Mat2D } from '../geometry/matrix';
import { applyToPoint, invert, reflection, rotation, scaling, translation } from '../geometry/matrix';
import { pointInPolygon } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { add, angleOf, dist, dot, len, normalize, polar, rotate, scale, sub } from '../geometry/vec';
import { newId } from '../document/ids';
import type {
  BlockRecord,
  DynAction,
  DynamicBlockDefinition,
  DynamicInstanceState,
  DynParam,
  Entity,
  Id,
  InsertEntity,
  LookupTable,
  ValueSet,
} from '../document/types';
import { evaluate, topoSortExpressions } from '../lib/expr';
import { solveConstraints } from '../constraints/solver';
import type { EvalContext, GripDef } from '../model/registry';
import { kindOf } from '../model/registry';
import { insertMatrixOf } from '../model/kinds/insert';
import { stretchEntity } from '../model/stretch';

// ------------------------------------------------------------------ valores

/** Geometría mutable de un parámetro durante la evaluación (para acciones encadenadas). */
interface ParamGeom {
  base: Vec2;
  end: Vec2;
}

function paramGeometry(p: DynParam): ParamGeom {
  switch (p.type) {
    case 'linear':
    case 'polar':
    case 'flip':
      return { base: { ...p.base }, end: { ...p.end } };
    case 'xy':
      return { base: { ...p.base }, end: { ...p.corner } };
    case 'rotation':
      return { base: { ...p.base }, end: polar(p.base, p.angle, p.radius) };
    case 'point':
    case 'basepoint':
      return { base: { ...p.point }, end: { ...p.point } };
    case 'alignment':
      return { base: { ...p.base }, end: add(p.base, p.direction) };
    case 'visibility':
    case 'lookup':
      return { base: { ...p.position }, end: { ...p.position } };
  }
}

export function applyValueSet(v: number, set: ValueSet | undefined): number {
  if (!set || set.kind === 'none') {
    let x = v;
    if (set?.min !== undefined) x = Math.max(set.min, x);
    if (set?.max !== undefined) x = Math.min(set.max, x);
    return x;
  }
  let x = v;
  if (set.kind === 'increment' && set.increment && set.increment > 0) {
    const base = set.min ?? 0;
    x = base + Math.round((x - base) / set.increment) * set.increment;
  }
  if (set.kind === 'list' && set.list?.length) x = set.list.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), set.list[0]);
  if (set.min !== undefined) x = Math.max(set.min, x);
  if (set.max !== undefined) x = Math.min(set.max, x);
  return x;
}

export function defaultValue(p: DynParam): number | Vec2 | boolean | string | undefined {
  switch (p.type) {
    case 'linear':
      return dist(p.base, p.end);
    case 'polar':
      return { x: dist(p.base, p.end), y: angleOf(sub(p.end, p.base)) };
    case 'xy':
      return { x: p.corner.x - p.base.x, y: p.corner.y - p.base.y };
    case 'rotation':
      return p.angle;
    case 'point':
      return { ...p.point };
    case 'flip':
      return false;
    case 'visibility':
      return p.defaultState;
    case 'lookup':
      return '';
    case 'alignment':
      return 0;
    case 'basepoint':
      return undefined;
  }
}

/** Valor efectivo de un parámetro (instancia → fórmula → defecto), con conjunto de valores aplicado. */
export function paramValue(def: DynamicBlockDefinition, p: DynParam, state: DynamicInstanceState | undefined, scope: Record<string, number>): number | Vec2 | boolean | string | undefined {
  const raw = state?.values[p.id];
  if (p.type === 'linear') {
    if (p.expression) {
      try {
        return applyValueSet(evaluate(p.expression, scope), p.valueSet);
      } catch {
        /* expresión inválida: se usa el valor */
      }
    }
    return applyValueSet(typeof raw === 'number' ? raw : (defaultValue(p) as number), p.valueSet);
  }
  if (p.type === 'rotation') return applyValueSet(typeof raw === 'number' ? raw : p.angle, p.valueSet);
  if (p.type === 'polar') {
    const d = (raw as Vec2) ?? (defaultValue(p) as Vec2);
    return { x: applyValueSet(d.x, p.distanceSet), y: applyValueSet(d.y, p.angleSet) };
  }
  if (p.type === 'xy') {
    const d = (raw as Vec2) ?? (defaultValue(p) as Vec2);
    return { x: applyValueSet(d.x, p.xSet), y: applyValueSet(d.y, p.ySet) };
  }
  if (p.type === 'visibility') return typeof raw === 'string' && p.states.some((s) => s.name === raw) ? raw : (state?.visibilityState ?? p.defaultState);
  void def;
  return raw ?? defaultValue(p);
}

// ------------------------------------------------------------------ evaluación

type LookupRow = LookupTable['rows'][number];

const lookupIndexCache = new WeakMap<LookupTable, ReadonlyMap<string, LookupRow>>();

function lookupRowsByLabel(table: LookupTable): ReadonlyMap<string, LookupRow> {
  let index = lookupIndexCache.get(table);
  if (!index) {
    const rows = new Map<string, LookupRow>();
    for (const row of table.rows) if (!rows.has(row.label)) rows.set(row.label, row);
    index = rows;
    lookupIndexCache.set(table, index);
  }
  return index;
}

export interface DynamicEvaluation {
  entities: Entity[];
  params: Map<Id, { param: DynParam; geom: ParamGeom; value: unknown }>;
  warnings: string[];
  conflicts: Id[];
}

/** Escala numérica (nombre → valor) para fórmulas: parámetros lineales/rotación/polar/xy y variables. */
export function buildScope(def: DynamicBlockDefinition, state: DynamicInstanceState | undefined): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const p of def.parameters) {
    const raw = state?.values[p.id];
    if (p.type === 'linear') scope[p.name] = typeof raw === 'number' ? raw : (defaultValue(p) as number);
    else if (p.type === 'rotation') scope[p.name] = ((typeof raw === 'number' ? raw : p.angle) * 180) / Math.PI;
    else if (p.type === 'polar') {
      const v = (raw as Vec2) ?? (defaultValue(p) as Vec2);
      scope[`${p.name}_dist`] = v.x;
      scope[`${p.name}_ang`] = (v.y * 180) / Math.PI;
    } else if (p.type === 'xy') {
      const v = (raw as Vec2) ?? (defaultValue(p) as Vec2);
      scope[`${p.name}_x`] = v.x;
      scope[`${p.name}_y`] = v.y;
    } else if (p.type === 'flip') scope[p.name] = raw ? 1 : 0;
  }
  for (const c of def.constraints) {
    if (c.kind === 'dimensional') {
      const raw = state?.values[c.id];
      if (typeof raw === 'number') scope[c.name] = raw;
    }
  }
  const exprs: Record<string, string> = {};
  for (const v of def.variables) {
    const raw = state?.userValues?.[v.name];
    if (raw !== undefined && !v.readOnly) scope[v.name] = raw;
    else exprs[v.name] = v.expression;
  }
  for (const c of def.constraints) if (c.kind === 'dimensional' && !(c.name in scope)) exprs[c.name] = c.expression;
  try {
    for (const name of topoSortExpressions(exprs)) {
      try {
        scope[name] = evaluate(exprs[name], scope);
      } catch {
        /* dependencias no resueltas */
      }
    }
  } catch {
    /* ciclo: se informa en validación */
  }
  return scope;
}

function transformIds(entities: Map<Id, Entity>, ids: Id[], m: Mat2D, ctx: EvalContext) {
  for (const id of ids) {
    const e = entities.get(id);
    if (!e) continue;
    const t = kindOf(e).transform(e, m, ctx);
    if (t) entities.set(id, { ...t, id });
  }
}

function transformGeoms(geoms: Map<Id, ParamGeom>, ids: Id[], m: Mat2D, chained: Set<Id>) {
  for (const id of ids) {
    const g = geoms.get(id);
    if (!g) continue;
    g.base = applyToPoint(m, g.base);
    g.end = applyToPoint(m, g.end);
    chained.add(id);
  }
}

/** Evalúa una definición dinámica para un estado de instancia. */
export function evaluateDynamic(ctx: EvalContext, block: BlockRecord, baseEntities: Entity[], state: DynamicInstanceState | undefined): DynamicEvaluation {
  const def = block.dynamic!;
  const warnings: string[] = [];
  const entities = new Map(baseEntities.map((e) => [e.id, e]));
  const scope = buildScope(def, state);
  const geoms = new Map<Id, ParamGeom>(def.parameters.map((p) => [p.id, paramGeometry(p)]));
  const values = new Map<Id, unknown>();
  // consultas: fijan valores de parámetros de entrada
  const effectiveState: DynamicInstanceState = { values: { ...state?.values }, visibilityState: state?.visibilityState, userValues: state?.userValues };
  for (const p of def.parameters) {
    if (p.type !== 'lookup') continue;
    const rowLabel = state?.values[p.id];
    const table = def.lookups.find((t) => t.id === p.tableId);
    const row = table && typeof rowLabel === 'string' ? lookupRowsByLabel(table).get(rowLabel) : undefined;
    if (table && row) {
      table.inputs.forEach((pid, i) => {
        const v = row.inputs[i];
        const target = def.parameters.find((x) => x.id === pid);
        if (!target) return;
        if (target.type === 'visibility') effectiveState.visibilityState = String(v);
        else if (typeof v === 'number') effectiveState.values[pid] = target.type === 'rotation' ? (v * Math.PI) / 180 : v;
        else if (typeof v === 'string' && !Number.isNaN(Number(v))) effectiveState.values[pid] = Number(v);
      });
    }
  }
  for (const p of def.parameters) values.set(p.id, paramValue(def, p, effectiveState, scope));

  // orden: parámetros cuyas geometrías son arrastradas por otras acciones (cadena) van después
  const referencedBy = new Map<Id, number>();
  for (const a of def.actions) for (const s of a.selection) if (geoms.has(s)) referencedBy.set(s, (referencedBy.get(s) ?? 0) + 1);
  const orderedActions = [...def.actions].sort((a, b) => (referencedBy.get(a.paramId) ?? 0) - (referencedBy.get(b.paramId) ?? 0));
  const chained = new Set<Id>();

  for (const action of orderedActions) {
    const param = def.parameters.find((p) => p.id === action.paramId);
    if (!param) {
      warnings.push(`La acción «${action.name}» no tiene parámetro asociado.`);
      continue;
    }
    const g = geoms.get(param.id)!;
    const value = values.get(param.id);
    const entIds = action.selection.filter((id) => entities.has(id));
    const paramIds = action.selection.filter((id) => geoms.has(id) && id !== param.id);
    const chainTargets = paramIds.filter((id) => def.parameters.find((p) => p.id === id)?.chainActions);
    try {
      applyAction(ctx, def, action, param, g, value, entities, geoms, entIds, chainTargets, chained, warnings, scope);
    } catch (err) {
      warnings.push(`Error en la acción «${action.name}»: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // restricciones
  let conflicts: Id[] = [];
  if (def.constraints.length) {
    const dimValues: Record<Id, number> = {};
    for (const c of def.constraints) {
      if (c.kind !== 'dimensional') continue;
      const raw = effectiveState.values[c.id];
      let v = typeof raw === 'number' ? raw : scope[c.name];
      if (v === undefined) {
        try {
          v = evaluate(c.expression, scope);
        } catch {
          warnings.push(`Expresión no válida en la restricción «${c.name}»: ${c.expression}`);
          continue;
        }
      }
      if (c.type === 'angular') v = (v * Math.PI) / 180;
      dimValues[c.id] = v;
    }
    const res = solveConstraints([...entities.values()], def.constraints, dimValues);
    for (const [id, e] of res.entities) entities.set(id, e);
    conflicts = res.conflicts;
    if (res.status === 'inconsistent') warnings.push(`Restricciones sin solución exacta (residuo ${res.residual.toExponential(2)}).`);
  }

  // visibilidad
  const vis = def.parameters.find((p) => p.type === 'visibility');
  let out = [...entities.values()];
  if (vis && vis.type === 'visibility') {
    const stateName = String(values.get(vis.id) ?? vis.defaultState);
    const current = vis.states.find((s) => s.name === stateName) ?? vis.states[0];
    const controlled = new Set(vis.states.flatMap((s) => s.visible));
    if (current) out = out.filter((e) => !controlled.has(e.id) || current.visible.includes(e.id));
  }
  // orden de dibujo original
  const order = new Map(baseEntities.map((e, i) => [e.id, i]));
  out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const params = new Map<Id, { param: DynParam; geom: ParamGeom; value: unknown }>();
  for (const p of def.parameters) params.set(p.id, { param: p, geom: geoms.get(p.id)!, value: values.get(p.id) });
  return { entities: out, params, warnings, conflicts };
}

function actionDelta(param: DynParam, g: ParamGeom, value: unknown, which: 'base' | 'end' | 'corner', axis: 'xy' | 'x' | 'y'): { delta: Vec2; movedPoint: 'base' | 'end' } {
  switch (param.type) {
    case 'linear': {
      const d0 = dist(param.base, param.end);
      const d = value as number;
      const u = normalize(sub(g.end, g.base));
      const change = d - d0;
      if (param.baseLocation === 'middle') {
        const half = scale(u, change / 2);
        return which === 'base' ? { delta: scale(half, -1), movedPoint: 'base' } : { delta: half, movedPoint: 'end' };
      }
      if (which === 'base') return { delta: { x: 0, y: 0 }, movedPoint: 'base' };
      return { delta: scale(u, change), movedPoint: 'end' };
    }
    case 'polar': {
      const v = value as Vec2;
      const target = polar(g.base, v.y, v.x);
      return { delta: sub(target, g.end), movedPoint: 'end' };
    }
    case 'xy': {
      const v = value as Vec2;
      const d0 = { x: param.corner.x - param.base.x, y: param.corner.y - param.base.y };
      const delta = { x: axis === 'y' ? 0 : v.x - d0.x, y: axis === 'x' ? 0 : v.y - d0.y };
      return { delta, movedPoint: 'end' };
    }
    case 'point': {
      const v = value as Vec2;
      return { delta: sub(v, param.point), movedPoint: 'end' };
    }
    default:
      return { delta: { x: 0, y: 0 }, movedPoint: 'end' };
  }
}

function applyAction(
  ctx: EvalContext,
  def: DynamicBlockDefinition,
  action: DynAction,
  param: DynParam,
  g: ParamGeom,
  value: unknown,
  entities: Map<Id, Entity>,
  geoms: Map<Id, ParamGeom>,
  entIds: Id[],
  chainTargets: Id[],
  chained: Set<Id>,
  warnings: string[],
  scope: Record<string, number>,
) {
  switch (action.type) {
    case 'move': {
      const { delta } = actionDelta(param, g, value, action.paramPoint, action.axis);
      let d = scale(delta, action.distanceMultiplier || 1);
      if (action.angleOffset) d = rotate(d, action.angleOffset);
      if (len(d) < 1e-15) return;
      const m = translation(d.x, d.y);
      transformIds(entities, entIds, m, ctx);
      transformGeoms(geoms, chainTargets, m, chained);
      return;
    }
    case 'scale': {
      let sx = 1;
      let sy = 1;
      if (param.type === 'linear') sx = sy = (value as number) / (dist(param.base, param.end) || 1);
      else if (param.type === 'polar') sx = sy = (value as Vec2).x / (dist(param.base, param.end) || 1);
      else if (param.type === 'xy') {
        const v = value as Vec2;
        sx = v.x / (param.corner.x - param.base.x || 1);
        sy = v.y / (param.corner.y - param.base.y || 1);
        if (action.axis === 'x') sy = 1;
        if (action.axis === 'y') sx = 1;
        if (action.axis === 'xy') sx = sy = Math.max(Math.abs(sx), Math.abs(sy)) * Math.sign(sx || 1);
      }
      if (Math.abs(sx - 1) < 1e-12 && Math.abs(sy - 1) < 1e-12) return;
      const base = action.baseType === 'independent' && action.basePoint ? action.basePoint : g.base;
      const m = scaling(sx, sy, base);
      transformIds(entities, entIds, m, ctx);
      transformGeoms(geoms, chainTargets, m, chained);
      return;
    }
    case 'stretch': {
      const { delta } = actionDelta(param, g, value, action.paramPoint, action.axis);
      let d = scale(delta, action.distanceMultiplier || 1);
      if (action.angleOffset) d = rotate(d, action.angleOffset);
      if (len(d) < 1e-15) return;
      const frame = action.frame;
      const inside = (p: Vec2) => pointInPolygon(p, frame);
      for (const id of entIds) {
        const e = entities.get(id);
        if (!e) continue;
        const s = stretchEntity(e, inside, d, ctx);
        if (s) entities.set(id, { ...s, id });
      }
      const m = translation(d.x, d.y);
      for (const pid of chainTargets) {
        const pg = geoms.get(pid);
        if (!pg) continue;
        if (inside(pg.base)) pg.base = applyToPoint(m, pg.base);
        if (inside(pg.end)) pg.end = applyToPoint(m, pg.end);
        chained.add(pid);
      }
      return;
    }
    case 'polarstretch': {
      if (param.type !== 'polar') {
        warnings.push(`«${action.name}»: el estiramiento polar requiere un parámetro polar.`);
        return;
      }
      const v = value as Vec2;
      const a0 = angleOf(sub(param.end, param.base));
      const d0 = dist(param.base, param.end);
      const inside = (p: Vec2) => pointInPolygon(p, action.frame);
      const rot = rotation(v.y - a0, g.base);
      const radial = normalize(sub(param.end, param.base));
      const stretchD = scale(radial, v.x - d0);
      for (const id of entIds) {
        const e = entities.get(id);
        if (!e) continue;
        if (action.rotateOnly.includes(id)) {
          const t = kindOf(e).transform(e, rot, ctx);
          if (t) entities.set(id, { ...t, id });
          continue;
        }
        const s = stretchEntity(e, inside, stretchD, ctx) ?? e;
        const t = kindOf(s).transform(s, rot, ctx);
        if (t) entities.set(id, { ...t, id });
      }
      return;
    }
    case 'rotate': {
      if (param.type !== 'rotation') return;
      const delta = (value as number) - param.angle;
      if (Math.abs(delta) < 1e-15) return;
      const base = action.baseType === 'independent' && action.basePoint ? action.basePoint : g.base;
      const m = rotation(delta, base);
      transformIds(entities, entIds, m, ctx);
      transformGeoms(geoms, chainTargets, m, chained);
      return;
    }
    case 'flip': {
      if (param.type !== 'flip' || !value) return;
      const m = reflection(g.base, g.end);
      transformIds(entities, entIds, m, ctx);
      transformGeoms(geoms, chainTargets, m, chained);
      return;
    }
    case 'array': {
      const copies: Mat2D[] = [];
      if (action.polarCount) {
        const n = Math.max(1, Math.min(360, Math.round(evaluate(action.polarCount, scope))));
        const fill = ((action.fillAngle ?? 360) * Math.PI) / 180;
        const full = Math.abs(Math.abs(fill) - Math.PI * 2) < 1e-9;
        const step = n > 1 ? fill / (full ? n : n - 1) : 0;
        const start = param.type === 'rotation' ? (value as number) - param.angle : 0;
        if (Math.abs(start) > 1e-12) transformIds(entities, entIds, rotation(start, g.base), ctx);
        for (let i = 1; i < n; i++) copies.push(rotation(step * i, g.base));
      } else if (param.type === 'linear') {
        const n = Math.floor(((value as number) + 1e-9) / (action.columnOffset || 1));
        const u = normalize(sub(g.end, g.base));
        for (let i = 1; i < n; i++) copies.push(translation(u.x * action.columnOffset * i, u.y * action.columnOffset * i));
      } else if (param.type === 'xy') {
        const v = value as Vec2;
        const nx = Math.max(1, Math.floor((Math.abs(v.x) + 1e-9) / (action.columnOffset || 1)));
        const ny = Math.max(1, Math.floor((Math.abs(v.y) + 1e-9) / (action.rowOffset || 1)));
        for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) if (r || c) copies.push(translation(Math.sign(v.x || 1) * c * action.columnOffset, Math.sign(v.y || 1) * r * action.rowOffset));
      } else if (param.type === 'polar') {
        const v = value as Vec2;
        const n = Math.floor((v.x + 1e-9) / (action.columnOffset || 1));
        const u = { x: Math.cos(v.y), y: Math.sin(v.y) };
        for (let i = 1; i < n; i++) copies.push(translation(u.x * action.columnOffset * i, u.y * action.columnOffset * i));
      }
      if (copies.length > 2000) {
        warnings.push(`«${action.name}»: la matriz generaría ${copies.length} copias; se limitó a 2000.`);
        copies.length = 2000;
      }
      for (const m of copies) {
        for (const id of entIds) {
          const e = entities.get(id);
          if (!e) continue;
          const t = kindOf(e).transform(e, m, ctx);
          if (t) {
            const cid = `${id}~${newId()}`;
            entities.set(cid, { ...t, id: cid });
          }
        }
      }
      return;
    }
    case 'lookup':
      return;
  }
  void def;
}

// ------------------------------------------------------------------ grips y edición de instancia

function gripShapeFor(p: DynParam): GripDef['shape'] {
  switch (p.type) {
    case 'linear':
    case 'xy':
    case 'polar':
      return 'arrow';
    case 'rotation':
      return 'rotation';
    case 'flip':
      return 'flip';
    case 'visibility':
      return 'visibility';
    case 'lookup':
      return 'lookup';
    default:
      return 'diamond';
  }
}

export function dynamicGrips(ctx: EvalContext, e: Entity, evaluator: (b: BlockRecord, dyn?: DynamicInstanceState) => DynamicEvaluation): GripDef[] {
  if (e.type !== 'insert') return [];
  const block = ctx.doc.data.blocks.get(e.blockId);
  if (!block?.dynamic) return [];
  const ev = evaluator(block, e.dynamic);
  const m = insertMatrixOf(e, block);
  const out: GripDef[] = [];
  for (const { param, geom, value } of ev.params.values()) {
    if (param.gripCount === 0 || param.type === 'basepoint') continue;
    const P = (p: Vec2) => applyToPoint(m, p);
    const dir = (a: Vec2, b: Vec2) => normalize(sub(applyToPoint(m, b), applyToPoint(m, a)));
    switch (param.type) {
      case 'linear': {
        const u = normalize(sub(geom.end, geom.base));
        const d0 = dist(param.base, param.end);
        const d = value as number;
        const end = param.baseLocation === 'middle' ? add(geom.end, scale(u, (d - d0) / 2)) : add(geom.base, scale(u, d));
        const base = param.baseLocation === 'middle' ? sub(geom.base, scale(u, (d - d0) / 2)) : geom.base;
        out.push({ id: `dyn:${param.id}:end`, p: P(end), shape: 'arrow', dir: dir(base, end), paramId: param.id, hint: param.label });
        if (param.gripCount >= 2) out.push({ id: `dyn:${param.id}:base`, p: P(base), shape: 'arrow', dir: dir(end, base), paramId: param.id, hint: param.label });
        break;
      }
      case 'polar': {
        const v = value as Vec2;
        out.push({ id: `dyn:${param.id}:end`, p: P(polar(geom.base, v.y, v.x)), shape: 'square', paramId: param.id, hint: param.label });
        break;
      }
      case 'xy': {
        const v = value as Vec2;
        out.push({ id: `dyn:${param.id}:end`, p: P({ x: geom.base.x + v.x, y: geom.base.y + v.y }), shape: 'square', paramId: param.id, hint: param.label });
        break;
      }
      case 'point':
        out.push({ id: `dyn:${param.id}:end`, p: P(value as Vec2), shape: 'diamond', paramId: param.id, hint: param.label });
        break;
      case 'rotation':
        out.push({ id: `dyn:${param.id}:end`, p: P(polar(geom.base, value as number, param.radius)), shape: 'rotation', paramId: param.id, hint: param.label });
        break;
      case 'flip': {
        const mid = { x: (geom.base.x + geom.end.x) / 2, y: (geom.base.y + geom.end.y) / 2 };
        out.push({ id: `dyn:${param.id}:flip`, p: P(mid), shape: 'flip', dir: dir(geom.base, geom.end), paramId: param.id, hint: param.label });
        break;
      }
      case 'visibility':
      case 'lookup':
        out.push({ id: `dyn:${param.id}:menu`, p: P(geom.base), shape: gripShapeFor(param), paramId: param.id, hint: param.label });
        break;
      case 'alignment':
        out.push({ id: `dyn:${param.id}:align`, p: P(geom.base), shape: 'diamond', paramId: param.id, hint: param.label });
        break;
    }
  }
  return out;
}

/** Actualiza el estado dinámico de una instancia arrastrando uno de sus grips. */
export function moveDynamicGrip(ctx: EvalContext, e: InsertEntity, gripId: string, to: Vec2, evaluator: (b: BlockRecord, dyn?: DynamicInstanceState) => DynamicEvaluation): InsertEntity | null {
  const block = ctx.doc.data.blocks.get(e.blockId);
  if (!block?.dynamic) return null;
  const [, paramId, which] = gripId.split(':');
  const ev = evaluator(block, e.dynamic);
  const entry = ev.params.get(paramId);
  if (!entry) return null;
  const { param, geom } = entry;
  const m = insertMatrixOf(e, block);
  const local = applyToPoint(invert(m), to);
  const state: DynamicInstanceState = { values: { ...e.dynamic?.values }, visibilityState: e.dynamic?.visibilityState, userValues: e.dynamic?.userValues };
  switch (param.type) {
    case 'linear': {
      const u = normalize(sub(param.end, param.base));
      let d: number;
      if (param.baseLocation === 'middle') {
        const mid = { x: (geom.base.x + geom.end.x) / 2, y: (geom.base.y + geom.end.y) / 2 };
        d = 2 * Math.abs(dot(sub(local, mid), u));
      } else d = which === 'base' ? dot(sub(geom.end, local), normalize(sub(geom.end, geom.base))) : dot(sub(local, geom.base), normalize(sub(geom.end, geom.base)));
      state.values[param.id] = applyValueSet(Math.max(0, d), param.valueSet);
      break;
    }
    case 'polar':
      state.values[param.id] = { x: applyValueSet(dist(geom.base, local), param.distanceSet), y: applyValueSet(angleOf(sub(local, geom.base)), param.angleSet) };
      break;
    case 'xy':
      state.values[param.id] = { x: applyValueSet(local.x - geom.base.x, param.xSet), y: applyValueSet(local.y - geom.base.y, param.ySet) };
      break;
    case 'point':
      state.values[param.id] = local;
      break;
    case 'rotation':
      state.values[param.id] = applyValueSet(angleOf(sub(local, geom.base)), param.valueSet);
      break;
    case 'flip':
      state.values[param.id] = !e.dynamic?.values[param.id];
      break;
    case 'visibility': {
      const cur = String(entry.value ?? param.defaultState);
      const idx = param.states.findIndex((s) => s.name === cur);
      const next = param.states[(idx + 1) % param.states.length];
      state.visibilityState = next?.name;
      state.values[param.id] = next?.name ?? cur;
      break;
    }
    case 'lookup': {
      const table = block.dynamic.lookups.find((t) => t.id === param.tableId);
      if (!table?.rows.length) return null;
      const cur = String(e.dynamic?.values[param.id] ?? '');
      const idx = table.rows.findIndex((r) => r.label === cur);
      state.values[param.id] = table.rows[(idx + 1) % table.rows.length].label;
      break;
    }
    case 'alignment': {
      const rot = angleOf(sub(to, e.position));
      return { ...e, rotation: rot };
    }
    default:
      return null;
  }
  return { ...e, dynamic: state };
}

/** Restablece todos los valores dinámicos (RESETBLOCK). */
export function resetDynamic(e: InsertEntity): InsertEntity {
  return { ...e, dynamic: undefined };
}

// ------------------------------------------------------------------ validación (Editor de bloques)

export interface ValidationReport {
  warnings: string[];
  errors: string[];
}

export function validateDynamicBlock(ctx: EvalContext, block: BlockRecord): ValidationReport {
  const def = block.dynamic;
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!def) return { warnings, errors };
  const ids = new Set(ctx.doc.entitiesOf(block.id).map((e) => e.id));
  const names = new Set<string>();
  for (const p of def.parameters) {
    if (names.has(p.name.toLowerCase())) errors.push(`Nombre de parámetro duplicado: «${p.name}».`);
    names.add(p.name.toLowerCase());
    const needsAction = !['visibility', 'lookup', 'basepoint', 'alignment'].includes(p.type);
    if (needsAction && !def.actions.some((a) => a.paramId === p.id)) warnings.push(`⚠ El parámetro «${p.name}» no tiene ninguna acción asociada.`);
    if (p.type === 'visibility' && p.states.length < 2) warnings.push(`El parámetro de visibilidad «${p.name}» tiene menos de dos estados.`);
    if (p.type === 'lookup' && !def.lookups.some((t) => t.id === p.tableId)) errors.push(`El parámetro de consulta «${p.name}» no tiene tabla.`);
    if (p.type === 'linear' && dist(p.base, p.end) < 1e-12) errors.push(`El parámetro lineal «${p.name}» tiene longitud cero.`);
    if (p.type === 'linear' && p.valueSet.min !== undefined && p.valueSet.max !== undefined && p.valueSet.min > p.valueSet.max) errors.push(`«${p.name}»: mínimo mayor que máximo.`);
  }
  for (const a of def.actions) {
    const p = def.parameters.find((x) => x.id === a.paramId);
    if (!p) errors.push(`La acción «${a.name}» apunta a un parámetro inexistente.`);
    if (!a.selection.length && a.type !== 'lookup') warnings.push(`La acción «${a.name}» no tiene objetos seleccionados.`);
    const missing = a.selection.filter((id) => !ids.has(id) && !def.parameters.some((x) => x.id === id));
    if (missing.length) errors.push(`La acción «${a.name}» referencia ${missing.length} objeto(s) inexistente(s).`);
    if ((a.type === 'stretch' || a.type === 'polarstretch') && a.frame.length < 3) errors.push(`La acción «${a.name}» no tiene marco de estiramiento.`);
    if (p && a.type === 'rotate' && p.type !== 'rotation') errors.push(`La acción de giro «${a.name}» requiere un parámetro de rotación.`);
    if (p && a.type === 'flip' && p.type !== 'flip') errors.push(`La acción de simetría «${a.name}» requiere un parámetro de simetría.`);
  }
  const exprs: Record<string, string> = {};
  for (const v of def.variables) exprs[v.name] = v.expression;
  for (const c of def.constraints) if (c.kind === 'dimensional') exprs[c.name] = c.expression;
  try {
    topoSortExpressions(exprs);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  const scope = buildScope(def, undefined);
  for (const [name, ex] of Object.entries(exprs)) {
    try {
      evaluate(ex, scope);
    } catch (err) {
      errors.push(`Fórmula «${name} = ${ex}»: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const c of def.constraints) {
    const missing = c.refs.filter((r) => !ids.has(r.entityId));
    if (missing.length) errors.push(`La restricción ${c.kind === 'dimensional' ? `«${c.name}»` : c.type} referencia objetos inexistentes.`);
  }
  // prueba de evaluación con valores por defecto
  try {
    const ev = evaluateDynamic(ctx, block, ctx.doc.entitiesOf(block.id), undefined);
    warnings.push(...ev.warnings);
    if (ev.conflicts.length) warnings.push(`${ev.conflicts.length} restricción(es) en conflicto con los valores por defecto.`);
  } catch (err) {
    errors.push(`La evaluación falló: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { warnings, errors };
}
