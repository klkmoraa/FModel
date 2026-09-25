const TYPE_LABELS: Record<string, [string, string]> = {
  point: ['Punto', 'Point'],
  line: ['Línea', 'Line'],
  ray: ['Rayo', 'Ray'],
  xline: ['Línea auxiliar', 'Xline'],
  circle: ['Círculo', 'Circle'],
  arc: ['Arco', 'Arc'],
  ellipse: ['Elipse', 'Ellipse'],
  lwpolyline: ['Polilínea', 'Polyline'],
  polyline2d: ['Polilínea 2D', '2D Polyline'],
  spline: ['Spline', 'Spline'],
  mline: ['Multilínea', 'Multiline'],
  region: ['Región', 'Region'],
  hatch: ['Sombreado', 'Hatch'],
  text: ['Texto', 'Text'],
  mtext: ['Texto múltiple', 'MText'],
  leader: ['Directriz', 'Leader'],
  mleader: ['Directriz múltiple', 'Multileader'],
  table: ['Tabla', 'Table'],
  wipeout: ['Cobertura', 'Wipeout'],
  image: ['Imagen', 'Image'],
  pdfunderlay: ['Calco PDF', 'PDF underlay'],
  insert: ['Referencia a bloque', 'Block reference'],
  attdef: ['Definición de atributo', 'Attribute definition'],
  dimension: ['Cota', 'Dimension'],
  viewport: ['Viewport', 'Viewport'],
  array: ['Matriz asociativa', 'Associative array'],
  centermark: ['Marca de centro', 'Center mark'],
};

export function typeLabel(type: string, lang: 'es' | 'en'): string {
  return TYPE_LABELS[type]?.[lang === 'es' ? 0 : 1] ?? type;
}
