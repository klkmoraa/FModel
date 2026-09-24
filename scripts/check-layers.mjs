#!/usr/bin/env node
/**
 * Verifica la arquitectura por capas de FModel 2D CAD: un módulo solo puede importar
 * (en tiempo de ejecución) módulos de su capa o de capas inferiores. Las importaciones
 * `import type` no crean dependencia en ejecución y no se cuentan.
 *
 *   0  geometry, lib, view            matemáticas puras
 *   1  document, history              modelo de datos y transacciones
 *   2  model, spatial, constraints,   comportamiento de entidades, índice, resolvedor
 *      layers, annotation
 *   3  selection, snap, blocks,       operaciones de dominio sin interfaz; `app` es el
 *      modify, audit, io, storage,    localizador de servicios (solo tipos) y el catálogo
 *      xref, app, templates           de funciones, sin dependencias en ejecución;
 *                                     `templates` construye dibujos de partida con bloques
 *   4  render, output                 dibujo en pantalla y salida vectorial
 *   5  commands, editor               interacción y ejecución de comandos
 *   6  ui, main                       React y arranque
 *
 * Uso: node scripts/check-layers.mjs   (sale con código 1 si hay infracciones)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const LAYERS = {
  geometry: 0,
  geotech: 0,
  lib: 0,
  view: 0,
  document: 1,
  history: 1,
  model: 2,
  spatial: 2,
  constraints: 2,
  layers: 2,
  annotation: 2,
  selection: 3,
  snap: 3,
  blocks: 3,
  modify: 3,
  audit: 3,
  io: 3,
  storage: 3,
  xref: 3,
  app: 3,
  templates: 3,
  render: 4,
  output: 4,
  workers: 4,
  commands: 5,
  editor: 5,
  ui: 6,
  pwa: 6,
  main: 6,
  styles: 6,
};

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const moduleOf = (file) => relative(ROOT, file).split(sep)[0].replace(/\.tsx?$/, '');
const IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

const violations = [];
let checked = 0;
for (const file of files(ROOT)) {
  const from = moduleOf(file);
  const fromLayer = LAYERS[from];
  if (fromLayer === undefined) {
    violations.push(`${relative(ROOT, file)}: módulo «${from}» sin capa asignada en scripts/check-layers.mjs`);
    continue;
  }
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT)) {
    const typeOnly = !!m[2];
    const spec = m[3] ?? m[4];
    if (typeOnly || !spec) continue;
    const target = moduleOf(resolve(dirname(file), spec));
    if (target === from || target.endsWith('.css')) continue;
    const toLayer = LAYERS[target];
    checked++;
    if (toLayer === undefined) violations.push(`${relative(ROOT, file)} → ${spec}: módulo «${target}» sin capa asignada`);
    else if (toLayer > fromLayer) violations.push(`${relative(ROOT, file)} (${from}, capa ${fromLayer}) importa ${spec} (${target}, capa ${toLayer})`);
  }
}

if (violations.length) {
  console.error(`✖ ${violations.length} infracción(es) de capas:\n  ${violations.join('\n  ')}`);
  process.exit(1);
}
console.log(`✔ Arquitectura por capas correcta (${checked} importaciones entre módulos revisadas).`);
