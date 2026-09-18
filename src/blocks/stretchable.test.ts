import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, Entity, LinearParam, LwPolylineEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import { createBlock } from './blockOps';
import { installDynamicBlocks } from './install';
import { cutPosition, makeStretchable, niceIncrement, stretchablePackage } from './stretchable';
import { packageBlock } from './library';

/** Armario 1800 × 600: contorno, tirador a la izquierda y otro a la derecha. */
function closet() {
  const doc = createDocument();
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  const d = entityDefaults(doc);
  let ids: string[] = [];
  doc.transact('seed', (tx) => {
    const r = tx.addEntity<LwPolylineEntity>({ ...d, type: 'lwpolyline', closed: true, vertices: [{ x: 0, y: 0 }, { x: 1800, y: 0 }, { x: 1800, y: 600 }, { x: 0, y: 600 }] });
    const a = tx.addEntity<CircleEntity>({ ...d, type: 'circle', center: { x: 300, y: 300 }, radius: 20 });
    const b = tx.addEntity<CircleEntity>({ ...d, type: 'circle', center: { x: 1500, y: 300 }, radius: 20 });
    ids = [r.id, a.id, b.id];
  });
  let blockId = '';
  doc.transact('block', (tx) => (blockId = createBlock(tx, doc, { name: 'Armario', basePoint: { x: 0, y: 0 }, ids, units: 'mm', mode: 'retain' }).block.id));
  return { doc, ctx, blockId };
}

const extent = (ents: Entity[], ctx: ReturnType<typeof createContext>) => {
  const bs = ents.map((e) => kindOf(e).bbox(e, ctx));
  return { w: Math.max(...bs.map((b) => b.maxX)) - Math.min(...bs.map((b) => b.minX)), h: Math.max(...bs.map((b) => b.maxY)) - Math.min(...bs.map((b) => b.minY)) };
};

describe('hacer estirable', () => {
  it('Ancho y Fondo estiran el bloque exactamente y no deforman lo que no cruza el corte', () => {
    const { doc, ctx, blockId } = closet();
    const def = makeStretchable(doc, ctx, blockId);
    const [ancho, fondo] = def.parameters as LinearParam[];
    expect([ancho.name, fondo.name]).toEqual(['Ancho', 'Fondo']);
    expect(ancho.valueSet).toMatchObject({ kind: 'increment', increment: 10, min: 540, max: 7200 });
    const ev = ctx.evaluateBlock(blockId, { values: { [ancho.id]: 3600, [fondo.id]: 900 } }).entities;
    expect(extent(ev, ctx)).toEqual({ w: 3600, h: 900 });
    const circles = ev.filter((e): e is CircleEntity => e.type === 'circle').map((c) => c.center.x).sort((a, b) => a - b);
    expect(circles).toEqual([300, 3300]);
    expect(ev.filter((e): e is CircleEntity => e.type === 'circle').every((c) => c.radius === 20)).toBe(true);
  });

  it('respeta el conjunto de valores (mínimo)', () => {
    const { doc, ctx, blockId } = closet();
    const def = makeStretchable(doc, ctx, blockId);
    const ev = ctx.evaluateBlock(blockId, { values: { [def.parameters[0].id]: 10 } }).entities;
    expect(extent(ev, ctx).w).toBe(540);
  });

  it('un bloque ya dinámico se rechaza', () => {
    const { doc, ctx, blockId } = closet();
    makeStretchable(doc, ctx, blockId);
    expect(() => makeStretchable(doc, ctx, blockId)).toThrow(/ya es dinámico/);
  });

  it('el corte evita atravesar piezas y el incremento depende de las unidades', () => {
    const b = (minX: number, maxX: number) => ({ minX, maxX, minY: 0, maxY: 1 });
    // una pieza centrada en 40–60: el corte va a su borde (40), no por su centro
    expect(cutPosition([b(0, 100), b(40, 60)], 0, 100, 'x')).toBeCloseTo(40, 6);
    expect(niceIncrement(1234, 'cm')).toBe(1);
    expect(niceIncrement(137, 'unitless')).toBe(1);
    expect(niceIncrement(13.1, 'unitless')).toBe(0.1);
  });

  it('paquetes de biblioteca: la versión estirable conserva la geometría por defecto', () => {
    const { doc, blockId } = closet();
    const pkg = stretchablePackage(packageBlock(doc, blockId));
    const root = pkg.blocks.find((x) => x.id === pkg.root)!;
    expect(root.dynamic?.parameters.map((p) => p.name)).toEqual(['Ancho', 'Fondo']);
    expect(pkg.entities.length).toBe(3);
    void MODEL_SPACE_ID;
  });
});
