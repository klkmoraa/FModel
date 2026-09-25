import { beforeEach, describe, expect, it } from 'vitest';
import { entityDefaults } from '../../document/defaults';
import type { CenterMarkEntity, CircleEntity, DimensionEntity, Entity, InsertEntity, LineEntity, LwPolylineEntity, MTextEntity, SplineEntity, TextEntity } from '../../document/types';
import { translation } from '../../geometry/matrix';
import { buildDimension } from '../../model/dimension';
import { CommandHarness } from './harness';

/** Comportamiento de Comandos — Producción de planos */
describe('Comportamiento de Comandos — Producción de planos', () => {
  let h: CommandHarness;

  beforeEach(() => {
    h = new CommandHarness();
  });

  const all = <T extends Entity['type']>(type: T) => [...h.doc.data.entities.values()].filter((e): e is Extract<Entity, { type: T }> => e.type === type);
  const addLine = (ax: number, ay: number, bx: number, by: number) => h.doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(h.doc), type: 'line', start: { x: ax, y: ay }, end: { x: bx, y: by } }));
  const addCircle = (x: number, y: number, r: number) => h.doc.transact('CIRCLE', (tx) => tx.addEntity<CircleEntity>({ ...entityDefaults(h.doc), type: 'circle', center: { x, y }, radius: r }));
  const addText = (text: string, x: number, y: number) => h.doc.transact('TEXT', (tx) => tx.addEntity<TextEntity>({ ...entityDefaults(h.doc), type: 'text', position: { x, y }, text, height: 2.5, rotation: 0, widthFactor: 1, oblique: 0, style: h.doc.settings.currentTextStyle, halign: 'left', valign: 'baseline' }));
  const addDim = (x1: number, x2: number, y: number) => h.doc.transact('DIM', (tx) => tx.addEntity<DimensionEntity>({ ...entityDefaults(h.doc), type: 'dimension', dimType: 'linear', style: h.doc.settings.currentDimStyle, overrides: {}, p1: { x: x1, y: 0 }, p2: { x: x2, y: 0 }, p3: { x: (x1 + x2) / 2, y }, rotation: 0 }));

  describe('QDIM', () => {
    it('acota en cadena continua los puntos distintos y crea cotas asociativas en un paso', async () => {
      await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
      const c = addCircle(30, 25, 5);
      h.select(...h.doc.data.entities.keys());
      const res = await h.run('QDIM', [{ x: 50, y: 80 }]);
      expect(res.ok).toBe(true);
      const dims = all('dimension');
      expect(dims).toHaveLength(2);
      expect(dims.map((d) => Math.abs(d.p2.x - d.p1.x)).sort((a, b) => a - b)).toEqual([30, 70]);
      expect(dims.every((d) => d.rotation === 0 && d.p3.y === 80 && d.assoc?.length === 2)).toBe(true);
      expect(dims.some((d) => d.assoc!.some((a) => a.entityId === c.id && a.snap === 'center'))).toBe(true);
      h.undo();
      expect(all('dimension')).toHaveLength(0);
    });

    it('en línea base parte del primer punto y separa cada cota; a la derecha acota en vertical', async () => {
      addLine(0, 0, 40, 0);
      addLine(40, 0, 40, 30);
      h.select(...h.doc.data.entities.keys());
      await h.run('QDIM', ['Baseline', { x: 90, y: 10 }]);
      const dims = all('dimension');
      expect(dims).toHaveLength(1);
      expect(dims[0].rotation).toBeCloseTo(Math.PI / 2, 12);
    });

    it('en radio crea una cota por cada círculo', async () => {
      addCircle(0, 0, 5);
      addCircle(30, 0, 8);
      h.select(...h.doc.data.entities.keys());
      await h.run('QDIM', ['Radius', { x: 15, y: 20 }]);
      const dims = all('dimension');
      expect(dims.map((d) => d.dimType)).toEqual(['radial', 'radial']);
    });
  });

  describe('DIMSPACE', () => {
    it('reparte cotas paralelas a igual distancia de la base y con 0 las alinea', async () => {
      const base = addDim(0, 50, 10);
      const d2 = addDim(0, 80, 40);
      const d3 = addDim(0, 100, 70);
      const res = await h.run('DIMSPACE', [{ x: 25, y: 10 }, { x: 60, y: 40 }, { x: 90, y: 70 }, '', '8']);
      expect(res.ok).toBe(true);
      expect((h.doc.entity(d2.id) as DimensionEntity).p3.y).toBeCloseTo(18, 12);
      expect((h.doc.entity(d3.id) as DimensionEntity).p3.y).toBeCloseTo(26, 12);
      expect(h.doc.entity(base.id)).toBe(base);
      await h.run('DIMSPACE', [{ x: 25, y: 10 }, { x: 60, y: 18 }, { x: 90, y: 26 }, '', '0']);
      expect((h.doc.entity(d3.id) as DimensionEntity).p3.y).toBeCloseTo(10, 12);
    });
  });

  describe('DIMBREAK', () => {
    it('Auto corta donde cruza un objeto, se actualiza al moverlo y deshacer lo revierte', async () => {
      const d = addDim(0, 100, 20);
      const cross = addLine(50, -10, 50, 40);
      h.select(d.id);
      expect((await h.run('DIMBREAK', ['Auto'])).ok).toBe(true);
      let dim = h.doc.entity(d.id) as DimensionEntity;
      expect(dim.breakAuto).toBe(true);
      expect(dim.breaks?.some((b) => Math.abs(b.p.x - 50) < 1e-9 && Math.abs(b.p.y - 20) < 1e-9)).toBe(true);
      const pieces = buildDimension(dim, h.editor.ctx).curves.filter((c) => c.kind === 'line' && c.a.y === 20 && c.b.y === 20);
      expect(pieces.length).toBeGreaterThanOrEqual(2);
      h.editor.transformEntities([cross.id], translation(20, 0), 'MOVE');
      dim = h.doc.entity(d.id) as DimensionEntity;
      expect(dim.breaks?.some((b) => Math.abs(b.p.x - 70) < 1e-9)).toBe(true);
      h.undo();
      dim = h.doc.entity(d.id) as DimensionEntity;
      expect(dim.breaks?.some((b) => Math.abs(b.p.x - 50) < 1e-9)).toBe(true);
      h.select(d.id);
      await h.run('DIMBREAK', ['Remove']);
      expect((h.doc.entity(d.id) as DimensionEntity).breaks).toBeUndefined();
    });

    it('Manual corta el tramo indicado con su longitud', async () => {
      const d = addDim(0, 100, 20);
      h.select(d.id);
      await h.run('DIMBREAK', ['Manual', { x: 30, y: 20 }, { x: 40, y: 20 }]);
      const dim = h.doc.entity(d.id) as DimensionEntity;
      expect(dim.breaks).toEqual([{ p: { x: 35, y: 20 }, size: 10 }]);
      expect(dim.breakAuto).toBeUndefined();
    });
  });

  describe('CENTERMARK y CENTERLINE', () => {
    it('la marca sigue al círculo, se independiza si se copia y pierde el origen si este se borra', async () => {
      const c = addCircle(10, 10, 5);
      expect((await h.run('CENTERMARK', [{ x: 15, y: 10 }, ''])).ok).toBe(true);
      const mark = all('centermark')[0];
      expect(mark).toMatchObject({ mode: 'mark', center: { x: 10, y: 10 }, radius: 5, sources: [{ entityId: c.id, part: 'center' }] });
      h.editor.transformEntities([c.id], translation(10, 0), 'MOVE');
      h.doc.transact('R', (tx) => tx.updateEntity<CircleEntity>(c.id, { radius: 8 }));
      expect(h.doc.entity(mark.id)).toMatchObject({ center: { x: 20, y: 10 }, radius: 8 });
      const [copyId] = h.editor.transformEntities([mark.id], translation(0, 50), 'COPY', true);
      expect((h.doc.entity(copyId) as CenterMarkEntity).sources).toBeUndefined();
      h.doc.transact('ERASE', (tx) => tx.removeEntity(c.id));
      expect((h.doc.entity(mark.id) as CenterMarkEntity).sources).toBeUndefined();
      h.undo();
      expect((h.doc.entity(mark.id) as CenterMarkEntity).sources).toHaveLength(1);
    });

    it('el eje une los puntos medios de dos tramos y los sigue', async () => {
      const a = addLine(0, 0, 100, 0);
      addLine(100, 20, 0, 20);
      expect((await h.run('CENTERLINE', [{ x: 50, y: 0 }, { x: 50, y: 20 }])).ok).toBe(true);
      const axis = all('centermark')[0];
      expect(axis.mode).toBe('line');
      expect(axis.center).toEqual({ x: 0, y: 10 });
      expect(axis.end).toEqual({ x: 100, y: 10 });
      h.editor.transformEntities([a.id], translation(0, -10), 'MOVE');
      expect((h.doc.entity(axis.id) as CenterMarkEntity).center.y).toBeCloseTo(5, 12);
    });
  });

  describe('BLEND', () => {
    it('enlaza los extremos cercanos con una spline tangente o suave', async () => {
      addLine(0, 0, 10, 0);
      addLine(20, 10, 20, 20);
      expect((await h.run('BLEND', [{ x: 9, y: 0 }, { x: 20, y: 11 }])).ok).toBe(true);
      const s = all('spline')[0] as SplineEntity;
      expect(s.spline.degree).toBe(3);
      expect(s.spline.ctrl[0]).toEqual({ x: 10, y: 0 });
      expect(s.spline.ctrl[3]).toEqual({ x: 20, y: 10 });
      await h.run('BLEND', ['Continuity', 'Smooth', { x: 1, y: 0 }, { x: 20, y: 19 }]);
      const smooth = all('spline').find((x) => x.id !== s.id)!;
      expect(smooth.spline.degree).toBe(5);
      expect(smooth.spline.ctrl[0]).toEqual({ x: 0, y: 0 });
    });
  });

  describe('capas', () => {
    it('COPYTOLAYER copia a una capa nueva sin tocar los originales', async () => {
      const l = addLine(0, 0, 10, 0);
      h.select(l.id);
      const res = await h.run('COPYTOLAYER', ['Name', 'Ejes', 'Yes', '']);
      expect(res.ok).toBe(true);
      const layer = h.doc.findByName('layers', 'Ejes')!;
      const copies = all('line').filter((e) => e.layer === layer.id);
      expect(copies).toHaveLength(1);
      expect(copies[0].start).toEqual(l.start);
      expect(h.doc.entity(l.id)).toBe(l);
      h.undo();
      expect(h.doc.findByName('layers', 'Ejes')).toBeUndefined();
    });

    it('LAYWALK aísla cada capa y al salir restaura la vista sin tocar el dibujo', async () => {
      addLine(0, 0, 10, 0);
      h.doc.transact('LAYER', (tx) => tx.add('layers', { ...[...h.doc.data.layers.values()][0], id: 'l-muros', name: 'Muros', order: 9 }));
      const wall = h.doc.transact('W', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(h.doc), layer: 'l-muros', type: 'line', start: { x: 0, y: 5 }, end: { x: 10, y: 5 } }));
      const version = h.doc.version;
      const seen: string[][] = [];
      const off = h.editor.on('doc', () => seen.push([...(h.editor.isolated ?? [])]));
      await h.run('LAYWALK', ['Name', 'Muros', 'Exit']);
      off();
      expect(seen[0]).toHaveLength(1);
      expect(seen).toContainEqual([wall.id]);
      expect(h.editor.isolated).toBeNull();
      expect(h.doc.version).toBe(version);
    });
  });

  describe('textos', () => {
    it('TXT2MTXT combina de arriba abajo en un texto múltiple y deshacer lo revierte', async () => {
      const t = [addText('abajo', 0, 0), addText('arriba', 0, 20), addText('medio {x} a\\b', 0, 10)];
      h.select(...t.map((x) => x.id));
      expect((await h.run('TXT2MTXT', ['Combine'])).ok).toBe(true);
      const m = all('mtext') as MTextEntity[];
      expect(m).toHaveLength(1);
      expect(m[0].contents).toBe('arriba\\Pmedio \\{x\\} a\\\\b\\Pabajo');
      expect(m[0].attachment).toBe(1);
      expect(all('text')).toHaveLength(0);
      h.undo();
      expect(all('text')).toHaveLength(3);
      expect(all('mtext')).toHaveLength(0);
    });

    it('TEXTALIGN alinea en horizontal y distribuye', async () => {
      const t = [addText('a', 0, 0), addText('b', 30, 7), addText('c', 60, -4)];
      h.select(...t.map((x) => x.id));
      await h.run('TEXTALIGN', [{ x: 0.5, y: 0.5 }, 'Horizontal']);
      expect(all('text').map((x) => x.position.y)).toEqual([0, 0, 0]);
      h.doc.transact('MOVE', (tx) => tx.updateEntity<TextEntity>(t[1].id, { position: { x: 10, y: 0 } }));
      h.select(...t.map((x) => x.id));
      await h.run('TEXTALIGN', [{ x: 0.5, y: 0.5 }, 'Distribute', { x: 100, y: 0 }]);
      expect(all('text').map((x) => x.position.x).sort((a, b) => a - b)).toEqual([0, 30, 60]);
    });
  });

  describe('MASSPROP', () => {
    it('informa área, centroide e inercias de un contorno cerrado sin modificar el dibujo', async () => {
      await h.run('RECTANG', [{ x: 0, y: 0 }, { x: 10, y: 5 }]);
      const rect = all('lwpolyline')[0] as LwPolylineEntity;
      h.select(rect.id);
      const version = h.doc.version;
      const res = await h.run('MASSPROP', ['No']);
      expect(res.ok).toBe(true);
      const text = res.logs.join('\n');
      expect(text).toMatch(/(Área|Area): 50\.0+/);
      expect(text).toMatch(/(Centroide|Centroid): X 5\.0+, Y 2\.50+/);
      expect(text).toMatch(new RegExp(`Ix ${((10 * 5 ** 3) / 12).toFixed(2)}`));
      expect(h.doc.version).toBe(version);
    });

    it('rechaza objetos que no encierran una región', async () => {
      const l = addLine(0, 0, 10, 0);
      h.select(l.id);
      const res = await h.run('MASSPROP');
      expect(res.ok).toBe(false);
    });
  });

  describe('portapapeles', () => {
    it('COPYBASE fija el punto que sujeta el cursor al pegar', async () => {
      const l = addLine(10, 10, 20, 10);
      h.select(l.id);
      await h.run('COPYBASE', [{ x: 10, y: 10 }]);
      await h.run('PASTECLIP', [{ x: 110, y: 10 }]);
      const copy = all('line').find((e) => e.id !== l.id)!;
      expect(copy.start).toEqual({ x: 110, y: 10 });
      expect(copy.end).toEqual({ x: 120, y: 10 });
    });

    it('PASTEORIG pega en las coordenadas originales de otro dibujo y lo rechaza en el mismo', async () => {
      const l = addLine(3, 4, 13, 4);
      h.select(l.id);
      await h.run('COPYCLIP');
      const same = await h.run('PASTEORIG');
      expect(same.ok).toBe(false);
      const other = new CommandHarness();
      const res = await other.run('PASTEORIG');
      expect(res.ok).toBe(true);
      const pasted = [...other.doc.data.entities.values()].find((e): e is LineEntity => e.type === 'line')!;
      expect(pasted.start).toEqual({ x: 3, y: 4 });
    });

    it('PASTEBLOCK crea un bloque nuevo con el contenido y lo inserta', async () => {
      const l = addLine(0, 0, 10, 0);
      h.select(l.id);
      await h.run('COPYBASE', [{ x: 0, y: 0 }]);
      const blocks = h.doc.data.blocks.size;
      expect((await h.run('PASTEBLOCK', [{ x: 50, y: 50 }])).ok).toBe(true);
      expect(h.doc.data.blocks.size).toBe(blocks + 1);
      const ins = all('insert')[0] as InsertEntity;
      expect(ins.position).toEqual({ x: 50, y: 50 });
      const block = h.doc.data.blocks.get(ins.blockId)!;
      expect(block.name).toMatch(/^A\$C/);
      expect(h.doc.entitiesOf(block.id)).toHaveLength(1);
      h.undo();
      expect(h.doc.data.blocks.size).toBe(blocks);
    });
  });
});
