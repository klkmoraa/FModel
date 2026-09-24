import { afterEach, describe, expect, it, vi } from 'vitest';
import { INPUT_LIMITS, InputLimitError } from '../io/limits';
import { consumeLaunchQueue, registerServiceWorker } from './register';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('cola de apertura del sistema operativo', () => {
  it('rechaza un archivo grande antes de leer sus bytes e informa el error', async () => {
    let consumer!: (params: { files: { name: string; getFile(): Promise<File> }[] }) => Promise<void>;
    vi.stubGlobal('window', {
      launchQueue: {
        setConsumer: (fn: typeof consumer) => {
          consumer = fn;
        },
      },
    });
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const getFile = vi.fn(async () => ({ name: 'gigante.dwg', size: INPUT_LIMITS.maxCompressedBytes + 1, arrayBuffer }) as unknown as File);
    const onFile = vi.fn();
    const onError = vi.fn();
    consumeLaunchQueue(onFile, onError);

    await consumer({ files: [{ name: 'gigante.dwg', getFile }] });

    expect(onFile).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(InputLimitError));
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});

describe('actualización del service worker', () => {
  it('recarga cuando la versión esperando llega a activated aunque no ocurra controllerchange', async () => {
    vi.stubEnv('PROD', true);
    let load!: () => void;
    let state: ServiceWorkerState = 'installed';
    const stateListeners = new Set<() => void>();
    const reload = vi.fn();
    const controller = { postMessage: vi.fn() };
    const worker = {
      get state() {
        return state;
      },
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        stateListeners.add(listener as unknown as () => void);
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        stateListeners.delete(listener as unknown as () => void);
      },
      postMessage: vi.fn(() => {
        state = 'activating';
        for (const listener of stateListeners) listener();
        state = 'activated';
        for (const listener of stateListeners) listener();
      }),
    } as unknown as ServiceWorker;
    const registration = {
      waiting: worker,
      installing: null,
      addEventListener: vi.fn(),
    };
    const serviceWorker = {
      controller: controller as unknown as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
    };
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: () => void) => {
        load = listener;
      },
      location: { reload },
    });
    vi.stubGlobal('navigator', { serviceWorker });

    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate);
    load();
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());

    onUpdate.mock.calls[0]![0]();

    expect(worker.postMessage).toHaveBeenCalledWith('skip-waiting');
    expect(reload).toHaveBeenCalledOnce();
    expect(controller.postMessage).toHaveBeenCalledWith('fmodel-client-ready');
  });

  it('no reasocia una pestaña legacy al nuevo worker hasta que cargue otra vez', async () => {
    vi.stubEnv('PROD', true);
    let load!: () => void;
    let controllerChange: (() => void) | undefined;
    const oldController = { postMessage: vi.fn() };
    const newController = { postMessage: vi.fn() };
    let controller: typeof oldController | typeof newController = oldController;
    const serviceWorker = {
      get controller() {
        return controller as unknown as ServiceWorker;
      },
      register: vi.fn().mockResolvedValue({ waiting: null, installing: null, addEventListener: vi.fn() }),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'controllerchange') controllerChange = listener;
      },
    };
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: () => void) => {
        load = listener;
      },
      location: { reload: vi.fn() },
    });
    vi.stubGlobal('navigator', { serviceWorker });

    registerServiceWorker(vi.fn());
    load();
    await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledOnce());
    expect(oldController.postMessage).toHaveBeenCalledWith('fmodel-client-ready');

    controller = newController;
    controllerChange?.();
    expect(newController.postMessage).not.toHaveBeenCalled();
  });
});
