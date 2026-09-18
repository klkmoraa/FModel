import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import type { Entity, InsertEntity } from '../document/types';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import { evaluateDynamic } from './dynamic';
import { furnitureLibrary } from './furniture';
import { installDynamicBlocks } from './install';
import { importBlockPackage } from './library';

function load(name: string) {
  const item = furnitureLibrary().find((b) => b.name === name)!;
  const doc = createDocument();
  const ctx = createContext(doc);
  installDynamicBlocks(ctx);
  const block = doc.findByName('blocks', importBlockPackage(doc, item.package))!;
  const params = Object.fromEntries(block.dynamic!.parameters.map((p) => [p.name, p.id]));
  const ev = (values: Record<string, number>) => evaluateDynamic(ctx, doc.data.blocks.get(block.id)!, doc.entitiesOf(block.id), { values: Object.fromEntries(Object.entries(values).map(([k, v]) => [params[k], v])) });
  return { ctx, ev };
}

const width = (ents: Entity[], ctx: ReturnType<typeof createContext>, filter: (e: Entity) => boolean = () => true) => {
  const bs = ents.filter(filter).map((e) => kindOf(e).bbox(e, ctx));
  return Math.max(...bs.map((b) => b.maxX)) - Math.min(...bs.map((b) => b.minX));
};

describe('muebles paramétricos', () => {
  it('no comparten nombre con la biblioteca de LibreCAD', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/library/librecad/index.json', import.meta.url), 'utf8')) as { items: { name: string }[] };
    const names = [...manifest.items.map((i) => i.name), ...furnitureLibrary().map((b) => b.name)].map((n) => n.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('los doce se evalúan sin avisos en su tamaño por defecto', () => {
    const items = furnitureLibrary();
    expect(items).toHaveLength(12);
    for (const it of items) {
      const doc = createDocument();
      const ctx = createContext(doc);
      installDynamicBlocks(ctx);
      const b = doc.findByName('blocks', importBlockPackage(doc, it.package))!;
      const ev = evaluateDynamic(ctx, b, doc.entitiesOf(b.id), undefined);
      expect(ev.warnings, it.name).toEqual([]);
      expect(it.dynamic).toBe(true);
    }
  });

  it('el clóset de correderas añade hojas de 600 al alargarlo', () => {
    const { ev, ctx } = load('Clóset de correderas');
    const panels = (w: number) => ev({ Ancho: w }).entities.filter((e) => e.type === 'lwpolyline' && width([e], ctx) === 600).length;
    expect(panels(1200)).toBe(2);
    expect(panels(1800)).toBe(3);
    expect(panels(3000)).toBe(5);
    expect(width(ev({ Ancho: 3000 }).entities, ctx)).toBe(3000);
    // valores fuera del conjunto se ajustan al múltiplo de 600 más cercano
    expect(panels(2000)).toBe(3);
  });

  it('la mesa gana una silla por lado cada 600 y el ancho de mesa aleja las del lado opuesto', () => {
    const { ev, ctx } = load('Mesa de comedor con sillas');
    const chairs = (v: Record<string, number>) => ev(v).entities.filter((e) => e.type === 'lwpolyline' && width([e], ctx) === 450);
    expect(chairs({ Ancho: 1600 })).toHaveLength(4);
    expect(chairs({ Ancho: 2400 })).toHaveLength(8);
    const top = (v: Record<string, number>) => Math.max(...chairs(v).map((c) => kindOf(c).bbox(c, ctx).maxY));
    expect(top({ 'Ancho de mesa': 1200 }) - top({ 'Ancho de mesa': 900 })).toBeCloseTo(300, 9);
  });

  it('la cama solo toma anchos estándar', () => {
    const { ev, ctx } = load('Cama');
    const outline = (w: number) => width(ev({ Ancho: w }).entities, ctx);
    expect(outline(1400)).toBe(1350);
    expect(outline(1700)).toBe(1800);
  });

  it('el sofá se alarga sin deformar los brazos', () => {
    const { ev, ctx } = load('Sofá paramétrico');
    const arms = ev({ Ancho: 3000 }).entities.filter((e): e is Entity => e.type === 'lwpolyline' && width([e], ctx) === 200);
    expect(arms).toHaveLength(2);
    void ({} as InsertEntity);
  });
});
