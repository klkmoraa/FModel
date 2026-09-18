import type { DocumentData } from '../document/types';
import { TemplateBuilder } from './builder';
import { drawSheet, type SheetFields } from './sheet';

const FIELDS: Omit<SheetFields, 'title' | 'number'> = {
  subtitle: 'Título secundario del plano',
  scale: '1:1',
  date: 'AAAA-MM-DD',
  sheet: '1 / 1',
  drawnBy: 'Autor',
  checkedBy: 'Revisor',
  docType: 'Plano',
  status: 'Borrador',
  rev: 'A',
  owner: 'Propietario',
};

function sheet(title: string, w: number, h: number, number: string): DocumentData {
  const b = new TemplateBuilder(title);
  const frame = b.layer('l-marco', 'MARCO', 'aci:7', 70);
  const thin = b.layer('l-cajetin', 'CAJETIN', 'aci:7', 18);
  const text = b.layer('l-texto', 'TEXTO', 'aci:7', 25);
  b.layer('l-dibujo', 'DIBUJO', 'aci:7', 35);
  b.layer('l-ocultas', 'OCULTAS', 'aci:8', 18, 'HIDDEN2');
  b.layer('l-ejes', 'EJES', 'aci:1', 13, 'CENTER2');
  b.layer('l-cotas', 'COTAS', 'aci:3', 18);
  b.layer('l-sombreado', 'SOMBREADO', 'aci:9', 9);
  b.settings({ currentLayer: 'l-dibujo' });
  drawSheet(b, w, h, { frame, thin, text }, { ...FIELDS, title: 'TÍTULO DEL PLANO', number });
  return b.build();
}

/** Formato A3 horizontal (420 × 297) con marco ISO 5457, zonas de referencia y cajetín. */
export function createA3SheetTemplate(): DocumentData {
  return sheet('Lámina ISO A3 horizontal', 420, 297, 'P-001');
}

/** Formato A4 vertical (210 × 297): el cajetín de 180 ocupa el ancho útil exacto. */
export function createA4SheetTemplate(): DocumentData {
  return sheet('Lámina ISO A4 vertical', 210, 297, 'P-002');
}
