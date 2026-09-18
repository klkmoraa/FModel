import type { TemplateBuilder } from './builder';

/**
 * Símbolos de planta en milímetros, base en el origen. Todos en la capa 0 con color
 * PorBloque, de modo que heredan la capa del INSERT (convención de bibliotecas CAD).
 */
const BY = { color: 'ByBlock', linetype: 'ByBlock', lineweight: -2 };

export interface PlanSymbols {
  door: string;
  window: string;
  wc: string;
  basin: string;
  shower: string;
  sink: string;
  hob: string;
  fridge: string;
  north: string;
  level: string;
}

/** Puerta abatible de 1000: bisagra en el origen, hueco sobre +X, hoja abierta 90° hacia +Y. */
function door(b: TemplateBuilder) {
  return b.block(
    'FM Puerta abatible',
    () => {
      b.rect(0, 0, 40, 1000, BY);
      b.arc([0, 0], 1000, 0, 90, { ...BY, lineweight: 9 });
    },
    'Hoja de 40 mm y barrido de apertura. Escalar en X/Y con el ancho de paso.',
  );
}

/** Ventana de 1000 × 250 (ancho de hueco × espesor de muro): marco, dos vidrios y alféizar. */
function window(b: TemplateBuilder) {
  return b.block(
    'FM Ventana corredera',
    () => {
      b.rect(0, 0, 1000, 250, BY);
      b.line([0, 110], [540, 110], BY);
      b.line([460, 140], [1000, 140], BY);
      b.line([0, -40], [1000, -40], { ...BY, lineweight: 9 });
    },
    'Corredera de dos hojas. Escalar X con el hueco e Y con el espesor del muro / 250.',
  );
}

function wc(b: TemplateBuilder) {
  return b.block('FM Inodoro', () => {
    b.rect(-220, 0, 440, 170, BY);
    b.line([-180, 170], [-180, 420], BY);
    b.line([180, 170], [180, 420], BY);
    b.arc([0, 420], 180, 0, 180, BY);
    b.line([-120, 230], [-120, 420], BY);
    b.line([120, 230], [120, 420], BY);
    b.arc([0, 420], 120, 0, 180, BY);
    b.circle([0, 90], 22, BY);
  });
}

function basin(b: TemplateBuilder) {
  return b.block('FM Lavabo', () => {
    // bulge > 0 curva hacia la derecha del avance: el frente se abomba hacia +Y
    b.pline([[-300, 0], [300, 0], [300, 300, 0.57], [-300, 300]], true, BY);
    b.pline([[-220, 70], [220, 70], [220, 260, 0.5], [-220, 260]], true, BY);
    b.circle([0, 180], 18, BY);
    b.circle([0, 40], 16, BY);
  });
}

function shower(b: TemplateBuilder) {
  return b.block('FM Plato de ducha 900×1800', () => {
    b.rect(0, 0, 900, 1800, BY);
    b.rect(40, 40, 820, 1720, BY);
    b.line([40, 40], [860, 1760], { ...BY, lineweight: 5 });
    b.line([860, 40], [40, 1760], { ...BY, lineweight: 5 });
    b.circle([450, 900], 45, BY);
  });
}

function sink(b: TemplateBuilder) {
  return b.block('FM Fregadero doble', () => {
    b.rect(0, 0, 900, 500, BY);
    b.pline([[40, 60], [420, 60], [420, 440], [40, 440]], true, BY);
    b.pline([[480, 60], [860, 60], [860, 440], [480, 440]], true, BY);
    b.circle([230, 250], 25, BY);
    b.circle([670, 250], 25, BY);
    b.circle([450, 470], 20, BY);
  });
}

function hob(b: TemplateBuilder) {
  return b.block('FM Placa de cocción', () => {
    b.rect(0, 0, 600, 520, BY);
    b.circle([150, 140], 90, BY);
    b.circle([450, 140], 70, BY);
    b.circle([150, 380], 70, BY);
    b.circle([450, 380], 105, BY);
  });
}

function fridge(b: TemplateBuilder) {
  return b.block('FM Frigorífico', () => {
    b.rect(0, 0, 700, 700, BY);
    b.rect(30, 30, 640, 640, BY);
    b.text('FRIG.', [350, 350], 110, { ...BY, h: 'center', v: 'middle' });
  });
}

/** Norte: círculo de 600 con flecha y letra; apuntando a +Y con rotación 0. */
function north(b: TemplateBuilder) {
  return b.block('FM Flecha de norte', () => {
    b.circle([0, 0], 600, BY);
    b.hatch([[[0, 600], [-230, -420], [0, -250]]], 'SOLID', BY);
    b.pline([[0, 600], [230, -420], [0, -250]], true, BY);
    b.text('N', [0, 760], 280, { ...BY, h: 'center', v: 'bottom' });
  });
}

/** Cota de nivel en planta: triángulo y texto a la derecha. */
function level(b: TemplateBuilder) {
  return b.block('FM Cota de nivel', () => {
    b.hatch([[[0, 0], [-120, 180], [120, 180]]], 'SOLID', BY);
    b.line([0, 180], [900, 180], BY);
  });
}

export function planSymbols(b: TemplateBuilder): PlanSymbols {
  return {
    door: door(b),
    window: window(b),
    wc: wc(b),
    basin: basin(b),
    shower: shower(b),
    sink: sink(b),
    hob: hob(b),
    fridge: fridge(b),
    north: north(b),
    level: level(b),
  };
}
