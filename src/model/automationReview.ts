import type { Transaction } from '../document/document';
import { entityDefaults } from '../document/defaults';
import type { Id, TextEntity } from '../document/types';
/** Keep the last geometry and add a visible, removable warning owned by the batch. */
export function markAutomationReview(tx: Transaction, groupId: Id, label: {
  es: string;
  en: string;
}, height: number): void {
  const g = tx.doc.data.groups.get(groupId), a = g?.automation;
  if (!g || !a)
    return;
  const first = g.members.map(id => tx.doc.entity(id)).find(e => e?.type === 'dimension' || e?.type === 'line' || e?.type === 'hatch');
  const position = first?.type === 'dimension' ? first.p3 : first?.type === 'line' ? first.start : first?.type === 'hatch' ? first.origin : { x: 0, y: 0 };
  let id = a.outputs.$review;
  const existing = id && tx.doc.entity(id);
  if (!id || !tx.doc.entity(id))
    id = tx.addEntity<TextEntity>({ ...entityDefaults(tx.doc, a.owner), type: 'text', text: label[a.language], position, height, style: tx.doc.settings.currentTextStyle, rotation: 0, widthFactor: 1, oblique: 0, halign: 'left', valign: 'baseline' }).id;
  const automation = { ...a, status: 'review' as const, outputs: { ...a.outputs, $review: id }, snapshots: existing ? a.snapshots : { ...a.snapshots, [id]: JSON.stringify(tx.doc.entity(id)) } };
  if (JSON.stringify(automation) !== JSON.stringify(a))
    tx.update('groups', groupId, { automation, members: [...new Set([...g.members, id])] });
}
