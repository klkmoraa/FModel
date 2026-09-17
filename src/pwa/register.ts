/**
 * Registra el service worker en producción. Si hay una versión nueva esperando, avisa y
 * permite aplicarla recargando (nunca se cambia de versión con el dibujo abierto sin avisar).
 */
export function registerServiceWorker(onUpdate: (apply: () => void) => void) {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        const notify = (worker: ServiceWorker) =>
          onUpdate(() => {
            worker.postMessage('skip-waiting');
            navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
          });
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) notify(worker);
          });
        });
      })
      .catch((err) => console.warn('service worker', err));
  });
}

type LaunchParams = { files: { name: string; getFile(): Promise<File> }[] };

/** Archivos con los que el sistema abre la aplicación instalada (File Handling API). */
export function consumeLaunchQueue(onFile: (file: { name: string; bytes: Uint8Array; handle: unknown }) => void) {
  const lq = (window as unknown as { launchQueue?: { setConsumer(fn: (p: LaunchParams) => void): void } }).launchQueue;
  lq?.setConsumer(async (params) => {
    for (const h of params.files) {
      const f = await h.getFile();
      onFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), handle: h });
    }
  });
}
