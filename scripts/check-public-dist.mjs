#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = `${prefix}${entry.name}`;
    return entry.isDirectory() ? walk(join(dir, entry.name), `${name}/`) : [name];
  });
}
try {
  const files = walk(root);
  for (const required of ['index.html', 'sw.js', 'manifest.webmanifest']) {
    if (!files.includes(required)) throw new Error(`missing ${required}`);
  }
  const forbidden = /libredwg|@mlightcad|io[\\/]dwg[\\/](?:readDwg|wasmUrl|dwgToDxf)(?:\.ts)?(?:["'`?\s]|$)|dwg_read_data|dwg_write_dxf|Dwg_File_Type/i;
  const violations = [];
  for (const name of files) {
    const content = readFileSync(join(root, name)).toString('utf8');
    if (forbidden.test(name) || forbidden.test(content)) violations.push(`${name}: experimental reader reference`);
    if (name.endsWith('.webmanifest')) {
      const manifest = JSON.parse(content);
      for (const handler of manifest.file_handlers ?? []) {
        if (Object.entries(handler.accept ?? {}).some(([mime, extensions]) => /application\/acad/i.test(mime) || (Array.isArray(extensions) && extensions.some(ext => /^\.dwg$/i.test(ext))))) {
          violations.push(`${name}: DWG file handler`);
        }
      }
    }
  }
  if (violations.length) throw new Error(violations.join('\n'));

  console.log(`Public artifact: inspected ${files.length} files; no experimental reader or DWG file handler.`);
} catch (err) {
  console.error(`Public artifact rejected: ${err.message}`);
  process.exitCode = 1;
}
