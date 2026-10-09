import { newId } from '../document/ids';
import type { WallNetworkAutomation } from '../document/types';
import { disableWallNetwork, networkCandidates, synchronizeWallNetwork } from '../model/wallNetwork';
import { physicalSize } from './architectureHelpers';
import { K, L, fail } from './helpers';
import type { CommandDef } from './types';
import { checked } from './openingLifecycle';
import { eraseNativeWall, relocateWall } from '../model/wallAssembly';
import { liveWallOutputs } from '../model/liveWallSource';
import { translation } from '../geometry/matrix';
import { sub } from '../geometry/vec';
import { kindOf } from '../model/registry';
export const WALLAUTO: CommandDef = {
  name: 'WALLAUTO', aliases: ['MUROSAUTO'], category: 'draw', icon: 'wall', label: L('Muros automáticos', 'Automatic walls'), description: L('Encuentros y rellenos vinculados a los muros y columnas nativos del espacio actual.', 'Junctions and fills linked to native walls and columns in the current space.'),
  help: L('Incluye vecinos nuevos. Las caras LINE permiten añadir huecos o cambiar espesor; los símbolos conservan edición nativa. Sólido, Rayado o Sin relleno; Desactivar recupera fuentes y conserva salidas editadas. Intro confirma la preview, Esc cancela. Restaura la limpieza antigua antes de activar. Máximo 100 fragmentos/columnas y 5000 puntos.', 'Includes new neighbors. LINE faces support opening insertion and thickness edits; symbols retain native editing. Solid, Hatched or No fill; Off reveals sources and keeps edited outputs. Enter confirms preview, Esc cancels. Restore old cleanup first. At most 100 fragments/columns and 5000 points.'),
  async run(api) {
    const doc = api.editor.doc, owner = api.editor.inputOwner, version = doc.version, existing = [...doc.data.groups.values()].find(g => g.automation?.kind === 'wall-network' && g.automation.owner === owner);
    const option = await api.getKeyword({ prompt: L('Relleno: Sólido/Rayado/Sin relleno/Desactivar', 'Fill: Solid/Hatched/None/Off'), keywords: [K('Solid', 'Sólido', 'Solid', ['solido', 'sólido']), K('Hatched', 'Rayado', 'Hatched'), K('None', 'Sin relleno', 'None', ['sin']), K('Off', 'Desactivar', 'Off')], defaultValue: existing?.automation?.kind === 'wall-network' ? (existing.automation.fill === 'user' ? 'Hatched' : existing.automation.fill === 'none' ? 'None' : 'Solid') : 'Solid' });
    if (option.kind !== 'keyword')
      return;
    const config: WallNetworkAutomation = existing?.automation?.kind === 'wall-network' ? structuredClone(existing.automation) : { version: 1, kind: 'wall-network', owner, language: api.lang, fill: 'solid', spacing: physicalSize(api, 100), angle: Math.PI / 4, outputs: {}, snapshots: {}, hidden: {}, sourceForOutput: {} };
    const off = option.key === 'Off';
    config.fill = option.key === 'Hatched' ? 'user' : option.key === 'None' ? 'none' : 'solid';
    config.language = api.lang;
    if (!off && config.fill === 'user') {
      const spacing = await api.getDistance({ prompt: L('Espaciado del rayado', 'Hatch spacing'), defaultValue: config.spacing });
      if (spacing.kind !== 'value')
        return;
      config.spacing = spacing.value;
      const angle = await api.getAngle({ prompt: L('Ángulo del rayado', 'Hatch angle'), defaultValue: config.angle });
      if (angle.kind !== 'value')
        return;
      config.angle = angle.value;
      if (!Number.isFinite(config.spacing) || config.spacing <= 0 || !Number.isFinite(config.angle))
        fail('Espaciado/ángulo inválidos.', 'Invalid spacing/angle.');
    }
    const candidates = off ? null : networkCandidates(doc, config);
    const memberIds = candidates?.members ?? (existing?.automation?.kind === 'wall-network' ? Object.keys(existing.automation.hidden) : []);
    if (!off && !memberIds.length)
      fail('Crea primero muros nativos en este espacio.', 'Create native walls in this space first.');
    for (const id of memberIds) {
      const e = doc.entity(id), layer = e && doc.data.layers.get(e.layer);
      if (!e || e.owner !== owner || e.locked || !layer || layer.locked || !layer.on || layer.frozen)
        fail('La red debe estar en capas visibles y desbloqueadas.', 'The network must be on visible, unlocked layers.');
    }
    api.setPreview(off ? { hideIds: existing?.members.filter(id => config.snapshots[id] === JSON.stringify(doc.entity(id))), entities: memberIds.map(id => ({ ...doc.entity(id)!, visible: config.hidden[id] })) } : { hideIds: [...Object.keys(candidates!.hidden), ...(existing?.members ?? [])], entities: [...candidates!.outputs.values()].map(c => c.entity) });
    try {
      const confirm = await api.getKeyword({ prompt: off ? L('Intro desactiva · conserva salidas editadas', 'Enter disables · keeps edited outputs') : L('Intro activa actualización automática', 'Enter enables automatic updates'), keywords: [K('Confirm', 'Confirmar', 'Confirm')], defaultValue: 'Confirm' });
      if (confirm.kind !== 'keyword')
        return;
      if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner)
        fail('El dibujo cambió; revisa de nuevo la red.', 'The drawing changed; review the network again.');
      api.apply('WALLAUTO', tx => {
        if (off) {
          if (existing) {
            const preserved = disableWallNetwork(tx, existing.id);
            if (preserved)
              api.warn(L(`${preserved} salidas editadas conservadas.`, `${preserved} edited outputs retained.`));
          }
          return;
        }
        const id = existing?.id ?? newId('network');
        if (existing)
          tx.update('groups', id, { automation: config });
        else
          tx.add('groups', { id, name: `Muros ${id}`, description: 'FModel live wall network v1', selectable: false, members: [], automation: config });
        synchronizeWallNetwork(tx, id);
      });
    }
    finally {
      api.setPreview(null);
    }
  },
};
export const WALLMOVE: CommandDef = {
  name: 'WALLMOVE', aliases: ['MOVERMURO'], category: 'modify', icon: 'wall', label: L('Mover muro nativo', 'Move native wall'), description: L('Traslada el muro completo, conservando huecos, cotas y encuentros asociados.', 'Translate the complete wall, preserving associated openings, dimensions and junctions.'),
  async run(api) {
    const selected = await api.getEntity({ prompt: L('Selecciona muro, cara automática o símbolo', 'Select wall, automatic face or symbol'), types: ['mline', 'line', 'arc'] });
    if (selected.kind !== 'entity')
      return;
    const wall = checked(api, selected.id), doc = api.editor.doc, version = doc.version, owner = api.editor.inputOwner;
    const base = await api.getPoint({ prompt: L('Punto base', 'Base point') });
    if (base.kind !== 'point')
      return;
    const ids = [...(wall.assembly?.members ?? [wall.anchorId]), ...liveWallOutputs(doc, wall.anchorId)];
    const target = await api.getPoint({
      prompt: L('Punto destino · Esc cancela', 'Destination point · Esc cancels'), base: base.p, rubber: 'line', preview: p => ({
        hideIds: ids, entities: ids.flatMap(id => {
          const e = doc.entity(id); if (!e)
            return []; const moved = kindOf(e).transform(e, translation(p.x - base.p.x, p.y - base.p.y), api.editor.ctx); return moved ? [moved] : [];
        })
      })
    });
    if (target.kind !== 'point')
      return;
    if (api.editor.doc !== doc || doc.version !== version || api.editor.inputOwner !== owner)
      fail('El dibujo cambió; selecciona de nuevo el muro.', 'The drawing changed; select the wall again.');
    checked(api, wall.anchorId);
    api.apply('WALLMOVE', tx => relocateWall(tx, wall.anchorId, sub(target.p, base.p)));
  },
};
export const WALLERASE: CommandDef = {
  name: 'WALLERASE', aliases: ['BORRARMURO'], category: 'modify', icon: 'wall', label: L('Borrar muro nativo', 'Erase native wall'), description: L('Borra el muro y sus huecos en un paso; los vecinos se recalculan.', 'Erase the wall and its openings in one step; neighbors recalculate.'),
  async run(api) {
    const selected = await api.getEntity({ prompt: L('Selecciona muro, cara automática o símbolo', 'Select wall, automatic face or symbol'), types: ['mline', 'line', 'arc'] });
    if (selected.kind !== 'entity')
      return;
    const wall = checked(api, selected.id), doc = api.editor.doc, version = doc.version;
    const answer = await api.getKeyword({ prompt: L('Intro borra muro completo y huecos · Esc cancela', 'Enter erases complete wall and openings · Esc cancels'), keywords: [K('Confirm', 'Confirmar', 'Confirm')], defaultValue: 'Confirm' });
    if (answer.kind !== 'keyword')
      return;
    if (api.editor.doc !== doc || doc.version !== version)
      fail('El dibujo cambió; selecciona de nuevo.', 'The drawing changed; select again.');
    checked(api, wall.anchorId);
    api.apply('WALLERASE', tx => eraseNativeWall(tx, wall.anchorId));
  },
};
