import { describe, expect, it } from 'vitest';
import { drawingLabel, formatBytes, relativeTime } from './relativeTime';

// 18 sep 2026, 15:30 hora local
const NOW = new Date(2026, 8, 18, 15, 30).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();

describe('fechas relativas de dibujos recientes', () => {
  it('minutos y horas del mismo día', () => {
    expect(relativeTime(NOW - 20_000, NOW, 'es')).toBe('hace un momento');
    expect(relativeTime(NOW - 5 * 60_000, NOW, 'es')).toBe('hace 5 min');
    expect(relativeTime(at(18, 9), NOW, 'es')).toBe('hace 6 h');
    expect(relativeTime(NOW - 5 * 60_000, NOW, 'en')).toBe('5 min ago');
  });

  it('cuenta días por calendario: anoche a las 23:00 es «ayer», no «hace 16 h»', () => {
    expect(relativeTime(at(17, 23), NOW, 'es')).toBe('ayer');
    expect(relativeTime(at(15, 12), NOW, 'es')).toBe('hace 3 días');
    expect(relativeTime(at(17, 23), NOW, 'en')).toBe('yesterday');
  });

  it('a partir de una semana muestra la fecha, con año solo si es otro', () => {
    expect(relativeTime(at(2, 10), NOW, 'es')).toMatch(/2 sept?\.?/);
    expect(relativeTime(new Date(2025, 11, 24).getTime(), NOW, 'es')).toContain('2025');
  });

  it('tamaños y nombres visibles', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(64 * 1024 * 1024)).toBe('64 MB');
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(drawingLabel('Casa López.fmodel')).toBe('Casa López');
    expect(drawingLabel('plano')).toBe('plano');
  });
});
