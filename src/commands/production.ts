import { centerGeometryFrom } from '../annotation/centerMarks';
import { dimensionBreakPoints } from '../annotation/dimBreaks';
import { quickDimensionPoints, quickDimensions, spaceDimensions } from '../annotation/dimLayout';
import type { QuickMode } from '../annotation/dimLayout';
import { newId } from '../document/ids';
import type { CenterMarkEntity, DimensionEntity, DimStyleProps, Entity, GeoRef, Id, LayerRecord, MTextEntity, SplineEntity, TextEntity } from '../document/types';
import { blendSpline, curveEndData } from '../geometry/blend';
import type { BlendMode } from '../geometry/blend';
import type { Curve } from '../geometry/curves';
import { curveEnd, curveStart } from '../geometry/curves';
import { combineMassProperties, massProperties } from '../geometry/massprops';
import type { MassProperties } from '../geometry/massprops';
import { translation } from '../geometry/matrix';
import { polylineSegments } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { add, angleOf, dist, dot, len, normalize, perp, scale, sub } from '../geometry/vec';
import { buildDimension, dimScaleFactor } from '../model/dimension';
import { kindOf } from '../model/registry';
import { saveFile } from '../storage/fileAccess';
import { segmentRef } from './constraints';
import { fail, K, L, make } from './helpers';
import type { CommandApi, CommandDef } from './types';

// ------------------------------------------------------------------ utilidades

function currentDimProps(api: CommandApi): { props: DimStyleProps; S: number; style: Id; annotative?: boolean } {
  const s = api.editor.doc.settings;
  const record = api.editor.doc.data.dimStyles.get(s.currentDimStyle) ?? [...api.editor.doc.data.dimStyles.values()][0];
  const props = record as DimStyleProps;
  return { props, S: dimScaleFactor(props, api.editor.ctx), style: record.id, annotative: props.annotative || undefined };
}

function centerLinetype(api: CommandApi): string {
  const lts = api.editor.doc.data.linetypes;
  return lts.has('lt-center2') ? 'lt-center2' : lts.has('lt-center') ? 'lt-center' : 'ByLayer';
}

/** Prolongación por defecto de marcas y ejes: como AutoCAD (3.5 con flechas de 2.5), según el estilo de cota. */
function centerExtension(api: CommandApi): number {
  const { props, S } = currentDimProps(api);
  return props.arrowSize * S * 1.4;
}

function insertEntities(api: CommandApi, label: string, entities: Entity[]): Id[] {
  return api.apply(label, (tx) => entities.map((e) => {
    const { id: _i, order: _o, ...rest } = e;
    return tx.addEntity(rest as never).id;
  }));
}

// ------------------------------------------------------------------ QDIM

const QDIM_MODES: Record<string, QuickMode | 'radius' | 'diameter'> = { Continuous: 'continuous', Baseline: 'baseline', Ordinate: 'ordinate', Radius: 'radius', Diameter: 'diameter' };

const QDIM: CommandDef = {
  name: 'QDIM',
  aliases: ['ACORAPIDA', 'COTARAPIDA'],
  category: 'annotate',
  label: L('Acotación rápida', 'Quick dimension'),
  description: L('Acota de una vez la geometría designada: cadena continua, línea base, coordenadas, radios o diámetros, todas asociativas.', 'Dimensions the selected geometry in one go: continuous chain, baseline, ordinate, radius or diameter, all associative.'),
  icon: 'qdim',
  async run(api) {
    const doc = api.editor.doc;
    const ids = await api.getSelection({ prompt: L('Designe la geometría que se va a acotar', 'Select geometry to dimension'), types: ['line', 'arc', 'circle', 'lwpolyline', 'point'], usePreselection: true });
    const ents = ids.map((id) => doc.entity(id)).filter((e): e is Entity => !!e);
    if (!ents.length) return;
    const { props, S, style, annotative } = currentDimProps(api);
    const base = { style, overrides: {}, annotative };
    const points = quickDimensionPoints(ents);
    const round = ents.filter((e): e is Extract<Entity, { type: 'circle' | 'arc' }> => e.type === 'circle' || e.type === 'arc');
    let mode: QuickMode | 'radius' | 'diameter' = 'continuous';
    const box = points.reduce((b, q) => ({ minX: Math.min(b.minX, q.p.x), minY: Math.min(b.minY, q.p.y), maxX: Math.max(b.maxX, q.p.x), maxY: Math.max(b.maxY, q.p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const build = (p: Vec2): DimensionEntity[] => {
      if (mode === 'radius' || mode === 'diameter') {
        return round.map((e) => {
          let a = angleOf(sub(p, e.center));
          if (e.type === 'arc') {
            const sweep = (((e.endAngle - e.startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
            const rel = (((a - e.startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            if (rel > sweep) a = e.startAngle + sweep / 2;
          }
          const dir = { x: Math.cos(a), y: Math.sin(a) };
          const p1 = add(e.center, scale(dir, e.radius));
          return make<DimensionEntity>(api, {
            type: 'dimension', dimType: mode === 'radius' ? 'radial' : 'diametric', ...base, owner: e.owner, center: e.center, p1, p2: e.center,
            p3: add(p1, scale(dir, props.arrowSize * S * 3)), rotation: 0,
            assoc: [{ point: 'center', entityId: e.id, snap: 'center' }, { point: 'p1', entityId: e.id, snap: 'nearest', index: a }],
          });
        });
      }
      const outX = p.x < box.minX || p.x > box.maxX;
      const outY = p.y < box.minY || p.y > box.maxY;
      const horizontal = !(outX && !outY);
      return quickDimensions(points, p, mode, horizontal, props.baselineSpacing * S).map((spec) => make<DimensionEntity>(api, { type: 'dimension', ...base, ...spec }));
    };
    for (;;) {
      const r = await api.getPoint({
        prompt: L('Precise la posición de la línea de cota', 'Specify dimension line position'),
        keywords: [K('Continuous', 'Continua', 'Continuous', ['c']), K('Baseline', 'lineaBase', 'Baseline', ['b']), K('Ordinate', 'Coordenadas', 'Ordinate', ['o']), K('Radius', 'Radio', 'Radius', ['r']), K('Diameter', 'Diámetro', 'Diameter', ['d'])],
        preview: (p) => ({ entities: build(p) }),
      });
      if (r.kind === 'keyword') {
        mode = QDIM_MODES[r.key] ?? mode;
        if ((mode === 'radius' || mode === 'diameter') && !round.length) fail('No hay arcos ni círculos en la selección.', 'The selection has no arcs or circles.');
        continue;
      }
      if (r.kind !== 'point') return;
      const dims = build(r.p);
      if (!dims.length) fail('Hacen falta al menos dos puntos distintos para acotar.', 'At least two distinct points are needed to dimension.');
      insertEntities(api, 'QDIM', dims);
      api.info(L(`${dims.length} cota(s) creada(s).`, `${dims.length} dimension(s) created.`));
      return;
    }
  },
};

// ------------------------------------------------------------------ DIMSPACE

const DIMSPACE: CommandDef = {
  name: 'DIMSPACE',
  aliases: ['ESPACIOCOTA', 'ESPACIARCOTAS'],
  category: 'annotate',
  label: L('Espaciar cotas', 'Space dimensions'),
  description: L('Reparte cotas lineales o alineadas paralelas a igual distancia de una cota base; con 0 las alinea.', 'Evenly spaces parallel linear or aligned dimensions from a base dimension; 0 aligns them.'),
  icon: 'dimspace',
  async run(api) {
    const doc = api.editor.doc;
    const b = await api.getEntity({ prompt: L('Designe la cota base', 'Select base dimension'), types: ['dimension'] });
    if (b.kind !== 'entity') return;
    const base = doc.entity(b.id) as DimensionEntity;
    if (base.dimType !== 'linear' && base.dimType !== 'aligned') fail('La cota base debe ser lineal o alineada.', 'The base dimension must be linear or aligned.');
    const ids = await api.getSelection({ prompt: L('Designe las cotas que se van a espaciar', 'Select dimensions to space'), types: ['dimension'], usePreselection: true });
    const dims = ids.map((id) => doc.entity(id)).filter((e): e is DimensionEntity => e?.type === 'dimension' && e.id !== base.id);
    if (!dims.length) return;
    const { textHeight } = { textHeight: (doc.data.dimStyles.get(base.style) ?? currentDimProps(api).props).textHeight };
    const S = dimScaleFactor({ ...(doc.data.dimStyles.get(base.style) as DimStyleProps), ...base.overrides }, api.editor.ctx, base.annotative);
    const auto = 2 * textHeight * S;
    const v = await api.getDistance({ prompt: L('Valor de separación', 'Enter spacing value'), keywords: [K('Auto', 'Auto', 'Auto', ['a'])], allowNone: true, allowZero: true, defaultValue: auto });
    if (v.kind !== 'value' && v.kind !== 'none' && !(v.kind === 'keyword' && v.key === 'Auto')) return;
    const spacing = v.kind === 'value' ? Math.abs(v.value) : auto;
    const updated = spaceDimensions(base, dims, spacing);
    const skipped = dims.filter((d) => !updated.some((u) => u.id === d.id) && (d.dimType !== base.dimType || !['linear', 'aligned'].includes(d.dimType))).length;
    if (updated.length) api.apply('DIMSPACE', (tx) => updated.forEach((d) => tx.put('entities', d)));
    api.info(L(`${updated.length} cota(s) espaciada(s)${skipped ? `; ${skipped} omitida(s) por no ser paralelas` : ''}.`, `${updated.length} dimension(s) spaced${skipped ? `; ${skipped} skipped (not parallel)` : ''}.`));
  },
};

// ------------------------------------------------------------------ DIMBREAK

const DIMBREAK: CommandDef = {
  name: 'DIMBREAK',
  aliases: ['CORTECOTA', 'CORTARCOTA'],
  category: 'annotate',
  label: L('Cortar cota', 'Dimension break'),
  description: L('Interrumpe las líneas de cota y de extensión donde las cruzan otros objetos. Auto se mantiene al editar; Manual corta un tramo; Quitar los elimina.', 'Breaks dimension and extension lines where other objects cross them. Auto stays updated when editing; Manual cuts a span; Remove deletes breaks.'),
  icon: 'dimbreak',
  async run(api) {
    const doc = api.editor.doc;
    const ids = await api.getSelection({ prompt: L('Designe cotas', 'Select dimensions'), types: ['dimension'], usePreselection: true });
    const dims = ids.map((id) => doc.entity(id)).filter((e): e is DimensionEntity => e?.type === 'dimension');
    if (!dims.length) return;
    const k = await api.getKeyword({ prompt: L('Opción de corte', 'Break option'), keywords: [K('Auto', 'Auto', 'Auto', ['a']), K('Manual', 'Manual', 'Manual', ['m']), K('Remove', 'Quitar', 'Remove', ['q', 'r'])], defaultValue: 'Auto' });
    if (k.kind !== 'keyword') return;
    if (k.key === 'Remove') {
      api.apply('DIMBREAK', (tx) => dims.forEach((d) => tx.put('entities', { ...d, breaks: undefined, breakAuto: undefined })));
      api.info(L(`Cortes quitados de ${dims.length} cota(s).`, `Breaks removed from ${dims.length} dimension(s).`));
      return;
    }
    if (k.key === 'Auto') {
      let total = 0;
      api.apply('DIMBREAK', (tx) => {
        for (const d of dims) {
          const breaks = dimensionBreakPoints(d, api.editor.ctx, doc.data.entities.values());
          total += breaks.filter((b) => b.size === undefined).length;
          tx.put('entities', { ...d, breakAuto: true, breaks: breaks.length ? breaks : undefined });
        }
      });
      api.info(L(`${total} corte(s) automático(s) en ${dims.length} cota(s); se actualizan al editar.`, `${total} automatic break(s) in ${dims.length} dimension(s); they update when editing.`));
      return;
    }
    const d = dims[0];
    const a = await api.getPoint({ prompt: L('Precise el primer punto del corte', 'Specify first break point') });
    if (a.kind !== 'point') return;
    const b = await api.getPoint({ prompt: L('Precise el segundo punto del corte', 'Specify second break point'), base: a.p, rubber: 'line' });
    if (b.kind !== 'point') return;
    const m = scale(add(a.p, b.p), 0.5);
    const lines = buildDimension({ ...d, breaks: undefined }, api.editor.ctx).curves.filter((c): c is Extract<Curve, { kind: 'line' }> => c.kind === 'line');
    let best: { p: Vec2; u: Vec2; d: number } | null = null;
    for (const line of lines) {
      const u = normalize(sub(line.b, line.a));
      if (!len(u)) continue;
      const t = Math.max(0, Math.min(dist(line.a, line.b), dot(sub(m, line.a), u)));
      const q = add(line.a, scale(u, t));
      const dd = dist(q, m);
      if (!best || dd < best.d) best = { p: q, u, d: dd };
    }
    if (!best) fail('La cota no tiene líneas que cortar.', 'The dimension has no lines to break.');
    const size = Math.abs(dot(sub(b.p, a.p), best!.u));
    if (!(size > 0)) fail('Los dos puntos del corte coinciden a lo largo de la línea.', 'Both break points coincide along the line.');
    api.apply('DIMBREAK', (tx) => tx.put('entities', { ...d, breaks: [...(d.breaks ?? []), { p: best!.p, size }] }));
  },
};

// ------------------------------------------------------------------ CENTERMARK / CENTERLINE

const CENTERMARK: CommandDef = {
  name: 'CENTERMARK',
  aliases: ['MARCACENTRO', 'CM'],
  category: 'annotate',
  label: L('Marca de centro', 'Center mark'),
  description: L('Cruz y ejes asociativos en círculos y arcos: siguen al objeto si se mueve o cambia de radio.', 'Associative cross and axes on circles and arcs: they follow the object when it moves or changes radius.'),
  icon: 'centermark',
  async run(api) {
    const doc = api.editor.doc;
    const extension = centerExtension(api);
    let count = 0;
    for (;;) {
      const r = await api.getEntity({ prompt: L('Designe un círculo o arco para añadir una marca de centro', 'Select circle or arc to add center mark'), types: ['circle', 'arc'], allowNone: true });
      if (r.kind !== 'entity') break;
      const e = doc.entity(r.id);
      if (!e || (e.type !== 'circle' && e.type !== 'arc')) continue;
      const mark = make<CenterMarkEntity>(api, { type: 'centermark', mode: 'mark', owner: e.owner, center: e.center, radius: e.radius, rotation: 0, crossSize: 0.1, crossGap: 0.05, extension, sources: [{ entityId: e.id, part: 'center' }], linetype: centerLinetype(api) });
      insertEntities(api, 'CENTERMARK', [mark]);
      count++;
    }
    if (count) api.info(L(`${count} marca(s) de centro creada(s).`, `${count} center mark(s) created.`));
  },
};

const CENTERLINE: CommandDef = {
  name: 'CENTERLINE',
  aliases: ['EJECENTRO', 'CL'],
  category: 'annotate',
  label: L('Eje de centro', 'Centerline'),
  description: L('Eje asociativo entre dos tramos (paralelos o no): une los puntos medios de sus extremos y los sigue al editarlos.', 'Associative centerline between two segments (parallel or not): joins the midpoints of their ends and follows them when edited.'),
  icon: 'centerline',
  async run(api) {
    const doc = api.editor.doc;
    const pick = async (es: string, en: string): Promise<GeoRef | null> => {
      const r = await api.getEntity({ prompt: L(es, en), types: ['line', 'lwpolyline'] });
      if (r.kind !== 'entity') return null;
      const e = doc.entity(r.id);
      const ref = e && segmentRef(api, e, r.p);
      if (!ref) fail('Designa un tramo recto.', 'Select a straight segment.');
      return ref;
    };
    const a = await pick('Designe el primer tramo', 'Select first segment');
    if (!a) return;
    const b = await pick('Designe el segundo tramo', 'Select second segment');
    if (!b) return;
    const ea = doc.entity(a.entityId)!;
    if (doc.entity(b.entityId)!.owner !== ea.owner) fail('Los tramos deben estar en el mismo espacio.', 'Both segments must be in the same space.');
    const g = centerGeometryFrom('line', [a, b], (id) => doc.entity(id));
    if (!g) fail('Esos tramos no definen un eje (sus puntos medios coinciden).', 'Those segments do not define a centerline (their midpoints coincide).');
    const line = make<CenterMarkEntity>(api, { type: 'centermark', mode: 'line', owner: ea.owner, center: g!.center, end: g!.end, radius: 0, rotation: 0, crossSize: 0, crossGap: 0, extension: centerExtension(api), sources: [a, b], linetype: centerLinetype(api) });
    insertEntities(api, 'CENTERLINE', [line]);
  },
};

// ------------------------------------------------------------------ BLEND

const BLEND_TYPES = ['line', 'arc', 'lwpolyline', 'spline', 'ellipse'] as const;

const BLEND: CommandDef = {
  name: 'BLEND',
  aliases: ['ENLACE', 'CURVAENLACE'],
  category: 'draw',
  label: L('Curva de enlace', 'Blend curves'),
  description: L('Une los extremos más cercanos de dos objetos con una spline tangente (G1) o suave con curvatura continua (G2).', 'Joins the nearest ends of two objects with a tangent (G1) or smooth, curvature-continuous (G2) spline.'),
  icon: 'blend',
  async run(api) {
    const doc = api.editor.doc;
    let mode: BlendMode = 'tangent';
    const pick = async (first: boolean) => {
      for (;;) {
        const r = await api.getEntity({
          prompt: first ? L('Designe el primer objeto, cerca del extremo que se va a enlazar', 'Select first object near the end to blend') : L('Designe el segundo objeto, cerca del extremo', 'Select second object near the end'),
          types: [...BLEND_TYPES],
          keywords: first ? [K('Continuity', 'Continuidad', 'CONtinuity', ['c', 'con'])] : undefined,
        });
        if (r.kind === 'keyword') {
          const c = await api.getKeyword({ prompt: L('Continuidad', 'Continuity'), keywords: [K('Tangent', 'Tangente', 'Tangent', ['t']), K('Smooth', 'Suave', 'Smooth', ['s'])], defaultValue: mode === 'tangent' ? 'Tangent' : 'Smooth' });
          if (c.kind === 'keyword') mode = c.key === 'Smooth' ? 'smooth' : 'tangent';
          continue;
        }
        if (r.kind !== 'entity') return null;
        const e = doc.entity(r.id);
        if (!e) return null;
        const curves = kindOf(e).curves(e, api.editor.ctx);
        if (!curves.length) fail('Ese objeto no tiene extremos.', 'That object has no ends.');
        const first0 = curves[0];
        const last = curves[curves.length - 1];
        const atEnd = dist(r.p, curveEnd(last)) < dist(r.p, curveStart(first0));
        const data = curveEndData(atEnd ? last : first0, atEnd);
        if (!data) fail('No se puede determinar la dirección en ese extremo.', 'Cannot determine the direction at that end.');
        return { e, data: data! };
      }
    };
    const a = await pick(true);
    if (!a) return;
    const b = await pick(false);
    if (!b) return;
    if (a.e.owner !== b.e.owner) fail('Los objetos deben estar en el mismo espacio.', 'Both objects must be in the same space.');
    const spline = blendSpline(a.data, b.data, mode);
    if (!spline) fail('Los extremos elegidos coinciden: no hay hueco que enlazar.', 'The chosen ends coincide: there is no gap to blend.');
    const e = make<SplineEntity>(api, { type: 'spline', owner: a.e.owner, spline: spline!, method: 'cv', fitTolerance: 0 });
    insertEntities(api, 'BLEND', [e]);
  },
};

// ------------------------------------------------------------------ capas

const COPYTOLAYER: CommandDef = {
  name: 'COPYTOLAYER',
  aliases: ['COPIARACAPA'],
  category: 'layer',
  label: L('Copiar a capa', 'Copy to layer'),
  description: L('Copia objetos a otra capa, en el mismo sitio o desplazados.', 'Copies objects to another layer, in place or displaced.'),
  icon: 'copytolayer',
  async run(api) {
    const doc = api.editor.doc;
    const ids = await api.getSelection({ prompt: L('Designe objetos que se van a copiar', 'Select objects to copy'), usePreselection: true });
    if (!ids.length) return;
    const t = await api.getEntity({ prompt: L('Designe un objeto en la capa de destino', 'Select an object on the destination layer'), keywords: [K('Name', 'Nombre', 'Name', ['n'])], allowLocked: true });
    let layer: LayerRecord | undefined;
    let create: string | null = null;
    if (t.kind === 'keyword') {
      const n = await api.getString({ prompt: L('Nombre de la capa de destino', 'Destination layer name'), allowSpaces: true });
      if (n.kind !== 'string' || !n.value.trim()) return;
      layer = doc.findByName('layers', n.value.trim());
      if (!layer) {
        const c = await api.getKeyword({ prompt: L(`La capa «${n.value.trim()}» no existe. ¿Crearla?`, `Layer "${n.value.trim()}" does not exist. Create it?`), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'Yes' });
        if (c.kind !== 'keyword' || c.key !== 'Yes') return;
        create = n.value.trim();
      }
    } else if (t.kind === 'entity') layer = doc.data.layers.get(doc.entity(t.id)!.layer);
    else return;
    let shift: Vec2 = { x: 0, y: 0 };
    const b = await api.getPoint({ prompt: L('Precise el punto base o Intro para copiar en el sitio', 'Specify base point or Enter to copy in place'), allowNone: true });
    if (b.kind === 'point') {
      const moved = (p: Vec2) => ids.map((id) => doc.entity(id)).filter((e): e is Entity => !!e).map((e) => kindOf(e).transform(e, translation(p.x - b.p.x, p.y - b.p.y), api.editor.ctx)).filter(Boolean) as Entity[];
      const s = await api.getPoint({ prompt: L('Precise el segundo punto', 'Specify second point'), base: b.p, rubber: 'line', preview: (p) => ({ entities: moved(p) }) });
      if (s.kind !== 'point') return;
      shift = sub(s.p, b.p);
    } else if (b.kind !== 'none') return;
    const name = api.apply('COPYTOLAYER', (tx) => {
      let target = layer;
      if (create) {
        const cur = doc.data.layers.get(doc.settings.currentLayer) ?? [...doc.data.layers.values()][0];
        target = tx.add('layers', { ...cur, id: newId('layer'), name: create, on: true, frozen: false, locked: false, description: '', order: Math.max(0, ...[...doc.data.layers.values()].map((l) => l.order)) + 1 });
      }
      for (const id of ids) {
        const e = doc.entity(id);
        if (!e) continue;
        const moved = shift.x || shift.y ? kindOf(e).transform(e, translation(shift.x, shift.y), api.editor.ctx) : e;
        if (!moved) continue;
        const { id: _i, order: _o, ...rest } = moved as Entity;
        tx.addEntity({ ...rest, layer: target!.id } as never);
      }
      return target!.name;
    });
    api.info(L(`${ids.length} objeto(s) copiado(s) a la capa «${name}».`, `${ids.length} object(s) copied to layer "${name}".`));
  },
};

const LAYWALK: CommandDef = {
  name: 'LAYWALK',
  aliases: ['RECORRERCAPAS'],
  category: 'layer',
  readOnly: true,
  label: L('Recorrer capas', 'Layer walk'),
  description: L('Muestra las capas del espacio actual de una en una para revisar qué contiene cada una; al salir, la vista vuelve a como estaba (no cambia el dibujo).', 'Shows the layers of the current space one at a time to review what each contains; on exit the view is restored (the drawing does not change).'),
  icon: 'laywalk',
  async run(api) {
    const editor = api.editor;
    const doc = editor.doc;
    const byLayer = new Map<Id, Id[]>();
    for (const e of doc.entitiesOf(editor.space)) byLayer.set(e.layer, [...(byLayer.get(e.layer) ?? []), e.id]);
    const layers = [...byLayer.keys()].map((id) => doc.data.layers.get(id)).filter((l): l is LayerRecord => !!l).sort((a, b) => a.name.localeCompare(b.name));
    if (!layers.length) {
      api.info(L('El espacio actual no tiene objetos.', 'The current space has no objects.'));
      return;
    }
    const saved = { isolated: editor.isolated, hidden: new Set(editor.hidden) };
    let i = Math.max(0, layers.findIndex((l) => l.id === doc.settings.currentLayer));
    try {
      for (;;) {
        const l = layers[i];
        editor.isolated = new Set(byLayer.get(l.id));
        editor.hidden.clear();
        editor.emit('doc');
        const state = !l.on || l.frozen ? L(' (apagada o inutilizada: no se ve)', ' (off or frozen: not visible)') : L('', '');
        const k = await api.getKeyword({
          prompt: L(`Capa «${l.name}» · ${byLayer.get(l.id)!.length} objeto(s) · ${i + 1}/${layers.length}${state.es}`, `Layer "${l.name}" · ${byLayer.get(l.id)!.length} object(s) · ${i + 1}/${layers.length}${state.en}`),
          keywords: [K('Next', 'Siguiente', 'Next', ['s', 'n']), K('Previous', 'Anterior', 'Previous', ['a', 'p']), K('Name', 'Nombre', 'Name', ['nombre', 'name']), K('Exit', 'Salir', 'eXit', ['x', 'salir'])],
          defaultValue: 'Next',
        });
        if (k.kind !== 'keyword' || k.key === 'Exit') break;
        if (k.key === 'Next') i = (i + 1) % layers.length;
        else if (k.key === 'Previous') i = (i - 1 + layers.length) % layers.length;
        else {
          const n = await api.getString({ prompt: L('Nombre de la capa', 'Layer name'), allowSpaces: true });
          if (n.kind !== 'string') break;
          const j = layers.findIndex((x) => x.name.toLowerCase() === n.value.trim().toLowerCase());
          if (j < 0) api.warn(L(`No hay objetos en la capa «${n.value.trim()}» en este espacio.`, `No objects on layer "${n.value.trim()}" in this space.`));
          else i = j;
        }
      }
    } finally {
      editor.isolated = saved.isolated;
      editor.hidden = saved.hidden;
      editor.emit('doc');
    }
  },
};

// ------------------------------------------------------------------ textos

/** Contenido de TEXT como MTEXT: barras y llaves literales escapadas; los campos {{…}} se conservan. */
export function textToMTextContents(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{\{[\s\S]*?\}\}|[{}]/g, (m) => (m.length > 1 ? m : `\\${m}`));
}

const TXT2MTXT: CommandDef = {
  name: 'TXT2MTXT',
  aliases: ['TEXTOATEXTOM'],
  category: 'annotate',
  label: L('Texto a texto múltiple', 'Text to Mtext'),
  description: L('Convierte textos de una línea en texto múltiple; por defecto combina los designados en un párrafo, de arriba abajo.', 'Converts single-line text to Mtext; by default combines the selected ones into one paragraph block, top to bottom.'),
  icon: 'txt2mtxt',
  async run(api) {
    const doc = api.editor.doc;
    const ids = await api.getSelection({ prompt: L('Designe textos de una línea', 'Select single-line text'), types: ['text'], usePreselection: true });
    const texts = ids.map((id) => doc.entity(id)).filter((e): e is TextEntity => e?.type === 'text');
    if (!texts.length) return;
    let combine = texts.length > 1;
    if (texts.length > 1) {
      const k = await api.getKeyword({ prompt: L('¿Combinar en un solo texto múltiple?', 'Combine into a single Mtext?'), keywords: [K('Combine', 'Combinar', 'Combine', ['c']), K('Individual', 'Individual', 'Individual', ['i'])], defaultValue: 'Combine' });
      if (k.kind !== 'keyword') return;
      combine = k.key === 'Combine';
    }
    const ctx = api.editor.ctx;
    const toMText = (group: TextEntity[]): MTextEntity => {
      const r = group[0].rotation;
      const u = { x: Math.cos(r), y: Math.sin(r) };
      const v = perp(u);
      const ordered = [...group].sort((a, b) => dot(b.position, v) - dot(a.position, v) || dot(a.position, u) - dot(b.position, u));
      const corners = ordered.flatMap((t) => kindOf(t).outline?.(t, ctx) ?? [t.position]);
      const minU = Math.min(...corners.map((p) => dot(p, u)));
      const maxV = Math.max(...corners.map((p) => dot(p, v)));
      const top = ordered[0];
      const { id: _i, order: _o, type: _t, position: _p, alignPoint: _a, text: _x, height: _h, rotation: _r, widthFactor: _w, oblique: _ob, style: _s, halign: _ha, valign: _va, ...base } = top;
      return { ...base, id: '', order: 0, type: 'mtext', position: add(scale(u, minU), scale(v, maxV)), width: 0, height: top.height, rotation: r, style: top.style, attachment: 1, lineSpacing: 1, contents: ordered.map((t) => textToMTextContents(t.text)).join('\\P') } as MTextEntity;
    };
    const groups: TextEntity[][] = [];
    if (combine) {
      const main = texts.filter((t) => Math.abs(t.rotation - texts[0].rotation) < 1e-9 && t.owner === texts[0].owner);
      groups.push(main, ...texts.filter((t) => !main.includes(t)).map((t) => [t]));
    } else groups.push(...texts.map((t) => [t]));
    const created = api.apply('TXT2MTXT', (tx) => groups.map((g) => {
      const m = toMText(g);
      for (const t of g) tx.removeEntity(t.id);
      const { id: _i, order: _o, ...rest } = m;
      return tx.addEntity(rest as never).id;
    }));
    api.editor.selection.set(created);
    api.info(L(`${texts.length} texto(s) convertido(s) en ${created.length} texto(s) múltiple(s).`, `${texts.length} text(s) converted into ${created.length} Mtext object(s).`));
  },
};

const TEXTALIGN: CommandDef = {
  name: 'TEXTALIGN',
  aliases: ['ALINEARTEXTO'],
  category: 'annotate',
  label: L('Alinear textos', 'Align text'),
  description: L('Alinea los puntos de inserción de varios textos sobre una línea que pasa por un texto de referencia; Distribuir además los espacia por igual.', 'Aligns the insertion points of several texts on a line through a reference text; Distribute also spaces them evenly.'),
  icon: 'textalign',
  async run(api) {
    const doc = api.editor.doc;
    const ctx = api.editor.ctx;
    const ids = await api.getSelection({ prompt: L('Designe los textos que se van a alinear', 'Select text objects to align'), types: ['text', 'mtext'], usePreselection: true });
    const texts = ids.map((id) => doc.entity(id)).filter((e): e is TextEntity | MTextEntity => e?.type === 'text' || e?.type === 'mtext');
    if (texts.length < 2) fail('Designa al menos dos textos.', 'Select at least two texts.');
    const r = await api.getEntity({ prompt: L('Designe el texto de referencia', 'Select text to align to'), types: ['text', 'mtext'] });
    if (r.kind !== 'entity') return;
    const refEntity = doc.entity(r.id)!;
    const anchor = (e: Entity): Vec2 => kindOf(e).snapPoints(e, ctx).find((s) => s.type === 'insertion')?.p ?? (e as TextEntity).position;
    const base = anchor(refEntity);
    let distribute = false;
    let dir: Vec2 | null = null;
    while (!dir) {
      const d = await api.getPoint({
        prompt: L('Precise la dirección de alineación', 'Specify alignment direction'),
        base,
        rubber: 'line',
        keywords: [K('Distribute', 'Distribuir', 'Distribute', ['d']), K('Horizontal', 'Horizontal', 'Horizontal', ['h']), K('Vertical', 'Vertical', 'Vertical', ['v'])],
      });
      if (d.kind === 'keyword') {
        if (d.key === 'Distribute') distribute = true;
        else dir = d.key === 'Horizontal' ? { x: 1, y: 0 } : { x: 0, y: 1 };
        continue;
      }
      if (d.kind !== 'point') return;
      const v = sub(d.p, base);
      if (!(len(v) > 1e-12)) fail('La dirección no puede tener longitud nula.', 'The direction cannot have zero length.');
      dir = normalize(v);
    }
    const u = dir;
    const along = texts.map((t) => ({ t, s: dot(sub(anchor(t), base), u) })).sort((a, b) => a.s - b.s);
    const s0 = along[0].s;
    const s1 = along[along.length - 1].s;
    const moved = along.map(({ t, s }, i) => {
      const target = add(base, scale(u, distribute && along.length > 1 ? s0 + ((s1 - s0) * i) / (along.length - 1) : s));
      const delta = sub(target, anchor(t));
      return kindOf(t).transform(t, translation(delta.x, delta.y), ctx);
    }).filter(Boolean) as Entity[];
    api.apply('TEXTALIGN', (tx) => moved.forEach((e) => tx.put('entities', e)));
    api.info(L(`${moved.length} texto(s) alineado(s)${distribute ? ' y distribuido(s)' : ''}.`, `${moved.length} text(s) aligned${distribute ? ' and distributed' : ''}.`));
  },
};

// ------------------------------------------------------------------ MASSPROP

/** Lazos cerrados de un objeto, o null si no encierra una región. */
function regionLoops(api: CommandApi, e: Entity): Curve[][] | null {
  if (e.type === 'region' || e.type === 'hatch') return e.loops.map((l) => polylineSegments(l.vertices, true));
  if (e.type === 'lwpolyline' || e.type === 'polyline2d') {
    const closed = e.closed || (e.vertices.length > 2 && dist(e.vertices[0], e.vertices[e.vertices.length - 1]) < 1e-9);
    return closed ? [kindOf(e).curves(e, api.editor.ctx)] : null;
  }
  if (e.type === 'circle') return [kindOf(e).curves(e, api.editor.ctx)];
  if (e.type === 'ellipse' || e.type === 'spline') {
    const cs = kindOf(e).curves(e, api.editor.ctx);
    const closed = cs.length > 0 && dist(curveStart(cs[0]), curveEnd(cs[cs.length - 1])) < 1e-9;
    return closed ? [cs] : null;
  }
  return null;
}

export function massPropsReport(m: MassProperties, count: number, units: string, precision: number): { es: string; en: string }[] {
  const f = (v: number) => (v !== 0 && (Math.abs(v) >= 1e7 || Math.abs(v) < 10 ** -precision) ? v.toExponential(Math.max(3, precision)) : v.toFixed(precision));
  const u = units === 'unitless' ? '' : ` ${units}`;
  const u2 = units === 'unitless' ? '' : ` ${units}²`;
  const u4 = units === 'unitless' ? '' : ` ${units}⁴`;
  const deg = ((m.principal.angle * 180) / Math.PI).toFixed(2);
  return [
    { es: `---------- PROPIEDADES DE MASA (${count} objeto/s) ----------`, en: `---------- MASS PROPERTIES (${count} object/s) ----------` },
    { es: `Área: ${f(m.area)}${u2}`, en: `Area: ${f(m.area)}${u2}` },
    { es: `Perímetro: ${f(m.perimeter)}${u}`, en: `Perimeter: ${f(m.perimeter)}${u}` },
    { es: `Cuadro delimitador: X ${f(m.bbox.minX)} — ${f(m.bbox.maxX)}; Y ${f(m.bbox.minY)} — ${f(m.bbox.maxY)}`, en: `Bounding box: X ${f(m.bbox.minX)} — ${f(m.bbox.maxX)}; Y ${f(m.bbox.minY)} — ${f(m.bbox.maxY)}` },
    { es: `Centroide: X ${f(m.centroid.x)}, Y ${f(m.centroid.y)}`, en: `Centroid: X ${f(m.centroid.x)}, Y ${f(m.centroid.y)}` },
    { es: `Momentos de inercia por el centroide: Ix ${f(m.ixx)}${u4}, Iy ${f(m.iyy)}${u4}`, en: `Moments of inertia about centroid: Ix ${f(m.ixx)}${u4}, Iy ${f(m.iyy)}${u4}` },
    { es: `Producto de inercia por el centroide: Ixy ${f(m.ixy)}${u4}`, en: `Product of inertia about centroid: Ixy ${f(m.ixy)}${u4}` },
    { es: `Radios de giro: rx ${f(m.radii.rx)}${u}, ry ${f(m.radii.ry)}${u}`, en: `Radii of gyration: rx ${f(m.radii.rx)}${u}, ry ${f(m.radii.ry)}${u}` },
    { es: `Momentos principales: I1 ${f(m.principal.i1)}${u4} a ${deg}°, I2 ${f(m.principal.i2)}${u4}`, en: `Principal moments: I1 ${f(m.principal.i1)}${u4} at ${deg}°, I2 ${f(m.principal.i2)}${u4}` },
    { es: `Respecto al origen: Ix ${f(m.ixxOrigin)}${u4}, Iy ${f(m.iyyOrigin)}${u4}, Ixy ${f(m.ixyOrigin)}${u4}`, en: `About the origin: Ix ${f(m.ixxOrigin)}${u4}, Iy ${f(m.iyyOrigin)}${u4}, Ixy ${f(m.ixyOrigin)}${u4}` },
    ...(m.exact ? [] : [{ es: 'Aviso: las splines se aproximaron con tramos rectos (error menor de 1e-6).', en: 'Note: splines were approximated with straight spans (error below 1e-6).' }]),
  ];
}

const MASSPROP: CommandDef = {
  name: 'MASSPROP',
  aliases: ['PROPFIS', 'PROPIEDADESMASA'],
  category: 'inquiry',
  readOnly: true,
  label: L('Propiedades de masa', 'Mass properties'),
  description: L('Área, perímetro, centroide, momentos y producto de inercia, radios de giro y ejes principales de regiones y contornos cerrados; los huecos se restan.', 'Area, perimeter, centroid, moments and product of inertia, radii of gyration and principal axes of regions and closed boundaries; holes are subtracted.'),
  icon: 'massprop',
  async run(api) {
    const doc = api.editor.doc;
    const ids = await api.getSelection({ prompt: L('Designe regiones o contornos cerrados', 'Select regions or closed boundaries'), usePreselection: true });
    const list: MassProperties[] = [];
    let skipped = 0;
    for (const id of ids) {
      const e = doc.entity(id);
      const loops = e && regionLoops(api, e);
      const m = loops && massProperties(loops);
      if (m) list.push(m);
      else skipped++;
    }
    const total = combineMassProperties(list);
    if (!total) fail('Ningún objeto designado encierra una región (usa regiones, polilíneas cerradas, círculos o sombreados).', 'No selected object encloses a region (use regions, closed polylines, circles or hatches).');
    const lines = massPropsReport(total!, list.length, doc.settings.units, Math.max(2, doc.settings.linearPrecision));
    for (const line of lines) api.info(line);
    if (skipped) api.warn(L(`${skipped} objeto(s) omitido(s): no encierran una región.`, `${skipped} object(s) skipped: they do not enclose a region.`));
    const k = await api.getKeyword({ prompt: L('¿Guardar el análisis en un archivo?', 'Write analysis to a file?'), keywords: [K('Yes', 'Sí', 'Yes', ['s', 'y']), K('No', 'No', 'No', ['n'])], defaultValue: 'No' });
    if (k.kind !== 'keyword' || k.key !== 'Yes') return;
    const text = lines.map((l) => l[api.lang]).join('\n') + '\n';
    const result = await saveFile(new Blob([text], { type: 'text/plain' }), 'propiedades-de-masa.txt', { 'text/plain': ['.txt'] }, api.lang === 'es' ? 'Texto' : 'Text');
    if (result.kind === 'cancelled') return;
    api.info(L('Análisis guardado.', 'Analysis saved.'));
  },
};

export const PRODUCTION_COMMANDS: CommandDef[] = [QDIM, DIMSPACE, DIMBREAK, CENTERMARK, CENTERLINE, BLEND, COPYTOLAYER, LAYWALK, TXT2MTXT, TEXTALIGN, MASSPROP];

