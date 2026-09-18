import type { DocumentData } from '../document/types';
import { TemplateBuilder, type P } from './builder';
import { drawSheet } from './sheet';

const F = { b: 2000, h: 500, bottom: -2100 }; // zapata 2,00 × 2,00 × 0,50 m
const LEAN = 100; // hormigón de limpieza
const COL = 400; // pilar 40 × 40
const COVER = 75;
const SLAB = { t: 150, gravel: 150 };
const SPACING = 150;

/**
 * Zapata aislada centrada con pilar de hormigón armado: sección A-A y planta, armado con
 * recubrimientos reales, hormigón de limpieza, relleno, solera con mallazo y cuadro de
 * armado. Cotas ISO a 1:25 y presentación A3.
 */
export function createFoundationDetailTemplate(): DocumentData {
  const b = new TemplateBuilder('Detalle de zapata aislada');

  const horm = b.layer('s-hormigon', 'S-HORMIGON', 'aci:7', 50);
  const hormT = b.layer('s-hormigon-trama', 'S-HORMIGON-TRAMA', 'aci:252', 9);
  const terreno = b.layer('s-terreno', 'S-TERRENO', 'aci:32', 13);
  const relleno = b.layer('s-relleno', 'S-RELLENO', 'aci:42', 9);
  const arm = b.layer('s-armado', 'S-ARMADO', 'aci:1', 35);
  const armOc = b.layer('s-armado-oculto', 'S-ARMADO-PLANTA', 'aci:1', 18, 'HIDDEN2');
  const ejes = b.layer('s-ejes', 'S-EJES', 'aci:1', 13, 'CENTER');
  const cota = b.layer('s-cotas', 'S-COTAS', 'aci:3', 18);
  const nota = b.layer('s-notas', 'S-NOTAS', 'aci:7', 18);
  const papMarco = b.layer('p-marco', 'P-MARCO', 'aci:7', 70);
  const papFino = b.layer('p-fino', 'P-FINO', 'aci:7', 18);
  const papTexto = b.layer('p-texto', 'P-TEXTO', 'aci:7', 25);
  const vpL = b.layer('p-viewport', 'P-VIEWPORT', 'aci:8', 9, 'Continuous', { plot: false });

  const ds = b.dimStyle('ds-1-25', 'ISO-25 · 1:25', 25, { precision: 0, arrowSize: 2 });
  b.settings({ currentDimStyle: ds, currentLayer: horm, annotationScale: 1 / 25, ltscale: 20 });
  const T = 62.5;
  const Hd = 100;

  // ============================================================ SECCIÓN A-A
  const half = F.b / 2;
  const top = F.bottom + F.h;
  const colTop = 700;
  const exc = half + 500;
  const soil = 400;
  // Terreno natural a ambos lados de la excavación
  for (const s of [-1, 1]) {
    const xa = s * exc;
    const xb = s * (exc + soil);
    b.hatch([[[xa, -SLAB.t - SLAB.gravel], [xb, -SLAB.t - SLAB.gravel], [xb, F.bottom - LEAN - 300], [xa, F.bottom - LEAN - 300]]], 'EARTH', { layer: terreno, scale: 20, angle: 45 });
  }
  b.hatchRect(-exc - soil, F.bottom - LEAN - 300, (exc + soil) * 2, 300, 'EARTH', { layer: terreno, scale: 20, angle: 45 });
  b.use(terreno).pline([[-exc, -SLAB.t - SLAB.gravel], [-exc, F.bottom - LEAN], [exc, F.bottom - LEAN], [exc, -SLAB.t - SLAB.gravel]], false);
  // Relleno compactado sobre la zapata (sin invadir el pilar)
  const fillTop = -SLAB.t - SLAB.gravel;
  for (const k of [-1, 1]) {
    const fill: P[] = [
      [k * exc, F.bottom - LEAN], [k * (half + LEAN), F.bottom - LEAN], [k * (half + LEAN), F.bottom], [k * half, F.bottom],
      [k * half, top], [k * (COL / 2), top], [k * (COL / 2), fillTop], [k * exc, fillTop],
    ];
    b.hatch([fill], 'AR-SAND', { layer: relleno, scale: 18 });
  }
  // Encachado de grava y solera
  const slabX = exc + soil;
  b.hatch([[[-slabX, -SLAB.t - SLAB.gravel], [-COL / 2, -SLAB.t - SLAB.gravel], [-COL / 2, -SLAB.t], [-slabX, -SLAB.t]]], 'DOTS', { layer: relleno, scale: 22 });
  b.hatch([[[COL / 2, -SLAB.t - SLAB.gravel], [slabX, -SLAB.t - SLAB.gravel], [slabX, -SLAB.t], [COL / 2, -SLAB.t]]], 'DOTS', { layer: relleno, scale: 22 });
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -slabX : COL / 2;
    b.hatchRect(x0, -SLAB.t, slabX - COL / 2, SLAB.t, 'AR-CONC', { layer: hormT, scale: 8 });
    b.use(horm).rect(x0, -SLAB.t, slabX - COL / 2, SLAB.t);
    b.line([x0 + (s < 0 ? 0 : 40), -SLAB.t / 2], [x0 + slabX - COL / 2 - (s < 0 ? 40 : 0), -SLAB.t / 2], { layer: armOc });
  }
  // Hormigón de limpieza
  b.hatchRect(-half - LEAN, F.bottom - LEAN, F.b + 2 * LEAN, LEAN, 'AR-CONC', { layer: hormT, scale: 5 });
  b.use(horm).rect(-half - LEAN, F.bottom - LEAN, F.b + 2 * LEAN, LEAN);
  // Zapata y pilar en sección
  const footing: P[] = [[-half, F.bottom], [half, F.bottom], [half, top], [COL / 2, top], [COL / 2, colTop], [-COL / 2, colTop], [-COL / 2, top], [-half, top]];
  b.hatch([footing], 'AR-CONC', { layer: hormT, scale: 8 });
  b.use(horm).pline([[-COL / 2, colTop], [-COL / 2, top], [-half, top], [-half, F.bottom], [half, F.bottom], [half, top], [COL / 2, top], [COL / 2, colTop]], false);
  breakLine(b, [-COL / 2 - 60, colTop], [COL / 2 + 60, colTop], horm);

  // Armado de la zapata: parrilla inferior con patillas, barras perpendiculares en punto
  b.use(arm);
  const yb = F.bottom + COVER;
  const xb = half - COVER;
  b.pline([[-xb, yb + 300], [-xb, yb], [xb, yb], [xb, yb + 300]], false, { width: 16 });
  for (let x = -xb + 60; x <= xb - 50; x += SPACING) b.hatch([circlePts([x, yb + 20], 8)], 'SOLID', { layer: arm });
  // Esperas del pilar: 4Ø20 con patilla de 400 sobre la parrilla
  for (const s of [-1, 1]) {
    const x = s * (COL / 2 - 40 - 10);
    b.pline([[x + s * 400, yb + 45], [x, yb + 45], [x, colTop]], false, { width: 20 });
  }
  // Cercos Ø8 c/15 en pilar y dos cercos de atado en la zapata
  for (let y = top - 350; y < colTop - 30; y += SPACING) b.line([-COL / 2 + 32, y], [COL / 2 - 32, y], { lineweight: 35 });

  // Cotas de la sección
  b.use(cota);
  b.dimLinear([-half, F.bottom], [half, F.bottom], [0, F.bottom - LEAN - 450], ds);
  b.dimLinear([-half - LEAN, F.bottom - LEAN], [half + LEAN, F.bottom - LEAN], [0, F.bottom - LEAN - 650], ds);
  b.dimChain([F.bottom - LEAN, F.bottom, top, 0], exc + soil, exc + soil + 300, ds, { vertical: true });
  b.dimLinear([-COL / 2, colTop - 150], [COL / 2, colTop - 150], [0, colTop - 60], ds);
  b.dimLinear([-xb, yb], [-half, F.bottom], [-half - 350, yb], ds, { vertical: true, text: 'r = 75' });

  // Niveles
  b.use(nota);
  levelMark(b, [exc + 300, 0], '±0,00 NPT', T);
  levelMark(b, [exc + 300, F.bottom], '−2,10', T);

  // Notas
  b.leader([[-COL / 2 + 20, 350], [-1950, 520], [-2050, 520]], 'PILAR 40×40 · HA-25\\P4Ø20 + cercos Ø8 c/15', T, 60, { layer: nota });
  b.leader([[-600, yb + 20], [-1950, -1250], [-2050, -1250]], 'PARRILLA INFERIOR\\PØ16 c/15 · ambas direcciones', T, 60, { layer: nota });
  b.leader([[-half - 50, F.bottom - LEAN / 2], [-1950, -2550], [-2050, -2550]], 'HORMIGÓN DE LIMPIEZA\\PHL-150 · e = 10 cm', T, 60, { layer: nota });
  b.leader([[-900, -900], [-1950, -600], [-2050, -600]], 'RELLENO COMPACTADO\\P95 % Proctor modificado', T, 60, { layer: nota });
  b.leader([[1200, -SLAB.t / 2], [1700, 520], [1800, 520]], 'SOLERA HA-20 · e = 15 cm\\PMallazo ME 15×15 Ø6', T, 60, { layer: nota });
  b.leader([[exc + 200, -2350], [exc + 500, -2700], [exc + 600, -2700]], 'TERRENO NATURAL', T, 60, { layer: nota });
  b.text('SECCIÓN A-A', [0, -3350], Hd, { h: 'center', layer: nota });
  b.text('E 1:25', [0, -3470], T, { h: 'center', layer: nota, style: 'ts-mono' });

  // ================================================================ PLANTA
  const px = 4300;
  const py = -1200;
  b.use(horm).rect(px - half, py - half, F.b, F.b);
  b.rect(px - half - LEAN, py - half - LEAN, F.b + 2 * LEAN, F.b + 2 * LEAN, { layer: armOc, lineweight: 13 });
  b.hatchRect(px - COL / 2, py - COL / 2, COL, COL, 'AR-CONC', { layer: hormT, scale: 8 });
  b.use(horm).rect(px - COL / 2, py - COL / 2, COL, COL);
  b.use(armOc);
  for (let d = -xb + 60; d <= xb - 50; d += SPACING) {
    b.line([px + d, py - xb], [px + d, py + xb]);
    b.line([px - xb, py + d], [px + xb, py + d]);
  }
  b.use(ejes);
  b.line([px - half - 600, py], [px + half + 600, py]);
  b.line([px, py - half - 600], [px, py + half + 600]);
  bubble(b, [px + half + 780, py], '1', nota);
  bubble(b, [px, py + half + 780], 'A', nota);
  sectionMark(b, [px - half - 350, py], [px + half + 350, py], 'A', nota, T);
  b.use(cota);
  b.dimLinear([px - half, py - half], [px + half, py - half], [px, py - half - 400], ds);
  b.dimLinear([px + half, py - half], [px + half, py + half], [px + half + 400, py], ds, { vertical: true });
  b.dimLinear([px - COL / 2, py + COL / 2], [px + COL / 2, py + COL / 2], [px, py + 600], ds);
  b.text('PLANTA', [px, -3350], Hd, { h: 'center', layer: nota });
  b.text('E 1:25', [px, -3470], T, { h: 'center', layer: nota, style: 'ts-mono' });

  // ---------------------------------------------------------- presentación
  const layoutId = b.layout('A3 · Cimentación 1:25');
  b.within(layoutId, () => {
    const area = drawSheet(b, 420, 297, { frame: papMarco, thin: papFino, text: papTexto }, {
      title: 'ZAPATA AISLADA Z-1',
      subtitle: 'Sección, planta y cuadro de armado',
      number: 'E-301',
      scale: '1:25',
      date: '2026-09-18',
      sheet: '1 / 1',
      drawnBy: 'FModel',
      checkedBy: '—',
      docType: 'Cimentación',
      status: 'Para revisión',
      rev: 'A',
      owner: 'FusionStructure',
    });
    b.use(vpL).viewport({ x: area.x, y: 62, w: area.w, h: area.y + area.h - 62 }, [1700, -1340], 1 / 25, '1:25');
    // Cuadro de armado y materiales en papel, bajo el viewport
    b.use(papTexto);
    b.mtext(
      '{\\b1CUADRO DE ARMADO}\\PPos. Ø   Nº  Long.  Forma\\P1    16  13  2450   U, patillas 300\\P2    16  13  2450   U, patillas 300\\P3    20   4  3150   L, patilla 400\\P4     8  12  1400   cerco 34×34',
      [area.x + 2, 56],
      100,
      2.2,
      { style: 'ts-mono', spacing: 1.05 },
    );
    b.mtext(
      '{\\b1MATERIALES}\\PHormigón HA-25/B/20/IIa\\PAcero B500S · recubrimiento 75 mm\\PHormigón de limpieza HL-150\\PTerreno: σadm ≥ 200 kN/m²',
      [area.x + 108, 56],
      95,
      2.2,
      { spacing: 1.05 },
    );
  });

  return b.build();
}

function circlePts([cx, cy]: P, r: number): Array<[number, number, number]> {
  // Círculo como dos semicircunferencias (bulge = 1) para usarlo como contorno de sombreado
  return [
    [cx - r, cy, 1],
    [cx + r, cy, 1],
  ];
}

function bubble(b: TemplateBuilder, c: P, label: string, layer: string): void {
  b.circle(c, 160, { linetype: 'lt-continuous' });
  b.text(label, c, 170, { h: 'middle', v: 'middle', layer });
}

function levelMark(b: TemplateBuilder, [x, y]: P, label: string, th: number): void {
  b.hatch([[[x, y], [x - 60, y + 90], [x + 60, y + 90]]], 'SOLID');
  b.line([x - 60, y + 90], [x + 600, y + 90]);
  b.text(label, [x + 20, y + 120], th);
}

function breakLine(b: TemplateBuilder, a: P, c: P, layer: string): void {
  const m = (a[0] + c[0]) / 2;
  b.pline([a, [m - 40, a[1]], [m - 15, a[1] + 60], [m + 15, a[1] - 60], [m + 40, a[1]], c], false, { layer });
}

function sectionMark(b: TemplateBuilder, a: P, c: P, letter: string, layer: string, th: number): void {
  for (const p of [a, c]) {
    const s = p === a ? 1 : -1;
    b.pline([p, [p[0] + s * 150, p[1]]], false, { layer, width: 12 });
    const tip: P = [p[0], p[1] + 250];
    b.line(p, tip, { layer });
    b.hatch([[tip, [tip[0] - 25, tip[1] - 70], [tip[0] + 25, tip[1] - 70]]], 'SOLID', { layer });
    b.text(letter, [tip[0], tip[1] + 120], th * 1.5, { h: 'middle', v: 'middle', layer });
  }
}
