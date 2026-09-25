import {
  addDrawingConstraint,
  addParameter,
  admitConstraints,
  applyParameterSet,
  ConstraintError,
  findNamed,
  inferConstraints,
  isSpaceOwner,
  nextParameterName,
  parameterScope,
  removeDrawingConstraint,
  removeParameter,
  renameNamed,
  saveParameterSet,
  setNamedExpression,
  usedNames,
  validParameterName,
} from '../constraints/drawing';
import { isConstrainable, measureConstraint, refPoint, refSegment } from '../constraints/solver';
import { newId } from '../document/ids';
import type { DimAssocRef, DimConstraintType, DimensionEntity, DrawingConstraint, Entity, GeoConstraintType, GeoRef, Id } from '../document/types';
import type { Transaction } from '../document/document';
import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import { kindOf } from '../model/registry';
import { closestPoint } from '../geometry/curves';
import { findCommand } from './registry';
import { fail, K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

/** ¿Estamos editando la definición de un bloque? Entonces las restricciones son del bloque. */
function inBlockEditor(api: CommandApi): boolean {
  const s = api.editor.blockEdit;
  return !!s && !s.testing && api.editor.space === s.blockId;
}

/** Ejecuta una operación del modelo paramétrico traduciendo sus errores al comando. */
function apply<T>(api: CommandApi, label: string, fn: (tx: Transaction) => T): T {
  try {
    return api.apply(label, fn);
  } catch (err) {
    if (err instanceof ConstraintError) throw new CommandError(err.l10n);
    throw err;
  }
}

// ------------------------------------------------------------------ designación de características

/** Punto característico más cercano al punto designado. */
function pointRef(e: Entity, p: Vec2): GeoRef | null {
  const parts: string[] =
    e.type === 'line' ? ['start', 'end', 'mid'] :
      e.type === 'arc' ? ['start', 'end', 'center'] :
        e.type === 'circle' || e.type === 'ellipse' ? ['center'] :
          e.type === 'lwpolyline' ? e.vertices.map((_, i) => `vertex:${i}`) :
            ['point'];
  let best: GeoRef | null = null;
  let bd = Infinity;
  for (const part of parts) {
    const q = refPoint(e, part);
    if (!q) continue;
    const d = dist(q, p);
    if (d < bd) {
      bd = d;
      best = { entityId: e.id, part };
    }
  }
  return best;
}

/** Tramo recto designado (línea o segmento de polilínea más cercano). */
export function segmentRef(api: CommandApi, e: Entity, p: Vec2): GeoRef | null {
  if (e.type === 'line') return { entityId: e.id, part: 'edge' };
  if (e.type !== 'lwpolyline') return null;
  const curves = kindOf(e).curves(e, api.editor.ctx);
  let best = -1;
  let bd = Infinity;
  curves.forEach((c, i) => {
    const d = dist(closestPoint(c, p), p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  const part = `segment:${best}`;
  return best >= 0 && refSegment(e, part) ? { entityId: e.id, part } : null;
}

const SEGMENT_TYPES = ['line', 'lwpolyline'] as const;
const CURVE_TYPES = ['circle', 'arc'] as const;
const POINT_TYPES = ['line', 'arc', 'circle', 'ellipse', 'lwpolyline', 'point', 'text', 'mtext', 'insert'] as const;

async function pickEntity(api: CommandApi, es: string, en: string, types: readonly Entity['type'][]): Promise<{ e: Entity; p: Vec2 } | null> {
  const r = await api.getEntity({ prompt: L(es, en), types: [...types] });
  if (r.kind !== 'entity') return null;
  const e = api.editor.doc.entity(r.id);
  if (!e) return null;
  if (!isSpaceOwner(api.editor.doc.data, e.owner) || !isConstrainable(e)) fail('Ese objeto no admite restricciones del dibujo.', 'That object does not support drawing constraints.');
  return { e, p: r.p };
}

async function pickSegment(api: CommandApi, es: string, en: string): Promise<GeoRef | null> {
  const r = await pickEntity(api, es, en, SEGMENT_TYPES);
  if (!r) return null;
  const ref = segmentRef(api, r.e, r.p);
  if (!ref) fail('Designa un tramo recto.', 'Select a straight segment.');
  return ref;
}

async function pickPoint(api: CommandApi, es: string, en: string): Promise<GeoRef | null> {
  const r = await pickEntity(api, es, en, POINT_TYPES);
  if (!r) return null;
  const ref = pointRef(r.e, r.p);
  if (!ref) fail('Ese objeto no tiene puntos restringibles.', 'That object has no constrainable points.');
  return ref;
}

// ------------------------------------------------------------------ restricciones geométricas

const GEO_TYPES: [GeoConstraintType, string, string, string][] = [
  ['horizontal', 'Horizontal', 'Horizontal', 'GCHORIZONTAL'],
  ['vertical', 'Vertical', 'Vertical', 'GCVERTICAL'],
  ['perpendicular', 'Perpendicular', 'Perpendicular', 'GCPERPENDICULAR'],
  ['parallel', 'Paralela', 'Parallel', 'GCPARALLEL'],
  ['tangent', 'Tangente', 'Tangent', 'GCTANGENT'],
  ['coincident', 'Coincidente', 'Coincident', 'GCCOINCIDENT'],
  ['collinear', 'Colineal', 'Collinear', 'GCCOLLINEAR'],
  ['concentric', 'Concéntrica', 'Concentric', 'GCCONCENTRIC'],
  ['symmetric', 'Simétrica', 'Symmetric', 'GCSYMMETRIC'],
  ['equal', 'Igual', 'Equal', 'GCEQUAL'],
  ['fixed', 'Fija', 'Fix', 'GCFIX'],
];

/** Pide las referencias de una restricción geométrica; null si se cancela. */
async function geoRefs(api: CommandApi, type: GeoConstraintType): Promise<GeoRef[] | null> {
  const doc = api.editor.doc;
  switch (type) {
    case 'horizontal':
    case 'vertical': {
      const r = await api.getEntity({ prompt: L('Designe un tramo', 'Select a segment'), types: [...SEGMENT_TYPES], keywords: [K('2Points', '2Puntos', '2Points', ['2p', '2'])] });
      if (r.kind === 'keyword') {
        const a = await pickPoint(api, 'Designe el primer punto', 'Select first point');
        const b = a && (await pickPoint(api, 'Designe el segundo punto', 'Select second point'));
        return a && b ? [a, b] : null;
      }
      if (r.kind !== 'entity') return null;
      const e = doc.entity(r.id);
      const ref = e && segmentRef(api, e, r.p);
      if (!ref) fail('Designa un tramo recto.', 'Select a straight segment.');
      return [ref!];
    }
    case 'parallel':
    case 'perpendicular':
    case 'collinear': {
      const a = await pickSegment(api, 'Designe el primer tramo (se queda quieto)', 'Select first segment (stays put)');
      const b = a && (await pickSegment(api, 'Designe el segundo tramo', 'Select second segment'));
      return a && b ? [a, b] : null;
    }
    case 'coincident': {
      const a = await pickPoint(api, 'Designe el primer punto (se queda quieto)', 'Select first point (stays put)');
      const b = a && (await pickPoint(api, 'Designe el segundo punto', 'Select second point'));
      return a && b ? [a, b] : null;
    }
    case 'concentric': {
      const a = await pickEntity(api, 'Designe el primer círculo o arco', 'Select first circle or arc', [...CURVE_TYPES, 'ellipse']);
      const b = a && (await pickEntity(api, 'Designe el segundo círculo o arco', 'Select second circle or arc', [...CURVE_TYPES, 'ellipse']));
      return a && b ? [{ entityId: a.e.id, part: 'center' }, { entityId: b.e.id, part: 'center' }] : null;
    }
    case 'tangent': {
      const a = await pickEntity(api, 'Designe el primer objeto (línea, arco o círculo)', 'Select first object (line, arc or circle)', [...SEGMENT_TYPES, ...CURVE_TYPES]);
      if (!a) return null;
      const b = await pickEntity(api, 'Designe el segundo objeto', 'Select second object', a.e.type === 'circle' || a.e.type === 'arc' ? [...SEGMENT_TYPES, ...CURVE_TYPES] : [...CURVE_TYPES]);
      if (!b) return null;
      const refOf = (x: { e: Entity; p: Vec2 }) => (x.e.type === 'circle' || x.e.type === 'arc' ? { entityId: x.e.id, part: 'edge' } : segmentRef(api, x.e, x.p));
      const ra = refOf(a);
      const rb = refOf(b);
      if (!ra || !rb) fail('Designa un tramo recto y un arco o círculo.', 'Select a straight segment and an arc or circle.');
      // el tramo va primero; el orden de designación decide qué se mueve
      return b.e.type === 'line' || b.e.type === 'lwpolyline' ? [rb!, ra!] : [ra!, rb!];
    }
    case 'equal': {
      const a = await pickEntity(api, 'Designe el primer objeto (tramo, arco o círculo)', 'Select first object (segment, arc or circle)', [...SEGMENT_TYPES, ...CURVE_TYPES]);
      if (!a) return null;
      const round = a.e.type === 'circle' || a.e.type === 'arc';
      const b = await pickEntity(api, 'Designe el segundo objeto del mismo tipo', 'Select second object of the same kind', round ? [...CURVE_TYPES] : [...SEGMENT_TYPES]);
      if (!b) return null;
      if (round) return [{ entityId: a.e.id, part: 'edge' }, { entityId: b.e.id, part: 'edge' }];
      const ra = segmentRef(api, a.e, a.p);
      const rb = segmentRef(api, b.e, b.p);
      if (!ra || !rb) fail('Designa dos tramos rectos.', 'Select two straight segments.');
      return [ra!, rb!];
    }
    case 'symmetric': {
      const a = await pickPoint(api, 'Designe el primer punto', 'Select first point');
      const b = a && (await pickPoint(api, 'Designe el segundo punto', 'Select second point'));
      const axis = b && (await pickSegment(api, 'Designe el eje de simetría', 'Select symmetry axis'));
      return a && b && axis ? [a, b, axis] : null;
    }
    case 'fixed': {
      const r = await api.getEntity({ prompt: L('Designe el punto a fijar', 'Select point to fix'), types: [...POINT_TYPES], keywords: [K('Object', 'Objeto', 'Object', ['o'])] });
      if (r.kind === 'keyword') {
        const o = await pickEntity(api, 'Designe el objeto a fijar', 'Select object to fix', POINT_TYPES);
        return o ? [{ entityId: o.e.id, part: 'edge' }] : null;
      }
      if (r.kind !== 'entity') return null;
      const e = doc.entity(r.id);
      const ref = e && pointRef(e, r.p);
      return ref ? [ref] : null;
    }
  }
}

async function runGeomConstraint(api: CommandApi, preset?: GeoConstraintType) {
  let type = preset;
  if (!type) {
    const k = await api.getKeyword({ prompt: L('Tipo de restricción geométrica', 'Geometric constraint type'), keywords: GEO_TYPES.map(([t, es, en]) => K(t, es, en)), defaultValue: 'coincident' });
    if (k.kind !== 'keyword') return;
    type = k.key as GeoConstraintType;
  }
  const refs = await geoRefs(api, type);
  if (!refs) return;
  const owner = api.editor.doc.entity(refs[0].entityId)!.owner;
  const c: DrawingConstraint = { id: newId('cns'), kind: 'geometric', type, refs, enabled: true, owner };
  apply(api, 'GEOMCONSTRAINT', (tx) => addDrawingConstraint(tx, c, new Set([refs[0].entityId])));
}

const GEOMCONSTRAINT: CommandDef = {
  name: 'GEOMCONSTRAINT',
  aliases: ['GCON', 'RESTRICCION', 'RESTGEOM'],
  category: 'constraint',
  label: L('Restricción geométrica', 'Geometric constraint'),
  description: L('Relaciona objetos del dibujo: horizontal, vertical, paralela, perpendicular, coincidente, tangente, concéntrica, igual, simétrica, colineal o fija. El segundo objeto se adapta al primero.', 'Relates drawing objects: horizontal, vertical, parallel, perpendicular, coincident, tangent, concentric, equal, symmetric, collinear or fix. The second object adapts to the first.'),
  icon: 'constraint',
  async run(api, args) {
    if (inBlockEditor(api)) return findCommand('BCONSTRAINT')!.run(api, args);
    const preset = GEO_TYPES.find(([t]) => t === args?.[0]?.toLowerCase())?.[0];
    await runGeomConstraint(api, preset);
  },
};

const GC_SHORTCUTS: CommandDef[] = GEO_TYPES.map(([type, es, en, name]) => ({
  name,
  aliases: [],
  category: 'constraint',
  label: L(`Restricción ${es.toLowerCase()}`, `${en} constraint`),
  description: L(`Aplica una restricción ${es.toLowerCase()} entre objetos del dibujo.`, `Applies a ${en.toLowerCase()} constraint between drawing objects.`),
  icon: name.toLowerCase(),
  async run(api) {
    if (inBlockEditor(api)) fail('En el Editor de bloques usa BCONSTRAINT.', 'In the Block editor use BCONSTRAINT.');
    await runGeomConstraint(api, type);
  },
}));

// ------------------------------------------------------------------ restricciones dimensionales

const DIM_TYPES: [DimConstraintType | 'linear' | 'convert', string, string, string][] = [
  ['linear', 'Lineal', 'Linear', 'DCLINEAR'],
  ['linear-h', 'Horizontal', 'Horizontal', 'DCHORIZONTAL'],
  ['linear-v', 'Vertical', 'Vertical', 'DCVERTICAL'],
  ['aligned', 'Alineada', 'Aligned', 'DCALIGNED'],
  ['angular', 'Angular', 'Angular', 'DCANGULAR'],
  ['radius', 'Radio', 'Radius', 'DCRADIUS'],
  ['diameter', 'Diámetro', 'Diameter', 'DCDIAMETER'],
  ['convert', 'Convertir', 'Convert', 'DCCONVERT'],
];

const round6 = (v: number) => String(Math.round(v * 1e6) / 1e6);

/** Pide nombre y fórmula y añade la cota; el valor inicial es la medida actual. */
async function finishDimension(api: CommandApi, type: DimConstraintType, refs: GeoRef[], owner: Id) {
  const data = api.editor.doc.data;
  const draft: DrawingConstraint = { id: newId('cns'), kind: 'dimensional', type, name: '', refs, expression: '0', isParameter: false, valueSet: { kind: 'none' }, owner };
  const measured = measureConstraint(draft, data.entities);
  if (measured === null) fail('No se puede medir esa geometría.', 'That geometry cannot be measured.');
  const n = await api.getString({ prompt: L('Nombre de la cota', 'Dimension name'), defaultValue: nextParameterName(data, 'd') });
  if (n.kind !== 'string') return;
  const name = n.value.trim();
  if (!validParameterName(name)) fail('Nombre no válido: usa letras, dígitos y _ (sin empezar por dígito).', 'Invalid name: use letters, digits and _ (not starting with a digit).');
  const ex = await api.getString({ prompt: L('Valor o fórmula', 'Value or formula'), defaultValue: round6(type === 'angular' ? measured! : Math.abs(measured!)), allowSpaces: true });
  if (ex.kind !== 'string') return;
  const c: DrawingConstraint = { ...draft, name, expression: ex.value.trim() || round6(measured!) };
  apply(api, 'DIMCONSTRAINT', (tx) => addDrawingConstraint(tx, c));
  api.info(L(`Cota de restricción «${name}» = ${c.expression}.`, `Constraint dimension "${name}" = ${c.expression}.`));
}

/** Parte de restricción equivalente a una referencia asociativa de cota. */
function assocToRef(a: DimAssocRef, e: Entity | undefined): GeoRef | null {
  if (!e) return null;
  switch (a.snap) {
    case 'endpoint-start':
      return e.type === 'lwpolyline' ? { entityId: e.id, part: `vertex:${a.index ?? 0}` } : { entityId: e.id, part: 'start' };
    case 'endpoint-end':
      return e.type === 'lwpolyline' ? { entityId: e.id, part: `vertex:${a.index ?? e.vertices.length - 1}` } : { entityId: e.id, part: 'end' };
    case 'vertex':
      return a.index !== undefined ? { entityId: e.id, part: `vertex:${a.index}` } : null;
    case 'center':
      return { entityId: e.id, part: 'center' };
    case 'midpoint':
      return e.type === 'line' ? { entityId: e.id, part: 'mid' } : null;
    case 'insertion':
      return { entityId: e.id, part: 'point' };
    default:
      return null;
  }
}

/** Convierte cotas asociativas en restricciones dimensionales (conserva la cota). */
async function convertDimensions(api: CommandApi) {
  const ids = await api.getSelection({ prompt: L('Designe cotas asociativas a convertir', 'Select associative dimensions to convert'), types: ['dimension'], usePreselection: true });
  const doc = api.editor.doc;
  let made = 0;
  let skipped = 0;
  apply(api, 'DCCONVERT', (tx) => {
    for (const id of ids) {
      const dim = doc.entity(id) as DimensionEntity | undefined;
      if (!dim || dim.type !== 'dimension' || !dim.assoc?.length) {
        skipped++;
        continue;
      }
      let type: DimConstraintType | null = null;
      let refs: GeoRef[] = [];
      if (dim.dimType === 'radial' || dim.dimType === 'diametric') {
        const target = dim.assoc.find((a) => a.point === 'center' || a.point === 'chord');
        const e = target && doc.entity(target.entityId);
        if (e && (e.type === 'circle' || e.type === 'arc')) {
          type = dim.dimType === 'radial' ? 'radius' : 'diameter';
          refs = [{ entityId: e.id, part: 'edge' }];
        }
      } else if (dim.dimType === 'linear' || dim.dimType === 'aligned') {
        const a = dim.assoc.find((r) => r.point === 'p1');
        const b = dim.assoc.find((r) => r.point === 'p2');
        const ra = a && assocToRef(a, doc.entity(a.entityId));
        const rb = b && assocToRef(b, doc.entity(b.entityId));
        const rot = ((dim.rotation % Math.PI) + Math.PI) % Math.PI;
        if (ra && rb) {
          refs = [ra, rb];
          type = dim.dimType === 'aligned' ? 'aligned' : Math.abs(rot) < 1e-9 || Math.abs(rot - Math.PI) < 1e-9 ? 'linear-h' : Math.abs(rot - Math.PI / 2) < 1e-9 ? 'linear-v' : null;
        }
      }
      if (!type) {
        skipped++;
        continue;
      }
      const draft: DrawingConstraint = { id: newId('cns'), kind: 'dimensional', type, name: nextParameterName(tx.doc.data, 'd'), refs, expression: '0', isParameter: false, valueSet: { kind: 'none' }, owner: dim.owner };
      const measured = measureConstraint(draft, tx.doc.data.entities);
      if (measured === null) {
        skipped++;
        continue;
      }
      addDrawingConstraint(tx, { ...draft, expression: round6(Math.abs(measured)) });
      made++;
    }
  });
  api.info(L(`${made} cota(s) convertida(s) en restricción; ${skipped} omitida(s) (sin asociación o tipo no admitido).`, `${made} dimension(s) converted to constraints; ${skipped} skipped (not associative or unsupported type).`));
}

type DimChoice = (typeof DIM_TYPES)[number][0];

async function runDimConstraint(api: CommandApi, preset?: DimChoice) {
  let type: DimChoice;
  if (preset) type = preset;
  else {
    const k = await api.getKeyword({ prompt: L('Tipo de cota de restricción', 'Constraint dimension type'), keywords: DIM_TYPES.map(([t, es, en]) => K(t, es, en)), defaultValue: 'linear' });
    if (k.kind !== 'keyword') return;
    type = k.key as DimChoice;
  }
  if (type === 'convert') return convertDimensions(api);
  if (type === 'radius' || type === 'diameter') {
    const r = await pickEntity(api, 'Designe un arco o círculo', 'Select an arc or circle', CURVE_TYPES);
    if (r) await finishDimension(api, type, [{ entityId: r.e.id, part: 'edge' }], r.e.owner);
    return;
  }
  if (type === 'angular') {
    const a = await pickSegment(api, 'Designe la primera línea', 'Select first line');
    const b = a && (await pickSegment(api, 'Designe la segunda línea', 'Select second line'));
    if (a && b) await finishDimension(api, 'angular', [a, b], api.editor.doc.entity(a.entityId)!.owner);
    return;
  }
  const r = await api.getEntity({ prompt: L('Designe el primer punto o elija Objeto para un tramo', 'Select first point or choose Object for a segment'), types: [...POINT_TYPES], keywords: [K('Object', 'Objeto', 'Object', ['o'])] });
  let refs: GeoRef[] | null = null;
  if (r.kind === 'keyword') {
    const s = await pickSegment(api, 'Designe el tramo', 'Select the segment');
    refs = s ? [s] : null;
  } else if (r.kind === 'entity') {
    const e = api.editor.doc.entity(r.id);
    const a = e && pointRef(e, r.p);
    if (!a) fail('Ese objeto no tiene puntos restringibles.', 'That object has no constrainable points.');
    const b = await pickPoint(api, 'Designe el segundo punto', 'Select second point');
    refs = b ? [a!, b] : null;
  }
  if (!refs) return;
  const owner = api.editor.doc.entity(refs[0].entityId)!.owner;
  let dimType: DimConstraintType = type === 'linear' ? 'linear-h' : type;
  if (type === 'linear') {
    const ents = api.editor.doc.data.entities;
    const pa = refs.length === 2 ? refPoint(ents.get(refs[0].entityId)!, refs[0].part) : refSegment(ents.get(refs[0].entityId)!, refs[0].part)?.[0];
    const pb = refs.length === 2 ? refPoint(ents.get(refs[1].entityId)!, refs[1].part) : refSegment(ents.get(refs[0].entityId)!, refs[0].part)?.[1];
    if (pa && pb) dimType = Math.abs(pb.y - pa.y) > Math.abs(pb.x - pa.x) ? 'linear-v' : 'linear-h';
  }
  await finishDimension(api, dimType, refs, owner);
}

const DIMCONSTRAINT: CommandDef = {
  name: 'DIMCONSTRAINT',
  aliases: ['DCON', 'COTARESTRICCION'],
  category: 'constraint',
  label: L('Cota de restricción', 'Constraint dimension'),
  description: L('Cota que gobierna la geometría: lineal, horizontal, vertical, alineada, angular, radio o diámetro, con nombre y fórmula. Convertir transforma cotas asociativas existentes.', 'Dimension that drives geometry: linear, horizontal, vertical, aligned, angular, radius or diameter, with name and formula. Convert turns existing associative dimensions into constraints.'),
  icon: 'constraint',
  async run(api, args) {
    if (inBlockEditor(api)) return findCommand('BCPARAMETER')!.run(api, args);
    const preset = DIM_TYPES.find(([t]) => t === args?.[0]?.toLowerCase())?.[0];
    await runDimConstraint(api, preset);
  },
};

const DC_ICON: Record<DimChoice, string> = { linear: 'dimlinear', 'linear-h': 'dimlinear', 'linear-v': 'dimlinear', aligned: 'dimaligned', angular: 'dimangular', radius: 'dimradius', diameter: 'dimdiameter', convert: 'constraint' };

const DC_SHORTCUTS: CommandDef[] = DIM_TYPES.map(([type, es, en, name]) => ({
  name,
  aliases: [],
  category: 'constraint',
  label: L(`Cota de restricción ${es.toLowerCase()}`, `${en} constraint dimension`),
  description: type === 'convert'
    ? L('Convierte cotas asociativas en cotas de restricción.', 'Converts associative dimensions into constraint dimensions.')
    : L(`Crea una cota de restricción ${es.toLowerCase()} con nombre y fórmula.`, `Creates a ${en.toLowerCase()} constraint dimension with name and formula.`),
  icon: DC_ICON[type],
  async run(api) {
    if (inBlockEditor(api)) fail('En el Editor de bloques usa BCPARAMETER.', 'In the Block editor use BCPARAMETER.');
    await runDimConstraint(api, type);
  },
}));

// ------------------------------------------------------------------ automáticas y gestión

const COUNT_LABEL: Record<string, [string, string]> = {
  coincident: ['coincidentes', 'coincident'],
  horizontal: ['horizontales', 'horizontal'],
  vertical: ['verticales', 'vertical'],
  perpendicular: ['perpendiculares', 'perpendicular'],
  parallel: ['paralelas', 'parallel'],
  tangent: ['tangentes', 'tangent'],
  concentric: ['concéntricas', 'concentric'],
};

const AUTOCONSTRAIN: CommandDef = {
  name: 'AUTOCONSTRAIN',
  aliases: ['AUTORESTRICCION', 'AUTORESTRINGIR'],
  category: 'constraint',
  label: L('Restringir automáticamente', 'Auto constrain'),
  description: L('Detecta las relaciones que la geometría seleccionada ya cumple (uniones, ejes, perpendiculares, paralelas, tangencias y centros comunes) y las convierte en restricciones.', 'Detects the relationships the selected geometry already meets (joints, axes, perpendiculars, parallels, tangencies and shared centers) and turns them into constraints.'),
  icon: 'autoconstrain',
  async run(api) {
    if (inBlockEditor(api)) fail('En el Editor de bloques usa BCONSTRAINT.', 'In the Block editor use BCONSTRAINT.');
    const doc = api.editor.doc;
    const ids = (await api.getSelection({ prompt: L('Designe objetos', 'Select objects'), usePreselection: true })).filter((id) => {
      const e = doc.entity(id);
      return !!e && isSpaceOwner(doc.data, e.owner) && isConstrainable(e);
    });
    if (!ids.length) fail('Ningún objeto seleccionado admite restricciones.', 'No selected object supports constraints.');
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const b = kindOf(doc.entity(id)!).bbox(doc.entity(id)!, api.editor.ctx);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    const diag = Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 0;
    const suggested = Number((diag * 5e-4).toPrecision(2)) || 1e-6;
    const t = await api.getDistance({ prompt: L('Tolerancia de distancia', 'Distance tolerance'), allowNone: true, allowZero: true, defaultValue: suggested });
    const distTol = t.kind === 'value' ? Math.max(0, t.value) : suggested;
    const candidates = inferConstraints(doc.data, ids, { distTol, angleTol: Math.PI / 180, pool: ids });
    if (!candidates.length) {
      api.info(L('No se encontraron relaciones nuevas.', 'No new relationships found.'));
      return;
    }
    const result = admitConstraints(doc.data, candidates);
    apply(api, 'AUTOCONSTRAIN', (tx) => {
      for (const e of result.updates.values()) tx.put('entities', e);
      for (const c of result.accepted) tx.add('constraints', c);
    });
    const counts = new Map<string, number>();
    for (const c of result.accepted) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
    const parts = [...counts].map(([type, n]) => [n, COUNT_LABEL[type] ?? [type, type]] as const);
    api.info(L(
      `${result.accepted.length} restricción(es): ${parts.map(([n, l]) => `${n} ${l[0]}`).join(', ')}${result.rejected.length ? `; ${result.rejected.length} descartada(s) por conflicto` : ''}.`,
      `${result.accepted.length} constraint(s): ${parts.map(([n, l]) => `${n} ${l[1]}`).join(', ')}${result.rejected.length ? `; ${result.rejected.length} discarded due to conflicts` : ''}.`,
    ));
  },
};

const DELCONSTRAINT: CommandDef = {
  name: 'DELCONSTRAINT',
  aliases: ['DELCON', 'BORRARRESTRICCIONES'],
  category: 'constraint',
  label: L('Borrar restricciones', 'Delete constraints'),
  description: L('Quita todas las restricciones geométricas y dimensionales de los objetos designados; la geometría no cambia.', 'Removes all geometric and dimensional constraints from the selected objects; geometry does not change.'),
  icon: 'delconstraint',
  async run(api) {
    const ids = new Set(await api.getSelection({ prompt: L('Designe objetos', 'Select objects'), usePreselection: true }));
    const doc = api.editor.doc;
    const targets = [...doc.data.constraints.values()].filter((c) => c.refs.some((r) => ids.has(r.entityId)));
    const kept: string[] = [];
    let removed = 0;
    apply(api, 'DELCONSTRAINT', (tx) => {
      // primero las que no son cotas usadas por fórmulas
      for (const c of targets) {
        try {
          removeDrawingConstraint(tx, c.id);
          removed++;
        } catch (err) {
          if (!(err instanceof ConstraintError) || c.kind !== 'dimensional') throw err;
          kept.push(c.name);
        }
      }
    });
    api.info(L(`${removed} restricción(es) eliminada(s).${kept.length ? ` Se conservan por usarse en fórmulas: ${kept.join(', ')}.` : ''}`, `${removed} constraint(s) removed.${kept.length ? ` Kept because formulas use them: ${kept.join(', ')}.` : ''}`));
  },
};

const CONSTRAINTBAR: CommandDef = {
  name: 'CONSTRAINTBAR',
  aliases: ['CBAR', 'VERRESTRICCIONES'],
  category: 'constraint',
  label: L('Mostrar restricciones', 'Show constraints'),
  description: L('Muestra u oculta los glifos y cotas de restricción del dibujo (no se trazan).', 'Shows or hides the drawing constraint glyphs and dimensions (they never plot).'),
  icon: 'constraintbar',
  transparent: true,
  readOnly: true,
  async run(api, args) {
    const cur = api.editor.prefs.constraintBar;
    let on = !cur;
    const arg = args?.[0]?.toLowerCase();
    if (arg === 'show' || arg === 'on') on = true;
    else if (arg === 'hide' || arg === 'off') on = false;
    api.editor.setPrefs({ constraintBar: on });
    api.info(on ? L('Restricciones visibles.', 'Constraints shown.') : L('Restricciones ocultas.', 'Constraints hidden.'));
  },
};

const CONSTRAINTINFER: CommandDef = {
  name: 'CONSTRAINTINFER',
  aliases: ['INFERIRRESTRICCIONES'],
  category: 'constraint',
  label: L('Inferir restricciones', 'Infer constraints'),
  description: L('Al dibujar sobre referencias exactas (extremos, ejes, tangencias) se crean las restricciones correspondientes.', 'While drawing on exact references (endpoints, axes, tangencies) the matching constraints are created.'),
  icon: 'constraintinfer',
  transparent: true,
  readOnly: true,
  async run(api, args) {
    const arg = args?.[0]?.toLowerCase();
    const on = arg === 'on' ? true : arg === 'off' ? false : !api.editor.prefs.inferConstraints;
    api.editor.setPrefs({ inferConstraints: on });
    api.info(on ? L('Inferencia de restricciones activada.', 'Constraint inference on.') : L('Inferencia de restricciones desactivada.', 'Constraint inference off.'));
  },
};

const PARAMETERS: CommandDef = {
  name: 'PARAMETERS',
  aliases: ['PARAMETROS'],
  category: 'constraint',
  label: L('Administrador de parámetros', 'Parameters manager'),
  description: L('Parámetros de usuario, cotas de restricción y variantes del dibujo: nombre, fórmula y valor.', 'Drawing user parameters, constraint dimensions and variants: name, formula and value.'),
  icon: 'parameters',
  readOnly: true,
  ui: 'panel:parameters',
  run() {},
};

/** Versión de línea de comandos del administrador de parámetros (teclado y guiones). */
const PARAMEDIT: CommandDef = {
  name: 'PARAMEDIT',
  aliases: ['EDITARPARAMETROS'],
  category: 'constraint',
  label: L('Editar parámetros', 'Edit parameters'),
  description: L('Crea, edita, renombra, lista y elimina parámetros y cotas de restricción; guarda y aplica variantes.', 'Creates, edits, renames, lists and deletes parameters and constraint dimensions; saves and applies variants.'),
  icon: 'parameters',
  async run(api) {
    const doc = api.editor.doc;
    const k = await api.getKeyword({
      prompt: L('Opción', 'Option'),
      keywords: [K('New', 'Nuevo', 'New', ['n']), K('Edit', 'Editar', 'Edit', ['e']), K('Rename', 'Renombrar', 'Rename', ['r']), K('Delete', 'Eliminar', 'Delete', ['d']), K('List', 'Lista', 'List', ['l']), K('Variant', 'Variante', 'Variant', ['v'])],
      defaultValue: 'Edit',
    });
    if (k.kind !== 'keyword') return;
    const askName = async (es: string, en: string, def?: string) => {
      const r = await api.getString({ prompt: L(es, en), defaultValue: def });
      return r.kind === 'string' ? r.value.trim() : null;
    };
    switch (k.key) {
      case 'New': {
        const name = await askName('Nombre del parámetro', 'Parameter name', nextParameterName(doc.data, 'p'));
        if (!name) return;
        const ex = await api.getString({ prompt: L('Fórmula', 'Formula'), allowSpaces: true, defaultValue: '0' });
        if (ex.kind !== 'string') return;
        apply(api, 'PARAMETERS', (tx) => addParameter(tx, name, ex.value));
        break;
      }
      case 'Edit': {
        const name = await askName('Nombre del parámetro o cota', 'Parameter or dimension name');
        if (!name) return;
        const target = findNamed(doc.data, name);
        if (!target) fail(`No existe «${name}».`, `"${name}" does not exist.`);
        const ex = await api.getString({ prompt: L('Nueva fórmula', 'New formula'), allowSpaces: true, defaultValue: target!.record.expression });
        if (ex.kind !== 'string') return;
        apply(api, 'PARAMETERS', (tx) => setNamedExpression(tx, name, ex.value));
        const v = parameterScope(doc.data).values.get(name);
        if (v !== undefined) api.info(L(`${name} = ${round6(v)}`, `${name} = ${round6(v)}`));
        break;
      }
      case 'Rename': {
        const from = await askName('Nombre actual', 'Current name');
        if (!from) return;
        const to = await askName('Nombre nuevo', 'New name');
        if (!to) return;
        apply(api, 'PARAMETERS', (tx) => renameNamed(tx, from, to));
        break;
      }
      case 'Delete': {
        const name = await askName('Nombre a eliminar', 'Name to delete');
        if (!name) return;
        const target = findNamed(doc.data, name);
        if (!target) fail(`No existe «${name}».`, `"${name}" does not exist.`);
        apply(api, 'PARAMETERS', (tx) => (target!.kind === 'parameter' ? removeParameter(tx, target!.record.id) : removeDrawingConstraint(tx, target!.record.id)));
        break;
      }
      case 'List': {
        const scope = parameterScope(doc.data);
        const names = [...usedNames(doc.data)].sort((a, b) => a.localeCompare(b));
        if (!names.length) api.info(L('El dibujo no tiene parámetros.', 'The drawing has no parameters.'));
        for (const name of names) {
          const t = findNamed(doc.data, name)!;
          const v = scope.values.get(name);
          const err = scope.errors.get(name);
          api.info({ es: `${name} = ${t.record.expression}${v !== undefined ? ` → ${round6(v)}` : ''}${err ? ` ⚠ ${err.es}` : ''}`, en: `${name} = ${t.record.expression}${v !== undefined ? ` → ${round6(v)}` : ''}${err ? ` ⚠ ${err.en}` : ''}` });
        }
        break;
      }
      case 'Variant': {
        const v = await api.getKeyword({ prompt: L('Variante', 'Variant'), keywords: [K('Save', 'Guardar', 'Save', ['g', 's']), K('Apply', 'Aplicar', 'Apply', ['a']), K('Delete', 'Eliminar', 'Delete', ['e', 'd'])], defaultValue: 'Apply' });
        if (v.kind !== 'keyword') return;
        const name = await askName('Nombre de la variante', 'Variant name');
        if (!name) return;
        if (v.key === 'Save') {
          apply(api, 'PARAMETER VARIANT', (tx) => saveParameterSet(tx, name));
          api.info(L(`Variante «${name}» guardada.`, `Variant "${name}" saved.`));
          return;
        }
        const set = [...doc.data.parameterSets.values()].find((s) => s.name.toLowerCase() === name.toLowerCase());
        if (!set) fail(`No existe la variante «${name}».`, `Variant "${name}" does not exist.`);
        if (v.key === 'Delete') apply(api, 'PARAMETER VARIANT', (tx) => tx.remove('parameterSets', set!.id));
        else {
          const res = apply(api, 'PARAMETER VARIANT', (tx) => applyParameterSet(tx, set!.id));
          api.info(L(`Variante «${set!.name}» aplicada (${res.applied} cambio(s)).${res.missing.length ? ` Sin correspondencia: ${res.missing.join(', ')}.` : ''}`, `Variant "${set!.name}" applied (${res.applied} change(s)).${res.missing.length ? ` Not found: ${res.missing.join(', ')}.` : ''}`));
        }
        break;
      }
    }
  },
};

export const CONSTRAINT_COMMANDS: CommandDef[] = [GEOMCONSTRAINT, ...GC_SHORTCUTS, DIMCONSTRAINT, ...DC_SHORTCUTS, AUTOCONSTRAIN, DELCONSTRAINT, CONSTRAINTBAR, CONSTRAINTINFER, PARAMETERS, PARAMEDIT];
