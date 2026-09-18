import { describe, expect, it } from 'vitest';
import type { WheelSample } from './wheelInput';
import { WheelClassifier, wheelPixels } from './wheelInput';

const ev = (p: Partial<WheelSample> & { timeStamp: number }): WheelSample => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, ...p });

/** Dos dedos hacia abajo en un panel táctil de macOS: píxeles pequeños y seguidos, con algo de inercia. */
function trackpadScroll(t0: number, n = 6): WheelSample[] {
  return Array.from({ length: n }, (_, i) => ev({ deltaX: i % 2 ? 0.5 : 0, deltaY: 4 + i * 2.5, timeStamp: t0 + i * 16 }));
}

/** Rueda de ratón: una muesca entera, vertical, con pausas entre golpes. */
function mouseNotches(t0: number, n = 3): WheelSample[] {
  return Array.from({ length: n }, (_, i) => ev({ deltaY: 100, timeStamp: t0 + i * 140 }));
}

describe('wheelPixels', () => {
  it('normaliza líneas y páginas a píxeles', () => {
    expect(wheelPixels(3, 0)).toBe(3);
    expect(wheelPixels(3, 1)).toBe(90);
    expect(wheelPixels(1, 2)).toBe(400);
  });
});

describe('WheelClassifier', () => {
  it('encuadra ya en el primer evento de un panel táctil', () => {
    const c = new WheelClassifier();
    const a = c.classify(ev({ deltaX: 12.5, deltaY: 3.25, timeStamp: 0 }));
    expect(a).toEqual({ kind: 'pan', dx: -12.5, dy: -3.25 });
  });

  it('encuadra un desplazamiento vertical puro de dos dedos (el caso que fallaba)', () => {
    const c = new WheelClassifier();
    // deltaX = 0 y deltaY entero: antes se tomaba por rueda y hacía zoom
    const samples = Array.from({ length: 5 }, (_, i) => ev({ deltaY: 6, timeStamp: i * 16 }));
    const kinds = samples.map((s) => c.classify(s).kind);
    expect(kinds.at(-1)).toBe('pan');
    expect(kinds.filter((k) => k === 'pan').length).toBeGreaterThanOrEqual(3);
  });

  it('el signo del encuadre sigue al dedo (desplazamiento natural)', () => {
    const c = new WheelClassifier();
    for (const s of trackpadScroll(0)) c.classify(s);
    const a = c.classify(ev({ deltaY: -10.5, timeStamp: 200 }));
    // dedos hacia abajo → deltaY negativo → el lienzo baja con ellos
    expect(a).toEqual({ kind: 'pan', dx: -0, dy: 10.5 });
  });

  it('hace zoom con una rueda de ratón', () => {
    const c = new WheelClassifier();
    for (const s of mouseNotches(0)) expect(c.classify(s).kind).toBe('zoom');
    expect(c.isTrackpad).toBe(false);
  });

  it('hace zoom cuando la rueda informa en líneas (Firefox)', () => {
    const c = new WheelClassifier();
    const a = c.classify(ev({ deltaY: 3, deltaMode: 1, timeStamp: 0 }));
    expect(a).toEqual({ kind: 'zoom', delta: 90 });
  });

  it('cambia a zoom si se pasa del panel táctil al ratón', () => {
    const c = new WheelClassifier();
    for (const s of trackpadScroll(0)) c.classify(s);
    expect(c.isTrackpad).toBe(true);
    for (const s of mouseNotches(1000, 4)) c.classify(s);
    expect(c.classify(ev({ deltaY: 100, timeStamp: 1600 })).kind).toBe('zoom');
  });

  it('Ctrl+rueda siempre hace zoom, y el pellizco se amplifica', () => {
    const c = new WheelClassifier();
    expect(c.classify(ev({ deltaY: 2.5, ctrlKey: true, timeStamp: 0 }))).toEqual({ kind: 'zoom', delta: 20 });
    // Ctrl+rueda de ratón: sin amplificar, o el salto sería enorme
    expect(c.classify(ev({ deltaY: 120, ctrlKey: true, timeStamp: 100 }))).toEqual({ kind: 'zoom', delta: 120 });
  });

  it('el pellizco no altera la confianza en el dispositivo', () => {
    const c = new WheelClassifier();
    for (const s of mouseNotches(0)) c.classify(s);
    const before = c.confidence;
    c.classify(ev({ deltaY: 3.5, ctrlKey: true, timeStamp: 500 }));
    expect(c.confidence).toBe(before);
  });

  it('Mayús+rueda encuadra en horizontal con un ratón', () => {
    const c = new WheelClassifier();
    for (const s of mouseNotches(0)) c.classify(s);
    expect(c.classify(ev({ deltaY: 100, shiftKey: true, timeStamp: 500 }))).toEqual({ kind: 'pan', dx: -100, dy: 0 });
  });

  it('las preferencias fijas mandan sobre la deducción', () => {
    const c = new WheelClassifier();
    for (const s of trackpadScroll(0)) c.classify(s);
    expect(c.classify(ev({ deltaY: 8.5, timeStamp: 300 }), 'zoom').kind).toBe('zoom');
    const forced = new WheelClassifier();
    expect(forced.classify(ev({ deltaY: 100, timeStamp: 0 }), 'pan')).toEqual({ kind: 'pan', dx: -0, dy: -100 });
  });

  it('la confianza se mantiene acotada', () => {
    const c = new WheelClassifier();
    for (let i = 0; i < 50; i++) c.classify(ev({ deltaX: 1.5, deltaY: 2.5, timeStamp: i * 16 }));
    expect(c.confidence).toBeLessThanOrEqual(4);
    c.reset();
    expect(c.confidence).toBe(0);
  });
});
