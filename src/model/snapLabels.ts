import type { SnapType } from './registry';

export const SNAP_LABELS: Record<SnapType, { es: string; en: string }> = {
  endpoint: { es: 'Punto final', en: 'Endpoint' },
  midpoint: { es: 'Punto medio', en: 'Midpoint' },
  center: { es: 'Centro', en: 'Center' },
  node: { es: 'Nodo', en: 'Node' },
  geocenter: { es: 'Centro geométrico', en: 'Geometric center' },
  quadrant: { es: 'Cuadrante', en: 'Quadrant' },
  intersection: { es: 'Intersección', en: 'Intersection' },
  extension: { es: 'Extensión', en: 'Extension' },
  insertion: { es: 'Inserción', en: 'Insertion' },
  perpendicular: { es: 'Perpendicular', en: 'Perpendicular' },
  tangent: { es: 'Tangente', en: 'Tangent' },
  nearest: { es: 'Cercano', en: 'Nearest' },
  parallel: { es: 'Paralelo', en: 'Parallel' },
  appint: { es: 'Intersección ficticia', en: 'Apparent intersection' },
};
