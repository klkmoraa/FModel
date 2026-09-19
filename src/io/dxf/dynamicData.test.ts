import { describe, expect, it } from 'vitest';
import type { DynamicBlockDefinition } from '../../document/types';
import { chunkText, decodeDefinition, encodeDefinition, instanceXdata, readInstanceXdata, readXrecord, remapStrings, xrecordBody } from './dynamicData';

const def = {
  parameters: [{ id: 'p1', type: 'linear', name: 'Ancho' }],
  actions: [{ id: 'a1', type: 'stretch', paramId: 'p1', selection: ['e1', 'e2'] }],
  constraints: [],
  lookups: [{ id: 'l1', rows: [{ label: 'A', inputs: ['600', 'BEEF'] }] }],
  variables: [],
  propertyOrder: ['p1'],
} as unknown as DynamicBlockDefinition;

describe('datos dinámicos FModel en DXF', () => {
  it('trocea texto en partes de 120 caracteres como máximo', () => {
    const parts = chunkText('á'.repeat(250));
    expect(parts.map((p) => p.length)).toEqual([120, 120, 10]);
    expect(chunkText('')).toEqual(['']);
  });

  it('sustituye solo las cadenas del mapa, en cualquier profundidad', () => {
    const out = remapStrings({ a: 'e1', b: ['e2', 'x'], c: { d: 'e1', n: 3 } }, (s) => ({ e1: 'H1', e2: 'H2' })[s]);
    expect(out).toEqual({ a: 'H1', b: ['H2', 'x'], c: { d: 'H1', n: 3 } });
  });

  it('codifica con handles y decodifica con IDs nuevos contando los que faltan', () => {
    const json = encodeDefinition(def, (id) => ({ e1: 'A1', e2: 'A2' })[id]);
    expect(json).toContain('"@H:A1"');
    const { def: back, missing } = decodeDefinition(json, (h) => (h === 'A1' ? 'n1' : undefined));
    expect((back.actions[0] as { selection: string[] }).selection).toEqual(['n1']);
    expect(missing).toBe(1);
    expect(back.parameters[0].id).toBe('p1');
    // valores de tablas con forma de handle no se tocan
    expect((back.lookups[0] as unknown as { rows: { inputs: string[] }[] }).rows[0].inputs).toEqual(['600', 'BEEF']);
  });

  it('DXF encode/decode remapea handles sin tocar valores de tabla que parezcan IDs o handles', () => {
    const tableDef = {
      parameters: [
        { id: 'p1', type: 'linear', name: 'e1' },
      ],
      actions: [
        { id: 'a1', type: 'stretch', paramId: 'p1', selection: ['e1'] },
      ],
      constraints: [
        {
          id: 'c1',
          kind: 'geometric',
          type: 'coincident',
          enabled: true,
          refs: [{ entityId: 'e1', part: 'start' }],
        },
      ],
      lookups: [
        {
          id: 'l1',
          name: 'e1',
          inputs: ['p1'],
          lookupName: 'e1',
          rows: [
            { label: 'e1', inputs: ['e1', '@H:A1', '600'] },
          ],
          reverse: false,
        },
      ],
      variables: [
        { name: 'e1', expression: 'e1 + 10', exposed: true, readOnly: false, description: 'e1' },
      ],
      propertyOrder: ['p1'],
    } as unknown as DynamicBlockDefinition;

    // e1 -> handle A1
    const json = encodeDefinition(tableDef, (id) => (id === 'e1' ? 'A1' : undefined));
    expect(json).toContain('"@H:A1"');

    // A1 -> nuevo ID n1
    const { def: back, missing } = decodeDefinition(json, (h) => (h === 'A1' ? 'n1' : undefined));
    expect(missing).toBe(0);

    // Solo selection y constraint ref cambian:
    expect((back.actions[0] as { selection: string[] }).selection).toEqual(['n1']);
    expect(back.constraints[0].refs[0].entityId).toBe('n1');

    // El resto de cadenas coincidentes permanece idéntico:
    expect(back.parameters[0].name).toBe('e1');
    expect(back.lookups[0].name).toBe('e1');
    expect(back.lookups[0].rows[0].label).toBe('e1');
    expect(back.lookups[0].rows[0].inputs).toEqual(['e1', '@H:A1', '600']);
    expect(back.variables[0].name).toBe('e1');
    expect(back.variables[0].expression).toBe('e1 + 10');
    expect(back.variables[0].description).toBe('e1');
  });

  it('XRECORD: ida y vuelta, y rechazo de versión desconocida o JSON dañado', () => {
    const json = JSON.stringify(def).repeat(1);
    const rec = { type: 'XRECORD', pairs: [[5, '1F'], [330, '1E'], [100, 'AcDbXrecord'], ...xrecordBody('Puerta', json)] as [number, string][] };
    expect(readXrecord(rec)).toEqual({ blockName: 'Puerta', json });
    expect(readXrecord({ type: 'XRECORD', pairs: [[100, 'AcDbXrecord'], [280, '1']] })).toBeNull();
    const future = { type: 'XRECORD', pairs: xrecordBody('P', json).map(([c, v]) => [c, c === 90 ? '99' : v]) as [number, string][] };
    expect(() => readXrecord(future)).toThrow(/versión/);
    const broken = { type: 'XRECORD', pairs: xrecordBody('P', '{roto') };
    expect(() => readXrecord(broken)).toThrow(/JSON/);
  });

  it('XDATA de instancia: ida y vuelta e ignora otras aplicaciones', () => {
    const state = { values: { p1: 1800 }, visibilityState: 'Toma doble' };
    const pairs: [number, string][] = [[10, '0'], [1001, 'ACAD'], [1000, 'otra'], ...instanceXdata('Panel', state)];
    expect(readInstanceXdata(pairs)).toEqual({ baseName: 'Panel', state });
    expect(readInstanceXdata([[1001, 'ACAD'], [1000, 'x']])).toBeNull();
    expect(readInstanceXdata(instanceXdata('Panel', undefined))).toEqual({ baseName: 'Panel', state: { values: {} } });
  });
});
