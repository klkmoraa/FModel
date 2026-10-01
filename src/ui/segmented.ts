/** Teclas que mueven el foco dentro de un control segmentado (patrón WAI-ARIA de pestañas y radios). */
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/**
 * Índice de la opción que debe recibir el foco al pulsar `key`, o `null` si la tecla no navega
 * o no hay ninguna opción habilitada. Las flechas dan la vuelta; las opciones deshabilitadas se saltan.
 */
export function nextSegmentIndex(key: string, current: number, enabled: readonly boolean[]): number | null {
  if (!MOVE_KEYS.has(key)) return null;
  const count = enabled.length;
  if (!enabled.some(Boolean)) return null;
  if (key === 'Home') return enabled.findIndex(Boolean);
  if (key === 'End') return enabled.lastIndexOf(true);
  const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const start = current >= 0 && current < count ? current : step === 1 ? -1 : 0;
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (((start + step * offset) % count) + count) % count;
    if (enabled[index]) return index;
  }
  return null;
}
