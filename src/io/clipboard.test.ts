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
  PdfUnderlayEntity,
  TextEntity,
  ViewportEntity,
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

function createAssociativeBlockSource() {
  const doc = createDocument({ title: 'Origen asociativo' });
  doc.transact('CREA_BLOQUE_ASOCIATIVO_COMPARABLE', (tx) => {
    tx.add('blocks', {
      id: 'blk_assoc_compare',
      name: 'DetalleAsociativo',
      kind: 'normal',
      basePoint: { x: 0, y: 0 },
      description: 'Detalle con referencias asociativas',
      units: 'unitless',
      explodable: true,
      scaleUniformly: true,
      annotative: false,
      revision: 1,
    });
    tx.addEntity<LineEntity>({
      ...entityDefaults(doc),
      id: 'assoc_boundary_a',
      type: 'line',
      owner: 'blk_assoc_compare',
      start: { x: 0, y: 0 },
      end: { x: 20, y: 0 },
    });
    tx.addEntity<LineEntity>({
      ...entityDefaults(doc),
      id: 'assoc_boundary_b',
      type: 'line',
      owner: 'blk_assoc_compare',
      start: { x: 0, y: 10 },
      end: { x: 20, y: 10 },
    });
    tx.addEntity<DimensionEntity>({
      ...entityDefaults(doc),
      id: 'assoc_dimension',
      type: 'dimension',
      owner: 'blk_assoc_compare',
      dimType: 'linear',
      style: doc.settings.currentDimStyle,
      overrides: {},
      p1: { x: 0, y: 0 },
      p2: { x: 20, y: 0 },
      p3: { x: 10, y: 4 },
      rotation: 0,
      assoc: [{ point: 'p1', entityId: 'assoc_boundary_a', snap: 'endpoint-start' }],
    });
    tx.addEntity<HatchEntity>({
      ...entityDefaults(doc),
      id: 'assoc_hatch',
      type: 'hatch',
      owner: 'blk_assoc_compare',
      pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false },
      origin: { x: 0, y: 0 },
      islandStyle: 'normal',
      loops: [],
      associative: ['assoc_boundary_a'],
    });
    tx.addEntity<InsertEntity>({
      ...entityDefaults(doc),
      id: 'assoc_insert',
      type: 'insert',
      blockId: 'blk_assoc_compare',
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      attributes: [],
    });
  });
  return doc;
}

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

  it('reutiliza bloques dinámicos idénticos y evita duplicación innecesaria en destino', () => {
    const srcDoc = createDocument({ title: 'Origen Din' });
    const dstDoc = createDocument({ title: 'Destino Din' });

    srcDoc.transact('CREA_BLOQUE_DIN', (tx) => {
      tx.add('blocks', {
        id: 'blk_puerta_dyn',
        name: 'PuertaEstirar',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Puerta dinámica con estiramiento',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'p_long', name: 'Longitud', type: 'linear', base: { x: 0, y: 0 }, end: { x: 80, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } } as any,
          ],
          actions: [
            { id: 'act_st', type: 'stretch', name: 'EstirarHoja', paramId: 'p_long', paramPoint: 'end', frame: [], selection: ['l_hoja_dyn'], axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
          ],
          constraints: [],
          lookups: [],
          variables: [],
          propertyOrder: [],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_hoja_dyn',
        type: 'line',
        owner: 'blk_puerta_dyn',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 0 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'ins_p1',
        type: 'insert',
        blockId: 'blk_puerta_dyn',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    // Copiamos la primera vez a dstDoc
    const pkg1 = createClipboardPackage(srcDoc, ['ins_p1']);
    pasteClipboardPackage(dstDoc, pkg1, MODEL_SPACE_ID, { x: 0, y: 0 });
    expect(dstDoc.findByName('blocks', 'PuertaEstirar')).toBeDefined();
    expect(dstDoc.findByName('blocks', 'PuertaEstirar (2)')).toBeUndefined();

    // Copiamos la segunda vez idéntica a dstDoc
    const pkg2 = createClipboardPackage(srcDoc, ['ins_p1']);
    pasteClipboardPackage(dstDoc, pkg2, MODEL_SPACE_ID, { x: 100, y: 0 });

    // Debe haberse reutilizado el bloque dinámico existente sin crear PuertaEstirar (2)
    expect(dstDoc.findByName('blocks', 'PuertaEstirar (2)')).toBeUndefined();
    expect(dstDoc.findByName('blocks', 'PuertaEstirar')).toBeDefined();
  });

  it('distingue bloques dinámicos con igual geometría base pero distintas acciones o parámetros y crea Nombre (2)', () => {
    const doc1 = createDocument({ title: 'Doc1' });
    const doc2 = createDocument({ title: 'Doc2' });

    // Doc1: bloque 'PuertaVar' con estiramiento
    doc1.transact('CREA_DYN1', (tx) => {
      tx.add('blocks', {
        id: 'blk_d1',
        name: 'PuertaVar',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Con estiramiento',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'p_len', name: 'Longitud', type: 'linear', base: { x: 0, y: 0 }, end: { x: 80, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } } as any,
          ],
          actions: [
            { id: 'a_st', type: 'stretch', name: 'Estirar', paramId: 'p_len', paramPoint: 'end', frame: [], selection: ['l_d1'], axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
          ],
          constraints: [],
          lookups: [],
          variables: [],
          propertyOrder: [],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc1),
        id: 'l_d1',
        type: 'line',
        owner: 'blk_d1',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 0 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(doc1),
        id: 'ins_d1',
        type: 'insert',
        blockId: 'blk_d1',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    // Doc2: bloque con el MISMO nombre 'PuertaVar' y MISMA geometría (línea 0,0 a 80,0), pero con Flip
    doc2.transact('CREA_DYN2', (tx) => {
      tx.add('blocks', {
        id: 'blk_d2',
        name: 'PuertaVar',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Con inversión',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'p_flip', name: 'Invertir', type: 'flip', base: { x: 0, y: 0 }, end: { x: 0, y: 80 }, labelNotFlipped: 'Normal', labelFlipped: 'Invertida' } as any,
          ],
          actions: [
            { id: 'a_flip', type: 'flip', name: 'InvertirAccion', paramId: 'p_flip', selection: ['l_d2'] },
          ],
          constraints: [],
          lookups: [],
          variables: [],
          propertyOrder: [],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(doc2),
        id: 'l_d2',
        type: 'line',
        owner: 'blk_d2',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 0 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(doc2),
        id: 'ins_d2',
        type: 'insert',
        blockId: 'blk_d2',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const dst = createDocument({ title: 'Destino' });

    // Pegar primero el bloque con estiramiento
    const pkg1 = createClipboardPackage(doc1, ['ins_d1']);
    pasteClipboardPackage(dst, pkg1, MODEL_SPACE_ID, { x: 0, y: 0 });
    expect(dst.findByName('blocks', 'PuertaVar')).toBeDefined();

    // Pegar ahora el bloque con inversión: aunque la geometría base coincide, sus acciones dinámicas difieren
    const pkg2 = createClipboardPackage(doc2, ['ins_d2']);
    pasteClipboardPackage(dst, pkg2, MODEL_SPACE_ID, { x: 100, y: 0 });

    // NO debe reutilizarse: debe crearse PuertaVar (2) para no perder la acción Flip
    const blk2 = dst.findByName('blocks', 'PuertaVar (2)');
    expect(blk2).toBeDefined();
    expect(blk2?.dynamic?.actions[0].type).toBe('flip');

    const blk1 = dst.findByName('blocks', 'PuertaVar');
    expect(blk1?.dynamic?.actions[0].type).toBe('stretch');
  });

  it('recolecta recursivamente capas y tipos de línea a través de cadenas transitivas mleaderStyle -> bloque -> capa -> linetype', () => {
    const srcDoc = createDocument({ title: 'Origen Transitivo' });
    const dstDoc = createDocument({ title: 'Destino Transitivo' });

    srcDoc.transact('SETUP_TRANSITIVO', (tx) => {
      const lt = tx.add('linetypes', {
        id: 'lt_punto_eje',
        name: 'PUNTO_EJE',
        description: 'Punto y raya',
        pattern: [10, -2, 2, -2],
      });
      const lay = tx.add('layers', {
        ...srcDoc.data.layers.get('0')!,
        id: 'lay_simbologia',
        name: 'SimbologiaDetalle',
        linetype: lt.id,
      });
      const blkTag = tx.add('blocks', {
        id: 'blk_tag_trans',
        name: 'TagTransitivo',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Tag con capa que usa tipo de línea personalizado',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'l_tag_trans',
        type: 'line',
        owner: blkTag.id,
        layer: lay.id,
        linetype: 'ByLayer',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 10 },
      });

      const mls = tx.add('mleaderStyles', {
        ...srcDoc.data.mleaderStyles.get('standard')!,
        id: 'mls_tag_trans',
        name: 'DirectrizConTag',
        contentType: 'block',
        blockId: blkTag.id,
      });

      // Creamos una entidad en el dibujo usando este estilo
      tx.addEntity<MLeaderEntity>({
        ...entityDefaults(srcDoc),
        id: 'mld_trans',
        type: 'mleader',
        style: mls.id,
        leaders: [{ vertices: [{ x: 0, y: 0 }, { x: 20, y: 20 }] }],
        landing: { x: 20, y: 20 },
        doglegLength: 5,
        direction: 1,
        content: { type: 'block', blockId: blkTag.id, scale: 1, rotation: 0, attributes: {} },
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['mld_trans']);

    // Comprobamos que el cierre transitivo recogió la capa y el tipo de línea indirectos
    expect(pkg.blocks?.some((b) => b.name === 'TagTransitivo')).toBe(true);
    expect(pkg.layers?.some((l) => l.name === 'SimbologiaDetalle')).toBe(true);
    expect(pkg.linetypes?.some((lt) => lt.name === 'PUNTO_EJE')).toBe(true);

    // Pegamos en un documento limpio
    pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 0, y: 0 });

    const destLt = dstDoc.findByName('linetypes', 'PUNTO_EJE');
    const destLay = dstDoc.findByName('layers', 'SimbologiaDetalle');
    expect(destLt).toBeDefined();
    expect(destLay).toBeDefined();
    expect(destLay?.linetype).toBe(destLt?.id);
  });

  it('no reutiliza un bloque si una cota equivalente apunta a otra entidad interna', () => {
    const srcDoc = createAssociativeBlockSource();
    const dstDoc = createDocument({ title: 'Destino cota asociativa' });
    const original = createClipboardPackage(srcDoc, ['assoc_insert']);
    pasteClipboardPackage(dstDoc, original, MODEL_SPACE_ID, { x: 0, y: 0 });
    pasteClipboardPackage(dstDoc, original, MODEL_SPACE_ID, { x: 30, y: 0 });
    expect(dstDoc.findByName('blocks', 'DetalleAsociativo (2)')).toBeUndefined();

    const changed = structuredClone(original);
    const dimension = changed.blockEntities?.find((entity) => entity.type === 'dimension') as DimensionEntity;
    dimension.assoc = [{ point: 'p1', entityId: 'assoc_boundary_b', snap: 'endpoint-start' }];
    pasteClipboardPackage(dstDoc, changed, MODEL_SPACE_ID, { x: 40, y: 0 });

    expect(dstDoc.findByName('blocks', 'DetalleAsociativo (2)')).toBeDefined();
  });

  it('no reutiliza un bloque si un sombreado equivalente sigue otra frontera interna', () => {
    const srcDoc = createAssociativeBlockSource();
    const dstDoc = createDocument({ title: 'Destino hatch asociativo' });
    const original = createClipboardPackage(srcDoc, ['assoc_insert']);
    pasteClipboardPackage(dstDoc, original, MODEL_SPACE_ID, { x: 0, y: 0 });
    pasteClipboardPackage(dstDoc, original, MODEL_SPACE_ID, { x: 30, y: 0 });
    expect(dstDoc.findByName('blocks', 'DetalleAsociativo (2)')).toBeUndefined();

    const changed = structuredClone(original);
    const hatch = changed.blockEntities?.find((entity) => entity.type === 'hatch') as HatchEntity;
    hatch.associative = ['assoc_boundary_b'];
    pasteClipboardPackage(dstDoc, changed, MODEL_SPACE_ID, { x: 40, y: 0 });

    expect(dstDoc.findByName('blocks', 'DetalleAsociativo (2)')).toBeDefined();
  });

  it('no reutiliza un bloque dinámico cuando cambia el orden visible de sus propiedades', () => {
    const srcDoc = createDocument({ title: 'Origen orden dinámico' });
    const dstDoc = createDocument({ title: 'Destino orden dinámico' });
    srcDoc.transact('CREA_ORDEN_DINAMICO', (tx) => {
      tx.add('blocks', {
        id: 'blk_property_order',
        name: 'MuebleOrdenado',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Mueble con propiedades ordenadas',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'p_width', type: 'linear', name: 'Ancho', label: 'Ancho', showInProperties: true, chainActions: false, gripCount: 2, base: { x: 0, y: 0 }, end: { x: 80, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } },
            { id: 'p_depth', type: 'linear', name: 'Fondo', label: 'Fondo', showInProperties: true, chainActions: false, gripCount: 2, base: { x: 0, y: 0 }, end: { x: 0, y: 40 }, baseLocation: 'start', valueSet: { kind: 'none' } },
          ],
          actions: [],
          constraints: [],
          lookups: [],
          variables: [],
          propertyOrder: ['p_width', 'p_depth'],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'property_order_line',
        type: 'line',
        owner: 'blk_property_order',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 0 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'property_order_insert',
        type: 'insert',
        blockId: 'blk_property_order',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
      });
    });

    const original = createClipboardPackage(srcDoc, ['property_order_insert']);
    pasteClipboardPackage(dstDoc, original, MODEL_SPACE_ID, { x: 0, y: 0 });
    const changed = structuredClone(original);
    changed.blocks![0].dynamic!.propertyOrder = ['p_depth', 'p_width'];
    pasteClipboardPackage(dstDoc, changed, MODEL_SPACE_ID, { x: 100, y: 0 });

    expect(dstDoc.findByName('blocks', 'MuebleOrdenado (2)')).toBeDefined();
  });

  it('resuelve colisión de ID de entidad sin sobrescribir el contenido existente', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    dstDoc.transact('DESTINO_ID', (tx) => {
      tx.addEntity<LineEntity>({
        ...entityDefaults(dstDoc),
        id: 'shared_entity_id',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
      });
    });
    srcDoc.transact('ORIGEN_ID', (tx) => {
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'shared_entity_id',
        type: 'line',
        start: { x: 10, y: 10 },
        end: { x: 20, y: 20 },
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['shared_entity_id']);
    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 10, y: 10 });

    expect(res.insertedIds[0]).not.toBe('shared_entity_id');
    expect((dstDoc.entity('shared_entity_id') as LineEntity).end).toEqual({ x: 1, y: 1 });
    expect(dstDoc.entity(res.insertedIds[0])?.type).toBe('line');
  });

  it('copia PDF underlay con su asset embebido y no depende del documento origen', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();
    const pdfData = 'data:application/pdf;base64,JVBERi0xLjQK';

    srcDoc.transact('CREA_PDF', (tx) => {
      tx.add('assets', {
        id: 'ast_pdf',
        name: 'detalle.pdf',
        mime: 'application/pdf',
        size: 16,
        dataUrl: pdfData,
        pages: 1,
      });
      tx.addEntity<PdfUnderlayEntity>({
        ...entityDefaults(srcDoc),
        id: 'pdf_1',
        type: 'pdfunderlay',
        assetId: 'ast_pdf',
        page: 1,
        position: { x: 0, y: 0 },
        scale: 1,
        rotation: 0,
        clipEnabled: false,
        opacity: 1,
        fade: 0,
        monochrome: false,
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['pdf_1']);
    expect(pkg.assets?.[0]?.dataUrl).toBe(pdfData);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 20, y: 20 });
    const pasted = dstDoc.entity(res.insertedIds[0]) as PdfUnderlayEntity;
    expect(dstDoc.data.assets.get(pasted.assetId)?.dataUrl).toBe(pdfData);
    expect(pasted.assetId).not.toBe('ast_pdf');
  });

  it('no mezcla assets distintos aunque tengan el mismo nombre y tamaño', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();
    const sourceData = 'data:image/png;base64,AAAA';
    const destinationData = 'data:image/png;base64,BBBB';

    dstDoc.transact('ASSET_DESTINO', (tx) => {
      tx.add('assets', {
        id: 'asset_destino',
        name: 'logo.png',
        mime: 'image/png',
        size: 4,
        dataUrl: destinationData,
      });
    });
    srcDoc.transact('ASSET_ORIGEN', (tx) => {
      tx.add('assets', {
        id: 'asset_origen',
        name: 'logo.png',
        mime: 'image/png',
        size: 4,
        dataUrl: sourceData,
      });
      tx.addEntity<ImageEntity>({
        ...entityDefaults(srcDoc),
        id: 'img_asset_collision',
        type: 'image',
        assetId: 'asset_origen',
        position: { x: 0, y: 0 },
        u: { x: 1, y: 0 },
        v: { x: 0, y: 1 },
        clipEnabled: false,
        opacity: 1,
        fade: 0,
        brightness: 50,
        contrast: 50,
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['img_asset_collision']);
    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 0, y: 0 });
    const pasted = dstDoc.entity(res.insertedIds[0]) as ImageEntity;

    expect(pasted.assetId).not.toBe('asset_destino');
    expect(dstDoc.data.assets.get(pasted.assetId)?.dataUrl).toBe(sourceData);
    expect(dstDoc.data.assets.get('asset_destino')?.dataUrl).toBe(destinationData);
  });

  it('transporta y remapea frozenLayers y layerOverrides de viewports', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('VIEWPORT_DEPS', (tx) => {
      tx.add('linetypes', {
        id: 'lt_viewport_src',
        name: 'VP_DASHED',
        description: 'Tipo de línea de override de viewport',
        pattern: [3, -1],
      });
      const baseLayer = srcDoc.data.layers.get('0')!;
      tx.add('layers', {
        ...baseLayer,
        id: 'layer_frozen_src',
        name: 'VP Congelada',
        order: 10,
      });
      tx.add('layers', {
        ...baseLayer,
        id: 'layer_override_src',
        name: 'VP Override',
        order: 11,
      });
      tx.addEntity<ViewportEntity>({
        ...entityDefaults(srcDoc),
        id: 'vp_portable',
        type: 'viewport',
        center: { x: 50, y: 40 },
        width: 100,
        height: 80,
        viewCenter: { x: 0, y: 0 },
        scale: 0.02,
        viewTwist: 0,
        displayLocked: false,
        on: true,
        frozenLayers: ['layer_frozen_src'],
        layerOverrides: {
          layer_override_src: { color: '#ff0000', linetype: 'lt_viewport_src' },
        },
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['vp_portable']);
    expect(pkg.layers?.some((layer) => layer.name === 'VP Congelada')).toBe(true);
    expect(pkg.layers?.some((layer) => layer.name === 'VP Override')).toBe(true);
    expect(pkg.linetypes?.some((lt) => lt.name === 'VP_DASHED')).toBe(true);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 50, y: 40 });
    const pasted = dstDoc.entity(res.insertedIds[0]) as ViewportEntity;
    const frozen = dstDoc.findByName('layers', 'VP Congelada')!;
    const overrideLayer = dstDoc.findByName('layers', 'VP Override')!;
    const overrideLt = dstDoc.findByName('linetypes', 'VP_DASHED')!;

    expect(pasted.frozenLayers).toEqual([frozen.id]);
    expect(pasted.frozenLayers).not.toContain('layer_frozen_src');
    expect(Object.keys(pasted.layerOverrides)).toEqual([overrideLayer.id]);
    expect(pasted.layerOverrides[overrideLayer.id]?.linetype).toBe(overrideLt.id);
    expect(pasted.layerOverrides).not.toHaveProperty('layer_override_src');
  });

  it('incluye y remapea referencias de textStyle y blockId dentro de overrides', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('OVERRIDE_DEPS', (tx) => {
      tx.add('textStyles', {
        id: 'ts_override_src',
        name: 'OverridePortable',
        font: 'Inter',
        height: 0,
        widthFactor: 0.8,
        oblique: 0,
        annotative: false,
      });
      tx.add('blocks', {
        id: 'blk_override_src',
        name: 'OverrideBlock',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Bloque usado por override',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'override_block_line',
        type: 'line',
        owner: 'blk_override_src',
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 },
      });
      tx.addEntity<DimensionEntity>({
        ...entityDefaults(srcDoc),
        id: 'dim_override',
        type: 'dimension',
        dimType: 'linear',
        style: srcDoc.settings.currentDimStyle,
        overrides: { textStyle: 'ts_override_src' },
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        p3: { x: 5, y: 2 },
        rotation: 0,
      });
      tx.addEntity<MLeaderEntity>({
        ...entityDefaults(srcDoc),
        id: 'mleader_override',
        type: 'mleader',
        style: srcDoc.settings.currentMLeaderStyle,
        leaders: [{ vertices: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }],
        landing: { x: 10, y: 10 },
        doglegLength: 5,
        direction: 1,
        content: { type: 'block', blockId: 'blk_override_src', scale: 1, rotation: 0, attributes: {} },
        overrides: { textStyle: 'ts_override_src', blockId: 'blk_override_src' },
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['dim_override', 'mleader_override']);
    expect(pkg.textStyles?.some((style) => style.id === 'ts_override_src')).toBe(true);
    expect(pkg.blocks?.some((block) => block.id === 'blk_override_src')).toBe(true);

    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 20, y: 20 });
    const pastedEntities = res.insertedIds.map((id) => dstDoc.entity(id)!);
    const dim = pastedEntities.find((entity) => entity.type === 'dimension') as DimensionEntity;
    const mleader = pastedEntities.find((entity) => entity.type === 'mleader') as MLeaderEntity;
    const textStyle = dstDoc.findByName('textStyles', 'OverridePortable')!;
    const block = dstDoc.findByName('blocks', 'OverrideBlock')!;

    expect(dim.overrides.textStyle).toBe(textStyle.id);
    expect(dim.overrides.textStyle).not.toBe('ts_override_src');
    expect(mleader.overrides?.textStyle).toBe(textStyle.id);
    expect(mleader.overrides?.blockId).toBe(block.id);
    expect(mleader.overrides?.blockId).not.toBe('blk_override_src');
  });

  it('remapea DynamicInstanceState.values al reutilizar un bloque equivalente con IDs de parámetro distintos', () => {
    const srcDoc = createDocument();
    const dstDoc = createDocument();

    srcDoc.transact('DYN_SOURCE', (tx) => {
      tx.add('blocks', {
        id: 'blk_dyn_source',
        name: 'PuertaParamMap',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Origen',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'src_param', name: 'Longitud', type: 'linear', base: { x: 0, y: 0 }, end: { x: 80, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } } as any,
          ],
          actions: [
            { id: 'src_action', type: 'stretch', name: 'Estirar', paramId: 'src_param', paramPoint: 'end', frame: [], selection: ['src_line'], axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
          ],
          constraints: [],
          lookups: [],
          variables: [],
          propertyOrder: ['src_param'],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(srcDoc),
        id: 'src_line',
        type: 'line',
        owner: 'blk_dyn_source',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 0 },
      });
      tx.addEntity<InsertEntity>({
        ...entityDefaults(srcDoc),
        id: 'src_insert',
        type: 'insert',
        blockId: 'blk_dyn_source',
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        attributes: [],
        dynamic: { values: { src_param: 42 } },
      });
    });

    dstDoc.transact('DYN_DEST', (tx) => {
      tx.add('blocks', {
        id: 'blk_dyn_dest',
        name: 'PuertaParamMap',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: 'Destino',
        units: 'unitless',
        explodable: true,
        scaleUniformly: true,
        annotative: false,
        revision: 1,
        dynamic: {
          parameters: [
            { id: 'dst_param', name: 'Longitud', type: 'linear', base: { x: 0, y: 0 }, end: { x: 80, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } } as any,
          ],
          actions: [
            { id: 'dst_action', type: 'stretch', name: 'Estirar', paramId: 'dst_param', paramPoint: 'end', frame: [], selection: ['dst_line'], axis: 'xy', distanceMultiplier: 1, angleOffset: 0 },
          ],
          constraints: [],
          lookups: [],
          variables: [],
          propertyOrder: ['dst_param'],
        },
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(dstDoc),
        id: 'dst_line',
        type: 'line',
        owner: 'blk_dyn_dest',
        start: { x: 0, y: 0 },
        end: { x: 80, y: 0 },
      });
    });

    const pkg = createClipboardPackage(srcDoc, ['src_insert']);
    const res = pasteClipboardPackage(dstDoc, pkg, MODEL_SPACE_ID, { x: 0, y: 0 });
    const pasted = dstDoc.entity(res.insertedIds[0]) as InsertEntity;

    expect(dstDoc.findByName('blocks', 'PuertaParamMap (2)')).toBeUndefined();
    expect(pasted.blockId).toBe('blk_dyn_dest');
    expect(pasted.dynamic?.values).toEqual({ dst_param: 42 });
    expect(pasted.dynamic?.values).not.toHaveProperty('src_param');
  });

});
