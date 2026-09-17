import { describe, expect, it } from 'vitest';
import { insertBlock } from '../blocks/blockOps';
import type { CadDocument } from '../document/document';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, InsertEntity, LineEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { writePackage } from '../io/native';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import { attachXref, bindXref, detachXref, readXrefSource, reloadXref, unloadXref } from './xref';

function sourceDoc() {
  const src = createDocument({ title: 'Planta' });
  src.transact('seed', (tx) => {
    tx.add('layers', { id: 'lay-muros', name: 'Muros', color: 'aci:1', linetype: 'lt-continuous', lineweight: 50, transparency: 0, on: true, frozen: false, locked: false, plot: true, description: '', order: 1 });
    tx.addEntity<LineEntity>({ ...entityDefaults(src), layer: 'lay-muros', type: 'line', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } });
    tx.add('blocks', { id: 'blk-puerta', name: 'Puerta', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1 });
    tx.addEntity<CircleEntity>({ ...entityDefaults(src, 'blk-puerta'), type: 'circle', center: { x: 0, y: 0 }, radius: 50 });
    insertBlock(tx, src, 'blk-puerta', MODEL_SPACE_ID, { x: 500, y: 200 });
  });
  return src;
}

const bytesOf = (d: CadDocument) => writePackage(d.data, d.id);

describe('external references', () => {
  it('attaches a drawing as a definition with prefixed layers and nested blocks', () => {
    const src = sourceDoc();
    const host = createDocument();
    const ctx = createContext(host);
    const source = readXrefSource(bytesOf(src), 'planta.fmodel');
    const ins = host.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host, source, { fileName: 'planta.fmodel', path: 'planta.fmodel', mode: 'attach', source: 'file' });
      return insertBlock(tx, host, b.id, MODEL_SPACE_ID, { x: 10, y: 10 });
    });
    const block = host.data.blocks.get(ins.blockId)!;
    expect(block.kind).toBe('xref');
    expect(block.xref?.documentId).toBe(src.id);
    expect(host.findByName('layers', 'planta|Muros')).toBeTruthy();
    expect(host.findByName('blocks', 'planta|Puerta')).toBeTruthy();
    expect(host.entitiesOf(block.id).map((e) => e.type).sort()).toEqual(['insert', 'line']);
    const box = kindOf(ins).bbox(ins, ctx);
    expect(box.maxX).toBeCloseTo(1010);
    host.undo();
    expect(host.data.blocks.has(block.id)).toBe(false);
    expect(host.findByName('layers', 'planta|Muros')).toBeUndefined();
  });

  it('rejects circular references', () => {
    const host = sourceDoc();
    const source = readXrefSource(bytesOf(host), 'yo.fmodel');
    expect(() => host.transact('XATTACH', (tx) => attachXref(tx, host, source, { fileName: 'yo.fmodel', path: 'yo.fmodel', mode: 'attach', source: 'file' }))).toThrow(/circular/i);
  });

  it('reloads new content while keeping local layer changes; unload, detach and bind work', () => {
    const src = sourceDoc();
    const host = createDocument();
    const b = host.transact('XATTACH', (tx) => {
      const blk = attachXref(tx, host, readXrefSource(bytesOf(src), 'planta.fmodel'), { fileName: 'planta.fmodel', path: 'planta.fmodel', mode: 'overlay', source: 'file' });
      insertBlock(tx, host, blk.id, MODEL_SPACE_ID, { x: 0, y: 0 });
      return blk;
    });
    const muros = host.findByName('layers', 'planta|Muros')!;
    host.transact('LAYER', (tx) => tx.update('layers', muros.id, { color: 'aci:5', on: false }));
    src.transact('more', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(src), layer: 'lay-muros', type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: 800 } }));
    host.transact('XRELOAD', (tx) => reloadXref(tx, host, b.id, readXrefSource(bytesOf(src), 'planta.fmodel')));
    expect(host.entitiesOf(b.id).filter((e) => e.type === 'line')).toHaveLength(2);
    expect(host.data.layers.get(muros.id)).toMatchObject({ color: 'aci:5', on: false });
    expect(host.findByName('blocks', 'planta|Puerta')).toBeTruthy();

    host.transact('XUNLOAD', (tx) => unloadXref(tx, host, b.id));
    expect(host.entitiesOf(b.id)).toHaveLength(0);
    expect(host.data.blocks.get(b.id)!.xref!.status).toBe('unloaded');
    expect(host.findByName('blocks', 'planta|Puerta')).toBeUndefined();

    host.transact('XRELOAD', (tx) => reloadXref(tx, host, b.id, readXrefSource(bytesOf(src), 'planta.fmodel')));
    host.transact('XBIND', (tx) => bindXref(tx, host, b.id));
    expect(host.data.blocks.get(b.id)!.kind).toBe('normal');
    expect(host.findByName('layers', 'planta$0$Muros')).toBeTruthy();
    expect(host.findByName('blocks', 'planta$0$Puerta')).toBeTruthy();
    host.undo();

    host.transact('XDETACH', (tx) => detachXref(tx, host, b.id));
    expect(host.data.blocks.has(b.id)).toBe(false);
    expect(host.entitiesOf(MODEL_SPACE_ID).some((e) => e.type === 'insert' && (e as InsertEntity).blockId === b.id)).toBe(false);
    expect(host.findByName('layers', 'planta|Muros')).toBeUndefined();
  });

  it('does not carry overlays of the referenced drawing', () => {
    const inner = sourceDoc();
    const middle = createDocument();
    middle.transact('XATTACH', (tx) => {
      const blk = attachXref(tx, middle, readXrefSource(bytesOf(inner), 'inner.fmodel'), { fileName: 'inner.fmodel', path: 'inner.fmodel', mode: 'overlay', source: 'file' });
      insertBlock(tx, middle, blk.id, MODEL_SPACE_ID, { x: 0, y: 0 });
    });
    const host = createDocument();
    host.transact('XATTACH', (tx) => attachXref(tx, host, readXrefSource(bytesOf(middle), 'middle.fmodel'), { fileName: 'middle.fmodel', path: 'middle.fmodel', mode: 'attach', source: 'file' }));
    expect([...host.data.blocks.values()].some((b) => b.name.includes('inner'))).toBe(false);
  });

  it('keeps nested dynamic blocks working (ids inside definitions are remapped)', async () => {
    const { installDynamicSamples } = await import('../blocks/samples');
    const { installDynamicBlocks } = await import('../blocks/install');
    const src = createDocument();
    installDynamicSamples(src);
    const symbol = src.findByName('blocks', 'FM Símbolo eléctrico')!;
    src.transact('ins', (tx) => insertBlock(tx, src, symbol.id, MODEL_SPACE_ID, { x: 0, y: 0 }));
    const host = createDocument();
    const ctx = createContext(host);
    installDynamicBlocks(ctx);
    host.transact('XATTACH', (tx) => attachXref(tx, host, readXrefSource(bytesOf(src), 'muestras.fmodel'), { fileName: 'muestras.fmodel', path: 'muestras.fmodel', mode: 'attach', source: 'file' }));
    const nested = host.findByName('blocks', 'muestras|FM Símbolo eléctrico')!;
    const vis = nested.dynamic!.parameters.find((p) => p.type === 'visibility');
    const ids = new Set(host.entitiesOf(nested.id).map((e) => e.id));
    expect(vis && vis.type === 'visibility' && vis.states.every((st) => st.visible.every((id) => ids.has(id)))).toBe(true);
    // estado por defecto «Toma simple»: círculo y dos líneas (más el atributo)
    expect(ctx.evaluateBlock(nested.id).entities.filter((e) => e.type !== 'attdef')).toHaveLength(3);
  });
});
