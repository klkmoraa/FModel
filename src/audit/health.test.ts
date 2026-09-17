import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type { CircleEntity, LineEntity, LwPolylineEntity, TextEntity } from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { readPackage, writePackage } from '../io/native';
import { createContext } from '../model/context';
import { compareDrawings } from './compare';
import { analyzeDrawing, applyHealthFixes } from './health';

function messyDocument() {
  const doc = createDocument();
  doc.transact('seed', (tx) => {
    const d = entityDefaults(doc);
    tx.addEntity<LineEntity>({ ...d, type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    tx.addEntity<LineEntity>({ ...d, type: 'line', start: { x: 10, y: 0 }, end: { x: 0, y: 0 } });
    tx.addEntity<LineEntity>({ ...d, type: 'line', start: { x: 5, y: 5 }, end: { x: 5, y: 5 } });
    tx.addEntity<LwPolylineEntity>({ ...d, type: 'lwpolyline', closed: false, vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }] });
    tx.addEntity<LwPolylineEntity>({ ...d, type: 'lwpolyline', closed: true, vertices: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }] });
    tx.addEntity<CircleEntity>({ ...d, layer: 'capa-borrada', type: 'circle', center: { x: 0, y: 0 }, radius: 3 });
    tx.addEntity<TextEntity>({ ...d, type: 'text', text: 'x', position: { x: 0, y: 0 }, height: 0, rotation: 0, widthFactor: 1, oblique: 0, style: 'estilo-borrado', halign: 'left', valign: 'baseline' });
    tx.add('groups', { id: 'g1', name: 'Roto', description: '', members: ['no-existe'], selectable: true });
  });
  return doc;
}

describe('drawing health', () => {
  it('detects duplicates, zero-length, near-closed and self-intersecting polylines, and broken references', () => {
    const doc = messyDocument();
    const rep = analyzeDrawing(doc, createContext(doc));
    const codes = new Set(rep.issues.map((i) => i.code));
    for (const c of ['duplicate', 'zero-length', 'near-closed-polyline', 'self-intersection', 'missing-layer', 'missing-style', 'text-height', 'broken-group'] as const) expect(codes.has(c), c).toBe(true);
    expect(rep.score).toBeLessThan(100);
    expect(rep.counts.geometry).toBeGreaterThan(0);
  });

  it('AUDIT fixes what is safe and a second pass is clean of fixable issues', () => {
    const doc = messyDocument();
    const ctx = createContext(doc);
    const before = analyzeDrawing(doc, ctx);
    const fixes = doc.transact('AUDIT', (tx) => applyHealthFixes(tx, doc, before));
    expect(fixes).toBeGreaterThanOrEqual(6);
    const after = analyzeDrawing(doc, ctx);
    expect(after.issues.filter((i) => i.fixable)).toEqual([]);
    expect(after.issues.some((i) => i.code === 'self-intersection')).toBe(true);
    const poly = doc.entitiesOf(MODEL_SPACE_ID).find((e): e is LwPolylineEntity => e.type === 'lwpolyline' && e.vertices.length === 3);
    expect(poly?.closed).toBe(true);
    doc.undo();
    expect(analyzeDrawing(doc, ctx).issues.length).toBe(before.issues.length);
  });
});

describe('version compare', () => {
  it('reports added, removed and modified objects and table changes, ignoring draw order', () => {
    const doc = messyDocument();
    const base = readPackage(writePackage(doc.data, doc.id)).data;
    const [first, second] = doc.entitiesOf(MODEL_SPACE_ID);
    doc.transact('edit', (tx) => {
      tx.removeEntity(first.id);
      tx.updateEntity<LineEntity>(second.id, { end: { x: 20, y: 0 } });
      tx.addEntity<CircleEntity>({ ...entityDefaults(doc), type: 'circle', center: { x: 50, y: 50 }, radius: 5 });
      tx.add('layers', { id: 'nueva', name: 'Nueva', color: 'aci:2', linetype: 'lt-continuous', lineweight: -3, transparency: 0, on: true, frozen: false, locked: false, plot: true, description: '', order: 9 });
    });
    const third = doc.entitiesOf(MODEL_SPACE_ID)[2];
    doc.transact('order', (tx) => tx.updateEntity(third.id, { order: 999 }));
    const diff = compareDrawings(base, doc.data);
    expect(diff.removed.map((e) => e.id)).toEqual([first.id]);
    expect(diff.modified.map((m) => m.id)).toEqual([second.id]);
    expect(diff.added).toHaveLength(1);
    expect(diff.records.layers).toEqual({ added: 1, removed: 0, modified: 0 });
  });
});
