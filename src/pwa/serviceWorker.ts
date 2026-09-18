import { createHash } from 'node:crypto';

export interface CacheEntryInput {
  name: string;
  content?: string | Uint8Array;
}

/**
 * Calcula un hash de versión único reproducible a partir de la lista de archivos y su contenido real.
 * Si cambia el contenido de cualquier asset público (manifiesto, iconos) o chunk de código sin cambiar
 * el nombre, la versión de caché resultante cambia obligando a un nuevo ciclo de service worker.
 */
export function computeCacheVersion(entries: CacheEntryInput[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const hash = createHash('sha256');
  for (const entry of sorted) {
    hash.update(entry.name);
    hash.update(':');
    if (entry.content) {
      hash.update(typeof entry.content === 'string' ? entry.content : entry.content);
    }
    hash.update(';');
  }
  return hash.digest('hex').slice(0, 12);
}

/**
 * Código del service worker, generado en la compilación con la lista exacta de archivos
 * (vite.config.ts). Estrategia:
 * - instalación: precarga todos los recursos de la versión (la app funciona sin conexión
 *   desde la primera visita completa, incluidos los módulos que se cargan bajo demanda);
 * - navegación: red primero; si falla la red o el servidor responde con error no exitoso (!res.ok),
 *   cae en el index.html precargado para mantener la SPA funcionando;
 * - recursos de versión: caché primero;
 * - biblioteca inicial y WASM pesado: excluidos del precache para limitar el bundle inicial;
 *   se obtienen bajo demanda y se cachean en tiempo de ejecución (cache-first tras primer uso);
 * - una versión nueva purga cachés antiguas al activarse y espera a skip-waiting (no se mezclan versiones).
 */
export function serviceWorkerSource(files: string[], version: string): string {
  return `/* FModel 2D CAD service worker ${version} */
const CACHE = 'fmodel-cad-${version}';
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((f) => new URL(f, self.registration.scope).href))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fmodel-cad-') && k !== CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) {
            return caches.open(CACHE)
              .then((cache) => cache.match(new URL('index.html', self.registration.scope).href))
              .then((cached) => cached || res);
          }
          return res;
        })
        .catch(() =>
          caches.open(CACHE).then((cache) =>
            cache.match(new URL('index.html', self.registration.scope).href)
              .then((cached) => cached || cache.match(new URL('./', self.registration.scope).href))
          )
        ),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          }),
      ),
    ),
  );
});
`;
}
