import { detectBoundary } from '../../geometry/boundary';
import type { Curve } from '../../geometry/curves';
import { curvePoint } from '../../geometry/curves';
import type { Vec2 } from '../../geometry/vec';
import { dist } from '../../geometry/vec';
import type {
  Entity,
  HatchEntity,
  Id,
  Loop,
  LwPolylineEntity,
  MLineEntity,
  RegionEntity,
  WipeoutEntity,
} from '../../document/types';
import { entityVisible } from '../../model/visibility';
import { HATCH_PATTERNS } from '../../model/hatchPatterns';
import { kindOf } from '../../model/registry';
import { add as addEntity, addMany, CLOSE_KW, fail, K, L, make, UNDO_KW } from '../helpers';
import type { CommandApi, CommandDef } from '../types';

// ============================================================================ MLINE

export const MLINE: CommandDef = {
  name: 'MLINE',
  aliases: ['ML', 'LINEAM'],
  category: 'draw',
  label: L('Multilínea', 'Multiline'),
  description: L('Dibuja líneas paralelas múltiples según el estilo de multilínea, con escala y justificación.', 'Draws multiple parallel lines per multiline style, with scale and justification.'),
  icon: 'mline',
  async run(api) {
    const s = api.editor.doc.settings;
    let justification: MLineEntity['justification'] = 'zero';
    let scaleV = 20;
    let first: Vec2 | null = null;
    while (!first) {
      const r = await api.getPoint({ prompt: L(`Precise el punto inicial (just. ${justification}, escala ${scaleV})`, `Specify start point (just. ${justification}, scale ${scaleV})`), keywords: [K('Justification', 'Justificación', 'Justification', ['j']), K('Scale', 'Escala', 'Scale', ['e', 's'])] });
      if (r.kind === 'point') first = r.p;
      else if (r.kind === 'keyword' && r.key === 'Scale') {
        const v = await api.getNumber({ prompt: L('Escala de multilínea', 'Multiline scale'), defaultValue: scaleV });
        if (v.kind === 'value') scaleV = v.value;
      } else if (r.kind === 'keyword') {
        const j = await api.getKeyword({ prompt: L('Tipo de justificación', 'Justification type'), keywords: [K('Top', 'Superior', 'Top', ['s', 't']), K('Zero', 'Cero', 'Zero', ['c', 'z']), K('Bottom', 'Inferior', 'Bottom', ['i', 'b'])] });
        if (j.kind === 'keyword') justification = j.key.toLowerCase() as MLineEntity['justification'];
      } else return;
    }
    const verts = [first];
    const build = (pts: Vec2[], closed = false) => make<MLineEntity>(api, { type: 'mline', vertices: pts, closed, style: s.currentMLineStyle, scale: scaleV, justification });
    let id: Id | null = null;
    for (;;) {
      const r = await api.getPoint({ prompt: L('Precise el punto siguiente', 'Specify next point'), base: verts[verts.length - 1], rubber: 'line', allowNone: true, keywords: [UNDO_KW, ...(verts.length > 2 ? [CLOSE_KW] : [])], preview: (p) => ({ entities: [build([verts[verts.length - 1], p])] }) });
      if (r.kind === 'none') return;
      if (r.kind === 'keyword') {
        if (r.key === 'Undo') {
          if (verts.length > 1) verts.pop();
          if (id) {
            const cid = id;
            if (verts.length < 2) {
              api.apply('MLINE', (tx) => tx.removeEntity(cid));
              id = null;
            } else api.apply('MLINE', (tx) => tx.updateEntity<MLineEntity>(cid, { vertices: [...verts] }));
          }
          continue;
        }
        if (r.key === 'Close' && id) {
          const cid = id;
          api.apply('MLINE', (tx) => tx.updateEntity<MLineEntity>(cid, { closed: true }));
          return;
        }
        continue;
      }
      verts.push(r.p);
      if (verts.length >= 2) {
        if (!id) id = addEntity<MLineEntity>(api, 'MLINE', { ...build([...verts]), id: undefined, order: undefined } as never).id;
        else {
          const cid = id;
          api.apply('MLINE', (tx) => tx.updateEntity<MLineEntity>(cid, { vertices: [...verts] }));
        }
      }
    }
  },
};

// ============================================================================ WIPEOUT

export const WIPEOUT: CommandDef = {
  name: 'WIPEOUT',
  aliases: ['COBERTURA'],
  category: 'draw',
  label: L('Cobertura', 'Wipeout'),
  description: L('Crea un área poligonal que oculta los objetos de debajo con el color de fondo.', 'Creates a polygonal area that masks underlying objects with the background color.'),
  icon: 'wipeout',
  async run(api) {
    const first = await api.getPoint({ prompt: L('Precise el primer punto', 'Specify first point'), keywords: [K('Frames', 'Marcos', 'Frames', ['m', 'f'])] });
    if (first.kind === 'keyword') {
      const f = await api.getKeyword({ prompt: L('Marcos de cobertura', 'Wipeout frames'), keywords: [K('ON', 'ACT', 'ON'), K('OFF', 'DES', 'OFF')] });
      if (f.kind === 'keyword') {
        const on = f.key === 'ON';
        api.apply('WIPEOUT_FRAMES', (tx) => {
          for (const [id, e] of api.editor.doc.data.entities) {
            if (e.type === 'wipeout') tx.updateEntity<WipeoutEntity>(id, { frame: on });
          }
        });
      }
      return;
    }
    if (first.kind !== 'point') return;
    const pts: Vec2[] = [first.p];
    for (;;) {
      const n = await api.getPoint({ prompt: L('Precise el punto siguiente', 'Specify next point'), base: pts[pts.length - 1], rubber: 'line', allowNone: true, preview: (p) => ({ entities: [make<WipeoutEntity>(api, { type: 'wipeout', vertices: [...pts, p], frame: true })] }) });
      if (n.kind !== 'point') break;
      pts.push(n.p);
    }
    if (pts.length < 3) fail('La cobertura necesita al menos tres puntos.', 'A wipeout needs at least three points.');
    addEntity<WipeoutEntity>(api, 'WIPEOUT', { type: 'wipeout', vertices: pts, frame: true });
  },
};

// ============================================================================ HATCH / BOUNDARY / REGION

export function closedLoopOf(api: CommandApi, e: Entity): Loop | null {
  if (e.type === 'lwpolyline' && e.closed) return { vertices: e.vertices.map((v) => ({ ...v })), closed: true };
  if (e.type === 'circle') return { vertices: [{ x: e.center.x + e.radius, y: e.center.y, bulge: 1 }, { x: e.center.x - e.radius, y: e.center.y, bulge: 1 }], closed: true };
  if (e.type === 'region') return e.loops[0] ?? null;
  const curves = kindOf(e).curves(e, api.editor.ctx);
  if (!curves.length) return null;
  const pts = curves.flatMap((c) => [curvePoint(c, 0), ...Array.from({ length: 63 }, (_, i) => curvePoint(c, (i + 1) / 64))]);
  if (dist(pts[0], curvePoint(curves[curves.length - 1], 1)) > 1e-6) return null;
  return { vertices: pts.map((p) => ({ ...p, bulge: 0 })), closed: true };
}

export const hatchDefaults = { pattern: 'ANSI31', scale: 1, angle: 0, type: 'predefined' as HatchEntity['pattern']['type'] };

async function pickBoundaries(api: CommandApi, promptHatch: boolean): Promise<Loop[][] | null> {
  const results: Loop[][] = [];
  for (;;) {
    const r = await api.getPoint({ prompt: L('Designe un punto interno', 'Pick internal point'), allowNone: true, noSnap: true, keywords: promptHatch ? [K('Select', 'Seleccionar objetos', 'Select objects', ['s'])] : [] });
    if (r.kind === 'none') break;
    if (r.kind === 'keyword') {
      const ids = await api.getSelection({ prompt: L('Designe objetos cerrados', 'Select closed objects'), types: ['lwpolyline', 'circle', 'ellipse', 'spline', 'region', 'polyline2d'], usePreselection: false });
      for (const id of ids) {
        const e = api.editor.doc.entity(id)!;
        if (e.type === 'region') {
          if (e.loops.length) results.push(e.loops.map((loop) => ({ closed: true, vertices: loop.vertices.map((vertex) => ({ ...vertex })) })));
          continue;
        }
        const loop = closedLoopOf(api, e);
        if (loop) results.push([loop]);
      }
      break;
    }
    if (r.kind !== 'point') return null;
    const editor = api.editor;
    const box = editor.view.visibleBox();
    const m = editor.ownerToSpace;
    const curves: Curve[] = [];
    for (const id of editor.index.query(editor.inputOwner, m ? { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity } : box)) {
      const e = editor.doc.entity(id);
      if (!e || !entityVisible(editor.doc, e, editor.visibility()) || e.type === 'hatch' || e.type === 'text' || e.type === 'mtext') continue;
      curves.push(...kindOf(e).curves(e, editor.ctx));
    }
    const res = detectBoundary(curves, r.p, Math.max(1e-7, editor.ownerPerPixel * 0.05));
    if (!res) {
      api.warn(L('No se encontró un contorno cerrado válido alrededor del punto. Comprueba huecos entre objetos o amplía la vista.', 'No valid closed boundary found around the point. Check for gaps between objects or zoom out.'));
      continue;
    }
    results.push([{ vertices: res.outer, closed: true }, ...res.islands.map((v) => ({ vertices: v, closed: true as const }))]);
    api.setPreview({ entities: results.map((loops) => make<HatchEntity>(api, { type: 'hatch', loops, pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal', transparency: 70 })) });
  }
  return results;
}

export const HATCH: CommandDef = {
  name: 'HATCH',
  aliases: ['H', 'BH', 'SOMBREADO', 'SOMB'],
  category: 'draw',
  label: L('Sombreado', 'Hatch'),
  description: L('Rellena áreas cerradas con patrón, sólido o degradado; detecta contornos e islas.', 'Fills closed areas with pattern, solid or gradient; detects boundaries and islands.'),
  help: L('Designa puntos internos (se detectan contornos e islas en la vista actual) o Selecciona objetos cerrados. Opciones: Patrón, Escala, Ángulo, Sólido, Islas.', 'Pick internal points (boundaries and islands detected in the current view) or Select closed objects. Options: Pattern, Scale, Angle, Solid, Islands.'),
  icon: 'hatch',
  async run(api) {
    let islandStyle: HatchEntity['islandStyle'] = 'normal';
    for (;;) {
      const opt = await api.getKeyword({
        prompt: L(`Patrón ${hatchDefaults.type === 'solid' ? 'SOLID' : hatchDefaults.pattern} · escala ${hatchDefaults.scale} · ángulo ${Math.round((hatchDefaults.angle * 180) / Math.PI)}°. Intro para designar áreas`, `Pattern ${hatchDefaults.type === 'solid' ? 'SOLID' : hatchDefaults.pattern} · scale ${hatchDefaults.scale} · angle ${Math.round((hatchDefaults.angle * 180) / Math.PI)}°. Enter to pick areas`),
        keywords: [K('Pattern', 'Patrón', 'Pattern', ['p']), K('Scale', 'Escala', 'Scale', ['e', 's']), K('Angle', 'Ángulo', 'Angle', ['a']), K('Solid', 'Sólido', 'Solid', ['so']), K('Islands', 'Islas', 'Islands', ['i'])],
        allowNone: true,
      });
      if (opt.kind === 'none') break;
      if (opt.key === 'Pattern') {
        const p = await api.getString({ prompt: L(`Nombre del patrón (${HATCH_PATTERNS.map((x) => x.name).slice(0, 8).join(', ')}…)`, `Pattern name (${HATCH_PATTERNS.map((x) => x.name).slice(0, 8).join(', ')}…)`), defaultValue: hatchDefaults.pattern });
        if (p.kind === 'string') {
          const found = HATCH_PATTERNS.find((x) => x.name === p.value.toUpperCase());
          if (found) {
            hatchDefaults.pattern = found.name;
            hatchDefaults.type = 'predefined';
          } else api.warn(L(`Patrón desconocido «${p.value}».`, `Unknown pattern "${p.value}".`));
        }
      } else if (opt.key === 'Scale') {
        const v = await api.getNumber({ prompt: L('Escala del patrón', 'Pattern scale'), defaultValue: hatchDefaults.scale, min: 1e-9 });
        if (v.kind === 'value') hatchDefaults.scale = v.value;
      } else if (opt.key === 'Angle') {
        const v = await api.getAngle({ prompt: L('Ángulo del patrón', 'Pattern angle'), defaultValue: hatchDefaults.angle });
        if (v.kind === 'value') hatchDefaults.angle = v.value;
      } else if (opt.key === 'Solid') hatchDefaults.type = 'solid';
      else {
        const s = await api.getKeyword({ prompt: L('Detección de islas', 'Island detection'), keywords: [K('Normal', 'Normal', 'Normal', ['n']), K('Outer', 'Exterior', 'Outer', ['e', 'o']), K('Ignore', 'Ignorar', 'Ignore', ['i'])] });
        if (s.kind === 'keyword') islandStyle = s.key.toLowerCase() as HatchEntity['islandStyle'];
      }
    }
    const areas = await pickBoundaries(api, true);
    api.setPreview(null);
    if (!areas?.length) return;
    addMany(
      api,
      'HATCH',
      areas.map((loops) =>
        make<HatchEntity>(api, {
          type: 'hatch',
          loops,
          pattern: { type: hatchDefaults.type, name: hatchDefaults.type === 'solid' ? 'SOLID' : hatchDefaults.pattern, angle: hatchDefaults.angle, scale: hatchDefaults.scale, spacing: 5, double: false },
          origin: { x: 0, y: 0 },
          islandStyle,
        }),
      ),
    );
  },
};

export const BOUNDARY: CommandDef = {
  name: 'BOUNDARY',
  aliases: ['BO', 'CONTORNO', 'BPOLY'],
  category: 'draw',
  label: L('Contorno', 'Boundary'),
  description: L('Crea polilíneas o regiones cerradas a partir de un área delimitada por objetos.', 'Creates closed polylines or regions from an area enclosed by objects.'),
  icon: 'boundary',
  async run(api) {
    const type = await api.getKeyword({ prompt: L('Tipo de objeto', 'Object type'), keywords: [K('Polyline', 'Polilínea', 'Polyline', ['p']), K('Region', 'Región', 'Region', ['r'])], defaultValue: 'Polyline' });
    if (type.kind !== 'keyword') return;
    const areas = await pickBoundaries(api, false);
    api.setPreview(null);
    if (!areas?.length) return;
    const ents: Entity[] = [];
    for (const loops of areas) {
      if (type.key === 'Region') ents.push(make<RegionEntity>(api, { type: 'region', loops }));
      else for (const l of loops) ents.push(make<LwPolylineEntity>(api, { type: 'lwpolyline', vertices: l.vertices, closed: true }));
    }
    addMany(api, 'BOUNDARY', ents);
    api.info(L(`BOUNDARY creó ${ents.length} objeto(s).`, `BOUNDARY created ${ents.length} object(s).`));
  },
};

export const REGION: CommandDef = {
  name: 'REGION',
  aliases: ['REG', 'REGION'],
  category: 'draw',
  label: L('Región', 'Region'),
  description: L('Convierte objetos cerrados en regiones 2D.', 'Converts closed objects into 2D regions.'),
  icon: 'region',
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe objetos cerrados', 'Select closed objects'), types: ['lwpolyline', 'circle', 'ellipse', 'spline', 'polyline2d'] });
    let n = 0;
    api.apply('REGION', (tx) => {
      for (const id of ids) {
        const e = api.editor.doc.entity(id)!;
        const loop = closedLoopOf(api, e);
        if (!loop) continue;
        const { id: _i, order: _o, ...rest } = make<RegionEntity>(api, { type: 'region', loops: [loop], layer: e.layer, color: e.color });
        tx.addEntity(rest as never);
        tx.removeEntity(id);
        n++;
      }
    });
    api.info(L(`${n} región(es) creada(s); ${ids.length - n} objeto(s) no cerrado(s) omitido(s).`, `${n} region(s) created; ${ids.length - n} non-closed object(s) skipped.`));
  },
};

export const AREA_COMMANDS: CommandDef[] = [MLINE, WIPEOUT, HATCH, BOUNDARY, REGION];
