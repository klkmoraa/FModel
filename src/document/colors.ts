import type { ColorValue } from './types';

/** Tabla ACI (AutoCAD Color Index) 0–255 como enteros 0xRRGGBB. */
export const ACI: readonly number[] = buildAci();

function buildAci(): number[] {
  const t = new Array<number>(256).fill(0);
  const base = [0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffffff, 0x808080, 0xc0c0c0];
  base.forEach((c, i) => (t[i] = c));
  const hues: [number, number, number][] = [];
  const steps = [0, 63, 127, 191, 255];
  // 24 tonos en pasos de 15°
  for (let h = 0; h < 24; h++) {
    const seg = Math.floor(h / 4);
    const k = h % 4;
    const up = steps[k];
    const down = steps[4 - k];
    const rgb: [number, number, number][] = [
      [255, up, 0],
      [down, 255, 0],
      [0, 255, up],
      [0, down, 255],
      [up, 0, 255],
      [255, 0, down],
    ];
    hues.push(rgb[seg]);
  }
  const variants: [number, number][] = [
    [255, 0],
    [255, 170],
    [189, 0],
    [189, 126],
    [129, 0],
    [129, 86],
    [104, 0],
    [104, 69],
    [79, 0],
    [79, 53],
  ];
  for (let h = 0; h < 24; h++) {
    for (let v = 0; v < 10; v++) {
      const [V, P] = variants[v];
      const [r, g, b] = hues[h].map((c) => (P ? P + Math.floor(((V - P) * c) / 255) : Math.floor((c * V) / 255)));
      t[10 + h * 10 + v] = (r << 16) | (g << 8) | b;
    }
  }
  const grays = [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff];
  grays.forEach((c, i) => (t[250 + i] = c));
  return t;
}

export const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export function aciToHex(index: number): string {
  return hex(ACI[Math.max(0, Math.min(255, Math.round(index)))]);
}

export function parseHex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** ACI más cercano a un color RGB (para DXF). */
export function nearestAci(hexColor: string): number {
  const [r, g, b] = parseHex(hexColor);
  let best = 7;
  let bestD = Infinity;
  for (let i = 1; i < 256; i++) {
    const c = ACI[i];
    const d = (((c >> 16) & 255) - r) ** 2 + (((c >> 8) & 255) - g) ** 2 + ((c & 255) - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function isByLayer(c: ColorValue): boolean {
  return c === 'ByLayer';
}
export function isByBlock(c: ColorValue): boolean {
  return c === 'ByBlock';
}

export function colorLabel(c: ColorValue, lang: 'es' | 'en' = 'es'): string {
  if (c === 'ByLayer') return lang === 'es' ? 'PorCapa' : 'ByLayer';
  if (c === 'ByBlock') return lang === 'es' ? 'PorBloque' : 'ByBlock';
  if (c.startsWith('aci:')) {
    const i = Number(c.slice(4));
    const names: Record<number, [string, string]> = {
      1: ['Rojo', 'Red'],
      2: ['Amarillo', 'Yellow'],
      3: ['Verde', 'Green'],
      4: ['Cian', 'Cyan'],
      5: ['Azul', 'Blue'],
      6: ['Magenta', 'Magenta'],
      7: ['Blanco/Negro', 'White/Black'],
    };
    return names[i] ? names[i][lang === 'es' ? 0 : 1] : `${lang === 'es' ? 'Color' : 'Color'} ${i}`;
  }
  return c.toUpperCase();
}

/**
 * Resuelve un color concreto (no ByLayer/ByBlock) a hex para pantalla.
 * ACI 7 invierte según el fondo, como en AutoCAD.
 */
export function displayColor(c: ColorValue, darkBackground: boolean): string {
  if (c.startsWith('aci:')) {
    const i = Number(c.slice(4));
    if (i === 7) return darkBackground ? '#ffffff' : '#14171a';
    return aciToHex(i);
  }
  if (c.startsWith('#')) return c;
  return darkBackground ? '#ffffff' : '#14171a';
}

export function toGrayscale(hexColor: string): string {
  const [r, g, b] = parseHex(hexColor);
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return hex((y << 16) | (y << 8) | y);
}
