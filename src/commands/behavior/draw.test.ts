import { beforeEach, describe, expect, it } from 'vitest';
import type { ArcEntity, CircleEntity, LineEntity, LwPolylineEntity, PointEntity } from '../../document/types';
import { CommandHarness } from './harness';

describe('Comportamiento de Comandos — Dibujo (CMD-001)', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  it('LINE: dibuja segmentos encadenados, soporta undo/redo y cancelación limpia', async () => {
    const s0 = h.snapshot();
    const res = await h.run('LINE', [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, '']);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    const diff = h.diff(s0, s1);
    expect(diff.netEntityChange).toBe(2);

    const lines = [...s1.entities.values()].filter((e): e is LineEntity => e.type === 'line');
    expect(lines).toHaveLength(2);
    expect(lines[0].start).toEqual({ x: 0, y: 0 });
    expect(lines[0].end).toEqual({ x: 50, y: 0 });
    expect(lines[1].end).toEqual({ x: 50, y: 30 });

    // Deshacer (undo) revierte todo el comando de una sola vez
    h.undo();
    const sUndo = h.snapshot();
    expect(sUndo.entityCount).toBe(s0.entityCount);

    // Rehacer (redo) restaura los dos segmentos
    h.redo();
    const sRedo = h.snapshot();
    expect(sRedo.entityCount).toBe(s1.entityCount);

    // Cancelar a mitad de orden no deja restos ni transacciones colgadas
    const pending = h.run('LINE', [{ x: 100, y: 100 }]);
    await new Promise((r) => setTimeout(r, 10));
    h.runner.cancel();
    await pending;

    expect(h.doc.activeTransaction).toBeNull();
    expect(h.runner.busy).toBe(false);
  });

  it('PLINE: crea polilínea abierta o cerrada con vértices precisos', async () => {
    const s0 = h.snapshot();
    const res = await h.run('PLINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, 'C']);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const pline = [...s1.entities.values()].find((e): e is LwPolylineEntity => e.type === 'lwpolyline')!;
    expect(pline).toBeDefined();
    expect(pline.closed).toBe(true);
    expect(pline.vertices.length).toBeGreaterThanOrEqual(3);

    h.undo();
    expect(h.snapshot().entityCount).toBe(s0.entityCount);
  });

  it('CIRCLE: crea círculo con centro y radio especificado', async () => {
    const s0 = h.snapshot();
    const res = await h.run('CIRCLE', [{ x: 25, y: 25 }, '15']);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const circle = [...s1.entities.values()].find((e): e is CircleEntity => e.type === 'circle')!;
    expect(circle).toBeDefined();
    expect(circle.center).toEqual({ x: 25, y: 25 });
    expect(circle.radius).toBeCloseTo(15);
  });

  it('ARC: crea arco por tres puntos', async () => {
    const s0 = h.snapshot();
    const res = await h.run('ARC', [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const arc = [...s1.entities.values()].find((e): e is ArcEntity => e.type === 'arc')!;
    expect(arc).toBeDefined();
    expect(arc.radius).toBeGreaterThan(0);
  });

  it('RECTANG: crea polilínea rectangular cerrada', async () => {
    const s0 = h.snapshot();
    const res = await h.run('RECTANG', [{ x: 10, y: 10 }, { x: 40, y: 30 }]);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const rect = [...s1.entities.values()].find((e): e is LwPolylineEntity => e.type === 'lwpolyline')!;
    expect(rect.closed).toBe(true);
    expect(rect.vertices).toHaveLength(4);
  });

  it('POINT, RAY y XLINE: crean entidades geométricas primitivas', async () => {
    const s0 = h.snapshot();

    // POINT (se termina con Intro '')
    await h.run('POINT', [{ x: 5, y: 5 }, '']);
    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);
    const pt = [...s1.entities.values()].find((e): e is PointEntity => e.type === 'point')!;
    expect(pt.position).toEqual({ x: 5, y: 5 });

    // RAY (punto inicial, punto a través, Intro '')
    await h.run('RAY', [{ x: 0, y: 0 }, { x: 10, y: 10 }, '']);
    const s2 = h.snapshot();
    expect(s2.entityCount).toBe(s1.entityCount + 1);

    // XLINE (punto base, punto a través, Intro '')
    await h.run('XLINE', [{ x: 0, y: 0 }, { x: 20, y: 0 }, '']);
    const s3 = h.snapshot();
    expect(s3.entityCount).toBe(s2.entityCount + 1);
  });

  it('POLYGON y ELLIPSE: crean polígonos regulares y elipses', async () => {
    const s0 = h.snapshot();

    // POLYGON: 6 lados, centro en 0,0, inscrito con radio 10
    const resPoly = await h.run('POLYGON', ['6', { x: 0, y: 0 }, 'I', '10']);
    expect(resPoly.ok).toBe(true);
    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    // ELLIPSE: centro en 50,50, eje mayor a 70,50, distancia a otro eje 10
    const resEllipse = await h.run('ELLIPSE', ['C', { x: 50, y: 50 }, { x: 70, y: 50 }, '10']);
    expect(resEllipse.ok).toBe(true);
    const s2 = h.snapshot();
    expect(s2.entityCount).toBe(s1.entityCount + 1);
  });

  it('DONUT: crea arandela con polilínea de grosor constante', async () => {
    const s0 = h.snapshot();
    // Diámetro interior 2, exterior 8, centro en (15, 15), finalizar con Intro ''
    const res = await h.run('DONUT', ['2', '8', { x: 15, y: 15 }, '']);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);
    const donut = [...s1.entities.values()].find((e): e is LwPolylineEntity => e.type === 'lwpolyline')!;
    expect(donut.closed).toBe(true);
    expect(donut.constantWidth).toBeCloseTo(3); // (8 - 2) / 2
  });

  it('REVCLOUD: crea nube de revisión rectangular', async () => {
    const s0 = h.snapshot();
    const res = await h.run('REVCLOUD', [{ x: 0, y: 0 }, { x: 50, y: 30 }]);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);
    const cloud = [...s1.entities.values()].find((e): e is LwPolylineEntity => e.type === 'lwpolyline')!;
    expect(cloud.closed).toBe(true);
    expect(cloud.vertices.length).toBeGreaterThanOrEqual(4);
  });

  it('REGION: convierte entidad cerrada (ej. círculo) en región 2D', async () => {
    // 1. Crear círculo
    await h.run('CIRCLE', [{ x: 30, y: 30 }, '10']);
    const circle = [...h.snapshot().entities.values()].find((e) => e.type === 'circle')!;
    expect(circle).toBeDefined();

    // 2. Preseleccionar y convertir a región
    h.editor.selection.set([circle.id]);
    const res = await h.run('REGION', []);
    expect(res.ok).toBe(true);

    const entities = [...h.snapshot().entities.values()];
    expect(entities.find((e) => e.type === 'circle')).toBeUndefined();
    const region = entities.find((e) => e.type === 'region');
    expect(region).toBeDefined();
    expect(region?.loops).toHaveLength(1);
  });
});
