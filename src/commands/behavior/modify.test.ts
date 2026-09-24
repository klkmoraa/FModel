import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentData, entityDefaults } from '../../document/defaults';
import type { ArcEntity, CircleEntity, LineEntity, LwPolylineEntity } from '../../document/types';
import { CommandHarness } from './harness';

describe('Comportamiento de Comandos — Modificación (CMD-001)', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ARRAYRECT conserva un punto base finito con una línea de coordenadas grandes', async () => {
    const line = h.doc.transact('línea grande', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(h.doc), type: 'line', start: { x: 1e308, y: 0 }, end: { x: 1.1e308, y: 0 },
    }));
    h.select(line.id);

    const result = await h.run('ARRAYRECT', ['2', '2', '10', '10', 'Yes']);

    expect(result.ok).toBe(true);
    const array = [...h.doc.data.entities.values()].find((entity) => entity.type === 'array');
    expect(array?.type).toBe('array');
    if (array?.type === 'array') expect(Number.isFinite(array.basePoint.x)).toBe(true);
  });

  it('ARRAYRECT rechaza una extensión no representable sin mover la fuente', async () => {
    const line = h.doc.transact('línea opuesta', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(h.doc), type: 'line', start: { x: -1e308, y: 0 }, end: { x: 1e308, y: 0 },
    }));
    const blockCount = h.doc.data.blocks.size;
    h.select(line.id);

    const result = await h.run('ARRAYRECT');

    expect(result.ok).toBe(false);
    expect(h.doc.entity(line.id)).toBe(line);
    expect(h.doc.data.blocks.size).toBe(blockCount);
    expect([...h.doc.data.entities.values()].some((entity) => entity.type === 'array')).toBe(false);
  });

  it('ARRAYRECT exige una separación explícita si el valor predeterminado desborda', async () => {
    const line = h.doc.transact('línea con ancho grande', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(h.doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 1.5e308, y: 0 },
    }));
    h.select(line.id);

    const blockCount = h.doc.data.blocks.size;
    const result = await h.run('ARRAYRECT', ['2', '2', '']);

    const array = [...h.doc.data.entities.values()].find((entity) => entity.type === 'array');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/separación|spacing/i);
    expect(array).toBeUndefined();
    expect(h.doc.entity(line.id)).toBe(line);
    expect(h.doc.data.blocks.size).toBe(blockCount);
  });

  it('ARRAYRECT rechaza un producto de instancias excesivo antes de mover la fuente', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const line = [...h.doc.data.entities.values()][0];
    const blockCount = h.doc.data.blocks.size;
    h.select(line.id);

    const result = await h.run('ARRAYRECT', ['5000', '5000']);

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/expansión|expansion/i);
    expect(h.doc.entity(line.id)).toBe(line);
    expect(h.doc.data.blocks.size).toBe(blockCount);
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

  it('OOPS no recupera entidades de otro dibujo tras sustituir el documento', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const line = [...h.doc.data.entities.values()][0];
    h.select(line.id);
    expect((await h.run('ERASE')).ok).toBe(true);

    h.doc.replaceData(createDocumentData());
    const result = await h.run('OOPS');

    expect(result.ok).toBe(false);
    expect(h.doc.data.entities.size).toBe(0);
  });

  it('PASTECLIP informa un paquete inválido en vez de pegar la copia interna anterior', async () => {
    vi.stubGlobal('navigator', { clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(JSON.stringify({ format: 'fmodel-clip', version: 2, entities: ['rota'] })),
    } });
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    h.select([...h.doc.data.entities.keys()][0]);
    expect((await h.run('COPYCLIP')).ok).toBe(true);

    const result = await h.run('PASTECLIP', [{ x: 20, y: 20 }]);

    expect(result.ok).toBe(false);
    expect(h.doc.data.entities.size).toBe(1);
  });

  it('PASTECLIP conserva el respaldo interno si el navegador niega acceso al portapapeles', async () => {
    vi.stubGlobal('navigator', { clipboard: {
      writeText: vi.fn().mockRejectedValue(new Error('denied')),
      readText: vi.fn().mockRejectedValue(new Error('denied')),
    } });
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    h.select([...h.doc.data.entities.keys()][0]);
    expect((await h.run('COPYCLIP')).ok).toBe(true);

    const result = await h.run('PASTECLIP', [{ x: 20, y: 20 }]);

    expect(result.ok).toBe(true);
    expect(h.doc.data.entities.size).toBe(2);
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

  it('MOVE rechaza un desplazamiento que desborda sin alterar la entidad', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const line = [...h.doc.data.entities.values()].find((entity): entity is LineEntity => entity.type === 'line')!;
    h.select(line.id);

    const result = await h.run('MOVE', [{ x: -1e308, y: 0 }, { x: 1e308, y: 0 }]);

    expect(result.ok).toBe(false);
    expect(h.doc.entity(line.id)).toEqual(line);
    expect(h.doc.history.inGroup).toBe(false);
  });

  it('MOVE rechaza coordenadas transformadas que desbordan con matriz finita', async () => {
    await h.run('LINE', [{ x: 1e308, y: 0 }, { x: 1.1e308, y: 0 }, '']);
    const line = [...h.doc.data.entities.values()].find((entity): entity is LineEntity => entity.type === 'line')!;
    h.select(line.id);

    const result = await h.run('MOVE', [{ x: 0, y: 0 }, { x: 1e308, y: 0 }]);

    expect(result.ok).toBe(false);
    expect(h.doc.entity(line.id)).toEqual(line);
  });

  it('GRIP STRETCH rechaza un arrastre que desborda sin guardar números infinitos', async () => {
    await h.run('LINE', [{ x: -1e308, y: 0 }, { x: -0.9e308, y: 0 }, '']);
    const line = [...h.doc.data.entities.values()].find((entity): entity is LineEntity => entity.type === 'line')!;
    h.select(line.id);
    h.editor.gripContext = { refs: [{ entityId: line.id, gripId: 'start', p: line.start }], base: line.start };

    const result = await h.run('_GRIP', [{ x: 1e308, y: 0 }]);

    expect(result.ok).toBe(false);
    expect(h.doc.entity(line.id)).toEqual(line);
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

  it('UNION: carga el motor geométrico bajo demanda y reemplaza los contornos', async () => {
    await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    await h.run('RECTANG', [{ x: 5, y: 0 }, { x: 15, y: 10 }]);
    const rectangles = [...h.snapshot().entities.values()].filter(
      (e): e is LwPolylineEntity => e.type === 'lwpolyline',
    );

    h.select(...rectangles.map((e) => e.id));
    const res = await h.run('UNION');

    expect(res.ok).toBe(true);
    expect(rectangles.every((e) => h.doc.entity(e.id) === undefined)).toBe(true);
    const regions = [...h.snapshot().entities.values()].filter((e) => e.type === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].loops).toHaveLength(1);
    expect(regions[0].loops[0].vertices.length).toBeGreaterThanOrEqual(4);
  });
});
