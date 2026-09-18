import type { DocumentData } from '../document/types';
import { TemplateBuilder, type P } from './builder';
import { drawSheet } from './sheet';

type V = P | [number, number, number];

// Perfiles europeos (mm): HEB 300 y IPE 300
const HEB = { h: 300, b: 300, tw: 11, tf: 19, r: 27 };
const IPE = { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15 };
const PLATE = { t: 20, w: 180, top: 40, bottom: 340 };
const BOLT_ROWS = [-60, -150, -240];
const GAUGE = 55; // media distancia entre filas verticales de tornillos
const Q = -Math.tan(Math.PI / 8); // bulge de un acuerdo cóncavo de 90° recorrido en sentido horario

/**
 * Detalle de unión viga-pilar atornillada con chapa de testa: HEB 300 + IPE 300, 6 M20 8.8,
 * rigidizadores y soldaduras. Alzado, sección por la chapa y sección por la fila de tornillos,
 * todo acotado con estilo ISO a 1:10 y presentado en A3.
 */
export function createStructuralDetailTemplate(): DocumentData {
  const b = new TemplateBuilder('Detalle de unión viga-pilar');

  const acero = b.layer('s-acero', 'S-ACERO', 'aci:7', 50);
  const aceroF = b.layer('s-acero-fino', 'S-ACERO-ARISTAS', 'aci:8', 13);
  const trama = b.layer('s-seccion', 'S-SECCION-MACIZO', 'aci:8', 9);
  const torn = b.layer('s-tornilleria', 'S-TORNILLERIA', 'aci:5', 25);
  const oculto = b.layer('s-ocultas', 'S-OCULTAS', 'aci:8', 13, 'HIDDEN2');
  const ejes = b.layer('s-ejes', 'S-EJES', 'aci:1', 13, 'CENTER2');
  const sold = b.layer('s-soldadura', 'S-SOLDADURA', 'aci:1', 25);
  const cota = b.layer('s-cotas', 'S-COTAS', 'aci:3', 18);
  const nota = b.layer('s-notas', 'S-NOTAS', 'aci:7', 18);
  const papMarco = b.layer('p-marco', 'P-MARCO', 'aci:7', 70);
  const papFino = b.layer('p-fino', 'P-FINO', 'aci:7', 18);
  const papTexto = b.layer('p-texto', 'P-TEXTO', 'aci:7', 25);
  const vpL = b.layer('p-viewport', 'P-VIEWPORT', 'aci:8', 9, 'Continuous', { plot: false });

  const ds = b.dimStyle('ds-1-10', 'ISO-25 · 1:10', 10, { precision: 0, arrowSize: 2 });
  b.settings({ currentDimStyle: ds, currentLayer: acero, annotationScale: 1 / 10, ltscale: 10 });
  const T = 25; // texto de 2,5 mm a 1:10
  const Hd = 40;

  // =============================================================== ALZADO
  const colTop = 600;
  const colBot = -900;
  const beamEnd = 1200;
  // Pilar HEB 300 visto por el alma: alas en canto y líneas de tangencia del acuerdo
  b.use(acero);
  for (const x of [0, HEB.h]) b.line([x, colBot], [x, colTop]);
  for (const x of [HEB.tf, HEB.h - HEB.tf]) b.line([x, colBot], [x, colTop], { layer: aceroF });
  for (const x of [HEB.tf + HEB.r, HEB.h - HEB.tf - HEB.r]) b.line([x, colBot], [x, colTop], { layer: aceroF });
  breakLine(b, [-30, colTop], [HEB.h + 30, colTop], aceroF);
  breakLine(b, [-30, colBot], [HEB.h + 30, colBot], aceroF);
  // Rigidizadores alineados con las alas de la viga
  for (const yc of [-IPE.tf / 2, -IPE.h + IPE.tf / 2]) b.rect(HEB.tf, yc - 6, HEB.h - 2 * HEB.tf, 12);
  // Chapa de testa
  b.rect(HEB.h, -PLATE.bottom, PLATE.t, PLATE.top + PLATE.bottom);
  // Viga IPE 300
  const bx0 = HEB.h + PLATE.t;
  for (const y of [0, -IPE.h]) b.line([bx0, y], [beamEnd, y]);
  for (const y of [-IPE.tf, -IPE.h + IPE.tf]) b.line([bx0, y], [beamEnd, y], { layer: aceroF });
  for (const y of [-IPE.tf - IPE.r, -IPE.h + IPE.tf + IPE.r]) b.line([bx0, y], [beamEnd, y], { layer: aceroF });
  breakLine(b, [beamEnd, 30], [beamEnd, -IPE.h - 30], aceroF);
  // Tornillos vistos de perfil: cabeza dentro del pilar, tuerca y arandela en la chapa
  for (const y of BOLT_ROWS) {
    b.use(torn);
    b.rect(HEB.h - HEB.tf - 13, y - 16, 13, 32);
    b.rect(bx0, y - 18, 4, 36);
    b.rect(bx0 + 4, y - 16, 16, 32);
    b.rect(bx0 + 20, y - 10, 8, 20);
    b.line([HEB.h - HEB.tf, y - 10], [bx0, y - 10], { layer: oculto });
    b.line([HEB.h - HEB.tf, y + 10], [bx0, y + 10], { layer: oculto });
    b.line([HEB.h - HEB.tf - 40, y], [bx0 + 60, y], { layer: ejes });
  }
  // Soldaduras en ángulo a = 5 (ala-chapa)
  b.use(sold);
  for (const y of [0, -IPE.tf, -IPE.h + IPE.tf, -IPE.h]) {
    const up = y === 0 || y === -IPE.h + IPE.tf ? 1 : -1;
    b.hatch([[[bx0, y], [bx0 + 7, y], [bx0, y + up * 7]]], 'SOLID', { layer: sold });
  }
  // Corte A-A (mirando hacia el pilar) y B-B (por la primera fila de tornillos)
  sectionMark(b, [900, 90], [900, -420], 'A', 'left', nota, T);
  sectionMark(b, [-160, BOLT_ROWS[0]], [beamEnd + 60, BOLT_ROWS[0]], 'B', 'down', nota, T);

  // Cotas del alzado
  b.use(cota);
  b.dimLinear([0, colBot + 150], [HEB.h, colBot + 150], [0, colBot + 60], ds);
  b.dimLinear([HEB.h, PLATE.top], [bx0, PLATE.top], [0, PLATE.top + 70], ds);
  b.dimChain([PLATE.top, ...BOLT_ROWS, -PLATE.bottom], bx0, bx0 + 150, ds, { vertical: true });
  b.dimLinear([bx0, PLATE.top], [bx0, -PLATE.bottom], [bx0 + 240, 0], ds, { vertical: true });
  b.dimLinear([beamEnd - 100, 0], [beamEnd - 100, -IPE.h], [beamEnd - 40, 0], ds, { vertical: true });

  // Notas con directriz
  b.use(nota);
  b.leader([[HEB.h + 10, PLATE.top - 10], [470, 330], [560, 330]], 'CHAPA DE TESTA 380×180×20\\PS275JR', T, 30, { layer: nota });
  b.leader([[bx0 + 24, BOLT_ROWS[0]], [640, 170], [720, 170]], '6 TORN. M20 · 8.8\\PISO 4014 + ISO 4032', T, 30, { layer: nota });
  b.leader([[150, -IPE.h + IPE.tf / 2], [-120, -430], [-200, -430]], 'RIGIDIZADORES e = 12\\PS275JR · a = 5', T, 30, { layer: nota });
  b.leader([[bx0 + 3, -IPE.h - 3], [480, -560], [560, -560]], 'SOLDADURA EN ÁNGULO\\Pa = 5 mm · todo el contorno', T, 30, { layer: nota });
  b.text('HEB 300', [150, colTop - 120], T, { h: 'center', layer: nota, rot: 90 });
  b.text('IPE 300', [1060, -150], T, { h: 'center', v: 'middle', layer: nota });
  b.text('ALZADO', [150, -1060], Hd, { h: 'center', layer: nota });
  b.text('E 1:10', [150, -1110], T, { h: 'center', layer: nota, style: 'ts-mono' });

  // ======================================================== SECCIÓN A-A
  const ax = 1720;
  const plateY0 = -PLATE.bottom;
  b.use(acero).rect(ax - PLATE.w / 2, plateY0, PLATE.w, PLATE.top + PLATE.bottom);
  const ipe = ipeSection(ax, 0);
  b.hatch([ipe], 'SOLID', { layer: trama });
  b.use(acero).pline(ipe, true);
  for (const y of BOLT_ROWS) {
    for (const dx of [-GAUGE, GAUGE]) {
      b.use(torn);
      hexagon(b, [ax + dx, y], 17.3);
      b.circle([ax + dx, y], 10);
      b.line([ax + dx - 28, y], [ax + dx + 28, y], { layer: ejes });
      b.line([ax + dx, y - 28], [ax + dx, y + 28], { layer: ejes });
    }
  }
  b.use(cota);
  b.dimLinear([ax - GAUGE, BOLT_ROWS[2]], [ax + GAUGE, BOLT_ROWS[2]], [ax, plateY0 - 60], ds);
  b.dimLinear([ax - PLATE.w / 2, plateY0], [ax + PLATE.w / 2, plateY0], [ax, plateY0 - 130], ds);
  b.dimLinear([ax + PLATE.w / 2, PLATE.top], [ax + PLATE.w / 2, plateY0], [ax + PLATE.w / 2 + 90, 0], ds, { vertical: true });
  b.dimLinear([ax - IPE.b / 2, 0], [ax + IPE.b / 2, 0], [ax, PLATE.top + 70], ds);
  b.text('SECCIÓN A-A', [ax, -1060], Hd, { h: 'center', layer: nota });
  b.text('E 1:10', [ax, -1110], T, { h: 'center', layer: nota, style: 'ts-mono' });

  // ======================================================== SECCIÓN B-B
  const ox = 2280;
  const oy = -150;
  const heb = hebSection(ox, oy);
  // Secciones delgadas en macizo (ISO 128-50): la trama no cabe en alas de 11–19 mm
  b.hatch([heb], 'SOLID', { layer: trama });
  b.use(acero).pline(heb, true);
  b.hatchRect(ox + HEB.h, oy - PLATE.w / 2, PLATE.t, PLATE.w, 'SOLID', { layer: trama });
  b.use(acero).rect(ox + HEB.h, oy - PLATE.w / 2, PLATE.t, PLATE.w);
  const webX0 = ox + HEB.h + PLATE.t;
  const webX1 = webX0 + 380;
  b.hatchRect(webX0, oy - IPE.tw / 2, webX1 - webX0, IPE.tw, 'SOLID', { layer: trama });
  b.use(acero).line([webX0, oy - IPE.tw / 2], [webX1, oy - IPE.tw / 2]).line([webX0, oy + IPE.tw / 2], [webX1, oy + IPE.tw / 2]);
  breakLine(b, [webX1, oy + 40], [webX1, oy - 40], aceroF);
  for (const dy of [-GAUGE, GAUGE]) {
    const y = oy + dy;
    b.use(torn);
    b.rect(ox + HEB.h - HEB.tf - 13, y - 16, 13, 32);
    b.rect(ox + HEB.h - HEB.tf, y - 10, HEB.tf + PLATE.t, 20);
    b.rect(webX0, y - 18, 4, 36);
    b.rect(webX0 + 4, y - 16, 16, 32);
    b.rect(webX0 + 20, y - 10, 8, 20);
    b.line([ox + HEB.h - HEB.tf - 40, y], [webX0 + 60, y], { layer: ejes });
  }
  b.use(cota);
  b.dimLinear([ox, oy - HEB.b / 2], [ox + HEB.h, oy - HEB.b / 2], [ox, oy - HEB.b / 2 - 80], ds);
  b.dimLinear([ox, oy + HEB.b / 2], [ox, oy - HEB.b / 2], [ox - 80, oy], ds, { vertical: true });
  b.dimLinear([webX0 + 30, oy + GAUGE], [webX0 + 30, oy - GAUGE], [webX0 + 150, oy], ds, { vertical: true });
  b.text('HEB 300', [ox + HEB.h / 2, oy + HEB.b / 2 + 50], T, { h: 'center', layer: nota });
  b.text('SECCIÓN B-B', [ox + 300, -1060], Hd, { h: 'center', layer: nota });
  b.text('E 1:10', [ox + 300, -1110], T, { h: 'center', layer: nota, style: 'ts-mono' });

  // Notas generales
  b.mtext(
    '{\\b1NOTAS}\\P1. Acero en perfiles, chapas y rigidizadores S275JR (EN 10025-2).\\P2. Tornillos M20 calidad 8.8 con tuerca y arandela; taladros Ø22 mm.\\P3. Soldaduras en ángulo a = 5 mm con electrodo E42; inspección visual 100 %.\\P4. Cotas en milímetros. Comprobar en obra antes de fabricar.',
    [-460, -1220],
    2300,
    T,
    { layer: nota, spacing: 1.15 },
  );

  // ---------------------------------------------------------- presentación
  const layoutId = b.layout('A3 · Detalle 1:10');
  b.within(layoutId, () => {
    const area = drawSheet(b, 420, 297, { frame: papMarco, thin: papFino, text: papTexto }, {
      title: 'UNIÓN VIGA-PILAR',
      subtitle: 'HEB 300 / IPE 300 · chapa de testa',
      number: 'E-501',
      scale: '1:10',
      date: '2026-09-18',
      sheet: '1 / 1',
      drawnBy: 'FModel',
      checkedBy: '—',
      docType: 'Detalle estructural',
      status: 'Para revisión',
      rev: 'A',
      owner: 'FusionStructure',
    });
    b.use(vpL).viewport({ x: area.x, y: 62, w: area.w, h: area.y + area.h - 62 }, [1340, -370], 1 / 10, '1:10');
  });

  return b.build();
}

/** IPE en sección (centrado en x, ala superior en y = top), recorrido antihorario con acuerdos. */
function ipeSection(cx: number, top: number): V[] {
  const { h, b, tw, tf, r } = IPE;
  const X = (x: number) => cx + x;
  const Y = (y: number) => top + y;
  const hw = tw / 2;
  return [
    [X(-b / 2), Y(-h)], [X(b / 2), Y(-h)], [X(b / 2), Y(-h + tf)],
    [X(hw + r), Y(-h + tf), Q], [X(hw), Y(-h + tf + r)],
    [X(hw), Y(-tf - r), Q], [X(hw + r), Y(-tf)],
    [X(b / 2), Y(-tf)], [X(b / 2), Y(0)], [X(-b / 2), Y(0)], [X(-b / 2), Y(-tf)],
    [X(-hw - r), Y(-tf), Q], [X(-hw), Y(-tf - r)],
    [X(-hw), Y(-h + tf + r), Q], [X(-hw - r), Y(-h + tf)],
    [X(-b / 2), Y(-h + tf)],
  ];
}

/** HEB en sección horizontal: alas verticales en x = 0 y x = h, alma horizontal centrada en cy. */
function hebSection(x0: number, cy: number): V[] {
  const { h, b, tw, tf, r } = HEB;
  const X = (x: number) => x0 + x;
  const Y = (y: number) => cy + y;
  const hw = tw / 2;
  return [
    [X(0), Y(-b / 2)], [X(tf), Y(-b / 2)],
    [X(tf), Y(-hw - r), Q], [X(tf + r), Y(-hw)],
    [X(h - tf - r), Y(-hw), Q], [X(h - tf), Y(-hw - r)],
    [X(h - tf), Y(-b / 2)], [X(h), Y(-b / 2)], [X(h), Y(b / 2)], [X(h - tf), Y(b / 2)],
    [X(h - tf), Y(hw + r), Q], [X(h - tf - r), Y(hw)],
    [X(tf + r), Y(hw), Q], [X(tf), Y(hw + r)],
    [X(tf), Y(b / 2)], [X(0), Y(b / 2)],
  ];
}

function hexagon(b: TemplateBuilder, [cx, cy]: P, r: number): void {
  const pts: P[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  b.pline(pts, true);
}

/** Línea de rotura con zeta central. */
function breakLine(b: TemplateBuilder, a: P, c: P, layer: string): void {
  const [dx, dy] = [c[0] - a[0], c[1] - a[1]];
  const len = Math.hypot(dx, dy);
  const [ux, uy] = [dx / len, dy / len];
  const [nx, ny] = [-uy, ux];
  const m: P = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const z = Math.min(20, len / 8);
  b.pline(
    [a, [m[0] - ux * z, m[1] - uy * z], [m[0] - ux * z * 0.3 + nx * z * 1.4, m[1] - uy * z * 0.3 + ny * z * 1.4], [m[0] + ux * z * 0.3 - nx * z * 1.4, m[1] + uy * z * 0.3 - ny * z * 1.4], [m[0] + ux * z, m[1] + uy * z], c],
    false,
    { layer },
  );
}

/** Marca de corte: trazos gruesos en los extremos, flechas hacia donde se mira y letra. */
function sectionMark(b: TemplateBuilder, a: P, c: P, letter: string, look: 'left' | 'right' | 'up' | 'down', layer: string, th: number): void {
  const dir: P = look === 'left' ? [-1, 0] : look === 'right' ? [1, 0] : look === 'up' ? [0, 1] : [0, -1];
  for (const p of [a, c]) {
    const [ux, uy] = [c[0] - a[0], c[1] - a[1]];
    const len = Math.hypot(ux, uy);
    const s = p === a ? 1 : -1;
    const q: P = [p[0] + (ux / len) * 60 * s, p[1] + (uy / len) * 60 * s];
    b.pline([p, q], false, { layer, width: 5 });
    const tip: P = [p[0] + dir[0] * 70, p[1] + dir[1] * 70];
    b.line(p, tip, { layer });
    b.hatch([[tip, [tip[0] - dir[0] * 25 + dir[1] * 9, tip[1] - dir[1] * 25 + dir[0] * 9], [tip[0] - dir[0] * 25 - dir[1] * 9, tip[1] - dir[1] * 25 - dir[0] * 9]]], 'SOLID', { layer });
    b.text(letter, [tip[0] + dir[0] * 30, tip[1] + dir[1] * 30], th * 1.4, { h: 'middle', v: 'middle', layer });
  }
}
