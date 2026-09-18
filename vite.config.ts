import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { serviceWorkerSource } from './src/pwa/serviceWorker.ts';

/** Emite sw.js con la lista exacta de archivos de la compilación (sin mapas de fuentes). */
function serviceWorker(): Plugin {
  return {
    name: 'fmodel-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicDir = fileURLToPath(new URL('./public', import.meta.url));
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [relative(publicDir, join(dir, f))]));
      // fuentes: solo woff2 latinas (el resto de subconjuntos se descarga si alguna vez hace falta)
      // el lector DWG (WebAssembly, ~10 MB) no se precarga: se guarda en caché al usarlo
      const wanted = (f: string) => !f.endsWith('.map') && !f.endsWith('.wasm') && f !== 'sw.js' && !(/\.woff2?$/.test(f) && (!f.endsWith('.woff2') || /cyrillic|greek|vietnamese/.test(f)));
      const files = [...new Set(['index.html', ...Object.keys(bundle), ...walk(publicDir)])].filter(wanted).sort();
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(['./', ...files], version) });
    },
  };
}

export default defineConfig({
  base: process.env.FMODEL_BASE ?? '/',
  plugins: [react(), serviceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
