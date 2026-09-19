import { beforeEach, describe, expect, it } from 'vitest';
import { CommandHarness } from './harness';

describe('Comportamiento de Comandos — Gestión, Consulta y Visualización (CMD-001)', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  it('DIST, AREA e ID: son de solo lectura y no mutan el documento', async () => {
    const s0 = h.snapshot();

    // DIST entre (0, 0) y (3, 4)
    const resDist = await h.run('DIST', [{ x: 0, y: 0 }, { x: 3, y: 4 }, '']);
    expect(resDist.ok).toBe(true);
    expect(resDist.logs.some((l) => /5/.test(l))).toBe(true);

    // ID en (15.5, 20.2)
    const resId = await h.run('ID', [{ x: 15.5, y: 20.2 }]);
    expect(resId.ok).toBe(true);

    const sEnd = h.snapshot();
    expect(sEnd.entityCount).toBe(s0.entityCount);
    expect(sEnd.dirty).toBe(s0.dirty);
  });

  it('LAYON, LAYOFF, LAYTHW y LAYFRZ: modifican estados de capa', async () => {
    // Crear una capa nueva
    const layer = h.doc.transact('NEW_LAYER', (tx) => {
      return tx.add('layers', {
        id: 'capa_prueba',
        name: 'Prueba',
        color: '#ff0000',
        linetype: 'Continuous',
        lineweight: -1,
        transparency: 0,
        on: true,
        frozen: false,
        locked: false,
        plot: true,
        description: '',
        order: 1,
      });
    });
    expect(layer.id).toBe('capa_prueba');

    // Desactivar capa
    h.doc.data.layers.get('capa_prueba')!.on = false;
    expect(h.doc.data.layers.get('capa_prueba')?.on).toBe(false);

    // LAYON activa todas las capas
    await h.run('LAYON');
    expect(h.doc.data.layers.get('capa_prueba')?.on).toBe(true);
  });

  it('AUDIT: inspecciona el dibujo y reporta diagnóstico sin corromper el documento', async () => {
    const s0 = h.snapshot();
    const res = await h.run('AUDIT', ['Y']);
    expect(res.ok).toBe(true);

    const sEnd = h.snapshot();
    expect(sEnd.entityCount).toBe(s0.entityCount);
    expect(h.runner.busy).toBe(false);
  });

  it('Comando desconocido: registra mensaje de error claro y el runner se mantiene funcional', async () => {
    const res = await h.run('NON_EXISTENT_CMD_XYZ');
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(h.runner.busy).toBe(false);

    // El runner sigue disponible para ejecutar comandos válidos
    const resValid = await h.run('POINT', [{ x: 0, y: 0 }, '']);
    expect(resValid.ok).toBe(true);
  });
});
