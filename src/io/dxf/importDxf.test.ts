import { describe, expect, it } from 'vitest';
import { createDocument } from '../../document/defaults';
import type { CircleEntity, LineEntity, LwPolylineEntity, TextEntity } from '../../document/types';
import { decodeDxfBytes, importDxfIntoDocument } from './importDxf';

/** Construye un DXF mínimo a partir de pares código/valor. */
const dxf = (...sections: string[][]) => [...sections.flat(), '0', 'EOF', ''].join('\n');
const header = (...pairs: string[]) => ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1024', ...pairs, '0', 'ENDSEC'];
const entities = (...body: string[]) => ['0', 'SECTION', '2', 'ENTITIES', ...body, '0', 'ENDSEC'];
const line = (x1: number, y1: number, x2: number, y2: number, layer = '0') => ['0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)];

const run = (text: string) => {
  const doc = createDocument();
  const report = importDxfIntoDocument(doc, text);
  return { doc, report, list: [...doc.data.entities.values()] };
};

describe('importación de DXF', () => {
  it('lee entidades básicas con sus capas y unidades', () => {
    const text = dxf(
      header('9', '$INSUNITS', '70', '6'),
      ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '0', 'LAYER', '2', 'Muros', '62', '5', '0', 'ENDTAB', '0', 'ENDSEC'],
      entities(...line(0, 0, 10, 5, 'Muros'), '0', 'CIRCLE', '8', 'Muros', '10', '3', '20', '4', '40', '2.5', '0', 'TEXT', '8', '0', '10', '1', '20', '2', '40', '3', '1', 'PLANTA'),
    );
    const { doc, report, list } = run(text);
    expect(report.version).toBe('AC1024');
    expect(report.units).toBe('m');
    expect(report.imported).toMatchObject({ LINE: 1, CIRCLE: 1, TEXT: 1 });
    expect([...doc.data.layers.values()].some((l) => l.name === 'Muros')).toBe(true);
    const ln = list.find((e): e is LineEntity => e.type === 'line')!;
    expect(ln.end).toEqual({ x: 10, y: 5 });
    expect(doc.data.layers.get(ln.layer)?.name).toBe('Muros');
    expect(list.find((e): e is CircleEntity => e.type === 'circle')!.radius).toBe(2.5);
    expect(list.find((e): e is TextEntity => e.type === 'text')!.text).toBe('PLANTA');
  });

  it('convierte la polilínea ligera con sus pandeos', () => {
    const text = dxf(header(), entities('0', 'LWPOLYLINE', '8', '0', '90', '3', '70', '1', '10', '0', '20', '0', '42', '0.5', '10', '5', '20', '0', '10', '5', '20', '5'));
    const { list, report } = run(text);
    const pl = list.find((e): e is LwPolylineEntity => e.type === 'lwpolyline')!;
    expect(pl.closed).toBe(true);
    expect(pl.vertices).toHaveLength(3);
    expect(pl.vertices[0].bulge).toBeCloseTo(0.5);
    expect(report.imported.LWPOLYLINE).toBe(1);
  });

  it('deja constancia de lo que no se admite en lugar de fingirlo', () => {
    const text = dxf(header(), entities('0', '3DSOLID', '8', '0', '0', 'MESH', '8', '0', ...line(0, 0, 1, 1)));
    const { report, list } = run(text);
    expect(list).toHaveLength(1);
    expect(Object.keys(report.ignored).sort()).toEqual(['3DSOLID', 'MESH']);
    for (const v of Object.values(report.ignored)) expect(v.reason.length).toBeGreaterThan(0);
    expect(report.summary.es).toMatch(/\d/);
    expect(report.summary.en).toMatch(/\d/);
  });

  it('un archivo vacío o sin sección de entidades no rompe el dibujo', () => {
    const vacio = run(dxf(header()));
    expect(vacio.list).toHaveLength(0);
    expect(vacio.doc.data.layers.size).toBeGreaterThan(0);
    const suelto = run('0\nEOF\n');
    expect(suelto.list).toHaveLength(0);
  });

  it('un archivo truncado a media entidad importa lo anterior', () => {
    const text = ['0', 'SECTION', '2', 'ENTITIES', ...line(0, 0, 4, 0), '0', 'CIRCLE', '8', '0', '10', '9'].join('\n');
    const { list, report } = run(text);
    expect(list.filter((e) => e.type === 'line')).toHaveLength(1);
    expect(report.imported.LINE).toBe(1);
  });

  it('las coordenadas ilegibles no crean geometría inválida', () => {
    const text = dxf(header(), entities('0', 'LINE', '8', '0', '10', 'NaN', '20', '0', '11', '5', '21', '0', ...line(0, 0, 2, 2)));
    const { list } = run(text);
    for (const e of list.filter((x): x is LineEntity => x.type === 'line')) {
      expect(Number.isFinite(e.start.x) && Number.isFinite(e.start.y)).toBe(true);
      expect(Number.isFinite(e.end.x) && Number.isFinite(e.end.y)).toBe(true);
    }
  });

  it('importar sobre un dibujo con contenido lo conserva', () => {
    const doc = createDocument();
    importDxfIntoDocument(doc, dxf(header(), entities(...line(0, 0, 1, 0))));
    importDxfIntoDocument(doc, dxf(header(), entities(...line(5, 5, 6, 5))));
    expect([...doc.data.entities.values()].filter((e) => e.type === 'line')).toHaveLength(2);
  });
});

describe('codificación', () => {
  it('los archivos anteriores a 2007 se leen con su página de códigos', () => {
    const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));
    const cabecera = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_1252\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n1\n1\n';
    const latin = Uint8Array.from([...ascii(cabecera), 0xd1, 0x55, 0xc3, 0x4f, ...ascii('\n0\nENDSEC\n0\nEOF\n')]);
    const text = decodeDxfBytes(latin);
    expect(text).toContain('ÑUÃO');
    const { list } = run(text);
    expect((list[0] as TextEntity).text).toBe('ÑUÃO');
  });

  it('los archivos modernos se leen como UTF-8', () => {
    const bytes = new TextEncoder().encode(dxf(header(), entities('0', 'TEXT', '8', '0', '10', '0', '20', '0', '40', '1', '1', 'Cimentación')));
    expect(decodeDxfBytes(bytes)).toContain('Cimentación');
  });
});
