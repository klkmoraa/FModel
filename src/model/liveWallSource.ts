import type { CadDocument } from '../document/document';
import type { Id } from '../document/types';
/** Only intact owned outputs resolve to native walls. Edited/copy geometry stays independent. */
export function liveWallSource(doc: CadDocument, id: Id): Id | null {
  const e = doc.entity(id);
  if (!e)
    return null;
  for (const g of doc.data.groups.values()) {
    const a = g.automation;
    if (a?.kind !== 'wall-network' || a.owner !== e.owner)
      continue;
    if (e.type === 'mline' && Object.hasOwn(a.hidden, id))
      return id;
    const source = a.sourceForOutput[id];
    if (source && g.members.includes(id) && Object.values(a.outputs).includes(id) && a.snapshots[id] === JSON.stringify(e) && doc.entity(source)?.type === 'mline' && doc.entity(source)?.owner === e.owner)
      return source;
  }
  return null;
}
export function liveWallOutputs(doc: CadDocument, anchor: Id): Id[] {
  return [...doc.data.groups.values()].flatMap(g => g.automation?.kind === 'wall-network' ? Object.entries(g.automation.sourceForOutput).filter(([, source]) => source === anchor).map(([id]) => id) : []);
}
export function liveWallVisibility(doc: CadDocument, id: Id): boolean | undefined {
  for (const g of doc.data.groups.values()) {
    const a = g.automation;
    if (a?.kind === 'wall-network' && a.owner === doc.entity(id)?.owner && Object.hasOwn(a.hidden, id))
      return a.hidden[id];
  }
  return undefined;
}
