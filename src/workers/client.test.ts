import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { runHeavy } from './client';

describe('heavy operations client', () => {
  it('runs export, read and analysis with serializable results (inline when there is no Worker)', async () => {
    const doc = createDocument();
    doc.transact('seed', (tx) => {
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
      tx.addEntity<LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    });
    const exported = await runHeavy('exportDxf', { data: structuredClone(doc.data) });
    expect(exported.report.exported.LINE).toBe(2);
    const read = await runHeavy('readDxf', { text: exported.text });
    expect([...read.data.entities.values()].filter((e) => e.owner === MODEL_SPACE_ID)).toHaveLength(2);
    const report = await runHeavy('analyze', { data: structuredClone(doc.data) });
    expect(report.issues.some((i) => i.code === 'duplicate')).toBe(true);
    expect(() => structuredClone(report)).not.toThrow();
  });
});
