import type { Entity, Id, MLineEntity } from '../document/types';
import { cleanWallFaces, WallCleanupError, type CleanupColumn, type CleanupWall } from '../geometry/wallCleanup';
import { ComponentError } from '../geometry/architecture/schema';
import { readComponentAssembly } from '../model/componentAssembly';
import { readWallSource, requireUncleanedWall, WallAssemblyError } from '../model/wallAssembly';
import { createWallCleanup, prepareWallRestoration, restoreWallCleanup, wallCleanupRecords, WallCleanupRecordError, type WallCleanupRecord } from '../model/wallCleanup';
import { wallProperties } from './architectureHelpers';
import { K, L, fail } from './helpers';
import type { CommandApi, CommandDef } from './types';

const unavailable = L('Todos los miembros deben estar en el espacio activo y en capas visibles y desbloqueadas.', 'All members must be in the active space and on visible, unlocked layers.');
const changed = L('Cambió el origen, sus grupos, propiedades, capas o unidades; vuelve a seleccionar.', 'The source, groups, properties, layers or units changed; select again.');
const limit = L('Reduce el lote: máximo 100 orígenes/fragmentos, 5000 puntos, 10000 salidas y 2000000 operaciones.', 'Reduce the batch: at most 100 sources/fragments, 5000 points, 10000 outputs and 2000000 operations.');
const help = L('Instantánea editable de caras LINE; conserva IDs, grupos, parámetros, huecos y columnas. Sólo oculta MLINE. Intro confirma, Esc descarta. Restaurar → editar → limpiar de nuevo; no actualiza vecinos ni rellenos automáticamente. Máximo 100 orígenes/fragmentos, 5000 puntos, 10000 segmentos y 2000000 operaciones.', 'Editable LINE face snapshot; retains IDs, groups, parameters, openings and columns. Hides only MLINE. Enter confirms, Esc cancels. Restore → edit → clean again; neighbors and fills do not update automatically. Maximum 100 sources/fragments, 5000 points, 10000 segments and 2000000 operations.');
function domain<T>(fn: () => T): T {
  try { return fn(); }
  catch (error) {
    if (error instanceof WallCleanupError || error instanceof WallAssemblyError || error instanceof WallCleanupRecordError) fail(error.messageI18n.es, error.messageI18n.en);
    if (error instanceof ComponentError) fail(error.l10n.es, error.l10n.en);
    throw error;
  }
}
function available(api: CommandApi, ids: readonly Id[], hidden = false) {
  for (const id of ids) {
    const entity = api.editor.doc.entity(id); if (!entity) continue;
    const layer = api.editor.doc.data.layers.get(entity.layer);
    if (entity.owner !== api.editor.inputOwner || entity.locked || !layer || layer.locked || !layer.on || layer.frozen || (!hidden && !api.editor.isSelectable(id))) fail(unavailable.es, unavailable.en);
  }
}
function signature(api: CommandApi, ids: readonly Id[]) {
  const doc = api.editor.doc;
  return JSON.stringify({ entities: ids.map(id => doc.entity(id)), layers: ids.map(id => doc.data.layers.get(doc.entity(id)?.layer ?? '')), groups: [...doc.data.groups.values()].filter(group => group.members.some(id => ids.includes(id))), styles: [...new Set(ids.map(id => doc.entity(id)).filter((e): e is MLineEntity => e?.type === 'mline').map(e => e.style))].map(id => doc.data.mlineStyles.get(id)), units: doc.settings.units, owner: api.editor.inputOwner });
}
function readBatch(api: CommandApi, ids: Id[]) {
  const doc = api.editor.doc, seen = new Set<Id>(), walls: MLineEntity[][] = [], paths: CleanupWall[] = [], columns: CleanupColumn[] = [], members: Id[] = [];
  // Cheap bounds precede native assembly builders and material topology work.
  const origins = new Map<Id, number>();
  for (const id of ids) {
    const entity = doc.entity(id); if (!entity) fail(unavailable.es, unavailable.en);
    domain(() => requireUncleanedWall(doc, id));
    const tag = entity.meta?.fmodelWallMember as { anchorId?: Id } | undefined, component = entity.meta?.fmodelComponentMember as { principal?: Id } | undefined;
    const anchorId = tag?.anchorId ?? component?.principal ?? id, anchor = doc.entity(anchorId);
    const raw = anchor?.meta?.fmodelWallAssembly as { source?: { vertices?: unknown[] } } | undefined;
    origins.set(anchorId, raw?.source?.vertices?.length ?? (anchor && 'vertices' in anchor ? anchor.vertices.length : 2));
    if (origins.size > 100 || [...origins.values()].reduce((n, count) => n + count, 0) > 5000) fail(limit.es, limit.en);
  }
  for (const id of ids) {
    if (seen.has(id)) continue;
    const entity = doc.entity(id)!;
    if (entity.meta?.fmodelComponent !== undefined || entity.meta?.fmodelComponentMember !== undefined) {
      const assembly = domain(() => readComponentAssembly(doc, id));
      if (assembly.kind !== 'column') fail('Selecciona sólo muros compatibles y columnas nativas.', 'Select only compatible walls and native columns.');
      available(api, assembly.members); assembly.members.forEach(id => seen.add(id)); members.push(...assembly.members);
      const outline = doc.entity(assembly.roles.get('outline')!)!;
      if (outline.type === 'circle') columns.push({ kind: 'circle', center: { ...outline.center }, radius: outline.radius });
      else if (outline.type === 'lwpolyline' && outline.closed) columns.push({ kind: 'polygon', vertices: outline.vertices.map(p => ({ x: p.x, y: p.y })) });
      else fail(unavailable.es, unavailable.en);
    } else {
      const wall = domain(() => readWallSource(doc, id)), ids = wall.assembly?.members ?? [wall.anchorId];
      available(api, ids); ids.forEach(id => seen.add(id)); members.push(...ids);
      const fragments = ids.map(id => doc.entity(id)!).filter((e): e is MLineEntity => e.type === 'mline');
      walls.push(fragments);
      for (const fragment of fragments) {
        const style = doc.data.mlineStyles.get(fragment.style)!;
        paths.push({ key: fragment.id, path: fragment, startCap: style.startCap === 'line', endCap: style.endCap === 'line' });
      }
    }
    if (paths.length + columns.length > 100 || paths.reduce((n, wall) => n + wall.path.vertices.length, 0) + columns.reduce((n, column) => n + (column.kind === 'circle' ? 1 : column.vertices.length), 0) > 5000) fail(limit.es, limit.en);
  }
  return { walls, paths, columns, members };
}
function restoreIds(records: WallCleanupRecord[]) { return records.flatMap(r => [...r.sources, ...r.outputs].map(s => s.id)); }

export const WALL_CLEANUP_COMMANDS: CommandDef[] = [
  {
    name: 'WALLCLEAN', aliases: ['LIMPIARMUROS'], category: 'draw', icon: 'wall', label: L('Limpiar muros', 'Clean walls'),
    description: L('Limpia encuentros T/X y recorta caras contra columnas nativas.', 'Clean T/X junctions and trim faces against native columns.'), help,
    async run(api) {
      for (const id of api.editor.selection.list) domain(() => requireUncleanedWall(api.editor.doc, id));
      available(api, api.editor.selection.list);
      const ids = await api.getSelection({ prompt: L('Selecciona muros y columnas nativas opcionales · Intro termina selección', 'Select walls and optional native columns · Enter finishes selection') });
      if (!ids.length) return;
      const batch = readBatch(api, ids), original = signature(api, batch.members), segments = domain(() => cleanWallFaces(batch.paths, batch.columns));
      const entities: Entity[] = segments.map((s, i) => {
        const props = wallProperties(api.editor.doc.entity(s.sourceKey)!);
        return { ...props, meta: undefined, id: `preview-clean-${i}`, order: Number.MAX_SAFE_INTEGER, type: 'line', start: s.start, end: s.end };
      });
      api.setPreview({ hideIds: batch.walls.flatMap(wall => wall.map(e => e.id)), entities });
      const response = await api.getKeyword({ prompt: L('Intro limpia · Esc descarta · restaurar antes de editar', 'Enter cleans · Esc cancels · restore before editing'), allowNone: true });
      if (response.kind !== 'none') return;
      available(api, batch.members);
      if (signature(api, batch.members) !== original) fail(changed.es, changed.en);
      const outputIds = domain(() => api.apply('WALLCLEAN', tx => createWallCleanup(tx, batch.walls, segments)));
      api.editor.selection.set(outputIds);
    },
  },
  {
    name: 'WALLRESTORE', aliases: ['RESTAURARMUROS'], category: 'modify', icon: 'wall', label: L('Restaurar muros', 'Restore walls'),
    description: L('Recupera los muros nativos, incluso si borraste las salidas.', 'Recover native walls, even after erasing outputs.'), help,
    async run(api) {
      const selected = api.editor.selection.list;
      let ids: readonly Id[] | undefined;
      if (selected.length) ids = selected;
      else {
        const response = await api.getKeyword({ prompt: L('Todos recupera sin salidas · Seleccionar permite elegir salidas', 'All recovers without outputs · Select picks outputs'), allowNone: true, keywords: [K('All', 'Todos', 'All', ['todos']), K('Select', 'Seleccionar', 'Select', ['seleccionar'])] });
        if (response.kind === 'none') return;
        if (response.key === 'Select') { ids = await api.getSelection({ prompt: L('Selecciona salidas limpias · Intro termina selección', 'Select clean outputs · Enter finishes selection') }); if (!ids.length) return; }
      }
      const records = domain(() => wallCleanupRecords(api.editor.doc, ids));
      if (!records.length) { api.info(L('No hay muros pendientes de restaurar.', 'No walls need restoring.')); return; }
      const memberIds = restoreIds(records);
      const original = signature(api, memberIds), result = domain(() => prepareWallRestoration(api.editor.doc, records));
      const mutableIds = [...result.reveal.map(e => e.id), ...result.remove]; available(api, mutableIds, true);
      api.setPreview({ hideIds: result.remove, entities: result.reveal.filter(e => e.visible) });
      const response = await api.getKeyword({ prompt: L('Intro restaura originales · Esc descarta · salidas editadas se conservan', 'Enter restores originals · Esc cancels · edited outputs are retained'), allowNone: true });
      if (response.kind !== 'none') return;
      available(api, mutableIds, true);
      if (signature(api, memberIds) !== original) fail(changed.es, changed.en);
      const restored = domain(() => api.apply('WALLRESTORE', tx => restoreWallCleanup(tx, records, entity => {
        const layer = api.editor.doc.data.layers.get(entity.layer);
        return entity.owner === api.editor.inputOwner && !entity.locked && !!layer && !layer.locked && layer.on && !layer.frozen;
      })));
      api.editor.selection.set(restored.reveal.filter(e => e.visible).map(e => e.id));
      if (restored.preserved.length) api.warn(L('Se conservaron salidas editadas o de propiedad ambigua; revísalas antes de limpiar de nuevo.', 'Edited or ambiguously owned outputs were retained; review them before cleaning again.'));
      if (restored.editedSources.length) api.warn(L('Se revelaron las fuentes con su geometría actual. Un grupo paramétrico movido o editado puede necesitar su reparación nativa o deshacer la edición antes de editar parámetros.', 'Sources were revealed with their current geometry. A moved or edited parametric group may need native repair or undoing the edit before editing parameters.'));
    },
  },
];
