import { CadDocument } from '../document/document';
import { newId } from '../document/ids';
import type { RoomData, TableEntity, TextEntity } from '../document/types';
import { roomBoundary } from '../model/architecturalDimensions';
import { readWallSource } from '../model/wallAssembly';
import { collectRooms, roomCells, roomQuantity, synchronizeRoomLabel } from '../model/rooms';
import { createContext } from '../model/context';
import { tableKind } from '../model/kinds/annotation';
import { insertEntity, physicalSize } from './architectureHelpers';
import { K, L, fail, make } from './helpers';
import type { CommandDef } from './types';
export const ROOMDATA: CommandDef = {
  name: 'ROOMDATA', aliases: ['DATOSHABITACION'], category: 'annotate', icon: 'text', label: L('Datos de habitación', 'Room data'), description: L('Nombre, acabados y altura explícita de una habitación; etiqueta de área vinculada.', 'Room name, finishes and explicit height; linked area label.'),
  help: L('Selecciona un único contorno recto cerrado o muro cerrado nativo. El muro mide su cara interior. Indica nombre, material de piso, material de pared y altura. Intro confirma; Esc cancela. La etiqueta conserva su desplazamiento manual y se actualiza con el contorno.', 'Select one straight closed boundary or native closed wall. Walls measure their inner face. Enter name, floor material, wall material and height. Enter confirms; Esc cancels. Labels retain manual offsets and follow the boundary.'),
  async run(api) {
    const doc = api.editor.doc, owner = api.editor.inputOwner, ids = await api.getSelection({ prompt: L('Selecciona una habitación cerrada', 'Select a closed room'), single: true });
    if (!ids.length)
      return;
    const sources = [...new Set(ids.map(id => doc.entity(id)?.type === 'lwpolyline' ? id : readWallSource(doc, id).anchorId))];
    if (sources.length !== 1 || doc.entity(sources[0])?.owner !== owner)
      fail('Selecciona una sola habitación del espacio actual.', 'Select one room in the current space.');
    const id = sources[0];
    roomBoundary(doc, id);
    const old = doc.entity(id)!.room, version = doc.version;
    const name = await api.getString({ prompt: L('Nombre de habitación', 'Room name'), defaultValue: old?.name, allowSpaces: true });
    if (name.kind !== 'string')
      return;
    const floor = await api.getString({ prompt: L('Material de piso · Intro omite', 'Floor material · Enter skips'), defaultValue: old?.floorMaterial, allowNone: true, allowSpaces: true });
    const wall = await api.getString({ prompt: L('Material de pared · Intro omite', 'Wall material · Enter skips'), defaultValue: old?.wallMaterial, allowNone: true, allowSpaces: true });
    const height = await api.getDistance({ prompt: L('Altura de pared para acabado bruto', 'Wall height for gross finish'), defaultValue: old?.height ?? physicalSize(api, 2700) });
    if (height.kind !== 'value')
      return;
    const data: RoomData = { version: 1, name: name.value.trim(), floorMaterial: floor.kind === 'string' ? floor.value.trim() : '', wallMaterial: wall.kind === 'string' ? wall.value.trim() : '', height: height.value };
    if (!data.name || [data.name, data.floorMaterial, data.wallMaterial].some(s => s.length > 256) || !Number.isFinite(data.height) || data.height <= 0)
      fail('Datos de habitación inválidos.', 'Invalid room data.');
    const q = roomQuantity(doc, id, data), label = make<TextEntity>(api, { type: 'text', text: `${data.name} · ${q.area.toFixed(2)} ${doc.settings.units === 'unitless' ? (api.lang === 'es' ? 'unidades²' : 'units²') : 'm²'}`, position: q.position, height: physicalSize(api, 100), style: doc.settings.currentTextStyle, rotation: 0, widthFactor: 1, oblique: 0, halign: 'center', valign: 'middle' });
    api.setPreview({ entities: [label] });
    try {
      const answer = await api.getKeyword({ prompt: L('Intro guarda datos y etiqueta · Esc cancela', 'Enter saves room and label · Esc cancels'), keywords: [K('Confirm', 'Confirmar', 'Confirm')], defaultValue: 'Confirm' });
      if (answer.kind !== 'keyword')
        return;
      if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner)
        fail('El dibujo cambió; vuelve a seleccionar.', 'The drawing changed; select again.');
      api.apply('ROOMDATA', tx => { tx.updateEntity(id, { room: data }); synchronizeRoomLabel(tx, id, api.lang, physicalSize(api, 100), true); });
    }
    finally {
      api.setPreview(null);
    }
  },
};
function roomScheduleCommand(mode: 'rooms' | 'materials'): CommandDef {
  return {
    name: mode === 'rooms' ? 'ROOMSCHEDULE' : 'MATERIALSCHEDULE', aliases: [mode === 'rooms' ? 'CUADROAREAS' : 'CUADROMATERIALES'], category: 'annotate', icon: 'table', label: mode === 'rooms' ? L('Cuadro de áreas', 'Room schedule') : L('Cuadro de materiales', 'Material schedule'), description: L('Tabla vinculada a los datos y contornos de las habitaciones del espacio actual.', 'Table linked to room data and boundaries in the current space.'), help: L('Primero asigna DATOSHABITACION. Coloca la esquina superior izquierda; Esc cancela. Piso = área interior; paredes = perímetro por altura indicada, área bruta sin deducir huecos. Cuadros en m²/m o unidades²/unidades si el dibujo no tiene unidad.', 'Assign ROOMDATA first. Place the top-left corner; Esc cancels. Floor = interior area; walls = perimeter times explicit height, gross area without opening deductions. Tables use m²/m or units²/units for unitless drawings.'), async run(api) {
      const doc = api.editor.doc, owner = api.editor.inputOwner, version = doc.version, rooms = collectRooms(doc, owner);
      if (!rooms.length)
        fail('Asigna primero datos de habitación.', 'Assign room data first.');
      const cells = roomCells(rooms, mode, api.lang, doc.settings.units === 'unitless'), base = doc.data.tableStyles.get(doc.settings.currentTableStyle);
      if (!base)
        fail('Falta el estilo de tabla.', 'Table style is missing.');
      const size = (n: number) => physicalSize(api, n), style = { ...base!, id: newId('ts'), name: `FModel ${mode} ${newId()}`, cellMargin: size(30), title: { ...base!.title, textHeight: size(100) }, header: { ...base!.header, textHeight: size(70) }, data: { ...base!.data, textHeight: size(70) } };
      const columnWidths = cells[1].map((_, i) => Math.max(size(i === 0 ? 1000 : 650), ...cells.slice(1).map(r => r[i].text.length * size(60) + style.cellMargin * 2)));
      const build = (position: {
        x: number;
        y: number;
      }) => make<TableEntity>(api, { type: 'table', position, rotation: 0, style: style.id, cells, columnWidths, rowHeights: cells.map((_, i) => size(i === 0 ? 220 : 180)), titleRow: true, headerRow: true, roomSchedule: { version: 1, mode, language: api.lang } });
      const previewDoc = new CadDocument({ ...doc.data, entities: new Map(), tableStyles: new Map(doc.data.tableStyles).set(style.id, style) }), ctx = createContext(previewDoc);
      const point = await api.getPoint({ prompt: L('Esquina superior izquierda del cuadro vinculado', 'Top-left corner of linked schedule'), allowNone: true, preview: p => ({ items: tableKind.graphics(build(p), ctx) }) });
      if (point.kind !== 'point')
        return;
      if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner)
        fail('El dibujo cambió; coloca de nuevo el cuadro.', 'The drawing changed; place the schedule again.');
      if (![point.p.x, point.p.y].every(Number.isFinite))
        fail('Posición inválida.', 'Invalid position.');
      api.apply(mode === 'rooms' ? 'ROOMSCHEDULE' : 'MATERIALSCHEDULE', tx => { tx.add('tableStyles', style); insertEntity(tx, build(point.p)); });
    }
  };
}
export const ROOMSCHEDULE = roomScheduleCommand('rooms'), MATERIALSCHEDULE = roomScheduleCommand('materials');
