import { describe, expect, it } from 'vitest';
import { createDocument, entityDefaults } from '../document/defaults';
import type {
  ArcEntity,
  ArrayEntity,
  AssetRecord,
  DimensionEntity,
  HatchEntity,
  ImageEntity,
  InsertEntity,
  LineEntity,
  MLeaderEntity,
  MLineEntity,
  TextEntity,
} from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import {
  ClipboardError,
  createClipboardPackage,
  parseClipboardPackage,
  pasteClipboardPackage,
  validateClipboardPackage,
} from './clipboard';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('portapapeles portable (DAT-002)', () => {
  it('copia y pega bloque anidado entre dos documentos sin perder definiciones ni dejar referencias rotas', () => {
    const srcDoc = createDocument({ title: 'Origen' });
    const dstDoc = createDocument({ title: 'Destino' });

    // En srcDoc creamos bloque "Hijo" con una línea, y bloque "Padre" con un insert de "Hijo"
    srcDoc.transact('CREA_BLOQUES', (tx) => {
      tx.add('blocks', {
        id: 'blk_hijo',
        name: 'Hijo',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Bloque hijo',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_hijo',
        type: 'line',
        owner: 'blk_hijo',
        start: { x: 0, y: 0 },
        end: { x: 5, y: 5 },
      });

      tx.add('blocks', {
        id: 'blk_padre',
        name: 'Padre',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Bloque padre',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_hijo',
        type: 'insert',
        owner: 'blk_padre',
        blockId: 'blk_hijo',
        position: { x: 2, y: 2 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });

      // Insert de Padre en el espacio modelo
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_padre',
        type: 'insert',
        owner: MODEL_SPACE_ID,
        blockId: 'blk_padre',
        position: { x: 10, y: 10 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ins_padre']);
    expect(pkg.entities.length).toBe(1);
    expect(pkg.blocks?.length).toBe(2); // Padre e Hijo transitivo
    expect(pkg.blocks?.map((b) => b.name).sort()).toEqual(['Hijo', 'Padre']);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 50, y: 50 });
    expect(res.insertedIds.length).toBe(1);

    const pastedInsert = dstDoc.entity(res.insertedIds[0]) as InsertEntity;
    expect(pastedInsert.type).toBe('insert');
    expect(dstDoc.data.blocks.has(pastedInsert.blockId)).toBe(true);

    const pastedPadre = dstDoc.data.blocks.get(pastedInsert.blockId)!;
    expect(pastedPadre.name).toBe('Padre');

    // Comprobar que las entidades internas del bloque Padre apuntan al bloque Hijo importado
    const padreEntities = dstDoc.entitiesOf(pastedPadre.id);
    expect(padreEntities.length).toBe(1);
    const nestedInsert = padreEntities[0] as InsertEntity;
    expect(nestedInsert.type).toBe('insert');
    expect(dstDoc.data.blocks.has(nestedInsert.blockId)).toBe(true);
    expect(dstDoc.data.blocks.get(nestedInsert.blockId)?.name).toBe('Hijo');
  });

  it('copia imagen con recurso binario (asset dataUrl) y la preserva en el documento de destino', () => {
    const srcDoc = createDocument({ title: 'Origen con imagen' });
    const dstDoc = createDocument({ title: 'Destino sin imagen' });

    srcDoc.transact('CREA_IMAGEN', (tx) => {
      tx.add('assets', {
        id: 'ast_logo',
        name: 'logo.png',
        mime: 'image/png',
        size: 70,
        dataUrl: PNG,
      } as AssetRecord);

      tx.addEntity<ImageEntity>({
        ...entityDefaults(srcDoc),
        id: 'img1',
        type: 'image',
        owner: MODEL_SPACE_ID,
        assetId: 'ast_logo',
        position: { x: 0, y: 0 },
        u: { x: 10, y: 0 },
        v: { x: 0, y: 10 },
        clipEnabled: false,
        opacity: 1,
        fade: 0,
        brightness: 50,
        contrast: 50,
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['img1']);
    expect(pkg.assets?.length).toBe(1);
    expect(pkg.assets?.[0].dataUrl).toBe(PNG);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 100, y: 100 });
    expect(res.insertedIds.length).toBe(1);

    const pastedImg = dstDoc.entity(res.insertedIds[0]) as ImageEntity;
    expect(pastedImg.type).toBe('image');
    expect(dstDoc.data.assets.has(pastedImg.assetId)).toBe(true);
    expect(dstDoc.data.assets.get(pastedImg.assetId)?.dataUrl).toBe(PNG);
  });

  it('copia texto con estilo propio y crea o reutiliza el estilo en destino', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_ESTILO', (tx) => {
      tx.add('textStyles', {
        id: 'ts_arquitectura',
        name: 'Arquitectura',
        font: 'Architectural',
        height: 2.5,
        widthFactor: 0.9,
        oblique: 0.1,
        annotative: false,
      });

      tx.addEntity<TextEntity>({
        ...entityDefaults(srcDoc),
        id: 'txt1',
        type: 'text',
        owner: MODEL_SPACE_ID,
        style: 'ts_arquitectura',
        text: 'Planta baja',
        position: { x: 10, y: 10 },
        height: 2.5,
        rotation: 0,
        widthFactor: 0.9,
        oblique: 0.1,
        halign: 'left',
        valign: 'baseline',
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['txt1']);
    expect(pkg.textStyles?.some((s) => s.name === 'Arquitectura')).toBe(true);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 20, y: 20 });
    const pastedText = dstDoc.entity(res.insertedIds[0]) as TextEntity;
    expect(dstDoc.data.textStyles.has(pastedText.style)).toBe(true);
    expect(dstDoc.data.textStyles.get(pastedText.style)?.name).toBe('Arquitectura');

    // Si pegamos otra vez, no debe crear un estilo duplicado
    const initialStylesCount = dstDoc.data.textStyles.size;
    const res2 = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 30, y: 30 });
    expect(dstDoc.data.textStyles.size).toBe(initialStylesCount);
    const pastedText2 = dstDoc.entity(res2.insertedIds[0]) as TextEntity;
    expect(pastedText2.style).toBe(pastedText.style);
  });

  it('copia cota y gestiona asociatividad y estilo de cota dependiente', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_COTA', (tx) => {
      tx.add('dimStyles', {
        ...srcDoc.data.dimStyles.get('standard')!,
        id: 'ds_muro',
        name: 'MuroDetalle',
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_muro',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
      tx.addEntity<DimensionEntity>({
        ...entityDefaults(srcDoc),
        id: 'dim1',
        type: 'dimension',
        dimType: 'linear',
        style: 'ds_muro',
        overrides: {},
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        p3: { x: 50, y: 10 },
        rotation: 0,
        assoc: [
          { point: 'p1', entityId: 'l_muro', snap: 'endpoint-start' },
          { point: 'p2', entityId: 'l_muro', snap: 'endpoint-end' },
        ],
      });
    });

    // Caso A: copiamos sólo la cota (sin la línea de referencia). La cota pegada no debe conservar referencias huérfanas
    const pkgSoloDim = createClipboardPackage(srcDoc, ['dim1']);
    const resA = pasteClipboardPackage(dstDoc, pkgSoloDim, MODEL_SPACE_ID, { x: 10, y: 10 });
    const pastedDimA = dstDoc.entity(resA.insertedIds[0]) as DimensionEntity;
    expect(pastedDimA.assoc).toBeUndefined(); // no conserva referencias inexistentes
    expect(dstDoc.data.dimStyles.get(pastedDimA.style)?.name).toBe('MuroDetalle');

    // Caso B: copiamos cota Y la línea de referencia. La asociatividad debe remapearse a la nueva entidad pegada
    const pkgBoth = createClipboardPackage(srcDoc, ['dim1', 'l_muro']);
    const resB = pasteClipboardPackage(dstDoc, pkgBoth, MODEL_SPACE_ID, { x: 20, y: 20 });
    expect(resB.insertedIds.length).toBe(2);
    const pastedDimB = resB.insertedIds.map((id) => dstDoc.entity(id)).find((e) => e?.type === 'dimension') as DimensionEntity;
    const pastedLineB = resB.insertedIds.map((id) => dstDoc.entity(id)).find((e) => e?.type === 'line') as LineEntity;
    expect(pastedDimB.assoc).toBeDefined();
    expect(pastedDimB.assoc![0].entityId).toBe(pastedLineB.id);
    expect(pastedDimB.assoc![1].entityId).toBe(pastedLineB.id);
  });

  it('copia matriz asociativa (array) preservando su bloque fuente', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_ARRAY', (tx) => {
      tx.add('blocks', {
        id: '*U1',
        name: '*U1',
        kind: 'anonymous',
        basePoint: { x: 0, y: 0 },
        description: 'Fuente de matriz',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<ArcEntity>({
        ...entityDefaults(srcDoc),
        id: 'arc_src',
        type: 'arc',
        owner: '*U1',
        center: { x: 0, y: 0 },
        radius: 10,
        startAngle: 0,
        endAngle: Math.PI,
      });
      tx.addEntity<ArrayEntity>({
        ...entityDefaults(srcDoc),
        id: 'arr1',
        type: 'array',
        sourceBlockId: '*U1',
        basePoint: { x: 0, y: 0 },
        params: {
          kind: 'rect',
          columns: 3,
          rows: 2,
          columnSpacing: 15,
          rowSpacing: 15,
          angle: 0,
        },
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['arr1']);
    expect(pkg.blocks?.some((b) => b.id === '*U1')).toBe(true);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 50, y: 50 });
    const pastedArr = dstDoc.entity(res.insertedIds[0]) as ArrayEntity;
    expect(pastedArr.type).toBe('array');
    expect(dstDoc.data.blocks.has(pastedArr.sourceBlockId)).toBe(true);
    const arrBlockEnts = dstDoc.entitiesOf(pastedArr.sourceBlockId);
    expect(arrBlockEnts.length).toBe(1);
    expect(arrBlockEnts[0].type).toBe('arc');
  });

  it('pegar dos veces no duplica definiciones equivalentes ni estilos', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_BLOQUE', (tx) => {
      tx.add('blocks', {
        id: 'blk_silla',
        name: 'Silla',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Silla de oficina',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_silla',
        type: 'line',
        owner: 'blk_silla',
        start: { x: 0, y: 0 },
        end: { x: 40, y: 40 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_silla',
        type: 'insert',
        blockId: 'blk_silla',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ins_silla']);
    pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 10, y: 10 });
    const blocksAfterFirst = dstDoc.data.blocks.size;

    pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 50, y: 50 });
    const blocksAfterSecond = dstDoc.data.blocks.size;

    expect(blocksAfterSecond).toBe(blocksAfterFirst);
  });

  it('mantiene compatibilidad de lectura con paquetes heredados fmodel-clip (formato plano sin version)', () => {
    const dstDoc = createDocument();
    const legacy = {
      format: 'fmodel-clip',
      entities: [
        {
          ...entityDefaults(dstDoc),
          id: 'old1',
          type: 'line',
          layer: 'inexistente',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
        },
      ],
    };

    const pkg = parseClipboardPackage(JSON.stringify(legacy));
    expect(pkg.entities.length).toBe(1);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 10, y: 10 });
    expect(res.insertedIds.length).toBe(1);
    const pasted = dstDoc.entity(res.insertedIds[0]) as LineEntity;
    // Si la capa inexistente no venía empaquetada, debe caer en currentLayer
    expect(pasted.layer).toBe(dstDoc.settings.currentLayer);
  });

  it('rechaza entradas alteradas o que excedan límites sin modificar el dibujo', () => {
    const dstDoc = createDocument();
    const entitiesCountBefore = dstDoc.data.entities.size;

    // NaN en posición
    const corruptedNan = {
      format: 'fmodel-clip',
      version: 2,
      base: { x: NaN, y: 0 },
      entities: [],
    };
    expect(() => validateClipboardPackage(corruptedNan)).toThrow();

    // Formato inválido
    expect(() => parseClipboardPackage('not json')).toThrow();
    expect(() => parseClipboardPackage(JSON.stringify({ format: 'otro' }))).toThrow();

    // El dibujo destino sigue intacto
    expect(dstDoc.data.entities.size).toBe(entitiesCountBefore);
  });

  it('resuelve colisión de nombres creando sufijo cuando la definición no es equivalente geométricamente', () => {
    const dstDoc = createDocument({ title: 'Destino con silla pequeña' });
    const srcDoc = createDocument({ title: 'Origen con silla grande' });

    // En dstDoc creamos bloque "Silla" con línea pequeña (0,0) -> (10,10)
    dstDoc.transact('CREA_SILLA_CHICA', (tx) => {
      tx.add('blocks', {
        id: 'blk_silla_chica',
        name: 'Silla',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Silla chica',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(dstDoc),
        id: 'l_chica',
        type: 'line',
        owner: 'blk_silla_chica',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 10 },
      });
    });

    // En srcDoc creamos bloque "Silla" con línea grande (0,0) -> (500,500)
    srcDoc.transact('CREA_SILLA_GRANDE', (tx) => {
      tx.add('blocks', {
        id: 'blk_silla_grande',
        name: 'Silla',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Silla grande',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_grande',
        type: 'line',
        owner: 'blk_silla_grande',
        start: { x: 0, y: 0 },
        end: { x: 500, y: 500 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_silla_grande',
        type: 'insert',
        blockId: 'blk_silla_grande',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ins_silla_grande']);
    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 20, y: 20 });
    expect(res.insertedIds.length).toBe(1);

    // Debe conservar el bloque original intacto con su línea pequeña
    const originalBlock = dstDoc.findByName('blocks', 'Silla')!;
    expect(originalBlock.id).toBe('blk_silla_chica');
    const chicaEntities = dstDoc.entitiesOf('blk_silla_chica') as LineEntity[];
    expect(chicaEntities[0].end).toEqual({ x: 10, y: 10 });

    // Debe haber creado un nuevo bloque con sufijo 'Silla (2)' para la geometría grande
    const newBlock = dstDoc.findByName('blocks', 'Silla (2)')!;
    expect(newBlock).toBeDefined();
    const grandeEntities = dstDoc.entitiesOf(newBlock.id) as LineEntity[];
    expect(grandeEntities[0].end).toEqual({ x: 500, y: 500 });

    // La entidad insert pegada debe apuntar a 'Silla (2)'
    const pastedInsert = dstDoc.entity(res.insertedIds[0]) as InsertEntity;
    expect(pastedInsert.blockId).toBe(newBlock.id);
  });

  it('copia bloque dinámico y remapea identificadores internos de entidades en dynamic', () => {
    const srcDoc = createDocument({ title: 'Origen dinámico' });
    const dstDoc = createDocument({ title: 'Destino' });

    srcDoc.transact('CREA_DINAMICO', (tx) => {
      tx.add('blocks', {
        id: 'blk_dyn',
        name: 'PuertaDinamica',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Puerta con apertura dinámica',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'p_ancho', name: 'Ancho', type: 'linear', basePoint: { x: 0, y: 0 }, endPoint: { x: 90, y: 0 } } as any,
          ],
          actions: [
            { id: 'act_stretch', type: 'stretch', name: 'Estirar', paramId: 'p_ancho', selection: ['l_hoja'] } as any,
          ],
          constraints: [],
          lookups: [],
          variables: [],
          propertyOrder: [],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_hoja',
        type: 'line',
        owner: 'blk_dyn',
        start: { x: 0, y: 0 },
        end: { x: 90, y: 0 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_dyn',
        type: 'insert',
        blockId: 'blk_dyn',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ins_dyn']);
    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 0, y: 0 });
    const pastedInsert = dstDoc.entity(res.insertedIds[0]) as InsertEntity;
    const pastedBlock = dstDoc.data.blocks.get(pastedInsert.blockId)!;
    const pastedEntities = dstDoc.entitiesOf(pastedBlock.id);

    // El dynamic debe apuntar al ID de la nueva entidad interna del bloque, no a 'l_hoja'
    expect(pastedBlock.dynamic?.actions[0].selection[0]).toBe(pastedEntities[0].id);
    expect(pastedBlock.dynamic?.actions[0].selection[0]).not.toBe('l_hoja');
  });

  it('arremete ClipboardError ante valores numéricos no finitos', () => {
    const invalidPackage = {
      format: 'fmodel-clip',
      version: 2,
      base: { x: 0, y: 0 },
      entities: [
        {
          id: 'bad',
          type: 'line',
          start: { x: Infinity, y: 0 },
          end: { x: 1, y: 1 },
        },
      ],
    };
    expect(() => validateClipboardPackage(invalidPackage)).toThrowError(ClipboardError);
  });

  it('remapea de forma tipada selection, rotateOnly y constraints en bloques dinámicos', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_DIN_AVANZADO', (tx) => {
      tx.add('blocks', {
        id: 'blk_dyn_adv',
        name: 'PuertaAvanzada',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Puerta polar con restricción',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'p_vis', name: 'Visibilidad', type: 'visibility', position: { x: 0, y: 0 }, defaultState: 'S1', states: [{ name: 'S1', visible: ['l_hoja_adv'] }] } as any,
          ],
          actions: [
            {
              id: 'act_polar',
              type: 'polarstretch',
              name: 'GiroEstiramiento',
              paramId: 'p_polar',
              paramPoint: 'end',
              frame: [],
              selection: ['l_hoja_adv'],
              rotateOnly: ['l_arco_adv'],
            },
          ],
          constraints: [
            {
              id: 'c_coinc',
              kind: 'geometric',
              type: 'coincident',
              enabled: true,
              refs: [
                { entityId: 'l_hoja_adv', part: 'start' },
                { entityId: 'l_arco_adv', part: 'center' },
              ],
            },
          ],
          lookups: [],
          variables: [],
          propertyOrder: [],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_hoja_adv',
        type: 'line',
        owner: 'blk_dyn_adv',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 0 },
      });
      tx.addEntity<ArcEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_arco_adv',
        type: 'arc',
        owner: 'blk_dyn_adv',
        center: { x: 0, y: 0 },
        radius: 80,
        startAngle: 0,
        endAngle: Math.PI / 2,
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_dyn_adv',
        type: 'insert',
        blockId: 'blk_dyn_adv',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ins_dyn_adv']);
    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 10, y: 10 });
    const pastedIns = dstDoc.entity(res.insertedIds[0]) as InsertEntity;
    const pastedBlk = dstDoc.data.blocks.get(pastedIns.blockId)!;
    const ents = dstDoc.entitiesOf(pastedBlk.id);
    const newHojaId = ents.find((e) => e.type === 'line')!.id;
    const newArcoId = ents.find((e) => e.type === 'arc')!.id;

    const dyn = pastedBlk.dynamic!;
    expect(dyn.parameters[0].type).toBe('visibility');
    if (dyn.parameters[0].type === 'visibility') {
      expect(dyn.parameters[0].states[0].visible).toEqual([newHojaId]);
    }
    const act = dyn.actions[0];
    expect(act.selection).toEqual([newHojaId]);
    if (act.type === 'polarstretch') {
      expect(act.rotateOnly).toEqual([newArcoId]);
    }
    expect(dyn.constraints[0].refs[0].entityId).toBe(newHojaId);
    expect(dyn.constraints[0].refs[1].entityId).toBe(newArcoId);
  });

  it('remapea mleaderStyle.blockId al bloque registrado en destino', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_MLEADER_STYLE_BLOCK', (tx) => {
      tx.add('blocks', {
        id: 'blk_burbuja',
        name: 'BurbujaDetalle',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Burbuja de directriz',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<ArcEntity>({
        ...entityDefaults(srcDoc),
        id: 'arc_burbuja',
        type: 'arc',
        owner: 'blk_burbuja',
        center: { x: 0, y: 0 },
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI * 2,
      });
      tx.add('mleaderStyles', {
        ...srcDoc.data.mleaderStyles.get('standard')!,
        id: 'mls_burbuja',
        name: 'DirectrizBurbuja',
        contentType: 'block',
        blockId: 'blk_burbuja',
      });
      tx.addEntity<MLeaderEntity>({
        ...entityDefaults(srcDoc),
        id: 'mld_1',
        type: 'mleader',
        style: 'mls_burbuja',
        leaders: [{ vertices: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }],
        landing: { x: 10, y: 10 },
        doglegLength: 5,
        direction: 1,
        content: { type: 'block', blockId: 'blk_burbuja', scale: 1, rotation: 0, attributes: {} },
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['mld_1']);
    expect(pkg.mleaderStyles?.length).toBe(1);
    expect(pkg.blocks?.some((b) => b.name === 'BurbujaDetalle')).toBe(true);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 20, y: 20 });
    const pastedMld = dstDoc.entity(res.insertedIds[0]) as MLeaderEntity;
    const destStyle = dstDoc.data.mleaderStyles.get(pastedMld.style)!;
    expect(destStyle).toBeDefined();
    expect(destStyle.name).toBe('DirectrizBurbuja');
    expect(destStyle.blockId).toBeDefined();
    expect(dstDoc.data.blocks.has(destStyle.blockId!)).toBe(true);
    expect(dstDoc.data.blocks.get(destStyle.blockId!)?.name).toBe('BurbujaDetalle');
    if (pastedMld.content.type === 'block') {
      expect(pastedMld.content.blockId).toBe(destStyle.blockId);
    }
  });

  it('remapea asociatividad de cotas y sombreados dentro de definiciones de bloques', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_BLOQUE_ASOCIATIVO', (tx) => {
      tx.add('blocks', {
        id: 'blk_assoc',
        name: 'PiezaAcotada',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Pieza con cota y sombreado asociativo interno',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_pieza',
        type: 'line',
        owner: 'blk_assoc',
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
      });
      tx.addEntity<DimensionEntity>({
        ...entityDefaults(srcDoc),
        id: 'dim_pieza',
        type: 'dimension',
        owner: 'blk_assoc',
        dimType: 'linear',
        style: 'standard',
        overrides: {},
        p1: { x: 0, y: 0 },
        p2: { x: 50, y: 0 },
        p3: { x: 25, y: 5 },
        rotation: 0,
        assoc: [{ point: 'p1', entityId: 'l_pieza', snap: 'endpoint-start' }],
      });
      tx.addEntity<HatchEntity>({
        ...entityDefaults(srcDoc),
        id: 'hatch_pieza',
        type: 'hatch',
        owner: 'blk_assoc',
        pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false },
        origin: { x: 0, y: 0 },
        islandStyle: 'normal',
        loops: [],
        associative: ['l_pieza'],
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_assoc',
        type: 'insert',
        blockId: 'blk_assoc',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ins_assoc']);
    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 0, y: 0 });
    const pastedIns = dstDoc.entity(res.insertedIds[0]) as InsertEntity;
    const pastedBlk = dstDoc.data.blocks.get(pastedIns.blockId)!;
    const ents = dstDoc.entitiesOf(pastedBlk.id);

    const newL = ents.find((e) => e.type === 'line') as LineEntity;
    const newDim = ents.find((e) => e.type === 'dimension') as DimensionEntity;
    const newHatch = ents.find((e) => e.type === 'hatch') as HatchEntity;

    expect(newDim.assoc).toBeDefined();
    expect(newDim.assoc![0].entityId).toBe(newL.id);
    expect(newDim.assoc![0].entityId).not.toBe('l_pieza');

    expect(newHatch.associative).toBeDefined();
    expect(newHatch.associative![0]).toBe(newL.id);
    expect(newHatch.associative![0]).not.toBe('l_pieza');
  });

  it('recolecta y remapea tipos de línea utilizados en elementos de mlineStyles', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_MLINE_STYLE', (tx) => {
      tx.add('linetypes', {
        id: 'lt_trazos',
        name: 'TRAZOS_ML',
        description: 'Trazos para multilínea',
        pattern: [5, -2],
      });
      tx.add('mlineStyles', {
        id: 'mls_vial',
        name: 'VialDoble',
        description: 'Calle con eje a trazos',
        elements: [
          { offset: 0.5, color: 'ByLayer', linetype: 'ByLayer' },
          { offset: 0, color: 'ByLayer', linetype: 'lt_trazos' },
          { offset: -0.5, color: 'ByLayer', linetype: 'ByLayer' },
        ],
        startCap: 'line',
        endCap: 'line',
      });
      tx.addEntity<MLineEntity>({
        ...entityDefaults(srcDoc),
        id: 'ml_1',
        type: 'mline',
        style: 'mls_vial',
        scale: 1,
        justification: 'zero',
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        closed: false,
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ml_1']);
    expect(pkg.mlineStyles?.length).toBe(1);
    expect(pkg.linetypes?.some((lt) => lt.name === 'TRAZOS_ML')).toBe(true);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 10, y: 10 });
    const pastedMl = dstDoc.entity(res.insertedIds[0]) as MLineEntity;
    const destStyle = dstDoc.data.mlineStyles.get(pastedMl.style)!;
    expect(destStyle).toBeDefined();

    const destLt = dstDoc.findByName('linetypes', 'TRAZOS_ML')!;
    expect(destLt).toBeDefined();
    expect(destStyle.elements[1].linetype).toBe(destLt.id);
  });

  it('ordena topológicamente bloques cuando un bloque contiene una directriz tipo bloque', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('CREA_NESTED_MLEADER_BLOCK', (tx) => {
      // Bloque dependiente (burbuja)
      tx.add('blocks', {
        id: 'blk_etiqueta',
        name: 'Etiqueta',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Etiqueta',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<ArcEntity>({
        ...entityDefaults(srcDoc),
        id: 'arc_tag',
        type: 'arc',
        owner: 'blk_etiqueta',
        center: { x: 0, y: 0 },
        radius: 3,
        startAngle: 0,
        endAngle: Math.PI * 2,
      });

      // Bloque contenedor que incluye una entidad mleader que referencia a 'blk_etiqueta'
      tx.add('blocks', {
        id: 'blk_contenedor',
        name: 'ContenedorConMLeader',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Contenedor',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<MLeaderEntity>({
        ...entityDefaults(srcDoc),
        id: 'mld_inner',
        type: 'mleader',
        owner: 'blk_contenedor',
        style: 'standard',
        leaders: [{ vertices: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }],
        landing: { x: 5, y: 5 },
        doglegLength: 2,
        direction: 1,
        content: { type: 'block', blockId: 'blk_etiqueta', scale: 1, rotation: 0, attributes: {} },
      });

      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_cont',
        type: 'insert',
        blockId: 'blk_contenedor',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['ins_cont']);
    expect(pkg.blocks?.length).toBe(2);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 0, y: 0 });
    expect(res.insertedIds.length).toBe(1);

    const pastedContBlk = dstDoc.findByName('blocks', 'ContenedorConMLeader')!;
    const pastedTagBlk = dstDoc.findByName('blocks', 'Etiqueta')!;
    expect(pastedContBlk).toBeDefined();
    expect(pastedTagBlk).toBeDefined();

    const innerEnts = dstDoc.entitiesOf(pastedContBlk.id);
    const innerMld = innerEnts.find((e) => e.type === 'mleader') as MLeaderEntity;
    expect(innerMld).toBeDefined();
    if (innerMld.content.type === 'block') {
      expect(innerMld.content.blockId).toBe(pastedTagBlk.id);
    }
  });

  it('reutiliza bloques geométricamente idénticos con capas y estilos personalizados en vez de crear Nombre (2)', () => {
    const srcDoc1 = createDocument({ title: 'Doc1' });
    const srcDoc2 = createDocument({ title: 'Doc2' });
    const dstDoc = createDocument({ title: 'DocDest' });

    // Preparamos en ambos documentos origen un bloque con capa "Carpinteria" y tipo de línea "OCULTA"
    for (const doc of [srcDoc1, srcDoc2]) {
      doc.transact('SETUP', (tx) => {
        const lt = tx.add('linetypes', {
          id: doc === srcDoc1 ? 'lt_1' : 'lt_2',
          name: 'OCULTA',
          description: 'Línea oculta',
          pattern: [4, -2],
        });
        const lay = tx.add('layers', {
          ...doc.data.layers.get('0')!,
          id: doc === srcDoc1 ? 'lay_1' : 'lay_2',
          name: 'Carpinteria',
          color: '#ff0000',
          linetype: lt.id,
          lineweight: 0.3,
        });
        const blk = tx.add('blocks', {
          id: doc === srcDoc1 ? 'blk_1' : 'blk_2',
          name: 'Ventana',
          kind: 'normal',
          basePoint: { x: 0, y: 0 },
          description: 'Ventana abatible',
          units: 'unitless',
          explodable: true,
          scaleUniformly: true,
          annotative: false,
          revision: 1,
        });
        tx.addEntity<LineEntity>({
          ...entityDefaults(doc),
          id: doc === srcDoc1 ? 'l_v1' : 'l_v2',
          type: 'line',
          owner: blk.id,
          layer: lay.id,
          linetype: lt.id,
          start: { x: 0, y: 0 },
          end: { x: 120, y: 10 },
        });
        tx.addEntity<InsertEntity>({
          ...entityDefaults(doc),
          id: doc === srcDoc1 ? 'ins_v1' : 'ins_v2',
          type: 'insert',
          blockId: blk.id,
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          attributes: [],
        });
      });
    }

    // Pegamos la ventana de srcDoc1 en dstDoc
    const pkg1 = createClipboardPackage(srcDoc1, ['ins_v1']);
    pasteClipboardPackage(dstDoc, pkg1, MODEL_SPACE_ID, { x: 0, y: 0 });
    expect(dstDoc.findByName('blocks', 'Ventana')).toBeDefined();
    expect(dstDoc.findByName('blocks', 'Ventana (2)')).toBeUndefined();

    // Pegamos la ventana de srcDoc2 en dstDoc (definición equivalente pero IDs de capa/tipo de línea distintos en pkg2)
    const pkg2 = createClipboardPackage(srcDoc2, ['ins_v2']);
    pasteClipboardPackage(dstDoc, pkg2, MODEL_SPACE_ID, { x: 150, y: 0 });

    // NO debe haberse creado 'Ventana (2)' porque la definición es equivalente
    expect(dstDoc.findByName('blocks', 'Ventana (2)')).toBeUndefined();
    expect(dstDoc.findByName('blocks', 'Ventana')).toBeDefined();
  });
});
