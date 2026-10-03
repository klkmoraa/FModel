import { expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import { Editor } from '../editor/editor';
import { visibleEntities } from './traverse';

it('replacement preview excludes its originals only from scene traversal, then restores them without a document write', () => {
  const doc = createDocument(), e = doc.transact('seed', tx => tx.addEntity<import('../document/types').LineEntity>({ ...entityDefaults(doc), type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }));
  const editor = new Editor(doc), before = doc.entity(e.id), version = doc.version;
  let scenes = 0; editor.on('scene', () => scenes++);
  const env = () => ({ doc, ctx: editor.ctx, dark: false, background: '#fff', plotting: false, plotStyle: 'color' as const, viewport: null, dashScale: 1, previewExcluded: editor.previewExcluded });
  expect(visibleEntities(env(), e.owner, null, null)).toHaveLength(1);
  editor.setPreview({ hideIds: [e.id], entities: [e] });
  expect(visibleEntities(env(), e.owner, null, null)).toHaveLength(0);
  expect(editor.isSelectable(e.id)).toBe(true);
  expect(doc.entity(e.id)).toBe(before); expect(doc.version).toBe(version); expect(scenes).toBe(1);
  editor.setPreview({ hideIds: [e.id], entities: [e] }); expect(scenes).toBe(1);
  editor.setPreview(null); expect(visibleEntities(env(), e.owner, null, null)).toHaveLength(1); expect(scenes).toBe(2);
});
