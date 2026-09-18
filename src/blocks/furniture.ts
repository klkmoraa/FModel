import type { Vec2 } from '../geometry/vec';
import { createDocument, entityDefaults, LAYER0_ID } from '../document/defaults';
import { newId } from '../document/ids';
import type { ArrayAction, BlockRecord, Entity, Id, LinearParam, ValueSet } from '../document/types';
import { createContext } from '../model/context';
import type { LibraryBlock } from './library';
import { makeLibraryBlock, packageBlock } from './library';
import { stretchableDefinition } from './stretchable';

/**
 * Muebles paramétricos propios (planta, milímetros). Todos se estiran con Ancho y Fondo/Largo
 * (`stretchableDefinition`); los que repiten piezas —hojas de clóset, sillas de la mesa— las
 * añaden con una acción de matriz sobre el Ancho/Largo, así un clóset de 1800 tiene tres hojas
 * de 600 y al alargarlo a 2400 pasa a cuatro.
 */

type Geom = Omit<Entity, 'id' | 'order' | keyof ReturnType<typeof entityDefaults>> & { type: Entity['type'] };

const rect = (x0: number, y0: number, x1: number, y1: number): Geom => ({ type: 'lwpolyline', closed: true, vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] }) as Geom;
const line = (a: Vec2, b: Vec2): Geom => ({ type: 'line', start: a, end: b }) as Geom;
const circle = (c: Vec2, r: number): Geom => ({ type: 'circle', center: c, radius: r }) as Geom;
const arc = (c: Vec2, r: number, a0: number, a1: number): Geom => ({ type: 'arc', center: c, radius: r, startAngle: a0, endAngle: a1 }) as Geom;

interface Spec {
  name: string;
  category: string;
  description: string;
  /** piezas fijas (se estiran o trasladan) */
  parts: Geom[];
  /** pieza que se repite a lo largo del ancho: se excluye del estiramiento */
  repeat?: { parts: Geom[]; every: number };
  depthName?: string;
  widthSet?: ValueSet;
  depthSet?: ValueSet;
}

function build(spec: Spec): LibraryBlock {
  const doc = createDocument({ units: 'mm' });
  const ctx = createContext(doc);
  const blockId = newId('blk');
  const fixed: Id[] = [];
  const repeated: Id[] = [];
  doc.transact('FURNITURE', (tx) => {
    const block: BlockRecord = { id: blockId, name: spec.name, kind: 'normal', basePoint: { x: 0, y: 0 }, description: spec.description, units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1 };
    tx.add('blocks', block);
    const base = { ...entityDefaults(doc, blockId), layer: LAYER0_ID, color: 'ByBlock' as const, linetype: 'ByBlock', lineweight: -2 };
    for (const g of spec.parts) fixed.push(tx.addEntity({ ...base, ...g } as never).id);
    for (const g of spec.repeat?.parts ?? []) repeated.push(tx.addEntity({ ...base, ...g } as never).id);
  });
  const block = doc.data.blocks.get(blockId)!;
  // Ancho y Fondo se miden con las piezas fijas; las repetidas se copian con la matriz y solo
  // se trasladan con el Fondo (p. ej. las sillas del lado opuesto)
  const def = stretchableDefinition(block, doc.entitiesOf(blockId).filter((e) => fixed.includes(e.id)), ctx, { heightName: spec.depthName });
  const [width, depth] = def.parameters as LinearParam[];
  if (spec.widthSet) width.valueSet = spec.widthSet;
  if (spec.depthSet && depth) depth.valueSet = spec.depthSet;
  if (spec.repeat) {
    for (const a of def.actions) if (depth && a.paramId === depth.id) a.selection = [...a.selection, ...repeated];
    const arr: ArrayAction = { id: newId('act'), type: 'array', name: 'Repetir', paramId: width.id, selection: repeated, columnOffset: spec.repeat.every, rowOffset: 0 };
    def.actions.push(arr);
  }
  doc.transact('FURNITURE DYN', (tx) => tx.update('blocks', blockId, { dynamic: def }));
  return makeLibraryBlock(packageBlock(doc, blockId), { name: spec.name, categoryId: spec.category, tags: ['FModel', 'paramétrico'], description: spec.description, source: { kind: 'fmodel', importedAt: Date.now() } });
}

const inc = (increment: number, min: number, max: number): ValueSet => ({ kind: 'increment', increment, min, max });
const PI = Math.PI;

/** Los doce muebles paramétricos de la biblioteca inicial. */
export function furnitureLibrary(): LibraryBlock[] {
  const chair = (x: number, y: number, back: 'up' | 'down'): Geom[] => {
    const b = back === 'up' ? [line({ x, y: y + 420 }, { x: x + 450, y: y + 420 })] : [line({ x, y: y + 30 }, { x: x + 450, y: y + 30 })];
    return [rect(x, y, x + 450, y + 450), ...b];
  };
  return [
    build({
      name: 'Clóset de correderas',
      category: 'cat-mob-dormitorio',
      description: 'Hojas correderas de 600 que se añaden al alargarlo; barra de colgar.',
      parts: [rect(0, 0, 1800, 600), line({ x: 50, y: 300 }, { x: 1750, y: 300 })],
      repeat: { parts: [rect(0, 20, 600, 45)], every: 600 },
      widthSet: inc(600, 1200, 4800),
      depthSet: inc(10, 450, 800),
    }),
    build({
      name: 'Clóset de puertas batientes',
      category: 'cat-mob-dormitorio',
      description: 'Puertas de 500 con su giro, que se añaden al alargarlo.',
      parts: [rect(0, 0, 1500, 600), line({ x: 50, y: 300 }, { x: 1450, y: 300 })],
      repeat: { parts: [line({ x: 0, y: 0 }, { x: 0, y: -500 }), arc({ x: 0, y: 0 }, 500, -PI / 2, 0)], every: 500 },
      widthSet: inc(500, 1000, 4000),
      depthSet: inc(10, 450, 800),
    }),
    build({
      name: 'Estantería',
      category: 'cat-mob-salon',
      description: 'Estantería en planta con fondo de 350.',
      parts: [rect(0, 0, 1000, 350), line({ x: 20, y: 20 }, { x: 980, y: 20 })],
      widthSet: inc(50, 400, 3000),
      depthSet: inc(10, 250, 600),
    }),
    build({
      name: 'Escritorio',
      category: 'cat-mob-oficina',
      description: 'Escritorio con cajonera a la derecha.',
      parts: [rect(0, 0, 1400, 700), rect(1000, 20, 1380, 480)],
      widthSet: inc(50, 800, 2400),
      depthSet: inc(10, 500, 900),
    }),
    build({
      name: 'Cama',
      category: 'cat-mob-dormitorio',
      description: 'Anchos estándar de colchón; largo de 1900 a 2200.',
      parts: [rect(0, 0, 1500, 2000), rect(100, 1650, 700, 1950), rect(800, 1650, 1400, 1950), line({ x: 0, y: 1500 }, { x: 1500, y: 1500 })],
      depthName: 'Largo',
      widthSet: { kind: 'list', list: [900, 1050, 1350, 1500, 1800, 2000] },
      depthSet: inc(100, 1900, 2200),
    }),
    build({
      name: 'Mesa de comedor con sillas',
      category: 'cat-mob-salon',
      description: 'Una silla a cada lado cada 600 de largo.',
      parts: [rect(0, 0, 1600, 900)],
      repeat: { parts: [...chair(75, 950, 'up'), ...chair(75, -500, 'down')], every: 600 },
      depthName: 'Ancho de mesa',
      widthSet: inc(100, 1200, 4000),
      depthSet: inc(50, 700, 1200),
    }),
    build({
      name: 'Sofá paramétrico',
      category: 'cat-mob-salon',
      description: 'Respaldo, brazos y cojines; se alarga sin deformar los brazos.',
      parts: [rect(0, 0, 2000, 900), rect(0, 700, 2000, 900), rect(0, 0, 200, 700), rect(1800, 0, 2000, 700), line({ x: 1000, y: 50 }, { x: 1000, y: 700 })],
      widthSet: inc(50, 1200, 4000),
      depthSet: inc(10, 750, 1100),
    }),
    build({
      name: 'Módulo bajo de cocina',
      category: 'cat-mob-cocina',
      description: 'Anchos de 150 en 150; frente marcado.',
      parts: [rect(0, 0, 600, 600), line({ x: 0, y: 30 }, { x: 600, y: 30 })],
      widthSet: inc(150, 300, 1200),
      depthSet: inc(10, 500, 650),
    }),
    build({
      name: 'Módulo alto de cocina',
      category: 'cat-mob-cocina',
      description: 'Fondo reducido de 350.',
      parts: [rect(0, 0, 600, 350), line({ x: 0, y: 0 }, { x: 600, y: 350 }), line({ x: 0, y: 350 }, { x: 600, y: 0 })],
      widthSet: inc(150, 300, 1200),
      depthSet: inc(10, 300, 450),
    }),
    build({
      name: 'Encimera paramétrica',
      category: 'cat-mob-cocina',
      description: 'Encimera con canto frontal.',
      parts: [rect(0, 0, 2400, 600), line({ x: 0, y: 40 }, { x: 2400, y: 40 })],
      widthSet: inc(10, 600, 6000),
      depthSet: inc(10, 400, 900),
    }),
    build({
      name: 'Tocador paramétrico',
      category: 'cat-mob-dormitorio',
      description: 'Tocador con espejo al fondo.',
      parts: [rect(0, 0, 1200, 500), line({ x: 100, y: 470 }, { x: 1100, y: 470 })],
      widthSet: inc(50, 600, 2000),
      depthSet: inc(10, 350, 600),
    }),
    build({
      name: 'Mesita de noche paramétrica',
      category: 'cat-mob-dormitorio',
      description: 'Con tirador; se ensancha sin deformarlo.',
      parts: [rect(0, 0, 500, 400), circle({ x: 250, y: 60 }, 15)],
      widthSet: inc(10, 350, 800),
      depthSet: inc(10, 300, 550),
    }),
  ];
}
