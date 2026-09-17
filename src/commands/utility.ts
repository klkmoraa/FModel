import { pointsSignedArea } from '../geometry/polyline';
import type { Vec2 } from '../geometry/vec';
import { dist } from '../geometry/vec';
import { newId } from '../document/ids';
import type { DrawingUnits, Entity, Id } from '../document/types';
import { captureLayerState, isolateLayers, layerUsage, mergeLayers, restoreLayerState, unisolateLayers, wildcardMatch } from '../layers/layerOps';
import { kindOf } from '../model/registry';
import { formatAngle, formatLength } from '../model/format';
import { typeLabel } from '../model/typeLabels';
import { quickSelect } from '../selection/pick';
import { K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';
import { CommandError } from './types';

const fmt = (api: CommandApi, v: number) => formatLength(v, api.editor.doc.settings.linearFormat, Math.max(4, api.editor.doc.settings.linearPrecision));

// ------------------------------------------------------------------ consulta

const DIST: CommandDef = {
  name: 'DIST',
  aliases: ['DI', 'MEASUREGEOM', 'MEDIRGEOM'],
  category: 'inquiry',
  readOnly: true,
  transparent: true,
  label: L('Distancia', 'Distance'),
  description: L('Mide distancia, incrementos X/Y y ángulo entre dos puntos (encadenable).', 'Measures distance, X/Y deltas and angle between two points (chainable).'),
  icon: 'measure',
  async run(api) {
    const a = await api.getPoint({ prompt: L('Precise el primer punto', 'Specify first point') });
    if (a.kind !== 'point') return;
    let prev = a.p;
    let total = 0;
    for (;;) {
      const b = await api.getPoint({ prompt: L('Precise el punto siguiente (Intro termina)', 'Specify next point (Enter ends)'), base: prev, rubber: 'line', allowNone: true });
      if (b.kind !== 'point') break;
      const d = dist(prev, b.p);
      total += d;
      const ang = Math.atan2(b.p.y - prev.y, b.p.x - prev.x);
      api.info(L(`Distancia = ${fmt(api, d)} · Ángulo en XY = ${formatAngle(ang < 0 ? ang + 2 * Math.PI : ang, 'degrees', 4)} · ΔX = ${fmt(api, b.p.x - prev.x)} · ΔY = ${fmt(api, b.p.y - prev.y)}${total !== d ? ` · Total = ${fmt(api, total)}` : ''}`, `Distance = ${fmt(api, d)} · Angle in XY = ${formatAngle(ang < 0 ? ang + 2 * Math.PI : ang, 'degrees', 4)} · ΔX = ${fmt(api, b.p.x - prev.x)} · ΔY = ${fmt(api, b.p.y - prev.y)}${total !== d ? ` · Total = ${fmt(api, total)}` : ''}`));
      prev = b.p;
    }
  },
};

const AREA: CommandDef = {
  name: 'AREA',
  aliases: ['AA'],
  category: 'inquiry',
  readOnly: true,
  label: L('Área', 'Area'),
  description: L('Calcula área y perímetro por puntos u objetos, con suma y resta acumuladas.', 'Computes area and perimeter by points or objects, with running add/subtract.'),
  icon: 'region',
  async run(api) {
    let total = 0;
    let mode: 'add' | 'subtract' | null = null;
    for (;;) {
      const r = await api.getPoint({
        prompt: L(`Precise el primer vértice${mode ? ` (${mode === 'add' ? 'SUMAR' : 'RESTAR'})` : ''}`, `Specify first corner point${mode ? ` (${mode.toUpperCase()})` : ''}`),
        keywords: [K('Object', 'Objeto', 'Object', ['o']), K('Add', 'Sumar', 'Add', ['s', 'a']), K('Subtract', 'Restar', 'Subtract', ['r'])],
        allowNone: true,
      });
      if (r.kind === 'none') break;
      let area = 0;
      let perimeter = 0;
      if (r.kind === 'keyword') {
        if (r.key === 'Add') {
          mode = 'add';
          continue;
        }
        if (r.key === 'Subtract') {
          mode = 'subtract';
          continue;
        }
        const o = await api.getEntity({ prompt: L('Designe objetos', 'Select objects'), allowLocked: true });
        if (o.kind !== 'entity') continue;
        const e = api.editor.doc.entity(o.id)!;
        const k = kindOf(e);
        const a = k.area?.(e, api.editor.ctx);
        if (a === null || a === undefined) {
          api.warn(L('El objeto no encierra un área (ábrelo o ciérralo antes).', 'The object does not enclose an area.'));
          continue;
        }
        area = a;
        perimeter = k.length?.(e, api.editor.ctx) ?? 0;
      } else {
        const pts: Vec2[] = [r.p];
        for (;;) {
          const n = await api.getPoint({ prompt: L('Precise el punto siguiente (Intro cierra)', 'Specify next point (Enter closes)'), base: pts[pts.length - 1], rubber: 'line', allowNone: true });
          if (n.kind !== 'point') break;
          pts.push(n.p);
        }
        if (pts.length < 3) continue;
        area = Math.abs(pointsSignedArea(pts));
        perimeter = pts.reduce((s, p, i) => s + dist(p, pts[(i + 1) % pts.length]), 0);
      }
      if (mode === 'subtract') total -= area;
      else total += area;
      api.info(L(`Área = ${fmt(api, area)}, Perímetro = ${fmt(api, perimeter)}${mode ? ` · Área total = ${fmt(api, total)}` : ''}`, `Area = ${fmt(api, area)}, Perimeter = ${fmt(api, perimeter)}${mode ? ` · Total area = ${fmt(api, total)}` : ''}`));
      if (!mode) break;
    }
  },
};

const ID: CommandDef = {
  name: 'ID',
  aliases: ['IDPUNTO'],
  category: 'inquiry',
  readOnly: true,
  transparent: true,
  label: L('Coordenadas de un punto', 'Point coordinates'),
  description: L('Muestra las coordenadas X, Y de un punto.', 'Displays the X, Y coordinates of a point.'),
  async run(api) {
    const p = await api.getPoint({ prompt: L('Precise un punto', 'Specify point') });
    if (p.kind !== 'point') return;
    api.info(L(`X = ${fmt(api, p.p.x)}   Y = ${fmt(api, p.p.y)}`, `X = ${fmt(api, p.p.x)}   Y = ${fmt(api, p.p.y)}`));
    api.lastPoint = p.p;
  },
};

const LIST: CommandDef = {
  name: 'LIST',
  aliases: ['LI', 'LS', 'LISTA'],
  category: 'inquiry',
  readOnly: true,
  label: L('Listar objetos', 'List objects'),
  description: L('Informa tipo, capa, espacio, ID, longitud, área y extensión de los objetos.', 'Reports type, layer, space, ID, length, area and extents of objects.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe objetos', 'Select objects'), allowLocked: true });
    const doc = api.editor.doc;
    for (const id of ids.slice(0, 50)) {
      const e = doc.entity(id)!;
      const k = kindOf(e);
      const b = k.bbox(e, api.editor.ctx);
      const len = k.length?.(e, api.editor.ctx);
      const area = k.area?.(e, api.editor.ctx);
      const layer = doc.data.layers.get(e.layer)?.name;
      api.info(
        L(
          `${typeLabel(e.type, 'es')} · capa «${layer}» · ID ${e.id}${len ? ` · longitud ${fmt(api, len)}` : ''}${area ? ` · área ${fmt(api, area)}` : ''}${Number.isFinite(b.minX) ? ` · extensión (${fmt(api, b.minX)}, ${fmt(api, b.minY)}) – (${fmt(api, b.maxX)}, ${fmt(api, b.maxY)})` : ''}`,
          `${typeLabel(e.type, 'en')} · layer "${layer}" · ID ${e.id}${len ? ` · length ${fmt(api, len)}` : ''}${area ? ` · area ${fmt(api, area)}` : ''}${Number.isFinite(b.minX) ? ` · extents (${fmt(api, b.minX)}, ${fmt(api, b.minY)}) – (${fmt(api, b.maxX)}, ${fmt(api, b.maxY)})` : ''}`,
        ),
      );
    }
    if (ids.length > 50) api.info(L(`… y ${ids.length - 50} más.`, `… and ${ids.length - 50} more.`));
  },
};

// ------------------------------------------------------------------ capas

async function pickLayers(api: CommandApi, prompt: { es: string; en: string }): Promise<Id[]> {
  const ids = await api.getSelection({ prompt, allowLocked: true });
  return [...new Set(ids.map((id) => api.editor.doc.entity(id)!.layer))];
}

const LAYER: CommandDef = { name: 'LAYER', aliases: ['LA', 'CAPA', 'LAYERPALETTE'], category: 'layer', readOnly: true, ui: 'panel:layers', label: L('Administrador de capas', 'Layer manager'), description: L('Abre el panel de capas: crear, renombrar, estados, filtros, congelar en viewport.', 'Opens the layers panel: create, rename, states, filters, viewport freeze.'), icon: 'layers', run() {} };
const PROPERTIES: CommandDef = { name: 'PROPERTIES', aliases: ['PR', 'CH', 'MO', 'PROPIEDADES', 'DDMODIFY'], category: 'utility', readOnly: true, ui: 'panel:properties', label: L('Propiedades', 'Properties'), description: L('Abre la paleta de propiedades contextual.', 'Opens the contextual properties palette.'), icon: 'properties', run() {} };
const TOOLPALETTES: CommandDef = { name: 'TOOLPALETTES', aliases: ['TP', 'PALETAS'], category: 'utility', readOnly: true, ui: 'panel:palettes', label: L('Paletas de herramientas', 'Tool palettes'), description: L('Abre las paletas de bloques, sombreados, cotas, textos y presets.', 'Opens palettes of blocks, hatches, dimensions, text and presets.'), icon: 'palettes', run() {} };
const BLOCKSPALETTE: CommandDef = { name: 'BLOCKSPALETTE', aliases: ['BLOQUES'], category: 'block', readOnly: true, ui: 'panel:blocks', label: L('Paleta de bloques', 'Blocks palette'), description: L('Abre la biblioteca de bloques del dibujo, favoritos y compartidos.', 'Opens the drawing, favorite and shared block library.'), icon: 'block', run() {} };

const LAYISO: CommandDef = {
  name: 'LAYISO',
  aliases: ['AISLARCAPA'],
  category: 'layer',
  label: L('Aislar capas', 'Isolate layers'),
  description: L('Apaga (o bloquea) todas las capas excepto las de los objetos designados.', 'Turns off (or locks) all layers except those of selected objects.'),
  icon: 'isolate',
  async run(api) {
    const layers = await pickLayers(api, L('Designe objetos en las capas a aislar', 'Select objects on layers to isolate'));
    if (!layers.length) return;
    const mode = await api.getKeyword({ prompt: L('Resto de capas', 'Other layers'), keywords: [K('Off', 'Desactivar', 'Off', ['d', 'o']), K('Lock', 'Bloquear', 'Lock', ['b', 'l'])], defaultValue: 'Off' });
    api.apply('LAYISO', (tx) => isolateLayers(tx, api.editor.doc, layers, mode.kind === 'keyword' && mode.key === 'Lock' ? 'lock' : 'off'));
    api.info(L(`${layers.length} capa(s) aislada(s). LAYUNISO restaura.`, `${layers.length} layer(s) isolated. LAYUNISO restores.`));
  },
};

const LAYUNISO: CommandDef = {
  name: 'LAYUNISO',
  aliases: ['RESTAURARCAPAS'],
  category: 'layer',
  label: L('Restaurar capas aisladas', 'Unisolate layers'),
  description: L('Restaura el estado de capas anterior a LAYISO.', 'Restores the layer state before LAYISO.'),
  run(api) {
    const ok = api.apply('LAYUNISO', (tx) => unisolateLayers(tx, api.editor.doc));
    if (!ok) api.warn(L('No hay un aislamiento de capas activo.', 'There is no active layer isolation.'));
  },
};

function layerToggle(name: string, aliases: string[], label: [string, string], patch: Record<string, boolean>, all = false): CommandDef {
  return {
    name,
    aliases,
    category: 'layer',
    label: L(label[0], label[1]),
    description: L(`${label[0]} (por objeto designado${all ? ' o todas' : ''}).`, `${label[1]} (by picked object${all ? ' or all' : ''}).`),
    async run(api) {
      const doc = api.editor.doc;
      if (all) {
        api.apply(name, (tx) => {
          for (const l of doc.data.layers.values()) tx.update('layers', l.id, patch);
        });
        return;
      }
      const layers = await pickLayers(api, L('Designe objetos', 'Select objects'));
      api.apply(name, (tx) => {
        for (const id of layers) {
          if (patch.frozen && id === doc.settings.currentLayer) {
            api.warn(L('La capa actual no se puede inutilizar.', 'The current layer cannot be frozen.'));
            continue;
          }
          tx.update('layers', id, patch);
        }
      });
    },
  };
}

const LAYMCUR: CommandDef = {
  name: 'LAYMCUR',
  aliases: ['CAPAACTUAL'],
  category: 'layer',
  label: L('Capa del objeto como actual', 'Make object layer current'),
  description: L('Hace actual la capa del objeto designado.', 'Makes the layer of the selected object current.'),
  async run(api) {
    const r = await api.getEntity({ prompt: L('Designe un objeto', 'Select object'), allowLocked: true });
    if (r.kind !== 'entity') return;
    const layer = api.editor.doc.entity(r.id)!.layer;
    api.apply('LAYMCUR', (tx) => tx.setSettings({ currentLayer: layer }));
    api.info(L(`Capa actual: ${api.editor.doc.data.layers.get(layer)?.name}`, `Current layer: ${api.editor.doc.data.layers.get(layer)?.name}`));
  },
};

const LAYMRG: CommandDef = {
  name: 'LAYMRG',
  aliases: ['FUSIONARCAPAS'],
  category: 'layer',
  label: L('Fusionar capas', 'Merge layers'),
  description: L('Mueve los objetos de las capas designadas a una capa destino y elimina las de origen.', 'Moves objects of selected layers to a target layer and deletes the sources.'),
  async run(api) {
    const sources = await pickLayers(api, L('Designe objetos en las capas a fusionar', 'Select objects on layers to merge'));
    const t = await api.getEntity({ prompt: L('Designe un objeto en la capa destino', 'Select object on target layer'), allowLocked: true });
    if (t.kind !== 'entity') return;
    const target = api.editor.doc.entity(t.id)!.layer;
    const n = api.apply('LAYMRG', (tx) => mergeLayers(tx, api.editor.doc, sources.filter((s) => s !== target), target));
    api.info(L(`${n} objeto(s) movido(s) a «${api.editor.doc.data.layers.get(target)?.name}».`, `${n} object(s) moved to "${api.editor.doc.data.layers.get(target)?.name}".`));
  },
};

const SETBYLAYER: CommandDef = {
  name: 'SETBYLAYER',
  aliases: ['PORCAPA'],
  category: 'layer',
  label: L('Propiedades PorCapa', 'Set to ByLayer'),
  description: L('Cambia color, tipo de línea, grosor y transparencia de los objetos a PorCapa.', 'Sets color, linetype, lineweight and transparency of objects to ByLayer.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe objetos', 'Select objects') });
    api.apply('SETBYLAYER', (tx) => ids.forEach((id) => tx.updateEntity(id, { color: 'ByLayer', linetype: 'ByLayer', lineweight: -1, transparency: 'ByLayer' })));
  },
};

const QSELECT: CommandDef = {
  name: 'QSELECT',
  aliases: ['SELECCIONRAPIDA'],
  category: 'utility',
  readOnly: true,
  label: L('Selección rápida', 'Quick select'),
  description: L('Selecciona por tipo de objeto y capa en el espacio actual (con aplicar a selección previa).', 'Selects by object type and layer in the current space (optionally within previous selection).'),
  icon: 'qselect',
  async run(api) {
    const editor = api.editor;
    const doc = editor.doc;
    const types = [...new Set(doc.entitiesOf(editor.inputOwner).map((e) => e.type))];
    const t = await api.getString({ prompt: L(`Tipo (${types.join(', ')}) o * para todos`, `Type (${types.join(', ')}) or * for all`), defaultValue: '*' });
    if (t.kind !== 'string') return;
    const layers = [...doc.data.layers.values()].map((l) => l.name);
    const l = await api.getString({ prompt: L('Capa (nombre, * comodín)', 'Layer (name, * wildcard)'), defaultValue: '*', allowSpaces: true });
    if (l.kind !== 'string') return;
    const layerIds = [...doc.data.layers.values()].filter((x) => wildcardMatch(l.value, x.name)).map((x) => x.id);
    const ids = quickSelect(editor.ctx, editor.inputOwner, { types: t.value === '*' ? undefined : (t.value.split(',').map((s) => s.trim()) as Entity['type'][]), layers: l.value === '*' ? undefined : layerIds }, editor.visibility()).filter((id) => editor.isSelectable(id));
    editor.selection.set(ids);
    api.info(L(`${ids.length} objeto(s) seleccionados (capas disponibles: ${layers.slice(0, 8).join(', ')}).`, `${ids.length} object(s) selected (layers: ${layers.slice(0, 8).join(', ')}).`));
  },
};

const SELECTSIMILAR: CommandDef = {
  name: 'SELECTSIMILAR',
  aliases: ['SELSIMILAR'],
  category: 'utility',
  readOnly: true,
  label: L('Seleccionar similares', 'Select similar'),
  description: L('Selecciona todos los objetos del mismo tipo y capa (y bloque o estilo) que los designados.', 'Selects all objects of the same type and layer (and block or style) as the selected ones.'),
  async run(api) {
    const editor = api.editor;
    const doc = editor.doc;
    const ids = await api.getSelection({ prompt: L('Designe objetos de referencia', 'Select reference objects'), allowLocked: true });
    const refs = ids.map((id) => doc.entity(id)!);
    const key = (e: Entity) => `${e.type}|${e.layer}|${(e as { blockId?: string }).blockId ?? ''}|${(e as { style?: string }).style ?? ''}`;
    const keys = new Set(refs.map(key));
    const out = doc.entitiesOf(editor.inputOwner).filter((e) => keys.has(key(e)) && editor.isSelectable(e.id)).map((e) => e.id);
    editor.selection.set(out);
    api.info(L(`${out.length} objeto(s) similares seleccionados.`, `${out.length} similar object(s) selected.`));
  },
};

const LTSCALE: CommandDef = {
  name: 'LTSCALE',
  aliases: ['LTS', 'ESCALATL'],
  category: 'utility',
  label: L('Escala global de tipo de línea', 'Global linetype scale'),
  description: L('Factor global que multiplica los patrones de tipo de línea.', 'Global factor multiplying linetype patterns.'),
  async run(api) {
    const v = await api.getNumber({ prompt: L('Nuevo factor de escala de tipo de línea', 'New linetype scale factor'), defaultValue: api.editor.doc.settings.ltscale, min: 1e-9 });
    if (v.kind === 'value') api.apply('LTSCALE', (tx) => tx.setSettings({ ltscale: v.value }));
  },
};

const PTYPE: CommandDef = {
  name: 'PTYPE',
  aliases: ['DDPTYPE', 'ESTILOPUNTO'],
  category: 'utility',
  label: L('Estilo de punto', 'Point style'),
  description: L('Define la representación de los objetos punto (PDMODE/PDSIZE).', 'Defines how point objects are displayed (PDMODE/PDSIZE).'),
  async run(api) {
    const s = api.editor.doc.settings.pointDisplay;
    const m = await api.getKeyword({ prompt: L('Modo de punto', 'Point mode'), keywords: [K('0', 'Punto', 'Dot', ['p']), K('2', 'Cruz', 'Plus', ['c']), K('3', 'Aspa', 'X', ['x']), K('34', 'Círculo con cruz', 'Circle plus', ['o']), K('35', 'Círculo con aspa', 'Circle X', ['cx']), K('66', 'Cuadrado con cruz', 'Square plus', ['s'])], defaultValue: String(s.mode) });
    const size = await api.getNumber({ prompt: L('Tamaño (unidades absolutas; 0 = 2% de la pantalla)', 'Size (absolute units; 0 = 2% of screen)'), defaultValue: s.size, min: 0 });
    api.apply('PTYPE', (tx) => tx.setSettings({ pointDisplay: { mode: m.kind === 'keyword' ? Number(m.key) : s.mode, size: size.kind === 'value' ? size.value : s.size } }));
  },
};

const UNITS: CommandDef = {
  name: 'UNITS',
  aliases: ['UN', 'UNIDADES'],
  category: 'utility',
  label: L('Unidades del dibujo', 'Drawing units'),
  description: L('Define unidades de inserción, formato y precisión lineal y angular.', 'Sets insertion units, linear and angular format and precision.'),
  async run(api) {
    const s = api.editor.doc.settings;
    const u = await api.getKeyword({ prompt: L('Unidades de inserción', 'Insertion units'), keywords: ['unitless', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'].map((x) => K(x, x, x)), defaultValue: s.units });
    const f = await api.getKeyword({ prompt: L('Formato lineal', 'Linear format'), keywords: [K('decimal', 'Decimal', 'Decimal', ['d']), K('architectural', 'Arquitectónico', 'Architectural', ['a']), K('engineering', 'Ingeniería', 'Engineering', ['i', 'e']), K('fractional', 'Fraccionario', 'Fractional', ['f']), K('scientific', 'Científico', 'Scientific', ['c', 's'])], defaultValue: s.linearFormat });
    const p = await api.getNumber({ prompt: L('Precisión lineal (0–8)', 'Linear precision (0–8)'), integer: true, min: 0, max: 8, defaultValue: s.linearPrecision });
    const af = await api.getKeyword({ prompt: L('Formato angular', 'Angle format'), keywords: [K('degrees', 'Grados decimales', 'Decimal degrees', ['g', 'd']), K('dms', 'GMS', 'DMS', ['dms']), K('grads', 'Centesimales', 'Grads', ['c']), K('radians', 'Radianes', 'Radians', ['r']), K('surveyor', 'Topográfico', 'Surveyor', ['t', 's'])], defaultValue: s.angleFormat });
    api.apply('UNITS', (tx) =>
      tx.setSettings({
        units: (u.kind === 'keyword' ? u.key : s.units) as DrawingUnits,
        insUnits: (u.kind === 'keyword' ? u.key : s.insUnits) as DrawingUnits,
        linearFormat: f.kind === 'keyword' ? (f.key as typeof s.linearFormat) : s.linearFormat,
        linearPrecision: p.kind === 'value' ? p.value : s.linearPrecision,
        angleFormat: af.kind === 'keyword' ? (af.key as typeof s.angleFormat) : s.angleFormat,
      }),
    );
  },
};

const RENAME: CommandDef = {
  name: 'RENAME',
  aliases: ['REN', 'RENOMBRAR'],
  category: 'manage',
  label: L('Renombrar', 'Rename'),
  description: L('Renombra capas, bloques, estilos, vistas, grupos y presentaciones.', 'Renames layers, blocks, styles, views, groups and layouts.'),
  async run(api) {
    const k = await api.getKeyword({ prompt: L('Tipo de objeto con nombre', 'Named object type'), keywords: [K('layers', 'Capa', 'Layer', ['c', 'la']), K('blocks', 'Bloque', 'Block', ['b']), K('textStyles', 'Estilo de texto', 'Text style', ['e', 's']), K('dimStyles', 'Estilo de cota', 'Dim style', ['d']), K('views', 'Vista', 'View', ['v']), K('groups', 'Grupo', 'Group', ['g']), K('layouts', 'Presentación', 'Layout', ['p'])] });
    if (k.kind !== 'keyword') return;
    const coll = k.key as 'layers' | 'blocks' | 'textStyles' | 'dimStyles' | 'views' | 'groups' | 'layouts';
    const oldName = await api.getString({ prompt: L('Nombre actual', 'Old name'), allowSpaces: true });
    if (oldName.kind !== 'string') return;
    const rec = api.editor.doc.findByName(coll, oldName.value);
    if (!rec) throw new CommandError(L(`No existe «${oldName.value}».`, `"${oldName.value}" not found.`));
    const newName = await api.getString({ prompt: L('Nombre nuevo', 'New name'), allowSpaces: true });
    if (newName.kind !== 'string' || !newName.value.trim()) return;
    if (/[<>/\\":;?*|=`]/.test(newName.value)) throw new CommandError(L('El nombre contiene caracteres no válidos.', 'The name contains invalid characters.'));
    if (api.editor.doc.findByName(coll, newName.value)) throw new CommandError(L(`Ya existe «${newName.value}».`, `"${newName.value}" already exists.`));
    if (coll === 'layers' && (rec as { name: string }).name === '0') throw new CommandError(L('La capa 0 no se puede renombrar.', 'Layer 0 cannot be renamed.'));
    api.apply('RENAME', (tx) => tx.update(coll, (rec as { id: Id }).id, { name: newName.value.trim() } as never));
  },
};

function setCurrent(name: string, aliases: string[], label: [string, string], key: 'currentColor' | 'currentLinetype' | 'currentLineweight'): CommandDef {
  return {
    name,
    aliases,
    category: 'utility',
    label: L(label[0], label[1]),
    description: L(`Define ${label[0].toLowerCase()} para objetos nuevos.`, `Sets ${label[1].toLowerCase()} for new objects.`),
    async run(api) {
      const s = api.editor.doc.settings;
      if (key === 'currentLineweight') {
        const v = await api.getString({ prompt: L('Grosor en mm, PorCapa, PorBloque o Defecto', 'Lineweight in mm, ByLayer, ByBlock or Default'), defaultValue: s.currentLineweight === -1 ? 'ByLayer' : String(s.currentLineweight / 100) });
        if (v.kind !== 'string') return;
        const t = v.value.toLowerCase();
        const lw = t.startsWith('porc') || t === 'bylayer' ? -1 : t.startsWith('porb') || t === 'byblock' ? -2 : t.startsWith('def') ? -3 : Math.round(parseFloat(t) * 100);
        if (!Number.isFinite(lw)) throw new CommandError(L('Valor de grosor no válido.', 'Invalid lineweight value.'));
        api.apply(name, (tx) => tx.setSettings({ currentLineweight: lw }));
        return;
      }
      if (key === 'currentLinetype') {
        const v = await api.getString({ prompt: L('Nombre del tipo de línea (PorCapa, PorBloque)', 'Linetype name (ByLayer, ByBlock)'), defaultValue: 'ByLayer' });
        if (v.kind !== 'string') return;
        const t = v.value.toLowerCase();
        const lt = t.startsWith('porc') || t === 'bylayer' ? 'ByLayer' : t.startsWith('porb') || t === 'byblock' ? 'ByBlock' : api.editor.doc.findByName('linetypes', v.value)?.id;
        if (!lt) throw new CommandError(L(`No existe el tipo de línea «${v.value}».`, `Linetype "${v.value}" not found.`));
        api.apply(name, (tx) => tx.setSettings({ currentLinetype: lt }));
        return;
      }
      const v = await api.getString({ prompt: L('Color: 1–255, #rrggbb, PorCapa o PorBloque', 'Color: 1–255, #rrggbb, ByLayer or ByBlock'), defaultValue: s.currentColor });
      if (v.kind !== 'string') return;
      const t = v.value.trim().toLowerCase();
      const c = t.startsWith('porc') || t === 'bylayer' ? 'ByLayer' : t.startsWith('porb') || t === 'byblock' ? 'ByBlock' : /^#[0-9a-f]{6}$/.test(t) ? t : /^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= 255 ? `aci:${Number(t)}` : null;
      if (!c) throw new CommandError(L('Color no válido.', 'Invalid color.'));
      api.apply(name, (tx) => tx.setSettings({ currentColor: c }));
    },
  };
}

const CHPROP: CommandDef = {
  name: 'CHPROP',
  aliases: ['CAMBIARPROP', '-PROPERTIES'],
  category: 'utility',
  label: L('Cambiar propiedades', 'Change properties'),
  description: L('Cambia capa, color, tipo, escala y grosor de línea por línea de comandos.', 'Changes layer, color, linetype, scale and lineweight from the command line.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe objetos', 'Select objects') });
    const doc = api.editor.doc;
    for (;;) {
      const k = await api.getKeyword({ prompt: L('Propiedad a cambiar', 'Property to change'), keywords: [K('Color', 'Color', 'Color', ['c']), K('Layer', 'Capa', 'Layer', ['ca', 'la']), K('Ltype', 'Tipolín', 'Ltype', ['t', 'lt']), K('Ltscale', 'Escalatl', 'Ltscale', ['e', 's']), K('Lweight', 'Grosor', 'Lweight', ['g', 'lw'])], allowNone: true });
      if (k.kind !== 'keyword') return;
      const v = await api.getString({ prompt: L('Nuevo valor', 'New value'), allowSpaces: true });
      if (v.kind !== 'string') continue;
      let patch: Partial<Entity> | null = null;
      if (k.key === 'Layer') {
        const l = doc.findByName('layers', v.value);
        if (!l) {
          api.warn(L(`No existe la capa «${v.value}».`, `Layer "${v.value}" not found.`));
          continue;
        }
        patch = { layer: l.id };
      } else if (k.key === 'Color') patch = { color: /^\d+$/.test(v.value) ? `aci:${v.value}` : v.value.toLowerCase().startsWith('porc') || v.value.toLowerCase() === 'bylayer' ? 'ByLayer' : v.value };
      else if (k.key === 'Ltype') {
        const lt = doc.findByName('linetypes', v.value);
        patch = { linetype: lt ? lt.id : 'ByLayer' };
      } else if (k.key === 'Ltscale') patch = { linetypeScale: Math.max(1e-9, parseFloat(v.value) || 1) };
      else patch = { lineweight: Math.round((parseFloat(v.value) || 0) * 100) };
      api.apply('CHPROP', (tx) => ids.forEach((id) => tx.updateEntity(id, patch as never)));
    }
  },
};

const TEXTSCR: CommandDef = {
  name: 'TEXTSCR',
  aliases: ['HISTORIALCOMANDOS'],
  category: 'utility',
  readOnly: true,
  transparent: true,
  label: L('Historial de comandos', 'Command history'),
  description: L('Muestra u oculta el historial de la línea de comandos (F2).', 'Shows or hides the command line history (F2).'),
  run() {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fmodel:cmdlog'));
  },
};

const HELP: CommandDef = { name: 'HELP', aliases: ['AYUDA', '?'], category: 'utility', readOnly: true, transparent: true, ui: 'help', label: L('Ayuda', 'Help'), description: L('Ayuda contextual, lista de comandos y estado de funciones.', 'Contextual help, command list and feature status.'), run() {} };
const OPTIONS: CommandDef = { name: 'OPTIONS', aliases: ['OP', 'OPCIONES', 'CONFIG'], category: 'utility', readOnly: true, ui: 'options', label: L('Opciones', 'Options'), description: L('Preferencias, alias, atajos, autoguardado y paneles.', 'Preferences, aliases, shortcuts, autosave and panels.'), icon: 'properties', run() {} };
const ALIASEDIT: CommandDef = { name: 'ALIASEDIT', aliases: ['ALIAS'], category: 'utility', readOnly: true, ui: 'options', label: L('Editar alias', 'Edit aliases'), description: L('Personaliza los alias de comandos.', 'Customizes command aliases.'), run() {} };
const SHORTCUTS: CommandDef = { name: 'SHORTCUTS', aliases: ['ATAJOS', 'CUI'], category: 'utility', readOnly: true, ui: 'options', label: L('Atajos de teclado', 'Keyboard shortcuts'), description: L('Personaliza los atajos de teclado.', 'Customizes keyboard shortcuts.'), run() {} };
const DRAFTINGSETTINGS: CommandDef = { name: 'DSETTINGS', aliases: ['DS', 'PARAMDIB', 'SE'], category: 'utility', readOnly: true, transparent: true, ui: 'drafting-settings', label: L('Parámetros de dibujo', 'Drafting settings'), description: L('Referencias a objetos, rastreo polar, rejilla y entrada dinámica.', 'Object snaps, polar tracking, grid and dynamic input.'), run() {} };
const STYLESMANAGER: CommandDef = { name: 'STYLE', aliases: ['ST', 'ESTILO', 'DIMSTYLE', 'D', 'MLEADERSTYLE', 'MLS', 'TABLESTYLE', 'TS', 'MLSTYLE', 'ESTILOS'], category: 'annotate', readOnly: true, ui: 'styles', label: L('Administrador de estilos', 'Styles manager'), description: L('Estilos de texto, cota, directriz múltiple, tabla y multilínea.', 'Text, dimension, multileader, table and multiline styles.'), icon: 'text', run() {} };
const SCALELISTEDIT: CommandDef = { name: 'SCALELISTEDIT', aliases: ['ESCALAS'], category: 'annotate', readOnly: true, ui: 'styles', label: L('Lista de escalas', 'Scale list'), description: L('Edita las escalas de anotación y viewport disponibles.', 'Edits available annotation and viewport scales.'), icon: 'scale', run() {} };

const CLEANSCREEN: CommandDef = {
  name: 'CLEANSCREENON',
  aliases: ['CLEANSCREENOFF', 'PANTALLALIMPIA'],
  category: 'view',
  readOnly: true,
  transparent: true,
  ui: 'clean-screen',
  label: L('Pantalla limpia', 'Clean screen'),
  description: L('Oculta cinta y barra superior para maximizar el lienzo (Ctrl+0).', 'Hides the ribbon and top bar to maximize the canvas (Ctrl+0).'),
  run() {},
};

const NAMEDLAYERSTATE: CommandDef = {
  name: 'LAYERSTATE',
  aliases: ['LAS', 'ESTADOSCAPA'],
  category: 'layer',
  label: L('Estados de capa', 'Layer states'),
  description: L('Guarda o restaura un estado de capas por nombre.', 'Saves or restores a named layer state.'),
  async run(api) {
    const doc = api.editor.doc;
    const k = await api.getKeyword({ prompt: L('Opción', 'Option'), keywords: [K('Save', 'Guardar', 'Save', ['g', 's']), K('Restore', 'Restituir', 'Restore', ['r'])] });
    if (k.kind !== 'keyword') return;
    const n = await api.getString({ prompt: L('Nombre del estado', 'State name'), allowSpaces: true });
    if (n.kind !== 'string' || !n.value) return;
    if (k.key === 'Save') {
      const existing = doc.findByName('layerStates', n.value);
      api.apply('LAYERSTATE', (tx) => tx.put('layerStates', { ...captureLayerState(doc, n.value), id: existing?.id ?? newId('lstate') }));
    } else {
      const s = doc.findByName('layerStates', n.value);
      if (!s) throw new CommandError(L(`No existe el estado «${n.value}».`, `State "${n.value}" not found.`));
      api.apply('LAYERSTATE', (tx) => restoreLayerState(tx, doc, s));
    }
  },
};

const COUNT: CommandDef = {
  name: 'COUNT',
  aliases: ['CONTAR'],
  category: 'inquiry',
  readOnly: true,
  label: L('Contar objetos', 'Count objects'),
  description: L('Cuenta objetos por tipo, capa y bloque en el espacio actual.', 'Counts objects by type, layer and block in the current space.'),
  run(api) {
    const doc = api.editor.doc;
    const list = doc.entitiesOf(api.editor.inputOwner);
    const byType = new Map<string, number>();
    const byBlock = new Map<string, number>();
    for (const e of list) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      if (e.type === 'insert') {
        const n = doc.data.blocks.get(e.blockId)?.name ?? '?';
        byBlock.set(n, (byBlock.get(n) ?? 0) + 1);
      }
    }
    const usage = layerUsage(doc);
    api.info(L(`Total ${list.length}: ${[...byType].map(([t, n]) => `${typeLabel(t, 'es')} ${n}`).join(' · ')}`, `Total ${list.length}: ${[...byType].map(([t, n]) => `${typeLabel(t, 'en')} ${n}`).join(' · ')}`));
    if (byBlock.size) api.info(L(`Bloques: ${[...byBlock].map(([b, n]) => `${b} ×${n}`).join(' · ')}`, `Blocks: ${[...byBlock].map(([b, n]) => `${b} ×${n}`).join(' · ')}`));
    api.info(L(`Capas con objetos: ${[...usage.values()].filter(Boolean).length}`, `Layers with objects: ${[...usage.values()].filter(Boolean).length}`));
  },
};

export const UTILITY_COMMANDS: CommandDef[] = [
  TEXTSCR,
  DIST,
  AREA,
  ID,
  LIST,
  COUNT,
  LAYER,
  PROPERTIES,
  TOOLPALETTES,
  BLOCKSPALETTE,
  LAYISO,
  LAYUNISO,
  layerToggle('LAYOFF', ['DESACTIVARCAPA'], ['Desactivar capa', 'Layer off'], { on: false }),
  layerToggle('LAYON', ['ACTIVARCAPAS'], ['Activar todas las capas', 'Turn all layers on'], { on: true }, true),
  layerToggle('LAYFRZ', ['INUTILIZARCAPA'], ['Inutilizar capa', 'Freeze layer'], { frozen: true }),
  layerToggle('LAYTHW', ['REUTILIZARCAPAS'], ['Reutilizar todas las capas', 'Thaw all layers'], { frozen: false }, true),
  layerToggle('LAYLCK', ['BLOQUEARCAPA'], ['Bloquear capa', 'Lock layer'], { locked: true }),
  layerToggle('LAYULK', ['DESBLOQUEARCAPA'], ['Desbloquear capa', 'Unlock layer'], { locked: false }),
  LAYMCUR,
  LAYMRG,
  NAMEDLAYERSTATE,
  SETBYLAYER,
  QSELECT,
  SELECTSIMILAR,
  LTSCALE,
  PTYPE,
  UNITS,
  RENAME,
  setCurrent('COLOR', ['COL', 'COLOUR'], ['Color actual', 'Current color'], 'currentColor'),
  setCurrent('LINETYPE', ['LT', 'TIPOLIN'], ['Tipo de línea actual', 'Current linetype'], 'currentLinetype'),
  setCurrent('LWEIGHT', ['LW', 'GROSOR'], ['Grosor actual', 'Current lineweight'], 'currentLineweight'),
  CHPROP,
  HELP,
  OPTIONS,
  ALIASEDIT,
  SHORTCUTS,
  DRAFTINGSETTINGS,
  STYLESMANAGER,
  SCALELISTEDIT,
  CLEANSCREEN,
];
