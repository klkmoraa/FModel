import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CadDocument } from '../document/document';
import type { Id, InsertEntity, LineEntity } from '../document/types';
import { autoScaleFactor, blockUsage, createBlock, validateBlockName, wouldCreateCycle } from './blockOps';

const doc = () => createDocument();
const line = (d: CadDocument, id: string, x = 0) => d.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(d), id, order: 1, type: 'line', start: { x, y: 0 }, end: { x: x + 5, y: 0 } }));
const make = (d: CadDocument, name: string, ids: Id[], mode: 'convert' | 'delete' | 'retain' = 'convert') => d.transact('BLOCK', (tx) => createBlock(tx, d, { name, basePoint: { x: 0, y: 0 }, ids, mode }));

describe('nombres de bloque', () => {
  it('rechaza vacíos, caracteres no válidos, reservados y repetidos', () => {
    const d = doc();
    make(d, 'Puerta', [line(d, 'e1').id]);
    expect(validateBlockName(d, 'Ventana')).toBeNull();
    expect(validateBlockName(d, '  ')).toMatch(/vacío/);
    expect(validateBlockName(d, 'A|B')).toMatch(/válidos/);
    // el asterisco de los bloques anónimos entra en los caracteres prohibidos
    expect(validateBlockName(d, '*U1')).toMatch(/válidos/);
    expect(validateBlockName(d, 'puerta')).toMatch(/Puerta/);
    const puerta = [...d.data.blocks.values()].find((b) => b.name === 'Puerta')!;
    expect(validateBlockName(d, 'Puerta', puerta.id)).toBeNull();
  });
});

describe('creación', () => {
  it('«convertir» deja una inserción en lugar de los objetos', () => {
    const d = doc();
    const l = line(d, 'e1');
    const { block, insert } = make(d, 'Puerta', [l.id]);
    expect(d.entity('e1')).toBeUndefined();
    expect(insert?.blockId).toBe(block.id);
    expect(d.entitiesOf(block.id)).toHaveLength(1);
    expect(d.entitiesOf(block.id)[0].id).not.toBe('e1');
  });

  it('«conservar» mantiene los objetos y no inserta nada', () => {
    const d = doc();
    const l = line(d, 'e1');
    const { insert, block } = make(d, 'Marca', [l.id], 'retain');
    expect(insert).toBeUndefined();
    expect(d.entity('e1')).toBeTruthy();
    expect(d.entitiesOf(block.id)).toHaveLength(1);
  });

  it('«eliminar» quita los objetos sin dejar inserción', () => {
    const d = doc();
    const l = line(d, 'e1');
    const { insert } = make(d, 'Solo definición', [l.id], 'delete');
    expect(insert).toBeUndefined();
    expect(d.entity('e1')).toBeUndefined();
  });

  it('un nombre repetido no crea nada', () => {
    const d = doc();
    make(d, 'Puerta', [line(d, 'e1').id]);
    const antes = d.data.blocks.size;
    expect(() => make(d, 'Puerta', [line(d, 'e2').id])).toThrow(/Puerta/);
    expect(d.data.blocks.size).toBe(antes);
  });
});

describe('referencias circulares y uso', () => {
  it('detecta el ciclo directo e indirecto', () => {
    const d = doc();
    const { block: hijo } = make(d, 'Hijo', [line(d, 'e1').id]);
    const { block: padre } = make(d, 'Padre', [line(d, 'e2').id]);
    d.transact('INSERT', (tx) =>
      tx.addEntity<InsertEntity>({ ...entityDefaults(d), id: 'i1', order: 2, owner: padre.id, type: 'insert', blockId: hijo.id, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, attributes: [] }),
    );
    expect(wouldCreateCycle(d, hijo.id, hijo.id)).toBe(true);
    expect(wouldCreateCycle(d, hijo.id, padre.id)).toBe(true);
    expect(wouldCreateCycle(d, padre.id, hijo.id)).toBe(false);
  });

  it('cuenta las inserciones de cada definición', () => {
    const d = doc();
    const { block } = make(d, 'Puerta', [line(d, 'e1').id]);
    d.transact('INSERT', (tx) =>
      tx.addEntity<InsertEntity>({ ...entityDefaults(d), id: 'i2', order: 3, type: 'insert', blockId: block.id, position: { x: 9, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, attributes: [] }),
    );
    expect(blockUsage(d).get(block.id)).toBe(2);
  });
});

describe('unidades', () => {
  it('la inserción escala entre las unidades del bloque y las del dibujo', () => {
    const d = createDocument({ units: 'mm' });
    const { block } = make(d, 'Pieza', [line(d, 'e1').id]);
    expect(autoScaleFactor(d, { ...block, units: 'mm' })).toBeCloseTo(1);
    expect(autoScaleFactor(d, { ...block, units: 'cm' })).toBeCloseTo(10);
    expect(autoScaleFactor(d, { ...block, units: 'm' })).toBeCloseTo(1000);
    expect(autoScaleFactor(d, { ...block, units: 'unitless' })).toBe(1);
  });
});
