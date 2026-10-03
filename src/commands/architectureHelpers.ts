import { UNIT_TO_MM } from '../document/defaults';
import { newId } from '../document/ids';
import type { Transaction } from '../document/document';
import type { Entity, EntityBase, LineEntity, MLineEntity } from '../document/types';
import type { Vec2 } from '../geometry/vec';
import { wallFaces } from '../geometry/walls';
import type { WallPath } from '../geometry/walls';
import { TOL } from '../geometry/tolerance';
import { isWallStyle, wallStyle } from '../model/wallStyle';
import { fail, K, L, make } from './helpers';
import type { CommandApi } from './types';

export const WALL_ERROR = L('Recorrido de muro inválido: usa puntos finitos, tramos sin colapsar y esquinas sin inversión ni ingletes excesivos.', 'Invalid wall path: use finite points, non-collapsed segments and corners without reversals or excessive miters.');
export function validWall(path: WallPath) { try { wallFaces(path); } catch { fail(WALL_ERROR.es, WALL_ERROR.en); } }
export function physicalSize(api: CommandApi, mm: number) { return mm / UNIT_TO_MM[api.editor.doc.settings.units]; }
export function wallThickness(api: CommandApi, args?: string[]) {
  if (!args?.length) return physicalSize(api, 150);
  if (args.length !== 1 || !['100mm', '150mm', '200mm'].includes(args[0].toLowerCase())) fail('Preset inválido: 100mm, 150mm o 200mm.', 'Invalid preset: 100mm, 150mm or 200mm.');
  return physicalSize(api, Number.parseFloat(args[0]));
}
export function ensureWallStyle(api: CommandApi, tx: Transaction): string {
  const styles = api.editor.doc.data.mlineStyles;
  const found = [...styles.values()].find(isWallStyle);
  if (found) return found.id;
  let name = 'FModel Wall', suffix = 2;
  while ([...styles.values()].some(s => s.name.toLowerCase() === name.toLowerCase())) name = `FModel Wall ${suffix++}`;
  const style = wallStyle(newId('mls'), name);
  tx.add('mlineStyles', style);
  return style.id;
}
export function insertEntity(tx: Transaction, e: Entity) {
  const { id: _id, order: _order, ...rest } = e;
  return tx.addEntity(rest as never);
}
export function wallPreview(api: CommandApi, path: WallPath) {
  try {
    const faces = wallFaces(path), entities: Entity[] = [];
    for (const face of faces) {
      for (let i = 1; i < face.length; i++) entities.push(make<LineEntity>(api, { type: 'line', start: face[i - 1], end: face[i] }));
      if (path.closed) entities.push(make<LineEntity>(api, { type: 'line', start: face[face.length - 1], end: face[0] }));
    }
    if (!path.closed) for (const i of [0, path.vertices.length - 1]) entities.push(make<LineEntity>(api, { type: 'line', start: faces[0][i], end: faces[1][i] }));
    return { entities };
  } catch { return null; }
}
export const THICKNESS_KW = K('Thickness', 'Espesor', 'Thickness', ['e', 't', 'espesor']);
export const JUSTIFY_KW = K('Justification', 'Justificación', 'Justification', ['j']);
export async function changeWallOption(api: CommandApi, key: string, state: { scale: number; justification: MLineEntity['justification'] }) {
  if (key === 'Thickness') {
    const r = await api.getDistance({ prompt: L('Espesor en unidades del dibujo', 'Thickness in drawing units'), defaultValue: state.scale });
    if (r.kind === 'value') {
      if (!Number.isFinite(r.value) || r.value <= TOL.LINEAR) fail('El espesor debe ser positivo y finito.', 'Thickness must be positive and finite.');
      state.scale = r.value;
    }
  } else {
    const r = await api.getKeyword({ prompt: L('Cara de referencia respecto al sentido del recorrido', 'Reference face relative to path direction'), defaultValue: 'Center', keywords: [K('Center', 'Centro', 'Center', ['c', 'centro']), K('Left', 'Izquierda', 'Left', ['i', 'l', 'izquierda']), K('Right', 'Derecha', 'Right', ['d', 'r', 'derecha'])] });
    if (r.kind === 'keyword') state.justification = r.key === 'Left' ? 'top' : r.key === 'Right' ? 'bottom' : 'zero';
  }
}
export function wallPrompt(api: CommandApi, state: { scale: number; justification: string }) {
  const units = api.editor.doc.settings.units;
  const numeric = units === 'unitless';
  return L(`Punto inicial · espesor ${state.scale} ${numeric ? 'unidades sin unidad' : units} · referencia ${state.justification === 'zero' ? 'centro' : state.justification === 'top' ? 'izquierda' : 'derecha'}`, `Start point · thickness ${state.scale} ${numeric ? 'unitless drawing units' : units} · reference ${state.justification === 'zero' ? 'center' : state.justification === 'top' ? 'left' : 'right'}`);
}
/** Shared initial options; no style/entity mutation before the first point. */
export async function requestWallStart(api: CommandApi, args?: string[]) {
  const state = { scale: wallThickness(api, args), justification: 'zero' as MLineEntity['justification'] };
  for (;;) {
    const r = await api.getPoint({ prompt: wallPrompt(api, state), allowNone: true, keywords: [THICKNESS_KW, JUSTIFY_KW] });
    if (r.kind === 'none') return null;
    if (r.kind === 'point') return { state, first: r.p };
    await changeWallOption(api, r.key, state);
  }
}
export function rectangleVertices(a: Vec2, b: Vec2): Vec2[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

/** Copy source properties without carrying another entity's geometry/schema fields. */
export function wallProperties(e: Entity): EntityBase {
  const { id, type, owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, order, annotative, meta } = e;
  return { id, type, owner, layer, color, linetype, linetypeScale, lineweight, transparency, visible, locked, construction, order, annotative, meta };
}
