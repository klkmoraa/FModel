/** Lector DXF ASCII por códigos de grupo (R12–R2018). */

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

export function tokenize(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeStr = lines[i].trim();
    if (codeStr === '') {
      // solo se toleran líneas vacías al final del archivo
      if (lines.slice(i).every((l) => l.trim() === '')) break;
      throw new DxfParseError(`Línea de código vacía en la línea ${i + 1}: el DXF está truncado o mal formado.`);
    }
    const code = Number.parseInt(codeStr, 10);
    if (Number.isNaN(code)) throw new DxfParseError(`Código de grupo no numérico en la línea ${i + 1}: «${codeStr.slice(0, 20)}». ¿Es un DXF binario o un DWG?`);
    out.push([code, lines[i + 1]]);
  }
  return out;
}

/** Divide una secuencia de pares en registros que empiezan por código 0. */
function records(pairs: Pair[], start: number, endType: string): { list: DxfRecord[]; next: number } {
  const list: DxfRecord[] = [];
  let i = start;
  let cur: DxfRecord | null = null;
  while (i < pairs.length) {
    const [code, value] = pairs[i];
    if (code === 0) {
      const v = value.trim();
      if (v === endType || v === 'ENDSEC') {
        if (cur) list.push(cur);
        return { list, next: i };
      }
      if (cur) list.push(cur);
      cur = { type: v, pairs: [] };
    } else if (cur) cur.pairs.push([code, value]);
    i++;
  }
  if (cur) list.push(cur);
  return { list, next: i };
}

export function parseDxf(text: string): DxfFile {
  if (text.startsWith('AutoCAD Binary DXF')) throw new DxfParseError('DXF binario no admitido. Guarda el archivo como DXF ASCII. / Binary DXF not supported; save as ASCII DXF.');
  const pairs = tokenize(text);
  const file: DxfFile = { header: new Map(), tables: new Map(), blocks: [], entities: [], objects: [], version: '' };
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
            const { list, next } = records(pairs, i, 'ENDTAB');
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
            const { list, next } = records(pairs, i, 'ENDBLK');
            file.blocks.push({
              name: (get(2) ?? get(3) ?? '').trim(),
              handle: get(5)?.trim(),
              flags: Number(get(70) ?? 0),
              base: { x: Number(get(10) ?? 0), y: Number(get(20) ?? 0) },
              layer: (get(8) ?? '0').trim(),
              entities: list,
              description: (get(4) ?? '').trim(),
            });
            i = next;
            // saltar ENDBLK y sus pares
            i++;
            while (i < pairs.length && pairs[i][0] !== 0) i++;
          } else i++;
        }
      } else if (name === 'ENTITIES') {
        const { list, next } = records(pairs, i, 'ENDSEC');
        file.entities = list;
        i = next;
      } else if (name === 'OBJECTS') {
        const { list, next } = records(pairs, i, 'ENDSEC');
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
