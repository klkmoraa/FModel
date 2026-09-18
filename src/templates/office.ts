import type { DocumentData } from '../document/types';
import { furnitureLibrary } from '../blocks/furniture';
import { TemplateBuilder, type P } from './builder';
import { drawSheet } from './sheet';
import { planSymbols } from './symbols';

const AX = [0, 8000, 16000, 24000, 32000];
const AY = [0, 7000, 14000, 21000];
const EDGE = 600;
const CORE = { x0: 12500, x1: 19500, y0: 7800, y1: 13200, t: 300 };

/**
 * Planta tipo de edificio de oficinas (32 × 21 m entre ejes): retícula 8,0 × 7,0 m, núcleo de
 * hormigón con escalera protegida y dos ascensores, aseos, muro cortina modulado a 1,50 m,
 * puestos de trabajo con el escritorio dinámico de la biblioteca y presentación A3 a 1:150.
 */
export function createBuildingFloorTemplate(): DocumentData {
  const b = new TemplateBuilder('Edificio de oficinas · planta tipo');

  const ejes = b.layer('s-ejes', 'S-EJES', 'aci:1', 13, 'CENTER');
  const pilar = b.layer('s-pilares', 'S-PILARES', 'aci:8', 50);
  const nucleo = b.layer('s-nucleo', 'S-NUCLEO-HA', 'aci:8', 50);
  const nucleoH = b.layer('s-nucleo-trama', 'S-NUCLEO-TRAMA', 'aci:252', 9);
  const fach = b.layer('a-fachada', 'A-FACHADA', 'aci:4', 35);
  const tab = b.layer('a-tabiques', 'A-TABIQUES', 'aci:7', 25);
  const vid = b.layer('a-mamparas', 'A-MAMPARAS', 'aci:4', 13);
  const esc = b.layer('a-escalera', 'A-ESCALERA', 'aci:7', 18);
  const asc = b.layer('a-ascensores', 'A-ASCENSORES', 'aci:6', 18);
  const mob = b.layer('a-mobiliario', 'A-MOBILIARIO', 'aci:9', 13);
  const san = b.layer('a-sanitarios', 'A-SANITARIOS', 'aci:5', 13);
  const cota = b.layer('a-cotas', 'A-COTAS', 'aci:3', 18);
  const rot = b.layer('a-rotulos', 'A-ROTULOS', 'aci:7', 25);
  const papMarco = b.layer('p-marco', 'P-MARCO', 'aci:7', 70);
  const papFino = b.layer('p-fino', 'P-FINO', 'aci:7', 18);
  const papTexto = b.layer('p-texto', 'P-TEXTO', 'aci:7', 25);
  const vpL = b.layer('p-viewport', 'P-VIEWPORT', 'aci:8', 9, 'Continuous', { plot: false });

  const ds = b.dimStyle('ds-1-150', 'ISO-25 · 1:150', 150, { precision: 0, arrow1: 'architectural', arrow2: 'architectural', arrowSize: 1.6 });
  b.settings({ currentDimStyle: ds, currentLayer: tab, annotationScale: 1 / 150, ltscale: 60 });

  const s = planSymbols(b);
  const lib = furnitureLibrary();
  const desk = b.libraryBlock(lib.find((i) => i.name === 'Escritorio')!);
  const table = b.libraryBlock(lib.find((i) => i.name === 'Mesa de comedor con sillas')!);
  const sofa = b.libraryBlock(lib.find((i) => i.name === 'Sofá paramétrico')!);
  const TXT = 375;

  // ---------------------------------------------------------------- ejes
  b.use(ejes);
  const [xMin, xMax] = [AX[0], AX[AX.length - 1]];
  const [yMin, yMax] = [AY[0], AY[AY.length - 1]];
  AX.forEach((x, i) => {
    b.line([x, yMin - 1200], [x, yMax + 1200]);
    for (const y of [yMin - 1600, yMax + 1600]) bubble(b, [x, y], String.fromCharCode(65 + i), rot);
  });
  AY.forEach((y, i) => {
    b.line([xMin - 1200, y], [xMax + 1200, y]);
    for (const x of [xMin - 1600, xMax + 1600]) bubble(b, [x, y], String(i + 1), rot);
  });

  // ------------------------------------------------------------- pilares
  for (const x of AX) for (const y of AY) {
    b.hatchRect(x - 250, y - 250, 500, 500, 'SOLID', { layer: pilar });
    b.use(pilar).rect(x - 250, y - 250, 500, 500);
  }

  // ------------------------------------------------ fachada: muro cortina
  b.use(fach);
  const fx0 = xMin - EDGE;
  const fx1 = xMax + EDGE;
  const fy0 = yMin - EDGE;
  const fy1 = yMax + EDGE;
  b.rect(fx0, fy0, fx1 - fx0, fy1 - fy0, { lineweight: 50 });
  b.rect(fx0 + 150, fy0 + 150, fx1 - fx0 - 300, fy1 - fy0 - 300, { layer: vid });
  for (let x = fx0 + 1500; x < fx1 - 100; x += 1500) {
    b.rect(x - 40, fy0, 80, 220);
    b.rect(x - 40, fy1 - 220, 80, 220);
  }
  for (let y = fy0 + 1500; y < fy1 - 100; y += 1500) {
    b.rect(fx0, y - 40, 220, 80);
    b.rect(fx1 - 220, y - 40, 220, 80);
  }

  // ----------------------------------------------------- núcleo de hormigón
  const { x0, x1, y0, y1, t } = CORE;
  const sx = x0 + t + 2500; // tabique entre escalera y ascensores
  const stairDoor = x0 + 900;
  const lobbyGap: [number, number] = [sx + 900, x1 - t - 900];
  const southGaps: Array<[number, number]> = [[stairDoor, stairDoor + 900], lobbyGap];
  const conc = (x: number, y: number, w: number, h: number) => b.hatchRect(x, y, w, h, 'AR-CONC', { layer: nucleoH, scale: 35 });
  // Trama por tramos macizos (sin contorno propio: el contorno se dibuja continuo aparte)
  let cur = x0;
  for (const [g0, g1] of southGaps) {
    conc(cur, y0, g0 - cur, t);
    cur = g1;
  }
  conc(cur, y0, x1 - cur, t);
  conc(x0, y1 - t, x1 - x0, t);
  conc(x0, y0 + t, t, y1 - y0 - 2 * t);
  conc(x1 - t, y0 + t, t, y1 - y0 - 2 * t);
  conc(sx, y0 + t, 200, y1 - y0 - 2 * t);
  b.use(nucleo);
  b.pline([[x1, y0], [x1, y1], [x0, y1], [x0, y0]], false);
  b.pline([[x1 - t, y0 + t], [x1 - t, y1 - t], [x0 + t, y1 - t], [x0 + t, y0 + t]], false);
  cur = x0;
  for (const [g0, g1] of southGaps) {
    b.line([cur, y0], [g0, y0]).line([Math.max(cur, x0 + t), y0 + t], [g0, y0 + t]);
    b.line([g0, y0], [g0, y0 + t]).line([g1, y0], [g1, y0 + t]);
    cur = g1;
  }
  b.line([cur, y0], [x1, y0]).line([cur, y0 + t], [x1 - t, y0 + t]);
  b.rect(sx, y0 + t, 200, y1 - y0 - 2 * t);
  // Puerta de la escalera (EI2 60-C5), abre en sentido de evacuación
  b.use(tab).insert(s.door, [stairDoor + 900, y0], { rot: 180, sx: 0.9 });

  // Escalera de dos tramos
  b.use(esc);
  const sy0 = y0 + t;
  const sy1 = y1 - t;
  const fl = 1150;
  const fA = x0 + t + 50;
  const fB = fA + fl + 100;
  const landing0 = sy0 + 1300;
  const landing1 = sy1 - 1200;
  b.rect(fA, landing0, fl, landing1 - landing0).rect(fB, landing0, fl, landing1 - landing0);
  for (let y = landing0 + 280; y < landing1 - 10; y += 280) {
    b.line([fA, y], [fA + fl, y]);
    b.line([fB, y], [fB + fl, y]);
  }
  b.line([fA + fl + 50, landing0 - 200], [fA + fl + 50, landing1 + 200], { lineweight: 25 });
  b.pline([[fA + fl / 2, landing0 + 100], [fA + fl / 2, landing1 - 300]], false);
  b.hatch([[[fA + fl / 2, landing1 - 100], [fA + fl / 2 - 120, landing1 - 330], [fA + fl / 2 + 120, landing1 - 330]]], 'SOLID', { layer: esc });
  b.line([fB, landing0 + 1400], [fB + fl, landing0 + 1900], { lineweight: 25 });
  b.text('SUBE', [fA + fl / 2, landing0 - 350], 220, { h: 'center', layer: rot });

  // Ascensores
  b.use(asc);
  const cars: Array<[number, number]> = [
    [sx + 350, 1600],
    [sx + 350 + 1600 + 200, 1600],
  ];
  const carY = y1 - t - 2200;
  for (const [cx, cw] of cars) {
    b.rect(cx, carY, cw, 2050);
    b.line([cx, carY], [cx + cw, carY + 2050]).line([cx + cw, carY], [cx, carY + 2050]);
    b.rect(cx + 300, carY - 120, cw - 600, 120);
  }
  b.use(tab).line([sx + 200, carY - 200], [x1 - t, carY - 200]);

  // ------------------------------------------------------------------ aseos
  const ws = { x0: 20300, x1: 23500, y0: 8000, y1: 13000 };
  const doors: Array<[number, number]> = [[9550, 10350], [10650, 11450]];
  b.use(tab);
  b.pline([[ws.x0, ws.y0], [ws.x1, ws.y0], [ws.x1, ws.y1], [ws.x0, ws.y1]], false, { lineweight: 35 });
  b.line([ws.x0, ws.y0], [ws.x0, doors[0][0]], { lineweight: 35 });
  b.line([ws.x0, doors[0][1]], [ws.x0, doors[1][0]], { lineweight: 35 });
  b.line([ws.x0, doors[1][1]], [ws.x0, ws.y1], { lineweight: 35 });
  b.line([ws.x0, 10500], [ws.x1, 10500], { lineweight: 35 });
  for (const [yy, dir] of [[ws.y1, -1], [ws.y0, 1]] as const) {
    for (let i = 0; i < 3; i++) {
      const cx = ws.x0 + 250 + i * 1000;
      if (i > 0) b.line([cx - 50, yy], [cx - 50, yy + dir * 1500]);
      b.insert(s.wc, [cx + 450, yy], { layer: san, rot: dir > 0 ? 0 : 180 });
    }
    b.line([ws.x0 + 200, yy + dir * 1500], [ws.x0 + 3150, yy + dir * 1500]);
    b.insert(s.basin, [ws.x1, yy + dir * 2000], { layer: san, rot: 90 });
  }
  b.insert(s.door, [ws.x0, doors[0][1]], { rot: -90, sx: 0.8 });
  b.insert(s.door, [ws.x0, doors[1][0]], { rot: 90, sx: 0.8, sy: -0.8 });

  // ------------------------------------------------- salas de reuniones (mampara)
  const meeting = (rx0: number, ry0: number, rx1: number, ry1: number, doorX: number) => {
    b.use(vid);
    b.rect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    b.rect(rx0 + 60, ry0 + 60, rx1 - rx0 - 120, ry1 - ry0 - 120);
    b.use(tab).insert(s.door, [doorX, ry0 + 60], { sx: 0.9 });
    b.use(mob).insert(table, [(rx0 + rx1) / 2 - 1800, (ry0 + ry1) / 2 - 500], { dyn: { Ancho: 3600, 'Ancho de mesa': 1100 } });
  };
  meeting(600, 15200, 7400, 20400, 5800);
  meeting(24600, 15200, 31400, 20400, 25400);

  // --------------------------------------------------------- puestos de trabajo
  b.use(mob);
  const rows = (xs: number[], ys: number[]) => {
    for (const y of ys) for (const x of xs) {
      b.insert(desk, [x, y]);
      b.insert(desk, [x + 1400, y + 1450], { rot: 180 });
    }
  };
  const step = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i * 1600);
  rows(step(900, 7), [1200, 4600, 8400, 11600]);
  rows(step(24300, 5), [1200, 4600, 8400, 11600]);
  rows(step(12100, 5), [1200, 4600]);

  // Zona de descanso
  b.insert(sofa, [12800, 17200], { dyn: { Ancho: 2600 } });
  b.insert(sofa, [19200, 20400], { rot: 180, dyn: { Ancho: 2600 } });
  b.circle([16000, 18800], 600).circle([16000, 18800], 560);
  b.use(tab).rect(12600, 14400, 6800, 700);
  b.text('OFFICE', [16000, 14650], 250, { h: 'center', layer: rot });

  // ---------------------------------------------------------------- rótulos
  b.use(rot);
  const label = (name: string, at: P, detail?: string) =>
    b.mtext(detail ? `{\\b1${name}}\\P${detail}` : `{\\b1${name}}`, at, 6000, TXT, { attach: 5 });
  label('OFICINA DIÁFANA', [6000, 7300], '56 puestos');
  label('OFICINA DIÁFANA', [28000, 7300], '40 puestos');
  label('OFICINA', [16000, 3800], '20 puestos');
  label('SALA DE REUNIONES 1', [4000, 15900], '12 pax');
  label('SALA DE REUNIONES 2', [28000, 15900], '12 pax');
  label('DESCANSO', [14200, 20000]);
  b.text('ESCALERA', [fA + fl + 50, sy1 - 600], 260, { h: 'center' });
  b.text('PROTEGIDA', [fA + fl + 50, sy1 - 900], 260, { h: 'center' });
  b.text('ASCENSORES', [(sx + x1) / 2, carY - 700], 260, { h: 'center' });
  b.text('VESTÍBULO', [(sx + x1) / 2, y0 + 1300], 260, { h: 'center' });
  b.text('ASEOS', [(ws.x0 + ws.x1) / 2, 10150], 260, { h: 'center' });
  b.insert(s.north, [xMax + 4200, yMax - 1500], { layer: rot, sx: 2 });

  // ------------------------------------------------------------------- cotas
  b.use(cota);
  b.dimChain(AX, yMin - 2000, yMin - 2700, ds);
  b.dimLinear([fx0, fy0], [fx1, fy0], [fx0, yMin - 3500], ds);
  b.dimChain(AY, xMin - 2000, xMin - 2700, ds, { vertical: true });
  b.dimLinear([fx0, fy0], [fx0, fy1], [xMin - 3500, fy0], ds, { vertical: true });

  // ---------------------------------------------------------- presentación
  const layoutId = b.layout('A3 · Planta tipo 1:150');
  b.within(layoutId, () => {
    const area = drawSheet(b, 420, 297, { frame: papMarco, thin: papFino, text: papTexto }, {
      title: 'EDIFICIO DE OFICINAS',
      subtitle: 'Planta tipo · distribución y estructura',
      number: 'A-201',
      scale: '1:150',
      date: '2026-09-18',
      sheet: '1 / 1',
      drawnBy: 'FModel',
      checkedBy: '—',
      docType: 'Plano de planta',
      status: 'Proyecto básico',
      rev: 'A',
      owner: 'FusionStructure',
    });
    b.use(vpL).viewport({ x: area.x, y: 62, w: area.w, h: area.y + area.h - 62 }, [16950, 9750], 1 / 150, '1:150');
    b.use(papTexto);
    b.text('PLANTA TIPO', [area.x + 2, 50], 5);
    b.line([area.x + 2, 47.5], [area.x + 58, 47.5], { layer: papMarco });
    b.text('E 1:150 · retícula 8 × 7 m', [area.x + 2, 42], 2.8, { style: 'ts-mono' });
    b.mtext(
      '{\\b1DATOS DE PLANTA}\\PSuperficie construida · 737 m²\\PPuestos de trabajo · 116\\PSalas de reuniones · 2 × 12 pax\\PNúcleo · escalera protegida + 2 ascensores',
      [area.x + 90, 52],
      110,
      2.5,
      { spacing: 1.1 },
    );
  });

  return b.build();
}

function bubble(b: TemplateBuilder, c: P, label: string, textLayer: string): void {
  b.circle(c, 400, { linetype: 'lt-continuous' });
  b.text(label, c, 420, { h: 'middle', v: 'middle', layer: textLayer });
}
