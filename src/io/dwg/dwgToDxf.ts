import type { DwgDatabase } from '@mlightcad/libredwg-web';
import type { DxfFile, DxfRecord } from '../dxf/parser';

/**
 * Correcciones al DXF que escribe LibreDWG a partir de un DWG, con los datos que la propia
 * LibreDWG lee bien del mismo archivo:
 * - capas: el DXF de LibreDWG marca todas las capas como apagadas (código 62 negativo);
 * - tablas: las `ACAD_TABLE` salen sin el nombre de su bloque de representación `*T`.
 */

/** Grosores DWG (índice) → centésimas de milímetro; 29 PorCapa, 30 PorBloque, 31 Por defecto. */
const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

export function dwgLineweight(index: number | undefined): number {
  if (index === undefined || index === 29) return -1;
  if (index === 30) return -2;
  if (index === 31) return -3;
  return LINEWEIGHTS[index] ?? -3;
}

/** Registros LAYER del DXF reconstruidos con los estados que LibreDWG lee del DWG. */
export function dwgLayerRecords(db: DwgDatabase): DxfRecord[] {
  return db.tables.LAYER.entries.map((l) => {
    const aci = l.colorIndex >= 1 && l.colorIndex <= 255 ? l.colorIndex : 7;
    const flags = (l.frozen ? 1 : 0) | (l.frozenInNew ? 2 : 0) | ((l.standardFlag ?? 0) & 8 ? 4 : 0);
    const pairs: DxfRecord['pairs'] = [
      [5, l.handle],
      [2, l.name],
      [70, String(flags)],
      [62, String(l.off ? -aci : aci)],
    ];
    if (l.colorIndex === 256 && l.color !== 0xffffff) pairs.push([420, String(l.color)]);
    pairs.push([6, l.lineType || 'Continuous'], [370, String(dwgLineweight(l.lineweight))], [290, l.plotFlag === 0 ? '0' : '1']);
    return { type: 'LAYER', pairs };
  });
}

/**
 * AutoCAD crea un bloque anónimo `*T<n>` por tabla, en orden de creación. Si hay tantos bloques
 * `*T` como tablas sin nombre de bloque, se emparejan por orden de handle; si no, no se adivina.
 */
export function nameTableBlocks(dxf: DxfFile): number {
  const tables = [...dxf.entities, ...dxf.blocks.flatMap((b) => b.entities)].filter((r) => r.type === 'ACAD_TABLE' && !r.pairs.some(([c]) => c === 2));
  const blocks = dxf.blocks.filter((b) => /^\*T\d+$/i.test(b.name)).sort((a, b) => parseInt(a.handle ?? '0', 16) - parseInt(b.handle ?? '0', 16));
  if (!tables.length || tables.length !== blocks.length) return 0;
  const handle = (r: DxfRecord) => parseInt(r.pairs.find(([c]) => c === 5)?.[1] ?? '0', 16);
  tables.sort((a, b) => handle(a) - handle(b)).forEach((t, i) => t.pairs.push([2, blocks[i].name]));
  return tables.length;
}

export function applyDwgFixes(dxf: DxfFile, db: DwgDatabase): DxfFile {
  const layers = dxf.tables.get('LAYER');
  if (layers) layers.records = dwgLayerRecords(db);
  else dxf.tables.set('LAYER', { name: 'LAYER', records: dwgLayerRecords(db) });
  nameTableBlocks(dxf);
  return dxf;
}
