import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'fmodel-public-dist-'));
  roots.push(root);
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'sw.js'), 'const ASSETS = ["index.html", "manifest.webmanifest"];');
  writeFileSync(join(root, 'manifest.webmanifest'), JSON.stringify({ file_handlers: [{ accept: { 'application/x-fmodel': ['.fmodel'], 'application/dxf': ['.dxf'] } }] }));
  return root;
}
function check(root: string) {
  return spawnSync(process.execPath, ['scripts/check-public-dist.mjs', root], { encoding: 'utf8' });
}
it('accepts a native/DXF public artifact with its manifest and service worker', () => {
  const root = fixture();
  writeFileSync(join(root, 'assets/catalog.js'), 'const testFile = "src/io/dwg/readDwg.test.ts";');
  const result = check(root);
  expect(result.status, result.stderr).toBe(0);
});
it.each([
  ['assets/libredwg-web.wasm', 'binary'],
  ['assets/runtime.js', 'import("@mlightcad/libredwg-web")'],
  ['assets/runtime.js.map', '{"sources":["../../src/io/dwg/readDwg.ts"]}'],
  ['sw.js', 'const ASSETS = ["assets/libredwg-web.wasm"];'],
  ['manifest.webmanifest', '{"file_handlers":[{"accept":{"application/acad":[".dwg"]}}]}'],
])('rejects forbidden reader or file-handler evidence in %s', (file, contents) => {
  const root = fixture();
  writeFileSync(join(root, file), contents);
  const result = check(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(file);
});
