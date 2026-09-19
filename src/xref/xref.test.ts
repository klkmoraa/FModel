import { describe, expect, it } from 'vitest';
import { insertBlock } from '../blocks/blockOps';
import type { CadDocument } from '../document/document';
import { createDocument, entityDefaults } from '../document/defaults';
import type {
  AssetRecord,
  CircleEntity,
  DimConstraint,
  DimensionEntity,
  ImageEntity,
  InsertEntity,
  LineEntity,
  TableEntity,
  TextEntity,
} from '../document/types';
import { MODEL_SPACE_ID } from '../document/types';
import { readPackage, writePackage } from '../io/native';
import { createContext } from '../model/context';
import { kindOf } from '../model/registry';
import {
  attachXref,
  bindXref,
  detachXref,
  markXrefUnavailable,
  readXrefSource,
  reloadXref,
  repathXref,
  unloadXref,
  XrefError,
} from './xref';

function sourceDoc() {
  const src = createDocument({ title: 'Planta' });
  src.transact('seed', (tx) => {
    tx.add('layers', { id: 'lay-muros', name: 'Muros', color: 'aci:1', linetype: 'lt-continuous', lineweight: 50, transparency: 0, on: true, frozen: false, locked: false, plot: true, description: '', order: 1 });
    tx.addEntity<LineEntity>({ ...entityDefaults(src), layer: 'lay-muros', type: 'line', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } });
    tx.add('blocks', { id: 'blk-puerta', name: 'Puerta', kind: 'normal', basePoint: { x: 0, y: 0 }, description: '', units: 'mm', explodable: true, scaleUniformly: false, annotative: false, revision: 1 });
    tx.addEntity<CircleEntity>({ ...entityDefaults(src, 'blk-puerta'), type: 'circle', center: { x: 0, y: 0 }, radius: 50 });
    insertBlock(tx, src, 'blk-puerta', MODEL_SPACE_ID, { x: 500, y: 200 });
  });
  return src;
}

const bytesOf = (d: CadDocument) => writePackage(d.data, d.id);

describe('external references', () => {
  it('attaches a drawing as a definition with prefixed layers and nested blocks', () => {
    const src = sourceDoc();
    const host = createDocument();
    const ctx = createContext(host);
    const source = readXrefSource(bytesOf(src), 'planta.fmodel');
    const ins = host.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host, source, { fileName: 'planta.fmodel', path: 'planta.fmodel', mode: 'attach', source: 'file' });
      return insertBlock(tx, host, b.id, MODEL_SPACE_ID, { x: 10, y: 10 });
    });
    const block = host.data.blocks.get(ins.blockId)!;
    expect(block.kind).toBe('xref');
    expect(block.xref?.documentId).toBe(src.id);
    expect(host.findByName('layers', 'planta|Muros')).toBeTruthy();
    expect(host.findByName('blocks', 'planta|Puerta')).toBeTruthy();
    expect(host.entitiesOf(block.id).map((e) => e.type).sort()).toEqual(['insert', 'line']);
    const box = kindOf(ins).bbox(ins, ctx);
    expect(box.maxX).toBeCloseTo(1010);
    host.undo();
    expect(host.data.blocks.has(block.id)).toBe(false);
    expect(host.findByName('layers', 'planta|Muros')).toBeUndefined();
  });

  it('rejects circular references', () => {
    const host = sourceDoc();
    const source = readXrefSource(bytesOf(host), 'yo.fmodel');
    expect(() => host.transact('XATTACH', (tx) => attachXref(tx, host, source, { fileName: 'yo.fmodel', path: 'yo.fmodel', mode: 'attach', source: 'file' }))).toThrow(/circular/i);
  });

  it('reloads new content while keeping local layer changes; unload, detach and bind work', () => {
    const src = sourceDoc();
    const host = createDocument();
    const b = host.transact('XATTACH', (tx) => {
      const blk = attachXref(tx, host, readXrefSource(bytesOf(src), 'planta.fmodel'), { fileName: 'planta.fmodel', path: 'planta.fmodel', mode: 'overlay', source: 'file' });
      insertBlock(tx, host, blk.id, MODEL_SPACE_ID, { x: 0, y: 0 });
      return blk;
    });
    const muros = host.findByName('layers', 'planta|Muros')!;
    host.transact('LAYER', (tx) => tx.update('layers', muros.id, { color: 'aci:5', on: false }));
    src.transact('more', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(src), layer: 'lay-muros', type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: 800 } }));
    host.transact('XRELOAD', (tx) => reloadXref(tx, host, b.id, readXrefSource(bytesOf(src), 'planta.fmodel')));
    expect(host.entitiesOf(b.id).filter((e) => e.type === 'line')).toHaveLength(2);
    expect(host.data.layers.get(muros.id)).toMatchObject({ color: 'aci:5', on: false });
    expect(host.findByName('blocks', 'planta|Puerta')).toBeTruthy();

    host.transact('XUNLOAD', (tx) => unloadXref(tx, host, b.id));
    expect(host.entitiesOf(b.id)).toHaveLength(0);
    expect(host.data.blocks.get(b.id)!.xref!.status).toBe('unloaded');
    expect(host.findByName('blocks', 'planta|Puerta')).toBeUndefined();

    host.transact('XRELOAD', (tx) => reloadXref(tx, host, b.id, readXrefSource(bytesOf(src), 'planta.fmodel')));
    host.transact('XBIND', (tx) => bindXref(tx, host, b.id));
    expect(host.data.blocks.get(b.id)!.kind).toBe('normal');
    expect(host.findByName('layers', 'planta$0$Muros')).toBeTruthy();
    expect(host.findByName('blocks', 'planta$0$Puerta')).toBeTruthy();
    host.undo();

    host.transact('XDETACH', (tx) => detachXref(tx, host, b.id));
    expect(host.data.blocks.has(b.id)).toBe(false);
    expect(host.entitiesOf(MODEL_SPACE_ID).some((e) => e.type === 'insert' && (e as InsertEntity).blockId === b.id)).toBe(false);
    expect(host.findByName('layers', 'planta|Muros')).toBeUndefined();
  });

  it('does not carry overlays of the referenced drawing', () => {
    const inner = sourceDoc();
    const middle = createDocument();
    middle.transact('XATTACH', (tx) => {
      const blk = attachXref(tx, middle, readXrefSource(bytesOf(inner), 'inner.fmodel'), { fileName: 'inner.fmodel', path: 'inner.fmodel', mode: 'overlay', source: 'file' });
      insertBlock(tx, middle, blk.id, MODEL_SPACE_ID, { x: 0, y: 0 });
    });
    const host = createDocument();
    host.transact('XATTACH', (tx) => attachXref(tx, host, readXrefSource(bytesOf(middle), 'middle.fmodel'), { fileName: 'middle.fmodel', path: 'middle.fmodel', mode: 'attach', source: 'file' }));
    expect([...host.data.blocks.values()].some((b) => b.name.includes('inner'))).toBe(false);
  });

  it('keeps nested dynamic blocks working (ids inside definitions are remapped)', async () => {
    const { installDynamicSamples } = await import('../blocks/samples');
    const { installDynamicBlocks } = await import('../blocks/install');
    const src = createDocument();
    installDynamicSamples(src);
    const symbol = src.findByName('blocks', 'FM Símbolo eléctrico')!;
    src.transact('ins', (tx) => insertBlock(tx, src, symbol.id, MODEL_SPACE_ID, { x: 0, y: 0 }));
    const host = createDocument();
    const ctx = createContext(host);
    installDynamicBlocks(ctx);
    host.transact('XATTACH', (tx) => attachXref(tx, host, readXrefSource(bytesOf(src), 'muestras.fmodel'), { fileName: 'muestras.fmodel', path: 'muestras.fmodel', mode: 'attach', source: 'file' }));
    const nested = host.findByName('blocks', 'muestras|FM Símbolo eléctrico')!;
    const vis = nested.dynamic!.parameters.find((p) => p.type === 'visibility');
    const ids = new Set(host.entitiesOf(nested.id).map((e) => e.id));
    expect(vis && vis.type === 'visibility' && vis.states.every((st) => st.visible.every((id) => ids.has(id)))).toBe(true);
    // estado por defecto «Toma simple»: círculo y dos líneas (más el atributo)
    expect(ctx.evaluateBlock(nested.id).entities.filter((e) => e.type !== 'attdef')).toHaveLength(3);
  });

  it('conserva dinámicos anidados y no muta nombres/etiquetas coincidentes con IDs de entidades', () => {
    const src = createDocument();
    src.transact('seed', (tx) => {
      const blkId = 'blk_dyn';
      tx.add('blocks', {
        id: blkId,
        name: 'PuertaParametrica',
        kind: 'normal',
        basePoint: { x: 0, y: 0 },
        description: '',
        units: 'mm',
        explodable: true,
        scaleUniformly: false,
        annotative: false,
        revision: 1,
      });

      const lineId = 'line_identica';
      tx.addEntity<LineEntity>({
        ...entityDefaults(src, blkId),
        id: lineId,
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 800, y: 0 },
      });

      tx.update('blocks', blkId, {
        dynamic: {
          parameters: [
            { id: 'p1', type: 'linear', name: lineId, label: lineId, showInProperties: true, chainActions: false, gripCount: 1, base: { x: 0, y: 0 }, end: { x: 800, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } },
          ],
          actions: [
            { id: 'a1', type: 'stretch', name: lineId, paramId: 'p1', selection: [lineId], paramPoint: 'end', frame: [{ x: 700, y: -10 }, { x: 900, y: 10 }], axis: 'x', distanceMultiplier: 1, angleOffset: 0 },
          ],
          constraints: [
            {
              id: 'c1',
              kind: 'dimensional',
              type: 'aligned',
              name: lineId,
              expression: `${lineId} + 50`,
              isParameter: true,
              valueSet: { kind: 'none' },
              refs: [{ entityId: lineId, part: 'end' }],
            } as DimConstraint,
          ],
          lookups: [],
          variables: [{ name: lineId, expression: '100', exposed: true, readOnly: false }],
          propertyOrder: ['p1'],
        },
      });

      insertBlock(tx, src, blkId, MODEL_SPACE_ID, { x: 100, y: 100 });
    });

    const host = createDocument();
    host.transact('XATTACH', (tx) => {
      attachXref(tx, host, readXrefSource(bytesOf(src), 'puertas.fmodel'), {
        fileName: 'puertas.fmodel',
        path: 'puertas.fmodel',
        mode: 'attach',
        source: 'file',
      });
    });

    const nested = host.findByName('blocks', 'puertas|PuertaParametrica')!;
    expect(nested).toBeDefined();
    expect(nested.dynamic).toBeDefined();

    const nestedEntities = host.entitiesOf(nested.id);
    expect(nestedEntities).toHaveLength(1);
    const newEntityId = nestedEntities[0].id;
    expect(newEntityId).not.toBe('line_identica');

    const dyn = nested.dynamic!;
    // Las referencias deben apuntar al nuevo ID:
    expect(dyn.actions[0].selection).toEqual([newEntityId]);
    expect(dyn.constraints[0].refs[0].entityId).toBe(newEntityId);

    // Los nombres, expresiones y variables NO deben haber sido sustituidos:
    expect(dyn.parameters[0].name).toBe('line_identica');
    expect(dyn.actions[0].name).toBe('line_identica');
    expect((dyn.constraints[0] as DimConstraint).name).toBe('line_identica');
    expect((dyn.constraints[0] as DimConstraint).expression).toBe('line_identica + 50');
    expect(dyn.variables[0].name).toBe('line_identica');
  });

  it('attach y guardar/reabrir host sin handles mantiene geometría y estado portable', () => {
    const src = sourceDoc();
    const host = createDocument();
    let xrefBlockId: string = '';
    host.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host, readXrefSource(bytesOf(src), 'planta.fmodel'), {
        fileName: 'planta.fmodel',
        path: 'planta.fmodel',
        mode: 'attach',
        source: 'file',
      });
      xrefBlockId = b.id;
      insertBlock(tx, host, b.id, MODEL_SPACE_ID, { x: 50, y: 50 });
    });

    // Guardar a formato portable nativo .fmodel
    const bytes = bytesOf(host);

    // Reabrir en una instancia completamente nueva sin handles
    const reopened = createDocument();
    const pkg = readPackage(bytes);
    reopened.replaceData(pkg.data, pkg.documentId);

    const block = reopened.data.blocks.get(xrefBlockId);
    expect(block).toBeDefined();
    expect(block?.kind).toBe('xref');
    expect(block?.xref?.status).toBe('loaded');
    expect(block?.xref?.documentId).toBe(src.id);

    // La geometría se conserva visible sin depender del archivo original en disco
    const entities = reopened.entitiesOf(xrefBlockId);
    expect(entities.map((e) => e.type).sort()).toEqual(['insert', 'line']);
    expect(reopened.findByName('blocks', 'planta|Puerta')).toBeDefined();
    expect(reopened.findByName('layers', 'planta|Muros')).toBeDefined();
  });

  it('source no disponible conserva el snapshot intacto (markXrefUnavailable) y XREPATH recupera el enlace', () => {
    const src = sourceDoc();
    const host = createDocument();
    let xrefBlockId: string = '';
    host.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host, readXrefSource(bytesOf(src), 'planta.fmodel'), {
        fileName: 'planta.fmodel',
        path: 'planta.fmodel',
        mode: 'attach',
        source: 'file',
      });
      xrefBlockId = b.id;
    });

    expect(host.entitiesOf(xrefBlockId)).toHaveLength(2);

    // Simula fallo al recargar por archivo movido o sin permiso: NO debe borrar geometría
    host.transact('FAIL_RELOAD', (tx) => {
      markXrefUnavailable(tx, host, xrefBlockId, 'not-found', 'archivo no encontrado');
    });

    const notFoundBlock = host.data.blocks.get(xrefBlockId)!;
    expect(notFoundBlock.xref?.status).toBe('not-found');
    expect(notFoundBlock.xref?.error).toBe('archivo no encontrado');
    // Snapshot sigue 100% visible:
    expect(host.entitiesOf(xrefBlockId)).toHaveLength(2);

    // XREPATH con nueva ruta y archivo recuperado
    src.transact('add_extra', (tx) => {
      tx.addEntity<LineEntity>({
        ...entityDefaults(src),
        layer: 'lay-muros',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 500 },
      });
    });

    host.transact('XREPATH', (tx) => {
      repathXref(tx, host, xrefBlockId, 'nueva_carpeta/planta_v2.fmodel', readXrefSource(bytesOf(src), 'planta_v2.fmodel'));
    });

    const updatedBlock = host.data.blocks.get(xrefBlockId)!;
    expect(updatedBlock.xref?.status).toBe('loaded');
    expect(updatedBlock.xref?.path).toBe('nueva_carpeta/planta_v2.fmodel');
    expect(updatedBlock.xref?.error).toBeUndefined();
    // Ahora tiene 3 entidades:
    expect(host.entitiesOf(xrefBlockId)).toHaveLength(3);
  });

  it('XUNLOAD retira intencionalmente la geometría y XRELOAD la recupera', () => {
    const src = sourceDoc();
    const host = createDocument();
    let xrefBlockId: string = '';
    host.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host, readXrefSource(bytesOf(src), 'planta.fmodel'), {
        fileName: 'planta.fmodel',
        path: 'planta.fmodel',
        mode: 'attach',
        source: 'file',
      });
      xrefBlockId = b.id;
    });

    expect(host.entitiesOf(xrefBlockId)).toHaveLength(2);

    // XUNLOAD retira la geometría
    host.transact('XUNLOAD', (tx) => {
      unloadXref(tx, host, xrefBlockId);
    });

    expect(host.entitiesOf(xrefBlockId)).toHaveLength(0);
    expect(host.data.blocks.get(xrefBlockId)?.xref?.status).toBe('unloaded');

    // XRELOAD la restaura
    host.transact('XRELOAD', (tx) => {
      reloadXref(tx, host, xrefBlockId, readXrefSource(bytesOf(src), 'planta.fmodel'));
    });

    expect(host.entitiesOf(xrefBlockId)).toHaveLength(2);
    expect(host.data.blocks.get(xrefBlockId)?.xref?.status).toBe('loaded');
  });

  it('resuelve colisiones de asset ID con contenido diferente creando nuevo ID', () => {
    const host = createDocument();
    host.transact('seed_host', (tx) => {
      const existingAsset: AssetRecord = {
        id: 'asset_comun',
        name: 'logo_host.png',
        mime: 'image/png',
        size: 100,
        dataUrl: `data:image/png;base64,${btoa('HOST_LOGO_DATA')}`,
      };
      tx.add('assets', existingAsset);
      tx.addEntity<ImageEntity>({
        ...entityDefaults(host),
        type: 'image',
        assetId: 'asset_comun',
        position: { x: 0, y: 0 },
        u: { x: 100, y: 0 },
        v: { x: 0, y: 100 },
        clipEnabled: false,
        opacity: 1,
        fade: 0,
        brightness: 50,
        contrast: 50,
      });
    });

    const src = createDocument();
    src.transact('seed_src', (tx) => {
      const srcAsset: AssetRecord = {
        id: 'asset_comun',
        name: 'plano_xref.png',
        mime: 'image/png',
        size: 999,
        dataUrl: `data:image/png;base64,${btoa('SRC_MAP_DATA')}`,
      };
      tx.add('assets', srcAsset);
      tx.addEntity<ImageEntity>({
        ...entityDefaults(src),
        type: 'image',
        assetId: 'asset_comun',
        position: { x: 0, y: 0 },
        u: { x: 50, y: 0 },
        v: { x: 0, y: 50 },
        clipEnabled: false,
        opacity: 1,
        fade: 0,
        brightness: 50,
        contrast: 50,
      });
    });

    host.transact('XATTACH', (tx) => {
      attachXref(tx, host, readXrefSource(bytesOf(src), 'adjuntos.fmodel'), {
        fileName: 'adjuntos.fmodel',
        path: 'adjuntos.fmodel',
        mode: 'attach',
        source: 'file',
      });
    });

    // El asset original del host debe permanecer intacto
    const hostAsset = host.data.assets.get('asset_comun')!;
    expect(hostAsset).toBeDefined();
    expect(hostAsset.name).toBe('logo_host.png');
    expect(hostAsset.dataUrl).toBe(`data:image/png;base64,${btoa('HOST_LOGO_DATA')}`);

    // Debe haber un segundo asset para la imagen del xref
    expect(host.data.assets.size).toBe(2);
    const xrefImg = [...host.data.entities.values()].find((e) => e.type === 'image' && e.assetId !== 'asset_comun') as ImageEntity;
    expect(xrefImg).toBeDefined();
    const newAsset = host.data.assets.get(xrefImg.assetId)!;
    expect(newAsset).toBeDefined();
    expect(newAsset.name).toBe('plano_xref.png');
    expect(newAsset.dataUrl).toBe(`data:image/png;base64,${btoa('SRC_MAP_DATA')}`);
  });

  it('separa dominios para estilos y no colisiona cuando coinciden sus IDs', () => {
    const src = createDocument();
    const sharedId = 'id_compartido';
    src.transact('seed', (tx) => {
      tx.add('textStyles', {
        id: sharedId,
        name: 'TextoEspecial',
        font: 'Consolas',
        height: 12,
        widthFactor: 1,
        oblique: 0,
        annotative: false,
      });

      const iso = src.data.dimStyles.get('ds-iso25')!;
      tx.add('dimStyles', {
        ...iso,
        id: sharedId,
        name: 'CotaEspecial',
        textStyle: sharedId,
      });

      const stdTbs = src.data.tableStyles.get('tbs-standard')!;
      tx.add('tableStyles', {
        ...stdTbs,
        id: sharedId,
        name: 'TablaEspecial',
        textStyle: sharedId,
      });

      tx.addEntity<TextEntity>({
        ...entityDefaults(src),
        type: 'text',
        text: 'Nota',
        position: { x: 10, y: 10 },
        height: 12,
        rotation: 0,
        widthFactor: 1,
        oblique: 0,
        halign: 'left',
        valign: 'baseline',
        style: sharedId,
      });

      tx.addEntity<DimensionEntity>({
        ...entityDefaults(src),
        type: 'dimension',
        dimType: 'linear',
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        p3: { x: 50, y: 10 },
        rotation: 0,
        style: sharedId,
        overrides: { textStyle: sharedId },
      });

      tx.addEntity<TableEntity>({
        ...entityDefaults(src),
        type: 'table',
        position: { x: 0, y: 0 },
        rotation: 0,
        rowHeights: [10, 10],
        columnWidths: [20, 20],
        cells: [[{ text: 'A' }, { text: 'B' }], [{ text: 'C' }, { text: 'D' }]],
        titleRow: true,
        headerRow: false,
        style: sharedId,
      });
    });

    const host = createDocument();
    host.transact('XATTACH', (tx) => {
      attachXref(tx, host, readXrefSource(bytesOf(src), 'estilos.fmodel'), {
        fileName: 'estilos.fmodel',
        path: 'estilos.fmodel',
        mode: 'attach',
        source: 'file',
      });
    });

    const remappedTs = host.findByName('textStyles', 'estilos|TextoEspecial')!;
    const remappedDs = host.findByName('dimStyles', 'estilos|CotaEspecial')!;
    const remappedTbs = host.findByName('tableStyles', 'estilos|TablaEspecial')!;

    expect(remappedTs).toBeDefined();
    expect(remappedDs).toBeDefined();
    expect(remappedTbs).toBeDefined();

    // Deben tener IDs distintos
    expect(remappedTs.id).not.toBe(remappedDs.id);
    expect(remappedTs.id).not.toBe(remappedTbs.id);
    expect(remappedDs.id).not.toBe(remappedTbs.id);

    // dimStyle y tableStyle deben apuntar al nuevo textStyle remapeado
    expect(remappedDs.textStyle).toBe(remappedTs.id);
    expect(remappedTbs.textStyle).toBe(remappedTs.id);

    // Cada entidad debe referenciar el estilo de su dominio
    const textEnt = [...host.data.entities.values()].find((e) => e.type === 'text') as TextEntity;
    const dimEnt = [...host.data.entities.values()].find((e) => e.type === 'dimension') as DimensionEntity;
    const tableEnt = [...host.data.entities.values()].find((e) => e.type === 'table') as TableEntity;

    expect(textEnt.style).toBe(remappedTs.id);
    expect(dimEnt.style).toBe(remappedDs.id);
    expect(dimEnt.overrides?.textStyle).toBe(remappedTs.id);
    expect(tableEnt.style).toBe(remappedTbs.id);
  });

  it('detecta ciclos circulares indirectos en 3 niveles', () => {
    const docA = createDocument({ title: 'DocA' });
    const docB = createDocument({ title: 'DocB' });
    const docC = createDocument({ title: 'DocC' });

    // A referencia a B
    docA.transact('att', (tx) => {
      attachXref(tx, docA, readXrefSource(bytesOf(docB), 'B.fmodel'), {
        fileName: 'B.fmodel',
        path: 'B.fmodel',
        mode: 'attach',
        source: 'file',
      });
    });

    // B referencia a C
    docB.transact('att', (tx) => {
      attachXref(tx, docB, readXrefSource(bytesOf(docC), 'C.fmodel'), {
        fileName: 'C.fmodel',
        path: 'C.fmodel',
        mode: 'attach',
        source: 'file',
      });
    });

    // Ahora volvemos a enlazar B actualizado en A
    docA.transact('reload_b', (tx) => {
      const bBlock = docA.findByName('blocks', 'B')!;
      reloadXref(tx, docA, bBlock.id, readXrefSource(bytesOf(docB), 'B.fmodel'));
    });

    // Intentar que C referencie a A crearía un ciclo C -> A -> B -> C
    expect(() => {
      docC.transact('att_cycle', (tx) => {
        attachXref(tx, docC, readXrefSource(bytesOf(docA), 'A.fmodel'), {
          fileName: 'A.fmodel',
          path: 'A.fmodel',
          mode: 'attach',
          source: 'file',
        });
      });
    }).toThrow(/circular/i);
  });

  it('overlay anidado no se propaga a niveles superiores', () => {
    const doc0 = sourceDoc();
    const doc1 = createDocument({ title: 'Doc1' });
    doc1.transact('att_overlay', (tx) => {
      const b = attachXref(tx, doc1, readXrefSource(bytesOf(doc0), 'doc0.fmodel'), {
        fileName: 'doc0.fmodel',
        path: 'doc0.fmodel',
        mode: 'overlay',
        source: 'file',
      });
      insertBlock(tx, doc1, b.id, MODEL_SPACE_ID, { x: 0, y: 0 });
    });

    const doc2 = createDocument({ title: 'Doc2' });
    doc2.transact('att_attach', (tx) => {
      attachXref(tx, doc2, readXrefSource(bytesOf(doc1), 'doc1.fmodel'), {
        fileName: 'doc1.fmodel',
        path: 'doc1.fmodel',
        mode: 'attach',
        source: 'file',
      });
    });

    const doc3 = createDocument({ title: 'Doc3' });
    doc3.transact('att_attach', (tx) => {
      attachXref(tx, doc3, readXrefSource(bytesOf(doc2), 'doc2.fmodel'), {
        fileName: 'doc2.fmodel',
        path: 'doc2.fmodel',
        mode: 'attach',
        source: 'file',
      });
    });

    // doc0 nunca debe llegar a doc2 ni a doc3
    expect([...doc2.data.blocks.values()].some((b) => b.name.toLowerCase().includes('doc0'))).toBe(false);
    expect([...doc3.data.blocks.values()].some((b) => b.name.toLowerCase().includes('doc0'))).toBe(false);
  });

  it('bind convierte la referencia en bloque normal funcional y permite bind en estado not-found', () => {
    const src = sourceDoc();
    const host = createDocument();
    let xrefId: string = '';
    host.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host, readXrefSource(bytesOf(src), 'planta.fmodel'), {
        fileName: 'planta.fmodel',
        path: 'planta.fmodel',
        mode: 'attach',
        source: 'file',
      });
      xrefId = b.id;
    });

    // Marcar como not-found (por ejemplo, el archivo fuente se perdió pero el snapshot está presente)
    host.transact('offline', (tx) => {
      markXrefUnavailable(tx, host, xrefId, 'not-found', 'archivo no disponible');
    });

    // Bind debe funcionar y consolidar el snapshot como bloque normal
    host.transact('XBIND', (tx) => {
      bindXref(tx, host, xrefId);
    });

    const boundBlock = host.data.blocks.get(xrefId)!;
    expect(boundBlock.kind).toBe('normal');
    expect(boundBlock.explodable).toBe(true);
    expect(boundBlock.xref).toBeUndefined();

    // Las capas y bloques anidados se renombran con $0$
    expect(host.findByName('blocks', 'planta$0$Puerta')).toBeDefined();
    expect(host.findByName('layers', 'planta$0$Muros')).toBeDefined();

    // Se puede insertar como cualquier bloque normal
    host.transact('insert_bound', (tx) => {
      insertBlock(tx, host, xrefId, MODEL_SPACE_ID, { x: 100, y: 100 });
    });
    const inserts = host.entitiesOf(MODEL_SPACE_ID).filter((e) => e.type === 'insert');
    expect(inserts.length).toBeGreaterThanOrEqual(1);

    // XBIND sobre un bloque descargado (sin snapshot de entidades) debe arrojar error
    const host2 = createDocument();
    let xrefId2: string = '';
    host2.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host2, readXrefSource(bytesOf(src), 'planta2.fmodel'), {
        fileName: 'planta2.fmodel',
        path: 'planta2.fmodel',
        mode: 'attach',
        source: 'file',
      });
      xrefId2 = b.id;
      unloadXref(tx, host2, b.id);
    });

    expect(() => {
      host2.transact('XBIND', (tx) => bindXref(tx, host2, xrefId2));
    }).toThrow(XrefError);
  });

  it('detach limpia recursos propios sin borrar recursos usados por el anfitrión', () => {
    const src = createDocument();
    src.transact('seed', (tx) => {
      tx.add('layers', {
        id: 'lay_propia',
        name: 'MurosPropia',
        color: 'aci:3',
        linetype: 'lt-continuous',
        lineweight: 30,
        transparency: 0,
        on: true,
        frozen: false,
        locked: false,
        plot: true,
        description: '',
        order: 1,
      });
      tx.add('linetypes', {
        id: 'lt_zigzag',
        name: 'ZIGZAG_ESPECIAL',
        description: 'Zigzag',
        pattern: [10, -5],
      });
      tx.add('textStyles', {
        id: 'ts_propio',
        name: 'EstiloUnico',
        font: 'Consolas',
        height: 10,
        widthFactor: 1,
        oblique: 0,
        annotative: false,
      });
      tx.add('assets', {
        id: 'ast_propio',
        name: 'icono.png',
        mime: 'image/png',
        size: 50,
        dataUrl: `data:image/png;base64,${btoa('ICON_DATA')}`,
      });
      tx.addEntity<LineEntity>({
        ...entityDefaults(src),
        layer: 'lay_propia',
        linetype: 'lt_zigzag',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
      tx.addEntity<TextEntity>({
        ...entityDefaults(src),
        type: 'text',
        text: 'Nota',
        position: { x: 0, y: 0 },
        height: 10,
        rotation: 0,
        widthFactor: 1,
        oblique: 0,
        halign: 'left',
        valign: 'baseline',
        style: 'ts_propio',
      });
      tx.addEntity<ImageEntity>({
        ...entityDefaults(src),
        type: 'image',
        assetId: 'ast_propio',
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

    const host = createDocument();
    let xrefId: string = '';
    host.transact('XATTACH', (tx) => {
      const b = attachXref(tx, host, readXrefSource(bytesOf(src), 'modulo.fmodel'), {
        fileName: 'modulo.fmodel',
        path: 'modulo.fmodel',
        mode: 'attach',
        source: 'file',
      });
      xrefId = b.id;
    });

    // El host utiliza la capa del xref ('modulo|MurosPropia') para un objeto propio
    const xrefLayer = host.findByName('layers', 'modulo|MurosPropia')!;
    expect(xrefLayer).toBeDefined();

    host.transact('draw_host_line', (tx) => {
      tx.addEntity<LineEntity>({
        ...entityDefaults(host),
        layer: xrefLayer.id,
        type: 'line',
        start: { x: 500, y: 500 },
        end: { x: 600, y: 600 },
      });
    });

    // Desenlazar la referencia
    host.transact('XDETACH', (tx) => {
      detachXref(tx, host, xrefId);
    });

    // 1. El bloque de xref se eliminó
    expect(host.data.blocks.has(xrefId)).toBe(false);

    // 2. La capa 'modulo|MurosPropia' NO debe haberse eliminado porque el host la está usando
    expect(host.data.layers.has(xrefLayer.id)).toBe(true);
    expect(host.findByName('layers', 'modulo|MurosPropia')).toBeDefined();

    // 3. Los recursos NO usados (tipo de línea, estilo de texto, asset) SÍ deben limpiarse
    expect(host.findByName('linetypes', 'modulo|ZIGZAG_ESPECIAL')).toBeUndefined();
    expect(host.findByName('textStyles', 'modulo|EstiloUnico')).toBeUndefined();
    expect([...host.data.assets.values()].some((a) => a.dataUrl === `data:image/png;base64,${btoa('ICON_DATA')}`)).toBe(false);
  });
});
