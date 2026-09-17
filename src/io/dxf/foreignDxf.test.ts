import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDocument } from '../../document/defaults';
import type { DimensionEntity, InsertEntity, TextEntity } from '../../document/types';
import { decodeDxfBytes, importDxfIntoDocument } from './importDxf';

/**
 * Interoperabilidad: el archivo lo escribe ezdxf (un escritor ajeno), no FModel.
 * Se regenera con `python scripts/make-dxf-fixture.py`.
 */
const bytes = new Uint8Array(readFileSync(new URL('./fixtures/ezdxf-r2010.dxf', import.meta.url)));
const doc = createDocument();
const report = importDxfIntoDocument(doc, decodeDxfBytes(bytes));
const entities = [...doc.data.entities.values()];
const byType = (t: string) => entities.filter((e) => e.type === t);

describe('DXF de otra aplicación', () => {
  it('reconoce la versión, las unidades y las capas del archivo', () => {
    expect(report.version).toBe('AC1024');
    expect(report.units).toBe('mm');
    expect([...doc.data.layers.values()].map((l) => l.name)).toEqual(expect.arrayContaining(['MUROS', 'COTAS']));
  });

  it('trae la geometría con su tipo propio', () => {
    expect(byType('line')).toHaveLength(3);
    expect(byType('circle')).toHaveLength(1);
    expect(byType('arc')).toHaveLength(2);
    expect(byType('ellipse')).toHaveLength(1);
    expect(byType('spline')).toHaveLength(1);
    expect(byType('point')).toHaveLength(1);
    expect(byType('lwpolyline')).toHaveLength(4);
    // la polilínea con pandeo conserva el arco
    expect(byType('lwpolyline').some((e) => (e as { vertices: { bulge: number }[] }).vertices.some((v) => Math.abs(v.bulge) > 0.1))).toBe(true);
  });

  it('trae anotaciones, bloques y sombreados', () => {
    expect((byType('text')[0] as TextEntity).text).toBe('Cimentación Ñ');
    expect(byType('mtext')).toHaveLength(1);
    expect(byType('dimension')).toHaveLength(2);
    const cota = byType('dimension').find((d) => (d as DimensionEntity).dimType === 'linear') as DimensionEntity;
    expect(Math.hypot(cota.p2.x - cota.p1.x, cota.p2.y - cota.p1.y)).toBeCloseTo(100, 6);
    const insert = byType('insert')[0] as InsertEntity;
    expect(doc.data.blocks.get(insert.blockId)?.name).toBe('PUERTA');
    expect(insert.scale.x).toBeCloseTo(1.5);
    expect(insert.rotation).toBeCloseTo(Math.PI / 6, 3);
    expect(byType('hatch').length).toBeGreaterThanOrEqual(1);
  });

  it('el parte de conversión dice qué se transformó y no ignora nada', () => {
    expect(Object.keys(report.ignored)).toEqual([]);
    expect(report.transformed.SOLID?.reason).toMatch(/sombreado/);
    expect(report.summary.es).toMatch(/AC1024/);
    expect(report.summary.en).toMatch(/AC1024/);
  });
});
