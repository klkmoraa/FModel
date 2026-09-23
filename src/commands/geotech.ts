import type { CommandDef } from './types';

export const GEOTECH_COMMANDS: CommandDef[] = [{
  name: 'NEWMARK',
  aliases: ['CARTANEWMARK', 'ESFUERZOSUELO'],
  category: 'utility',
  readOnly: true,
  ui: 'newmark',
  label: { es: 'Carta de Newmark', en: 'Newmark chart' },
  description: { es: 'Calcula y dibuja la carta de influencia de Newmark para una cimentación cargada.', en: 'Calculates and draws a Newmark influence chart for a loaded foundation.' },
  icon: 'circle',
  run() {},
}];

