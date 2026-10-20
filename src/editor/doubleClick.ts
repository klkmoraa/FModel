import { requestUi } from '../app/services';
import type { Entity, Id } from '../document/types';
import type { Vec2 } from '../geometry/vec';
import { roomBoundary } from '../model/architecturalDimensions';
import { readComponentAssembly } from '../model/componentAssembly';
import { entityEditable, entityVisible } from '../model/visibility';
import { liveWallOutputs, liveWallSource } from '../model/liveWallSource';
import { readWallOpening, readWallSource } from '../model/wallAssembly';
import type { Editor } from './editor';

function editableMember(editor: Editor, id: Id): boolean {
  const entity = editor.doc.entity(id);
  if (!entity || entity.owner !== editor.inputOwner) return false;
  if (editor.isSelectable(id)) return true;
  // Relax only the structural visibility bit of an owned native source. All user,
  // layer and active-viewport visibility/locking policies still apply.
  return entity.type === 'mline' && liveWallSource(editor.doc, id) === id && entityEditable(editor.doc, entity) &&
    entityVisible(editor.doc, { ...entity, visible: true }, editor.visibility());
}

function checkedWall(editor: Editor, id: Id) {
  const wall = readWallSource(editor.doc, id);
  if (wall.source.owner !== editor.inputOwner || (wall.assembly?.members ?? [wall.anchorId]).some(member => !editableMember(editor, member))) throw new Error('Unavailable native wall');
  return wall;
}

/** Native double-click uses only the lifecycle editors shipped with this revision. */
export function editDoubleClickedEntity(editor: Editor, entity: Entity, point: Vec2): boolean {
  if (entity.owner !== editor.inputOwner || !editor.isSelectable(entity.id)) return false;
  if (entity.type === 'insert' && editor.doc.data.blocks.get(entity.blockId)?.kind !== 'normal') return false;
  let target = entity, command: string | null = null;
  if (entity.meta?.fmodelComponentMember || entity.meta?.fmodelComponent) {
    try { const assembly = readComponentAssembly(editor.doc, entity.id); if (assembly.members.every(id => editor.doc.entity(id)?.owner === editor.inputOwner && editor.isSelectable(id))) command = 'COMPONENTEDIT'; } catch { return false; }
    if (!command) return false;
  } else if (entity.type === 'text' && entity.roomLabel || entity.room) {
    if (entity.type === 'text' && entity.roomLabel) {
      const link = entity.roomLabel;
      if (link.version !== 1 || typeof link.sourceId !== 'string') return false;
      const source = editor.doc.entity(link.sourceId);
      if (!source?.room || source.owner !== entity.owner) return false;
      target = source;
    }
    if (!editableMember(editor, target.id)) return false;
    try {
      const wall = target.type !== 'lwpolyline' ? checkedWall(editor, target.id) : null;
      roomBoundary(editor.doc, target.id);
      // ROOMDATA accepts a visible member and resolves its exact native source itself.
      if (!editor.isSelectable(target.id)) {
        const candidates = [...(wall?.assembly?.members ?? []), ...(wall ? liveWallOutputs(editor.doc, wall.anchorId) : [])];
        const member = candidates.find(id => editor.isSelectable(id) && (wall?.assembly?.members.includes(id) || liveWallSource(editor.doc, id) === wall?.anchorId));
        const visible = member ? editor.doc.entity(member) : null;
        if (!visible) return false;
        target = visible;
      }
    } catch { return false; }
    command = 'ROOMDATA';
  } else if (entity.meta?.fmodelWallMember || entity.meta?.fmodelWallAssembly || entity.type === 'mline' || (entity.type === 'text' && entity.openingTag)) {
    try {
      if (entity.type === 'text' && entity.openingTag) {
        const tag = entity.openingTag;
        const member = [...editor.doc.data.entities.values()].find(candidate => {
          if ((candidate.meta?.fmodelWallMember as { openingId?: string } | undefined)?.openingId !== tag.openingId) return false;
          try { return readWallSource(editor.doc, candidate.id).anchorId === tag.anchorId; } catch { return false; }
        });
        if (!member || !editor.isSelectable(member.id)) return false;
        target = member;
      }
      checkedWall(editor, target.id);
      const openingId = (target.meta?.fmodelWallMember as { openingId?: string } | undefined)?.openingId;
      if (openingId !== undefined) { readWallOpening(editor.doc, target.id); command = 'OPENINGEDIT'; }
      else command = 'WALLTHICKNESS';
    } catch { return false; }
  } else if (['text', 'mtext', 'attdef', 'mleader', 'table', 'dimension'].includes(entity.type)) command = 'TEXTEDIT';
  else if (entity.type === 'lwpolyline') command = 'PEDIT';
  else if (entity.type === 'insert') command = 'BEDIT';
  editor.selection.set([target.id]);
  if (!command) { requestUi('panel:properties'); return true; }
  void editor.command(command);
  if (editor.runner.pending?.req.kind === 'entity') editor.runner.submitEntity(target.id, point);
  return true;
}
