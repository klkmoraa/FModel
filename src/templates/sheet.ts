import type { TemplateBuilder, P } from './builder';

export interface SheetFields {
  title: string;
  subtitle?: string;
  number: string;
  scale: string;
  date: string;
  sheet: string;
  drawnBy: string;
  checkedBy: string;
  docType: string;
  status: string;
  rev: string;
  owner: string;
  revisions?: Array<{ rev: string; text: string; date: string; by: string }>;
}

export interface SheetLayers {
  frame: string;
  thin: string;
  text: string;
}

export interface DrawingArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TB_W = 180;
const TB_H = 40;
const MONO = 'ts-mono';

/**
 * Formato ISO 5457 + cajetín tipo ISO 7200 dibujados a escala 1:1 en milímetros de papel.
 * Devuelve la zona útil de dibujo (dentro del marco, por encima del cajetín).
 */
export function drawSheet(b: TemplateBuilder, w: number, h: number, L: SheetLayers, f: SheetFields): DrawingArea {
  const left = 20;
  const m = 10;
  const fx0 = left;
  const fy0 = m;
  const fx1 = w - m;
  const fy1 = h - m;

  // Borde de corte y marco
  b.rect(0, 0, w, h, { layer: L.thin });
  b.rect(fx0, fy0, fx1 - fx0, fy1 - fy0, { layer: L.frame });

  // Marcas de centrado: del borde de corte a 5 mm dentro del marco
  const cx = (fx0 + fx1) / 2;
  const cy = (fy0 + fy1) / 2;
  b.line([cx, 0], [cx, fy0 + 5], { layer: L.frame });
  b.line([cx, h], [cx, fy1 - 5], { layer: L.frame });
  b.line([0, cy], [fx0 + 5, cy], { layer: L.frame });
  b.line([w, cy], [fx1 - 5, cy], { layer: L.frame });

  // Zonas de referencia: columnas numeradas y filas con letra (~50 mm)
  const cols = Math.max(2, Math.round((fx1 - fx0) / 50 / 2) * 2);
  const rows = Math.max(2, Math.round((fy1 - fy0) / 50 / 2) * 2);
  const zw = (fx1 - fx0) / cols;
  const zh = (fy1 - fy0) / rows;
  const outer = 5;
  b.rect(fx0 - outer, fy0 - outer, fx1 - fx0 + outer * 2, fy1 - fy0 + outer * 2, { layer: L.thin });
  for (let i = 0; i < cols; i++) {
    const x = fx0 + i * zw;
    if (i > 0) {
      b.line([x, fy0 - outer], [x, fy0], { layer: L.thin });
      b.line([x, fy1], [x, fy1 + outer], { layer: L.thin });
    }
    const label = String(i + 1);
    b.text(label, [x + zw / 2, fy1 + outer / 2], 2.5, { layer: L.text, h: 'center', v: 'middle', style: MONO });
    b.text(label, [x + zw / 2, fy0 - outer / 2], 2.5, { layer: L.text, h: 'center', v: 'middle', style: MONO });
  }
  for (let j = 0; j < rows; j++) {
    const y = fy1 - j * zh;
    if (j > 0) {
      b.line([fx0 - outer, y], [fx0, y], { layer: L.thin });
      b.line([fx1, y], [fx1 + outer, y], { layer: L.thin });
    }
    const label = String.fromCharCode(65 + j);
    b.text(label, [fx0 - outer / 2, y - zh / 2], 2.5, { layer: L.text, h: 'center', v: 'middle', style: MONO });
    b.text(label, [fx1 + outer / 2, y - zh / 2], 2.5, { layer: L.text, h: 'center', v: 'middle', style: MONO });
  }

  // Cajetín en la esquina inferior derecha
  const tw = Math.min(TB_W, fx1 - fx0);
  const x0 = fx1 - tw;
  const y0 = fy0;
  titleBlock(b, x0, y0, tw, L, f);

  // Cuadro de revisiones sobre el cajetín
  const revs = f.revisions ?? [{ rev: f.rev, text: 'Emisión inicial', date: f.date, by: f.drawnBy }];
  const rh = 5;
  const ry0 = y0 + TB_H;
  const rc = [x0, x0 + 14, x0 + tw - 50, x0 + tw - 20, x0 + tw];
  const rowsN = revs.length + 1;
  b.rect(x0, ry0, tw, rh * rowsN, { layer: L.frame });
  for (let r = 1; r < rowsN; r++) b.line([x0, ry0 + r * rh], [x0 + tw, ry0 + r * rh], { layer: L.thin });
  for (const x of rc.slice(1, -1)) b.line([x, ry0], [x, ry0 + rh * rowsN], { layer: L.thin });
  const headY = ry0 + rh * (rowsN - 1) + 1.6;
  ['REV', 'DESCRIPCIÓN', 'FECHA', 'POR'].forEach((t, i) => b.text(t, [rc[i] + 1.5, headY], 1.8, { layer: L.text, style: MONO }));
  revs.forEach((r, i) => {
    const y = ry0 + rh * (rowsN - 2 - i) + 1.6;
    [r.rev, r.text, r.date, r.by].forEach((t, k) => b.text(t, [rc[k] + 1.5, y], 2.2, { layer: L.text }));
  });

  return { x: fx0 + 5, y: fy0 + 5, w: fx1 - fx0 - 10, h: fy1 - fy0 - 10 - 0 };
}

function titleBlock(b: TemplateBuilder, x0: number, y0: number, w: number, L: SheetLayers, f: SheetFields): void {
  const k = w / TB_W;
  const X = (x: number) => x0 + x * k;
  const Y = (y: number) => y0 + y;
  b.rect(x0, y0, w, TB_H, { layer: L.frame });

  // Columnas: propietario | título | identificación
  b.line([X(64), Y(0)], [X(64), Y(TB_H)], { layer: L.frame });
  b.line([X(136), Y(0)], [X(136), Y(TB_H)], { layer: L.frame });

  const cell = (x: number, y: number, label: string, value: string, valueH = 3) => {
    b.text(label, [X(x) + 1.5, Y(y) - 2.6], 1.6, { layer: L.text, style: MONO });
    b.text(value, [X(x) + 1.5, Y(y) - 2.6 - valueH - 1.6], valueH, { layer: L.text });
  };

  // Propietario y firmas
  b.line([X(0), Y(22)], [X(64), Y(22)], { layer: L.thin });
  b.line([X(0), Y(11)], [X(40), Y(11)], { layer: L.thin });
  b.line([X(40), Y(0)], [X(40), Y(22)], { layer: L.thin });
  b.text('PROPIETARIO', [X(0) + 1.5, Y(TB_H) - 2.6], 1.6, { layer: L.text, style: MONO });
  b.text(f.owner, [X(0) + 1.5, Y(TB_H) - 9], 4, { layer: L.text });
  b.text('FModel 2D CAD', [X(0) + 1.5, Y(TB_H) - 14.5], 2.2, { layer: L.text, style: MONO });
  cell(0, 22, 'DIBUJADO', f.drawnBy, 2.5);
  cell(0, 11, 'REVISADO', f.checkedBy, 2.5);
  // Símbolo de proyección (primer diedro, ISO 128)
  b.text('PROYECCIÓN', [X(40) + 1.5, Y(22) - 2.6], 1.6, { layer: L.text, style: MONO });
  projectionSymbol(b, [X(52), Y(9)], L);

  // Título
  b.line([X(64), Y(14)], [X(136), Y(14)], { layer: L.thin });
  b.line([X(100), Y(0)], [X(100), Y(14)], { layer: L.thin });
  b.text('TÍTULO', [X(64) + 1.5, Y(TB_H) - 2.6], 1.6, { layer: L.text, style: MONO });
  b.text(f.title, [X(64) + 1.5, Y(TB_H) - 10], 4.2, { layer: L.text });
  if (f.subtitle) b.text(f.subtitle, [X(64) + 1.5, Y(TB_H) - 16.5], 2.5, { layer: L.text });
  cell(64, 14, 'TIPO DE DOCUMENTO', f.docType, 2.5);
  cell(100, 14, 'ESTADO', f.status, 2.5);

  // Identificación
  b.line([X(136), Y(26)], [X(180), Y(26)], { layer: L.thin });
  b.line([X(136), Y(18)], [X(180), Y(18)], { layer: L.thin });
  b.line([X(136), Y(9)], [X(180), Y(9)], { layer: L.thin });
  b.line([X(158), Y(9)], [X(158), Y(18)], { layer: L.thin });
  b.text('Nº DE PLANO', [X(136) + 1.5, Y(TB_H) - 2.6], 1.6, { layer: L.text, style: MONO });
  b.text(f.number, [X(136) + 1.5, Y(TB_H) - 10], 4.2, { layer: L.text, style: MONO });
  cell(136, 26, 'ESCALA', f.scale, 3);
  cell(136, 18, 'REV.', f.rev, 2.5);
  cell(158, 18, 'HOJA', f.sheet, 2.5);
  cell(136, 9, 'FECHA', f.date, 2.2);
}

/** Símbolo de primer diedro: tronco de cono en alzado y su vista lateral a la derecha. */
function projectionSymbol(b: TemplateBuilder, [cx, cy]: P, L: SheetLayers): void {
  const s = 1.1;
  // alzado: trapecio
  b.pline([[cx - 9 * s, cy - 2.5 * s], [cx - 1 * s, cy - 4 * s], [cx - 1 * s, cy + 4 * s], [cx - 9 * s, cy + 2.5 * s]], true, { layer: L.thin });
  // vista lateral: dos círculos concéntricos
  b.circle([cx + 5 * s, cy], 4 * s, { layer: L.thin });
  b.circle([cx + 5 * s, cy], 2.5 * s, { layer: L.thin });
  b.line([cx - 10 * s, cy], [cx + 10 * s, cy], { layer: L.thin, linetype: 'lt-center2', linetypeScale: 0.12 });
}
