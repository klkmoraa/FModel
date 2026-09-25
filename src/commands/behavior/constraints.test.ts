import { beforeEach, describe, expect, it } from 'vitest';
import type { LineEntity, LwPolylineEntity } from '../../document/types';
import { parameterScope } from '../../constraints/drawing';
import { CommandHarness } from './harness';

/** Comportamiento de Comandos — Diseño paramétrico */
describe('Comportamiento de Comandos — Diseño paramétrico', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  const lines = () => [...h.doc.data.entities.values()].filter((e): e is LineEntity => e.type === 'line');
  const drawLine = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await h.run('LINE', [a, b, '']);
    return lines().at(-1)!;
  };
  const line = (id: string) => h.doc.entity(id) as LineEntity;

  it('GEOMCONSTRAINT paralela: el segundo tramo se adapta al primero y deshacer lo revierte', async () => {
    const a = await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    const b = await drawLine({ x: 0, y: 50 }, { x: 90, y: 70 });
    const res = await h.run('GEOMCONSTRAINT', ['Parallel', { x: 50, y: 0 }, { x: 45, y: 60 }]);
    expect(res.ok).toBe(true);
    expect(line(a.id)).toBe(a);
    const nb = line(b.id);
    expect(nb.end.y - nb.start.y).toBeCloseTo(0, 6);
    expect(h.doc.data.constraints.size).toBe(1);
    h.undo();
    expect(line(b.id)).toEqual(b);
    expect(h.doc.data.constraints.size).toBe(0);
  });

  it('GCCOINCIDENT une extremos y MOVE arrastra al objeto unido en un solo paso de deshacer', async () => {
    const a = await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    const b = await drawLine({ x: 103, y: 4 }, { x: 103, y: 80 });
    expect((await h.run('GCCOINCIDENT', [{ x: 98, y: 0 }, { x: 103, y: 6 }])).ok).toBe(true);
    expect(line(b.id).start.x).toBeCloseTo(100, 6);
    expect(line(b.id).start.y).toBeCloseTo(0, 6);
    h.select(a.id);
    expect((await h.run('MOVE', [{ x: 0, y: 0 }, { x: 0, y: 20 }])).ok).toBe(true);
    expect(line(a.id).end).toEqual({ x: 100, y: 20 });
    expect(line(b.id).start.y).toBeCloseTo(20, 6);
    h.undo();
    expect(line(a.id).end).toEqual({ x: 100, y: 0 });
    expect(line(b.id).start.y).toBeCloseTo(0, 6);
  });

  it('GEOMCONSTRAINT rechaza una restricción redundante sin dejar cambios', async () => {
    await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect((await h.run('GCHORIZONTAL', [{ x: 50, y: 0 }])).ok).toBe(true);
    const before = h.snapshot();
    const res = await h.run('GCHORIZONTAL', [{ x: 50, y: 0 }]);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/ya existe|already exists/);
    expect(h.doc.data.constraints.size).toBe(1);
    expect(h.diff(before, h.snapshot()).modifiedIds).toEqual([]);
  });

  it('DIMCONSTRAINT alineada con fórmula y PARAMEDIT cambian la geometría', async () => {
    const a = await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    let res = await h.run('DIMCONSTRAINT', ['Aligned', 'Object', { x: 50, y: 0 }, 'largo', '120']);
    expect(res.ok).toBe(true);
    expect(line(a.id).start).toEqual({ x: 0, y: 0 });
    expect(line(a.id).end.x).toBeCloseTo(120, 6);
    res = await h.run('PARAMEDIT', ['New', 'W', '150']);
    expect(res.ok).toBe(true);
    res = await h.run('PARAMEDIT', ['Edit', 'largo', 'W / 2 + 10']);
    expect(res.ok).toBe(true);
    expect(line(a.id).end.x).toBeCloseTo(85, 6);
    expect(parameterScope(h.doc.data).values.get('largo')).toBeCloseTo(85, 9);
    res = await h.run('PARAMEDIT', ['Edit', 'W', '-40']);
    expect(res.ok).toBe(false);
    expect(line(a.id).end.x).toBeCloseTo(85, 6);
  });

  it('DIMCONSTRAINT rechaza una fórmula con variables desconocidas', async () => {
    await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    const res = await h.run('DIMCONSTRAINT', ['Aligned', 'Object', { x: 50, y: 0 }, 'largo', 'fantasma * 2']);
    expect(res.ok).toBe(false);
    expect(h.doc.data.constraints.size).toBe(0);
  });

  it('AUTOCONSTRAIN restringe un rectángulo y DELCONSTRAINT lo libera', async () => {
    await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 40, y: 20 }]);
    const rect = [...h.doc.data.entities.values()].find((e): e is LwPolylineEntity => e.type === 'lwpolyline')!;
    h.select(rect.id);
    let res = await h.run('AUTOCONSTRAIN', ['']);
    expect(res.ok).toBe(true);
    const types = [...h.doc.data.constraints.values()].map((c) => c.type).sort();
    expect(types).toEqual(['horizontal', 'horizontal', 'vertical', 'vertical']);
    h.select(rect.id);
    res = await h.run('DELCONSTRAINT');
    expect(res.ok).toBe(true);
    expect(h.doc.data.constraints.size).toBe(0);
    expect(h.doc.entity(rect.id)).toEqual(rect);
  });

  it('cancelar a mitad de GEOMCONSTRAINT no deja restricciones ni cambios', async () => {
    await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    const before = h.snapshot();
    const run = h.runner.execute('GEOMCONSTRAINT');
    await Promise.resolve();
    h.runner.submitText('Parallel');
    await Promise.resolve();
    await Promise.resolve();
    h.runner.cancel();
    await run;
    expect(h.doc.data.constraints.size).toBe(0);
    expect(h.diff(before, h.snapshot()).modifiedIds).toEqual([]);
    expect(h.doc.activeTransaction).toBeNull();
  });

  it('CONSTRAINTBAR y CONSTRAINTINFER alternan sus preferencias; con inferencia, LINE crea la unión', async () => {
    const shown = h.editor.prefs.constraintBar;
    await h.run('CONSTRAINTBAR');
    expect(h.editor.prefs.constraintBar).toBe(!shown);
    await h.run('CONSTRAINTBAR', [], ['show']);
    expect(h.editor.prefs.constraintBar).toBe(true);
    await h.run('CONSTRAINTINFER', [], ['on']);
    try {
      await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
      await drawLine({ x: 100, y: 0 }, { x: 100, y: 60 });
      const types = [...h.doc.data.constraints.values()].map((c) => c.type);
      expect(types).toContain('coincident');
      expect(types.filter((t) => t === 'horizontal' || t === 'vertical')).toHaveLength(2);
    } finally {
      await h.run('CONSTRAINTINFER', [], ['off']);
    }
    expect(h.editor.prefs.inferConstraints).toBe(false);
  });

  it('PARAMEDIT guarda y aplica variantes', async () => {
    const a = await drawLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    await h.run('GCFIX', [{ x: 1, y: 0 }]);
    await h.run('DIMCONSTRAINT', ['Aligned', 'Object', { x: 50, y: 0 }, 'largo', '100']);
    expect((await h.run('PARAMEDIT', ['Variant', 'Save', 'Corta'])).ok).toBe(true);
    await h.run('PARAMEDIT', ['Edit', 'largo', '300']);
    expect(line(a.id).end.x).toBeCloseTo(300, 6);
    expect((await h.run('PARAMEDIT', ['Variant', 'Apply', 'Corta'])).ok).toBe(true);
    expect(line(a.id).end.x).toBeCloseTo(100, 6);
    expect(line(a.id).start).toEqual({ x: 0, y: 0 });
  });
});
