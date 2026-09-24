import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

function send(res: ServerResponse<IncomingMessage>, status: number, body: string, contentType: string) {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

test('las pestañas conservan la versión de su chunk y recogen caché antigua al cerrar una pestaña', async ({ browser }) => {
  test.setTimeout(90_000);
  const builtWorker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const cacheDeclaration = builtWorker.match(/const CACHE = 'fmodel-cad-[^']+';/)?.[0];
  expect(cacheDeclaration).toBeTruthy();
  const workerV1 = builtWorker.replace(cacheDeclaration!, "const CACHE = 'fmodel-cad-e2e-v1';");
  const workerV2 = builtWorker.replace(cacheDeclaration!, "const CACHE = 'fmodel-cad-e2e-v2';");
  let upgraded = false;

  const server = createServer((incoming, outgoing) => {
    const pathname = new URL(incoming.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/sw.js') {
      send(outgoing, 200, upgraded ? workerV2 : workerV1, 'text/javascript; charset=utf-8');
      return;
    }
    if (pathname === '/assets/versioned.js') {
      send(outgoing, 200, upgraded ? "export default 'recurso v2';" : "export default 'recurso v1';", 'text/javascript; charset=utf-8');
      return;
    }

    const upstream = httpRequest({
      hostname: '127.0.0.1',
      port: 4173,
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, host: 'localhost:4173' },
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => send(outgoing, 502, 'preview no disponible', 'text/plain'));
    incoming.pipe(upstream);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext();

  try {
    const oldPage = await context.newPage();
    await oldPage.goto(`${base}/?surface=workspace`);
    await oldPage.evaluate(async () => navigator.serviceWorker.ready);
    await oldPage.reload();
    await oldPage.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(await oldPage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await oldPage.evaluate(() => {
      (window as unknown as { fmodel: { editor: { setPrefs(prefs: object): void } } }).fmodel.editor.setPrefs({ onboardingDone: true });
    });
    expect(await oldPage.evaluate(async () => (await fetch('/assets/versioned.js')).text())).toContain("export default 'recurso v1'");
    await oldPage.waitForFunction(async () => Boolean(await (await caches.open('fmodel-cad-e2e-v1')).match(new URL('/assets/versioned.js', location.href).href)));
    const updatePage = await context.newPage();
    await updatePage.goto(`${base}/?surface=workspace`);
    await updatePage.waitForFunction(() => !!navigator.serviceWorker.controller);
    await updatePage.evaluate(() => {
      (window as unknown as { fmodel: { editor: { setPrefs(prefs: object): void } } }).fmodel.editor.setPrefs({ onboardingDone: true });
    });
    const oldTimeOrigin = await updatePage.evaluate(() => performance.timeOrigin);

    upgraded = true;
    await updatePage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await updatePage.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
    await expect.poll(() => updatePage.evaluate(() => {
      const editor = (window as unknown as { fmodel: { editor: { runner: { log: { text: string }[] } } } }).fmodel.editor;
      return editor.runner.log.map((entry) => entry.text).join('\n');
    })).toMatch(/Hay una versión nueva de FModel lista|A new FModel version is ready/);
    expect(await updatePage.evaluate(() => performance.timeOrigin)).toBe(oldTimeOrigin);

    const commandLine = updatePage.getByLabel(/Línea de comandos|Command line/);
    await commandLine.fill('UPDATEAPP');
    await commandLine.press('Enter');
    await updatePage.waitForFunction((before) => performance.timeOrigin !== before, oldTimeOrigin);
    await updatePage.waitForFunction(async () => (await caches.keys()).includes('fmodel-cad-e2e-v2'));

    expect(await updatePage.evaluate(async () => (await fetch('/assets/versioned.js')).text())).toContain("export default 'recurso v2'");
    await updatePage.waitForFunction(async () => Boolean(await (await caches.open('fmodel-cad-e2e-v2')).match(new URL('/assets/versioned.js', location.href).href)));
    const liveVersions = await updatePage.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('fmodel-cad-')));
    expect(liveVersions).toContain('fmodel-cad-e2e-v1');
    expect(liveVersions).toContain('fmodel-cad-e2e-v2');
    expect(await oldPage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    expect(await oldPage.evaluate(async () => (await fetch('/assets/versioned.js')).text())).toContain("export default 'recurso v1'");

    // Playwright WebKit fails context.setOffline(true) fetches even with a primed single-tab cache; only Chromium proves offline routing here.
    if (browser.browserType().name() === 'chromium') {
      await context.setOffline(true);
      const oldOfflineChunk = await oldPage.evaluate(async () => (await fetch('/assets/versioned.js')).text());
      const currentOfflineChunk = await updatePage.evaluate(async () => (await fetch('/assets/versioned.js')).text());
      expect(oldOfflineChunk).toContain("export default 'recurso v1'");
      expect(currentOfflineChunk).toContain("export default 'recurso v2'");
      const oldModule = await oldPage.evaluate(async (url) => (await import(url) as { default: string }).default, '/assets/versioned.js');
      const currentModule = await updatePage.evaluate(async (url) => (await import(url) as { default: string }).default, '/assets/versioned.js');
      expect(oldModule).toBe('recurso v1');
      expect(currentModule).toBe('recurso v2');
    }

    await oldPage.close();
    await updatePage.reload();
    const retainedAfterClose = await updatePage.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('fmodel-cad-')));
    expect(retainedAfterClose).toEqual(['fmodel-cad-e2e-v2']);
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
