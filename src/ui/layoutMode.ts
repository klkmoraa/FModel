/**
 * Consultas de dispositivo de la mesa. El teléfono (estrecho, o táctil y muy bajo como en horizontal)
 * usa el dock flotante y las hojas inferiores; la tableta conserva la mesa de escritorio y sólo gana
 * objetivos táctiles, zoom y Aceptar. Un mismo origen para React y para las pruebas.
 */
export const PHONE_QUERY = '(max-width: 640px), (max-height: 500px) and (pointer: coarse)';
export const TOUCH_QUERY = '(pointer: coarse)';
/** Teléfono girado: táctil, poca altura y apaisado. El teléfono se usa en vertical; aquí se propone girarlo. */
export const PHONE_LANDSCAPE_QUERY = '(max-height: 500px) and (pointer: coarse) and (orientation: landscape)';
