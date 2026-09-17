/**
 * Código del service worker, generado en la compilación con la lista exacta de archivos
 * (vite.config.ts). Estrategia:
 * - instalación: precarga todos los recursos de la versión (la app funciona sin conexión
 *   desde la primera visita completa, incluidos los módulos que se cargan bajo demanda);
 * - navegación: red primero y, sin conexión, el index.html precargado;
 * - recursos: caché primero;
 * - una versión nueva espera a que se cierren las pestañas abiertas (no se mezclan versiones).
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
      fetch(req).catch(() => caches.open(CACHE).then((cache) => cache.match(new URL('index.html', self.registration.scope).href))),
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
