import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { resetLibraryForTests, loadLibrary } from '../blocks/libraryStore';
import { DEFAULT_CATEGORIES } from '../blocks/libraryCategories';
import { writeLibraryArchive } from '../blocks/libraryArchive';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import { taskManager } from '../app/tasks';
import { parseDxf } from '../io/dxf/parser';
import { _resetWorker } from '../workers/client';
import { registerAllCommands } from './index';
import { buildImportSession } from './library';

const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1024', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '5', '21', '5', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

beforeAll(() => registerAllCommands());
beforeEach(() => resetLibraryForTests());
afterEach(() => vi.unstubAllGlobals());

describe('sesión de importación a la biblioteca', () => {
  it('desde DXF: espacio modelo como bloque e informe de conversión', async () => {
    const s = await buildImportSession({ name: 'Puerta 80.dxf', bytes: strToU8(dxf) }, DEFAULT_CATEGORIES);
    expect(s.source).toEqual({ kind: 'dxf', file: 'Puerta 80.dxf' });
    expect(s.candidates.map((c) => [c.name, c.categoryId, c.selected])).toEqual([['Puerta 80', 'cat-arq-puertas', true]]);
    expect(s.report).toBeTruthy();
  });

  it('desde .fmodellib vacío y rechazo de extensiones desconocidas', async () => {
    const s = await buildImportSession({ name: 'b.fmodellib', bytes: writeLibraryArchive({ categories: [], blocks: [] }) }, DEFAULT_CATEGORIES);
    expect(s.source.kind).toBe('fmodellib');
    expect(s.candidates).toEqual([]);
    await expect(buildImportSession({ name: 'x.txt', bytes: new Uint8Array() }, DEFAULT_CATEGORIES)).rejects.toThrow(/Formato no admitido/);
  });

  it('permite volver a importar el DWG original tras fallar el primer intento', async () => {
    type Listener = (event: any) => void;
    const workers: MockRetryWorker[] = [];

    class MockRetryWorker {
      listeners = new Map<string, Listener[]>();
      posted: Array<{ data: any; transfer?: Transferable[] }> = [];
      constructor() {
        workers.push(this);
      }
      addEventListener(type: string, fn: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      removeEventListener(type: string, fn: Listener) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== fn));
      }
      postMessage(data: any, transfer?: Transferable[]) {
        this.posted.push({ data, transfer });
        const attempt = this.posted.length;
        queueMicrotask(() => {
          for (const listener of this.listeners.get('message') ?? []) {
            listener({
              data: attempt === 1
                ? { type: 'result', id: data.id, ok: false, error: 'temporary DWG failure' }
                : { type: 'result', id: data.id, ok: true, result: parseDxf(dxf) },
            });
          }
        });
      }
      terminate = vi.fn();
    }

    const originalWorker = globalThis.Worker;
    const originalWindow = (globalThis as any).window;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    _resetWorker();
    taskManager._clear();
    (globalThis as any).Worker = MockRetryWorker as any;
    (globalThis as any).window = globalThis;

    try {
      await expect(buildImportSession({ name: 'reintento.dwg', bytes }, DEFAULT_CATEGORIES)).rejects.toThrow('temporary DWG failure');
      expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);

      const failed = taskManager.getTasks().find((task) => task.id === 'library-parse-dwg');
      expect(failed?.retry).toBeUndefined();
      const reopened = await buildImportSession({ name: 'reintento.dwg', bytes }, DEFAULT_CATEGORIES);
      expect(reopened.source).toEqual({ kind: 'dwg', file: 'reintento.dwg' });
      expect(reopened.candidates.length).toBeGreaterThan(0);

      expect(workers).toHaveLength(1);
      expect(workers[0].posted).toHaveLength(2);
      expect(workers[0].posted.map(({ transfer }) => transfer)).toEqual([undefined, undefined]);
      expect(workers[0].posted.map(({ data }) => Array.from(data.payload.bytes))).toEqual([
        [1, 2, 3, 4],
        [1, 2, 3, 4],
      ]);
    } finally {
      (globalThis as any).Worker = originalWorker;
      (globalThis as any).window = originalWindow;
      _resetWorker();
      taskManager._clear();
    }
  });

  it('cancelar la biblioteca inicial aborta el fetch pendiente y no publica bloques parciales', async () => {
    let requestCount = 0;
    let notifyStarted!: () => void;
    const itemStarted = new Promise<void>((resolve) => (notifyStarted = resolve));
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestCount++;
      if (requestCount === 1) {
        return {
          ok: true,
          json: async () => ({
            source: 'test',
            license: 'GPL-2.0',
            items: [{ file: 'architect/test.dxf', name: 'Prueba', category: 'cat-arq', units: 'mm', stretchable: false }],
          }),
        } as Response;
      }
      notifyStarted();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });

    const editor = new Editor(createDocument());
    const pending = editor.command('LIBRARYSTARTER');
    await itemStarted;
    editor.runner.cancel();
    await pending;

    expect(requestCount).toBe(2);
    expect(await loadLibrary()).toEqual([]);
    expect(editor.runner.log.at(-1)).toMatchObject({ kind: 'info' });
    expect(editor.runner.log.at(-1)?.text).toMatch(/^\*(?:Cancelar|Cancel)\*$/);
  });
});
