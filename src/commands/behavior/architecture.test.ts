import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, entityDefaults, MLINESTYLE_STANDARD_ID } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import type { ArcEntity, LineEntity, LwPolylineEntity, MLineEntity } from '../../document/types';
import { findCommand, allCommands } from '../registry';
import { ARCHITECTURE_COMMANDS } from '../architecture';
import { openingSymbols } from '../architectureOpenings';
import { wallOpening } from '../../geometry/walls';
import { mlineElements } from '../../model/kinds/polylines';
import { toolsForRibbonTab } from '../../ui/PrecisionDeck';
import { hasCadIcon } from '../../ui/icons';
import { CommandHarness } from './harness';
const p = (x: number, y = 0) => ({ x, y });
const walls = (h: CommandHarness) => [...h.doc.data.entities.values()].filter((e): e is MLineEntity => e.type === 'mline');
const addLine = (h: CommandHarness) => h.doc.transact('seed', tx => tx.addEntity<LineEntity>({ ...entityDefaults(h.doc), type: 'line', start: p(0), end: p(5000), color: '#7657D5', lineweight: 25, linetypeScale: 2, transparency: 10, meta: { note: 'preserve' } }));
describe('Comportamiento de Comandos — Arquitectura (ARC-002)', () => {
  let h: CommandHarness;
  beforeEach(() => { h = new CommandHarness(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  it('commands, unique aliases, bilingual help and actual tool deck access', () => {
    const all = allCommands();
    for (const command of ARCHITECTURE_COMMANDS) {
      expect(findCommand(command.name)).toEqual(command);
      expect(command.help?.es).toBeTruthy(); expect(command.help?.en).toBeTruthy();
      expect(hasCadIcon(command.icon!)).toBe(true);
      for (const alias of command.aliases) {
        expect(findCommand(alias)).toEqual(command);
        expect(all.filter(c => [c.name, ...c.aliases].includes(alias))).toHaveLength(1);
      }
    }
    const tools = toolsForRibbonTab('architecture').flatMap(g => g.tools);
    expect(tools.map(t => t.cmd)).toEqual(expect.arrayContaining(ARCHITECTURE_COMMANDS.map(c => c.name)));
    expect(tools.filter(t => t.args).map(t => t.args)).toEqual([['100mm'], ['150mm'], ['200mm']]);
    expect(toolsForRibbonTab('home').flatMap(g => g.tools).some(t => t.cmd === 'WALL')).toBe(true);
  });
  it('WALL continuous corners, internal Undo, Close and one atomic undo/redo including style', async () => {
    const standard = h.doc.data.mlineStyles.get(MLINESTYLE_STANDARD_ID), before = h.doc.data.mlineStyles.size;
    expect((await h.run('MURO', [p(0), p(5000), p(5000, 2000), 'U', p(5000, 4000), p(0, 4000), 'C'])).ok).toBe(true);
    expect(walls(h)).toHaveLength(1); expect(walls(h)[0].closed).toBe(true); expect(walls(h)[0].vertices).toHaveLength(4);
    expect(h.doc.data.mlineStyles.get(MLINESTYLE_STANDARD_ID)).toBe(standard);
    const style = h.doc.data.mlineStyles.get(walls(h)[0].style)!;
    expect(style.startCap).toBe('line'); expect(style.endCap).toBe('line'); expect(style.elements.map(e => e.offset)).toEqual([0.5, -0.5]);
    expect(mlineElements(walls(h)[0], [0.5, -0.5])[0][0]).toEqual(p(75, 75));
    h.undo(); expect(walls(h)).toHaveLength(0); expect(h.doc.data.mlineStyles.size).toBe(before);
    h.redo(); expect(walls(h)).toHaveLength(1);
  });
  it('WALL internal Undo of sole segment leaves no style or entity; Esc retains completed geometry', async () => {
    await h.run('WALL', [p(0), p(5000), 'U', '']);
    expect(walls(h)).toHaveLength(0); expect(h.doc.data.mlineStyles.size).toBe(1);
    const pending = h.run('WALL', [p(0), p(5000)]);
    await vi.waitFor(() => expect(walls(h)).toHaveLength(1));
    h.runner.cancel(); await pending;
    expect(walls(h)[0].vertices).toEqual([p(0), p(5000)]);
    h.undo(); expect(walls(h)).toHaveLength(0);
  });
  it('WALL invalid geometry rolls back completed steps and newly created style', async () => {
    const res = await h.run('WALL', [p(0), p(5000), p(0)]);
    expect(res.ok).toBe(false); expect(walls(h)).toHaveLength(0); expect(h.doc.data.mlineStyles.size).toBe(1);
    expect(h.doc.activeTransaction).toBeNull(); expect(h.doc.history.inGroup).toBe(false);
  });
  it.each(['WALL', 'WALLRECT'])('%s shares initial thickness/reference options and cancels initial input cleanly', async name => {
    await h.run(name, ['T', '200', 'J', 'R', p(0), name === 'WALL' ? p(5000) : p(5000, 4000), ...(name === 'WALL' ? [''] : [])]);
    expect(walls(h)[0]).toMatchObject({ scale: 200, justification: 'bottom' });
    h.undo();
    await h.run(name, ['T', '100', 'J', 'L', '']);
    expect(walls(h)).toHaveLength(0); expect(h.doc.data.mlineStyles.size).toBe(1);
  });
  it('room help describes the two-corner flow without continuous-wall options', () => {
    const help = findCommand('WALLRECT')!.help!;
    expect(help.es).toContain('esquina opuesta'); expect(help.en).toContain('opposite corner');
    for (const text of [help.es, help.en]) {
      expect(text).toContain('150 mm'); expect(text).toContain('WALLRECT 100mm/150mm/200mm');
      expect(text).not.toMatch(/desHacer|Cerrar|Undo|Close|Enter to finish|Intro para terminar/);
    }
  });
  it('room accepts thickness/reference options and dimensions follow the reference', async () => {
    await h.run('HABITACION', ['T', '200', 'J', 'L', p(0), p(5000, 4000)]);
    expect(walls(h)[0]).toMatchObject({ closed: true, scale: 200, justification: 'top', vertices: [p(0), p(5000), p(5000, 4000), p(0, 4000)] });
    expect(mlineElements(walls(h)[0], [0.5, -0.5])[0][0]).toEqual(p(0));
    h.undo(); expect(walls(h)).toHaveLength(0);
  });
  it.each([['mm', 150], ['m', 0.15], ['cm', 15], ['unitless', 150]] as const)('defaults and physical presets do not leak across %s drawings', async (units, expected) => {
    h = new CommandHarness(new Editor(createDocument({ units })));
    await h.run('WALL', [p(0), p(5000), '']); expect(walls(h)[0].scale).toBe(expected);
    for (const size of [100, 150, 200]) {
      await h.run('WALLRECT', [p(0), p(5000, 4000)], [`${size}mm`]);
      expect(walls(h).at(-1)!.scale).toBeCloseTo(expected * size / 150);
    }
  });
  it('converts with preselection preserving source properties, keeps then explicitly replaces', async () => {
    const source = addLine(h); h.select(source.id);
    await h.run('WALLCONVERT', ['']);
    expect(h.doc.entity(source.id)).toBe(source); expect(walls(h)).toHaveLength(1);
    expect(walls(h)[0]).toMatchObject({ owner: source.owner, layer: source.layer, color: source.color, lineweight: 25, linetypeScale: 2, transparency: 10, meta: source.meta });
    expect(walls(h)[0]).not.toHaveProperty('start');
    h.undo(); h.select(source.id); await h.run('CONVERTIRMURO', ['R', '']);
    expect(h.doc.entity(source.id)?.type).toBe('mline'); expect(walls(h)).toHaveLength(1);
    expect(walls(h)[0].id).toBe(source.id);
    h.undo(); expect(h.doc.entity(source.id)).toBe(source); h.redo(); expect(h.doc.entity(source.id)?.type).toBe('mline');
  });
  it('conversion rejects curves/degeneracy before any mutation and preserves an existing user style name', async () => {
    const source = addLine(h);
    const curve = h.doc.transact('seed', tx => tx.addEntity<LwPolylineEntity>({ ...entityDefaults(h.doc), type: 'lwpolyline', vertices: [{ ...p(0), bulge: 0.5 }, p(5000)], closed: false }));
    h.select(source.id, curve.id); const before = h.snapshot();
    expect((await h.run('WALLCONVERT', ['R', ''])).ok).toBe(false); expect(h.snapshot().entities).toEqual(before.entities); expect(h.doc.data.mlineStyles.size).toBe(1);
    h.doc.transact('style', tx => tx.add('mlineStyles', { ...h.doc.data.mlineStyles.get(MLINESTYLE_STANDARD_ID)!, id: 'user', name: 'FModel Wall' }));
    h.select(source.id); await h.run('WALLCONVERT', ['']);
    expect(h.doc.data.mlineStyles.get('user')!.name).toBe('FModel Wall');
    expect(h.doc.data.mlineStyles.get(walls(h)[0].style)!.name).toBe('FModel Wall 2');
  });
  it.each(['WALLDOOR', 'WALLWINDOW'])('%s real opening, width change, no mutation before confirmation, undo/redo as one step', async name => {
    await h.run('WALL', [p(0), p(5000), p(5000, 4000), '']);
    const original = walls(h)[0], before = h.snapshot();
    const res = await h.run(name, [p(2000, 75), 'W', '1000', p(2500), ...(name === 'WALLDOOR' ? ['H', p(2500, -1000)] : []), '']);
    expect(res.ok).toBe(true); expect(walls(h)).toHaveLength(2);
    expect(walls(h).every(w => w.style === original.style && w.scale === original.scale && w.justification === original.justification && w.owner === original.owner)).toBe(true);
    expect(walls(h)[0].vertices.at(-1)).toEqual(p(2000)); expect(walls(h)[1].vertices[0]).toEqual(p(3000));
    if (name === 'WALLDOOR') {
      const arc = [...h.doc.data.entities.values()].find((e): e is ArcEntity => e.type === 'arc')!;
      expect(arc.radius).toBe(1000); expect((arc.endAngle - arc.startAngle + 2 * Math.PI) % (2 * Math.PI)).toBeCloseTo(Math.PI / 2);
    } else expect([...h.doc.data.entities.values()].filter(e => e.type === 'line')).toHaveLength(4);
    h.undo(); expect(h.snapshot().entities).toEqual(before.entities); h.redo(); expect(walls(h)).toHaveLength(2);
  });
  it.each(['WALLDOOR', 'WALLWINDOW'])('%s cancellation before confirmation and invalid corner create no residue', async name => {
    await h.run('WALL', [p(0), p(5000), '']); const before = h.snapshot();
    const pending = h.run(name, [p(2000, 75), p(2500)]);
    await vi.waitFor(() => expect(h.runner.pending?.req.allowNone).toBe(true));
    expect(h.snapshot().entities).toEqual(before.entities); h.runner.cancel(); await pending;
    expect(h.snapshot().entities).toEqual(before.entities); expect(h.doc.data.mlineStyles.size).toBe(2);
    expect((await h.run(name, [p(2000, 75), p(100)])).ok).toBe(false);
    expect(h.snapshot().entities).toEqual(before.entities);
  });
  it('rejects locked wall openings and curved polylines even with tiny bulges', async () => {
    await h.run('WALL', [p(0), p(5000), '']); const wall = walls(h)[0];
    h.doc.transact('lock', tx => tx.updateEntity<MLineEntity>(wall.id, { locked: true }));
    const before = h.snapshot();
    expect((await h.run('PUERTA', [p(2000, 75)])).ok).toBe(false);
    expect(h.snapshot().entities).toEqual(before.entities);
    const curved = h.doc.transact('seed', tx => tx.addEntity<LwPolylineEntity>({ ...entityDefaults(h.doc), type: 'lwpolyline', closed: false, vertices: [{ ...p(0), bulge: 1e-12 }, p(5000)] }));
    h.select(curved.id); expect((await h.run('WALLCONVERT', ['R', ''])).ok).toBe(false); expect(h.doc.entity(curved.id)).toBe(curved);
  });
  it('converts closed straight polylines and rejects all degenerate sources atomically', async () => {
    const source = h.doc.transact('seed', tx => tx.addEntity<LwPolylineEntity>({ ...entityDefaults(h.doc), type: 'lwpolyline', closed: true, vertices: [p(0), p(5000), p(5000, 4000), p(0, 4000)] }));
    h.select(source.id); expect((await h.run('WALLCONVERT', [''])).ok).toBe(true); expect(walls(h)[0].closed).toBe(true);
    h.undo();
    const bad = h.doc.transact('seed', tx => tx.addEntity<LineEntity>({ ...entityDefaults(h.doc), type: 'line', start: p(0), end: p(0) }));
    const before = h.snapshot(); h.select(source.id, bad.id);
    expect((await h.run('WALLCONVERT', ['R', ''])).ok).toBe(false); expect(h.snapshot().entities).toEqual(before.entities); expect(h.doc.data.mlineStyles.size).toBe(1);
  });
  it('door geometry has a quarter-circle for either hinge and opening side', async () => {
    await h.run('WALL', [p(0), p(5000), '']); const wall = walls(h)[0], gap = wallOpening(wall, p(2500), 900);
    for (const side of [-1, 1]) for (const hinge of [false, true]) {
      const symbols = openingSymbols(wall, gap, true, side, hinge), arc = symbols.find((e): e is ArcEntity => e.type === 'arc')!;
      expect((arc.endAngle - arc.startAngle + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI / 2);
      expect(symbols.every(e => e.type === 'line' || e.type === 'arc')).toBe(true);
      expect(arc).not.toHaveProperty('vertices');
    }
  });
  it('opening a room keeps one wall path and the same stable wall identity', async () => {
    await h.run('WALLRECT', [p(0), p(5000, 4000)]); const original = walls(h)[0];
    expect((await h.run('VENTANA', [p(2500, 75), p(2500), ''])).ok).toBe(true);
    expect(walls(h)).toHaveLength(1); expect(walls(h)[0].id).toBe(original.id); expect(walls(h)[0].closed).toBe(false); expect(walls(h)[0].vertices).toHaveLength(6);
  });
  it('opening defaults in metres are physical and compatible style required', async () => {
    h = new CommandHarness(new Editor(createDocument({ units: 'm' })));
    await h.run('WALL', [p(0), p(5), '']);
    await h.run('PUERTA', [p(2, 0.075), p(2.5), '']);
    expect(walls(h)[0].vertices.at(-1)!.x).toBeCloseTo(2.05);
    expect([...h.doc.data.entities.values()].find(e => e.type === 'arc')).toMatchObject({ radius: 0.9 });
    h.undo(); await h.run('VENTANA', [p(2, 0.075), p(2.5), '']);
    expect(walls(h)[0].vertices.at(-1)!.x).toBeCloseTo(1.9);
    h.undo(); const original = walls(h)[0];
    h.doc.transact('incompatible', tx => tx.updateEntity<MLineEntity>(original.id, { style: MLINESTYLE_STANDARD_ID }));
    const before = h.snapshot(); expect((await h.run('PUERTA', [p(2, 0.075)])).ok).toBe(false); expect(h.snapshot().entities).toEqual(before.entities);
  });
});
