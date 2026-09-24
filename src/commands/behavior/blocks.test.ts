import { describe, expect, it } from 'vitest';
import { entityDefaults, TEXTSTYLE_STANDARD_ID } from '../../document/defaults';
import type { AttdefEntity, InsertEntity } from '../../document/types';
import { CommandHarness } from './harness';

function seedAttributedInsert(h: CommandHarness): InsertEntity {
  return h.doc.transact('seed attributed block', (tx) => {
    tx.add('blocks', {
      id: 'block-attributes', name: 'Attributes', kind: 'normal', basePoint: { x: 0, y: 0 },
      description: '', units: 'mm', explodable: true, scaleUniformly: false,
      annotative: false, revision: 1,
    });
    for (const [index, tag] of ['FIRST', 'SECOND'].entries()) {
      tx.addEntity<AttdefEntity>({
        ...entityDefaults(h.doc, 'block-attributes'), type: 'attdef', tag, prompt: tag,
        defaultValue: `old-${index}`, position: { x: index * 10, y: 0 }, height: 2,
        rotation: 0, style: TEXTSTYLE_STANDARD_ID, halign: 'left', valign: 'baseline',
        invisible: false, constant: false, verify: false, preset: false,
        lockPosition: false, multiline: false,
      });
    }
    return tx.addEntity<InsertEntity>({
      ...entityDefaults(h.doc), type: 'insert', blockId: 'block-attributes',
      position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0,
      attributes: [{ tag: 'FIRST', value: 'old-0' }, { tag: 'SECOND', value: 'old-1' }],
    });
  });
}

async function pendingString(h: CommandHarness): Promise<void> {
  for (let i = 0; i < 10 && h.runner.pending?.req.kind !== 'string'; i++) await Promise.resolve();
  expect(h.runner.pending?.req.kind).toBe('string');
}

describe('ATTEDIT', () => {
  it('edita atributos de forma atómica y conserva los valores anteriores para undo/redo', async () => {
    const h = new CommandHarness();
    const insert = seedAttributedInsert(h);
    const original = h.doc.entity(insert.id) as InsertEntity;
    const run = h.runner.execute('ATTEDIT');
    h.runner.submitEntity(insert.id, { x: 0, y: 0 });
    await pendingString(h);
    h.runner.submitText('new-first');
    await pendingString(h);
    h.runner.submitText('new-second');
    await run;

    expect(original.attributes.map((a) => a.value)).toEqual(['old-0', 'old-1']);
    expect((h.doc.entity(insert.id) as InsertEntity).attributes.map((a) => a.value)).toEqual(['new-first', 'new-second']);
    expect(h.undo()).toBeTruthy();
    expect((h.doc.entity(insert.id) as InsertEntity).attributes.map((a) => a.value)).toEqual(['old-0', 'old-1']);
    expect(h.redo()).toBeTruthy();
    expect((h.doc.entity(insert.id) as InsertEntity).attributes.map((a) => a.value)).toEqual(['new-first', 'new-second']);
  });

  it('cancela sin alterar el documento tras responder solo el primer atributo', async () => {
    const h = new CommandHarness();
    const insert = seedAttributedInsert(h);
    const original = h.doc.entity(insert.id);
    const run = h.runner.execute('ATTEDIT');
    h.runner.submitEntity(insert.id, { x: 0, y: 0 });
    await pendingString(h);
    h.runner.submitText('new-first');
    await pendingString(h);
    h.runner.cancel();
    await run;

    expect(h.doc.entity(insert.id)).toBe(original);
    expect((h.doc.entity(insert.id) as InsertEntity).attributes.map((a) => a.value)).toEqual(['old-0', 'old-1']);
  });
});

describe('ATTSYNC', () => {
  it('conserva las modificaciones de instancia de los atributos existentes', async () => {
    const h = new CommandHarness();
    const insert = seedAttributedInsert(h);
    h.doc.transact('attribute overrides', (tx) => tx.updateEntity<InsertEntity>(insert.id, {
      attributes: [
        { tag: 'first', value: 'custom', position: { x: 15, y: 25 }, height: 4, rotation: 0.5, invisible: true },
        { tag: 'STALE', value: 'removed' },
      ],
    }));
    const originalPosition = (h.doc.entity(insert.id) as InsertEntity).attributes[0].position;

    const result = await h.run('ATTSYNC', ['Attributes']);
    const synced = (h.doc.entity(insert.id) as InsertEntity).attributes;
    expect(result.ok).toBe(true);
    expect(synced).toEqual([
      { tag: 'FIRST', value: 'custom', position: { x: 15, y: 25 }, height: 4, rotation: 0.5, invisible: true },
      { tag: 'SECOND', value: 'old-1' },
    ]);
    expect(synced[0].position).not.toBe(originalPosition);
    expect(h.undo()).toBeTruthy();
    expect((h.doc.entity(insert.id) as InsertEntity).attributes[0].tag).toBe('first');
    expect(h.redo()).toBeTruthy();
    expect((h.doc.entity(insert.id) as InsertEntity).attributes).toEqual(synced);
  });
});
