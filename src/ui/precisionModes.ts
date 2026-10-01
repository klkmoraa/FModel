import type { Editor } from '../editor/editor';

export interface PrecisionMode {
  id: string;
  /** sigla de la barra de estado (REJILLA, ORTO…) */
  short: string;
  /** qué hace, para títulos y para la hoja táctil */
  label: string;
  /** atajo de teclado, si existe */
  key?: string;
  on: boolean;
  toggle: () => void;
}

const tr = (lang: 'es' | 'en', es: string, en: string) => (lang === 'es' ? es : en);

/**
 * Modos de precisión y visualización en el orden de la barra de estado. Una sola lista para la barra
 * de escritorio y la hoja táctil del teléfono: mismas siglas, mismas descripciones, mismos atajos.
 */
export function precisionModes(editor: Editor): PrecisionMode[] {
  const lang = editor.lang;
  const snap = editor.prefs.snap;
  return [
    { id: 'grid', short: tr(lang, 'REJILLA', 'GRID'), label: tr(lang, 'Rejilla visible', 'Show grid'), key: 'F7', on: editor.prefs.grid.on, toggle: () => editor.command('GRIDTOGGLE') },
    { id: 'gridSnap', short: tr(lang, 'FORZC', 'SNAP'), label: tr(lang, 'Forzar el cursor a la rejilla', 'Snap cursor to grid'), key: 'F9', on: snap.gridSnap, toggle: () => editor.toggleSnapSetting('gridSnap') },
    { id: 'ortho', short: tr(lang, 'ORTO', 'ORTHO'), label: tr(lang, 'Orto: sólo horizontal y vertical', 'Ortho: horizontal and vertical only'), key: 'F8', on: snap.ortho, toggle: () => editor.toggleSnapSetting('ortho') },
    { id: 'polar', short: 'POLAR', label: tr(lang, 'Rastreo polar: ángulos fijos', 'Polar tracking: fixed angles'), key: 'F10', on: snap.polar, toggle: () => editor.toggleSnapSetting('polar') },
    { id: 'osnap', short: tr(lang, 'REFENT', 'OSNAP'), label: tr(lang, 'Referencia a objetos: extremos, medios, centros…', 'Object snap: endpoints, midpoints, centers…'), key: 'F3', on: snap.osnap, toggle: () => editor.toggleSnapSetting('osnap') },
    { id: 'otrack', short: tr(lang, 'RASTREO', 'OTRACK'), label: tr(lang, 'Rastreo desde puntos de referencia', 'Tracking from snap points'), key: 'F11', on: snap.otrack, toggle: () => editor.toggleSnapSetting('otrack') },
    { id: 'dyn', short: 'DYN', label: tr(lang, 'Entrada dinámica junto al cursor', 'Dynamic input by the cursor'), key: 'F12', on: editor.prefs.dynamicInput.on, toggle: () => editor.command('DYNTOGGLE') },
    { id: 'lwt', short: tr(lang, 'GLN', 'LWT'), label: tr(lang, 'Mostrar grosores de línea', 'Show lineweights'), on: editor.prefs.lineweightDisplay, toggle: () => editor.command('LWDISPLAY') },
    { id: 'qp', short: tr(lang, 'PR', 'QP'), label: tr(lang, 'Propiedades rápidas al seleccionar', 'Quick properties on selection'), on: editor.prefs.quickProperties, toggle: () => editor.command('QUICKPROPERTIES') },
    { id: 'cycle', short: tr(lang, 'CICLO', 'CYCLE'), label: tr(lang, 'Ciclo de selección entre objetos superpuestos', 'Selection cycling between overlapping objects'), on: editor.prefs.selectionCycling, toggle: () => editor.setPrefs({ selectionCycling: !editor.prefs.selectionCycling }) },
  ];
}
