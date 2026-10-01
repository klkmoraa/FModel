import { describe, expect, it } from 'vitest';
import { nextSegmentIndex } from './segmented';

describe('nextSegmentIndex', () => {
  const all = [true, true, true, true];

  it('mueve con las flechas y da la vuelta en los extremos', () => {
    expect(nextSegmentIndex('ArrowRight', 0, all)).toBe(1);
    expect(nextSegmentIndex('ArrowRight', 3, all)).toBe(0);
    expect(nextSegmentIndex('ArrowLeft', 0, all)).toBe(3);
    expect(nextSegmentIndex('ArrowDown', 1, all)).toBe(2);
    expect(nextSegmentIndex('ArrowUp', 1, all)).toBe(0);
  });

  it('salta las opciones deshabilitadas', () => {
    const enabled = [true, false, false, true];
    expect(nextSegmentIndex('ArrowRight', 0, enabled)).toBe(3);
    expect(nextSegmentIndex('ArrowLeft', 3, enabled)).toBe(0);
    expect(nextSegmentIndex('ArrowRight', 3, enabled)).toBe(0);
  });

  it('Inicio y Fin eligen la primera y la última habilitada', () => {
    const enabled = [false, true, true, false];
    expect(nextSegmentIndex('Home', 2, enabled)).toBe(1);
    expect(nextSegmentIndex('End', 1, enabled)).toBe(2);
  });

  it('ignora teclas ajenas y listas sin opciones habilitadas', () => {
    expect(nextSegmentIndex('Enter', 0, all)).toBeNull();
    expect(nextSegmentIndex('a', 0, all)).toBeNull();
    expect(nextSegmentIndex('ArrowRight', 0, [false, false])).toBeNull();
    expect(nextSegmentIndex('Home', 0, [])).toBeNull();
  });

  it('tolera un índice actual fuera de rango', () => {
    expect(nextSegmentIndex('ArrowRight', -1, all)).toBe(0);
    expect(nextSegmentIndex('ArrowLeft', -1, all)).toBe(3);
    expect(nextSegmentIndex('ArrowRight', 9, all)).toBe(0);
  });

  it('con una sola opción habilitada se queda en ella', () => {
    expect(nextSegmentIndex('ArrowRight', 1, [false, true, false])).toBe(1);
    expect(nextSegmentIndex('ArrowLeft', 1, [false, true, false])).toBe(1);
  });
});
