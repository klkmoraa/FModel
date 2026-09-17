import { boxFromPoints, isEmptyBox } from '../geometry/bbox';
import { tessellateCurve } from '../geometry/curves';
import { tessellatePolyline } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import { defaultPageSetup, entityDefaults, LAYER0_ID, paperExtents, STANDARD_SCALES, TEXTSTYLE_STANDARD_ID, unitConversion } from '../document/defaults';
import { insertBlock } from '../blocks/blockOps';
import { newId } from '../document/ids';
import type { AttdefEntity, Entity, Id, LayoutRecord, LineEntity, LwPolylineEntity, TextEntity, ViewportEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { kindOf } from '../model/registry';
import { entityVisible } from '../model/visibility';
import { add, CLOSE_KW, K, L, UNDO_KW } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

// ------------------------------------------------------------------ utilidades

function currentLayout(api: CommandApi): LayoutRecord {
  const l = api.editor.doc.data.layouts.get(api.editor.space);
  if (!l) throw new CommandError(L('Este comando solo funciona en una presentación (pestañas inferiores).', 'This command only works in a layout (bottom tabs).'));
  return l;
}

/** Sale del viewport activo sin cancelar el comando en curso. */
function toPaper(api: CommandApi) {
  const editor = api.editor;
  if (!editor.activeViewportId) return;
  editor.activeViewportId = null;
  editor.emit('space');
  editor.emit('view');
}

function viewportsOf(api: CommandApi, layoutId: Id): ViewportEntity[] {
  return api.editor.doc.entitiesOf(layoutId).filter((e): e is ViewportEntity => e.type === 'viewport');
}

/**
 * Escala de viewport a partir de texto: «1:50», «1/50», «2:1», un nombre de la lista de escalas
 * o un número (unidades de papel por unidad de dibujo). Tiene en cuenta las unidades del dibujo:
 * el papel está en milímetros.
 */
export function parseViewportScale(text: string, drawingUnits: Parameters<typeof unitConversion>[0], scales = STANDARD_SCALES): { scale: number; name?: string } | null {
  const t = text.trim().replace(',', '.');
  const unit = unitConversion(drawingUnits, 'mm');
  const named = scales.find((s) => s.name.toLowerCase() === t.toLowerCase());
  if (named) return { scale: (named.paper / named.drawing) * unit, name: named.name };
  const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 0 && b > 0) return { scale: (a / b) * unit, name: `${m[1]}:${m[2]}` };
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? { scale: n } : null;
}

function modelExtents(api: CommandApi) {
  const editor = api.editor;
  return editor.index.extents(MODEL_SPACE_ID, (id) => {
    const e = editor.doc.entity(id);
    return !!e && entityVisible(editor.doc, e);
  });
}

/** Encuadra la extensión del modelo dentro del viewport (escala «ajustar»). */
function fitView(api: CommandApi, width: number, height: number): { viewCenter: Vec2; scale: number } {
  const ext = modelExtents(api);
  if (isEmptyBox(ext)) return { viewCenter: { x: width / 2, y: height / 2 }, scale: 1 };
  const k = 0.95 * Math.min(width / Math.max(ext.maxX - ext.minX, 1e-9), height / Math.max(ext.maxY - ext.minY, 1e-9));
  return { viewCenter: { x: (ext.minX + ext.maxX) / 2, y: (ext.minY + ext.maxY) / 2 }, scale: k };
}

function createViewport(api: CommandApi, layoutId: Id, outline: Vec2[], polygonal: boolean): ViewportEntity {
  const box = boxFromPoints(outline);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  if (width < 1e-6 || height < 1e-6) throw new CommandError(L('El viewport necesita ancho y alto.', 'The viewport needs width and height.'));
  const view = fitView(api, width, height);
  return add<ViewportEntity>(api, 'MVIEW', {
    type: 'viewport',
    owner: layoutId,
    center: { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
    width,
    height,
    viewCenter: view.viewCenter,
    scale: view.scale,
    viewTwist: 0,
    displayLocked: false,
    on: true,
    frozenLayers: [],
    layerOverrides: {},
    clipBoundary: polygonal ? outline : undefined,
  });
}

async function pickViewports(api: CommandApi, prompt: { es: string; en: string }): Promise<ViewportEntity[]> {
  const editor = api.editor;
  const active = editor.activeViewport;
  if (active) return [active];
  const ids = await api.getSelection({ prompt, types: ['viewport'], allowLocked: true });
  return ids.map((id) => editor.doc.entity(id)).filter((e): e is ViewportEntity => e?.type === 'viewport');
}

// ------------------------------------------------------------------ comandos

const MVIEW: CommandDef = {
  name: 'MVIEW',
  aliases: ['MV', 'VPORTS', 'VENTANAS'],
  category: 'layout',
  icon: 'viewport',
  label: L('Viewport', 'Viewport'),
  description: L('Crea viewports rectangulares, poligonales o desde un objeto cerrado; ajusta, bloquea, activa o desactiva viewports.', 'Creates rectangular, polygonal or object viewports; fits, locks, turns viewports on or off.'),
  async run(api, args) {
    const layout = currentLayout(api);
    toPaper(api);
    const kws = [K('Fit', 'Ajustar', 'Fit', ['a', 'f']), K('Polygonal', 'Poligonal', 'Polygonal', ['p']), K('Object', 'Objeto', 'Object', ['o']), K('Lock', 'Bloquear', 'Lock', ['b', 'l']), K('On', 'Act', 'On', ['on']), K('Off', 'Desact', 'Off', ['off'])];
    const given = args?.[0] ? api.editor.runner.matchKeyword(args[0], kws) : null;
    const r = given ? { kind: 'keyword' as const, key: given } : await api.getPoint({ prompt: L('Precise la esquina del viewport', 'Specify corner of viewport'), keywords: kws });
    if (r.kind === 'point') {
      const b = await api.getPoint({ prompt: L('Precise la esquina opuesta', 'Specify opposite corner'), base: r.p, rubber: 'rect' });
      if (b.kind !== 'point') return;
      const box = boxFromPoints([r.p, b.p]);
      createViewport(api, layout.id, [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }], false);
      return;
    }
    if (r.kind !== 'keyword') return;
    switch (r.key) {
      case 'Fit': {
        const m = layout.page.margins;
        const { width: w, height: h } = paperExtents(layout.page);
        createViewport(api, layout.id, [{ x: m.left, y: m.bottom }, { x: w - m.right, y: m.bottom }, { x: w - m.right, y: h - m.top }, { x: m.left, y: h - m.top }], false);
        return;
      }
      case 'Polygonal': {
        const pts: Vec2[] = [];
        for (;;) {
          const p = await api.getPoint({
            prompt: pts.length ? L('Precise el siguiente punto', 'Specify next point') : L('Precise el punto inicial', 'Specify start point'),
            base: pts[pts.length - 1] ?? null,
            rubber: pts.length ? 'line' : 'none',
            keywords: pts.length >= 3 ? [CLOSE_KW, UNDO_KW] : pts.length ? [UNDO_KW] : [],
            allowNone: pts.length >= 3,
            preview: () => (pts.length > 1 ? { items: [{ k: 'path', stroke: true, cmds: pts.map((q, i) => ({ t: i ? 'L' : 'M', x: q.x, y: q.y }) as const) }] } : null),
          });
          if (p.kind === 'point') {
            if (!pts.length || dist(p.p, pts[pts.length - 1]) > 1e-9) pts.push(p.p);
          } else if (p.kind === 'keyword' && p.key === 'Undo') pts.pop();
          else break;
        }
        if (pts.length < 3) throw new CommandError(L('Un viewport poligonal necesita al menos tres vértices.', 'A polygonal viewport needs at least three vertices.'));
        createViewport(api, layout.id, pts, true);
        return;
      }
      case 'Object': {
        const e = await api.getEntity({ prompt: L('Designe el objeto cerrado para recortar el viewport (polilínea, círculo, elipse, spline)', 'Select closed object to clip viewport (polyline, circle, ellipse, spline)'), types: ['lwpolyline', 'circle', 'ellipse', 'spline'] });
        if (e.kind !== 'entity') return;
        const ent = api.editor.doc.entity(e.id) as Entity;
        let outline: Vec2[] = [];
        if (ent.type === 'lwpolyline') {
          if (!ent.closed) throw new CommandError(L('La polilínea debe estar cerrada.', 'The polyline must be closed.'));
          outline = tessellatePolyline(ent.vertices, true, 0.05);
        } else {
          const curves = kindOf(ent).curves(ent, api.editor.ctx);
          outline = curves.flatMap((c) => tessellateCurve(c, 0.05));
        }
        if (outline.length > 2 && dist(outline[0], outline[outline.length - 1]) < 1e-9) outline.pop();
        createViewport(api, layout.id, outline, true);
        return;
      }
      case 'Lock':
      case 'On':
      case 'Off': {
        const on = r.key === 'Lock' ? await api.getKeyword({ prompt: L('¿Bloquear visualización?', 'Lock display?'), keywords: [K('On', 'Sí', 'On', ['s', 'y', 'on']), K('Off', 'No', 'Off', ['n', 'off'])], defaultValue: 'On' }) : null;
        if (on && on.kind !== 'keyword') return;
        const vps = await pickViewports(api, L('Designe viewports', 'Select viewports'));
        api.apply(`MVIEW ${r.key}`, (tx) => {
          for (const vp of vps) tx.updateEntity<ViewportEntity>(vp.id, r.key === 'Lock' ? { displayLocked: on?.kind === 'keyword' && on.key === 'On' } : { on: r.key === 'On' });
        });
        return;
      }
    }
  },
};

const MSPACE: CommandDef = {
  name: 'MSPACE',
  aliases: ['MS', 'ESPACIOMODELO'],
  category: 'layout',
  readOnly: true,
  label: L('Espacio modelo en viewport', 'Model space in viewport'),
  description: L('Trabaja en el modelo a través de un viewport de la presentación (también con doble clic dentro).', 'Works in model space through a layout viewport (also by double-clicking inside).'),
  async run(api) {
    const layout = currentLayout(api);
    const editor = api.editor;
    const vps = viewportsOf(api, layout.id).filter((v) => v.on);
    if (!vps.length) throw new CommandError(L('No hay viewports activos: crea uno con MVIEW.', 'No viewports are on: create one with MVIEW.'));
    const pre = editor.selection.list.map((id) => editor.doc.entity(id)).find((e): e is ViewportEntity => e?.type === 'viewport');
    let target = pre ?? (vps.length === 1 ? vps[0] : undefined);
    if (!target) {
      const r = await api.getPoint({ prompt: L('Designe un punto dentro del viewport', 'Pick a point inside the viewport'), noSnap: true });
      if (r.kind !== 'point') return;
      target = editor.viewportAt(r.p) ?? undefined;
      if (!target) throw new CommandError(L('Ese punto no está dentro de ningún viewport.', 'That point is not inside any viewport.'));
    }
    const id = target.id;
    // se activa cuando el comando ya terminó (activar cancela los comandos en curso)
    setTimeout(() => editor.activateViewport(id), 0);
  },
};

const PSPACE: CommandDef = {
  name: 'PSPACE',
  aliases: ['PS', 'ESPACIOPAPEL'],
  category: 'layout',
  readOnly: true,
  label: L('Espacio papel', 'Paper space'),
  description: L('Sale del viewport activo y vuelve al papel de la presentación.', 'Leaves the active viewport and returns to layout paper.'),
  run(api) {
    currentLayout(api);
    toPaper(api);
  },
};

const VPSCALE: CommandDef = {
  name: 'VPSCALE',
  aliases: ['ESCALAVP', 'ZOOMXP'],
  category: 'layout',
  icon: 'scale',
  label: L('Escala de viewport', 'Viewport scale'),
  description: L('Fija la escala de viewports (1:50, 1:100, 2:1…) respetando las unidades del dibujo; «Ajustar» encuadra el modelo.', 'Sets viewport scale (1:50, 1:100, 2:1…) honoring drawing units; “Fit” frames the model.'),
  async run(api, args) {
    currentLayout(api);
    const doc = api.editor.doc;
    const vps = await pickViewports(api, L('Designe viewports', 'Select viewports'));
    if (!vps.length) return;
    const locked = vps.filter((v) => v.displayLocked);
    if (locked.length === vps.length) throw new CommandError(L('Los viewports designados tienen la visualización bloqueada (MVIEW › Bloquear › No).', 'The selected viewports are display-locked (MVIEW › Lock › Off).'));
    const scales = doc.settings.annotationScales?.length ? doc.settings.annotationScales : STANDARD_SCALES;
    let text = args?.join(' ');
    if (!text) {
      const r = await api.getString({ prompt: L(`Escala (${scales.slice(0, 6).map((s) => s.name).join(', ')}…, o Ajustar)`, `Scale (${scales.slice(0, 6).map((s) => s.name).join(', ')}…, or Fit)`), defaultValue: vps[0].scaleName ?? '1:100' });
      if (r.kind !== 'string') return;
      text = r.value;
    }
    const fit = /^(a|ajustar|f|fit)$/i.test(text.trim());
    const parsed = fit ? null : parseViewportScale(text, doc.settings.units, scales);
    if (!fit && !parsed) throw new CommandError(L(`«${text}» no es una escala válida. Usa 1:50, 2:1 o un número positivo.`, `"${text}" is not a valid scale. Use 1:50, 2:1 or a positive number.`));
    api.apply('VPSCALE', (tx) => {
      for (const vp of vps) {
        if (vp.displayLocked) continue;
        if (fit) {
          const v = fitView(api, vp.width, vp.height);
          tx.updateEntity<ViewportEntity>(vp.id, { viewCenter: v.viewCenter, scale: v.scale, scaleName: undefined });
        } else tx.updateEntity<ViewportEntity>(vp.id, { scale: parsed!.scale, scaleName: parsed!.name });
      }
    });
    if (locked.length) api.warn(L(`${locked.length} viewport(s) bloqueado(s) no se modificaron.`, `${locked.length} locked viewport(s) were not changed.`));
  },
};

const VPLOCK: CommandDef = {
  name: 'VPLOCK',
  aliases: ['BLOQUEARVP'],
  category: 'layout',
  icon: 'lock',
  label: L('Bloquear viewport', 'Lock viewport'),
  description: L('Bloquea o desbloquea el encuadre y la escala de viewports.', 'Locks or unlocks viewport framing and scale.'),
  async run(api) {
    currentLayout(api);
    const k = await api.getKeyword({ prompt: L('Visualización', 'Display'), keywords: [K('On', 'Bloquear', 'Lock', ['b', 'l', 'on']), K('Off', 'Desbloquear', 'Unlock', ['d', 'u', 'off'])], defaultValue: 'On' });
    if (k.kind !== 'keyword') return;
    const vps = await pickViewports(api, L('Designe viewports', 'Select viewports'));
    api.apply('VPLOCK', (tx) => {
      for (const vp of vps) tx.updateEntity<ViewportEntity>(vp.id, { displayLocked: k.key === 'On' });
    });
  },
};

function wildcard(pattern: string): RegExp {
  const esc = pattern.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

const VPLAYER: CommandDef = {
  name: 'VPLAYER',
  aliases: ['CAPASVP'],
  category: 'layout',
  icon: 'layers',
  label: L('Capas por viewport', 'Viewport layers'),
  description: L('Inutiliza o reutiliza capas solo en viewports concretos, o restablece sus modificaciones de propiedades.', 'Freezes or thaws layers only in specific viewports, or resets their property overrides.'),
  async run(api) {
    const layout = currentLayout(api);
    const doc = api.editor.doc;
    const op = await api.getKeyword({ prompt: L('Opción', 'Option'), keywords: [K('Freeze', 'Inutilizar', 'Freeze', ['i', 'f']), K('Thaw', 'Reutilizar', 'Thaw', ['r', 't']), K('Reset', 'Restablecer', 'Reset', ['e', 'reset'])], defaultValue: 'Freeze' });
    if (op.kind !== 'keyword') return;
    const names = await api.getString({ prompt: L('Nombres de capa (separados por coma, admite * y ?)', 'Layer names (comma-separated, * and ? allowed)'), allowSpaces: true });
    if (names.kind !== 'string' || !names.value.trim()) return;
    const patterns = names.value.split(',').map(wildcard);
    const layers = [...doc.data.layers.values()].filter((l) => patterns.some((p) => p.test(l.name)));
    if (!layers.length) throw new CommandError(L('Ninguna capa coincide con esos nombres.', 'No layer matches those names.'));
    const scope = await api.getKeyword({ prompt: L('Aplicar a', 'Apply to'), keywords: [K('Select', 'Designar', 'Select', ['d', 's']), K('All', 'Todos', 'All', ['t', 'a'])], defaultValue: api.editor.activeViewport ? 'Select' : 'All' });
    if (scope.kind !== 'keyword') return;
    const vps = scope.key === 'All' ? viewportsOf(api, layout.id) : await pickViewports(api, L('Designe viewports', 'Select viewports'));
    const ids = layers.map((l) => l.id);
    api.apply('VPLAYER', (tx) => {
      for (const vp of vps) {
        if (op.key === 'Freeze') tx.updateEntity<ViewportEntity>(vp.id, { frozenLayers: [...new Set([...vp.frozenLayers, ...ids])] });
        else if (op.key === 'Thaw') tx.updateEntity<ViewportEntity>(vp.id, { frozenLayers: vp.frozenLayers.filter((x) => !ids.includes(x)) });
        else {
          const overrides = { ...vp.layerOverrides };
          for (const id of ids) delete overrides[id];
          tx.updateEntity<ViewportEntity>(vp.id, { layerOverrides: overrides });
        }
      }
    });
    api.info(L(`${layers.length} capa(s) en ${vps.length} viewport(s).`, `${layers.length} layer(s) in ${vps.length} viewport(s).`));
  },
};

const LAYOUT: CommandDef = {
  name: 'LAYOUT',
  aliases: ['LO', 'PRESENTACION'],
  category: 'layout',
  icon: 'layout',
  label: L('Presentación', 'Layout'),
  description: L('Crea, copia, renombra, elimina o activa presentaciones.', 'Creates, copies, renames, deletes or sets layouts.'),
  async run(api) {
    const editor = api.editor;
    const doc = editor.doc;
    const layouts = () => [...doc.data.layouts.values()].sort((a, b) => a.tabOrder - b.tabOrder);
    const k = await api.getKeyword({
      prompt: L('Opción de presentación', 'Layout option'),
      keywords: [K('New', 'Nueva', 'New', ['n']), K('Copy', 'Copiar', 'Copy', ['c']), K('Rename', 'Renombrar', 'Rename', ['r']), K('Delete', 'Eliminar', 'Delete', ['e', 'd']), K('Set', 'Activar', 'Set', ['a', 's'])],
      defaultValue: 'Set',
    });
    if (k.kind !== 'keyword') return;
    const pick = async (prompt: { es: string; en: string }) => {
      const cur = doc.data.layouts.get(editor.space);
      const r = await api.getKeyword({ prompt, keywords: layouts().map((l) => K(l.id, l.name, l.name, [l.name.toLowerCase()])), defaultValue: cur?.id });
      return r.kind === 'keyword' ? doc.data.layouts.get(r.key) : undefined;
    };
    const uniqueName = async (prompt: { es: string; en: string }, def: string) => {
      const n = await api.getString({ prompt, defaultValue: def, allowSpaces: true });
      if (n.kind !== 'string' || !n.value.trim()) return null;
      const name = n.value.trim();
      if (layouts().some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new CommandError(L(`Ya existe una presentación «${name}».`, `Layout "${name}" already exists.`));
      if (name.toLowerCase() === 'modelo' || name.toLowerCase() === 'model') throw new CommandError(L('Ese nombre está reservado para el espacio modelo.', 'That name is reserved for model space.'));
      return name;
    };
    switch (k.key) {
      case 'New': {
        const name = await uniqueName(L('Nombre de la nueva presentación', 'New layout name'), `${api.t(L('Presentación', 'Layout'))}${layouts().length + 1}`);
        if (!name) return;
        const id = newId('layout');
        const last = layouts().at(-1);
        api.apply('LAYOUT NEW', (tx) => tx.add('layouts', { id, name, tabOrder: (last?.tabOrder ?? 0) + 1, page: last ? structuredClone(last.page) : defaultPageSetup() }));
        editor.setSpace(id);
        return;
      }
      case 'Copy': {
        const src = await pick(L('Presentación a copiar', 'Layout to copy'));
        if (!src) return;
        const name = await uniqueName(L('Nombre de la copia', 'Copy name'), `${src.name} (2)`);
        if (!name) return;
        const id = newId('layout');
        api.apply('LAYOUT COPY', (tx) => {
          tx.add('layouts', { ...structuredClone(src), id, name, tabOrder: src.tabOrder + 0.5 });
          for (const e of doc.entitiesOf(src.id)) {
            const { id: _i, order: _o, ...rest } = structuredClone(e);
            tx.addEntity({ ...rest, owner: id } as never);
          }
        });
        return;
      }
      case 'Rename': {
        const l = await pick(L('Presentación a renombrar', 'Layout to rename'));
        if (!l) return;
        const name = await uniqueName(L('Nuevo nombre', 'New name'), l.name);
        if (!name) return;
        api.apply('LAYOUT RENAME', (tx) => tx.update('layouts', l.id, { name }));
        return;
      }
      case 'Delete': {
        if (layouts().length <= 1) throw new CommandError(L('Debe quedar al menos una presentación.', 'At least one layout must remain.'));
        const l = await pick(L('Presentación a eliminar', 'Layout to delete'));
        if (!l) return;
        if (editor.space === l.id) editor.setSpace(MODEL_SPACE_ID);
        api.apply('LAYOUT DELETE', (tx) => {
          for (const e of doc.entitiesOf(l.id)) tx.removeEntity(e.id);
          tx.remove('layouts', l.id);
        });
        return;
      }
      case 'Set': {
        const l = await pick(L('Presentación a activar', 'Layout to set current'));
        if (l) editor.setSpace(l.id);
        return;
      }
    }
  },
};

const TITLEBLOCK_NAME = 'FM Cajetín';

/** Definición del cajetín (180 × 45 mm en papel) con atributos cuyos valores admiten campos. */
function ensureTitleBlock(api: CommandApi): Id {
  const doc = api.editor.doc;
  const existing = doc.findByName('blocks', TITLEBLOCK_NAME);
  if (existing) return existing.id;
  const id = newId('blk');
  api.apply('TITLEBLOCK', (tx) => {
    tx.add('blocks', { id, name: TITLEBLOCK_NAME, kind: 'normal', basePoint: { x: 0, y: 0 }, description: 'Cajetín FModel: proyecto, plano, escala, fecha, hoja, revisión y autor.', units: 'unitless', explodable: true, scaleUniformly: true, annotative: false, revision: 1 });
    const base = { ...entityDefaults(doc, id), layer: LAYER0_ID, color: 'ByBlock', linetype: 'ByBlock', lineweight: -2, transparency: 'ByLayer' as const };
    const line = (a: Vec2, b: Vec2, lw = -2) => tx.addEntity<LineEntity>({ ...base, lineweight: lw, type: 'line', start: a, end: b });
    const W = 180;
    const H = 45;
    tx.addEntity<LwPolylineEntity>({ ...base, lineweight: 50, type: 'lwpolyline', closed: true, vertices: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }] });
    line({ x: 0, y: 30 }, { x: W, y: 30 });
    line({ x: 0, y: 15 }, { x: W, y: 15 });
    line({ x: 110, y: 0 }, { x: 110, y: 30 });
    line({ x: 145, y: 0 }, { x: 145, y: 30 });
    const label = (text: string, x: number, y: number) =>
      tx.addEntity<TextEntity>({ ...base, type: 'text', text, position: { x, y }, height: 1.8, rotation: 0, widthFactor: 1, oblique: 0, style: TEXTSTYLE_STANDARD_ID, halign: 'left', valign: 'baseline' });
    const attr = (tag: string, prompt: string, defaultValue: string, x: number, y: number, height: number) =>
      tx.addEntity<AttdefEntity>({ ...base, type: 'attdef', tag, prompt, defaultValue, position: { x, y }, height, rotation: 0, style: TEXTSTYLE_STANDARD_ID, halign: 'left', valign: 'baseline', invisible: false, constant: false, verify: false, preset: false, lockPosition: true, multiline: false });
    label('PROYECTO', 2, 41.5);
    attr('PROYECTO', 'Proyecto', '{{title}}', 2, 33.5, 4.5);
    label('PLANO', 2, 26.5);
    attr('PLANO', 'Título del plano', '', 2, 19, 3.5);
    label('DIBUJÓ', 2, 11.5);
    attr('AUTOR', 'Autor', '{{author}}', 2, 4.5, 3);
    label('ESCALA', 112, 26.5);
    attr('ESCALA', 'Escala', '1:1', 112, 19, 3.5);
    label('FECHA', 112, 11.5);
    attr('FECHA', 'Fecha', '{{date}}', 112, 4.5, 3);
    label('HOJA', 147, 26.5);
    attr('HOJA', 'Hoja', '{{sheet}}', 147, 19, 3.5);
    label('REVISIÓN', 147, 11.5);
    attr('REVISION', 'Revisión', 'A', 147, 4.5, 3);
  });
  return id;
}

const TITLEBLOCK: CommandDef = {
  name: 'TITLEBLOCK',
  aliases: ['CAJETIN', 'MARCO'],
  category: 'layout',
  icon: 'table',
  label: L('Cajetín', 'Title block'),
  description: L('Dibuja el marco en la zona imprimible e inserta un cajetín con proyecto, plano, escala, fecha, hoja, revisión y autor (campos que se actualizan solos).', 'Draws the frame on the printable area and inserts a title block with project, sheet title, scale, date, sheet, revision and author (self-updating fields).'),
  async run(api) {
    const layout = currentLayout(api);
    toPaper(api);
    const doc = api.editor.doc;
    const plano = await api.getString({ prompt: L('Título del plano', 'Sheet title'), defaultValue: layout.name, allowSpaces: true });
    if (plano.kind !== 'string') return;
    const vp = viewportsOf(api, layout.id).find((v) => v.scaleName);
    const escala = await api.getString({ prompt: L('Escala', 'Scale'), defaultValue: vp?.scaleName ?? '1:1', allowSpaces: false });
    if (escala.kind !== 'string') return;
    const blockId = ensureTitleBlock(api);
    const { width: W, height: H } = paperExtents(layout.page);
    const m = layout.page.margins;
    api.apply('TITLEBLOCK', (tx) => {
      add<LwPolylineEntity>(api, 'TITLEBLOCK', { type: 'lwpolyline', owner: layout.id, closed: true, lineweight: 70, vertices: [{ x: m.left, y: m.bottom }, { x: W - m.right, y: m.bottom }, { x: W - m.right, y: H - m.top }, { x: m.left, y: H - m.top }] });
      insertBlock(tx, doc, blockId, layout.id, { x: W - m.right - 180, y: m.bottom }, { x: 1, y: 1 }, 0, { PLANO: plano.value, ESCALA: escala.value });
    });
    api.info(L('Cajetín insertado. Edita sus valores con ATTEDIT o en Propiedades; fecha, hoja, proyecto y autor se actualizan solos.', 'Title block inserted. Edit its values with ATTEDIT or Properties; date, sheet, project and author update automatically.'));
  },
};

export const LAYOUT_COMMANDS: CommandDef[] = [MVIEW, MSPACE, PSPACE, VPSCALE, VPLOCK, VPLAYER, LAYOUT, TITLEBLOCK];
