import { beforeAll, describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import type { Vec2 } from '../geometry/vec';
import type { ArcEntity, CircleEntity, Entity, Id, LineEntity, LwPolylineEntity } from '../document/types';
import { Editor } from '../editor/editor';
import { registerAllCommands } from './index';

/**
 * Los comandos se ejecutan de extremo a extremo con el guion del intérprete: las mismas
 * peticiones de punto, texto y designación que atiende la interfaz, sin DOM. Cada entrada
 * responde a una petición; con objetos ya designados, los comandos de modificación no
 * vuelven a pedir la designación.
 */
const editor = new Editor(createDocument());
const doc = editor.doc;
const run = (name: string, inputs: (string | Vec2)[] = [], args?: string[]) => editor.runner.script(name, inputs, args);
const entities = () => [...doc.data.entities.values()];
const ofType = <E extends Entity>(type: string) => entities().filter((e): e is E => e.type === type);
const errors = () => editor.runner.log.filter((l) => l.kind === 'error').map((l) => l.text);
const select = (...ids: Id[]) => editor.selection.set(ids);

beforeAll(() => registerAllCommands());

describe('dibujo', () => {
  it('LINE encadena segmentos hasta Intro', async () => {
    await run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, '']);
    const lines = ofType<LineEntity>('line');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    expect(lines[1].end).toEqual({ x: 10, y: 10 });
    expect(errors()).toEqual([]);
  });

  it('CIRCLE acepta el radio escrito y RECTANG crea una polilínea cerrada', async () => {
    await run('CIRCLE', [{ x: 0, y: 0 }, '4']);
    expect(ofType<CircleEntity>('circle')[0]).toMatchObject({ center: { x: 0, y: 0 }, radius: 4 });
    await run('RECTANG', [{ x: 20, y: 0 }, { x: 30, y: 6 }]);
    const rect = ofType<LwPolylineEntity>('lwpolyline').at(-1)!;
    expect(rect.closed).toBe(true);
    expect(rect.vertices).toHaveLength(4);
  });

  it('cancelar a media orden no deja rastro', async () => {
    const before = entities().length;
    const pending = run('LINE', [{ x: 50, y: 50 }]);
    await new Promise((r) => setTimeout(r, 10));
    editor.runner.cancel();
    await pending;
    expect(entities().length).toBe(before);
    expect(editor.runner.busy).toBe(false);
  });
});

describe('modificación', () => {
  it('MOVE desplaza la selección y se deshace en un paso', async () => {
    const line = ofType<LineEntity>('line')[0];
    select(line.id);
    await run('MOVE', [{ x: 0, y: 0 }, { x: 0, y: 5 }]);
    expect((doc.entity(line.id) as LineEntity).start).toEqual({ x: 0, y: 5 });
    doc.undo();
    expect((doc.entity(line.id) as LineEntity).start).toEqual({ x: 0, y: 0 });
  });

  it('COPY deja el original y añade la copia', async () => {
    const circle = ofType<CircleEntity>('circle')[0];
    const before = ofType<CircleEntity>('circle').length;
    select(circle.id);
    await run('COPY', [{ x: 0, y: 0 }, { x: 0, y: 20 }, '']);
    const circles = ofType<CircleEntity>('circle');
    expect(circles.length).toBe(before + 1);
    expect(circles.some((c) => c.center.y === 20)).toBe(true);
  });

  it('ERASE borra lo designado y OOPS lo recupera', async () => {
    const copy = ofType<CircleEntity>('circle').find((c) => c.center.y === 20)!;
    select(copy.id);
    await run('ERASE');
    expect(doc.entity(copy.id)).toBeUndefined();
    await run('OOPS');
    expect(doc.entity(copy.id)).toBeTruthy();
    select(copy.id);
    await run('ERASE');
    expect(doc.entity(copy.id)).toBeUndefined();
  });

  it('FILLET redondea la esquina entre dos líneas', async () => {
    const [a, b] = ofType<LineEntity>('line');
    await run('FILLET', ['R', '2', { x: 5, y: 0 }, { x: 10, y: 5 }]);
    const arcs = ofType<ArcEntity>('arc');
    expect(arcs).toHaveLength(1);
    expect(arcs[0].radius).toBeCloseTo(2);
    expect((doc.entity(a.id) as LineEntity).end.x).toBeCloseTo(8);
    expect((doc.entity(b.id) as LineEntity).start.y).toBeCloseTo(2);
  });
});

describe('consulta', () => {
  it('DIST informa de la distancia entre dos puntos', async () => {
    await run('DIST', [{ x: 0, y: 0 }, { x: 3, y: 4 }, '']);
    expect(editor.runner.log.some((l) => /Dist(ance|ancia) = 5/.test(l.text))).toBe(true);
  });
});

describe('robustez del intérprete', () => {
  it('un comando desconocido avisa sin romper el estado', async () => {
    await editor.command('NOEXISTE');
    expect(errors().at(-1)).toMatch(/NOEXISTE/);
    expect(editor.runner.busy).toBe(false);
  });

  it('un comando de modificación sin designación termina con aviso', async () => {
    select();
    await run('MOVE', ['']);
    expect(errors().at(-1)).toMatch(/MOVE/);
    expect(editor.runner.busy).toBe(false);
  });

  it('ningún comando queda a medias tras la tanda', () => {
    expect(editor.runner.busy).toBe(false);
    expect(doc.activeTransaction).toBeNull();
    expect(doc.history.inGroup).toBe(false);
  });
});
