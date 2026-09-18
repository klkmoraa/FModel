import type { DocumentData } from '../document/types';
import { furnitureLibrary } from '../blocks/furniture';
import { TemplateBuilder, type P } from './builder';
import { drawSheet } from './sheet';
import { planSymbols } from './symbols';

type Span = [number, number];

const W = 10500;
const H = 8000;
const EXT = 250;

/**
 * Vivienda unifamiliar de una planta (10,50 × 8,00 m): dos dormitorios, baño, salón-comedor
 * y cocina. Muros en poché, carpinterías y sanitarios como bloques, mobiliario con los bloques
 * dinámicos de la biblioteca FModel, cotas encadenadas ISO a 1:50 y presentación A3.
 */
export function createResidentialHouseTemplate(): DocumentData {
  const b = new TemplateBuilder('Vivienda unifamiliar · planta baja');

  const muro = b.layer('a-muro', 'A-MURO', 'aci:8', 50, 'Continuous', { description: 'Muros en sección (poché)' });
  const carp = b.layer('a-carpinteria', 'A-CARPINTERIA', 'aci:4', 25);
  const mob = b.layer('a-mobiliario', 'A-MOBILIARIO', 'aci:9', 18);
  const san = b.layer('a-sanitarios', 'A-SANITARIOS', 'aci:5', 18);
  const pav = b.layer('a-pavimento', 'A-PAVIMENTO', 'aci:253', 9, 'Continuous', { description: 'Despiece de pavimento' });
  const cota = b.layer('a-cotas', 'A-COTAS', 'aci:3', 18);
  const rot = b.layer('a-rotulos', 'A-ROTULOS', 'aci:7', 25);
  const sim = b.layer('a-simbolos', 'A-SIMBOLOS', 'aci:1', 25);
  const papMarco = b.layer('p-marco', 'P-MARCO', 'aci:7', 70);
  const papFino = b.layer('p-fino', 'P-FINO', 'aci:7', 18);
  const papTexto = b.layer('p-texto', 'P-TEXTO', 'aci:7', 25);
  const vp = b.layer('p-viewport', 'P-VIEWPORT', 'aci:8', 9, 'Continuous', { plot: false });

  const ds = b.dimStyle('ds-1-50', 'ISO-25 · 1:50', 50, { arrow1: 'architectural', arrow2: 'architectural', arrowSize: 1.8, precision: 0, extLineOffset: 1.5 });
  b.settings({ currentDimStyle: ds, currentLayer: muro, annotationScale: 1 / 50, ltscale: 50 });

  const s = planSymbols(b);
  const lib = furnitureLibrary();
  const libBlock = (name: string) => b.libraryBlock(lib.find((i) => i.name === name)!);
  const bed = libBlock('Cama');
  const night = libBlock('Mesita de noche paramétrica');
  const closet = libBlock('Clóset de correderas');
  const sofa = libBlock('Sofá paramétrico');
  const dining = libBlock('Mesa de comedor con sillas');
  const counter = libBlock('Encimera paramétrica');
  const lowUnit = libBlock('Módulo bajo de cocina');
  const desk = libBlock('Escritorio');

  // ------------------------------------------------------------- muros
  const solid = (x: number, y: number, w: number, h: number) => b.hatchRect(x, y, w, h, 'SOLID', { layer: muro });
  const wallH = (x0: number, x1: number, y: number, t: number, gaps: Span[] = []) => {
    for (const [a, c] of spans(x0, x1, gaps)) solid(a, y, c - a, t);
  };
  const wallV = (y0: number, y1: number, x: number, t: number, gaps: Span[] = []) => {
    for (const [a, c] of spans(y0, y1, gaps)) solid(x, a, t, c - a);
  };

  const gaps = {
    bottom: [[700, 1600], [3400, 5600], [7300, 9300]] as Span[],
    top: [[1000, 3000], [4800, 5500], [7300, 9300]] as Span[],
    left: [[1200, 2800]] as Span[],
    right: [[1400, 2600], [5000, 6600]] as Span[],
  };
  wallH(0, W, 0, EXT, gaps.bottom);
  wallH(0, W, H - EXT, EXT, gaps.top);
  wallV(EXT, H - EXT, 0, EXT, gaps.left);
  wallV(EXT, H - EXT, W - EXT, EXT, gaps.right);
  wallH(EXT, W - EXT, 3850, 100, [[4300, 5200]]);
  wallV(3950, H - EXT, 3950, 100, [[4100, 4900]]);
  wallV(3950, H - EXT, 6250, 100, [[4100, 4900]]);
  wallV(EXT, 3850, 6250, 100, [[1500, 2500]]);
  wallH(4050, 6250, 5050, 100, [[4800, 5500]]);
  b.use(muro).rect(0, 0, W, H, { lineweight: 35 });

  // ------------------------------------------------------- carpinterías
  b.use(carp);
  b.insert(s.door, [700, EXT], { sx: 0.9 });
  b.insert(s.door, [3950, 4100], { rot: 90, sx: 0.8 });
  b.insert(s.door, [6350, 4900], { rot: -90, sx: 0.8 });
  b.insert(s.door, [4800, 5150], { sx: 0.7 });
  for (const [a, c] of gaps.bottom.slice(1)) b.insert(s.window, [a, 0], { sx: (c - a) / 1000, sy: 1 });
  for (const [a, c] of gaps.top) b.insert(s.window, [c, H], { rot: 180, sx: (c - a) / 1000, sy: 1 });
  for (const [a, c] of gaps.left) b.insert(s.window, [0, c], { rot: -90, sx: (c - a) / 1000, sy: 1 });
  for (const [a, c] of gaps.right) b.insert(s.window, [W, a], { rot: 90, sx: (c - a) / 1000, sy: 1 });

  // ---------------------------------------------------- pavimento (baño y cocina)
  b.use(pav);
  for (let x = 6350 + 600; x < W - EXT; x += 600) b.line([x, EXT], [x, 3850]);
  for (let y = EXT + 600; y < 3850; y += 600) b.line([6350, y], [W - EXT, y]);
  for (let x = 4050 + 300; x < 6250; x += 300) b.line([x, 5150], [x, H - EXT]);
  for (let y = 5150 + 300; y < H - EXT; y += 300) b.line([4050, y], [6250, y]);

  // ----------------------------------------------------------- mobiliario
  b.use(mob);
  // Dormitorio principal
  b.insert(bed, [1350, 5650]);
  b.insert(night, [800, 7250]);
  b.insert(night, [2900, 7250]);
  b.insert(closet, [300, 3950 + 50]);
  // Dormitorio 2
  b.insert(bed, [7500, 5650], { dyn: { Ancho: 1350 } });
  b.insert(night, [6950, 7250]);
  b.insert(desk, [8800, 4000]);
  // Salón-comedor
  b.insert(sofa, [1200, 2750], { dyn: { Ancho: 2200 } });
  b.rect(1700, 1750, 1200, 600);
  b.insert(dining, [3900, 1700], { dyn: { Ancho: 1800 } });
  // Cocina: encimera corrida bajo la ventana y módulos en el lateral
  b.insert(counter, [W - EXT, 850], { rot: 180, dyn: { Ancho: 2750 } });
  b.insert(counter, [W - EXT - 600, 2850], { rot: -90, dyn: { Ancho: 2000 } });
  b.insert(lowUnit, [6400, 3800], { rot: -90 });
  b.insert(lowUnit, [6400, 3200], { rot: -90 });
  b.use(san);
  b.insert(s.sink, [9250, 820], { rot: 180 });
  b.insert(s.hob, [8100, 820], { rot: 180 });
  b.insert(s.fridge, [W - EXT - 700, 3100]);
  // Baño
  b.insert(s.wc, [4050, 6000], { rot: -90 });
  b.insert(s.basin, [4500, H - EXT], { rot: 180 });
  b.insert(s.shower, [5300, 5900]);

  // --------------------------------------------------- rótulos de estancias
  b.use(rot);
  const room = (name: string, x0: number, y0: number, x1: number, y1: number, at?: P) => {
    const area = ((x1 - x0) * (y1 - y0)) / 1e6;
    const c: P = at ?? [(x0 + x1) / 2, (y0 + y1) / 2];
    b.mtext(`{\\b1${name}}\\PS = ${area.toFixed(2).replace('.', ',')} m²`, c, 2400, 150, { attach: 5 });
  };
  room('SALÓN-COMEDOR', EXT, EXT, 6250, 3850, [3100, 1150]);
  room('COCINA', 6350, EXT, W - EXT, 3850, [8000, 2450]);
  room('DORMITORIO 1', EXT, 3950, 3950, H - EXT, [2100, 5050]);
  room('DORMITORIO 2', 6350, 3950, W - EXT, H - EXT, [8250, 5050]);
  room('BAÑO', 4050, 5150, 6250, H - EXT, [4650, 6750]);
  room('DIST.', 4050, 3950, 6250, 5050, [5150, 4500]);

  // Cotas de nivel y acceso
  b.use(sim);
  b.insert(s.level, [4400, 600]);
  b.text('±0,00', [4450, 820], 150, { layer: rot });
  b.insert(s.north, [W + 1900, H - 900]);

  // ----------------------------------------------------------------- cotas
  b.use(cota);
  b.dimChain([0, 700, 1600, 3400, 5600, 7300, 9300, W], 0, -900, ds);
  b.dimLinear([0, 0], [W, 0], [0, -1500], ds);
  b.dimChain([0, 1000, 3000, 4800, 5500, 7300, 9300, W], H, H + 900, ds);
  b.dimChain([0, 1200, 2800, 3900, H], 0, -900, ds, { vertical: true });
  b.dimLinear([0, 0], [0, H], [-1500, 0], ds, { vertical: true });
  b.dimChain([0, 1400, 2600, 3900, 5000, 6600, H], W, W + 900, ds, { vertical: true });

  // ---------------------------------------------------------- presentación
  const layoutId = b.layout('A3 · Planta 1:50');
  b.within(layoutId, () => {
    const area = drawSheet(b, 420, 297, { frame: papMarco, thin: papFino, text: papTexto }, {
      title: 'VIVIENDA UNIFAMILIAR',
      subtitle: 'Planta baja · distribución y cotas',
      number: 'A-101',
      scale: '1:50',
      date: '2026-09-18',
      sheet: '1 / 1',
      drawnBy: 'FModel',
      checkedBy: '—',
      docType: 'Plano de planta',
      status: 'Anteproyecto',
      rev: 'A',
      owner: 'FusionStructure',
    });
    b.use(vp).viewport({ x: area.x, y: 62, w: area.w, h: area.y + area.h - 62 }, [5750, 3700], 1 / 50, '1:50');
    b.use(papTexto);
    b.text('PLANTA BAJA', [area.x + 2, 50], 5, {});
    b.line([area.x + 2, 47.5], [area.x + 62, 47.5], { layer: papMarco });
    b.text('E 1:50 · cotas en mm', [area.x + 2, 42], 2.8, { style: 'ts-mono' });
    b.mtext(
      '{\\b1CUADRO DE SUPERFICIES}\\PSalón-comedor · 21,60 m²\\PCocina · 14,04 m²\\PDormitorio 1 · 14,06 m²\\PDormitorio 2 · 14,82 m²\\PBaño · 5,72 m²  ·  Distribuidor · 2,42 m²\\P{\\b1Útil 72,66 m²  ·  Construida 84,00 m²}',
      [area.x + 70, 52],
      110,
      2.5,
      { spacing: 1.1 },
    );
  });

  return b.build();
}

/** Tramos macizos de [a, b] descontando huecos. */
function spans(a: number, c: number, gaps: Span[]): Span[] {
  const out: Span[] = [];
  let cur = a;
  for (const [g0, g1] of [...gaps].sort((x, y) => x[0] - y[0])) {
    if (g0 > cur) out.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < c) out.push([cur, c]);
  return out;
}
