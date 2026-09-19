import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { computeCacheVersion, serviceWorkerSource } from './src/pwa/serviceWorker.ts';

/** Emite sw.js con la lista exacta de archivos de la compilación (sin mapas de fuentes). */
function serviceWorker(): Plugin {
  return {
    name: 'fmodel-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicDir = fileURLToPath(new URL('./public', import.meta.url));
      const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [relative(publicDir, join(dir, f)).replace(/\\/g, '/')]));
      // fuentes: solo woff2 latinas (el resto de subconjuntos se descarga si alguna vez hace falta).
      // La biblioteca CC0 se carga y cachea bajo demanda; no bloquea la instalación de la PWA.
      const wanted = (f: string) => !f.endsWith('.map') && !f.endsWith('.wasm') && !f.startsWith('library/') && f !== 'sw.js' && !f.startsWith('.') && !f.includes('/.') && !(/\.woff2?$/.test(f) && (!f.endsWith('.woff2') || /cyrillic|greek|vietnamese/.test(f)));
      const files = [...new Set(['index.html', ...Object.keys(bundle), ...walk(publicDir)])].filter(wanted).sort();
      const entries = files.map((file) => {
        const chunk = bundle[file];
        if (chunk) {
          return { name: file, content: chunk.type === 'chunk' ? chunk.code : chunk.source };
        }
        const pub = join(publicDir, file);
        if (existsSync(pub)) {
          return { name: file, content: readFileSync(pub) };
        }
        return { name: file };
      });
      const version = computeCacheVersion(entries);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(['./', ...files], version) });
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: process.env.FMODEL_BASE ?? '/',
  // versión visible en la interfaz sin importar package.json desde el código de la aplicación
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/**/*.css',
        'src/main.tsx',
        'src/workers/heavy.worker.ts',
      ],
      thresholds: {
        lines: 48,
        statements: 45,
        branches: 34,
        functions: 34,
        'src/document/**': {
          lines: 85,
          statements: 80,
        },
        'src/storage/**': {
          lines: 70,
          statements: 70,
        },
        'src/geometry/**': {
          lines: 65,
          statements: 65,
        },
        'src/io/native*': {
          lines: 80,
          statements: 80,
          branches: 65,
          functions: 70,
        },
      },
    },
  },
});
