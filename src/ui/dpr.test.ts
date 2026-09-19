import { describe, expect, it } from 'vitest';
import { effectiveDpr } from './dpr';

describe('effectiveDpr (UI-002)', () => {
  it('normaliza valores ausentes, inválidos y demasiado altos', () => {
    expect(effectiveDpr(0)).toBe(1);
    expect(effectiveDpr(Number.NaN)).toBe(1);
    expect(effectiveDpr(1.5)).toBe(1.5);
    expect(effectiveDpr(8)).toBe(3);
  });
});
