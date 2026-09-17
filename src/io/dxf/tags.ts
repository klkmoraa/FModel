import type { Vec2 } from '../../geometry/vec';

/** Formato numérico DXF: hasta 12 decimales significativos, sin notación innecesaria. */
export function num(v: number): string {
  if (!Number.isFinite(v)) return '0.0';
  if (Number.isInteger(v)) return `${v}.0`;
  const s = Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-10 && v !== 0) ? v.toExponential(12) : String(Math.round(v * 1e12) / 1e12);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
}

/** Códigos de grupo cuyos valores son números de coma flotante (10–59, 110–149, 210–239, 460–469, 1010–1059). */
function isFloatCode(code: number): boolean {
  return (code >= 10 && code <= 59) || (code >= 110 && code <= 149) || (code >= 210 && code <= 239) || (code >= 460 && code <= 469) || (code >= 1010 && code <= 1059);
}

/** Búfer de pares código/valor en orden de escritura. */
export class TagBuffer {
  readonly lines: string[] = [];

  tag(code: number, value: string | number | boolean) {
    let v: string;
    if (typeof value === 'boolean') v = value ? '1' : '0';
    else if (typeof value === 'number') v = isFloatCode(code) ? num(value) : String(Math.round(value));
    else v = value.replace(/\r?\n/g, ' ');
    this.lines.push(String(code).padStart(3, ' '), v);
  }

  point(code: number, p: Vec2, z = 0) {
    this.tag(code, p.x);
    this.tag(code + 10, p.y);
    this.tag(code + 20, z);
  }

  point2(code: number, p: Vec2) {
    this.tag(code, p.x);
    this.tag(code + 10, p.y);
  }

  append(other: TagBuffer) {
    for (const l of other.lines) this.lines.push(l);
  }

  toString(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

/** Asignador de handles hexadecimales únicos. */
export class HandleSeed {
  private n: number;
  constructor(start = 0x100) {
    this.n = start;
  }
  next(): string {
    return (this.n++).toString(16).toUpperCase();
  }
  get seed(): string {
    return this.n.toString(16).toUpperCase();
  }
}

/** Nombres de tabla DXF válidos: sin caracteres reservados y sin espacios iniciales/finales. */
export function dxfName(name: string, fallback: string): string {
  const s = name.replace(/[<>/\\":;?*|=,`]/g, '_').trim();
  return s || fallback;
}
