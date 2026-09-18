import { describe, expect, it } from 'vitest';
import { computeCacheVersion, serviceWorkerSource } from './serviceWorker';

type Handler = (event: Record<string, unknown>) => void;

/** Ejecuta el service worker generado con implementaciones mínimas de caches, fetch y eventos. */
function boot(files: string[], version: string, network: { online: boolean; status?: number }) {
  const handlers = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();
  let skipped = false;
  const cacheApi = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) store.set(u, new Response(`contenido de ${u}`, { status: 200 }));
      },
      match: async (req: Request | string, _o?: unknown) => store.get(typeof req === 'string' ? req : req.url.split('?')[0])?.clone(),
      put: async (req: Request, res: Response) => void store.set(req.url, res),
    };
  };
  const scope = 'https://cad.example/app/';
  const self = {
    registration: { scope },
    location: { origin: 'https://cad.example' },
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: () => (skipped = true),
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
  new Function('self', 'caches', 'fetch', serviceWorkerSource(files, version))(self, caches, fetchImpl);
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    handlers.get(type)?.({ ...extra, waitUntil: (p: Promise<unknown>) => (waited = p), respondWith: (p: Promise<Response>) => (responded = p) });
    await waited;
    return responded ? await responded : undefined;
  };
  return { dispatch, stores, scope, skipped: () => skipped };
}

const req = (url: string, mode: RequestMode | 'navigate' = 'cors') => ({ url, method: 'GET', mode }) as unknown as Request;

describe('service worker', () => {
  it('precaches the whole build and serves assets and navigation offline', async () => {
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

  it('no almacena en caché respuestas parciales (HTTP 206)', async () => {
    const network = { online: true, status: 206 };
    const sw = boot(['./', 'index.html'], 'v1', network);
    await sw.dispatch('install');

    const rangeReq = req(`${sw.scope}heavy.wasm`);
    const fetched = await sw.dispatch('fetch', { request: rangeReq });
    expect(fetched?.status).toBe(206);
    expect(sw.stores.get('fmodel-cad-v1')?.has(`${sw.scope}heavy.wasm`)).toBe(false);
  });
});
