import { expect, it, vi } from 'vitest';
import { CommandHarness } from './harness';
import type { DimensionEntity } from '../../document/types';
import { createWallAssembly, readWallAssembly, readWallSource, updateWallAssembly } from '../../model/wallAssembly';
async function wallFixture(units: 'mm' | 'm' = 'mm') {
  const h = new CommandHarness();
  h.doc.transact('units', tx => tx.setSettings({ units }));
  const f = units === 'm' ? 0.001 : 1;
  await h.run('WALL', [{ x: 0, y: 0 }, { x: 6000 * f, y: 0 }, '']);
  const wall = [...h.doc.data.entities.values()][0];
  h.doc.transact('opening', tx => createWallAssembly(tx, wall.id, readWallSource(h.doc, wall.id).source, [{ id: 'door', segment: 0, offset: 2000 * f, width: 900 * f, type: 'single', side: 1, hingeEnd: false }]));
  return { h, wall, f };
}
it.each(['mm', 'm'] as const)('creates native dimensions in %s, follows openings and undoes atomically', async (units) => {
  const { h, wall, f } = await wallFixture(units);
  h.select(wall.id);
  expect((await h.run('WALLDIM', ['', '', ''])).ok).toBe(true);
  const dimensions = () => [...h.doc.data.entities.values()].filter((e): e is DimensionEntity => e.type === 'dimension');
  expect(dimensions()).toHaveLength(4);
  const ids = dimensions().map(e => e.id), before = new Map(h.doc.data.entities);
  h.doc.transact('change opening', tx => { const a = readWallAssembly(h.doc, wall.id); a.openings[0].width = 1200 * f; updateWallAssembly(tx, wall.id, a.source, a.openings); });
  expect(dimensions().map(e => e.id)).toEqual(ids);
  expect(dimensions().some(e => Math.abs(Math.abs(e.p2.x - e.p1.x) - 1200 * f) < 0.000001)).toBe(true);
  h.undo();
  expect(h.doc.data.entities).toEqual(before);
});
it('cancels dimension preview without mutating source, entities or groups', async () => {
  const { h, wall } = await wallFixture();
  h.select(wall.id);
  const before = new Map(h.doc.data.entities), groups = new Map(h.doc.data.groups), run = h.runner.execute('WALLDIM');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('distance'));
  h.runner.submitText('');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('distance'));
  h.runner.submitText('');
  await vi.waitFor(() => expect(h.runner.pending?.req.kind).toBe('keyword'));
  h.runner.cancel();
  await run;
  expect(h.doc.data.entities).toEqual(before);
  expect(h.doc.data.groups).toEqual(groups);
  expect(h.editor.preview).toBeNull();
});
it('preserves manual dimension offsets and last geometry when a native source needs review',async()=>{
  const {h,wall}=await wallFixture();h.select(wall.id);await h.run('WALLDIM',['','','']);
  const e=[...h.doc.data.entities.values()].find((e):e is DimensionEntity=>e.type==='dimension')!;
  h.doc.transact('manual offset',tx=>tx.updateEntity(e.id,{p3:{x:e.p3.x,y:e.p3.y-200}}));
  h.doc.transact('opening width',tx=>{const a=readWallAssembly(h.doc,wall.id);a.openings[0].width=1100;updateWallAssembly(tx,wall.id,a.source,a.openings);});
  expect((h.doc.entity(e.id) as DimensionEntity).p3.y).toBe(e.p3.y-200);
  const before=[...h.doc.data.entities.values()].filter(e=>e.type==='dimension');
  h.doc.transact('broken source',tx=>tx.updateEntity(wall.id,{scale:-1} as never));
  expect([...h.doc.data.entities.values()].filter(e=>e.type==='dimension')).toEqual(before);expect([...h.doc.data.groups.values()].find(g=>g.automation?.kind==='wall-dimensions')?.automation?.status).toBe('review');
  h.undo();expect([...h.doc.data.groups.values()].find(g=>g.automation?.kind==='wall-dimensions')?.automation?.status).toBeUndefined();
});
