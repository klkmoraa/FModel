import type { Entity, Id, MLineEntity } from '../document/types';
import { CLOSE_KW, UNDO_KW, K, L, fail, make } from './helpers';
import type { CommandDef } from './types';
import { changeWallOption, ensureWallStyle, insertEntity, JUSTIFY_KW, rectangleVertices, requestWallStart, THICKNESS_KW, validWall, wallPreview, wallProperties, wallThickness } from './architectureHelpers';
import { WALLDOOR, WALLWINDOW } from './architectureOpenings';
import { OPENING_LIFECYCLE } from './openingLifecycle';

const HELP = L('Punto inicial; Espesor en unidades del dibujo y Justificación Centro/Izquierda/Derecha. Puntos siguientes, desHacer, Cerrar o Intro para terminar. 150 mm por defecto (0.15 m); presets WALL 100mm/150mm/200mm. Sin unidad: 150 unidades numéricas. Sólo tramos rectos; une esquinas del mismo recorrido, no objetos independientes.', 'Start point; Thickness in drawing units and Center/Left/Right Justification. Next points, Undo, Close or Enter to finish. Default 150 mm (0.15 m); presets WALL 100mm/150mm/200mm. Unitless: 150 numeric units. Straight segments only; joins corners of the same path, not independent objects.');
export const WALL: CommandDef = {
  name: 'WALL', aliases: ['MURO'], category: 'draw', label: L('Muro', 'Wall'), icon: 'wall',
  description: L('Traza un muro continuo de dos caras con esquinas unidas.', 'Draw a continuous two-face wall with joined corners.'), help: HELP,
  async run(api, args) {
    const start = await requestWallStart(api, args);
    if (!start) return;
    const { state, first } = start;
    const vertices = [first];
    let id: Id | undefined, createdStyle: Id | undefined;
    const commit = (closed = false) => {
      const path = { ...state, vertices: [...vertices], closed };
      validWall(path);
      api.apply('WALL', tx => {
        if (id) tx.updateEntity<MLineEntity>(id, path);
        else {
          const before = new Set(api.editor.doc.data.mlineStyles.keys()), style = ensureWallStyle(api, tx);
          if (!before.has(style)) createdStyle = style;
          id = insertEntity(tx, make<MLineEntity>(api, { type: 'mline', ...path, style })).id;
        }
      });
    };
    for (;;) {
      const r = await api.getPoint({ prompt: L('Punto siguiente · Intro termina', 'Next point · Enter finishes'), base: vertices[vertices.length - 1], rubber: 'none', allowNone: true, keywords: [UNDO_KW, ...(vertices.length > 2 ? [CLOSE_KW] : [])], preview: p => wallPreview(api, { ...state, vertices: [...vertices, p], closed: false }) });
      if (r.kind === 'none') return;
      if (r.kind === 'point') { vertices.push(r.p); commit(); }
      else if (r.key === 'Close') { commit(true); return; }
      else if (r.key === 'Undo' && vertices.length > 1) {
        vertices.pop();
        if (vertices.length > 1) commit();
        else if (id) {
          const remove = id, style = createdStyle;
          api.apply('WALL', tx => { tx.removeEntity(remove); if (style) tx.remove('mlineStyles', style); });
          id = undefined; createdStyle = undefined;
        }
      }
    }
  },
};
export const WALLRECT: CommandDef = {
  name: 'WALLRECT', aliases: ['HABITACION'], category: 'draw', label: L('Habitación', 'Room'), icon: 'room',
  description: L('Dos esquinas crean un muro rectangular cerrado.', 'Two corners create a closed rectangular wall.'),
  help: L('Primera esquina; antes de indicarla puedes elegir Espesor en unidades del dibujo y Justificación Centro/Izquierda/Derecha. Indica la esquina opuesta para crear un único muro rectangular cerrado con vista previa. Espesor inicial 150 mm (0.15 m); presets WALLRECT 100mm/150mm/200mm, convertidos a las unidades vigentes. Sin unidad: 150 unidades numéricas por defecto. Las medidas corresponden al eje central o a la cara de referencia elegida, siguiendo el orden horizontal, vertical y vuelta. Esc cancela antes de confirmar sin modificar el dibujo.', 'First corner; before specifying it, choose Thickness in drawing units and Center/Left/Right Justification. Specify the opposite corner to create one closed rectangular wall with preview. Initial thickness 150 mm (0.15 m); WALLRECT 100mm/150mm/200mm presets convert to current drawing units. Unitless: default 150 numeric units. Dimensions refer to the center axis or chosen reference face, following horizontal, vertical and return order. Esc cancels before confirmation without modifying the drawing.'),
  async run(api, args) {
    const start = await requestWallStart(api, args);
    if (!start) return;
    const { state, first } = start;
    const a = first;
    const r = await api.getPoint({ prompt: L('Esquina opuesta sobre la referencia elegida', 'Opposite corner on chosen reference'), base: a, rubber: 'none', preview: p => wallPreview(api, { ...state, vertices: rectangleVertices(a, p), closed: true }) });
    if (r.kind !== 'point') return;
    const path = { ...state, vertices: rectangleVertices(a, r.p), closed: true };
    validWall(path);
    api.apply('WALLRECT', tx => insertEntity(tx, make<MLineEntity>(api, { type: 'mline', ...path, style: ensureWallStyle(api, tx) })));
  },
};
export const WALLCONVERT: CommandDef = {
  name: 'WALLCONVERT', aliases: ['CONVERTIRMURO'], category: 'draw', label: L('Convertir a muro', 'Convert to wall'), icon: 'wall',
  description: L('Convierte líneas y polilíneas rectas seleccionadas, conservando el original por defecto.', 'Convert selected lines and straight polylines, keeping originals by default.'),
  help: L('Preselecciona o selecciona líneas/polilíneas rectas; Intro conserva originales, Reemplazar los elimina. Espesor y Justificación antes de confirmar. Rechaza curvas, suavizados y recorridos degenerados. Conserva capas, espacio y propiedades. Medidas en unidades del dibujo; 150 mm por defecto (sin unidad: 150).', 'Preselect or select lines/straight polylines; Enter keeps originals, Replace removes them. Thickness and Justification before confirmation. Rejects curves, smoothing and degenerate paths. Preserves layers, space and properties. Measurements in drawing units; default 150 mm (unitless: 150).'),
  async run(api, args) {
    const ids = await api.getSelection({ prompt: L('Selecciona líneas y polilíneas rectas', 'Select lines and straight polylines'), types: ['line', 'lwpolyline', 'polyline2d'] });
    if (!ids.length) return;
    const state = { scale: wallThickness(api, args), justification: 'zero' as MLineEntity['justification'] };
    let replace = false;
    for (;;) {
      const r = await api.getKeyword({ prompt: L('Intro confirma · originales conservados salvo Reemplazar', 'Enter confirms · originals kept unless Replace'), allowNone: true, keywords: [THICKNESS_KW, JUSTIFY_KW, K('Replace', 'Reemplazar', 'Replace', ['r']), K('Keep', 'Conservar', 'Keep', ['c', 'k'])] });
      if (r.kind === 'none') break;
      if (r.key === 'Replace' || r.key === 'Keep') replace = r.key === 'Replace';
      else await changeWallOption(api, r.key, state);
    }
    const walls: Entity[] = ids.map(id => {
      const e = api.editor.doc.entity(id)!;
      if (!e || !api.editor.isSelectable(id, ['line', 'lwpolyline', 'polyline2d'])) fail('No se puede convertir un objeto bloqueado u oculto.', 'A locked or hidden entity cannot be converted.');
      if (e.type !== 'line' && e.type !== 'lwpolyline' && e.type !== 'polyline2d') fail('Objeto incompatible.', 'Incompatible entity.');
      if (e.type !== 'line' && (e.vertices.some(v => (v.bulge ?? 0) !== 0) || (e.type === 'polyline2d' && e.smoothing !== 'none'))) fail('No se convierten curvas ni polilíneas suavizadas.', 'Curved or smoothed polylines cannot be converted.');
      const path = { ...state, vertices: e.type === 'line' ? [e.start, e.end] : e.vertices.map(v => ({ x: v.x, y: v.y })), closed: e.type === 'line' ? false : e.closed };
      validWall(path);
      return { ...wallProperties(e), type: 'mline', ...path, style: '' } as MLineEntity;
    });
    api.apply('WALLCONVERT', tx => {
      const style = ensureWallStyle(api, tx);
      for (const e of walls) {
        const wall = { ...e, style } as MLineEntity;
        if (replace) tx.put('entities', wall);
        else insertEntity(tx, wall);
      }
    });
  },
};
export const ARCHITECTURE_COMMANDS: CommandDef[] = [WALL, WALLRECT, WALLCONVERT, WALLDOOR, WALLWINDOW, ...OPENING_LIFECYCLE];
