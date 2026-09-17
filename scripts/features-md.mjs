#!/usr/bin/env node
/**
 * Genera docs/FEATURES.md a partir de src/app/features.ts (la misma fuente que la ayuda de la
 * aplicación). Requiere Node ≥ 23.6 (importa TypeScript eliminando tipos).
 *
 * Uso: node scripts/features-md.mjs          escribe el archivo
 *      node scripts/features-md.mjs --check  falla si el archivo no está al día (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { FEATURES, STATUS_LABEL } = await import(resolve(root, 'src/app/features.ts'));
const target = resolve(root, 'docs/FEATURES.md');

const counts = {};
for (const f of FEATURES) counts[f.status] = (counts[f.status] ?? 0) + 1;
const areas = [...new Set(FEATURES.map((f) => f.area.es))];
const lines = [
  '# Estado de funciones de FModel 2D CAD',
  '',
  '> Archivo generado con `node scripts/features-md.mjs` desde `src/app/features.ts`, la misma fuente que la pestaña «Estado de funciones» de la ayuda (F1). No lo edites a mano.',
  '',
  Object.entries(STATUS_LABEL)
    .map(([k, v]) => `**${v.es}**: ${counts[k] ?? 0}`)
    .join(' · '),
  '',
  '- **Disponible**: funciona de extremo a extremo y tiene pruebas.',
  '- **Experimental**: funciona con limitaciones documentadas.',
  '- **Planeado**: no implementado todavía; no hay botones que lo simulen.',
  '- **No comprometido**: fuera de alcance por motivos legales o técnicos.',
  '',
];
for (const area of areas) {
  lines.push(`## ${area}`, '', '| Función | Estado | Comandos | Notas |', '|---|---|---|---|');
  for (const f of FEATURES.filter((x) => x.area.es === area)) {
    const cmds = (f.commands ?? []).map((c) => `\`${c}\``).join(' ');
    lines.push(`| ${f.name.es} | ${STATUS_LABEL[f.status].es} | ${cmds} | ${f.note?.es ?? ''} |`);
  }
  lines.push('');
}
const out = lines.join('\n');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    /* no existe */
  }
  if (current !== out) {
    console.error('✖ docs/FEATURES.md no está al día: ejecuta node scripts/features-md.mjs');
    process.exit(1);
  }
  console.log('✔ docs/FEATURES.md al día.');
} else {
  writeFileSync(target, out);
  console.log(`✔ docs/FEATURES.md (${FEATURES.length} funciones).`);
}
