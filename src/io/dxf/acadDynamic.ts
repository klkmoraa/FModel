import type { Vec2 } from '../../geometry/vec';
import { dist, sub } from '../../geometry/vec';
import { newId } from '../../document/ids';
import type { DynAction, DynamicBlockDefinition, DynamicInstanceState, DynParam, DynParamBase, Id, ValueSet } from '../../document/types';
import type { DxfFile, DxfRecord, Pair } from './parser';

/**
 * Bloques dinámicos de AutoCAD en DXF. La lógica dinámica vive en objetos no documentados
 * oficialmente: el BLOCK_RECORD de la definición tiene en su diccionario de extensión
 * `ACAD_ENHANCEDBLOCK` → `ACAD_EVALUATION_GRAPH`, cuyos nodos (`AcDbEvalExpr`, código 90) son
 * parámetros, acciones y pinzamientos. Cada instancia es un INSERT a un bloque anónimo `*U`
 * (XDATA `AcDbBlockRepBTag` → definición) con los valores actuales en
 * `AcDbBlockRepresentation/AppDataCache/ACAD_ENHANCEDBLOCKDATA` (un XRECORD por nodo).
 *
 * Solo se traducen los elementos con equivalente directo verificado frente a la geometría que
 * AutoCAD guarda en cada `*U`; si un bloque usa cualquier otro, no se convierte a medias: se
 * importa con sus representaciones estáticas y el informe dice por qué.
 */

const PARAMS: Record<string, DynParam['type']> = {
  BLOCKLINEARPARAMETER: 'linear',
  BLOCKPOINTPARAMETER: 'point',
  BLOCKROTATIONPARAMETER: 'rotation',
  BLOCKFLIPPARAMETER: 'flip',
  BLOCKVISIBILITYPARAMETER: 'visibility',
  BLOCKBASEPOINTPARAMETER: 'basepoint',
};
const ACTIONS: Record<string, DynAction['type']> = {
  BLOCKMOVEACTION: 'move',
  BLOCKSTRETCHACTION: 'stretch',
  BLOCKSCALEACTION: 'scale',
  BLOCKROTATEACTION: 'rotate',
  BLOCKFLIPACTION: 'flip',
};
/** Nombres legibles de lo que no se traduce (para el informe). */
const UNSUPPORTED: Record<string, string> = {
  BLOCKXYPARAMETER: 'parámetro XY',
  BLOCKPOLARPARAMETER: 'parámetro polar',
  BLOCKALIGNMENTPARAMETER: 'parámetro de alineación',
  BLOCKLOOKUPPARAMETER: 'parámetro de consulta',
  BLOCKLOOKUPACTION: 'acción de consulta',
  BLOCKARRAYACTION: 'acción de matriz',
  BLOCKPOLARSTRETCHACTION: 'acción de estiramiento polar',
  BLOCKPROPERTIESTABLE: 'tabla de propiedades de bloque',
  BLOCKUSERPARAMETER: 'parámetro de usuario',
};

// ------------------------------------------------------------------ utilidades de registros

/** Pares de un registro agrupados por marcador de subclase (código 100). */
function segments(rec: DxfRecord): Map<string, Pair[]> {
  const out = new Map<string, Pair[]>();
  let cur: Pair[] = [];
  out.set('', cur);
  for (const p of rec.pairs) {
    if (p[0] === 100) {
      cur = [];
      out.set(p[1].trim(), cur);
    } else cur.push(p);
  }
  return out;
}

const val = (pairs: Pair[] | undefined, code: number) => pairs?.find((p) => p[0] === code)?.[1].trim();
const num = (pairs: Pair[] | undefined, code: number, def = 0) => {
  const v = Number(val(pairs, code));
  return Number.isFinite(v) ? v : def;
};
const pt = (pairs: Pair[] | undefined, code: number): Vec2 => ({ x: num(pairs, code), y: num(pairs, code + 10) });
const handleOf = (rec: DxfRecord) => (val(rec.pairs, 5) ?? val(rec.pairs, 105) ?? '').toUpperCase();

/** Propietario real (330 fuera del grupo de reactores). */
function ownerOf(rec: DxfRecord): string {
  let inGroup = false;
  for (const [c, v] of rec.pairs) {
    if (c === 102) inGroup = v.trim().startsWith('{');
    else if (c === 330 && !inGroup) return v.trim().toUpperCase();
  }
  return '';
}

function xdict(rec: DxfRecord): string | undefined {
  const i = rec.pairs.findIndex(([c, v]) => c === 102 && v.trim() === '{ACAD_XDICTIONARY');
  return i >= 0 ? rec.pairs[i + 1]?.[1].trim().toUpperCase() : undefined;
}

function dictEntries(rec: DxfRecord | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!rec) return out;
  for (let i = 0; i < rec.pairs.length; i++) {
    const [c, v] = rec.pairs[i];
    if (c === 3) {
      const next = rec.pairs[i + 1];
      if (next && (next[0] === 350 || next[0] === 360)) out.set(v.trim(), next[1].trim().toUpperCase());
    }
  }
  return out;
}

/** Lista de n valores tras un código de cuenta (p. ej. 71 → n × 330). */
function counted(pairs: Pair[], countCode: number): string[] {
  const i = pairs.findIndex((p) => p[0] === countCode);
  if (i < 0) return [];
  const n = Number(pairs[i][1]);
  return pairs.slice(i + 1, i + 1 + n).map((p) => p[1].trim().toUpperCase());
}

/** Conjunto de valores: 307 (sin uso), 96 tipo (1 ninguno, 2 rango, 4 incremento, 8 lista), 141 mín, 142 máx, 143 incremento, 175 n y n valores. */
function valueSet(pairs: Pair[] | undefined, offset = 0): ValueSet {
  if (!pairs) return { kind: 'none' };
  const i = pairs.findIndex((p) => p[0] === 96);
  if (i < 0) return { kind: 'none' };
  const type = Number(pairs[i][1]);
  const read = (k: number) => Number(pairs[i + k]?.[1]);
  const min = read(1) + offset;
  const max = read(2) + offset;
  const inc = read(3);
  const n = read(4) || 0;
  const list = pairs.slice(i + 5, i + 5 + n).map((p) => Number(p[1]) + offset);
  const set: ValueSet = { kind: type & 8 && list.length ? 'list' : type & 4 && inc > 0 ? 'increment' : 'none' };
  if (type & 2 || type & 4) {
    if (Number.isFinite(min)) set.min = min;
    if (Number.isFinite(max) && max > min) set.max = max;
  }
  if (set.kind === 'increment') set.increment = inc;
  if (set.kind === 'list') set.list = list;
  return set;
}

// ------------------------------------------------------------------ definición

export interface AcadDynamicBlock {
  /** nombre del bloque de definición (mayúsculas) */
  name: string;
  handle: string;
  /** motivos por los que no se traduce (vacío = se traduce) */
  unsupported: string[];
  /** construye la definición con los IDs de entidad ya importados */
  build(handleToId: (h: string) => Id | undefined): { def: DynamicBlockDefinition; shown: Id[]; hidden: Id[]; missing: number };
  /** estado de una instancia a partir de los datos por nodo */
  state(nodes: Map<number, NodeData>): DynamicInstanceState;
}

export interface NodeData {
  points: Vec2[];
  strings: string[];
  ints: number[];
}

interface Index {
  byHandle: Map<string, DxfRecord>;
  blockRecords: Map<string, DxfRecord>;
}

function index(dxf: DxfFile): Index {
  const byHandle = new Map<string, DxfRecord>();
  for (const o of dxf.objects) byHandle.set(handleOf(o), o);
  const blockRecords = new Map<string, DxfRecord>();
  for (const r of dxf.tables.get('BLOCK_RECORD')?.records ?? []) {
    byHandle.set(handleOf(r), r);
    blockRecords.set((val(r.pairs, 2) ?? '').toUpperCase(), r);
  }
  return { byHandle, blockRecords };
}

const P = (name: string, label: string, gripCount: DynParamBase['gripCount']): Omit<DynParamBase, 'type'> => ({ id: newId('prm'), name, label, showInProperties: true, chainActions: false, gripCount });

/** Lee las definiciones dinámicas de AutoCAD de un DXF (clave: nombre del bloque en mayúsculas). */
export function readAcadDynamicBlocks(dxf: DxfFile): Map<string, AcadDynamicBlock> {
  const idx = index(dxf);
  const out = new Map<string, AcadDynamicBlock>();
  for (const [name, br] of idx.blockRecords) {
    const graphDict = dictEntries(idx.byHandle.get(xdict(br) ?? ''));
    const graphHandle = graphDict.get('ACAD_ENHANCEDBLOCK');
    if (!graphHandle) continue;
    const nodes = dxf.objects.filter((o) => ownerOf(o) === graphHandle);
    const unsupported = [...new Set(nodes.map((n) => UNSUPPORTED[n.type]).filter(Boolean))];
    const paramRecs = nodes.filter((n) => PARAMS[n.type]);
    const actionRecs = nodes.filter((n) => ACTIONS[n.type]);
    const nodeId = (r: DxfRecord) => num(segments(r).get('AcDbEvalExpr'), 90, -1);
    const paramByNode = new Map<number, { rec: DxfRecord; id: Id }>();
    const paramByHandle = new Map<string, Id>();
    for (const r of paramRecs) {
      const id = newId('prm');
      paramByNode.set(nodeId(r), { rec: r, id });
      paramByHandle.set(handleOf(r), id);
    }
    if (!paramRecs.length && !unsupported.length) continue;

    const block: AcadDynamicBlock = {
      name,
      handle: handleOf(br),
      unsupported,
      build(handleToId) {
        let missing = 0;
        const ent = (hs: string[]) =>
          hs
            .map((h) => {
              const id = paramByHandle.get(h) ?? handleToId(h);
              if (!id && !idx.byHandle.has(h)) missing++;
              return id;
            })
            .filter((x): x is Id => !!x);
        const hidden: Id[] = [];
        const shownControlled: Id[] = [];
        const parameters: DynParam[] = [];
        for (const [, { rec, id }] of paramByNode) {
          const s = segments(rec);
          const elem = val(s.get('AcDbBlockElement'), 300) ?? rec.type;
          const two = s.get('AcDbBlock2PtParameter');
          const one = s.get('AcDbBlock1PtParameter');
          switch (PARAMS[rec.type]) {
            case 'linear': {
              const sub2 = s.get('AcDbBlockLinearParameter');
              const label = val(sub2, 305) || elem;
              parameters.push({ ...P(label, label, 1), id, type: 'linear', base: pt(two, 1010), end: pt(two, 1011), baseLocation: num(two, 177) === 1 ? 'middle' : 'start', valueSet: valueSet(sub2), description: val(sub2, 306) || undefined });
              break;
            }
            case 'point': {
              const label = val(s.get('AcDbBlockPointParameter'), 303) || elem;
              parameters.push({ ...P(label, label, 1), id, type: 'point', point: pt(one, 1010) });
              break;
            }
            case 'rotation': {
              const sub2 = s.get('AcDbBlockRotationParameter');
              const base = pt(two, 1010);
              const end = pt(two, 1011);
              const baseAngle = Math.atan2(pt(sub2, 1011).y - base.y, pt(sub2, 1011).x - base.x);
              const label = val(sub2, 305) || elem;
              parameters.push({ ...P(label, label, 1), id, type: 'rotation', base, radius: dist(base, end), angle: Math.atan2(end.y - base.y, end.x - base.x), valueSet: valueSet(sub2, baseAngle), description: val(sub2, 306) || undefined });
              break;
            }
            case 'flip': {
              const sub2 = s.get('AcDbBlockFlipParameter');
              const label = val(sub2, 305) || elem;
              parameters.push({ ...P(label, label, 1), id, type: 'flip', base: pt(two, 1010), end: pt(two, 1011), labelNotFlipped: val(sub2, 307) || 'No invertido', labelFlipped: val(sub2, 308) || 'Invertido' });
              break;
            }
            case 'visibility': {
              const sub2 = s.get('AcDbBlockVisibilityParameter') ?? [];
              const label = val(sub2, 301) || elem;
              const controlled = ent(counted(sub2, 93));
              const states: { name: string; visible: Id[] }[] = [];
              for (let i = 0; i < sub2.length; i++) {
                if (sub2[i][0] !== 303) continue;
                const rest = sub2.slice(i + 1);
                states.push({ name: sub2[i][1].trim(), visible: ent(counted(rest, 94)) });
              }
              const shown = new Set(states.flatMap((st) => st.visible));
              // AutoCAD guarda la visibilidad del estado actual en cada entidad: el parámetro manda
              for (const c of controlled) (shown.has(c) ? shownControlled : hidden).push(c);
              parameters.push({ ...P(label, label, 1), id, type: 'visibility', position: pt(one, 1010), states, defaultState: states[0]?.name ?? '' });
              break;
            }
            case 'basepoint':
              parameters.push({ ...P(elem, elem, 0), id, type: 'basepoint', point: pt(one, 1010) });
              break;
          }
        }
        const actions: DynAction[] = [];
        for (const rec of actionRecs) {
          const s = segments(rec);
          const name = val(s.get('AcDbBlockElement'), 300) ?? rec.type;
          const base = s.get('AcDbBlockAction') ?? [];
          const selection = ent(counted(base, 71));
          const kind = ACTIONS[rec.type];
          const conn = (sub2: Pair[] | undefined, code: number) => paramByNode.get(num(sub2, code, -1));
          // AutoCAD y LibreDWG no usan los mismos códigos para algunas conexiones: el nombre
          // de la conexión va justo después del id del nodo
          const connNamed = (sub2: Pair[] | undefined, name: string) => {
            const i = sub2?.findIndex((q) => q[1].trim() === name) ?? -1;
            return i > 0 ? paramByNode.get(Number(sub2![i - 1][1])) : undefined;
          };
          const which = (label: string | undefined) => (/base/i.test(label ?? '') ? 'base' : 'end') as 'base' | 'end';
          const withBase = s.get('AcDbBlockActionWithBasePt');
          const baseType = num(withBase, 280, 1) ? ('dependent' as const) : ('independent' as const);
          if (kind === 'move') {
            const m = s.get('AcDbBlockMoveAction');
            const p = conn(m, 92) ?? conn(m, 93);
            if (p) actions.push({ id: newId('act'), type: 'move', name, paramId: p.id, selection, paramPoint: which(val(m, 301)), axis: 'xy', distanceMultiplier: num(m, 140, 1) || 1, angleOffset: num(m, 141) });
          } else if (kind === 'stretch') {
            const m = s.get('AcDbBlockStretchAction') ?? [];
            const p = conn(m, 92) ?? conn(m, 93);
            const fi = m.findIndex((q) => q[0] === 72);
            const corners: Vec2[] = [];
            for (let k = 0; fi >= 0 && k < Number(m[fi][1]); k++) corners.push({ x: Number(m[fi + 1 + 2 * k]?.[1]), y: Number(m[fi + 2 + 2 * k]?.[1]) });
            const frame = corners.length === 2 ? [corners[0], { x: corners[1].x, y: corners[0].y }, corners[1], { x: corners[0].x, y: corners[1].y }] : corners;
            const bound = ent(m.filter((q) => q[0] === 331).map((q) => q[1].trim().toUpperCase()));
            if (p) actions.push({ id: newId('act'), type: 'stretch', name, paramId: p.id, selection: [...new Set([...selection, ...bound])], paramPoint: which(val(m, 301)), frame, axis: 'xy', distanceMultiplier: num(m, 140, 1) || 1, angleOffset: num(m, 141) });
          } else if (kind === 'scale') {
            const p = connNamed(s.get('AcDbBlockScaleAction'), 'Scale') ?? conn(s.get('AcDbBlockScaleAction'), 94);
            if (p) actions.push({ id: newId('act'), type: 'scale', name, paramId: p.id, selection, baseType, basePoint: baseType === 'independent' ? pt(withBase, 1012) : undefined, axis: 'xy' });
          } else if (kind === 'rotate') {
            const p = connNamed(s.get('AcDbBlockRotationAction'), 'AngleDelta') ?? conn(s.get('AcDbBlockRotationAction'), 94);
            if (p) actions.push({ id: newId('act'), type: 'rotate', name, paramId: p.id, selection, baseType, basePoint: baseType === 'independent' ? pt(withBase, 1012) : undefined });
          } else if (kind === 'flip') {
            const p = conn(s.get('AcDbBlockFlipAction'), 92);
            if (p) actions.push({ id: newId('act'), type: 'flip', name, paramId: p.id, selection });
          }
        }
        const def: DynamicBlockDefinition = { parameters, actions, constraints: [], lookups: [], variables: [], propertyOrder: parameters.filter((p) => p.type !== 'basepoint').map((p) => p.id) };
        return { def, shown: shownControlled, hidden, missing };
      },
      state(data) {
        const values: DynamicInstanceState['values'] = {};
        let visibilityState: string | undefined;
        for (const [node, { rec, id }] of paramByNode) {
          const d = data.get(node);
          if (!d) continue;
          const s = segments(rec);
          switch (PARAMS[rec.type]) {
            case 'linear':
              if (d.points.length >= 2) values[id] = dist(d.points[0], d.points[1]);
              break;
            case 'point':
              if (d.points.length) values[id] = d.points[0];
              break;
            case 'rotation':
              if (d.points.length >= 2) {
                // ángulo absoluto llevado al rango [ángulo base, ángulo base + 2π) del conjunto de valores
                const v = sub(d.points[1], d.points[0]);
                const b0 = pt(s.get('AcDbBlock2PtParameter'), 1010);
                const b1 = pt(s.get('AcDbBlockRotationParameter'), 1011);
                const baseAngle = Math.atan2(b1.y - b0.y, b1.x - b0.x);
                const turn = 2 * Math.PI;
                values[id] = baseAngle + ((((Math.atan2(v.y, v.x) - baseAngle) % turn) + turn) % turn);
              }
              break;
            case 'flip':
              if (d.ints.length) values[id] = d.ints[d.ints.length - 1] === 1;
              break;
            case 'visibility':
              if (d.strings[0]) {
                values[id] = d.strings[0];
                visibilityState = d.strings[0];
              }
              break;
          }
        }
        return visibilityState ? { values, visibilityState } : { values };
      },
    };
    out.set(name, block);
  }
  return out;
}

// ------------------------------------------------------------------ instancias

export interface AcadInstanceRef {
  /** nombre (mayúsculas) de la definición dinámica */
  definition: string;
  nodes: Map<number, NodeData>;
}

/** Relaciona los bloques anónimos `*U` con su definición (XDATA AcDbBlockRepBTag → handle). */
export function anonymousRepresentations(dxf: DxfFile): Map<string, string> {
  const idx = index(dxf);
  const byHandle = new Map<string, string>();
  for (const [name, r] of idx.blockRecords) byHandle.set(handleOf(r), name);
  const out = new Map<string, string>();
  for (const [name, r] of idx.blockRecords) {
    const i = r.pairs.findIndex(([c, v]) => c === 1001 && v.trim() === 'AcDbBlockRepBTag');
    if (i < 0) continue;
    const h = r.pairs.slice(i + 1).find(([c]) => c === 1005)?.[1].trim().toUpperCase();
    const def = h ? byHandle.get(h) : undefined;
    if (def) out.set(name, def);
  }
  return out;
}

/** Datos por nodo de una instancia (ACAD_ENHANCEDBLOCKDATA en su diccionario de extensión). */
export function instanceNodes(dxf: DxfFile, insert: DxfRecord, byHandle = index(dxf).byHandle): Map<number, NodeData> {
  const out = new Map<number, NodeData>();
  const rep = dictEntries(byHandle.get(xdict(insert) ?? '')).get('AcDbBlockRepresentation');
  const cache = dictEntries(byHandle.get(rep ?? '')).get('AppDataCache');
  const data = dictEntries(byHandle.get(dictEntries(byHandle.get(cache ?? '')).get('ACAD_ENHANCEDBLOCKDATA') ?? ''));
  for (const [key, h] of data) {
    const x = byHandle.get(h);
    if (!x) continue;
    const d: NodeData = { points: [], strings: [], ints: [] };
    const pairs = x.pairs;
    for (let i = 0; i < pairs.length; i++) {
      const [c, v] = pairs[i];
      if (c === 10) d.points.push({ x: Number(v), y: Number(pairs[i + 1]?.[1] ?? 0) });
      else if (c === 1) d.strings.push(v.trim());
      else if (c === 70) d.ints.push(Number(v));
    }
    // los dos primeros 70 (25, 104) son la cabecera del registro
    d.ints = d.ints.slice(2);
    out.set(Number(key), d);
  }
  return out;
}

export function acadIndex(dxf: DxfFile) {
  return index(dxf).byHandle;
}
