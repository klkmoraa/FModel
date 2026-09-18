import type { WheelMode } from '../editor/preferences';

/**
 * Interpretación de la rueda: distingue una rueda de ratón (cada muesca hace zoom, como
 * en AutoCAD) de un panel táctil, donde dos dedos deben encuadrar y el pellizco hacer zoom.
 *
 * El navegador no dice qué dispositivo generó el evento, así que se deduce del rastro que
 * deja cada uno y la confianza se acumula entre eventos:
 *
 *   · rueda    → informa en líneas o páginas (deltaMode ≠ 0), o en saltos grandes, enteros
 *                y siempre verticales;
 *   · panel    → informa en píxeles, con desplazamiento horizontal, valores fraccionarios
 *                por la inercia y ráfagas rápidas de pasos pequeños.
 *
 * Cuando el resultado no convence, la preferencia «wheelMode» lo fija a mano.
 */

/** Lo mínimo de un WheelEvent; así la clasificación se prueba sin DOM. */
export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey?: boolean;
  timeStamp: number;
}

/**
 * Qué hacer con el evento. En «pan», dx/dy vienen en píxeles de arrastre: son lo que se
 * pasa tal cual a panPixels (el signo ya está invertido respecto del delta del evento).
 */
export type WheelAction = { kind: 'zoom'; delta: number } | { kind: 'pan'; dx: number; dy: number };

const LINE_PX = 30;
const PAGE_PX = 400;

/** Delta del evento en píxeles CSS, sea cual sea su unidad. */
export function wheelPixels(delta: number, deltaMode: number): number {
  return deltaMode === 1 ? delta * LINE_PX : deltaMode === 2 ? delta * PAGE_PX : delta;
}

/** Límites de la confianza acumulada y umbral a partir del cual se encuadra. */
const MIN_SCORE = -4;
const MAX_SCORE = 4;
const PAN_AT = 1;

export class WheelClassifier {
  /** > 0 panel táctil, < 0 rueda de ratón, 0 sin datos. */
  private score = 0;
  private lastAt = Number.NEGATIVE_INFINITY;

  get confidence(): number {
    return this.score;
  }

  /** true si, con lo visto hasta ahora, el gesto se trata como panel táctil. */
  get isTrackpad(): boolean {
    return this.score >= PAN_AT;
  }

  reset() {
    this.score = 0;
    this.lastAt = Number.NEGATIVE_INFINITY;
  }

  /** Acumula indicios del dispositivo. Los eventos con Ctrl (pellizco o zoom del navegador) no dicen nada. */
  observe(e: WheelSample): void {
    if (e.ctrlKey) return;
    const dy = Math.abs(wheelPixels(e.deltaY, e.deltaMode));
    const gap = e.timeStamp - this.lastAt;
    this.lastAt = e.timeStamp;
    let ev = 0;
    if (e.deltaMode !== 0) {
      ev -= 3; // líneas o páginas: ninguna rueda de panel táctil informa así
    } else {
      if (!Number.isInteger(e.deltaY) || !Number.isInteger(e.deltaX)) ev += 3; // inercia
      if (e.deltaX !== 0) ev += 2; // eje horizontal: dos dedos
      if (dy >= 100 && e.deltaX === 0 && Number.isInteger(e.deltaY)) ev -= 2; // muesca completa
      else if (dy > 0 && dy < 40) ev += 1; // pasos finos
      if (gap < 60 && dy < 60) ev += 1; // ráfaga: los dedos siguen sobre el panel
    }
    this.score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, this.score + ev));
  }

  /** Decide qué hacer con el evento y, de paso, aprende del dispositivo. */
  classify(e: WheelSample, mode: WheelMode = 'auto'): WheelAction {
    this.observe(e);
    const dx = wheelPixels(e.deltaX, e.deltaMode);
    const dy = wheelPixels(e.deltaY, e.deltaMode);
    // pellizco del panel (el navegador lo envía como Ctrl+rueda en pasos pequeños) o Ctrl+rueda real
    if (e.ctrlKey) return { kind: 'zoom', delta: Math.abs(dy) < 50 ? dy * 8 : dy };
    const pan = mode === 'pan' || (mode === 'auto' && this.isTrackpad);
    // Mayús+rueda encuadra en horizontal, la convención de siempre para una rueda de un solo eje
    if (e.shiftKey && !pan) return { kind: 'pan', dx: -(dx || dy), dy: 0 };
    if (pan) return { kind: 'pan', dx: -dx, dy: -dy };
    return { kind: 'zoom', delta: dy };
  }
}
