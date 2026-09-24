import { describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { InsertEntity, LineEntity, TextEntity } from '../document/types';
import { createContext } from '../model/context';
import type { DrawSink, TraverseEnv } from './traverse';
import { displayItems, drawEntity } from './traverse';

describe('block drawing state', () => {
  it('restores the sink transform when a nested entity fails to draw', () => {
    const doc = createDocument();
    let insert!: InsertEntity;
    doc.transact('block', (tx) => {
      tx.add('blocks', {
        id: 'block', name: 'Block', kind: 'normal', basePoint: { x: 0, y: 0 },
        description: '', units: 'mm', explodable: true, scaleUniformly: false,
        annotative: false, revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, 'block'), type: 'line',
        start: { x: 0, y: 0 }, end: { x: 10, y: 0 },
      });
      insert = tx.addEntity<InsertEntity>({
        ...entityDefaults(doc), type: 'insert', blockId: 'block',
        position: { x: 20, y: 20 }, scale: { x: 1, y: 1 }, rotation: 0,
        attributes: [],
      });
    });
    const ctx = createContext(doc);
    const env: TraverseEnv = {
      doc, ctx, dark: false, background: '#ffffff', plotting: false,
      plotStyle: 'color', viewport: null, dashScale: 1,
    };
    const sink = {
      save: vi.fn(), restore: vi.fn(), transform: vi.fn(), clip: vi.fn(),
      stroke: vi.fn(() => { throw new Error('falló trazo'); }),
      fill: vi.fn(), text: vi.fn(), image: vi.fn(), point: vi.fn(),
      wipeout: vi.fn(), infinite: vi.fn(),
    } as unknown as DrawSink;

    expect(() => drawEntity(sink, env, insert, null)).toThrow('falló trazo');
    expect(sink.stroke).toHaveBeenCalled();
    expect(sink.save).toHaveBeenCalledTimes(1);
    expect(sink.restore).toHaveBeenCalledTimes(1);
    ctx.dispose();
  });
});

describe('display item field cache', () => {
  it('refreshes sheet, filename, referenced entity and clock fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z'));
    const doc = createDocument();
    let line!: LineEntity;
    let label!: TextEntity;
    doc.transact('field text', (tx) => {
      line = tx.addEntity<LineEntity>({
        ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 },
      });
      label = tx.addEntity<TextEntity>({
        ...entityDefaults(doc), type: 'text', text: `{{sheet}} / {{filename}} / {{entity:${line.id}.length}} / {{date:iso}}`,
        position: { x: 0, y: 0 }, height: 2.5, rotation: 0, widthFactor: 1, oblique: 0,
        style: [...doc.data.textStyles.keys()][0], halign: 'left', valign: 'baseline',
      });
    });
    const ctx = createContext(doc);
    try {
      ctx.sheetName = 'Planta A';
      ctx.fileName = 'A.fmodel';
      expect(displayItems(label, ctx)[0]).toMatchObject({ k: 'text', text: expect.stringContaining('Planta A / A.fmodel') });

      ctx.sheetName = 'Planta B';
      expect(displayItems(label, ctx)[0]).toMatchObject({ k: 'text', text: expect.stringContaining('Planta B / A.fmodel') });

      ctx.fileName = 'B.fmodel';
      expect(displayItems(label, ctx)[0]).toMatchObject({ k: 'text', text: expect.stringContaining('Planta B / B.fmodel') });

      doc.transact('change referenced line', (tx) => tx.update('entities', line.id, { end: { x: 20, y: 0 } }));
      expect(displayItems(label, ctx)[0]).toMatchObject({ k: 'text', text: expect.stringContaining('/ 20.00 /') });

      vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
      expect(displayItems(label, ctx)[0]).toMatchObject({ k: 'text', text: expect.stringContaining('2026-09-24') });
    } finally {
      ctx.dispose();
      vi.useRealTimers();
    }
  });
});
