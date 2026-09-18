import { describe, expect, it } from 'vitest';
import { CadDocument } from '../document/document';
import { MODEL_SPACE_ID } from '../document/types';
import type { Entity } from '../document/types';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import { findPattern } from '../model/hatchPatterns';
import { installDynamicBlocks } from '../blocks/install';
import {
  TEMPLATES_CATALOG,
  createA3SheetTemplate,
  createA4SheetTemplate,
  createBuildingFloorTemplate,
  createFoundationDetailTemplate,
  createResidentialHouseTemplate,
  createStructuralDetailTemplate,
} from './index';

const all = (data: ReturnType<typeof createA3SheetTemplate>) => [...data.entities.values()];
const ofType = <T extends Entity['type']>(data: ReturnType<typeof createA3SheetTemplate>, t: T, owner = MODEL_SPACE_ID) =>
  all(data).filter((e) => e.type === t && e.owner === owner) as Extract<Entity, { type: T }>[];

describe('plantillas FModel', () => {
  it('el catálogo tiene seis plantillas únicas repartidas en las tres categorías', () => {
    const ids = TEMPLATES_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(6);
    for (const c of ['sheet', 'structural', 'architectural'] as const) {
      expect(TEMPLATES_CATALOG.filter((t) => t.category === c)).toHaveLength(2);
    }
  });

  for (const tpl of TEMPLATES_CATALOG) {
    describe(tpl.id, () => {
      const data = tpl.createDocument();
      const doc = new CadDocument(data);
      const ctx = createContext(doc);

      it('todas las referencias existen', () => {
        for (const e of all(data)) {
          const owner = e.owner === MODEL_SPACE_ID || data.layouts.has(e.owner) || data.blocks.has(e.owner);
          expect(owner, `${e.type} con propietario ${e.owner}`).toBe(true);
          expect(data.layers.has(e.layer), `capa ${e.layer}`).toBe(true);
          if (e.linetype !== 'ByLayer' && e.linetype !== 'ByBlock') expect(data.linetypes.has(e.linetype), e.linetype).toBe(true);
          if (e.type === 'text' || e.type === 'mtext') expect(data.textStyles.has(e.style), e.style).toBe(true);
          if (e.type === 'dimension') expect(data.dimStyles.has(e.style), e.style).toBe(true);
          if (e.type === 'hatch' && e.pattern.type === 'predefined') expect(findPattern(e.pattern.name), e.pattern.name).toBeDefined();
          if (e.type === 'insert') {
            const block = data.blocks.get(e.blockId);
            expect(block, e.blockId).toBeDefined();
            const params = new Set(block?.dynamic?.parameters.map((p) => p.id) ?? []);
            for (const id of Object.keys(e.dynamic?.values ?? {})) expect(params.has(id)).toBe(true);
          }
        }
        for (const l of data.layers.values()) expect(data.linetypes.has(l.linetype), l.linetype).toBe(true);
      });

      it('cada entidad del modelo tiene una caja finita', () => {
        const model = doc.entitiesOf(MODEL_SPACE_ID);
        expect(model.length).toBeGreaterThan(0);
        for (const e of model) {
          const box = kindOf(e).bbox(e, ctx);
          expect(Number.isFinite(box.minX) && Number.isFinite(box.maxY), `${e.type} ${e.id}`).toBe(true);
        }
      });

      it('las presentaciones tienen marco y un viewport a la escala declarada', () => {
        for (const layout of data.layouts.values()) {
          if (doc.entitiesOf(layout.id).length === 0) continue; // «Presentación1» vacía por defecto
          const vps = ofType(data, 'viewport', layout.id);
          expect(vps).toHaveLength(1);
          expect(vps[0].scaleName && tpl.format.startsWith(`Escala ${vps[0].scaleName}`)).toBeTruthy();
          expect(ofType(data, 'lwpolyline', layout.id).length).toBeGreaterThan(2);
        }
      });
    });
  }

  it('la vivienda usa muebles dinámicos de la biblioteca, cotas reales y superficies', () => {
    const data = createResidentialHouseTemplate();
    const inserts = ofType(data, 'insert');
    expect(inserts.some((i) => data.blocks.get(i.blockId)?.dynamic && i.dynamic)).toBe(true);
    expect([...data.blocks.values()].map((b) => b.name)).toEqual(expect.arrayContaining(['Cama', 'Sofá paramétrico', 'FM Puerta abatible', 'FM Inodoro']));
    expect(ofType(data, 'dimension').length).toBeGreaterThanOrEqual(25);
    expect(ofType(data, 'hatch').length).toBeGreaterThan(10);
    const areas = ofType(data, 'mtext').map((m) => m.contents).join(' ');
    expect(areas).toContain('21,60 m²');
    expect([...data.layouts.values()].map((l) => l.name)).toEqual(['A3 · Planta 1:50']);
  });

  it('la planta de oficinas dibuja la retícula completa de pilares y ejes', () => {
    const data = createBuildingFloorTemplate();
    const columns = ofType(data, 'hatch').filter((h) => h.layer === 's-pilares');
    expect(columns).toHaveLength(20);
    expect(ofType(data, 'line').filter((l) => l.layer === 's-ejes')).toHaveLength(9);
    const desks = ofType(data, 'insert').filter((i) => data.blocks.get(i.blockId)?.name === 'Escritorio');
    expect(desks).toHaveLength(116);
  });

  it('los valores dinámicos de los muebles se aplican al evaluar (sofás de 2600, mesa de 3600)', () => {
    const data = createBuildingFloorTemplate();
    const doc = new CadDocument(data);
    const ctx = createContext(doc);
    installDynamicBlocks(ctx);
    const width = (name: string) =>
      ofType(data, 'insert')
        .filter((i) => data.blocks.get(i.blockId)?.name === name)
        .map((i) => {
          const b = kindOf(i).bbox(i, ctx);
          return Math.round(b.maxX - b.minX);
        });
    expect(width('Sofá paramétrico')).toEqual([2600, 2600]);
    expect(width('Mesa de comedor con sillas').every((w) => w >= 3600)).toBe(true);
  });

  it('la unión metálica tiene seis tornillos en la vista de la chapa y perfiles con acuerdos', () => {
    const data = createStructuralDetailTemplate();
    const hexes = ofType(data, 'lwpolyline').filter((p) => p.layer === 's-tornilleria' && p.vertices.length === 6);
    expect(hexes).toHaveLength(6);
    const profiles = ofType(data, 'hatch').filter((h) => h.layer === 's-seccion' && h.loops[0].vertices.some((v) => v.bulge));
    expect(profiles).toHaveLength(2);
  });

  it('la zapata respeta el recubrimiento de 75 mm', () => {
    const data = createFoundationDetailTemplate();
    const mat = ofType(data, 'lwpolyline').find((p) => p.layer === 's-armado' && p.vertices.length === 4)!;
    expect(mat.vertices[1].y - -2100).toBe(75);
    expect(-1000 - mat.vertices[1].x).toBe(-75);
  });

  it('las láminas A3 y A4 tienen zonas de referencia y cajetín completo', () => {
    for (const [make, cols] of [[createA3SheetTemplate, 8], [createA4SheetTemplate, 4]] as const) {
      const texts = ofType(make(), 'text').map((t) => t.text);
      expect(texts).toEqual(expect.arrayContaining(['ESCALA', 'Nº DE PLANO', 'REV.', 'PROYECCIÓN', 'A', String(cols)]));
    }
  });
});
