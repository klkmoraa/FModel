import { describe, expect, it } from 'vitest';
import tokensCss from '../styles/tokens.css?raw';
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
    expect(THEME_NIGHT.axisY).toBe('rgba(114,207,74,0.45)');
    expect(THEME_NIGHT.crossingStroke).toBe('#72cf4a');
    expect(THEME_NIGHT.diffAdded).toBe('#72cf4a');
  });

  it('toma el acento y las familias de tokens.css, sin duplicarlos', () => {
    const day = tokensCss.match(/:root \{[\s\S]*?--fs-family-modelo:\s*(#[0-9a-f]{6})/i)?.[1];
    const night = tokensCss.match(/:root\[data-theme='noche'\] \{[\s\S]*?--fs-family-modelo:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(THEME_DAY.accent).toBe(day?.toLowerCase());
    expect(THEME_NIGHT.accent).toBe(night?.toLowerCase());
  });
});
