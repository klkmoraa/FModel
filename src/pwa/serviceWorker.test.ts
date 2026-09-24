import { describe, expect, it } from 'vitest';
import { computeCacheVersion, serviceWorkerSource } from './serviceWorker';

type Handler = (event: Record<string, unknown>) => void;
type TestClient = { id: string; url: string };

/** Ejecuta el service worker generado con implementaciones mínimas de caches, fetch y eventos. */
function boot(
  files: string[],
  version: string,
  network: { online: boolean; status?: number },
  stores = new Map<string, Map<string, Response>>(),
  clients: TestClient[] = [],
) {
  const handlers = new Map<string, Handler>();
  let liveClients = clients;
  let currentTime = 0;
  let claimed = false;
  let skipped = false;
  const cacheApi = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) store.set(u, new Response(`contenido de ${u}`, { status: 200 }));
      },
      match: async (req: Request | string, _o?: unknown) => store.get(typeof req === 'string' ? req : req.url.split('?')[0])?.clone(),
      put: async (req: Request | string, res: Response) => void store.set(typeof req === 'string' ? req : req.url, res),
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      delete: async (req: Request | string) => store.delete(typeof req === 'string' ? req : req.url),
    };
  };
  const scope = 'https://cad.example/app/';
  const self = {
    registration: { scope },
    location: { origin: 'https://cad.example' },
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: () => (skipped = true),
    clients: {
      matchAll: async () => liveClients,
      claim: async () => void (claimed = true),
    },
  };
  const caches = {
    open: async (name: string) => cacheApi(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const fetchImpl = async (req: Request) => {
    if (!network.online) throw new TypeError('sin red');
    const status = network.status ?? 200;
    return Object.defineProperty(new Response(status === 200 ? `red ${req.url}` : 'error de red', { status }), 'type', { value: 'basic' });
  };
  const clock = { now: () => currentTime };
  new Function('self', 'caches', 'fetch', 'Date', serviceWorkerSource(files, version))(self, caches, fetchImpl, clock);
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    handlers.get(type)?.({ ...extra, waitUntil: (p: Promise<unknown>) => (waited = p), respondWith: (p: Promise<Response>) => (responded = p) });
    await waited;
    return responded ? await responded : undefined;
  };
  return {
    dispatch,
    stores,
    scope,
    skipped: () => skipped,
    claimed: () => claimed,
    setClients: (next: TestClient[]) => (liveClients = next),
    advanceTime: (milliseconds: number) => (currentTime += milliseconds),
  };
}

const req = (url: string, mode: RequestMode | 'navigate' = 'cors', headers: HeadersInit = {}) => ({ url, method: 'GET', mode, headers: new Headers(headers) }) as unknown as Request;

describe('service worker', () => {
  it('precaches the application shell and serves assets and navigation offline', async () => {
    const network = { online: true };
    const sw = boot(['./', 'index.html', 'assets/index-abc.js'], 'v1', network);
    await sw.dispatch('install');
    expect([...sw.stores.get('fmodel-cad-v1')!.keys()]).toEqual([`${sw.scope}`, `${sw.scope}index.html`, `${sw.scope}assets/index-abc.js`]);

    network.online = false;
    const asset = await sw.dispatch('fetch', { request: req(`${sw.scope}assets/index-abc.js`) });
    expect(await asset!.text()).toContain('assets/index-abc.js');
    const page = await sw.dispatch('fetch', { request: req(`${sw.scope}dibujo`, 'navigate') });
    expect(await page!.text()).toContain('index.html');
  });

  it('conserva recursos de una pestaña antigua hasta que desaparece y luego los recoge', async () => {
    const network = { online: true };
    const sharedStores = new Map<string, Map<string, Response>>();
    const old = boot(['index.html'], 'v1', network, sharedStores);
    await old.dispatch('install');

    const oldChunk = req(`${old.scope}assets/old-dynamic.js`);
    const firstResponse = await old.dispatch('fetch', { request: oldChunk });
    expect(await firstResponse!.text()).toContain('old-dynamic.js');

    const sharedAssetUrl = `${old.scope}assets/versioned.js`;
    sharedStores.get('fmodel-cad-v1')!.set(sharedAssetUrl, new Response('recurso v1'));

    const next = boot(
      ['index.html', 'assets/current.js'],
      'v2',
      network,
      sharedStores,
      [{ id: 'legacy-tab', url: `${old.scope}drawing/1` }],
    );
    await next.dispatch('install');
    await next.dispatch('activate');

    expect(next.claimed()).toBe(true);
    expect([...sharedStores.keys()]).toContain('fmodel-cad-v1');
    sharedStores.get('fmodel-cad-v2')!.set(sharedAssetUrl, new Response('recurso v2'));
    next.setClients([
      { id: 'legacy-tab', url: `${old.scope}drawing/1` },
      { id: 'new-tab-before-ready', url: `${next.scope}drawing/new` },
    ]);
    next.advanceTime(5000);
    const unannouncedCurrent = await next.dispatch('fetch', {
      request: req(sharedAssetUrl),
      clientId: 'new-tab-before-ready',
    });
    expect(await unannouncedCurrent!.text()).toBe('recurso v2');
    const currentBeforeReady = await next.dispatch('fetch', {
      request: req(sharedAssetUrl),
      clientId: 'new-tab-before-ready',
    });
    expect(await currentBeforeReady!.text()).toBe('recurso v2');

    next.setClients([
      { id: 'legacy-tab', url: `${old.scope}drawing/1` },
      { id: 'current-tab', url: `${old.scope}drawing/2` },
    ]);
    await next.dispatch('message', { data: 'fmodel-client-ready', source: { id: 'current-tab' } });

    network.online = false;
    const oldOfflineResponse = await next.dispatch('fetch', { request: oldChunk, clientId: 'legacy-tab' });
    expect(await oldOfflineResponse!.text()).toContain('old-dynamic.js');
    const legacyVersion = await next.dispatch('fetch', { request: req(sharedAssetUrl), clientId: 'legacy-tab' });
    const currentVersion = await next.dispatch('fetch', { request: req(sharedAssetUrl), clientId: 'current-tab' });
    expect(await legacyVersion!.text()).toBe('recurso v1');
    expect(await currentVersion!.text()).toBe('recurso v2');

    next.setClients([{ id: 'current-tab', url: `${next.scope}drawing/2` }]);
    await next.dispatch('message', {
      data: 'fmodel-client-ready',
      source: { id: 'current-tab' },
    });
    expect([...sharedStores.keys()].filter((name) => name.startsWith('fmodel-cad-'))).toEqual(['fmodel-cad-v2']);

    next.setClients([]);
    await next.dispatch('activate');
    expect([...sharedStores.keys()]).toEqual(['fmodel-cad-v2']);
  });

  it('removes caches of older versions on activation and waits for approval to switch', async () => {
    const network = { online: true };
    const old = boot(['index.html'], 'v1', network);
    await old.dispatch('install');
    const sw = boot(['index.html'], 'v2', network);
    for (const [k, v] of old.stores) sw.stores.set(k, v);
    await sw.dispatch('install');
    expect(sw.skipped()).toBe(false);
    await sw.dispatch('activate');
    expect([...sw.stores.keys()]).toEqual(['fmodel-cad-v2']);
    await sw.dispatch('message', { data: 'skip-waiting' });
    expect(sw.skipped()).toBe(true);
  });

  it('ignores cross-origin and non-GET requests', async () => {
    const sw = boot(['index.html'], 'v1', { online: true });
    expect(await sw.dispatch('fetch', { request: req('https://cdn.example/x.js') })).toBeUndefined();
    expect(await sw.dispatch('fetch', { request: { url: `${sw.scope}api`, method: 'POST', mode: 'cors' } })).toBeUndefined();
  });

  it('calcula versión por contenido real: cambios en archivos públicos alteran la versión', () => {
    const baseFiles = [
      { name: 'index.html', content: '<html><body>CAD</body></html>' },
      { name: 'manifest.webmanifest', content: '{"name":"FModel 2D"}' },
      { name: 'favicon.svg', content: '<svg>icon1</svg>' },
    ];

    const v1 = computeCacheVersion(baseFiles);
    // Build idéntico conserva versión reproducible
    const v1Repeat = computeCacheVersion(baseFiles);
    expect(v1).toBe(v1Repeat);

    // Cambio de contenido de un asset público conservando el nombre debe cambiar la versión
    const alteredFiles = [
      { name: 'index.html', content: '<html><body>CAD</body></html>' },
      { name: 'manifest.webmanifest', content: '{"name":"FModel 2D CAD Pro"}' },
      { name: 'favicon.svg', content: '<svg>icon1</svg>' },
    ];
    const v2 = computeCacheVersion(alteredFiles);
    expect(v2).not.toBe(v1);

    // Orden de entrada no altera el hash reproducible
    const reordered = [alteredFiles[2], alteredFiles[0], alteredFiles[1]];
    expect(computeCacheVersion(reordered)).toBe(v2);
  });

  it('maneja respuestas de navegación no exitosas (404/500) cayendo en el index.html precargado', async () => {
    const network = { online: true, status: 404 };
    const sw = boot(['./', 'index.html'], 'v1', network);
    await sw.dispatch('install');

    const navReq = req(`${sw.scope}plano/42`, 'navigate');
    const res = await sw.dispatch('fetch', { request: navReq });
    expect(res).toBeDefined();
    expect(await res!.text()).toContain('index.html');
  });

  it('almacena en caché bajo demanda los recursos de biblioteca excluidos del precache', async () => {
    const network = { online: true };
    const sw = boot(['./', 'index.html'], 'v1', network);
    await sw.dispatch('install');

    const libReq = req(`${sw.scope}library/muebles.dxf`);
    // Primer acceso: se descarga de la red y se guarda en la caché de la versión
    const fetched = await sw.dispatch('fetch', { request: libReq });
    expect(await fetched!.text()).toContain('library/muebles.dxf');
    expect(sw.stores.get('fmodel-cad-v1')?.has(`${sw.scope}library/muebles.dxf`)).toBe(true);

    // Segundo acceso sin conexión: se sirve desde caché
    network.online = false;
    const cached = await sw.dispatch('fetch', { request: libReq });
    expect(await cached!.text()).toContain('library/muebles.dxf');
  });

  it('una solicitud Range omite una respuesta completa ya almacenada y no guarda el HTTP 206', async () => {
    const network = { online: true, status: 200 };
    const sw = boot(['./', 'index.html'], 'v1', network);
    await sw.dispatch('install');

    const fullReq = req(`${sw.scope}heavy.wasm`);
    expect((await sw.dispatch('fetch', { request: fullReq }))?.status).toBe(200);
    expect(sw.stores.get('fmodel-cad-v1')?.has(`${sw.scope}heavy.wasm`)).toBe(true);

    network.status = 206;
    const rangeReq = req(`${sw.scope}heavy.wasm`, 'cors', { Range: 'bytes=0-1023' });
    const fetched = await sw.dispatch('fetch', { request: rangeReq });
    expect(fetched?.status).toBe(206);
    expect(sw.stores.get('fmodel-cad-v1')?.get(`${sw.scope}heavy.wasm`)?.status).toBe(200);
  });
});
