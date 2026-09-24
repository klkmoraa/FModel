import { describe, expect, it } from 'vitest';
import { createDocument } from '../../document/defaults';
import type { CircleEntity, LineEntity, LwPolylineEntity, TextEntity } from '../../document/types';
import { decodeDxfBytes, importDxfFile, importDxfIntoDocument } from './importDxf';
import { INPUT_LIMITS } from '../limits';
import { parseDxf } from './parser';

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
  it('rechaza más entidades que el límite antes de sustituir el dibujo', () => {
    const doc = createDocument();
    importDxfIntoDocument(doc, dxf(header(), entities(...line(0, 0, 1, 0))));
    const before = doc.data;
    const rec = { type: 'LINE', pairs: [[10, '0'], [20, '0'], [11, '1'], [21, '0']] as [number, string][] };
    const intermediate = parseDxf(dxf(header()));
    intermediate.entities = Array(INPUT_LIMITS.maxEntities + 1).fill(rec);
    expect(() => importDxfFile(doc, intermediate, { replace: true, format: 'DWG' })).toThrow(/demasiad|too many/i);
    expect(doc.data).toBe(before);
  });

  it('cuenta las cuatro líneas producidas por cada 3DFACE antes de sustituir el dibujo', () => {
    const doc = createDocument();
    const before = doc.data;
    const face = { type: '3DFACE', pairs: [[10, '0'], [20, '0'], [11, '1'], [21, '0'], [12, '1'], [22, '1'], [13, '0'], [23, '1']] as [number, string][] };
    const intermediate = parseDxf(dxf(header()));
    intermediate.entities = Array(Math.floor(INPUT_LIMITS.maxEntities / 4) + 1).fill(face);
    expect(() => importDxfFile(doc, intermediate, { replace: true, format: 'DWG' })).toThrow(/produciría demasiadas.*would produce too many/);
    expect(doc.data).toBe(before);
  });

  it('rechaza una polilínea textual con más puntos que el límite antes de sustituir el dibujo', () => {
    const doc = createDocument();
    importDxfIntoDocument(doc, dxf(header(), entities(...line(0, 0, 1, 0))));
    const before = doc.data;
    const points = '10\n0\n20\n0\n'.repeat(INPUT_LIMITS.maxPointsPerEntity + 1);
    const text = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n${points}0\nENDSEC\n0\nEOF\n`;
    expect(() => importDxfIntoDocument(doc, text, { replace: true })).toThrow(/demasiad|too many/i);
    expect(doc.data).toBe(before);
  });

  it('admite exactamente el límite de puntos durante el análisis', () => {
    const points = '10\n0\n20\n0\n'.repeat(INPUT_LIMITS.maxPointsPerEntity);
    const text = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n${points}0\nENDSEC\n0\nEOF\n`;
    expect(parseDxf(text).entities).toHaveLength(1);
  });

  it('detiene el parser al superar el total de entidades del DXF', () => {
    const text = `0\nSECTION\n2\nENTITIES\n${'0\nPOINT\n'.repeat(INPUT_LIMITS.maxEntities + 1)}0\nENDSEC\n0\nEOF\n`;
    expect(() => parseDxf(text)).toThrow(/El DXF tiene demasiadas.*The DXF has too many/);
  });

  it('cuenta los VERTEX de una POLYLINE también en la estructura procedente de DWG', () => {
    const doc = createDocument();
    const before = doc.data;
    const vertex = { type: 'VERTEX', pairs: [[10, '0'], [20, '0']] as [number, string][] };
    const intermediate = parseDxf(dxf(header()));
    intermediate.entities = [
      { type: 'POLYLINE', pairs: [] },
      ...Array(INPUT_LIMITS.maxPointsPerEntity + 1).fill(vertex),
      { type: 'SEQEND', pairs: [] },
    ];
    expect(() => importDxfFile(doc, intermediate, { replace: true, format: 'DWG' })).toThrow(/El DXF tiene demasiadas.*The DXF has too many/);
    expect(doc.data).toBe(before);
  });

  it('rechaza cantidades declaradas por HATCH que exceden sus datos reales', () => {
    const doc = createDocument();
    const before = doc.data;
    const text = dxf(header(), entities('0', 'HATCH', '91', '1', '92', '2', '72', '0', '73', '1', '93', '100001'));
    expect(() => importDxfIntoDocument(doc, text, { replace: true })).toThrow(/El DXF tiene demasiadas.*The DXF has too many/);
    expect(doc.data).toBe(before);
  });

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

  it('rechaza un patrón de tipo de línea con segmentos no finitos', () => {
    const text = dxf(
      header(),
      ['0', 'SECTION', '2', 'TABLES',
        '0', 'TABLE', '2', 'LTYPE',
        '0', 'LTYPE', '2', 'CORRUPTO', '73', '2', '49', '12', '49', 'NaN',
        '0', 'ENDTAB',
        '0', 'TABLE', '2', 'LAYER',
        '0', 'LAYER', '2', 'Muros', '6', 'CORRUPTO',
        '0', 'ENDTAB', '0', 'ENDSEC'],
      entities(...line(0, 0, 10, 0, 'Muros')),
    );
    const { doc, report } = run(text);
    expect([...doc.data.linetypes.values()].some((lt) => lt.name === 'CORRUPTO')).toBe(false);
    expect([...doc.data.linetypes.values()].every((lt) => lt.pattern.every(Number.isFinite))).toBe(true);
    expect(report.warnings.some((warning) => warning.includes('CORRUPTO'))).toBe(true);
  });

  it('omite una polilínea con un vértice no finito sin afectar entidades válidas', () => {
    const text = dxf(header(), entities(
      '0', 'LWPOLYLINE', '8', '0', '90', '2',
      '10', '0', '20', '0', '10', 'NaN', '20', '5',
      ...line(0, 0, 2, 0),
    ));
    const { list, report } = run(text);
    expect(list.map((entity) => entity.type)).toEqual(['line']);
    expect(report.ignored.LWPOLYLINE?.count).toBe(1);
  });

  it('no guarda un tamaño de punto no finito desde la cabecera', () => {
    const { doc } = run(dxf(header('9', '$PDMODE', '70', '35', '9', '$PDSIZE', '40', 'Infinity')));
    expect(doc.settings.pointDisplay).toEqual({ mode: 35, size: 0 });
  });

  it('omite un bloque con punto base no finito y su inserción', () => {
    const text = dxf(
      header(),
      ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'MalBase', '10', 'NaN', '20', '0',
        ...line(0, 0, 1, 0), '0', 'ENDBLK', '0', 'ENDSEC'],
      entities('0', 'INSERT', '2', 'MalBase', '10', '2', '20', '3', ...line(0, 0, 2, 0)),
    );
    const { doc, report, list } = run(text);
    expect([...doc.data.blocks.values()].some((block) => block.name === 'MalBase')).toBe(false);
    expect(list.map((entity) => entity.type)).toEqual(['line']);
    expect(report.warnings.some((warning) => warning.includes('MalBase'))).toBe(true);
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

describe('transparencia de objetos', () => {
  it('distingue PorBloque (0x01000000) de un valor explícito', () => {
    const text = dxf(header(), entities('0', 'LINE', '8', '0', '440', String(0x01000000), '10', '0', '20', '0', '11', '1', '21', '0', '0', 'LINE', '8', '0', '440', String(0x02000000 | 127), '10', '0', '20', '0', '11', '1', '21', '0'));
    const { list } = run(text);
    expect(list.map((e) => e.transparency)).toEqual(['ByBlock', 50]);
  });
});
