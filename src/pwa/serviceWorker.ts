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
 * - cada cliente queda asociado a la caché que lo atendió; las cachés anteriores se conservan
 *   mientras haya pestañas que puedan necesitarlas y se recogen al cerrar o actualizar esas pestañas;
 * - pestañas legacy sin protocolo se conservan con un snapshot de las cachés existentes al detectarlas.
 */
export function serviceWorkerSource(files: string[], version: string): string {
  return `/* FModel 2D CAD service worker ${version} */
const CACHE = 'fmodel-cad-${version}';
const CACHE_PREFIX = 'fmodel-cad-';
const OWNERS_CACHE = 'fmodel-sw-client-retention-v1';
const OWNERS_KEY = new URL('__fmodel_sw_client_retention_v1__', self.registration.scope).href;
const PRECACHE = ${JSON.stringify(files)};
let retentionWork = Promise.resolve();
let lastRetentionAt = 0;

function isVersionCache(name) {
  return name.startsWith(CACHE_PREFIX);
}

function isInScope(client) {
  try {
    return new URL(client.url).href.startsWith(self.registration.scope);
  } catch {
    return false;
  }
}

function cleanOwnerMap(value) {
  const owners = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return owners;
  for (const [clientId, names] of Object.entries(value)) {
    if (Array.isArray(names)) owners[clientId] = [...new Set(names.filter((name) => typeof name === 'string' && isVersionCache(name)))];
  }
  return owners;
}

async function readOwners(cacheNames) {
  const empty = Object.create(null);
  if (!cacheNames.includes(OWNERS_CACHE)) return { owners: empty, damaged: false };
  try {
    const response = await (await caches.open(OWNERS_CACHE)).match(OWNERS_KEY);
    if (!response) return { owners: empty, damaged: true };
    const value = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { owners: empty, damaged: true };
    return { owners: cleanOwnerMap(value), damaged: false };
  } catch {
    // Un mapa dañado debe tratar a los clientes vivos como legacy para no borrar sus recursos.
    return { owners: empty, damaged: true };
  }
}

async function writeOwners(owners) {
  if (Object.keys(owners).length === 0) {
    await caches.delete(OWNERS_CACHE);
    return;
  }
  const cache = await caches.open(OWNERS_CACHE);
  await cache.put(OWNERS_KEY, new Response(JSON.stringify(owners), {
    headers: { 'content-type': 'application/json' },
  }));
}

async function reconcileClients(identifiedClientId, activation = false, refreshIdentifiedClient = false) {
  const [clients, names] = await Promise.all([
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }),
    caches.keys(),
  ]);
  const versionCaches = names.filter(isVersionCache);
  const ownerState = await readOwners(names);
  const owners = ownerState.owners;
  const originalOwners = JSON.stringify(owners);
  const liveClients = clients.filter(isInScope);
  const liveIds = new Set(liveClients.map((client) => client.id));

  for (const clientId of Object.keys(owners)) {
    if (!liveIds.has(clientId) && clientId !== identifiedClientId) delete owners[clientId];
  }
  for (const client of liveClients) {
    if (!owners[client.id]) {
      owners[client.id] = activation || ownerState.damaged ? versionCaches : [CACHE];
    }
  }
  if (identifiedClientId && (refreshIdentifiedClient || !owners[identifiedClientId])) owners[identifiedClientId] = [CACHE];

  const serializedOwners = JSON.stringify(owners);
  // Persist ownership before deleting anything so an interrupted worker can resume safely.
  if (serializedOwners !== originalOwners || (Object.keys(owners).length === 0 && names.includes(OWNERS_CACHE))) {
    await writeOwners(owners);
  }
  const keep = new Set([CACHE]);
  for (const namesForClient of Object.values(owners)) {
    for (const name of namesForClient) keep.add(name);
  }
  await Promise.all(versionCaches.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
}

function scheduleRetention(event, identifiedClientId, force = false, activation = false, refreshIdentifiedClient = false) {
  if (!force && Date.now() - lastRetentionAt < 5000) return retentionWork;
  lastRetentionAt = Date.now();
  const task = retentionWork.then(
    () => reconcileClients(identifiedClientId, activation, refreshIdentifiedClient),
    () => reconcileClients(identifiedClientId, activation, refreshIdentifiedClient),
  );
  retentionWork = task.catch(() => undefined);
  event.waitUntil(retentionWork);
  return task;
}

async function clientCacheNames(clientId) {
  if (!clientId) return [CACHE];
  const names = await caches.keys();
  const ownerState = await readOwners(names);
  const owned = ownerState.owners[clientId];
  if (!owned) return ownerState.damaged ? names.filter(isVersionCache) : [CACHE];
  const available = new Set(names);
  return owned.filter((name) => available.has(name));
}

async function matchForClient(clientId, request, currentCache) {
  const names = await clientCacheNames(clientId);
  for (const name of names) {
    const cache = name === CACHE ? currentCache : await caches.open(name);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((f) => new URL(f, self.registration.scope).href))));
});

self.addEventListener('activate', (event) => {
  const retention = scheduleRetention(event, undefined, true, true);
  event.waitUntil(retention.then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data === 'fmodel-client-ready') {
    const clientId = event.source && 'id' in event.source ? event.source.id : undefined;
    if (clientId) scheduleRetention(event, clientId, true, false, true);
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') scheduleRetention(event, event.resultingClientId, true, false, true);
  else scheduleRetention(event, event.clientId);
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
  if (req.headers.has('range')) {
    event.respondWith(fetch(req));
    return;
  }
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(CACHE);
        const hit = await matchForClient(event.clientId, req, cache);
        if (hit) return hit;
      } catch {
        // CacheStorage maintenance must not prevent an online resource from loading.
      }
      const res = await fetch(req);
      if (cache && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })(),
  );
});
`;
}
