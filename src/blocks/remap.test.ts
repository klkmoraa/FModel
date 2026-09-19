import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type {
  CircleEntity,
  DimConstraint,
  DynamicBlockDefinition,
  DynParam,
  GeoConstraint,
  Id,
  InsertEntity,
  LineEntity,
  PolarStretchAction,
  VisibilityParam,
} from '../document/types';
import { importBlockPackage, packageBlock } from './library';
import { Editor } from '../editor/editor';
import { registerAllCommands } from '../commands/index';
import {
  remapDynamicBlockDef,
  remapDynamicInstanceState,
  remapDynamicState,
} from './remap';

const makeLinearParam = (id: string, name: string, end: { x: number; y: number } = { x: 10, y: 0 }): DynParam => ({
  id,
  type: 'linear',
  name,
  label: name,
  showInProperties: true,
  chainActions: false,
  gripCount: 1,
  base: { x: 0, y: 0 },
  end,
  baseLocation: 'start',
  valueSet: { kind: 'none' },
});

const makeVisibilityParam = (id: string, name: string, states: { name: string; visible: string[] }[]): DynParam => ({
  id,
  type: 'visibility',
  name,
  label: name,
  showInProperties: true,
  chainActions: false,
  gripCount: 1,
  position: { x: 0, y: 0 },
  states,
  defaultState: states[0]?.name ?? '',
});

const makePolarParam = (id: string, name: string): DynParam => ({
  id,
  type: 'polar',
  name,
  label: name,
  showInProperties: true,
  chainActions: false,
  gripCount: 1,
  base: { x: 0, y: 0 },
  end: { x: 10, y: 10 },
  distanceSet: { kind: 'none' },
  angleSet: { kind: 'none' },
});

describe('remapDynamicBlockDef', () => {
  it('remapea visibility.visible en estados de visibilidad', () => {
    const def: DynamicBlockDefinition = {
      parameters: [
        makeVisibilityParam('p_vis', 'Visibilidad', [
          { name: 'Estado 1', visible: ['ent_1', 'ent_2'] },
          { name: 'Estado 2', visible: ['ent_2', 'ent_3'] },
        ]),
      ],
      actions: [],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: ['p_vis'],
    };

    const map = new Map<Id, Id>([
      ['ent_1', 'new_1'],
      ['ent_2', 'new_2'],
      ['ent_3', 'new_3'],
    ]);

    const result = remapDynamicBlockDef(def, map);
    const visParam = result.parameters[0] as VisibilityParam;

    expect(visParam.states[0].visible).toEqual(['new_1', 'new_2']);
    expect(visParam.states[1].visible).toEqual(['new_2', 'new_3']);
    // Inmutabilidad del objeto original
    expect((def.parameters[0] as VisibilityParam).states[0].visible).toEqual(['ent_1', 'ent_2']);
  });

  it('remapea action.selection en acciones', () => {
    const def: DynamicBlockDefinition = {
      parameters: [makeLinearParam('p_lin', 'Distancia')],
      actions: [
        { id: 'act_move', type: 'move', name: 'Mover', paramId: 'p_lin', selection: ['ent_10', 'ent_20'], paramPoint: 'end', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
      ],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: ['p_lin'],
    };

    const map = new Map<Id, Id>([
      ['ent_10', 'new_10'],
      ['ent_20', 'new_20'],
    ]);

    const result = remapDynamicBlockDef(def, map);
    expect(result.actions[0].selection).toEqual(['new_10', 'new_20']);
  });

  it('remapea polarstretch.rotateOnly en acciones de estiramiento polar', () => {
    const def: DynamicBlockDefinition = {
      parameters: [makePolarParam('p_pol', 'Polar')],
      actions: [
        {
          id: 'act_pstretch',
          type: 'polarstretch',
          name: 'Estiramiento polar',
          paramId: 'p_pol',
          selection: ['ent_1', 'ent_2'],
          rotateOnly: ['ent_2', 'ent_3'],
          paramPoint: 'end',
          frame: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
        } as PolarStretchAction,
      ],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: ['p_pol'],
    };

    const map = new Map<Id, Id>([
      ['ent_1', 'new_1'],
      ['ent_2', 'new_2'],
      ['ent_3', 'new_3'],
    ]);

    const result = remapDynamicBlockDef(def, map);
    const act = result.actions[0] as PolarStretchAction;
    expect(act.selection).toEqual(['new_1', 'new_2']);
    expect(act.rotateOnly).toEqual(['new_2', 'new_3']);
  });

  it('remapea constraint.refs.entityId en restricciones geométricas y dimensionales', () => {
    const def: DynamicBlockDefinition = {
      parameters: [],
      actions: [],
      constraints: [
        {
          id: 'c_geo',
          kind: 'geometric',
          type: 'coincident',
          enabled: true,
          refs: [
            { entityId: 'ent_a', part: 'start' },
            { entityId: 'ent_b', part: 'end' },
          ],
        } as GeoConstraint,
        {
          id: 'c_dim',
          kind: 'dimensional',
          type: 'aligned',
          name: 'd1',
          expression: '100',
          isParameter: true,
          valueSet: { kind: 'none' },
          refs: [
            { entityId: 'ent_a', part: 'start' },
            { entityId: 'ent_b', part: 'center' },
          ],
        } as DimConstraint,
      ],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };

    const map = new Map<Id, Id>([
      ['ent_a', 'new_a'],
      ['ent_b', 'new_b'],
    ]);

    const result = remapDynamicBlockDef(def, map);
    expect(result.constraints[0].refs.map((r) => r.entityId)).toEqual(['new_a', 'new_b']);
    expect(result.constraints[1].refs.map((r) => r.entityId)).toEqual(['new_a', 'new_b']);
  });

  it('preserva intacto texto/fórmulas/etiquetas aunque coincidan con el ID de una entidad', () => {
    // Si un ID es 'e1', las referencias de entidad deben cambiar a 'new_e1',
    // pero el texto en name, label, expression, lookup inputs y variables NUNCA debe cambiar.
    const def: DynamicBlockDefinition = {
      parameters: [
        makeLinearParam('p1', 'e1'),
        {
          id: 'p_flip',
          type: 'flip',
          name: 'Flip',
          label: 'e1',
          showInProperties: true,
          chainActions: false,
          gripCount: 1,
          base: { x: 0, y: 0 },
          end: { x: 0, y: 10 },
          labelNotFlipped: 'e1',
          labelFlipped: 'e1',
        },
        makeVisibilityParam('p_vis', 'Vis', [{ name: 'e1', visible: ['e1'] }]),
      ],
      actions: [
        { id: 'a1', type: 'stretch', name: 'e1', paramId: 'p1', selection: ['e1'], paramPoint: 'end', frame: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
      ],
      constraints: [
        {
          id: 'c1',
          kind: 'dimensional',
          type: 'aligned',
          name: 'e1',
          expression: 'e1 + 25',
          isParameter: true,
          valueSet: { kind: 'none' },
          refs: [{ entityId: 'e1', part: 'start' }],
        } as DimConstraint,
      ],
      lookups: [
        {
          id: 'l1',
          name: 'e1',
          inputs: ['p1'],
          lookupName: 'e1',
          rows: [
            { label: 'e1', inputs: ['e1', 100] },
          ],
          reverse: false,
        },
      ],
      variables: [
        { name: 'e1', expression: 'e1 * 2', exposed: true, readOnly: false, description: 'e1 description' },
      ],
      propertyOrder: ['p1'],
    };

    const map = new Map<Id, Id>([['e1', 'new_e1']]);

    const result = remapDynamicBlockDef(def, map);

    // Solo los campos de referencia a entidades deben haber cambiado:
    expect((result.parameters[2] as VisibilityParam).states[0].visible).toEqual(['new_e1']);
    expect(result.actions[0].selection).toEqual(['new_e1']);
    expect(result.constraints[0].refs[0].entityId).toBe('new_e1');

    // Todo el resto de cadenas coincidentes debe permanecer intacto:
    expect(result.parameters[0].name).toBe('e1');
    expect(result.parameters[1].label).toBe('e1');
    expect((result.parameters[2] as VisibilityParam).states[0].name).toBe('e1');
    expect(result.actions[0].name).toBe('e1');
    expect((result.constraints[0] as DimConstraint).name).toBe('e1');
    expect((result.constraints[0] as DimConstraint).expression).toBe('e1 + 25');
    expect(result.lookups[0].name).toBe('e1');
    expect(result.lookups[0].lookupName).toBe('e1');
    expect(result.lookups[0].rows[0].label).toBe('e1');
    expect(result.lookups[0].rows[0].inputs).toEqual(['e1', 100]);
    expect(result.variables[0].name).toBe('e1');
    expect(result.variables[0].expression).toBe('e1 * 2');
    expect(result.variables[0].description).toBe('e1 description');
  });

  describe('manejo de referencias faltantes', () => {
    const def: DynamicBlockDefinition = {
      parameters: [
        makeVisibilityParam('p_vis', 'Vis', [{ name: 'S1', visible: ['e1', 'e_missing'] }]),
      ],
      actions: [
        { id: 'a1', type: 'move', name: 'Move', paramId: 'p_vis', selection: ['e1', 'e_missing'], paramPoint: 'base', axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
      ],
      constraints: [
        {
          id: 'c1',
          kind: 'geometric',
          type: 'fixed',
          enabled: true,
          refs: [{ entityId: 'e_missing', part: 'start' }],
        } as GeoConstraint,
      ],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };

    it('missingPolicy: "keep" conserva el ID original y emite advertencias opcionales', () => {
      const warnings: string[] = [];
      const reported: { ref: string; kind: string }[] = [];

      const result = remapDynamicBlockDef(
        def,
        new Map([['e1', 'new_1']]),
        {
          missingPolicy: 'keep',
          warnings,
          onMissing: (ref, ctx) => reported.push({ ref, kind: ctx.kind }),
        },
      );

      expect((result.parameters[0] as VisibilityParam).states[0].visible).toEqual(['new_1', 'e_missing']);
      expect(result.actions[0].selection).toEqual(['new_1', 'e_missing']);
      expect(result.constraints[0].refs[0].entityId).toBe('e_missing');
      expect(warnings.length).toBe(3);
      expect(reported.map((r) => r.ref)).toEqual(['e_missing', 'e_missing', 'e_missing']);
    });

    it('missingPolicy: "omit" descarta de listas y vacía en constraints', () => {
      let missingCount = 0;
      const result = remapDynamicBlockDef(
        def,
        (id) => (id === 'e1' ? 'new_1' : undefined),
        {
          missingPolicy: 'omit',
          onMissing: () => { missingCount++; },
        },
      );

      expect((result.parameters[0] as VisibilityParam).states[0].visible).toEqual(['new_1']);
      expect(result.actions[0].selection).toEqual(['new_1']);
      expect(result.constraints[0].refs[0].entityId).toBe('');
      expect(missingCount).toBe(3);
    });

    it('missingPolicy: "error" lanza error descriptivo si falta una referencia', () => {
      expect(() => {
        remapDynamicBlockDef(
          def,
          new Map([['e1', 'new_1']]),
          { missingPolicy: 'error' },
        );
      }).toThrow(/Referencia no encontrada: «e_missing»/);
    });
  });

  it('remapea parámetros y tablas si se proporcionan paramMap y tableMap', () => {
    const def: DynamicBlockDefinition = {
      parameters: [
        makeLinearParam('p_old', 'Ancho'),
        {
          id: 'p_look',
          type: 'lookup',
          name: 'Tabla',
          label: 'Tabla',
          showInProperties: true,
          chainActions: false,
          gripCount: 1,
          position: { x: 0, y: 0 },
          tableId: 't_old',
        },
      ],
      actions: [
        { id: 'a1', type: 'lookup', name: 'Lookup', paramId: 'p_old', selection: ['p_old'], tableId: 't_old' },
      ],
      constraints: [],
      lookups: [
        { id: 't_old', name: 'Tabla', inputs: ['p_old'], lookupName: 'Tipo', rows: [{ label: 'A', inputs: [10] }], reverse: false },
      ],
      variables: [],
      propertyOrder: ['p_old'],
    };

    const result = remapDynamicBlockDef(def, new Map(), {
      paramMap: new Map([['p_old', 'p_new']]),
      tableMap: new Map([['t_old', 't_new']]),
    });

    expect(result.parameters[0].id).toBe('p_new');
    expect((result.parameters[1] as { tableId: string }).tableId).toBe('t_new');
    expect(result.actions[0].paramId).toBe('p_new');
    expect((result.actions[0] as { tableId: string }).tableId).toBe('t_new');
    expect(result.actions[0].selection).toEqual(['p_new']);
    expect(result.lookups[0].id).toBe('t_new');
    expect(result.lookups[0].inputs).toEqual(['p_new']);
    expect(result.propertyOrder).toEqual(['p_new']);
  });

  describe('acciones encadenadas y parámetros en selecciones', () => {
    const chainedDef: DynamicBlockDefinition = {
      parameters: [
        makeLinearParam('p_chain', 'Offset'),
      ],
      actions: [
        {
          id: 'a1',
          type: 'move',
          name: 'Move',
          paramId: 'p_chain',
          selection: ['ent_1', 'p_chain'],
          paramPoint: 'end',
          axis: 'xy',
          distanceMultiplier: 1,
          angleOffset: 0,
        },
      ],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: ['p_chain'],
    };

    it('no trata parámetros de la definición como entidades faltantes en selection', () => {
      const warnings: string[] = [];
      let missingCount = 0;

      // missingPolicy: "error" NO debe lanzar error por p_chain
      const resultError = remapDynamicBlockDef(
        chainedDef,
        new Map([['ent_1', 'ent_new']]),
        {
          missingPolicy: 'error',
          warnings,
          onMissing: () => missingCount++,
        },
      );
      expect(resultError.actions[0].selection).toEqual(['ent_new', 'p_chain']);
      expect(warnings).toHaveLength(0);
      expect(missingCount).toBe(0);

      // missingPolicy: "omit" NO debe descartar p_chain
      const resultOmit = remapDynamicBlockDef(
        chainedDef,
        new Map([['ent_1', 'ent_new']]),
        {
          missingPolicy: 'omit',
        },
      );
      expect(resultOmit.actions[0].selection).toEqual(['ent_new', 'p_chain']);
    });

    it('remapea el parámetro encadenado en selection si se provee paramMap', () => {
      const result = remapDynamicBlockDef(
        chainedDef,
        new Map([['ent_1', 'ent_new']]),
        {
          paramMap: new Map([['p_chain', 'p_chain_renamed']]),
          missingPolicy: 'error',
        },
      );
      expect(result.actions[0].selection).toEqual(['ent_new', 'p_chain_renamed']);
      expect(result.parameters[0].id).toBe('p_chain_renamed');
      expect(result.actions[0].paramId).toBe('p_chain_renamed');
    });
  });

  describe('soporte de Record<Id, Id> como IdResolver', () => {
    it('admite objetos Record en vez de Map para entityResolver y paramMap', () => {
      const def: DynamicBlockDefinition = {
        parameters: [makeLinearParam('p1', 'Largo')],
        actions: [
          { id: 'a1', type: 'stretch', name: 'S', paramId: 'p1', selection: ['e1'], paramPoint: 'end', frame: [{ x: 0, y: 0 }, { x: 10, y: 10 }], axis: 'x', distanceMultiplier: 1, angleOffset: 0 },
        ],
        constraints: [],
        lookups: [],
        variables: [],
        propertyOrder: ['p1'],
      };

      const result = remapDynamicBlockDef(
        def,
        { e1: 'e_record' },
        { paramMap: { p1: 'p_record' } },
      );

      expect(result.actions[0].selection).toEqual(['e_record']);
      expect(result.parameters[0].id).toBe('p_record');
      expect(result.actions[0].paramId).toBe('p_record');
    });
  });

  describe('tolerancia a entradas nulas o malformadas', () => {
    it('remapDynamicBlockDef maneja valores no-objeto sin lanzar excepción', () => {
      expect(remapDynamicBlockDef(null as unknown as DynamicBlockDefinition, new Map())).toBeNull();
      expect(remapDynamicBlockDef(undefined as unknown as DynamicBlockDefinition, new Map())).toBeUndefined();
    });

    it('remapDynamicState y remapDynamicInstanceState toleran entradas nulas', () => {
      expect(remapDynamicState(null as unknown as any, new Map())).toBeNull();
      expect(() => remapDynamicInstanceState(null as unknown as any, new Map())).not.toThrow();
      expect(() => remapDynamicInstanceState({} as InsertEntity, new Map())).not.toThrow();
    });
  });
});

describe('remapDynamicInstanceState y remapDynamicState', () => {
  it('remapea las claves de valores de parámetros en InsertEntity.dynamic', () => {
    const doc = createDocument();
    const insert: InsertEntity = {
      ...entityDefaults(doc),
      order: 1,
      id: 'ins_1',
      type: 'insert',
      blockId: 'blk_1',
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      attributes: [],
      dynamic: {
        values: {
          param_1: 1500,
          param_2: 'Opcion A',
        },
      },
    };

    const paramMap = new Map<Id, Id>([
      ['param_1', 'new_p1'],
      ['param_2', 'new_p2'],
    ]);

    remapDynamicInstanceState(insert, paramMap);
    expect(insert.dynamic?.values).toEqual({
      new_p1: 1500,
      new_p2: 'Opcion A',
    });
  });

  it('remapDynamicState es puro y conserva valores no mapeados', () => {
    const state = {
      values: { p1: 100, p2: 200 },
      visibilityState: 'Activo',
    };
    const mapped = remapDynamicState(state, new Map([['p1', 'p1_new']]));
    expect(mapped.values).toEqual({ p1_new: 100, p2: 200 });
    expect(mapped.visibilityState).toBe('Activo');
    expect(state.values).toEqual({ p1: 100, p2: 200 });
  });
});

describe('Integración con importBlockPackage', () => {
  it('conserva dinámicos y remapea entidades correctamente al instalar paquete de biblioteca', () => {
    const doc = createDocument();
    let rootBlockId = '';

    doc.transact('seed', (tx) => {
      const blkId = 'blk_orig';
      rootBlockId = blkId;
      tx.add('blocks', {
        id: blkId,
        name: 'BloqueDinamico',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: '',
        units: 'mm',
        explodable: true,
        scaleUniformly: false,
        annotative: false,
        revision: 1,
      });

      const lineId = 'line_1';
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, blkId),
        id: lineId,
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      const circleId = 'circle_1';
      tx.addEntity<CircleEntity>({
        ...entityDefaults(doc, blkId),
        id: circleId,
        type: 'circle',
        center: { x: 50, y: 50 },
        radius: 25,
      });

      const dynDef: DynamicBlockDefinition = {
        parameters: [
          makeLinearParam('p_lin', 'Largo', { x: 100, y: 0 }),
          makeVisibilityParam('p_vis', 'Vis', [{ name: 'S1', visible: [lineId, circleId] }]),
        ],
        actions: [
          { id: 'a_stretch', type: 'stretch', name: 'Estirar', paramId: 'p_lin', selection: [lineId], paramPoint: 'end', frame: [{ x: 50, y: -10 }, { x: 110, y: -10 }, { x: 110, y: 10 }], axis: 'x', distanceMultiplier: 1, angleOffset: 0 },
        ],
        constraints: [],
        lookups: [],
        variables: [],
        propertyOrder: ['p_lin'],
      };

      tx.update('blocks', blkId, { dynamic: dynDef });
    });

    const pkg = packageBlock(doc, rootBlockId);

    // Instalar en un documento destino
    const targetDoc = createDocument();
    const installedName = importBlockPackage(targetDoc, pkg);

    const installedBlock = targetDoc.findByName('blocks', installedName);
    expect(installedBlock).toBeDefined();
    expect(installedBlock?.dynamic).toBeDefined();

    const installedEntities = targetDoc.entitiesOf(installedBlock!.id);
    expect(installedEntities).toHaveLength(2);

    const newEntityIds = new Set(installedEntities.map((e) => e.id));
    // Los IDs originales no deben existir en el nuevo bloque
    expect(newEntityIds.has('line_1')).toBe(false);
    expect(newEntityIds.has('circle_1')).toBe(false);

    // Las referencias dinámicas deben apuntar a los nuevos IDs
    const dyn = installedBlock!.dynamic!;
    const visParam = dyn.parameters.find((p) => p.type === 'visibility') as VisibilityParam;
    for (const id of visParam.states[0].visible) {
      expect(newEntityIds.has(id)).toBe(true);
    }

    const stretchAct = dyn.actions.find((a) => a.type === 'stretch')!;
    for (const id of stretchAct.selection) {
      expect(newEntityIds.has(id)).toBe(true);
    }
  });
});

describe('BSAVEAS conserva definición funcional y no corrompe texto', () => {
  it('ejecuta BSAVEAS remapeando entidades y conservando nombres y expresiones coincidentes', async () => {
    registerAllCommands();
    const editor = new Editor(createDocument());
    const doc = editor.doc;

    const origBlockId = 'blk_puerta_orig';
    const lineId = 'line_coincidente';

    doc.transact('seed', (tx) => {
      tx.add('blocks', {
        id: origBlockId,
        name: 'PuertaBase',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: '',
        units: 'mm',
        explodable: true,
        scaleUniformly: false,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            makeLinearParam('p1', lineId, { x: 900, y: 0 }),
          ],
          actions: [
            { id: 'a1', type: 'stretch', name: lineId, paramId: 'p1', selection: [lineId], paramPoint: 'end', frame: [{ x: 800, y: -10 }, { x: 1000, y: 10 }], axis: 'x', distanceMultiplier: 1, angleOffset: 0 },
          ],
          constraints: [
            {
              id: 'c1',
              kind: 'dimensional',
              type: 'aligned',
              name: lineId,
              expression: `${lineId} * 1.5`,
              isParameter: true,
              valueSet: { kind: 'none' },
              refs: [{ entityId: lineId, part: 'end' }],
            } as DimConstraint,
          ],
          lookups: [],
          variables: [{ name: lineId, expression: '500', exposed: true, readOnly: false }],
          propertyOrder: ['p1'],
        },
      });

      tx.addEntity<LineEntity>({
        ...entityDefaults(doc, origBlockId),
        id: lineId,
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 900, y: 0 },
      });
    });

    // Abrir BEDIT en PuertaBase
    await editor.runner.execute('BEDIT', ['PuertaBase']);
    expect(editor.blockEdit?.blockId).toBe(origBlockId);

    // Ejecutar BSAVEAS con nuevo nombre 'PuertaCopia'
    await editor.runner.script('BSAVEAS', ['PuertaCopia']);

    const newBlock = doc.findByName('blocks', 'PuertaCopia')!;
    expect(newBlock).toBeDefined();
    expect(newBlock.id).not.toBe(origBlockId);
    expect(newBlock.dynamic).toBeDefined();

    const newEntities = doc.entitiesOf(newBlock.id);
    expect(newEntities).toHaveLength(1);
    const newEntityId = newEntities[0].id;
    expect(newEntityId).not.toBe(lineId);

    const dyn = newBlock.dynamic!;
    // Las referencias deben apuntar al nuevo ID
    expect(dyn.actions[0].selection).toEqual([newEntityId]);
    expect(dyn.constraints[0].refs[0].entityId).toBe(newEntityId);

    // Texto, nombres y fórmulas que coincidían con el ID de entidad original deben permanecer intactos:
    expect(dyn.parameters[0].name).toBe(lineId);
    expect(dyn.actions[0].name).toBe(lineId);
    expect((dyn.constraints[0] as DimConstraint).name).toBe(lineId);
    expect((dyn.constraints[0] as DimConstraint).expression).toBe(`${lineId} * 1.5`);
    expect(dyn.variables[0].name).toBe(lineId);
  });
});
