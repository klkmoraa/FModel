/** Lector DXF ASCII por códigos de grupo (R12–R2018). */
import { INPUT_LIMITS, InputLimitError } from '../limits';

export type Pair = [number, string];

export interface DxfRecord {
  type: string;
  pairs: Pair[];
}

export interface DxfBlock {
  name: string;
  handle?: string;
  flags: number;
  base: { x: number; y: number };
  layer: string;
  entities: DxfRecord[];
  description: string;
}

export interface DxfTable {
  name: string;
  records: DxfRecord[];
}

export interface DxfFile {
  header: Map<string, Pair[]>;
  tables: Map<string, DxfTable>;
  blocks: DxfBlock[];
  entities: DxfRecord[];
  objects: DxfRecord[];
  version: string;
}

export class DxfParseError extends Error {}

const limitError = () => new InputLimitError('El DXF tiene demasiadas entidades, registros o puntos. / The DXF has too many entities, records, or points.');
const MAX_DXF_PAIRS = INPUT_LIMITS.maxEntities * 16;
const MAX_DXF_RECORDS = INPUT_LIMITS.maxEntities * 2;

function recordBudget() {
  let records = 0;
  let entities = 0;
  let polylinePoints = 0;
  let inPolyline = false;
  return (record: DxfRecord, isEntity: boolean) => {
    if (++records > MAX_DXF_RECORDS) throw limitError();
    if (isEntity && ++entities > INPUT_LIMITS.maxEntities) throw limitError();
    if (record.pairs.length > INPUT_LIMITS.maxPointsPerEntity * 6) throw limitError();
    let points = 0;
    for (const [code, value] of record.pairs) {
      if (code >= 10 && code <= 18 && ++points > INPUT_LIMITS.maxPointsPerEntity) throw limitError();
      if (record.type === 'HATCH' && (code === 91 || code === 93 || code === 95 || code === 96 || code === 97) && Number(value) > record.pairs.length) throw limitError();
    }
    if (isEntity) {
      if (record.type === 'POLYLINE') {
        inPolyline = true;
        polylinePoints = 0;
      } else if (inPolyline && record.type === 'VERTEX' && ++polylinePoints > INPUT_LIMITS.maxPointsPerEntity) throw limitError();
      else if (record.type === 'SEQEND') inPolyline = false;
    }
  };
}

/** Verifica también los objetos intermedios que entrega el conversor DWG antes de mutar el documento. */
export function assertDxfLimits(file: DxfFile): void {
  if (file.blocks.length > INPUT_LIMITS.maxBlocks) throw limitError();
  let entityCount = file.entities.length;
  for (const block of file.blocks) {
    entityCount += block.entities.length;
    if (entityCount > INPUT_LIMITS.maxEntities) throw limitError();
  }
  const check = recordBudget();
  for (const table of file.tables.values()) for (const record of table.records) check(record, false);
  for (const block of file.blocks) for (const record of block.entities) check(record, true);
  for (const record of file.entities) check(record, true);
  for (const record of file.objects) check(record, false);
}

export function tokenize(text: string): Pair[] {
  if (text.length > INPUT_LIMITS.maxCompressedBytes) throw limitError();
  const out: Pair[] = [];
  let offset = 0;
  let lineNumber = 1;
  const nextLine = () => {
    const start = offset;
    while (offset < text.length && text[offset] !== '\r' && text[offset] !== '\n') offset++;
    const line = text.slice(start, offset);
    const terminated = offset < text.length;
    if (text[offset] === '\r' && text[offset + 1] === '\n') offset += 2;
    else if (terminated) offset++;
    return { line, terminated };
  };
  while (offset < text.length) {
    const codeLine = nextLine();
    if (!codeLine.terminated) break;
    const valueLine = nextLine();
    const codeStr = codeLine.line.trim();
    if (codeStr === '') {
      // solo se toleran líneas vacías al final del archivo
      if (valueLine.line.trim() === '' && text.slice(offset).trim() === '') break;
      throw new DxfParseError(`Línea de código vacía en la línea ${lineNumber}: el DXF está truncado o mal formado.`);
    }
    const code = Number.parseInt(codeStr, 10);
    if (Number.isNaN(code)) throw new DxfParseError(`Código de grupo no numérico en la línea ${lineNumber}: «${codeStr.slice(0, 20)}». ¿Es un DXF binario o un DWG?`);
    out.push([code, valueLine.line]);
    if (out.length > MAX_DXF_PAIRS) throw limitError();
    lineNumber += 2;
  }
  return out;
}

/** Divide una secuencia de pares en registros que empiezan por código 0. */
function records(pairs: Pair[], start: number, endType: string, onRecord: (record: DxfRecord) => void): { list: DxfRecord[]; next: number } {
  const list: DxfRecord[] = [];
  let i = start;
  let cur: DxfRecord | null = null;
  let pointCount = 0;
  const append = () => {
    if (!cur) return;
    onRecord(cur);
    list.push(cur);
  };
  while (i < pairs.length) {
    const [code, value] = pairs[i];
    if (code === 0) {
      const v = value.trim();
      if (v === endType || v === 'ENDSEC') {
        append();
        return { list, next: i };
      }
      append();
      cur = { type: v, pairs: [] };
      pointCount = 0;
    } else if (cur) {
      if (code >= 10 && code <= 18 && ++pointCount > INPUT_LIMITS.maxPointsPerEntity) throw limitError();
      cur.pairs.push([code, value]);
      if (cur.pairs.length > INPUT_LIMITS.maxPointsPerEntity * 6) throw limitError();
    }
    i++;
  }
  append();
  return { list, next: i };
}

export function parseDxf(text: string): DxfFile {
  if (text.startsWith('AutoCAD Binary DXF')) throw new DxfParseError('DXF binario no admitido. Guarda el archivo como DXF ASCII. / Binary DXF not supported; save as ASCII DXF.');
  const pairs = tokenize(text);
  const file: DxfFile = { header: new Map(), tables: new Map(), blocks: [], entities: [], objects: [], version: '' };
  const checkRecord = recordBudget();
  let i = 0;
  while (i < pairs.length) {
    const [code, value] = pairs[i];
    if (code === 0 && value.trim() === 'SECTION') {
      const name = pairs[i + 1]?.[1]?.trim();
      i += 2;
      if (name === 'HEADER') {
        let varName = '';
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1].trim() === 'ENDSEC')) {
          const [c, v] = pairs[i];
          if (c === 9) {
            varName = v.trim();
            file.header.set(varName, []);
          } else if (varName) file.header.get(varName)!.push([c, v]);
          i++;
        }
        file.version = file.header.get('$ACADVER')?.[0]?.[1]?.trim() ?? '';
      } else if (name === 'TABLES') {
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1].trim() === 'ENDSEC')) {
          if (pairs[i][0] === 0 && pairs[i][1].trim() === 'TABLE') {
            const tname = pairs[i + 1]?.[1]?.trim() ?? '';
            i += 2;
            // saltar cabecera de tabla hasta el primer 0
            while (i < pairs.length && pairs[i][0] !== 0) i++;
            const { list, next } = records(pairs, i, 'ENDTAB', (record) => checkRecord(record, false));
            file.tables.set(tname, { name: tname, records: list.filter((r) => r.type !== 'TABLE') });
            i = next + 1;
          } else i++;
        }
      } else if (name === 'BLOCKS') {
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1].trim() === 'ENDSEC')) {
          if (pairs[i][0] === 0 && pairs[i][1].trim() === 'BLOCK') {
            i++;
            const head: Pair[] = [];
            while (i < pairs.length && pairs[i][0] !== 0) head.push(pairs[i++]);
            const get = (c: number) => head.find((p) => p[0] === c)?.[1];
            const { list, next } = records(pairs, i, 'ENDBLK', (record) => checkRecord(record, true));
            file.blocks.push({
              name: (get(2) ?? get(3) ?? '').trim(),
              handle: get(5)?.trim(),
              flags: Number(get(70) ?? 0),
              base: { x: Number(get(10) ?? 0), y: Number(get(20) ?? 0) },
              layer: (get(8) ?? '0').trim(),
              entities: list,
              description: (get(4) ?? '').trim(),
            });
            if (file.blocks.length > INPUT_LIMITS.maxBlocks) throw limitError();
            i = next;
            // saltar ENDBLK y sus pares
            i++;
            while (i < pairs.length && pairs[i][0] !== 0) i++;
          } else i++;
        }
      } else if (name === 'ENTITIES') {
        const { list, next } = records(pairs, i, 'ENDSEC', (record) => checkRecord(record, true));
        file.entities = list;
        i = next;
      } else if (name === 'OBJECTS') {
        const { list, next } = records(pairs, i, 'ENDSEC', (record) => checkRecord(record, false));
        file.objects = list;
        i = next;
      } else {
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1].trim() === 'ENDSEC')) i++;
      }
    }
    i++;
  }
  return file;
}

/** Utilidades de lectura de registros. */
export class R {
  constructor(public rec: DxfRecord) {}
  str(code: number, def = ''): string {
    const p = this.rec.pairs.find((x) => x[0] === code);
    return p ? p[1].trim() : def;
  }
  raw(code: number, def = ''): string {
    const p = this.rec.pairs.find((x) => x[0] === code);
    return p ? p[1] : def;
  }
  num(code: number, def = 0): number {
    const p = this.rec.pairs.find((x) => x[0] === code);
    const v = p ? Number(p[1]) : NaN;
    return Number.isFinite(v) ? v : def;
  }
  has(code: number): boolean {
    return this.rec.pairs.some((x) => x[0] === code);
  }
  all(code: number): string[] {
    return this.rec.pairs.filter((x) => x[0] === code).map((x) => x[1]);
  }
  nums(code: number): number[] {
    return this.all(code).map(Number);
  }
  pt(xc: number, def = { x: 0, y: 0 }): { x: number; y: number } {
    return { x: this.num(xc, def.x), y: this.num(xc + 10, def.y) };
  }
}
