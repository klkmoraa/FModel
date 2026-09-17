import type { Id } from './types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
let counter = 0;
const session = randomChunk(4);

function randomChunk(n: number): string {
  let s = '';
  const buf = new Uint8Array(n);
  (globalThis.crypto ?? { getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(buf);
  for (const b of buf) s += ALPHABET[b % 36];
  return s;
}

/**
 * ID estable, corto y ordenable por creación dentro de una sesión:
 * `<sesión 4><contador base36><aleatorio 3>`. No se reutiliza nunca.
 */
export function newId(prefix = ''): Id {
  counter = (counter + 1) % 1_679_616;
  return `${prefix}${session}${counter.toString(36).padStart(4, '0')}${randomChunk(3)}`;
}
