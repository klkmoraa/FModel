import { boxFromCorners } from '../geometry/bbox';
import { newId } from '../document/ids';
import type { NamedView } from '../document/types';
import type { SnapType } from '../model/registry';
import { K, L } from './helpers';
import type { CommandApi, CommandDef } from './types';

const viewStack: { space: string; center: { x: number; y: number }; scale: number }[] = [];

function pushView(api: CommandApi) {
  const v = api.editor.view;
  viewStack.push({ space: api.editor.space, center: { ...v.center }, scale: v.scale });
  if (viewStack.length > 50) viewStack.shift();
}

const ZOOM: CommandDef = {
  name: 'ZOOM',
  aliases: ['Z'],
  category: 'view',
  transparent: true,
  readOnly: true,
  label: L('Zoom', 'Zoom'),
  description: L('Amplía o reduce la vista: extensión, ventana, objeto, previo, escala, centro, todo.', 'Zooms the view: extents, window, object, previous, scale, center, all.'),
  icon: 'zoom',
  async run(api, args) {
    const editor = api.editor;
    const kws = [K('All', 'Todo', 'All', ['t', 'a']), K('Center', 'Centro', 'Center', ['c']), K('Extents', 'Extensión', 'Extents', ['e']), K('Previous', 'Previo', 'Previous', ['p']), K('Scale', 'Escala', 'Scale', ['s']), K('Window', 'Ventana', 'Window', ['v', 'w']), K('Object', 'Objeto', 'Object', ['o']), K('In', 'Acercar', 'In', ['i']), K('Out', 'Alejar', 'Out', ['ou'])];
    let key = args?.[0] ? api.editor.runner.matchKeyword(args[0], kws) : null;
    let firstCorner: { x: number; y: number } | null = null;
    if (!key) {
      const r = await api.getPoint({ prompt: L('Precise la esquina de la ventana o una opción', 'Specify corner of window or an option'), keywords: kws, noSnap: true, allowNone: true });
      if (r.kind === 'none') return;
      if (r.kind === 'keyword') key = r.key;
      else {
        key = 'Window';
        firstCorner = r.p;
      }
    }
    switch (key) {
      case 'All':
      case 'Extents':
        pushView(api);
        editor.zoomExtents();
        return;
      case 'Previous': {
        const prev = viewStack.pop();
        if (prev && prev.space === editor.space) {
          editor.view.center = prev.center;
          editor.view.scale = prev.scale;
          editor.emit('view');
        }
        return;
      }
      case 'In':
        pushView(api);
        editor.zoomBy(2);
        return;
      case 'Out':
        pushView(api);
        editor.zoomBy(0.5);
        return;
      case 'Scale': {
        const r = await api.getString({ prompt: L('Factor de escala (nX relativo, nXP respecto al papel)', 'Scale factor (nX relative, nXP paper)') });
        if (r.kind !== 'string') return;
        const m = /^([\d.]+)\s*(x|xp)?$/i.exec(r.value.trim());
        if (!m) return;
        pushView(api);
        const f = parseFloat(m[1]);
        if (m[2]?.toLowerCase() === 'xp' && editor.activeViewport) {
          editor.doc.transact('ZOOM XP', (tx) => tx.updateEntity(editor.activeViewportId!, { scale: f }));
        } else if (m[2]) editor.zoomBy(f);
        else editor.zoomBy(f);
        return;
      }
      case 'Center': {
        const c = await api.getPoint({ prompt: L('Precise el punto central', 'Specify center point'), noSnap: false });
        if (c.kind !== 'point') return;
        const h = await api.getDistance({ prompt: L('Altura de la vista', 'Magnification or height'), defaultValue: editor.view.viewHeight });
        pushView(api);
        editor.view.center = c.p;
        if (h.kind === 'value') editor.view.setViewHeight(h.value);
        editor.emit('view');
        return;
      }
      case 'Object': {
        const ids = await api.getSelection({ prompt: L('Designe objetos', 'Select objects'), allowLocked: true });
        pushView(api);
        editor.zoomSelection(ids);
        return;
      }
      case 'Window': {
        if (!firstCorner) {
          const a = await api.getPoint({ prompt: L('Precise la primera esquina', 'Specify first corner'), noSnap: true });
          if (a.kind !== 'point') return;
          firstCorner = a.p;
        }
        const b = await api.getPoint({ prompt: L('Precise la esquina opuesta', 'Specify opposite corner'), base: firstCorner, rubber: 'rect', noSnap: true });
        if (b.kind !== 'point') return;
        pushView(api);
        editor.zoomToBox(boxFromCorners(firstCorner, b.p));
        return;
      }
    }
  },
};

const PAN: CommandDef = {
  name: 'PAN',
  aliases: ['P', 'ENCUADRE'],
  category: 'view',
  transparent: true,
  readOnly: true,
  label: L('Encuadre', 'Pan'),
  description: L('Desplaza la vista por dos puntos (también: botón central, Alt+arrastrar o dos dedos).', 'Pans the view by two points (also: middle button, Alt+drag or two fingers).'),
  icon: 'pan',
  async run(api) {
    const a = await api.getPoint({ prompt: L('Precise el punto base del desplazamiento', 'Specify base point of displacement'), noSnap: true });
    if (a.kind !== 'point') return;
    const b = await api.getPoint({ prompt: L('Precise el segundo punto', 'Specify second point'), base: a.p, rubber: 'line', noSnap: true });
    if (b.kind !== 'point') return;
    pushView(api);
    const v = api.editor.view;
    v.center = { x: v.center.x - (b.p.x - a.p.x), y: v.center.y - (b.p.y - a.p.y) };
    api.editor.emit('view');
  },
};

const UNDO: CommandDef = {
  name: 'U',
  aliases: ['UNDO', 'DESHACER'],
  category: 'utility',
  readOnly: true,
  label: L('Deshacer', 'Undo'),
  description: L('Deshace la última operación completa (incluye bloques, capas y referencias).', 'Undoes the last complete operation (including blocks, layers and references).'),
  icon: 'undo',
  run(api) {
    const e = api.editor.doc.undo();
    if (e) api.info(L(`Deshecho: ${e.label}`, `Undone: ${e.label}`));
    else api.warn(L('No hay nada que deshacer.', 'Nothing to undo.'));
  },
};

const REDO: CommandDef = {
  name: 'REDO',
  aliases: ['REHACER', 'MREDO'],
  category: 'utility',
  readOnly: true,
  label: L('Rehacer', 'Redo'),
  description: L('Rehace la última operación deshecha.', 'Redoes the last undone operation.'),
  icon: 'redo',
  run(api) {
    const e = api.editor.doc.redo();
    if (e) api.info(L(`Rehecho: ${e.label}`, `Redone: ${e.label}`));
    else api.warn(L('No hay nada que rehacer.', 'Nothing to redo.'));
  },
};

function toggle(name: string, aliases: string[], label: [string, string], key: 'osnap' | 'otrack' | 'polar' | 'ortho' | 'gridSnap'): CommandDef {
  return {
    name,
    aliases,
    category: 'utility',
    transparent: true,
    readOnly: true,
    label: L(label[0], label[1]),
    description: L(`Activa o desactiva ${label[0].toLowerCase()}.`, `Toggles ${label[1].toLowerCase()}.`),
    run(api) {
      api.editor.toggleSnapSetting(key);
      const on = api.editor.prefs.snap[key];
      api.info(L(`${label[0]}: ${on ? 'activado' : 'desactivado'}`, `${label[1]}: ${on ? 'on' : 'off'}`));
    },
  };
}

const GRIDTOGGLE: CommandDef = {
  name: 'GRIDTOGGLE',
  aliases: ['GRID', 'REJILLA'],
  category: 'utility',
  transparent: true,
  readOnly: true,
  label: L('Rejilla', 'Grid'),
  description: L('Muestra u oculta la rejilla; GRID <espaciado> fija la separación.', 'Shows or hides the grid; GRID <spacing> sets spacing.'),
  run(api, args) {
    const g = api.editor.prefs.grid;
    const v = args?.[0] ? parseFloat(args[0]) : NaN;
    if (Number.isFinite(v) && v > 0) api.editor.setPrefs({ grid: { ...g, spacing: v, on: true } });
    else api.editor.setPrefs({ grid: { ...g, on: !g.on } });
  },
};

const DYNTOGGLE: CommandDef = {
  name: 'DYNTOGGLE',
  aliases: ['DYNMODE'],
  category: 'utility',
  transparent: true,
  readOnly: true,
  label: L('Entrada dinámica', 'Dynamic input'),
  description: L('Activa o desactiva la entrada dinámica junto al cursor.', 'Toggles dynamic input near the cursor.'),
  run(api) {
    const d = api.editor.prefs.dynamicInput;
    api.editor.setPrefs({ dynamicInput: { ...d, on: !d.on } });
  },
};

const LWDISPLAY: CommandDef = {
  name: 'LWDISPLAY',
  aliases: ['LWT', 'GROSORES'],
  category: 'utility',
  transparent: true,
  readOnly: true,
  label: L('Mostrar grosores', 'Show lineweights'),
  description: L('Muestra u oculta los grosores de línea en pantalla.', 'Shows or hides lineweights on screen.'),
  run(api) {
    api.editor.setPrefs({ lineweightDisplay: !api.editor.prefs.lineweightDisplay });
  },
};

const OSNAP: CommandDef = {
  name: 'OSNAP',
  aliases: ['OS', 'REFENT'],
  category: 'utility',
  transparent: true,
  readOnly: true,
  label: L('Referencias a objetos', 'Object snap settings'),
  description: L('Configura los modos de referencia a objetos permanentes (panel de ajustes).', 'Configures running object snap modes (settings panel).'),
  ui: 'drafting-settings',
  run(api) {
    api.editor.emit('prefs');
  },
};

function snapOverride(name: string, type: SnapType, es: string, en: string): CommandDef {
  return {
    name,
    aliases: [],
    category: 'utility',
    transparent: true,
    readOnly: true,
    label: L(`Referencia temporal: ${es}`, `Snap override: ${en}`),
    description: L(`Aplica la referencia ${es.toLowerCase()} solo al siguiente punto.`, `Applies ${en.toLowerCase()} snap to the next point only.`),
    run(api) {
      api.editor.osnapOverride = [type];
      api.editor.emit('overlay');
      api.info(L(`Siguiente punto: ${es}`, `Next point: ${en}`));
    },
  };
}

const SELECTALL: CommandDef = {
  name: 'SELECTALL',
  aliases: ['AI_SELALL'],
  category: 'utility',
  readOnly: true,
  label: L('Seleccionar todo', 'Select all'),
  description: L('Selecciona todos los objetos visibles y desbloqueados del espacio actual.', 'Selects all visible, unlocked objects in the current space.'),
  run(api) {
    api.editor.selectAll();
  },
};

const REGEN: CommandDef = {
  name: 'REGEN',
  aliases: ['RE', 'REGENALL', 'REGENERAR'],
  category: 'view',
  readOnly: true,
  label: L('Regenerar', 'Regenerate'),
  description: L('Reconstruye índices y cachés de visualización.', 'Rebuilds display indexes and caches.'),
  run(api) {
    api.editor.ctx.invalidateBlocks();
    api.editor.index.rebuild();
    api.editor.emit('doc');
    api.info(L('Regeneración completa.', 'Regeneration complete.'));
  },
};

const VIEW: CommandDef = {
  name: 'VIEW',
  aliases: ['V', 'VISTA', '-VIEW'],
  category: 'view',
  label: L('Vistas guardadas', 'Named views'),
  description: L('Guarda, restaura o elimina vistas con nombre (con estado de capas opcional).', 'Saves, restores or deletes named views (with optional layer state).'),
  async run(api) {
    const editor = api.editor;
    const r = await api.getKeyword({ prompt: L('Opción de vista', 'View option'), keywords: [K('Save', 'Guardar', 'Save', ['g', 's']), K('Restore', 'Restituir', 'Restore', ['r']), K('Delete', 'Borrar', 'Delete', ['b', 'd']), K('List', 'Lista', 'List', ['l', '?'])] });
    if (r.kind !== 'keyword') return;
    const views = [...editor.doc.data.views.values()].filter((v) => v.space === editor.space);
    if (r.key === 'List') {
      api.info(L(`Vistas: ${views.map((v) => v.name).join(', ') || '(ninguna)'}`, `Views: ${views.map((v) => v.name).join(', ') || '(none)'}`));
      return;
    }
    const name = await api.getString({ prompt: L('Nombre de la vista', 'View name') });
    if (name.kind !== 'string' || !name.value) return;
    const existing = views.find((v) => v.name.toLowerCase() === name.value.toLowerCase());
    if (r.key === 'Save') {
      const v = editor.view;
      const record: NamedView = { id: existing?.id ?? newId('view'), name: name.value, space: editor.space, center: { ...v.center }, height: v.viewHeight, rotation: 0 };
      api.apply('VIEW', (tx) => tx.put('views', record));
      api.info(L(`Vista «${name.value}» guardada.`, `View "${name.value}" saved.`));
    } else if (!existing) api.warn(L(`No existe la vista «${name.value}».`, `View "${name.value}" not found.`));
    else if (r.key === 'Restore') {
      pushView(api);
      editor.view.center = { ...existing.center };
      editor.view.setViewHeight(existing.height);
      editor.emit('view');
    } else api.apply('VIEW', (tx) => tx.remove('views', existing.id));
  },
};

const ISOLATE: CommandDef = {
  name: 'ISOLATEOBJECTS',
  aliases: ['ISOLATE', 'AISLAR'],
  category: 'view',
  readOnly: true,
  label: L('Aislar objetos', 'Isolate objects'),
  description: L('Muestra temporalmente solo los objetos designados (no modifica el dibujo).', 'Temporarily shows only the selected objects (does not modify the drawing).'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe objetos a aislar', 'Select objects to isolate'), allowLocked: true });
    if (!ids.length) return;
    api.editor.isolated = new Set(ids);
    api.editor.hidden.clear();
    api.editor.emit('doc');
  },
};

const HIDEOBJ: CommandDef = {
  name: 'HIDEOBJECTS',
  aliases: ['HIDE', 'OCULTAR'],
  category: 'view',
  readOnly: true,
  label: L('Ocultar objetos', 'Hide objects'),
  description: L('Oculta temporalmente los objetos designados.', 'Temporarily hides the selected objects.'),
  async run(api) {
    const ids = await api.getSelection({ prompt: L('Designe objetos a ocultar', 'Select objects to hide'), allowLocked: true });
    ids.forEach((id) => api.editor.hidden.add(id));
    api.editor.emit('doc');
  },
};

const UNISOLATE: CommandDef = {
  name: 'UNISOLATEOBJECTS',
  aliases: ['UNISOLATE', 'UNHIDE', 'MOSTRARTODO'],
  category: 'view',
  readOnly: true,
  label: L('Terminar aislamiento', 'End object isolation'),
  description: L('Vuelve a mostrar todos los objetos ocultados o aislados temporalmente.', 'Shows again all temporarily hidden or isolated objects.'),
  run(api) {
    api.editor.isolated = null;
    api.editor.hidden.clear();
    api.editor.emit('doc');
  },
};

export const VIEW_COMMANDS: CommandDef[] = [
  ZOOM,
  PAN,
  UNDO,
  REDO,
  toggle('OSNAPTOGGLE', ['F3'], ['Referencia a objetos', 'Object snap'], 'osnap'),
  toggle('ORTHOTOGGLE', ['ORTHO', 'ORTO'], ['Modo Orto', 'Ortho mode'], 'ortho'),
  toggle('POLARTOGGLE', ['POLAR'], ['Rastreo polar', 'Polar tracking'], 'polar'),
  toggle('OTRACKTOGGLE', ['OTRACK'], ['Rastreo de referencias', 'Object snap tracking'], 'otrack'),
  toggle('SNAPTOGGLE', ['SNAP', 'FORZCURSOR'], ['Forzcursor de rejilla', 'Grid snap'], 'gridSnap'),
  GRIDTOGGLE,
  DYNTOGGLE,
  LWDISPLAY,
  OSNAP,
  SELECTALL,
  REGEN,
  VIEW,
  ISOLATE,
  HIDEOBJ,
  UNISOLATE,
  snapOverride('END', 'endpoint', 'Punto final', 'Endpoint'),
  snapOverride('MID', 'midpoint', 'Punto medio', 'Midpoint'),
  snapOverride('CEN', 'center', 'Centro', 'Center'),
  snapOverride('NOD', 'node', 'Nodo', 'Node'),
  snapOverride('GCE', 'geocenter', 'Centro geométrico', 'Geometric center'),
  snapOverride('QUA', 'quadrant', 'Cuadrante', 'Quadrant'),
  snapOverride('INT', 'intersection', 'Intersección', 'Intersection'),
  snapOverride('EXT', 'extension', 'Extensión', 'Extension'),
  snapOverride('INS', 'insertion', 'Inserción', 'Insertion'),
  snapOverride('PER', 'perpendicular', 'Perpendicular', 'Perpendicular'),
  snapOverride('TAN', 'tangent', 'Tangente', 'Tangent'),
  snapOverride('NEA', 'nearest', 'Cercano', 'Nearest'),
  snapOverride('PAR', 'parallel', 'Paralelo', 'Parallel'),
  snapOverride('APP', 'appint', 'Intersección ficticia', 'Apparent intersection'),
];
