import type { CadDocument, Transaction } from '../document/document';
import { entityDefaults, UNIT_TO_MM } from '../document/defaults';
import type { Entity, Id, RoomData, TableCell, TableEntity, TextEntity } from '../document/types';
import { add, sub, dist, type Vec2 } from '../geometry/vec';
import { pointInPolygon } from '../geometry/polyline';
import { ArchitecturalError, ringArea, roomBoundary } from './architecturalDimensions';
export interface RoomQuantity {
  id: Id;
  data: RoomData;
  area: number;
  perimeter: number;
  height: number;
  walls: number;
  position: Vec2;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// A horizontal interior span also works for concave contours whose centroid lies outside.
function labelPosition(points: Vec2[]): Vec2 {
  const ys = points.map(p => p.y).sort((a, b) => a - b), y = ys[0] + (ys.at(-1)! - ys[0]) / 2;
  const xs: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a.y > y) !== (b.y > y))
      xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
  }
  xs.sort((a, b) => a - b);
  let p = { ...points[0] }, width = -1;
  for (let i = 0; i < xs.length - 1; i += 2)
    if (xs[i + 1] - xs[i] > width) {
      width = xs[i + 1] - xs[i];
      p = { x: xs[i] + width / 2, y };
    }
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !pointInPolygon(p, points))
    throw new ArchitecturalError({ es: 'No se pudo situar la etiqueta dentro de la habitación.', en: 'Could not place the label inside the room.' });
  return p;
}
export function roomQuantity(doc: CadDocument, id: Id, data = doc.entity(id)?.room): RoomQuantity {
  if (!data)
    throw new ArchitecturalError({ es: 'Faltan datos de habitación.', en: 'Room data is missing.' });
  const points = roomBoundary(doc, id), unit = doc.settings.units === 'unitless' ? 1 : UNIT_TO_MM[doc.settings.units] / 1000;
  const area = Math.abs(ringArea(points)) * unit * unit, perimeter = points.reduce((sum, p, i) => sum + dist(p, points[(i + 1) % points.length]), 0) * unit, height = data.height * unit, walls = perimeter * height;
  if (![area, perimeter, height, walls].every(x => Number.isFinite(x) && x > 0))
    throw new ArchitecturalError({ es: 'Cantidades fuera del rango válido.', en: 'Quantities exceed the valid range.' });
  return { id, data, area, perimeter, height, walls, position: labelPosition(points) };
}
export function collectRooms(doc: CadDocument, owner: Id): RoomQuantity[] {
  const rooms = [...doc.data.entities.values()].filter(e => e.owner === owner && e.room);
  if (rooms.length > 100)
    throw new ArchitecturalError({ es: 'Máximo 100 habitaciones por espacio.', en: 'At most 100 rooms per space.' });
  return rooms.map(e => roomQuantity(doc, e.id)).sort((a, b) => a.data.name.localeCompare(b.data.name) || a.id.localeCompare(b.id));
}
export function roomCells(rooms: RoomQuantity[], mode: 'rooms' | 'materials', lang: 'es' | 'en', unitless: boolean): TableCell[][] {
  const areaUnit = unitless ? (lang === 'es' ? 'unidades²' : 'units²') : 'm²', lengthUnit = unitless ? (lang === 'es' ? 'unidades' : 'units') : 'm';
  const title = mode === 'rooms' ? (lang === 'es' ? 'Cuadro de áreas' : 'Room schedule') : (lang === 'es' ? 'Materiales · paredes brutas' : 'Materials · gross walls');
  const headers = mode === 'rooms' ? (lang === 'es' ? ['Habitación', `Piso (${areaUnit})`, `Perímetro (${lengthUnit})`, `Altura (${lengthUnit})`, 'Piso', 'Pared'] : ['Room', `Floor (${areaUnit})`, `Perimeter (${lengthUnit})`, `Height (${lengthUnit})`, 'Floor', 'Wall']) : (lang === 'es' ? ['Material', 'Aplicación', `Área (${areaUnit})`] : ['Material', 'Application', `Area (${areaUnit})`]);
  const rows: string[][] = [];
  if (mode === 'rooms')
    for (const r of rooms)
      rows.push([r.data.name, r.area.toFixed(2), r.perimeter.toFixed(2), r.height.toFixed(2), r.data.floorMaterial, r.data.wallMaterial]);
  else {
    const materials = new Map<string, {
      material: string;
      kind: 'floor' | 'wall';
      area: number;
    }>();
    for (const r of rooms)
      for (const [material, kind, area] of [[r.data.floorMaterial, 'floor', r.area], [r.data.wallMaterial, 'wall', r.walls]] as const) {
        if (!material)
          continue;
        const key = JSON.stringify([kind, material]), old = materials.get(key);
        materials.set(key, { material, kind, area: area + (old?.area ?? 0) });
      }
    for (const r of [...materials.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.material.localeCompare(b.material)))
      rows.push([r.material, r.kind === 'floor' ? (lang === 'es' ? 'Piso' : 'Floor') : (lang === 'es' ? 'Pared · bruto' : 'Wall · gross'), r.area.toFixed(2)]);
  }
  return [[{ text: title, colSpan: headers.length }, ...headers.slice(1).map(() => ({ text: '', merged: true }))], headers.map(text => ({ text })), ...rows.map(row => row.map(text => ({ text })))];
}
export function synchronizeRoomLabel(tx: Transaction, sourceId: Id, lang: 'es' | 'en', height: number, create = false): void {
  const labels = [...tx.doc.data.entities.values()].filter((e): e is TextEntity => e.type === 'text' && e.roomLabel?.sourceId === sourceId);
  if (!labels.length && !create)
    return;
  const source = tx.doc.entity(sourceId);
  if (!source?.room) {
    for (const e of labels) {
      const { roomLabel: _link, ...rest } = e;
      tx.put('entities', rest);
    }
    return;
  }
  for (const e of labels)
    if (e.owner !== source.owner) {
      const { roomLabel: _link, ...rest } = e;
      tx.put('entities', rest);
    }
  const owned = labels.filter(e => e.owner === source.owner);
  let room: RoomQuantity;
  try {
    room = roomQuantity(tx.doc, sourceId);
  }
  catch {
    for (const e of owned) {
      const text = e.roomLabel!.language === 'es' ? 'Revisar habitación' : 'Review room';
      if (e.text !== text)
        tx.updateEntity<TextEntity>(e.id, { text });
    }
    return;
  }
  const text = `${room.data.name} · ${room.area.toFixed(2)} ${tx.doc.settings.units === 'unitless' ? (lang === 'es' ? 'unidades²' : 'units²') : 'm²'}`;
  if (!owned.length && create)
    tx.addEntity<TextEntity>({ ...entityDefaults(tx.doc, source.owner), type: 'text', text, position: room.position, height, style: tx.doc.settings.currentTextStyle, rotation: 0, widthFactor: 1, oblique: 0, halign: 'center', valign: 'middle', roomLabel: { version: 1, sourceId, base: room.position, language: lang } });
  for (const e of owned) {
    const position = add(room.position, sub(e.position, e.roomLabel!.base));
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      continue;
    const next = { ...e, text, position, ...(e.alignPoint ? { alignPoint: position } : {}), roomLabel: { ...e.roomLabel!, base: room.position } };
    if (!same(e, next))
      tx.put('entities', next);
  }
}
export function synchronizeRoomSchedule(tx: Transaction, id: Id, rooms: RoomQuantity[] | null): void {
  const table = tx.doc.entity(id);
  if (table?.type !== 'table' || !table.roomSchedule)
    return;
  const link = table.roomSchedule;
  if (rooms === null) {
    if (link.status !== 'review') {
      const cells = structuredClone(table.cells);
      cells[0][0].text = link.language === 'es' ? 'Cuadro · Revisar habitaciones' : 'Schedule · Review rooms';
      tx.updateEntity<TableEntity>(id, { cells, roomSchedule: { ...link, status: 'review' } });
    }
    return;
  }
  const cells = roomCells(rooms, link.mode, link.language, tx.doc.settings.units === 'unitless'), rowHeights = cells.map((_, i) => table.rowHeights[i] ?? table.rowHeights[2] ?? table.rowHeights[1]), { status: _status, ...current } = link;
  if (!same(cells, table.cells) || !same(rowHeights, table.rowHeights) || link.status)
    tx.updateEntity<TableEntity>(id, { cells, rowHeights, roomSchedule: current });
}
export function installRooms(doc: CadDocument): () => void {
  return doc.addReactor((tx, changes) => {
    const owners = new Set<Id>(), sources = new Set<Id>();
    for (const c of changes) {
      if (c.coll === 'groups' || c.coll === 'mlineStyles' || (c.coll === 'settings' && (c.before as {
        units?: string;
      })?.units !== (c.after as {
        units?: string;
      })?.units))
        for (const e of doc.data.entities.values())
          if (e.room) {
            sources.add(e.id);
            owners.add(e.owner);
          }
      if (c.coll !== 'entities')
        continue;
      const before = c.before as Entity | undefined, after = c.after as Entity | undefined;
      for (const e of [before, after])
        if (e?.room) {
          sources.add(e.id);
          owners.add(e.owner);
        }
      if (after?.type === 'table' && after.roomSchedule && !same(after.roomSchedule, before?.type === 'table' ? before.roomSchedule : undefined))
        owners.add(after.owner);
    }
    for (const id of sources) {
      const label = [...doc.data.entities.values()].find((e): e is TextEntity => e.type === 'text' && e.roomLabel?.sourceId === id);
      synchronizeRoomLabel(tx, id, label?.roomLabel?.language ?? 'es', label?.height ?? 100);
    }
    for (const owner of owners) {
      let rooms: RoomQuantity[] | null;
      try {
        rooms = collectRooms(doc, owner);
      }
      catch {
        rooms = null;
      }
      for (const e of doc.data.entities.values())
        if (e.owner === owner && e.type === 'table' && e.roomSchedule)
          synchronizeRoomSchedule(tx, e.id, rooms);
    }
  });
}
