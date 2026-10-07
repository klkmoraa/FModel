import { describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import type { LineEntity, MLineEntity } from '../document/types';
import { CommandHarness } from '../commands/behavior/harness';
import { mlineElements } from '../model/kinds/polylines';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import { fromNativeFile, toNativeFile } from './native';
import { exportDxf } from './dxf/exportDxf';
import { importDxfIntoDocument } from './dxf/importDxf';
const p = (x: number, y = 0) => ({ x, y });
async function plan() {
  const h = new CommandHarness();
  await h.run('WALLRECT', [p(0), p(6000, 4000)]);
  expect((await h.run('WALLDOOR', [p(3000, 75), p(3000), p(3000, 1000), ''])).ok).toBe(true);
  expect((await h.run('WALLWINDOW', [p(5925, 2000), p(6000, 2000), ''])).ok).toBe(true);
  return h;
}
describe('architecture native and DXF round trip', () => {
  it('native walls, styles, straight caps, openings and door/window symbols survive without schema changes', async () => {
    const h = await plan(), reopened = fromNativeFile(toNativeFile(h.doc.data, h.doc.id));
    expect(reopened.warnings).toEqual([]);
    expect(reopened.data.entities).toEqual(h.doc.data.entities);
    expect(reopened.data.mlineStyles).toEqual(h.doc.data.mlineStyles);
    expect([...reopened.data.entities.values()].filter(e => e.type === 'mline')).toHaveLength(2);
    expect([...reopened.data.entities.values()].filter(e => e.type === 'arc')).toHaveLength(1);
    for (const e of reopened.data.entities.values()) if (e.type === 'mline') {
      expect(e.closed).toBe(false); expect(reopened.data.mlineStyles.get(e.style)?.startCap).toBe('line');
    }
  });
  it('DXF decomposition preserves every wall end cap and standard opening symbol', async () => {
    const h = await plan();
    const expectedCaps = [...h.doc.data.entities.values()].filter((e): e is MLineEntity => e.type === 'mline').flatMap(w => {
      const faces = mlineElements(w, [0.5, -0.5]);
      return [0, faces[0].length - 1].map(i => [faces[0][i], faces[1][i]]);
    });
    expect(expectedCaps).toHaveLength(4);
    const expanded = [...h.doc.data.entities.values()].flatMap(e => e.type === 'mline' ? kindOf(e).explode!(e, h.editor.ctx) : [e]);
    const exported = exportDxf(h.doc, h.editor.ctx), imported = createDocument();
    const report = importDxfIntoDocument(imported, exported.text, { replace: true });
    expect(report.ignored).toEqual({});
    const entities = [...imported.data.entities.values()], lines = entities.filter((e): e is LineEntity => e.type === 'line');
    expect(lines.length).toBe(expanded.filter(e => e?.type === 'line').length);
    expect(lines.length).toBe(23);
    expect(entities.filter(e => e.type === 'arc')).toHaveLength(1);
    for (const [a, b] of expectedCaps) expect(lines.some(l => [l.start, l.end].every((p, i) => Math.hypot(p.x - [a, b][i].x, p.y - [a, b][i].y) < 0.000001))).toBe(true);
    const second = exportDxf(imported, createContext(imported)), again = createDocument();
    importDxfIntoDocument(again, second.text, { replace: true });
    expect(again.data.entities.size).toBe(imported.data.entities.size);
  });
});
