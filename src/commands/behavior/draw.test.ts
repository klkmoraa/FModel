import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entityDefaults } from '../../document/defaults';
import type { ArcEntity, CircleEntity, HatchEntity, LineEntity, LwPolylineEntity, PointEntity, RayEntity, RegionEntity, TextEntity, XLineEntity } from '../../document/types';
import { revcloudVertices } from '../draw/construction';
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

  it('MLINE: Deshacer el único tramo no deja una entidad residual', async () => {
    const res = await h.run('MLINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, 'U', '']);
    expect(res.ok).toBe(true);
    expect([...h.snapshot().entities.values()].filter((entity) => entity.type === 'mline')).toHaveLength(0);

    await h.run('MLINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, 'U', '']);
    const remaining = [...h.snapshot().entities.values()].filter((entity) => entity.type === 'mline');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].type === 'mline' && remaining[0].vertices).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
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

  it('RAY y XLINE conservan direcciones finitas entre puntos extremos', async () => {
    const start = { x: -1e308, y: 0 };
    const through = { x: 1e308, y: 0 };
    expect((await h.run('RAY', [start, through, ''])).ok).toBe(true);
    expect((await h.run('XLINE', [start, through, ''])).ok).toBe(true);
    const ray = [...h.doc.data.entities.values()].find((e): e is RayEntity => e.type === 'ray')!;
    const xline = [...h.doc.data.entities.values()].find((e): e is XLineEntity => e.type === 'xline')!;
    expect(ray.direction).toEqual({ x: 1, y: 0 });
    expect(xline.direction).toEqual({ x: 1, y: 0 });
    expect(h.undo()).toBeTruthy();
    expect(h.doc.entity(xline.id)).toBeUndefined();
    expect(h.redo()).toBeTruthy();
    expect(h.doc.entity(xline.id)).toBeDefined();
    const count = h.doc.data.entities.size;
    await h.run('RAY', [{ x: 0, y: 0 }, { x: 1e-10, y: 0 }, '']);
    await h.run('XLINE', [{ x: 0, y: 0 }, { x: 1e-10, y: 0 }, '']);
    expect(h.doc.data.entities.size).toBe(count);
  });

  it('XLINE Bisect conserva una dirección finita con lados extremos', async () => {
    const vertex = { x: -1e308, y: 0 };
    const first = { x: 1e308, y: 0 };
    const second = { x: -1e308, y: 1e308 };
    expect((await h.run('XLINE', ['Bisect', vertex, first, second, ''])).ok).toBe(true);
    const xline = [...h.doc.data.entities.values()].find((e): e is XLineEntity => e.type === 'xline')!;
    expect(xline.direction.x).toBeCloseTo(Math.SQRT1_2);
    expect(xline.direction.y).toBeCloseTo(Math.SQRT1_2);
    expect(h.undo()).toBeTruthy();
    expect(h.doc.entity(xline.id)).toBeUndefined();
    expect(h.redo()).toBeTruthy();
    expect(h.doc.entity(xline.id)).toBeDefined();
    const count = h.doc.data.entities.size;
    expect((await h.run('XLINE', ['Bisect', vertex, vertex, second, ''])).ok).toBe(false);
    expect(h.doc.data.entities.size).toBe(count);
  });

  it('XLINE Offset conserva una dirección finita al desfasar una línea extrema', async () => {
    const a = { x: -1e308, y: 0 };
    const b = { x: 1e308, y: 0 };
    expect((await h.run('LINE', [a, b, ''])).ok).toBe(true);
    const pending = h.run('XLINE', ['Offset', '10', { x: 0, y: 0 }, { x: 0, y: 10 }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    h.runner.cancel();
    const result = await pending;
    expect(result.ok).toBe(true);
    const xline = [...h.doc.data.entities.values()].find((e): e is XLineEntity => e.type === 'xline');
    expect(xline, result.logs.join(' | ')).toBeDefined();
    expect(xline!.direction).toEqual({ x: 1, y: 0 });
    expect(xline!.origin.y).toBe(10);
    const below = h.run('XLINE', ['Offset', '10', { x: 0, y: 0 }, { x: 1e308, y: -10 }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    h.runner.cancel();
    await below;
    const opposite = [...h.doc.data.entities.values()].filter((e): e is XLineEntity => e.type === 'xline').at(-1)!;
    expect(opposite.direction).toEqual({ x: 1, y: 0 });
    expect(opposite.origin.y).toBe(-10);
    expect(h.undo()).toBeTruthy();
    expect(h.doc.entity(opposite.id)).toBeUndefined();
    expect(h.redo()).toBeTruthy();
    expect(h.doc.entity(opposite.id)).toBeDefined();
  });

  it('XLINE Offset acepta una línea de construcción como origen', async () => {
    expect((await h.run('XLINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, ''])).ok).toBe(true);
    const pending = h.run('XLINE', ['Offset', '2', { x: 0, y: 0 }, { x: 0, y: 2 }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    h.runner.cancel();
    await pending;
    const lines = [...h.doc.data.entities.values()].filter((e): e is XLineEntity => e.type === 'xline');
    expect(lines).toHaveLength(2);
    expect(lines[1].origin).toEqual({ x: 0, y: 2 });
    expect(lines[1].direction).toEqual({ x: 1, y: 0 });
    expect((await h.run('RAY', [{ x: 0, y: 10 }, { x: 10, y: 10 }, ''])).ok).toBe(true);
    const fromRay = h.run('XLINE', ['Offset', '2', { x: 0, y: 10 }, { x: 0, y: 12 }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    h.runner.cancel();
    await fromRay;
    const afterRay = [...h.doc.data.entities.values()].filter((e): e is XLineEntity => e.type === 'xline');
    expect(afterRay).toHaveLength(3);
    expect(afterRay[2].origin).toEqual({ x: 0, y: 12 });
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

  it('DONUT: conserva vértices finitos con diámetros finitos muy grandes', async () => {
    const res = await h.run('DONUT', ['1.6e308', '1.7e308', { x: 0, y: 0 }, '']);
    expect(res.ok).toBe(true);
    const donut = [...h.doc.data.entities.values()].find((entity): entity is LwPolylineEntity => entity.type === 'lwpolyline');
    expect(donut).toBeDefined();
    expect(donut?.vertices.every((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.y))).toBe(true);

    const before = h.doc.data.entities.size;
    const overflow = await h.run('DONUT', ['1.6e308', '1.7e308', { x: 1.7e308, y: 0 }]);
    expect(overflow.ok).toBe(false);
    expect(h.doc.data.entities.size).toBe(before);
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

  it('REVCLOUD convierte un objeto válido sin dejar la línea original', async () => {
    expect((await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, ''])).ok).toBe(true);
    const source = [...h.doc.data.entities.values()].find((e): e is LineEntity => e.type === 'line')!;
    expect((await h.run('REVCLOUD', ['Object', { x: 5, y: 0 }])).ok).toBe(true);
    expect(h.doc.entity(source.id)).toBeUndefined();
    expect([...h.doc.data.entities.values()].some((e) => e.type === 'lwpolyline')).toBe(true);
  });

  it('REVCLOUD rechaza una nube que excede el límite de vértices', async () => {
    expect(revcloudVertices([{ x: 0, y: 0 }, { x: 100_000, y: 0 }], false, 1, true)).toBeNull();
    const before = h.doc.data.entities.size;
    const result = await h.run('REVCLOUD', ['Arc length', '1', { x: 0, y: 0 }, { x: 100_000, y: 1 }]);
    expect(result.ok).toBe(false);
    expect(h.doc.data.entities.size).toBe(before);
    expect((await h.run('LINE', [{ x: 0, y: 0 }, { x: 100_001, y: 0 }, ''])).ok).toBe(true);
    const source = [...h.doc.data.entities.values()].find((e): e is LineEntity => e.type === 'line')!;
    const fromObject = await h.run('REVCLOUD', ['Arc length', '1', 'Object', { x: 50_000, y: 0 }]);
    expect(fromObject.ok).toBe(false);
    expect(h.doc.entity(source.id)).toBeDefined();
    expect(h.doc.data.entities.size).toBe(before + 1);
  });

  it('MEASURE rechaza distancia cero y exceso de marcas sin mutar el dibujo', async () => {
    expect((await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, ''])).ok).toBe(true);
    const before = h.doc.data.entities.size;
    const pendingZero = h.run('MEASURE', [{ x: 5, y: 0 }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.runner.pending?.req.kind).toBe('distance');
    h.runner.submitPoint({ x: 0, y: 0 });
    h.runner.submitPoint({ x: 0, y: 0 });
    const zero = await pendingZero;
    expect(zero.ok).toBe(false);
    expect(h.doc.data.entities.size).toBe(before);
    expect((await h.run('MEASURE', [{ x: 5, y: 0 }, '2'])).ok).toBe(true);
    expect([...h.doc.data.entities.values()].filter((e) => e.type === 'point')).toHaveLength(4);
    expect((await h.run('LINE', [{ x: 0, y: 20 }, { x: 250_001, y: 20 }, ''])).ok).toBe(true);
    const count = h.doc.data.entities.size;
    const excessive = await h.run('MEASURE', [{ x: 100_000, y: 20 }, '1']);
    expect(excessive.ok).toBe(false);
    expect(h.doc.data.entities.size).toBe(count);
  });

  it('DIVIDE mantiene la posición de marcas al recorrer los tramos en orden', async () => {
    expect((await h.run('PLINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, ''])).ok).toBe(true);

    const result = await h.run('DIVIDE', [{ x: 5, y: 0 }, '4']);

    const marks = [...h.doc.data.entities.values()].filter((entity): entity is PointEntity => entity.type === 'point');
    expect(result.ok).toBe(true);
    expect(marks.map((mark) => mark.position)).toEqual([{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
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

  it('HATCH: conserva el hueco al seleccionar una región con dos lazos', async () => {
    const outer = { closed: true as const, vertices: [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ] };
    const hole = { closed: true as const, vertices: [
      { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 },
    ] };
    const region = h.doc.transact('seed', (tx) => tx.addEntity<RegionEntity>({
      ...entityDefaults(h.doc), id: 'region-with-hole', type: 'region', loops: [outer, hole],
    }));

    const pending = h.run('HATCH', ['', 'S']);
    await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('selection'));
    h.runner.submitSelection([region.id]);
    const res = await pending;

    expect(res.ok).toBe(true);
    const hatch = [...h.doc.data.entities.values()].find((entity): entity is HatchEntity => entity.type === 'hatch');
    expect(hatch?.loops).toEqual([outer, hole]);
  });

  it('TEXT: aplica al texto el estilo elegido en la misma orden', async () => {
    const res = await h.run('TEXT', ['S', 'Técnico mono', { x: 0, y: 0 }, '', '', 'Nota', '']);
    expect(res.ok).toBe(true);
    const text = [...h.doc.data.entities.values()].find((entity): entity is TextEntity => entity.type === 'text');
    expect(text?.style).toBe('ts-mono');
    expect(h.doc.settings.currentTextStyle).toBe('ts-mono');
  });

  it('MTEXT: rechaza una anchura que desborda entre esquinas finitas', async () => {
    const res = await h.run('MTEXT', [{ x: -1e308, y: 0 }, { x: 1e308, y: 0 }, 'Nota']);
    expect(res.ok).toBe(false);
    expect([...h.doc.data.entities.values()].some((entity) => entity.type === 'mtext')).toBe(false);
  });
});
