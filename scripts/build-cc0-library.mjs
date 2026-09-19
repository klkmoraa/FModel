import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { unzipSync } from 'fflate';
import { createServer } from 'vite';

// Fuente: https://caddillo.com/downloads/caddillo-blocks-library.zip
// Licencia de la geometría: CC0 1.0, https://caddillo.com/license/
const EXPECTED_SHA256 = '9d5f35093e245158115aa5ead39d31d4b92253e2125b2751e2ef9c05e68e2d72';
const source = process.argv[2];
const thumbnailsFile = process.argv[3];
if (!source || !thumbnailsFile) throw new Error('Uso: node scripts/build-cc0-library.mjs fuente.zip miniaturas.json');
const input = readFileSync(source);
const sha = createHash('sha256').update(input).digest('hex');
if (sha !== EXPECTED_SHA256) throw new Error(`El ZIP público cambió: SHA-256 ${sha}`);

const files = Object.entries(unzipSync(input))
  .filter(([path]) => /^caddillo-blocks\/[\w-]+\/[\w-]+\.dxf$/i.test(path))
  .sort(([a], [b]) => a.localeCompare(b));
if (files.length !== 398) throw new Error(`Se esperaban 398 DXF; se encontraron ${files.length}`);
const thumbnails = JSON.parse(readFileSync(thumbnailsFile, 'utf8'));
if (Object.keys(thumbnails).length !== files.length) throw new Error('Faltan miniaturas para la colección.');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const [{ starterBlock }, { DEFAULT_CATEGORIES }, { writeLibraryArchive, readLibraryArchive }, { decodeDxfBytes }] = await Promise.all([
    server.ssrLoadModule('/src/blocks/starterLibrary.ts'),
    server.ssrLoadModule('/src/blocks/libraryCategories.ts'),
    server.ssrLoadModule('/src/blocks/libraryArchive.ts'),
    server.ssrLoadModule('/src/io/dxf/importDxf.ts'),
  ]);
  const familyCategory = {
    architectural: 'cat-arq',
    'commercial-ada': 'cat-arq',
    'commercial-office': 'cat-mob-oficina',
    'commercial-plumbing': 'cat-ins-sanitarias',
    'commercial-safety': 'cat-ano-simbolos',
    'commercial-security': 'cat-ins-electricas',
    conduit: 'cat-ins-electricas',
    duct: 'cat-ins-clima',
    electrical: 'cat-ins-electricas',
    industrial: 'cat-ins',
    kitchen: 'cat-mob-cocina',
    pid: 'cat-ins',
    plumbing: 'cat-ins-sanitarias',
    'residential-appliance': 'cat-mob-cocina',
    'residential-furniture': 'cat-mob-salon',
    'residential-me': 'cat-ins',
    site: 'cat-urbanismo',
    sprinkler: 'cat-ins-sanitarias',
  };
  const categoryFor = (family, name) => {
    if (family === 'architectural' || family === 'commercial-ada') {
      if (name.startsWith('DOOR-')) return 'cat-arq-puertas';
      if (name.startsWith('WINDOW-')) return 'cat-arq-ventanas';
      if (/STAIR|RAMP|RAIL/.test(name)) return 'cat-arq-escaleras';
    }
    if (family === 'residential-furniture') {
      if (/BED|CLOSET|DRESSER|NIGHTSTAND|COT|WARDROBE/.test(name)) return 'cat-mob-dormitorio';
      if (/DESK|OFFICE|WORKSTATION|FILE-CABINET|CLASSROOM/.test(name)) return 'cat-mob-oficina';
    }
    if (family === 'site' && /CAR-|VEHICLE|BIKE/.test(name)) return 'cat-vehiculos';
    if (family === 'residential-me' && /FAN|AC-|FURNACE/.test(name)) return 'cat-ins-clima';
    if (family === 'residential-me' && /LIGHT|OUTLET|SWITCH/.test(name)) return 'cat-ins-electricas';
    return familyCategory[family];
  };
  const blocks = files.map(([path, bytes]) => {
    const [, family, file] = path.split('/');
    const name = basename(file, '.dxf');
    const category = categoryFor(family, name);
    if (!category) throw new Error(`Categoría desconocida: ${family}`);
    const block = starterBlock(decodeDxfBytes(bytes), { file: path, name, category, units: 'in', stretchable: false });
    if (typeof thumbnails[path] !== 'string' || !thumbnails[path].startsWith('data:image/svg+xml;base64,')) throw new Error(`Miniatura ausente: ${path}`);
    return { ...block, thumbnail: thumbnails[path], tags: ['CC0', family], source: { kind: 'dxf', file: path, importedAt: Date.now() } };
  });
  const unique = new Set(blocks.map((b) => b.name.toLowerCase()));
  if (unique.size !== files.length) throw new Error('Hay nombres de bloque repetidos.');
  const output = writeLibraryArchive({ categories: DEFAULT_CATEGORIES, blocks });
  const check = readLibraryArchive(output);
  if (check.blocks.length !== files.length) throw new Error('La biblioteca nativa no supera la ida y vuelta.');
  writeFileSync('public/library/fmodel-cc0.fmodellib', output);
  process.stdout.write(`Convertidos ${blocks.length} bloques a .fmodellib (${output.length} bytes).\n`);
} finally {
  await server.close();
}
