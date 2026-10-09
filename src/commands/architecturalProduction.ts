import { newId } from '../document/ids';
import type { WallDimensionsAutomation } from '../document/types';
import { dimensionCandidates, synchronizeWallDimensions } from '../model/architecturalDimensions';
import { readWallSource } from '../model/wallAssembly';
import { physicalSize } from './architectureHelpers';
import { K, L, fail } from './helpers';
import type { CommandDef } from './types';
import { ROOMDATA, ROOMSCHEDULE, MATERIALSCHEDULE } from './rooms';
import { WALLAUTO, WALLMOVE, WALLERASE } from './wallNetwork';
import { SHEETSET } from './sheetSet';
export const WALLDIM: CommandDef = {
  name: 'WALLDIM', aliases: ['COTASPLANO'], category: 'annotate', icon: 'dimaligned', label: L('Cotas del plano', 'Plan dimensions'),
  description: L('Cadenas de muro/huecos y cotas totales con actualización automática.', 'Automatic wall/opening chains and overall dimensions.'),
  help: L('Selecciona muros rectos nativos o contornos rectos cerrados. Pide separación y altura; Intro confirma la preview, Esc descarta. El contorno interior de un muro cerrado da las medidas libres. Muros abiertos: recorrido del eje. Conserva el ajuste manual de la línea de cota al editar huecos; copiar genera cotas independientes.', 'Select straight native walls or straight closed boundaries. Set gap and height; Enter confirms preview, Esc cancels. Closed walls measure their inner contour; open walls measure the axis path. Manual dimension-line offsets survive opening edits; copies are independent.'),
  async run(api) {
    const doc = api.editor.doc, owner = api.editor.inputOwner;
    const ids = await api.getSelection({ prompt: L('Selecciona muros o habitaciones · Intro termina', 'Select walls or rooms · Enter finishes') });
    if (!ids.length)
      return;
    const sources = [...new Set(ids.map(id => doc.entity(id)?.type === 'lwpolyline' ? id : readWallSource(doc, id).anchorId))];
    if (sources.length > 100 || sources.some(id => doc.entity(id)?.owner !== owner))
      fail('Máximo 100 orígenes del espacio actual.', 'At most 100 sources in the current space.');
    const version = doc.version;
    const offset = await api.getDistance({ prompt: L('Separación de cotas', 'Dimension gap'), defaultValue: physicalSize(api, 500) });
    if (offset.kind !== 'value')
      return;
    const height = await api.getDistance({ prompt: L('Altura de texto de cota', 'Dimension text height'), defaultValue: physicalSize(api, 100) });
    if (height.kind !== 'value')
      return;
    if (![offset.value, height.value].every(v => Number.isFinite(v) && v > 0))
      fail('Medidas positivas finitas requeridas.', 'Positive finite dimensions required.');
    const config: WallDimensionsAutomation = { version: 1, kind: 'wall-dimensions', owner, language: api.lang, sources, offset: offset.value, height: height.value, style: doc.settings.currentDimStyle, layer: doc.settings.currentLayer, outputs: {}, snapshots: {}, bases: {} };
    const preview = dimensionCandidates(doc, config);
    api.setPreview({ entities: [...preview.values()] });
    try {
      const answer = await api.getKeyword({ prompt: L('Intro crea cotas asociativas · Esc cancela', 'Enter creates associative dimensions · Esc cancels'), keywords: [K('Confirm', 'Confirmar', 'Confirm')], defaultValue: 'Confirm' });
      if (answer.kind !== 'keyword')
        return;
      if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner)
        fail('El dibujo cambió; vuelve a seleccionar.', 'The drawing changed; select again.');
      api.apply('WALLDIM', tx => { const id = newId('dims'); tx.add('groups', { id, name: `Cotas ${id}`, description: 'FModel automatic dimensions v1', selectable: false, members: [], automation: config }); synchronizeWallDimensions(tx, id); });
    }
    finally {
      api.setPreview(null);
    }
  },
};
export const ARCHITECTURAL_PRODUCTION_COMMANDS: CommandDef[] = [WALLDIM, ROOMDATA, ROOMSCHEDULE, MATERIALSCHEDULE, WALLAUTO, WALLMOVE, WALLERASE, SHEETSET].map(command => ({
  ...command, async run(api, args) {
    try {
      await command.run(api, args);
    }
    catch (error) {
      if (error && typeof error === 'object' && 'messageI18n' in error) {
        const m = error.messageI18n as {
          es: string;
          en: string;
        };
        fail(m.es, m.en);
      }
      if (error && typeof error === 'object' && 'l10n' in error) {
        const m = error.l10n as {
          es: string;
          en: string;
        };
        fail(m.es, m.en);
      }
      throw error;
    }
  }
}));
