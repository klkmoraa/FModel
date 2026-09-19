import { beforeEach, describe, expect, it } from 'vitest';
import type { ArcEntity, CircleEntity, LineEntity, LwPolylineEntity } from '../../document/types';
import { CommandHarness } from './harness';

describe('Comportamiento de Comandos — Modificación (CMD-001)', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  it('ERASE y OOPS: borra la selección y recupera las entidades borradas', async () => {
    // Dibujar línea y círculo
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    await h.run('CIRCLE', [{ x: 20, y: 20 }, '5']);

    const s0 = h.snapshot();
    expect(s0.entityCount).toBe(2);

    const circle = [...s0.entities.values()].find((e) => e.type === 'circle')!;
    h.select(circle.id);

    // Borrar círculo
    const resErase = await h.run('ERASE');
    expect(resErase.ok).toBe(true);
    expect(h.snapshot().entityCount).toBe(1);
    expect(h.doc.entity(circle.id)).toBeUndefined();

    // Recuperar con OOPS
    const resOops = await h.run('OOPS');
    expect(resOops.ok).toBe(true);
    expect(h.snapshot().entityCount).toBe(2);
    expect(h.doc.entity(circle.id)).toBeDefined();

    // Deshacer recupera estado previo
    h.undo();
    expect(h.snapshot().entityCount).toBe(1);
  });

  it('MOVE: traslada entidades de forma atómica y precisa', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 10 }, '']);
    const line = [...h.snapshot().entities.values()].find((e): e is LineEntity => e.type === 'line')!;

    h.select(line.id);
    const res = await h.run('MOVE', [{ x: 0, y: 0 }, { x: 5, y: 15 }]);
    expect(res.ok).toBe(true);

    const moved = h.doc.entity(line.id) as LineEntity;
    expect(moved.start).toEqual({ x: 5, y: 15 });
    expect(moved.end).toEqual({ x: 15, y: 25 });

    // Deshacer revierte la traslación
    h.undo();
    const undone = h.doc.entity(line.id) as LineEntity;
    expect(undone.start).toEqual({ x: 0, y: 0 });
  });

  it('COPY: crea duplicados preservando la entidad de origen', async () => {
    await h.run('CIRCLE', [{ x: 0, y: 0 }, '5']);
    const circle = [...h.snapshot().entities.values()].find((e) => e.type === 'circle')!;

    h.select(circle.id);
    const res = await h.run('COPY', [{ x: 0, y: 0 }, { x: 0, y: 25 }, '']);
    expect(res.ok).toBe(true);

    const s = h.snapshot();
    expect(s.entityCount).toBe(2);
    const copies = [...s.entities.values()].filter((e): e is CircleEntity => e.type === 'circle');
    expect(copies.some((c) => c.center.y === 25)).toBe(true);
  });

  it('ROTATE: gira entidades alrededor de un punto base', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const line = [...h.snapshot().entities.values()].find((e): e is LineEntity => e.type === 'line')!;

    h.select(line.id);
    const res = await h.run('ROTATE', [{ x: 0, y: 0 }, '90']);
    expect(res.ok).toBe(true);

    const rotated = h.doc.entity(line.id) as LineEntity;
    expect(rotated.end.x).toBeCloseTo(0, 2);
    expect(rotated.end.y).toBeCloseTo(10, 2);
  });

  it('SCALE: escala entidades respecto a un punto base', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const line = [...h.snapshot().entities.values()].find((e): e is LineEntity => e.type === 'line')!;

    h.select(line.id);
    const res = await h.run('SCALE', [{ x: 0, y: 0 }, '2']);
    expect(res.ok).toBe(true);

    const scaled = h.doc.entity(line.id) as LineEntity;
    expect(scaled.end.x).toBeCloseTo(20, 2);
  });

  it('MIRROR: simetría respecto a un eje conservando o borrando origen', async () => {
    await h.run('LINE', [{ x: 5, y: 0 }, { x: 15, y: 0 }, '']);
    const line = [...h.snapshot().entities.values()].find((e): e is LineEntity => e.type === 'line')!;

    h.select(line.id);
    // Eje vertical en X=0 (desde 0,0 a 0,10), opción N (no borrar origen)
    const res = await h.run('MIRROR', [{ x: 0, y: 0 }, { x: 0, y: 10 }, 'N']);
    expect(res.ok).toBe(true);

    const s = h.snapshot();
    expect(s.entityCount).toBe(2);
    const lines = [...s.entities.values()].filter((e): e is LineEntity => e.type === 'line');
    expect(lines.some((l) => l.start.x === -5 && l.end.x === -15)).toBe(true);
  });

  it('FILLET: empalma dos líneas creando arco de radio configurado', async () => {
    // Línea horizontal y línea vertical que se cortan en (10, 0)
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    await h.run('LINE', [{ x: 10, y: 0 }, { x: 10, y: 10 }, '']);

    const res = await h.run('FILLET', ['R', '3', { x: 5, y: 0 }, { x: 10, y: 5 }]);
    expect(res.ok).toBe(true);

    const arcs = [...h.snapshot().entities.values()].filter((e): e is ArcEntity => e.type === 'arc');
    expect(arcs).toHaveLength(1);
    expect(arcs[0].radius).toBeCloseTo(3);
  });

  it('EXPLODE: descompone polilíneas en segmentos individuales', async () => {
    await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 20, y: 20 }]);
    const rect = [...h.snapshot().entities.values()].find((e): e is LwPolylineEntity => e.type === 'lwpolyline')!;

    h.select(rect.id);
    const res = await h.run('EXPLODE');
    expect(res.ok).toBe(true);

    // La polilínea rectangular de 4 vértices se descompone en 4 líneas
    const lines = [...h.snapshot().entities.values()].filter((e): e is LineEntity => e.type === 'line');
    expect(lines).toHaveLength(4);
    expect(h.doc.entity(rect.id)).toBeUndefined();
  });
});
