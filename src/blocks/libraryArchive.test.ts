import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  createDocument,
  DIMSTYLE_ISO_ID,
  entityDefaults,
  LAYER0_ID,
  MLEADERSTYLE_STANDARD_ID,
  MLINESTYLE_STANDARD_ID,
  TABLESTYLE_STANDARD_ID,
  TEXTSTYLE_STANDARD_ID,
} from '../document/defaults';
import type {
  AssetRecord,
  DimensionEntity,
  Entity,
  HatchEntity,
  ImageEntity,
  LeaderEntity,
  LineEntity,
  MLeaderEntity,
  MLineEntity,
  MTextEntity,
  PdfUnderlayEntity,
  TableEntity,
} from '../document/types';
import { INPUT_LIMITS } from '../io/limits';
import { importBlockPackage, makeLibraryBlock, packageBlock } from './library';
import {
  readLibraryArchive,
  validateBlockPackage,
  validateLibraryBlock,
  validateLibraryCategories,
  writeLibraryArchive,
} from './libraryArchive';
import { DEFAULT_CATEGORIES } from './libraryCategories';
import { installDynamicSamples } from './samples';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

function makeValidItem() {
  const doc = createDocument();
  installDynamicSamples(doc);
  const pkg = packageBlock(doc, doc.findByName('blocks', 'FM Panel ajustable')!.id);
  return makeLibraryBlock(pkg, { name: 'Panel', categoryId: 'cat-est-perfiles', tags: ['acero'] });
}

function completeEntityBase(id: string, owner: string) {
  return {
    id,
    owner,
    layer: LAYER0_ID,
    color: 'ByBlock',
    linetype: 'ByBlock',
    linetypeScale: 1,
    lineweight: -2,
    transparency: 'ByBlock' as const,
    visible: true,
    order: 999,
  };
}

describe('archivo .fmodellib', () => {
  it('rechaza miniaturas remotas o SVG con capacidades activas', () => {
    const item = makeValidItem();
    expect(() => validateLibraryBlock({ ...item, thumbnail: 'https://example.com/thumbnail.svg' })).toThrow(/miniatura|thumbnail/i);
    const unsafe = Buffer.from('<svg><script>fetch("https://evil.test")</script></svg>').toString('base64');
    expect(() => validateLibraryBlock({ ...item, thumbnail: `data:image/svg+xml;base64,${unsafe}` })).toThrow(/miniatura|thumbnail/i);
    const external = Buffer.from('<svg><image href="https://evil.test/x.png" /></svg>').toString('base64');
    expect(() => validateLibraryBlock({ ...item, thumbnail: `data:image/svg+xml;base64,${external}` })).toThrow(/miniatura|thumbnail/i);
  });

  it('ida y vuelta con un bloque dinámico', () => {
    const item = makeValidItem();
    const back = readLibraryArchive(writeLibraryArchive({ categories: DEFAULT_CATEGORIES, blocks: [item] }));
    expect(back.categories).toEqual(DEFAULT_CATEGORIES);
    expect(back.blocks).toEqual([item]);
    const target = createDocument();
    const name = importBlockPackage(target, back.blocks[0].package);
    expect(target.findByName('blocks', name)?.dynamic?.parameters.length).toBe(item.package.blocks.find((b) => b.id === item.package.root)!.dynamic!.parameters.length);
  });

  it('empaqueta y restaura recursos, asociaciones y estilos personalizados sin romper paquetes v1 simples', () => {
    const source = createDocument();
    const rootId = 'blk-library-roundtrip';
    const symbolId = 'blk-library-symbol';
    const textStyleId = 'ts-library-custom';
    const dimStyleId = 'ds-library-custom';
    const mleaderStyleId = 'mls-library-custom';
    const tableStyleId = 'tbs-library-custom';
    const mlineStyleId = 'mlns-library-custom';
    const linetypeId = 'lt-library-custom';
    const blockBase = {
      kind: 'normal' as const,
      basePoint: { x: 0, y: 0 },
      description: '',
      units: 'mm' as const,
      explodable: true,
      scaleUniformly: false,
      annotative: false,
      revision: 1,
    };

    source.transact('LIBRARY_FIXTURE', (tx) => {
      tx.add('blocks', { ...blockBase, id: rootId, name: 'Library Roundtrip' });
      tx.add('blocks', { ...blockBase, id: symbolId, name: 'Library Symbol' });
      tx.add('linetypes', { id: linetypeId, name: 'Library Dash', description: '', pattern: [2, -1] });
      tx.add('textStyles', { ...source.data.textStyles.get(TEXTSTYLE_STANDARD_ID)!, id: textStyleId, name: 'Library Text' });
      tx.add('dimStyles', { ...source.data.dimStyles.get(DIMSTYLE_ISO_ID)!, id: dimStyleId, name: 'Library Dimensions', textStyle: textStyleId });
      tx.add('mleaderStyles', {
        ...source.data.mleaderStyles.get(MLEADERSTYLE_STANDARD_ID)!,
        id: mleaderStyleId,
        name: 'Library Multileader',
        contentType: 'block',
        blockId: symbolId,
        textStyle: textStyleId,
      });
      tx.add('tableStyles', { ...source.data.tableStyles.get(TABLESTYLE_STANDARD_ID)!, id: tableStyleId, name: 'Library Table', textStyle: textStyleId });
      tx.add('mlineStyles', {
        ...source.data.mlineStyles.get(MLINESTYLE_STANDARD_ID)!,
        id: mlineStyleId,
        name: 'Library Mline',
        elements: [{ offset: 0.5, color: 'ByLayer', linetype: linetypeId }],
      });
      tx.add('assets', { id: 'asset-library-image', name: 'library.png', mime: 'image/png', size: 70, dataUrl: PNG } satisfies AssetRecord);
      tx.add('assets', { id: 'asset-library-pdf', name: 'library.pdf', mime: 'application/pdf', size: 9, dataUrl: PDF, pages: 1 } satisfies AssetRecord);

      tx.addEntity<LineEntity>({ ...entityDefaults(source, rootId), id: 'line-library-assoc', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
      tx.addEntity<LineEntity>({ ...entityDefaults(source, symbolId), id: 'line-library-symbol', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
      tx.addEntity<MTextEntity>({
        ...entityDefaults(source, rootId), id: 'note-library', type: 'mtext', position: { x: 0, y: 4 }, width: 20,
        height: 2.5, rotation: 0, style: textStyleId, attachment: 1, lineSpacing: 1, contents: 'Library note',
      });
      tx.addEntity<DimensionEntity>({
        ...entityDefaults(source, rootId), id: 'dimension-library', type: 'dimension', dimType: 'aligned', style: dimStyleId,
        overrides: {}, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, p3: { x: 5, y: 2 }, rotation: 0,
        assoc: [{ point: 'p1', entityId: 'line-library-assoc', snap: 'endpoint-start' }],
      });
      tx.addEntity<HatchEntity>({
        ...entityDefaults(source, rootId), id: 'hatch-library', type: 'hatch', loops: [{ closed: true, vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
        pattern: { type: 'solid', name: 'SOLID', angle: 0, scale: 1, spacing: 1, double: false }, origin: { x: 0, y: 0 }, islandStyle: 'normal', associative: ['line-library-assoc'],
      });
      tx.addEntity<LeaderEntity>({
        ...entityDefaults(source, rootId), id: 'leader-library', type: 'leader', vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        style: dimStyleId, arrow: 'closed-filled', splined: false, hookline: false, annotation: 'note-library',
      });
      tx.addEntity<MLeaderEntity>({
        ...entityDefaults(source, rootId), id: 'mleader-library', type: 'mleader', style: mleaderStyleId,
        leaders: [{ vertices: [{ x: 0, y: 0 }, { x: 2, y: 2 }] }], landing: { x: 2, y: 2 }, doglegLength: 1, direction: 1,
        content: { type: 'block', blockId: symbolId, scale: 1, rotation: 0, attributes: {} },
        overrides: { blockId: symbolId, textStyle: textStyleId },
      });
      tx.addEntity<TableEntity>({
        ...entityDefaults(source, rootId), id: 'table-library', type: 'table', position: { x: 0, y: 0 }, rotation: 0, style: tableStyleId,
        rowHeights: [2], columnWidths: [5], cells: [[{ text: 'cell' }]], titleRow: false, headerRow: false,
      });
      tx.addEntity<MLineEntity>({
        ...entityDefaults(source, rootId), id: 'mline-library', type: 'mline', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }],
        closed: false, style: mlineStyleId, scale: 1, justification: 'zero',
      });
      tx.addEntity<ImageEntity>({
        ...entityDefaults(source, rootId), id: 'image-library', type: 'image', assetId: 'asset-library-image', position: { x: 0, y: 0 },
        u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, clipEnabled: false, opacity: 1, fade: 0, brightness: 50, contrast: 50,
      });
      tx.addEntity<PdfUnderlayEntity>({
        ...entityDefaults(source, rootId), id: 'pdf-library', type: 'pdfunderlay', assetId: 'asset-library-pdf', page: 1,
        position: { x: 0, y: 0 }, scale: 1, rotation: 0, clipEnabled: false, opacity: 1, fade: 0, monochrome: false,
      });
    });

    const pkg = packageBlock(source, rootId);
    const item = makeLibraryBlock(pkg, { name: 'Roundtrip', categoryId: 'cat-arq', tags: [] });
    const archive = readLibraryArchive(writeLibraryArchive({ categories: DEFAULT_CATEGORIES, blocks: [item] }));
    const target = createDocument();
    const importedName = importBlockPackage(target, archive.blocks[0].package);
    const importedRoot = target.findByName('blocks', importedName)!;
    const importedEntities = target.entitiesOf(importedRoot.id);

    // Preserve IDs in metadata only for locating the remapped records in the assertions.
    expect(pkg.assets?.map((asset) => asset.id)).toEqual(['asset-library-image', 'asset-library-pdf']);
    expect(pkg.dimStyles?.map((style) => style.id)).toContain(dimStyleId);
    expect(pkg.mleaderStyles?.map((style) => style.id)).toContain(mleaderStyleId);
    expect(pkg.tableStyles?.map((style) => style.id)).toContain(tableStyleId);
    expect(pkg.mlineStyles?.map((style) => style.id)).toContain(mlineStyleId);
    expect(target.data.assets.size).toBeGreaterThanOrEqual(2);
    expect(target.findByName('textStyles', 'Library Text')).toBeDefined();
    expect(target.findByName('dimStyles', 'Library Dimensions')?.textStyle).toBe(target.findByName('textStyles', 'Library Text')?.id);
    expect(target.findByName('mleaderStyles', 'Library Multileader')?.blockId).toBe(target.findByName('blocks', 'Library Symbol')?.id);
    expect(target.findByName('tableStyles', 'Library Table')?.textStyle).toBe(target.findByName('textStyles', 'Library Text')?.id);
    expect(target.findByName('mlineStyles', 'Library Mline')?.elements[0].linetype).toBe(target.findByName('linetypes', 'Library Dash')?.id);

    const dimension = importedEntities.find((entity) => entity.type === 'dimension' && entity.id !== 'dimension-library') as DimensionEntity;
    const hatch = importedEntities.find((entity) => entity.type === 'hatch') as HatchEntity;
    const leader = importedEntities.find((entity) => entity.type === 'leader') as LeaderEntity;
    const image = importedEntities.find((entity) => entity.type === 'image') as ImageEntity;
    const pdf = importedEntities.find((entity) => entity.type === 'pdfunderlay') as PdfUnderlayEntity;
    const mleader = importedEntities.find((entity) => entity.type === 'mleader') as MLeaderEntity;
    const table = importedEntities.find((entity) => entity.type === 'table') as TableEntity;
    const mline = importedEntities.find((entity) => entity.type === 'mline') as MLineEntity;
    const note = importedEntities.find((entity) => entity.type === 'mtext') as MTextEntity;
    expect(dimension.assoc?.[0].entityId).toBe(importedEntities.find((entity) => entity.type === 'line' && entity.owner === importedRoot.id)!.id);
    expect(hatch.associative?.[0]).toBe(dimension.assoc?.[0].entityId);
    expect(leader.annotation).toBe(note.id);
    expect(target.data.dimStyles.get(dimension.style)?.name).toBe('Library Dimensions');
    expect(target.data.dimStyles.get(leader.style)?.name).toBe('Library Dimensions');
    expect(target.data.mleaderStyles.get(mleader.style)?.name).toBe('Library Multileader');
    expect(mleader.overrides?.blockId).toBe(target.findByName('blocks', 'Library Symbol')?.id);
    expect(mleader.overrides?.textStyle).toBe(note.style);
    expect(target.data.tableStyles.get(table.style)?.name).toBe('Library Table');
    expect(target.data.mlineStyles.get(mline.style)?.name).toBe('Library Mline');
    expect(target.data.assets.get(image.assetId)?.dataUrl).toBe(PNG);
    expect(target.data.assets.get(pdf.assetId)?.dataUrl).toBe(PDF);
    expect(target.data.blocks.get(mleader.content.type === 'block' ? mleader.content.blockId : '')?.name).toBe('Library Symbol');

    const legacyDoc = createDocument();
    const legacyRoot = 'blk-legacy-package';
    legacyDoc.transact('LEGACY_PACKAGE', (tx) => {
      tx.add('blocks', { ...blockBase, id: legacyRoot, name: 'Legacy package' });
      tx.addEntity<LineEntity>({ ...entityDefaults(legacyDoc, legacyRoot), id: 'legacy-line', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    });
    const legacy = packageBlock(legacyDoc, legacyRoot);
    delete legacy.dimStyles;
    delete legacy.mleaderStyles;
    delete legacy.tableStyles;
    delete legacy.mlineStyles;
    delete legacy.assets;
    expect(() => validateBlockPackage(legacy)).not.toThrow();

    const incomplete = structuredClone(pkg);
    delete incomplete.assets;
    expect(() => validateBlockPackage(incomplete)).toThrow(/recurso no incluido|asset not included/i);
    const missingStyle = structuredClone(pkg);
    delete missingStyle.dimStyles;
    expect(() => validateBlockPackage(missingStyle)).toThrow(/estilo no incluido|style not included/i);
    const missingAssocTarget = structuredClone(pkg);
    missingAssocTarget.entities = missingAssocTarget.entities.filter((entity) => entity.id !== 'line-library-assoc');
    expect(() => validateBlockPackage(missingAssocTarget)).toThrow(/referencia asociativa no incluida|associative target not included/i);
  });

  it('no escribe una biblioteca con más entradas ZIP de las que admite el lector', () => {
    const item = makeValidItem();
    const blocks = Array.from({ length: INPUT_LIMITS.maxZipEntries }, (_, index) => ({ ...item, id: `item-${index}` }));

    expect(() => writeLibraryArchive({ categories: DEFAULT_CATEGORIES, blocks })).toThrow(/demasiado grande|too large/i);
  });

  it('rechaza archivos ajenos o de versión posterior', () => {
    expect(() => readLibraryArchive(new Uint8Array([1, 2, 3]))).toThrow(/biblioteca/);
    const future = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 9, categories: [], blocks: [] })) });
    expect(() => readLibraryArchive(future)).toThrow(/versión/);
    const missing = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 1, categories: [], blocks: [{ id: 'x', file: 'blocks/x.json' }] })) });
    expect(() => readLibraryArchive(missing)).toThrow(/blocks\/x\.json/);
  });

  it('rechaza un ZIP con demasiadas entradas antes de extraerlo', () => {
    const files = Object.fromEntries(Array.from({ length: 1_001 }, (_, i) => [`blocks/${i}.json`, strToU8('{}')]));
    files['manifest.json'] = strToU8('{}');

    expect(() => readLibraryArchive(zipSync(files))).toThrow(/demasiado grande|too large/i);
  });

  it('rechaza manifiestos con índices de bloques inválidos', () => {
    const invalid = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 1, categories: [], blocks: null })) });

    expect(() => readLibraryArchive(invalid)).toThrow(/biblioteca/i);
  });

  it('rechaza bloques sin paquete válido', () => {
    const invalid = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 1, categories: [], blocks: [{ id: 'b1', file: 'blocks/b1.json' }] })),
      'blocks/b1.json': strToU8('{}'),
    });

    expect(() => readLibraryArchive(invalid)).toThrow(/no es un objeto válido|invalid/i);
  });

  it('rechaza categorías con categoría padre inexistente', () => {
    expect(() => validateLibraryCategories([{ id: 'c1', name: 'Cat 1', order: 0, parent: 'cat-inexistente' }])).toThrow(/padre inexistente|missing parent/i);

    const item = makeValidItem();
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [{ id: 'c1', name: 'Cat 1', order: 0, parent: 'cat-inexistente' }],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/padre inexistente|missing parent/i);
  });

  it('rechaza ciclos en la jerarquía de categorías', () => {
    const item = makeValidItem();
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [
          { id: 'cat-a', name: 'Cat A', order: 0, parent: 'cat-b' },
          { id: 'cat-b', name: 'Cat B', order: 1, parent: 'cat-a' },
        ],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/ciclo detectado|cycle detected/i);
  });

  it('rechaza categorías con más de 2 niveles de profundidad', () => {
    const item = makeValidItem();
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [
          { id: 'root-cat', name: 'Root', order: 0 },
          { id: 'sub-cat', name: 'Sub', order: 0, parent: 'root-cat' },
          { id: 'deep-cat', name: 'Deep', order: 0, parent: 'sub-cat' },
        ],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/profundidad máxima|maximum supported depth/i);
  });

  it('rechaza una categoría que es su propio padre', () => {
    const item = makeValidItem();
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [{ id: 'cat-self', name: 'Self', order: 0, parent: 'cat-self' }],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/su propio padre|own parent/i);
  });

  it('rechaza manifiesto con entradas duplicadas (mismo id o mismo file)', () => {
    const item = makeValidItem();
    const dupId = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [
          { id: item.id, name: item.name, file: `blocks/${item.id}.json` },
          { id: item.id, name: 'Otro', file: `blocks/${item.id}.json` },
        ],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(dupId))).toThrow(/duplicado|duplicate/i);

    const dupFile = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [
          { id: 'b1', name: 'B1', file: 'blocks/shared.json' },
          { id: 'b2', name: 'B2', file: 'blocks/shared.json' },
        ],
      })),
      'blocks/shared.json': strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(dupFile))).toThrow(/duplicad|duplicate/i);
  });

  it('rechaza cuando manifest id != block.id', () => {
    const item = makeValidItem();
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: 'id-manifest', name: item.name, file: 'blocks/id-manifest.json' }],
      })),
      'blocks/id-manifest.json': strToU8(JSON.stringify({ ...item, id: 'id-diferente' })),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/no coincide con el manifiesto|does not match manifest/i);
  });

  it('rechaza rutas no seguras o que no coincidan con blocks/<id>.json', () => {
    const traversal = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: 'b1', name: 'B1', file: 'blocks/../manifest.json' }],
      })),
    };
    expect(() => readLibraryArchive(zipSync(traversal))).toThrow(/ruta de bloque no válida|invalid block file path/i);
  });

  it('rechaza paquete con definición raíz inexistente', () => {
    const item = makeValidItem();
    const badPackage = { ...item, package: { ...item.package, root: 'blk-inexistente' } };
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: badPackage.id, name: badPackage.name, file: `blocks/${badPackage.id}.json` }],
      })),
      [`blocks/${badPackage.id}.json`]: strToU8(JSON.stringify(badPackage)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/definición raíz.*no existe|root.*missing/i);
  });

  it('rechaza entidades con propietario inexistente', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      ...completeEntityBase('ent-bad-owner', 'blk-inexistente'),
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
    } as Entity);
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/propietario inexistente|missing owner/i);
  });

  it('rechaza entidades con capa inexistente', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities[0].layer = 'layer-inexistente';
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/capa inexistente|missing layer/i);
  });

  it('rechaza entidades con estilo inexistente', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      ...completeEntityBase('mtext-style-bad', item.package.root),
      type: 'mtext',
      position: { x: 0, y: 0 },
      width: 10,
      height: 2.5,
      rotation: 0,
      style: 'ts-inexistente',
      attachment: 1,
      lineSpacing: 1,
      contents: 'Texto',
    } as unknown as Entity);
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/estilo (no incluido|inexistente)|style (not included|missing)/i);
  });

  it('rechaza inserción o matriz que apunta a un bloque inexistente', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      ...completeEntityBase('ent-bad-insert', item.package.root),
      type: 'insert',
      blockId: 'blk-inexistente',
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      attributes: [],
    } as unknown as Entity);
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/bloque inexistente|missing block/i);
  });

  it('rechaza paquetes con valores numéricos no finitos', () => {
    const item = structuredClone(makeValidItem());
    expect(() => {
      validateBlockPackage({
        ...item.package,
        blocks: [{ ...item.package.blocks[0], basePoint: { x: NaN, y: 0 } }],
      });
    }).toThrow(/número no finito|non-finite/i);

    expect(() => {
      validateLibraryBlock({
        ...item,
        savedAt: Infinity,
      });
    }).toThrow(/no válida|invalid/i);
  });

  it('rechaza entidades truncadas antes de importar una biblioteca', () => {
    const item = makeValidItem();
    item.package.entities.push({
      ...completeEntityBase('linea-truncada', item.package.root),
      type: 'line',
      start: { x: 0, y: 0 },
    } as unknown as Entity);

    expect(() => validateBlockPackage(item.package)).toThrow(/estructura|structure/i);
  });

  it('rechaza bloques dinámicos con referencias inexistentes', () => {
    const itemVis = structuredClone(makeValidItem());
    itemVis.package.blocks[0].dynamic = {
      parameters: [
        {
          id: 'p1',
          type: 'visibility',
          name: 'V',
          label: 'V',
          showInProperties: true,
          chainActions: false,
          gripCount: 1,
          position: { x: 0, y: 0 },
          states: [{ name: 'S1', visible: ['ent-inexistente'] }],
          defaultState: 'S1',
        } as never,
      ],
      actions: [],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };
    expect(() => validateBlockPackage(itemVis.package)).toThrow(/referencia inexistente|missing reference/i);

    const itemAct = structuredClone(makeValidItem());
    itemAct.package.blocks[0].dynamic = {
      parameters: [{ id: 'p1', type: 'linear', name: 'L', label: 'L', showInProperties: true, chainActions: false, gripCount: 2, base: { x: 0, y: 0 }, end: { x: 1, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } }],
      actions: [
        {
          id: 'a1',
          type: 'move',
          name: 'M',
          paramId: 'p1',
          selection: ['ent-inexistente'],
          paramPoint: 'end',
          axis: 'x',
          distanceMultiplier: 1,
          angleOffset: 0,
        },
      ],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };
    expect(() => validateBlockPackage(itemAct.package)).toThrow(/referencia inexistente|missing reference/i);

    const itemCon = structuredClone(makeValidItem());
    itemCon.package.blocks[0].dynamic = {
      parameters: [],
      actions: [],
      constraints: [
        {
          id: 'c1',
          kind: 'geometric',
          type: 'coincident',
          enabled: true,
          refs: [{ entityId: 'ent-inexistente', part: 'start' }],
        } as never,
      ],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };
    expect(() => validateBlockPackage(itemCon.package)).toThrow(/referencia inexistente|missing reference/i);
  });

  it('rechaza miembros dinámicos sin la estructura exigida por su discriminante', () => {
    const item = structuredClone(makeValidItem());
    item.package.blocks[0].dynamic = {
      parameters: [{} as never],
      actions: [],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };

    expect(() => validateBlockPackage(item.package)).toThrow(/dinámic|dynamic/i);
  });

  it('rechaza LibraryBlock con tags, source o thumbnail inválidos', () => {
    const item = makeValidItem();
    expect(() => validateLibraryBlock({ ...item, tags: [123 as unknown as string] })).toThrow(/etiquetas no válidas|invalid tags/i);
    expect(() => validateLibraryBlock({ ...item, source: { kind: 'alien' as never } })).toThrow(/tipo de origen no válido|invalid source kind/i);
    expect(() => validateLibraryBlock({ ...item, thumbnail: 123 as unknown as string })).toThrow(/miniatura no válida|invalid thumbnail/i);
  });

  it('permite bloques con cotas usando estilos de cota estándar', () => {
    const item = makeValidItem();
    item.package.entities.push({
      ...completeEntityBase('dim-1', item.package.root),
      type: 'dimension',
      dimType: 'aligned',
      style: DIMSTYLE_ISO_ID,
      overrides: {},
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      p3: { x: 5, y: 2 },
      rotation: 0,
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).not.toThrow();
  });

  it('rechaza entidades de cota con estilo de cota inexistente', () => {
    const item = makeValidItem();
    item.package.entities.push({
      ...completeEntityBase('dim-bad', item.package.root),
      type: 'dimension',
      dimType: 'aligned',
      style: 'ds-fantasma',
      overrides: {},
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      p3: { x: 5, y: 2 },
      rotation: 0,
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).toThrow(/estilo (no incluido|inexistente)|style (not included|missing)/i);
  });

  it('rechaza paquete con referencia circular entre bloques', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      ...completeEntityBase('ins-self', item.package.root),
      type: 'insert',
      blockId: item.package.root,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      attributes: [],
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).toThrow(/referencia circular|circular/i);
  });

  it('rechaza directriz múltiple con bloque inexistente', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      ...completeEntityBase('ml-bad', item.package.root),
      type: 'mleader',
      style: 'Standard',
      leaders: [],
      landing: { x: 0, y: 0 },
      doglegLength: 1,
      direction: 1,
      content: { type: 'block', blockId: 'blk-fantasma', scale: 1, rotation: 0, attributes: {} },
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).toThrow(/directriz.*bloque inexistente|missing block/i);
  });

  it('rechaza cuando el nombre en el manifiesto no coincide con el bloque real', () => {
    const item = makeValidItem();
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: item.id, name: 'Nombre manifiesto', file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify({ ...item, name: 'Nombre diferente' })),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/no coincide con el manifiesto|does not match manifest/i);
  });

  it('rechaza capas que apuntan a tipos de línea inexistentes', () => {
    const item = structuredClone(makeValidItem());
    item.package.layers.push({
      id: 'layer-custom',
      name: 'Custom',
      color: '#ff0000',
      linetype: 'lt-fantasma',
      lineweight: -1,
      transparency: 0,
      on: true,
      locked: false,
      frozen: false,
      plot: true,
      description: '',
      order: 1,
    });
    expect(() => validateBlockPackage(item.package)).toThrow(/tipo de línea inexistente|missing linetype/i);
  });

  it('rechaza entidades con tipos no reconocidos', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      id: 'ent-unknown',
      type: 'alien_type' as never,
      owner: item.package.root,
      layer: LAYER0_ID,
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).toThrow(/tipo de entidad no válido|invalid entity type/i);
  });

  it('rechaza writeLibraryArchive si contiene bloques con identificadores duplicados', () => {
    const item = makeValidItem();
    expect(() => writeLibraryArchive({ categories: [], blocks: [item, item] })).toThrow(/duplicado|duplicate/i);
  });

  it('rechaza manifiestos con versión menor a 1', () => {
    const invalidVer = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'fmodel-library', version: 0, categories: [], blocks: [] })),
    });
    expect(() => readLibraryArchive(invalidVer)).toThrow(/no es una biblioteca de FModel|not an FModel library/i);
  });

  it('rechaza bloque dinámico cuyas referencias apuntan a entidades de otro bloque en el paquete', () => {
    const item = structuredClone(makeValidItem());
    const secondBlockId = 'blk-hijo';
    item.package.blocks.push({
      id: secondBlockId,
      name: 'Hijo',
      kind: 'normal',
      basePoint: { x: 0, y: 0 },
      description: '',
      units: 'unitless',
      explodable: true,
      scaleUniformly: false,
      annotative: false,
      revision: 1,
    });
    item.package.entities.push({
      ...completeEntityBase('ent-hijo', secondBlockId),
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as unknown as Entity);

    const rootBlock = item.package.blocks.find((b) => b.id === item.package.root)!;
    rootBlock.dynamic = {
      parameters: [{ id: 'p1', type: 'linear', name: 'L', label: 'L', showInProperties: true, chainActions: false, gripCount: 2, base: { x: 0, y: 0 }, end: { x: 1, y: 0 }, baseLocation: 'start', valueSet: { kind: 'none' } }],
      actions: [
        {
          id: 'a1',
          type: 'move',
          name: 'M',
          paramId: 'p1',
          selection: ['ent-hijo'],
          paramPoint: 'end',
          axis: 'x',
          distanceMultiplier: 1,
          angleOffset: 0,
        },
      ],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };
    expect(() => validateBlockPackage(item.package)).toThrow(/referencia inexistente|missing reference/i);
  });
});
