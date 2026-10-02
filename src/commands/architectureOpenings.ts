import type { ArcEntity, Entity, LineEntity, MLineEntity } from '../document/types';
import { add, scale, sub, dot } from '../geometry/vec';
import type { Vec2 } from '../geometry/vec';
import { TOL } from '../geometry/tolerance';
import { wallOpening, wallOffsets } from '../geometry/walls';
import type { WallOpening } from '../geometry/walls';
import { isWallStyle } from '../model/wallStyle';
import { fail, K, L } from './helpers';
import type { CommandDef } from './types';
import { insertEntity, physicalSize, wallPreview, wallProperties } from './architectureHelpers';

export function openingSymbols(wall: MLineEntity, opening: WallOpening, door: boolean, side = 1, hingeEnd = false): Entity[] {
  const { start, end, normal, direction, width } = opening;
  const offsets = wallOffsets(wall), entities: Entity[] = [];
  const line = (a: Vec2, b: Vec2) => entities.push({ ...wallProperties(wall), type: 'line', start: a, end: b } as LineEntity);
  for (const point of [start, end]) line(add(point, scale(normal, offsets[0])), add(point, scale(normal, offsets[1])));
  if (!door) {
    for (const factor of [0.25, 0.75]) {
      const offset = offsets[1] + (offsets[0] - offsets[1]) * factor;
      line(add(start, scale(normal, offset)), add(end, scale(normal, offset)));
    }
    return entities;
  }
  const offset = side > 0 ? offsets[0] : offsets[1];
  const hinge = add(hingeEnd ? end : start, scale(normal, offset));
  const leaf = add(hinge, scale(normal, side * width));
  line(hinge, leaf);
  const closedDirection = scale(direction, hingeEnd ? -1 : 1);
  const closedAngle = Math.atan2(closedDirection.y, closedDirection.x), openAngle = Math.atan2(side * normal.y, side * normal.x);
  const ccw = (hingeEnd ? -1 : 1) * side > 0;
  entities.push({ ...wallProperties(wall), type: 'arc', center: hinge, radius: width, startAngle: ccw ? closedAngle : openAngle, endAngle: ccw ? openAngle : closedAngle } as ArcEntity);
  return entities;
}
const OPENING_ERROR = L('El hueco debe caber completamente en un tramo recto, separado de las esquinas y con ancho positivo finito.', 'The opening must fit completely inside a straight segment, clear of corners, with a positive finite width.');
function openingCommand(door: boolean): CommandDef {
  const name = door ? 'WALLDOOR' : 'WALLWINDOW';
  return {
    name, aliases: [door ? 'PUERTA' : 'VENTANA'], category: 'draw', icon: door ? 'door' : 'window',
    label: door ? L('Puerta', 'Door') : L('Ventana', 'Window'),
    description: door ? L('Abre un hueco real e inserta hoja y arco de puerta de 90°.', 'Cut a real opening and insert a door leaf and 90° arc.') : L('Abre un hueco real e inserta jambas y marco de ventana.', 'Cut a real opening and insert window jambs and frame.'),
    help: L(`Selecciona un muro de dos caras con tapas rectas. Indica el centro del hueco sobre el tramo más cercano al clic; Ancho permite cambiar ${door ? '900' : '1200'} mm por defecto (sin unidad: ${door ? '900' : '1200'} unidades). ${door ? 'Elige lado con un punto, Bisagra alterna el extremo, Intro confirma.' : 'Intro confirma; puedes recolocar el centro.'} El ancho debe caber sin tocar esquinas. Medidas en unidades del dibujo, proyección sobre el eje sin depender del zoom. Esc cancela sin cambios. Huecos y símbolos 2D no asociativos.`, `Select a two-face wall with straight caps. Specify opening center on the segment nearest the click; Width changes default ${door ? '900' : '1200'} mm (unitless: ${door ? '900' : '1200'} units). ${door ? 'Choose side with a point, Hinge swaps ends, Enter confirms.' : 'Enter confirms; you can reposition the center.'} Width must fit without touching corners. Measurements in drawing units, projection on the axis independent of zoom. Esc cancels without changes. Openings and 2D symbols are not associative.`),
    async run(api) {
      const selected = await api.getEntity({ prompt: L('Selecciona un muro compatible cerca del tramo del hueco', 'Select a compatible wall near the opening segment'), types: ['mline'] });
      if (selected.kind !== 'entity') return;
      const wall = api.editor.doc.entity(selected.id);
      if (!api.editor.isSelectable(selected.id, ['mline'])) fail('No se puede abrir un hueco en un muro bloqueado u oculto.', 'Cannot cut an opening in a locked or hidden wall.');
      if (wall?.type !== 'mline' || !isWallStyle(api.editor.doc.data.mlineStyles.get(wall.style))) fail('Se requiere un muro de dos caras ±0.5, sin relleno y con tapas rectas.', 'A two-face ±0.5 wall without fill and with straight caps is required.');
      let width = physicalSize(api, door ? 900 : 1200), location: Vec2 | undefined, side = 1, hingeEnd = false;
      const widthKeyword = K('Width', 'Ancho', 'Width', ['a', 'w', 'ancho']);
      const changeWidth = async () => {
        const r = await api.getDistance({ prompt: L('Ancho en unidades del dibujo', 'Width in drawing units'), defaultValue: width });
        if (r.kind === 'value') {
          if (!Number.isFinite(r.value) || r.value <= TOL.LINEAR) fail(OPENING_ERROR.es, OPENING_ERROR.en);
          width = r.value;
        }
      };
      const geometry = (p: Vec2) => wallOpening(wall, p, width);
      const preview = (p: Vec2, previewSide = side) => {
        try {
          const opening = geometry(p);
          return { entities: [...opening.paths.flatMap(vertices => wallPreview(api, { ...wall, vertices, closed: false })?.entities ?? []), ...openingSymbols(wall, opening, door, previewSide, hingeEnd)] };
        } catch { return null; }
      };
      while (!location) {
        const r = await api.getPoint({ prompt: L(`Centro del hueco · ancho ${width} ${api.editor.doc.settings.units}`, `Opening center · width ${width} ${api.editor.doc.settings.units}`), noOrtho: true, noSnap: true, keywords: [widthKeyword], preview: p => preview(p) });
        if (r.kind === 'keyword') { await changeWidth(); continue; }
        if (r.kind !== 'point') return;
        try { geometry(r.p); } catch { fail(OPENING_ERROR.es, OPENING_ERROR.en); }
        location = r.p;
      }
      for (;;) {
        const center = location;
        api.setPreview(preview(center));
        const chooseSide = (p: Vec2) => dot(sub(p, geometry(center).start), geometry(center).normal) >= wallOffsets(wall).reduce((a, b) => a + b) / 2 ? 1 : -1;
        const r = await api.getPoint({ prompt: door ? L('Lado de apertura · Bisagra cambia extremo · Intro confirma', 'Opening side · Hinge swaps end · Enter confirms') : L('Intro confirma · punto recoloca centro', 'Enter confirms · point repositions center'), noOrtho: true, noSnap: true, allowNone: true, keywords: [widthKeyword, K('Location', 'Ubicación', 'Location', ['u', 'l']), ...(door ? [K('Hinge', 'Bisagra', 'Hinge', ['b', 'h'])] : [])], preview: p => door ? preview(center, chooseSide(p)) : preview(p) });
        if (r.kind === 'none') break;
        if (r.kind === 'keyword') {
          if (r.key === 'Width') await changeWidth();
          else if (r.key === 'Hinge') hingeEnd = !hingeEnd;
          else {
            const p = await api.getPoint({ prompt: L('Nuevo centro del hueco', 'New opening center'), noOrtho: true, noSnap: true, preview: p => preview(p) });
            if (p.kind === 'point') location = p.p;
          }
        } else if (door) side = chooseSide(r.p);
        else location = r.p;
        try { geometry(location); } catch { fail(OPENING_ERROR.es, OPENING_ERROR.en); }
      }
      let opening: WallOpening;
      try { opening = geometry(location); } catch { fail(OPENING_ERROR.es, OPENING_ERROR.en); }
      api.apply(name, tx => {
        tx.updateEntity<MLineEntity>(wall.id, { vertices: opening.paths[0], closed: false });
        for (const vertices of opening.paths.slice(1)) insertEntity(tx, { ...wall, vertices, closed: false });
        for (const symbol of openingSymbols(wall, opening, door, side, hingeEnd)) insertEntity(tx, symbol);
      });
    },
  };
}
export const WALLDOOR = openingCommand(true);
export const WALLWINDOW = openingCommand(false);
