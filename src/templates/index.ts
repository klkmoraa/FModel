import type { DocumentData } from '../document/types';
import { createA3SheetTemplate, createA4SheetTemplate } from './sheets';
import { createResidentialHouseTemplate } from './residential';
import { createBuildingFloorTemplate } from './office';
import { createStructuralDetailTemplate } from './steel';
import { createFoundationDetailTemplate } from './foundation';

export { createA3SheetTemplate, createA4SheetTemplate, createResidentialHouseTemplate, createBuildingFloorTemplate, createStructuralDetailTemplate, createFoundationDetailTemplate };

export interface TemplateDefinition {
  id: string;
  name: { es: string; en: string };
  description: { es: string; en: string };
  category: 'sheet' | 'structural' | 'architectural';
  badge: { es: string; en: string };
  format: string;
  createDocument: () => DocumentData;
}

export const TEMPLATES_CATALOG: TemplateDefinition[] = [
  {
    id: 'residential-house',
    name: { es: 'Vivienda unifamiliar · planta baja', en: 'Single-family house · ground floor' },
    description: {
      es: 'Dos dormitorios, baño, salón-comedor y cocina. Muros en poché, carpinterías y sanitarios como bloques, muebles dinámicos, cotas encadenadas, superficies y presentación A3.',
      en: 'Two bedrooms, bathroom, living-dining room and kitchen. Poché walls, door, window and fixture blocks, dynamic furniture, chained dimensions, room areas and an A3 layout.',
    },
    category: 'architectural',
    badge: { es: 'Arquitectura', en: 'Architecture' },
    format: 'Escala 1:50 · A3',
    createDocument: createResidentialHouseTemplate,
  },
  {
    id: 'building-floor',
    name: { es: 'Edificio de oficinas · planta tipo', en: 'Office building · typical floor' },
    description: {
      es: 'Retícula 8 × 7 m con ejes y pilares, núcleo de hormigón con escalera protegida y ascensores, aseos, muro cortina, 116 puestos y dos salas de reuniones.',
      en: '8 × 7 m grid with axes and columns, concrete core with protected stair and lifts, restrooms, curtain wall, 116 workstations and two meeting rooms.',
    },
    category: 'architectural',
    badge: { es: 'Edificación', en: 'Building' },
    format: 'Escala 1:150 · A3',
    createDocument: createBuildingFloorTemplate,
  },
  {
    id: 'structural-detail',
    name: { es: 'Unión viga-pilar atornillada', en: 'Bolted beam-to-column joint' },
    description: {
      es: 'HEB 300 + IPE 300 con chapa de testa, 6 tornillos M20 8.8, rigidizadores y soldaduras. Alzado y dos secciones con perfiles reales, cotas y notas.',
      en: 'HEB 300 + IPE 300 with end plate, 6 M20 8.8 bolts, stiffeners and welds. Elevation and two sections with true profiles, dimensions and notes.',
    },
    category: 'structural',
    badge: { es: 'Acero', en: 'Steel' },
    format: 'Escala 1:10 · A3',
    createDocument: createStructuralDetailTemplate,
  },
  {
    id: 'foundation-detail',
    name: { es: 'Zapata aislada con pilar', en: 'Isolated footing with column' },
    description: {
      es: 'Sección y planta de zapata 2,00 × 2,00 m: armado con recubrimientos, hormigón de limpieza, relleno, solera con mallazo, niveles y cuadro de armado.',
      en: 'Section and plan of a 2.00 × 2.00 m footing: reinforcement with covers, blinding, backfill, slab with mesh, levels and bar schedule.',
    },
    category: 'structural',
    badge: { es: 'Hormigón', en: 'Concrete' },
    format: 'Escala 1:25 · A3',
    createDocument: createFoundationDetailTemplate,
  },
  {
    id: 'sheet-a3',
    name: { es: 'Lámina ISO A3 horizontal', en: 'ISO A3 landscape sheet' },
    description: {
      es: 'Marco ISO 5457 con margen de archivo, marcas de centrado y zonas de referencia; cajetín con símbolo de proyección y cuadro de revisiones.',
      en: 'ISO 5457 frame with filing margin, centring marks and grid zones; title block with projection symbol and revision table.',
    },
    category: 'sheet',
    badge: { es: 'Formato', en: 'Sheet' },
    format: '420 × 297 mm',
    createDocument: createA3SheetTemplate,
  },
  {
    id: 'sheet-a4',
    name: { es: 'Lámina ISO A4 vertical', en: 'ISO A4 portrait sheet' },
    description: {
      es: 'Formato vertical con el mismo marco normalizado y un cajetín de 180 mm que ocupa el ancho útil. Capas de dibujo, ejes, ocultas y cotas preparadas.',
      en: 'Portrait format with the same standard frame and a 180 mm title block across the usable width. Drawing, axis, hidden and dimension layers ready.',
    },
    category: 'sheet',
    badge: { es: 'Formato', en: 'Sheet' },
    format: '210 × 297 mm',
    createDocument: createA4SheetTemplate,
  },
];
