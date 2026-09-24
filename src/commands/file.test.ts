import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setServices } from '../app/services';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { Editor } from '../editor/editor';
import type { FileHandle } from '../storage/fileAccess';
import type { Persistence } from '../storage/persistence';
import type { CommandApi, L10n } from './types';
import { taskManager } from '../app/tasks';
import { _resetWorker } from '../workers/client';
import { FILE_COMMANDS, openBytes } from './file';
import { registerCommands } from './registry';

const save = (name: 'QSAVE' | 'SAVEAS') => FILE_COMMANDS.find((command) => command.name === name)!;

function handle(name: string): FileHandle {
  return {
    name,
    createWritable: vi.fn(async () => ({ write: vi.fn(async () => undefined), close: vi.fn(async () => undefined) })),
    getFile: vi.fn(),
  };
}

let editor: Editor;
let persistence: Pick<Persistence, 'storeDrawing' | 'saveVersion' | 'storeDrawingAndVersion' | 'markCleanExit' | 'pendingRecovery'>;
let services: { fileHandle: FileHandle | null };
let info: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.fn>;
let api: CommandApi;

beforeEach(() => {
  registerCommands(FILE_COMMANDS);
  editor = new Editor(createDocument({ title: 'Plano' }));
  editor.fileName = 'Original';
  editor.doc.dirty = true;
  persistence = {
    storeDrawing: vi.fn(async () => ({ id: editor.doc.id, name: 'Plano', savedAt: 0, bytes: new Uint8Array(), size: 1 })),
    saveVersion: vi.fn(async () => ({ id: 'v1', documentId: editor.doc.id, name: 'Plano', label: 'Guardado manual', savedAt: 0, auto: false, entityCount: 0, bytes: new Uint8Array() })),
    storeDrawingAndVersion: vi.fn(async () => ({
      drawing: { id: editor.doc.id, name: 'Plano', savedAt: 0, bytes: new Uint8Array(), size: 1 },
      version: { id: 'v1', documentId: editor.doc.id, name: 'Plano', label: 'Guardado manual', savedAt: 0, auto: false, entityCount: 0, bytes: new Uint8Array() },
    })),
    markCleanExit: vi.fn(async () => undefined),
    pendingRecovery: vi.fn(async () => null),
  };
  services = { fileHandle: handle('original.fmodel') };
  setServices({
    editor,
    persistence: persistence as Persistence,
    get fileHandle() { return services.fileHandle; },
    set fileHandle(value) { services.fileHandle = value; },
    openUi: vi.fn(),
    toast: vi.fn(),
  });
  info = vi.fn();
  warn = vi.fn();
  api = { editor, t: (message: L10n) => message.es, info, warn } as unknown as CommandApi;
});

afterEach(() => vi.unstubAllGlobals());

describe('QSAVE y SAVEAS', () => {
  it('cancelar QSAVE o SAVEAS no modifica el estado ni crea una versión', async () => {
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); }) });
    const original = services.fileHandle;

    services.fileHandle = null;
    await save('QSAVE').run(api);
    services.fileHandle = original;
    await save('SAVEAS').run(api);

    expect(editor.doc.dirty).toBe(true);
    expect(services.fileHandle).toBe(original);
    expect(editor.fileName).toBe('Original');
    expect(persistence.storeDrawing).not.toHaveBeenCalled();
    expect(persistence.saveVersion).not.toHaveBeenCalled();
    expect(persistence.markCleanExit).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('permite reintentar SAVEAS después de cancelar sin dejar estado intermedio', async () => {
    services.fileHandle = null;
    const selected = handle('reintento.fmodel');
    const picker = vi.fn()
      .mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
      .mockResolvedValueOnce(selected);
    vi.stubGlobal('window', { showSaveFilePicker: picker });

    await save('SAVEAS').run(api);

    expect(editor.doc.dirty).toBe(true);
    expect(services.fileHandle).toBeNull();
    expect(editor.fileName).toBe('Original');
    expect(persistence.storeDrawing).not.toHaveBeenCalled();
    expect(persistence.saveVersion).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();

    await save('SAVEAS').run(api);

    expect(picker).toHaveBeenCalledTimes(2);
    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBe(selected);
    expect(editor.fileName).toBe('reintento');
    expect(persistence.storeDrawingAndVersion).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
  });

  it('aceptar SAVEAS actualiza el handle y deja el documento limpio', async () => {
    const selected = handle('nuevo.fmodel');
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => selected) });

    await save('SAVEAS').run(api);

    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBe(selected);
    expect(editor.fileName).toBe('nuevo');
    expect(persistence.storeDrawingAndVersion).toHaveBeenCalledWith('nuevo', 'Guardado manual', expect.objectContaining({
      documentId: editor.doc.id,
      documentVersion: editor.doc.version,
      entityCount: editor.doc.data.entities.size,
      bytes: expect.any(Uint8Array),
    }));
    expect(persistence.markCleanExit).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('Guardado') }));
  });

  it('QSAVE sobre handle existente conserva dirty hasta que la escritura termina', async () => {
    const existing = services.fileHandle!;
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const write = vi.fn(async () => {
      await writeGate;
    });
    const close = vi.fn(async () => undefined);
    (existing.createWritable as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ write, close });
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn() });

    const pending = save('QSAVE').run(api);
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());

    expect(editor.doc.dirty).toBe(true);
    expect(persistence.storeDrawingAndVersion).not.toHaveBeenCalled();

    releaseWrite();
    await pending;

    expect(close).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBe(existing);
    expect(persistence.storeDrawingAndVersion).toHaveBeenCalledOnce();
  });

  it('conserva dirty si el dibujo cambia mientras termina la escritura', async () => {
    const existing = services.fileHandle!;
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const write = vi.fn(async () => { await writeGate; });
    (existing.createWritable as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ write, close: vi.fn(async () => undefined) });

    const pending = save('QSAVE').run(api);
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    const savedVersion = editor.doc.version;
    editor.doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({
      ...entityDefaults(editor.doc), id: 'nueva', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
    }));
    expect(editor.doc.version).toBeGreaterThan(savedVersion);

    releaseWrite();
    await pending;

    expect(editor.doc.dirty).toBe(true);
    expect(editor.doc.entity('nueva')).toBeDefined();
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('siguen sin guardar') }));
  });

  it('no vincula al dibujo nuevo el archivo del guardado anterior', async () => {
    const existing = services.fileHandle!;
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const write = vi.fn(async () => { await writeGate; });
    (existing.createWritable as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ write, close: vi.fn(async () => undefined) });
    const oldId = editor.doc.id;

    const pending = save('QSAVE').run(api);
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    editor.doc.replaceData(createDocument({ title: 'Nuevo' }).data);
    editor.fileName = 'Nuevo';
    services.fileHandle = null;

    releaseWrite();
    await pending;

    expect(editor.doc.id).not.toBe(oldId);
    expect(editor.fileName).toBe('Nuevo');
    expect(services.fileHandle).toBeNull();
    expect(editor.doc.dirty).toBe(false);
    expect(persistence.storeDrawingAndVersion).toHaveBeenCalledWith('original', 'Guardado manual', expect.objectContaining({ documentId: oldId }));
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('dibujo anterior') }));
  });

  it('un SAVEAS antiguo que termina después no reemplaza el handle más reciente', async () => {
    const older = handle('anterior.fmodel');
    const newer = handle('reciente.fmodel');
    let releaseOlder!: () => void;
    const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
    (older.createWritable as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      write: vi.fn(async () => { await olderGate; }), close: vi.fn(async () => undefined),
    });
    const picker = vi.fn().mockResolvedValueOnce(older).mockResolvedValueOnce(newer);
    vi.stubGlobal('window', { showSaveFilePicker: picker });

    const first = save('SAVEAS').run(api);
    await vi.waitFor(() => expect(older.createWritable).toHaveBeenCalledOnce());
    const second = save('SAVEAS').run(api);
    await second;
    expect(services.fileHandle).toBe(newer);
    expect(editor.fileName).toBe('reciente');

    releaseOlder();
    await first;

    expect(services.fileHandle).toBe(newer);
    expect(editor.fileName).toBe('reciente');
  });

  it('trata la descarga fallback como guardado correcto', async () => {
    const click = vi.fn();
    services.fileHandle = null;
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: vi.fn(() => ({ click, remove: vi.fn() })) });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.stubGlobal('setTimeout', vi.fn());

    await save('QSAVE').run(api);

    expect(click).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(persistence.storeDrawingAndVersion).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ en: expect.stringContaining('as download') }));
  });

  it('mantiene el guardado principal como éxito si falla la persistencia local posterior', async () => {
    const existing = services.fileHandle!;
    (persistence.storeDrawingAndVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('indexeddb unavailable'));

    await save('QSAVE').run(api);

    expect(existing.createWritable).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBe(existing);
    expect(persistence.storeDrawingAndVersion).toHaveBeenCalledOnce();
    expect(persistence.markCleanExit).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('Guardado') }));
  });

  it('propaga un error real de write() y conserva el documento sucio', async () => {
    const existing = services.fileHandle!;
    const write = vi.fn(async () => {
      throw new Error('disk full');
    });
    (existing.createWritable as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ write, close: vi.fn(async () => undefined) });

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await editor.runner.execute('QSAVE');

    expect(write).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(true);
    expect(persistence.storeDrawing).not.toHaveBeenCalled();
    expect(persistence.saveVersion).not.toHaveBeenCalled();
    expect(editor.runner.log.at(-1)).toMatchObject({ kind: 'error', text: expect.stringContaining('disk full') });
    error.mockRestore();
  });

  it('SAVEAS con fallback de descarga desvincula el handle previo para evitar sobreescritura accidental en QSAVE', async () => {
    expect(services.fileHandle).toBeDefined();
    const click = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: vi.fn(() => ({ click, remove: vi.fn() })) });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.stubGlobal('setTimeout', vi.fn());

    await save('SAVEAS').run(api);

    expect(click).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBeNull();
  });

  it('mantiene el guardado principal como éxito si falla markCleanExit', async () => {
    const existing = services.fileHandle!;
    (persistence.markCleanExit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('idb lock failed'));

    await save('QSAVE').run(api);

    expect(existing.createWritable).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('Guardado') }));
  });

  it('sincroniza ctx.fileName al guardar con handle y en NEW', async () => {
    const selected = handle('nuevo-plano.fmodel');
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => selected) });

    await save('SAVEAS').run(api);
    expect(editor.ctx.fileName).toBe('nuevo-plano.fmodel');

    (api as unknown as { getKeyword: ReturnType<typeof vi.fn> }).getKeyword = vi.fn(async () => ({ kind: 'keyword', key: 'mm' }));
    await FILE_COMMANDS.find((c) => c.name === 'NEW')!.run(api);
    expect(editor.ctx.fileName).toBe('');
    expect(services.fileHandle).toBeNull();
  });

  it('sanitiza la extensión cuando el título del dibujo ya contiene .fmodel', async () => {
    services.fileHandle = null;
    editor.fileName = '';
    editor.doc.settings.title = 'proyecto.fmodel';
    const picker = vi.fn(async () => handle('proyecto.fmodel'));
    vi.stubGlobal('window', { showSaveFilePicker: picker });

    await save('SAVEAS').run(api);

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'proyecto.fmodel' }));
  });

  it('guardado principal exitoso con fallo de cuota local deja dirty=false y emite advertencia de copia local', async () => {
    const existing = services.fileHandle!;
    (persistence.storeDrawingAndVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Storage quota exceeded', 'QuotaExceededError'),
    );

    await save('QSAVE').run(api);

    expect(existing.createWritable).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('Guardado') }));
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        es: expect.stringContaining('Advertencia: no se pudo actualizar la copia local (espacio insuficiente en el navegador)'),
      }),
    );
  });

  it('guardado principal exitoso con fallo de almacenamiento no disponible deja dirty=false y emite advertencia correspondiente', async () => {
    const existing = services.fileHandle!;
    (persistence.storeDrawingAndVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Database is closing', 'InvalidStateError'),
    );

    await save('QSAVE').run(api);

    expect(existing.createWritable).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('Guardado') }));
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        es: expect.stringContaining('almacenamiento local no disponible'),
      }),
    );
  });

  it('RECOVER advierte si pendingRecovery falla por error de almacenamiento', async () => {
    (persistence.pendingRecovery as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Database is closing', 'InvalidStateError'),
    );
    const recoverCmd = FILE_COMMANDS.find((c) => c.name === 'RECOVER')!;
    await recoverCmd.run(api);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        es: expect.stringContaining('almacenamiento no disponible'),
      }),
    );
  });

  it('cancela openBytes de DXF limpiamente sin alterar el documento previo', async () => {
    const originalEntities = editor.doc.data.entities.size;
    const dxfBytes = new TextEncoder().encode('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n');

    const openPromise = openBytes(api, 'test.dxf', dxfBytes);
    taskManager.cancelTask('open-dxf');
    await openPromise;

    expect(editor.doc.data.entities.size).toBe(originalEntities);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('cancelada') }));
  });

  it('descarta el resultado de una apertura DXF cuando se cancela el comando dueño', async () => {
    const owner = new AbortController();
    api.signal = owner.signal;
    const dxfBytes = new TextEncoder().encode('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n');

    const openPromise = openBytes(api, 'tardio.dxf', dxfBytes);
    owner.abort();
    const opened = await openPromise;

    expect(opened).toBe(false);
    expect(editor.fileName).toBe('Original');
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ es: expect.stringContaining('cancelada') }));
  });

  it('permite volver a abrir el DWG original tras fallar el primer intento', async () => {
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
                : {
                    type: 'result',
                    id: data.id,
                    ok: true,
                    result: { data: createDocument().data, report: { summary: { es: 'Importado', en: 'Imported' }, warnings: [] } },
                  },
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
    (globalThis as any).window = { dispatchEvent: vi.fn() };

    try {
      await expect(openBytes(api, 'reintento.dwg', bytes)).rejects.toThrow('temporary DWG failure');
      expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);

      const failed = taskManager.getTasks().find((task) => task.id === 'open-dwg');
      expect(failed?.retry).toBeUndefined();
      expect(await openBytes(api, 'reintento.dwg', bytes)).toBe(true);

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
});
