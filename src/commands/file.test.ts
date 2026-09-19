import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setServices } from '../app/services';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import type { FileHandle } from '../storage/fileAccess';
import type { Persistence } from '../storage/persistence';
import type { CommandApi, L10n } from './types';
import { taskManager } from '../app/tasks';
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
    expect(persistence.storeDrawingAndVersion).toHaveBeenCalledWith('nuevo', 'Guardado manual', expect.any(Uint8Array));
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

  it('hace fallback a storeDrawing y saveVersion si storeDrawingAndVersion no está disponible', async () => {
    delete (persistence as Partial<typeof persistence>).storeDrawingAndVersion;
    await save('QSAVE').run(api);
    expect(persistence.storeDrawing).toHaveBeenCalledOnce();
    expect(persistence.saveVersion).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
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
});
