import type { BBox } from '../geometry/bbox';
import { emptyBox, expandBox, isEmptyBox } from '../geometry/bbox';
import type { Vec2 } from '../geometry/vec';
import type { CadDocument } from '../document/document';
import { createDocument } from '../document/defaults';
import { newId } from '../document/ids';
import type { BlockRecord, DrawingUnits, DynamicBlockDefinition, Entity, Id, LinearParam, StretchAction, ValueSet } from '../document/types';
import { createContext } from '../model/context';
import type { EvalContext } from '../model/registry';
import { kindOf } from '../model/registry';
import type { BlockPackage } from './library';
import { importBlockPackage, packageBlock } from './library';

/**
 * «Hacer estirable»: convierte un bloque estático en dinámico con dos parámetros lineales
 * (Ancho y Fondo/Alto) y sus acciones de estirar. El marco de cada acción empieza en la línea de
 * corte que menos entidades cruza entre el 35 % y el 65 % de la medida: lo que queda entero a un
 * lado se traslada sin deformarse y solo se estira lo que atraviesa el corte.
 */

const box = (e: Entity, ctx: EvalContext): BBox | null => {
  try {
    const b = kindOf(e).bbox(e, ctx);
    return Number.isFinite(b.minX) ? b : null;
  } catch {
    return null;
  }
};

/** Posición del corte (entre 35 % y 65 %) que menos cajas de entidad atraviesan; ante empate, la más centrada. */
export function cutPosition(boxes: BBox[], min: number, max: number, axis: 'x' | 'y'): number {
  const size = max - min;
  const lo = (b: BBox) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: BBox) => (axis === 'x' ? b.maxX : b.maxY);
  let best = min + size / 2;
  let bestCount = Infinity;
  let bestDist = Infinity;
  for (let k = 0; k <= 60; k++) {
    const t = min + size * (0.35 + (0.3 * k) / 60);
    const count = boxes.filter((b) => lo(b) < t - size * 1e-6 && hi(b) > t + size * 1e-6).length;
    const d = Math.abs(t - (min + size / 2));
    if (count < bestCount || (count === bestCount && d < bestDist)) {
      best = t;
      bestCount = count;
      bestDist = d;
    }
  }
  return best;
}

/** Incremento «redondo» según las unidades: mm 10, cm 1, m 0,01; si no, 1 % redondeado a 1/2/5·10ⁿ. */
export function niceIncrement(size: number, units: DrawingUnits): number {
  if (units === 'mm') return 10;
  if (units === 'cm') return 1;
  if (units === 'm') return 0.01;
  const raw = size / 100;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

function valueSetFor(size: number, units: DrawingUnits): ValueSet {
  const increment = niceIncrement(size, units);
  const round = (v: number) => Math.round(v / increment) * increment;
  return { kind: 'increment', increment, min: Math.max(increment, round(size * 0.3)), max: round(size * 4) };
}

/** Definición dinámica «estirable» para las entidades de un bloque. */
export function stretchableDefinition(block: BlockRecord, entities: Entity[], ctx: EvalContext, opts: { heightName?: string } = {}): DynamicBlockDefinition {
  const boxes = entities.map((e) => box(e, ctx)).filter((b): b is BBox => !!b);
  const ext = emptyBox();
  for (const b of boxes) expandBox(ext, b);
  if (isEmptyBox(ext)) throw new Error('El bloque no tiene geometría que estirar. / The block has no geometry to stretch.');
  const w = ext.maxX - ext.minX;
  const h = ext.maxY - ext.minY;
  const margin = Math.max(w, h) * 0.05;
  const selection = entities.map((e) => e.id);
  const parameters: LinearParam[] = [];
  const actions: StretchAction[] = [];
  const add = (name: string, base: Vec2, end: Vec2, size: number, frame: Vec2[]) => {
    const id = newId('prm');
    parameters.push({ id, type: 'linear', name, label: name, showInProperties: true, chainActions: false, gripCount: 1, base, end, baseLocation: 'start', valueSet: valueSetFor(size, block.units) });
    actions.push({ id: newId('act'), type: 'stretch', name: `Estirar ${name.toLowerCase()}`, paramId: id, selection, paramPoint: 'end', frame, axis: 'xy', distanceMultiplier: 1, angleOffset: 0 });
  };
  if (w > 1e-9) {
    const cx = cutPosition(boxes, ext.minX, ext.maxX, 'x');
    const [y0, y1] = [ext.minY - margin, ext.maxY + margin];
    add('Ancho', { x: ext.minX, y: ext.minY - margin }, { x: ext.maxX, y: ext.minY - margin }, w, [{ x: cx, y: y0 }, { x: ext.maxX + margin, y: y0 }, { x: ext.maxX + margin, y: y1 }, { x: cx, y: y1 }]);
  }
  if (h > 1e-9) {
    const cy = cutPosition(boxes, ext.minY, ext.maxY, 'y');
    const [x0, x1] = [ext.minX - margin, ext.maxX + margin];
    add(opts.heightName ?? 'Fondo', { x: ext.minX - margin, y: ext.minY }, { x: ext.minX - margin, y: ext.maxY }, h, [{ x: x0, y: cy }, { x: x1, y: cy }, { x: x1, y: ext.maxY + margin }, { x: x0, y: ext.maxY + margin }]);
  }
  return { parameters, actions, constraints: [], lookups: [], variables: [], propertyOrder: parameters.map((p) => p.id) };
}

/** Hace estirable un bloque del documento (una transacción). */
export function makeStretchable(doc: CadDocument, ctx: EvalContext, blockId: Id, opts: { heightName?: string } = {}): DynamicBlockDefinition {
  const block = doc.data.blocks.get(blockId);
  if (!block) throw new Error('Bloque inexistente. / Block not found.');
  if (block.dynamic) throw new Error(`«${block.name}» ya es dinámico: edítalo con BEDIT. / "${block.name}" is already dynamic: edit it with BEDIT.`);
  const def = stretchableDefinition(block, doc.entitiesOf(blockId), ctx, opts);
  doc.transact('BESTIRABLE', (tx) => tx.update('blocks', blockId, { dynamic: def, revision: block.revision + 1 }));
  return def;
}

/** Versión estirable de un paquete de biblioteca (se trabaja en un documento temporal). */
export function stretchablePackage(pkg: BlockPackage, opts: { heightName?: string } = {}): BlockPackage {
  const doc = createDocument();
  const ctx = createContext(doc);
  const name = importBlockPackage(doc, pkg);
  const block = doc.findByName('blocks', name)!;
  if (block.dynamic) return pkg;
  makeStretchable(doc, ctx, block.id, opts);
  return packageBlock(doc, block.id);
}
