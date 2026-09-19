import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDocument, DIMSTYLE_ISO_ID, LAYER0_ID } from '../document/defaults';
import type { Entity } from '../document/types';
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

function makeValidItem() {
  const doc = createDocument();
  installDynamicSamples(doc);
  const pkg = packageBlock(doc, doc.findByName('blocks', 'FM Panel ajustable')!.id);
  return makeLibraryBlock(pkg, { name: 'Panel', categoryId: 'cat-est-perfiles', tags: ['acero'] });
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
      id: 'ent-bad-owner',
      type: 'line',
      owner: 'blk-inexistente',
      layer: LAYER0_ID,
      color: 'ByBlock',
      linetype: 'ByBlock',
      linetypeScale: 1,
      lineweight: -2,
      transparency: 'ByBlock',
      visible: true,
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
    (item.package.entities[0] as unknown as Record<string, unknown>).style = 'ts-inexistente';
    const archive = {
      'manifest.json': strToU8(JSON.stringify({
        format: 'fmodel-library',
        version: 1,
        categories: [],
        blocks: [{ id: item.id, name: item.name, file: `blocks/${item.id}.json` }],
      })),
      [`blocks/${item.id}.json`]: strToU8(JSON.stringify(item)),
    };
    expect(() => readLibraryArchive(zipSync(archive))).toThrow(/estilo inexistente|missing style/i);
  });

  it('rechaza inserción o matriz que apunta a un bloque inexistente', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      id: 'ent-bad-insert',
      type: 'insert',
      owner: item.package.root,
      layer: LAYER0_ID,
      color: 'ByBlock',
      linetype: 'ByBlock',
      linetypeScale: 1,
      lineweight: -2,
      transparency: 'ByBlock',
      visible: true,
      blockId: 'blk-inexistente',
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
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

  it('rechaza bloques dinámicos con referencias inexistentes', () => {
    const itemVis = structuredClone(makeValidItem());
    itemVis.package.blocks[0].dynamic = {
      parameters: [
        {
          id: 'p1',
          type: 'visibility',
          name: 'V',
          label: 'V',
          states: [{ name: 'S1', visible: ['ent-inexistente'] }],
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
      parameters: [{ id: 'p1', type: 'linear', name: 'L', label: 'L' } as never],
      actions: [
        {
          id: 'a1',
          type: 'move',
          name: 'M',
          paramId: 'p1',
          selection: ['ent-inexistente'],
        } as never,
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

  it('rechaza LibraryBlock con tags, source o thumbnail inválidos', () => {
    const item = makeValidItem();
    expect(() => validateLibraryBlock({ ...item, tags: [123 as unknown as string] })).toThrow(/etiquetas no válidas|invalid tags/i);
    expect(() => validateLibraryBlock({ ...item, source: { kind: 'alien' as never } })).toThrow(/tipo de origen no válido|invalid source kind/i);
    expect(() => validateLibraryBlock({ ...item, thumbnail: 123 as unknown as string })).toThrow(/miniatura no válida|invalid thumbnail/i);
  });

  it('permite bloques con cotas usando estilos de cota estándar', () => {
    const item = makeValidItem();
    item.package.entities.push({
      id: 'dim-1',
      type: 'dimension',
      dimType: 'aligned',
      owner: item.package.root,
      layer: LAYER0_ID,
      style: DIMSTYLE_ISO_ID,
      overrides: {},
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).not.toThrow();
  });

  it('rechaza entidades de cota con estilo de cota inexistente', () => {
    const item = makeValidItem();
    item.package.entities.push({
      id: 'dim-bad',
      type: 'dimension',
      dimType: 'aligned',
      owner: item.package.root,
      layer: LAYER0_ID,
      style: 'ds-fantasma',
      overrides: {},
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).toThrow(/estilo inexistente|missing style/i);
  });

  it('rechaza paquete con referencia circular entre bloques', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      id: 'ins-self',
      type: 'insert',
      owner: item.package.root,
      blockId: item.package.root,
      layer: LAYER0_ID,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    } as unknown as Entity);
    expect(() => validateBlockPackage(item.package)).toThrow(/referencia circular|circular/i);
  });

  it('rechaza directriz múltiple con bloque inexistente', () => {
    const item = structuredClone(makeValidItem());
    item.package.entities.push({
      id: 'ml-bad',
      type: 'mleader',
      owner: item.package.root,
      layer: LAYER0_ID,
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
      id: 'ent-hijo',
      type: 'line',
      owner: secondBlockId,
      layer: LAYER0_ID,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    } as unknown as Entity);

    const rootBlock = item.package.blocks.find((b) => b.id === item.package.root)!;
    rootBlock.dynamic = {
      parameters: [{ id: 'p1', type: 'linear', name: 'L', label: 'L' } as never],
      actions: [
        {
          id: 'a1',
          type: 'move',
          name: 'M',
          paramId: 'p1',
          selection: ['ent-hijo'],
        } as never,
      ],
      constraints: [],
      lookups: [],
      variables: [],
      propertyOrder: [],
    };
    expect(() => validateBlockPackage(item.package)).toThrow(/referencia inexistente|missing reference/i);
  });
});
