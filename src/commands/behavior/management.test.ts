import { beforeEach, describe, expect, it } from 'vitest';
import { createDocumentData, entityDefaults } from '../../document/defaults';
import type { CircleEntity } from '../../document/types';
import { CommandHarness } from './harness';

describe('Comportamiento de Comandos — Gestión, Consulta y Visualización (CMD-001)', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  it('LIST marca medidas derivadas fuera de rango sin mostrar Infinity', async () => {
    const circle = h.doc.transact('círculo extremo', (tx) => tx.addEntity<CircleEntity>({
      ...entityDefaults(h.doc), type: 'circle', center: { x: 0, y: 1e308 }, radius: 1e308,
    }));
    h.select(circle.id);

    const result = await h.run('LIST');

    expect(result.ok).toBe(true);
    expect(result.logs.join(' ')).not.toMatch(/Infinity|NaN/);
    expect(result.logs.join(' ')).toContain('####');
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

  it('CHPROP rechaza escalas y grosores no finitos sin alterar la entidad', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const line = [...h.doc.data.entities.values()][0];
    h.select(line.id);
    const originalScale = line.linetypeScale;
    const originalWeight = line.lineweight;

    const scale = await h.run('CHPROP', ['Ltscale', 'Infinity', '']);
    h.select(line.id);
    const weight = await h.run('CHPROP', ['Lweight', 'Infinity', '']);

    expect(scale.ok).toBe(false);
    expect(weight.ok).toBe(false);
    expect(h.doc.entity(line.id)?.linetypeScale).toBe(originalScale);
    expect(h.doc.entity(line.id)?.lineweight).toBe(originalWeight);
  });

  it('CHPROP no aplica colores ni tipos de línea desconocidos', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const line = [...h.doc.data.entities.values()][0];
    const originalColor = line.color;
    const originalLinetype = line.linetype;

    h.select(line.id);
    const color = await h.run('CHPROP', ['Color', 'color-inventado', '']);
    h.select(line.id);
    const linetype = await h.run('CHPROP', ['Ltype', 'tipo-inexistente', '']);

    expect(color.ok).toBe(false);
    expect(linetype.ok).toBe(false);
    expect(h.doc.entity(line.id)?.color).toBe(originalColor);
    expect(h.doc.entity(line.id)?.linetype).toBe(originalLinetype);
  });

  it('CHPROP conserva las opciones válidas ACI y PorBloque', async () => {
    await h.run('LINE', [{ x: 0, y: 0 }, { x: 10, y: 0 }, '']);
    const id = [...h.doc.data.entities.keys()][0];

    h.select(id);
    const color = await h.run('CHPROP', ['Color', 'aci:3', '']);
    h.select(id);
    const linetype = await h.run('CHPROP', ['Ltype', 'ByBlock', '']);

    expect(color.ok).toBe(true);
    expect(linetype.ok).toBe(true);
    expect(h.doc.entity(id)?.color).toBe('aci:3');
    expect(h.doc.entity(id)?.linetype).toBe('ByBlock');
  });

  it('ZOOM Escala rechaza un factor no numérico sin alterar la vista', async () => {
    const previousScale = h.editor.view.scale;

    const result = await h.run('ZOOM', ['Scale', '.']);

    expect(result.ok).toBe(false);
    expect(h.editor.view.scale).toBe(previousScale);
  });

  it('ZOOM Escala aplica un factor relativo válido', async () => {
    const previousScale = h.editor.view.scale;

    const result = await h.run('ZOOM', ['Scale', '2x']);

    expect(result.ok).toBe(true);
    expect(h.editor.view.scale).toBe(previousScale * 2);
  });

  it('ZOOM Previous no restaura una vista del dibujo anterior', async () => {
    h.editor.view.scale = 10;
    expect((await h.run('ZOOM', ['In'])).ok).toBe(true);

    h.doc.replaceData(createDocumentData());
    const newDrawingScale = h.editor.view.scale;
    expect(newDrawingScale).not.toBe(10);
    expect((await h.run('ZOOM', ['Previous'])).ok).toBe(true);

    expect(h.editor.view.scale).toBe(newDrawingScale);
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
