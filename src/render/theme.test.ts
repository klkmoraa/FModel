import { describe, expect, it } from 'vitest';
import { THEME_DAY, THEME_NIGHT } from './theme';

describe('render theme semantics', () => {
  it('reserva blanco puro para la hoja física en ambos temas', () => {
    expect(THEME_DAY.sheet).toBe('#ffffff');
    expect(THEME_NIGHT.sheet).toBe('#ffffff');
  });

  it('conserva los verdes técnicos del CAD fuera del acento de interacción', () => {
    expect(THEME_DAY.axisY).toBe('rgba(70,140,9,0.4)');
    expect(THEME_DAY.crossingStroke).toBe('#468c09');
    expect(THEME_DAY.diffAdded).toBe('#468c09');
    expect(THEME_NIGHT.axisY).toBe('rgba(85,201,144,0.45)');
    expect(THEME_NIGHT.crossingStroke).toBe('#55c990');
    expect(THEME_NIGHT.diffAdded).toBe('#55c990');
  });
});
