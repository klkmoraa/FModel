import { beforeEach, describe, expect, it } from 'vitest';
import type { DimensionEntity, MTextEntity, TextEntity } from '../../document/types';
import { CommandHarness } from './harness';

describe('Comportamiento de Comandos — Anotación (CMD-001)', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  it('TEXT: inserta texto simple con altura y rotación', async () => {
    const s0 = h.snapshot();
    // TEXT: punto de inserción (10, 20), altura 2.5, rotación 0, texto "FModel CAD", Intro ''
    const res = await h.run('TEXT', [{ x: 10, y: 20 }, '2.5', '0', 'FModel CAD', '']);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const txt = [...s1.entities.values()].find((e): e is TextEntity => e.type === 'text')!;
    expect(txt).toBeDefined();
    expect(txt.text).toBe('FModel CAD');
    expect(txt.position).toEqual({ x: 10, y: 20 });
    expect(txt.height).toBeCloseTo(2.5);

    h.undo();
    expect(h.snapshot().entityCount).toBe(s0.entityCount);
  });

  it('MTEXT: inserta texto de párrafos con caja de ajuste', async () => {
    const s0 = h.snapshot();
    // MTEXT: primera esquina (0, 0), esquina opuesta (50, 20), contenido "Nota de plano"
    const res = await h.run('MTEXT', [{ x: 0, y: 0 }, { x: 50, y: 20 }, 'Nota de plano']);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const mtxt = [...s1.entities.values()].find((e): e is MTextEntity => e.type === 'mtext')!;
    expect(mtxt).toBeDefined();
    expect(mtxt.contents).toBe('Nota de plano');
  });

  it('DIMLINEAR y DIMALIGNED: acotan distancias entre puntos con estilo de cota', async () => {
    const s0 = h.snapshot();

    // DIMLINEAR: punto 1 (0, 0), punto 2 (100, 0), línea de cota en (50, 15)
    const resLinear = await h.run('DIMLINEAR', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 15 }]);
    expect(resLinear.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const dim = [...s1.entities.values()].find((e): e is DimensionEntity => e.type === 'dimension')!;
    expect(dim).toBeDefined();
    expect(dim.p1).toEqual({ x: 0, y: 0 });
    expect(dim.p2).toEqual({ x: 100, y: 0 });
    expect(dim.p3).toEqual({ x: 50, y: 15 });

    // DIMALIGNED: punto 1 (0, 0), punto 2 (30, 40), posición (15, 25)
    const resAligned = await h.run('DIMALIGNED', [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 15, y: 25 }]);
    expect(resAligned.ok).toBe(true);
    expect(h.snapshot().entityCount).toBe(s1.entityCount + 1);
  });

  it('MLEADER: crea directriz con flecha, rellano y texto', async () => {
    const s0 = h.snapshot();
    // MLEADER: inicio flecha (0, 0), rellano (10, 10), texto 'Nota directriz'
    const res = await h.run('MLEADER', [{ x: 0, y: 0 }, { x: 10, y: 10 }, 'Nota directriz']);
    expect(res.ok).toBe(true);

    const s1 = h.snapshot();
    expect(s1.entityCount).toBe(s0.entityCount + 1);

    const mldr = [...s1.entities.values()].find((e) => e.type === 'mleader')!;
    expect(mldr).toBeDefined();
  });
});
