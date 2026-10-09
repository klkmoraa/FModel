import { CadDocument } from '../document/document';
import type { TableEntity, TextEntity } from '../document/types';
import { collectOpeningAnnotations, synchronizeOpeningAnnotations } from '../model/openingAnnotations';
import { physicalSize } from './architectureHelpers';
import { fail, K, L } from './helpers';
import type { CommandDef } from './types';

export const OPENINGTAGS: CommandDef = {
  name: 'OPENINGTAGS', aliases: ['ETIQUETASHUECOS'], category: 'annotate', icon: 'text',
  label: L('Etiquetas de huecos', 'Opening tags'),
  description: L('Vincula etiquetas P/V/H al cuadro y a sus huecos, con actualización automática.', 'Link P/V/H tags to a schedule and its openings, with automatic updates.'),
  help: L('Selecciona un cuadro editable de cuatro columnas. Su contenido se regenera con los huecos del espacio actual. Altura en unidades del dibujo, 100 mm físicos por defecto. Intro confirma la vista previa; Esc cancela. Repetir actualiza sin duplicar. Puedes desplazar etiquetas; conservan el ajuste al mover el hueco. Guarda en .fmodel para mantener el vínculo.', 'Select an editable four-column schedule. Its contents are regenerated from current-space openings. Height in drawing units, 100 physical mm by default. Enter confirms preview; Esc cancels. Repeat updates without duplicates. You can move tags; their adjustment survives moving the opening. Save in .fmodel to keep links.'),
  async run(api) {
    const doc = api.editor.doc, owner = api.editor.inputOwner;
    const selected = await api.getEntity({ prompt: L('Selecciona el cuadro: su contenido se regenerará con los huecos actuales', 'Select schedule: its contents will be regenerated from current openings'), types: ['table'] });
    if (selected.kind !== 'entity') return;
    const table = doc.entity(selected.id);
    if (table?.type !== 'table' || table.owner !== owner || !api.editor.isSelectable(table.id) || table.columnWidths.length !== 4) fail('Selecciona una tabla editable de cuatro columnas en el espacio actual.', 'Select an editable four-column table in the current space.');
    const version = doc.version, snapshot = collectOpeningAnnotations(doc, owner);
    if (!snapshot.openings.length) fail('No hay huecos asociados para etiquetar.', 'No associated openings to tag.');
    const height = await api.getDistance({ prompt: L(`Altura de etiquetas (${doc.settings.units})`, `Tag height (${doc.settings.units})`), defaultValue: table.openingSchedule?.tags?.height ?? physicalSize(api, 100) });
    if (height.kind !== 'value') return;
    if (!Number.isFinite(height.value) || height.value <= 0) fail('La altura debe ser positiva y finita.', 'Height must be positive and finite.');
    if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner) { api.warn(L('El dibujo cambió. Ejecuta ETIQUETASHUECOS de nuevo.', 'The drawing changed. Run OPENINGTAGS again.')); return; }
    const openingSchedule = { version: 1 as const, language: table.openingSchedule?.language ?? api.lang, tags: { height: height.value, style: doc.settings.currentTextStyle, layer: doc.settings.currentLayer } };
    const previewDoc = new CadDocument({ ...doc.data, entities: new Map(doc.data.entities) });
    const configure = (tx: import('../document/document').Transaction) => {
      tx.updateEntity<TableEntity>(table.id, { openingSchedule });
      for (const e of tx.doc.data.entities.values()) if (e.type === 'text' && e.openingTag?.scheduleId === table.id) tx.updateEntity<TextEntity>(e.id, { height: height.value });
      synchronizeOpeningAnnotations(tx, table.id, snapshot);
    };
    previewDoc.transact('preview tags', configure);
    const entities = [...previewDoc.data.entities.values()].filter(e => e.id === table.id || (e.type === 'text' && e.openingTag?.scheduleId === table.id));
    const hideIds = [...doc.data.entities.values()].filter(e => e.id === table.id || (e.type === 'text' && e.openingTag?.scheduleId === table.id)).map(e => e.id);
    api.setPreview({ entities, hideIds });
    try {
      const confirm = await api.getKeyword({ prompt: L('Etiquetas y cuadro vinculados · Intro confirma · Esc cancela', 'Linked tags and schedule · Enter confirms · Esc cancels'), defaultValue: 'Confirm', keywords: [K('Confirm', 'Confirmar', 'Confirm', ['c'])] });
      if (confirm.kind !== 'keyword') return;
      if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner) { api.warn(L('El dibujo cambió. Ejecuta ETIQUETASHUECOS de nuevo.', 'The drawing changed. Run OPENINGTAGS again.')); return; }
      api.apply('OPENINGTAGS', configure);
      api.info(L(`${snapshot.openings.length} etiquetas vinculadas al cuadro.`, `${snapshot.openings.length} tags linked to the schedule.`));
    } finally { api.setPreview(null); }
  },
};
