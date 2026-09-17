import { curveEnd, curveStart } from '../geometry/curves';
import { intersectCurves } from '../geometry/intersect';
import { polylineSegments } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { add, angleOf, dist, dot, normalize, perp, scale, sub } from '../geometry/vec';
import { assocPoint, installDimensionAssociativity, makeAssocRef } from '../annotation/assoc';
import type { DimAssocRef, DimensionEntity, DimType, Entity, Id, LwPolylineEntity, MTextEntity, TableEntity, TextEntity } from '../document/types';
import { buildDimension, effectiveDimStyle, dimScaleFactor } from '../model/dimension';
import { kindOf } from '../model/registry';
import type { SnapType } from '../model/registry';
import { findOsnapCandidates } from '../snap/snapEngine';
import { ALL_SNAP_TYPES } from '../model/registry';
import { add as addEntity, K, L, make } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

export { installDimensionAssociativity };

/** Referencia a objeto exacta en un punto (del último clic o recalculada). */
function snapAt(api: CommandApi, p: Vec2): { entityId: Id; type: SnapType } | null {
  const lp = api.editor.lastPick;
  if (lp && dist(lp.p, p) < 1e-9 && lp.entityId && lp.kind !== 'free') return { entityId: lp.entityId, type: lp.kind as SnapType };
  const editor = api.editor;
  const { candidates } = findOsnapCandidates({
    ctx: editor.ctx,
    index: editor.index,
    owner: editor.inputOwner,
    cursor: p,
    worldPerPixel: Math.max(1e-9, editor.ownerPerPixel * 0.01),
    settings: { ...editor.prefs.snap, osnap: true, types: ALL_SNAP_TYPES.filter((t) => t !== 'nearest' && t !== 'perpendicular' && t !== 'tangent' && t !== 'extension' && t !== 'parallel' && t !== 'appint'), aperturePx: 1 },
    vis: editor.visibility(),
  });
  const exact = candidates.find((c) => dist(c.p, p) < 1e-9 && c.entityId);
  return exact ? { entityId: exact.entityId!, type: exact.type } : null;
}

function refFor(api: CommandApi, point: DimAssocRef['point'], p: Vec2): DimAssocRef | null {
  const s = snapAt(api, p);
  if (!s) return null;
  return makeAssocRef(point, api.editor.doc.entity(s.entityId), s.type, p, api.editor.ctx);
}

function dimBase(api: CommandApi) {
  const s = api.editor.doc.settings;
  const style = api.editor.doc.data.dimStyles.get(s.currentDimStyle);
  return { style: s.currentDimStyle, overrides: {}, rotation: 0, annotative: style?.annotative || undefined };
}

async function textOptions(api: CommandApi, key: string, state: { textOverride?: string; rotation?: number }) {
  if (key === 'Mtext' || key === 'Text') {
    const t = await api.getString({ prompt: L('Texto de cota (<> = medida)', 'Dimension text (<> = measurement)'), defaultValue: state.textOverride ?? '<>', allowSpaces: true });
    if (t.kind === 'string') state.textOverride = t.value;
    return true;
  }
  return false;
}

async function placeLinear(api: CommandApi, p1: Vec2, p2: Vec2, aligned: boolean, assoc: DimAssocRef[]) {
  let forced: 'h' | 'v' | 'r' | null = null;
  let rotation = 0;
  const state: { textOverride?: string } = {};
  const build = (p: Vec2): DimensionEntity => {
    let rot = 0;
    if (!aligned) {
      if (forced === 'h') rot = 0;
      else if (forced === 'v') rot = Math.PI / 2;
      else if (forced === 'r') rot = rotation;
      else {
        // como AutoCAD: si el cursor queda fuera del rango X de los puntos, vertical
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        const outX = p.x < minX || p.x > maxX;
        const outY = p.y < minY || p.y > maxY;
        rot = outX && !outY ? Math.PI / 2 : 0;
      }
    }
    return make<DimensionEntity>(api, { type: 'dimension', dimType: aligned ? 'aligned' : 'linear', ...dimBase(api), p1, p2, p3: p, rotation: rot, textOverride: state.textOverride, assoc: assoc.length ? assoc : undefined });
  };
  for (;;) {
    const r = await api.getPoint({
      prompt: L('Precise la ubicación de la línea de cota', 'Specify dimension line location'),
      keywords: aligned ? [K('Mtext', 'Textom', 'Mtext', ['m']), K('Text', 'Texto', 'Text', ['t'])] : [K('Mtext', 'Textom', 'Mtext', ['m']), K('Text', 'Texto', 'Text', ['t']), K('Horizontal', 'Horizontal', 'Horizontal', ['h']), K('Vertical', 'Vertical', 'Vertical', ['v']), K('Rotated', 'Girada', 'Rotated', ['g', 'r'])],
      preview: (p) => ({ entities: [build(p)] }),
    });
    if (r.kind === 'point') {
      const d = build(r.p);
      const { id: _i, order: _o, ...rest } = d;
      return api.apply(aligned ? 'DIMALIGNED' : 'DIMLINEAR', (tx) => tx.addEntity<DimensionEntity>(rest as never));
    }
    if (r.kind !== 'keyword') return null;
    if (await textOptions(api, r.key, state)) continue;
    if (r.key === 'Horizontal') forced = 'h';
    else if (r.key === 'Vertical') forced = 'v';
    else if (r.key === 'Rotated') {
      const a = await api.getAngle({ prompt: L('Ángulo de la línea de cota', 'Angle of dimension line'), defaultValue: 0 });
      if (a.kind === 'value') {
        forced = 'r';
        rotation = a.value;
      }
    }
  }
}

async function originsOrObject(api: CommandApi): Promise<{ p1: Vec2; p2: Vec2; assoc: DimAssocRef[] } | null> {
  const r = await api.getPoint({ prompt: L('Precise el origen de la primera línea de extensión o <designar objeto>', 'Specify first extension line origin or <select object>'), allowNone: true });
  if (r.kind === 'none') {
    const o = await api.getEntity({ prompt: L('Designe el objeto a acotar', 'Select object to dimension'), types: ['line', 'arc', 'circle', 'lwpolyline'] });
    if (o.kind !== 'entity') return null;
    const e = api.editor.doc.entity(o.id)!;
    if (e.type === 'line') return { p1: e.start, p2: e.end, assoc: [{ point: 'p1', entityId: e.id, snap: 'endpoint-start' }, { point: 'p2', entityId: e.id, snap: 'endpoint-end' }] };
    if (e.type === 'arc') {
      const [c] = kindOf(e).curves(e, api.editor.ctx);
      return { p1: curveStart(c), p2: curveEnd(c), assoc: [{ point: 'p1', entityId: e.id, snap: 'endpoint-start' }, { point: 'p2', entityId: e.id, snap: 'endpoint-end' }] };
    }
    if (e.type === 'circle') return { p1: { x: e.center.x - e.radius, y: e.center.y }, p2: { x: e.center.x + e.radius, y: e.center.y }, assoc: [{ point: 'p1', entityId: e.id, snap: 'quadrant', index: 2 }, { point: 'p2', entityId: e.id, snap: 'quadrant', index: 0 }] };
    if (e.type === 'lwpolyline') {
      const segs = polylineSegments(e.vertices, e.closed);
      let best = 0;
      let bd = Infinity;
      segs.forEach((s, i) => {
        const d = Math.min(dist(curveStart(s), o.p), dist(curveEnd(s), o.p)) + dist({ x: (curveStart(s).x + curveEnd(s).x) / 2, y: (curveStart(s).y + curveEnd(s).y) / 2 }, o.p);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      const j = (best + 1) % e.vertices.length;
      return { p1: e.vertices[best], p2: e.vertices[j], assoc: [{ point: 'p1', entityId: e.id, snap: 'vertex', index: best }, { point: 'p2', entityId: e.id, snap: 'vertex', index: j }] };
    }
    return null;
  }
  if (r.kind !== 'point') return null;
  const ref1 = refFor(api, 'p1', r.p);
  const s = await api.getPoint({ prompt: L('Precise el origen de la segunda línea de extensión', 'Specify second extension line origin'), base: r.p, rubber: 'line' });
  if (s.kind !== 'point') return null;
  const ref2 = refFor(api, 'p2', s.p);
  return { p1: r.p, p2: s.p, assoc: [ref1, ref2].filter(Boolean) as DimAssocRef[] };
}

const DIMLINEAR: CommandDef = {
  name: 'DIMLINEAR',
  aliases: ['DLI', 'DIMLIN', 'ACOLINEAL', 'DIM'],
  category: 'annotate',
  label: L('Cota lineal', 'Linear dimension'),
  description: L('Cota horizontal, vertical o girada; asociativa si se designan referencias a objetos.', 'Horizontal, vertical or rotated dimension; associative when object snaps are used.'),
  icon: 'dimlinear',
  async run(api) {
    const o = await originsOrObject(api);
    if (!o) return;
    await placeLinear(api, o.p1, o.p2, false, o.assoc);
  },
};

const DIMALIGNED: CommandDef = {
  name: 'DIMALIGNED',
  aliases: ['DAL', 'ACOALINEADA'],
  category: 'annotate',
  label: L('Cota alineada', 'Aligned dimension'),
  description: L('Cota paralela a los puntos de origen.', 'Dimension parallel to the extension line origins.'),
  icon: 'dimaligned',
  async run(api) {
    const o = await originsOrObject(api);
    if (!o) return;
    await placeLinear(api, o.p1, o.p2, true, o.assoc);
  },
};

const DIMANGULAR: CommandDef = {
  name: 'DIMANGULAR',
  aliases: ['DAN', 'ACOANGULAR'],
  category: 'annotate',
  label: L('Cota angular', 'Angular dimension'),
  description: L('Acota el ángulo entre dos líneas, de un arco, de un círculo o por tres puntos.', 'Dimensions the angle between two lines, of an arc, a circle or by three points.'),
  icon: 'dimangular',
  async run(api) {
    const doc = api.editor.doc;
    const r = await api.getEntity({ prompt: L('Designe arco, círculo o línea, o Intro para 3 puntos', 'Select arc, circle, line, or Enter for 3 points'), types: ['line', 'arc', 'circle', 'lwpolyline'], allowNone: true });
    let dim: Omit<DimensionEntity, 'p3'> & { p3: Vec2 };
    const base = dimBase(api);
    const place = async (build: (p: Vec2) => DimensionEntity) => {
      const loc = await api.getPoint({ prompt: L('Precise la ubicación del arco de cota', 'Specify dimension arc line location'), preview: (p) => ({ entities: [build(p)] }) });
      if (loc.kind !== 'point') return;
      const { id: _i, order: _o, ...rest } = build(loc.p);
      api.apply('DIMANGULAR', (tx) => tx.addEntity(rest as never));
    };
    if (r.kind === 'none') {
      const v = await api.getPoint({ prompt: L('Precise el vértice del ángulo', 'Specify angle vertex') });
      if (v.kind !== 'point') return;
      const a = await api.getPoint({ prompt: L('Precise el primer extremo del ángulo', 'Specify first angle endpoint'), base: v.p, rubber: 'line' });
      if (a.kind !== 'point') return;
      const b = await api.getPoint({ prompt: L('Precise el segundo extremo del ángulo', 'Specify second angle endpoint'), base: v.p, rubber: 'line' });
      if (b.kind !== 'point') return;
      await place((p) => make<DimensionEntity>(api, { type: 'dimension', dimType: 'angular3p', ...base, center: v.p, p1: a.p, p2: b.p, p3: v.p, arcPoint: p }));
      return;
    }
    if (r.kind !== 'entity') return;
    const e = doc.entity(r.id)!;
    if (e.type === 'arc') {
      const [c] = kindOf(e).curves(e, api.editor.ctx);
      await place((p) => make<DimensionEntity>(api, { type: 'dimension', dimType: 'angular3p', ...base, center: e.center, p1: curveStart(c), p2: curveEnd(c), p3: e.center, arcPoint: p, assoc: [{ point: 'center', entityId: e.id, snap: 'center' }, { point: 'p1', entityId: e.id, snap: 'endpoint-start' }, { point: 'p2', entityId: e.id, snap: 'endpoint-end' }] }));
      return;
    }
    if (e.type === 'circle') {
      const second = await api.getPoint({ prompt: L('Precise el segundo extremo del ángulo', 'Specify second angle endpoint'), base: e.center, rubber: 'line' });
      if (second.kind !== 'point') return;
      await place((p) => make<DimensionEntity>(api, { type: 'dimension', dimType: 'angular3p', ...base, center: e.center, p1: r.p, p2: second.p, p3: e.center, arcPoint: p }));
      return;
    }
    const lineOf = (x: Entity, pick: Vec2): [Vec2, Vec2] | null => {
      if (x.type === 'line') return [x.start, x.end];
      if (x.type === 'lwpolyline') {
        const segs = polylineSegments((x as LwPolylineEntity).vertices, (x as LwPolylineEntity).closed);
        let best: [Vec2, Vec2] | null = null;
        let bd = Infinity;
        for (const s of segs) if (s.kind === 'line') {
          const d = Math.abs(dot(sub(pick, s.a), perp(normalize(sub(s.b, s.a)))));
          if (d < bd) {
            bd = d;
            best = [s.a, s.b];
          }
        }
        return best;
      }
      return null;
    };
    const l1 = lineOf(e, r.p);
    const r2 = await api.getEntity({ prompt: L('Designe la segunda línea', 'Select second line'), types: ['line', 'lwpolyline'] });
    if (r2.kind !== 'entity' || !l1) return;
    const l2 = lineOf(doc.entity(r2.id)!, r2.p);
    if (!l2) return;
    if (!intersectCurves({ kind: 'line', a: l1[0], b: l1[1] }, { kind: 'line', a: l2[0], b: l2[1] }, { extend1: true, extend2: true }).length) throw new CommandError(L('Las líneas son paralelas: no definen un ángulo.', 'The lines are parallel: they do not define an angle.'));
    const assoc: DimAssocRef[] = e.type === 'line' && doc.entity(r2.id)!.type === 'line' ? [{ point: 'p1', entityId: e.id, snap: 'endpoint-start' }, { point: 'p2', entityId: e.id, snap: 'endpoint-end' }, { point: 'p3', entityId: r2.id, snap: 'endpoint-start' }, { point: 'p4', entityId: r2.id, snap: 'endpoint-end' }] : [];
    dim = make<DimensionEntity>(api, { type: 'dimension', dimType: 'angular', ...base, p1: l1[0], p2: l1[1], p3: l2[0], p4: l2[1] });
    const d0 = dim;
    await place((p) => ({ ...d0, arcPoint: p, assoc: assoc.length ? assoc : undefined }) as DimensionEntity);
  },
};

async function radialCommand(api: CommandApi, dimType: DimType) {
  const doc = api.editor.doc;
  const r = await api.getEntity({ prompt: L('Designe arco o círculo', 'Select arc or circle'), types: ['arc', 'circle', 'lwpolyline'] });
  if (r.kind !== 'entity') return;
  const e = doc.entity(r.id)!;
  let center: Vec2;
  let radius: number;
  let assoc: DimAssocRef[] | undefined;
  if (e.type === 'arc' || e.type === 'circle') {
    center = e.center;
    radius = e.radius;
    assoc = [{ point: 'center', entityId: e.id, snap: 'center' }];
  } else if (e.type === 'lwpolyline') {
    const seg = polylineSegments(e.vertices, e.closed).find((s) => s.kind === 'arc' && Math.abs(dist(s.c, r.p) - s.r) < api.editor.ownerPerPixel * 10);
    if (!seg || seg.kind !== 'arc') throw new CommandError(L('Designa un tramo de arco de la polilínea.', 'Select an arc segment of the polyline.'));
    center = seg.c;
    radius = seg.r;
  } else return;
  const base = dimBase(api);
  if (dimType === 'arclength') {
    if (e.type !== 'arc') throw new CommandError(L('La cota de longitud de arco requiere un arco.', 'Arc length dimension requires an arc.'));
    const [c] = kindOf(e).curves(e, api.editor.ctx);
    const build = (p: Vec2) => make<DimensionEntity>(api, { type: 'dimension', dimType: 'arclength', ...base, center, radius, p1: curveStart(c), p2: curveEnd(c), p3: center, arcPoint: p, assoc: [{ point: 'center', entityId: e.id, snap: 'center' }, { point: 'p1', entityId: e.id, snap: 'endpoint-start' }, { point: 'p2', entityId: e.id, snap: 'endpoint-end' }] });
    const loc = await api.getPoint({ prompt: L('Precise la ubicación de la cota de arco', 'Specify arc length dimension location'), preview: (p) => ({ entities: [build(p)] }) });
    if (loc.kind !== 'point') return;
    const { id: _i, order: _o, ...rest } = build(loc.p);
    api.apply('DIMARC', (tx) => tx.addEntity(rest as never));
    return;
  }
  const build = (p: Vec2) => {
    const dir = normalize(sub(p, center));
    const onArc = add(center, scale(dir.x || dir.y ? dir : { x: 1, y: 0 }, radius));
    return make<DimensionEntity>(api, { type: 'dimension', dimType, ...base, center, p1: onArc, p2: center, p3: p, assoc: assoc ? [...assoc, { point: 'p1', entityId: e.id, snap: 'nearest', index: angleOf(sub(onArc, center)) }] : undefined });
  };
  const loc = await api.getPoint({ prompt: L('Precise la ubicación de la línea de cota', 'Specify dimension line location'), preview: (p) => ({ entities: [build(p)] }) });
  if (loc.kind !== 'point') return;
  const { id: _i, order: _o, ...rest } = build(loc.p);
  api.apply(dimType === 'radial' ? 'DIMRADIUS' : 'DIMDIAMETER', (tx) => tx.addEntity(rest as never));
}

const DIMRADIUS: CommandDef = { name: 'DIMRADIUS', aliases: ['DRA', 'ACORADIO'], category: 'annotate', label: L('Cota de radio', 'Radius dimension'), description: L('Acota el radio de un arco o círculo (asociativa).', 'Dimensions the radius of an arc or circle (associative).'), icon: 'dimradius', run: (api) => radialCommand(api, 'radial') };
const DIMDIAMETER: CommandDef = { name: 'DIMDIAMETER', aliases: ['DDI', 'ACODIAMETRO'], category: 'annotate', label: L('Cota de diámetro', 'Diameter dimension'), description: L('Acota el diámetro de un arco o círculo (asociativa).', 'Dimensions the diameter of an arc or circle (associative).'), icon: 'dimdiameter', run: (api) => radialCommand(api, 'diametric') };
const DIMARC: CommandDef = { name: 'DIMARC', aliases: ['DAR', 'ACOARCO'], category: 'annotate', label: L('Cota de longitud de arco', 'Arc length dimension'), description: L('Acota la longitud de un arco.', 'Dimensions the length of an arc.'), icon: 'dimarc', run: (api) => radialCommand(api, 'arclength') };

const DIMORDINATE: CommandDef = {
  name: 'DIMORDINATE',
  aliases: ['DOR', 'ACOCOORDENADA'],
  category: 'annotate',
  label: L('Cota por coordenadas', 'Ordinate dimension'),
  description: L('Acota la coordenada X o Y de un punto respecto al origen.', 'Dimensions the X or Y ordinate of a feature relative to the origin.'),
  icon: 'dimordinate',
  async run(api) {
    const f = await api.getPoint({ prompt: L('Precise la ubicación del elemento', 'Specify feature location') });
    if (f.kind !== 'point') return;
    let axis: 'x' | 'y' | undefined;
    const ref = refFor(api, 'p1', f.p);
    const build = (p: Vec2) => make<DimensionEntity>(api, { type: 'dimension', dimType: 'ordinate', ...dimBase(api), origin: { x: 0, y: 0 }, p1: f.p, p2: p, p3: p, axis: axis ?? (Math.abs(p.x - f.p.x) > Math.abs(p.y - f.p.y) ? 'y' : 'x'), assoc: ref ? [ref] : undefined });
    for (;;) {
      const r = await api.getPoint({ prompt: L('Precise el extremo de la directriz', 'Specify leader endpoint'), base: f.p, keywords: [K('Xdatum', 'Xbase', 'Xdatum', ['x']), K('Ydatum', 'Ybase', 'Ydatum', ['y'])], preview: (p) => ({ entities: [build(p)] }) });
      if (r.kind === 'keyword') {
        axis = r.key === 'Xdatum' ? 'x' : 'y';
        continue;
      }
      if (r.kind !== 'point') return;
      const { id: _i, order: _o, ...rest } = build(r.p);
      api.apply('DIMORDINATE', (tx) => tx.addEntity(rest as never));
      return;
    }
  },
};

async function chainCommand(api: CommandApi, baseline: boolean) {
  const doc = api.editor.doc;
  let baseDim: DimensionEntity | null = null;
  const last = [...doc.data.entities.values()].filter((e): e is DimensionEntity => e.type === 'dimension' && (e.dimType === 'linear' || e.dimType === 'aligned') && e.owner === api.editor.inputOwner).sort((a, b) => b.order - a.order)[0];
  const pick = await api.getEntity({ prompt: L(`Designe la cota ${baseline ? 'base' : 'continua'} (Intro: la última)`, `Select ${baseline ? 'base' : 'continued'} dimension (Enter: last)`), types: ['dimension'], allowNone: true });
  if (pick.kind === 'entity') baseDim = doc.entity(pick.id) as DimensionEntity;
  else if (pick.kind === 'none') baseDim = last ?? null;
  if (!baseDim || (baseDim.dimType !== 'linear' && baseDim.dimType !== 'aligned')) throw new CommandError(L('Se necesita una cota lineal o alineada existente.', 'An existing linear or aligned dimension is required.'));
  const props = effectiveDimStyle(baseDim, api.editor.ctx);
  const S = dimScaleFactor(props, api.editor.ctx, baseDim.annotative);
  const u = baseDim.dimType === 'aligned' ? normalize(sub(baseDim.p2, baseDim.p1)) : { x: Math.cos(baseDim.rotation), y: Math.sin(baseDim.rotation) };
  const n = perp(u);
  // lado de la línea de cota respecto a los orígenes
  const side = Math.sign(dot(sub(baseDim.p3, baseDim.p1), n)) || 1;
  let prev = baseDim;
  let origin = baseDim.p2;
  let count = 0;
  for (;;) {
    const r = await api.getPoint({
      prompt: L('Precise el origen de la segunda línea de extensión', 'Specify second extension line origin'),
      base: origin,
      allowNone: true,
      preview: (p) => ({ entities: [build(p)] }),
    });
    if (r.kind !== 'point') break;
    const d = build(r.p);
    const { id: _i, order: _o, ...rest } = d;
    prev = api.apply(baseline ? 'DIMBASELINE' : 'DIMCONTINUE', (tx) => tx.addEntity<DimensionEntity>(rest as never));
    if (!baseline) origin = r.p;
    count++;
  }
  api.info(L(`${count} cota(s) creada(s).`, `${count} dimension(s) created.`));
  function build(p: Vec2): DimensionEntity {
    const ref = refFor(api, 'p2', p);
    if (baseline) {
      const offset = scale(n, side * props.baselineSpacing * S);
      return make<DimensionEntity>(api, { ...baseDim!, id: undefined as never, order: undefined as never, p1: baseDim!.p1, p2: p, p3: add(prev.p3, offset), textPosition: undefined, textOverride: undefined, assoc: [...(baseDim!.assoc?.filter((a) => a.point === 'p1') ?? []), ...(ref ? [ref] : [])] } as never);
    }
    return make<DimensionEntity>(api, { ...prev, id: undefined as never, order: undefined as never, p1: origin, p2: p, p3: prev.p3, textPosition: undefined, textOverride: undefined, assoc: [...(prev.assoc?.filter((a) => a.point === 'p2').map((a) => ({ ...a, point: 'p1' as const })) ?? []), ...(ref ? [ref] : [])] } as never);
  }
}

const DIMCONTINUE: CommandDef = { name: 'DIMCONTINUE', aliases: ['DCO', 'ACOCONTINUA'], category: 'annotate', label: L('Cota continua', 'Continue dimension'), description: L('Encadena cotas desde la segunda línea de extensión de la anterior.', 'Chains dimensions from the previous second extension line.'), icon: 'dimcontinue', run: (api) => chainCommand(api, false) };
const DIMBASELINE: CommandDef = { name: 'DIMBASELINE', aliases: ['DBA', 'ACOLINEABASE'], category: 'annotate', label: L('Cota de línea base', 'Baseline dimension'), description: L('Cotas desde una misma línea base con separación del estilo.', 'Dimensions from a common baseline with style spacing.'), icon: 'dimbaseline', run: (api) => chainCommand(api, true) };

const DIMREASSOCIATE: CommandDef = {
  name: 'DIMREASSOCIATE',
  aliases: ['DRE', 'REASOCIARCOTA'],
  category: 'annotate',
  label: L('Reasociar cotas', 'Reassociate dimensions'),
  description: L('Vuelve a asociar los puntos de una cota a referencias a objetos.', 'Associates dimension definition points to object snaps again.'),
  async run(api) {
    const r = await api.getEntity({ prompt: L('Designe la cota', 'Select dimension'), types: ['dimension'] });
    if (r.kind !== 'entity') return;
    const d = api.editor.doc.entity(r.id) as DimensionEntity;
    const refs: DimAssocRef[] = [];
    for (const key of ['p1', 'p2'] as const) {
      const p = await api.getPoint({ prompt: L(`Precise el punto asociado para ${key} (Intro: omitir)`, `Specify associated point for ${key} (Enter: skip)`), base: d[key], allowNone: true });
      if (p.kind !== 'point') continue;
      const ref = refFor(api, key, p.p);
      if (ref) refs.push(ref);
      else api.warn(L('Ese punto no es una referencia a objeto; no se asoció.', 'That point is not an object snap; not associated.'));
    }
    api.apply('DIMREASSOCIATE', (tx) =>
      tx.updateEntity<DimensionEntity>(d.id, (cur) => {
        const next: DimensionEntity = { ...cur, assoc: [...(cur.assoc?.filter((a) => !refs.some((r2) => r2.point === a.point)) ?? []), ...refs] };
        for (const ref of refs) {
          const e = api.editor.doc.entity(ref.entityId);
          const p = e && assocPoint(e, ref, api.editor.ctx);
          if (p) (next as unknown as Record<string, Vec2>)[ref.point] = p;
        }
        return next;
      }),
    );
  },
};

const DIMDISASSOCIATE: CommandDef = {
  name: 'DIMDISASSOCIATE',
  aliases: ['DDA'],
  category: 'annotate',
  label: L('Desasociar cotas', 'Disassociate dimensions'),
  description: L('Quita la asociatividad de las cotas designadas.', 'Removes associativity from selected dimensions.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe cotas', 'Select dimensions'), types: ['dimension'] });
    api.apply('DIMDISASSOCIATE', (tx) => ids.forEach((id) => tx.updateEntity<DimensionEntity>(id, { assoc: undefined })));
  },
};

const DIMTEDIT: CommandDef = {
  name: 'DIMTEDIT',
  aliases: ['DIMEDIT', 'DED', 'EDITARTEXTOCOTA'],
  category: 'annotate',
  label: L('Editar texto de cota', 'Edit dimension text'),
  description: L('Mueve o sustituye el texto de una cota; Inicio restablece.', 'Moves or overrides dimension text; Home resets.'),
  async run(api) {
    const r = await api.getEntity({ prompt: L('Designe la cota', 'Select dimension'), types: ['dimension'] });
    if (r.kind !== 'entity') return;
    const d = api.editor.doc.entity(r.id) as DimensionEntity;
    const p = await api.getPoint({
      prompt: L('Nueva ubicación del texto', 'New text location'),
      keywords: [K('Home', 'Inicio', 'Home', ['i', 'h']), K('New', 'Nuevo texto', 'New text', ['n'])],
      preview: (q) => ({ entities: [{ ...d, textPosition: q }] }),
    });
    if (p.kind === 'point') api.apply('DIMTEDIT', (tx) => tx.updateEntity<DimensionEntity>(d.id, { textPosition: p.p }));
    else if (p.kind === 'keyword' && p.key === 'Home') api.apply('DIMTEDIT', (tx) => tx.updateEntity<DimensionEntity>(d.id, { textPosition: undefined, textOverride: undefined }));
    else if (p.kind === 'keyword') {
      const t = await api.getString({ prompt: L('Texto de cota (<> = medida)', 'Dimension text (<> = measured)'), defaultValue: d.textOverride ?? '<>', allowSpaces: true });
      if (t.kind === 'string') api.apply('DIMTEDIT', (tx) => tx.updateEntity<DimensionEntity>(d.id, { textOverride: t.value === '<>' ? undefined : t.value }));
    }
  },
};

const TEXTEDIT: CommandDef = {
  name: 'TEXTEDIT',
  aliases: ['ED', 'DDEDIT', 'EDITARTEXTO'],
  category: 'annotate',
  label: L('Editar texto', 'Edit text'),
  description: L('Edita el contenido de textos, textos múltiples, atributos, directrices y celdas de tabla.', 'Edits the contents of text, mtext, attributes, leaders and table cells.'),
  async run(api) {
    const doc = api.editor.doc;
    for (;;) {
      const r = await api.getEntity({ prompt: L('Designe un objeto de anotación', 'Select an annotation object'), types: ['text', 'mtext', 'attdef', 'mleader', 'table', 'dimension'], allowNone: true });
      if (r.kind !== 'entity') return;
      const e = doc.entity(r.id)!;
      if (e.type === 'text') {
        const t = await api.getString({ prompt: L('Texto', 'Text'), defaultValue: e.text, allowSpaces: true });
        if (t.kind === 'string') api.apply('TEXTEDIT', (tx) => tx.updateEntity<TextEntity>(e.id, { text: t.value }));
      } else if (e.type === 'mtext') {
        const t = await api.getString({ prompt: L('Contenido', 'Contents'), defaultValue: e.contents.replace(/\\P/g, '\n'), allowSpaces: true, multiline: true });
        if (t.kind === 'string') api.apply('TEXTEDIT', (tx) => tx.updateEntity<MTextEntity>(e.id, { contents: t.value.replace(/\r?\n/g, '\\P') }));
      } else if (e.type === 'attdef') {
        const t = await api.getString({ prompt: L('Etiqueta', 'Tag'), defaultValue: e.tag });
        if (t.kind === 'string') api.apply('TEXTEDIT', (tx) => tx.updateEntity(e.id, { tag: t.value.toUpperCase() }));
      } else if (e.type === 'mleader' && e.content.type === 'mtext') {
        const content = e.content;
        const t = await api.getString({ prompt: L('Contenido', 'Contents'), defaultValue: content.text.replace(/\\P/g, '\n'), allowSpaces: true, multiline: true });
        if (t.kind === 'string') api.apply('TEXTEDIT', (tx) => tx.updateEntity(e.id, { content: { ...content, text: t.value.replace(/\r?\n/g, '\\P') } }));
      } else if (e.type === 'table') {
        const cell = tableCellAt(api, e, r.p);
        if (!cell) continue;
        const t = await api.getString({ prompt: L(`Celda ${cell.row + 1},${cell.col + 1}`, `Cell ${cell.row + 1},${cell.col + 1}`), defaultValue: e.cells[cell.row][cell.col].text, allowSpaces: true, multiline: true });
        if (t.kind === 'string') api.apply('TABLEEDIT', (tx) => tx.updateEntity<TableEntity>(e.id, (cur) => ({ ...cur, cells: cur.cells.map((row, i) => row.map((c, j) => (i === cell.row && j === cell.col ? { ...c, text: t.value.replace(/\r?\n/g, '\\P') } : c))) })));
      } else if (e.type === 'dimension') {
        const t = await api.getString({ prompt: L('Texto de cota (<> = medida)', 'Dimension text (<> = measured)'), defaultValue: e.textOverride ?? '<>', allowSpaces: true });
        if (t.kind === 'string') api.apply('TEXTEDIT', (tx) => tx.updateEntity<DimensionEntity>(e.id, { textOverride: t.value === '<>' ? undefined : t.value }));
      }
    }
  },
};

export function tableCellAt(api: CommandApi, t: TableEntity, p: Vec2): { row: number; col: number } | null {
  const c = Math.cos(-t.rotation);
  const s = Math.sin(-t.rotation);
  const lx = (p.x - t.position.x) * c - (p.y - t.position.y) * s;
  const ly = (p.x - t.position.x) * s + (p.y - t.position.y) * c;
  let x = 0;
  let col = -1;
  for (let j = 0; j < t.columnWidths.length; j++) {
    if (lx >= x && lx <= x + t.columnWidths[j]) col = j;
    x += t.columnWidths[j];
  }
  let y = 0;
  let row = -1;
  for (let i = 0; i < t.rowHeights.length; i++) {
    if (-ly >= y && -ly <= y + t.rowHeights[i]) row = i;
    y += t.rowHeights[i];
  }
  if (row < 0 || col < 0) return null;
  // celda combinada: buscar la celda propietaria
  for (let i = row; i >= 0; i--) for (let j = col; j >= 0; j--) {
    const cell = t.cells[i]?.[j];
    if (cell && !cell.merged && i + (cell.rowSpan ?? 1) > row && j + (cell.colSpan ?? 1) > col) return { row: i, col: j };
  }
  void api;
  return { row, col };
}

const FIND: CommandDef = {
  name: 'FIND',
  aliases: ['BUSCAR', 'REEMPLAZAR'],
  category: 'annotate',
  label: L('Buscar y reemplazar', 'Find and replace'),
  description: L('Busca texto en textos, cotas, atributos, directrices y tablas; reemplaza opcionalmente.', 'Finds text in text, dimensions, attributes, leaders and tables; optionally replaces.'),
  async run(api) {
    const doc = api.editor.doc;
    const q = await api.getString({ prompt: L('Texto a buscar', 'Find what'), allowSpaces: true });
    if (q.kind !== 'string' || !q.value) return;
    const rep = await api.getString({ prompt: L('Reemplazar por (Intro: solo buscar)', 'Replace with (Enter: find only)'), allowSpaces: true, allowNone: true });
    const needle = q.value;
    const replace = rep.kind === 'string' ? rep.value : null;
    const found: Id[] = [];
    const sub2 = (s: string) => s.split(needle).join(replace ?? needle);
    api.apply('FIND', (tx) => {
      for (const e of doc.data.entities.values()) {
        let hit = false;
        let next: Entity | null = null;
        if (e.type === 'text' && e.text.includes(needle)) {
          hit = true;
          next = { ...e, text: sub2(e.text) };
        } else if (e.type === 'mtext' && e.contents.includes(needle)) {
          hit = true;
          next = { ...e, contents: sub2(e.contents) };
        } else if (e.type === 'insert' && e.attributes.some((a) => a.value.includes(needle))) {
          hit = true;
          next = { ...e, attributes: e.attributes.map((a) => ({ ...a, value: sub2(a.value) })) };
        } else if (e.type === 'dimension' && e.textOverride?.includes(needle)) {
          hit = true;
          next = { ...e, textOverride: sub2(e.textOverride) };
        } else if (e.type === 'mleader' && e.content.type === 'mtext' && e.content.text.includes(needle)) {
          hit = true;
          next = { ...e, content: { ...e.content, text: sub2(e.content.text) } };
        } else if (e.type === 'table' && e.cells.some((r) => r.some((c) => c.text.includes(needle)))) {
          hit = true;
          next = { ...e, cells: e.cells.map((r) => r.map((c) => ({ ...c, text: sub2(c.text) }))) };
        }
        if (hit) {
          found.push(e.id);
          if (replace !== null && next) tx.put('entities', next);
        }
      }
    });
    api.editor.selection.set(found.filter((id) => doc.entity(id)?.owner === api.editor.inputOwner));
    if (found.length) api.editor.zoomSelection(found);
    api.info(L(`${found.length} coincidencia(s)${replace !== null ? ' reemplazada(s)' : ''}.`, `${found.length} match(es)${replace !== null ? ' replaced' : ''}.`));
  },
};

const FIELD: CommandDef = {
  name: 'FIELD',
  aliases: ['CAMPO'],
  category: 'annotate',
  label: L('Insertar campo', 'Insert field'),
  description: L('Crea un texto múltiple con un campo vinculado: fecha, título, hoja, escala, propiedad o longitud/área de un objeto.', 'Creates mtext with a linked field: date, title, sheet, scale, property or object length/area.'),
  async run(api) {
    const k = await api.getKeyword({
      prompt: L('Tipo de campo', 'Field type'),
      keywords: [K('Date', 'Fecha', 'Date', ['f', 'd']), K('Title', 'Título', 'Title', ['t']), K('Sheet', 'Hoja', 'Sheet', ['h', 's']), K('Scale', 'Escala', 'Scale', ['e']), K('Object', 'Objeto', 'Object', ['o']), K('Property', 'Propiedad', 'Property', ['p']), K('Calc', 'Fórmula', 'Formula', ['c'])],
    });
    if (k.kind !== 'keyword') return;
    let field = '';
    if (k.key === 'Date') field = '{{date}}';
    else if (k.key === 'Title') field = '{{title}}';
    else if (k.key === 'Sheet') field = '{{sheet}}';
    else if (k.key === 'Scale') field = '{{scale}}';
    else if (k.key === 'Object') {
      const o = await api.getEntity({ prompt: L('Designe el objeto', 'Select object'), allowLocked: true });
      if (o.kind !== 'entity') return;
      const prop = await api.getKeyword({ prompt: L('Propiedad', 'Property'), keywords: [K('length', 'Longitud', 'Length', ['l']), K('area', 'Área', 'Area', ['a']), K('radius', 'Radio', 'Radius', ['r']), K('layer', 'Capa', 'Layer', ['c'])], defaultValue: 'length' });
      field = `{{entity:${o.id}.${prop.kind === 'keyword' ? prop.key : 'length'}}}`;
    } else if (k.key === 'Property') {
      const n = await api.getString({ prompt: L('Nombre de la propiedad personalizada', 'Custom property name') });
      if (n.kind !== 'string') return;
      field = `{{prop:${n.value}}}`;
    } else {
      const f = await api.getString({ prompt: L('Fórmula', 'Formula'), allowSpaces: true });
      if (f.kind !== 'string') return;
      field = `{{calc:${f.value}}}`;
    }
    const p = await api.getPoint({ prompt: L('Precise el punto de inserción', 'Specify insertion point') });
    if (p.kind !== 'point') return;
    const s = api.editor.doc.settings;
    addEntity<MTextEntity>(api, 'FIELD', { type: 'mtext', position: p.p, width: 0, height: s.textHeight, rotation: 0, style: s.currentTextStyle, attachment: 7, lineSpacing: 1, contents: field });
  },
};

export function dimensionMeasure(api: CommandApi, d: DimensionEntity): number {
  return buildDimension(d, api.editor.ctx).measurement;
}

export const ANNOTATE_COMMANDS: CommandDef[] = [DIMLINEAR, DIMALIGNED, DIMANGULAR, DIMRADIUS, DIMDIAMETER, DIMARC, DIMORDINATE, DIMCONTINUE, DIMBASELINE, DIMREASSOCIATE, DIMDISASSOCIATE, DIMTEDIT, TEXTEDIT, FIND, FIELD];
