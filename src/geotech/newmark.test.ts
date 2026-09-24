import { describe, expect, it } from 'vitest';
import { calculateNewmark, NEWMARK_DEFAULTS, newmarkRadiusRatio } from './newmark';

describe('carta de Newmark', () => {
  it('reproduce el ejercicio del video', () => {
    const result = calculateNewmark(NEWMARK_DEFAULTS);
    expect(result.footprintArea).toBeCloseTo(74, 6);
    expect(result.rows.map((row) => row.radius)).toEqual([0.8094, 1.2015, 1.5543, 1.911, 2.2992, 2.7528, 3.3291, 4.1613, 5.7249, 7.5705]);
    expect(result.rows.slice(0, 9).map((row) => Number(row.occupiedArea.toFixed(4)))).toEqual([2.0581, 2.4771, 3.0544, 3.8832, 4.9053, 6.4499, 9.5181, 16.0703, 21.1529]);
    expect(result.totalStress).toBeCloseTo(4.7831, 4);
    expect(result.rows[9].boundary).toBe(true);
    expect(result.rows[9].stress).toBe(0);
  });

  it('calcula la relación r/z de Boussinesq', () => {
    expect(newmarkRadiusRatio(0.5)).toBeCloseTo(0.76642, 5);
  });
});

