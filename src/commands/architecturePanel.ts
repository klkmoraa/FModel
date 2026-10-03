import { L } from './helpers';
import type { CommandDef } from './types';
export const ARCHITECTURE_PANEL: CommandDef = {
  name: 'ARCHITECTURE', aliases: ['ARQUITECTURA'], category: 'view', icon: 'room', readOnly: true, ui: 'panel:architecture',
  label: L('Arquitectura', 'Architecture'),
  description: L('Abre el catálogo de piezas de construcción con medidas y vista previa.', 'Open construction components with dimensions and preview.'),
  help: L('Busca una pieza, revisa medidas y pulsa Colocar. Editar pieza usa COMPONENTEDIT. Los campos inactivos se guardan para otra variante.', 'Find a component, review dimensions and choose Place. Edit component uses COMPONENTEDIT. Inactive fields are retained for another variant.'),
  run() {},
};
