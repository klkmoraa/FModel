import { describe, expect, it } from 'vitest';
import { isPaletteItem, parseStoredPalettes } from './paletteData';

describe('datos persistidos de paletas', () => {
  it('recupera únicamente paletas personalizadas con elementos completos', () => {
    const valid = {
      id: 'custom:mine',
      name: { es: 'Mis herramientas', en: 'My tools' },
      custom: true,
      items: [
        { kind: 'block', name: 'Puerta', scale: 2 },
        { kind: 'hatch', pattern: 'ANSI31', scale: 1, angle: 0 },
        { kind: 'command', cmd: 'LINE', args: [], label: { es: 'Línea', en: 'Line' }, icon: 'line' },
        { kind: 'preset', name: 'Muros', layer: 'Muros', lineweight: 25 },
        { kind: 'dimstyle', style: 'ISO-25', cmd: 'DIMLINEAR' },
      ],
    };

    expect(parseStoredPalettes(JSON.stringify([valid, { ...valid, id: 'rota', items: [{}] }]))).toEqual([valid]);
  });

  it('degrada JSON corrupto, null y estructuras inesperadas a una lista vacía', () => {
    expect(parseStoredPalettes('{roto')).toEqual([]);
    expect(parseStoredPalettes('null')).toEqual([]);
    expect(parseStoredPalettes(JSON.stringify({ items: [] }))).toEqual([]);
    expect(parseStoredPalettes(JSON.stringify([{ id: 'x', name: null, custom: true, items: [] }]))).toEqual([]);
  });

  it('rechaza números no finitos y discriminantes desconocidos', () => {
    expect(isPaletteItem({ kind: 'block', name: 'Puerta', scale: Infinity })).toBe(false);
    expect(isPaletteItem({ kind: 'hatch', pattern: 'ANSI31', scale: 0, angle: 0 })).toBe(false);
    expect(isPaletteItem({ kind: 'script', cmd: 'ERASE' })).toBe(false);
  });
});

