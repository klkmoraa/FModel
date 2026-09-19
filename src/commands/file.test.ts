import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setServices } from '../app/services';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import type { FileHandle } from '../storage/fileAccess';
import type { Persistence } from '../storage/persistence';
import type { CommandApi, L10n } from './types';
import { FILE_COMMANDS } from './file';
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
let persistence: Pick<Persistence, 'storeDrawing' | 'saveVersion' | 'markCleanExit'>;
let services: { fileHandle: FileHandle | null };
let info: ReturnType<typeof vi.fn>;
let api: CommandApi;

beforeEach(() => {
  registerCommands(FILE_COMMANDS);
  editor = new Editor(createDocument({ title: 'Plano' }));
  editor.fileName = 'Original';
  editor.doc.dirty = true;
  persistence = {
    storeDrawing: vi.fn(async () => ({ id: editor.doc.id, name: 'Plano', savedAt: 0, bytes: new Uint8Array(), size: 1 })),
    saveVersion: vi.fn(async () => ({ id: 'v1', documentId: editor.doc.id, name: 'Plano', label: 'Guardado manual', savedAt: 0, auto: false, entityCount: 0, bytes: new Uint8Array() })),
    markCleanExit: vi.fn(async () => undefined),
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
  api = { editor, t: (message: L10n) => message.es, info } as unknown as CommandApi;
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
    expect(persistence.storeDrawing).toHaveBeenCalledOnce();
    expect(persistence.saveVersion).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
  });

  it('aceptar SAVEAS actualiza el handle y deja el documento limpio', async () => {
    const selected = handle('nuevo.fmodel');
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => selected) });

    await save('SAVEAS').run(api);

    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBe(selected);
    expect(editor.fileName).toBe('nuevo');
    expect(persistence.storeDrawing).toHaveBeenCalledOnce();
    expect(persistence.saveVersion).toHaveBeenCalledWith('Guardado manual');
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
    expect(persistence.storeDrawing).not.toHaveBeenCalled();
    expect(persistence.saveVersion).not.toHaveBeenCalled();

    releaseWrite();
    await pending;

    expect(close).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBe(existing);
    expect(persistence.storeDrawing).toHaveBeenCalledOnce();
    expect(persistence.saveVersion).toHaveBeenCalledOnce();
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
    expect(persistence.saveVersion).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ en: expect.stringContaining('as download') }));
  });

  it('mantiene el guardado principal como éxito si falla la persistencia local posterior', async () => {
    const existing = services.fileHandle!;
    (persistence.storeDrawing as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('indexeddb unavailable'));
    (persistence.saveVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('version store unavailable'));

    await save('QSAVE').run(api);

    expect(existing.createWritable).toHaveBeenCalledOnce();
    expect(editor.doc.dirty).toBe(false);
    expect(services.fileHandle).toBe(existing);
    expect(persistence.storeDrawing).toHaveBeenCalledOnce();
    expect(persistence.saveVersion).toHaveBeenCalledOnce();
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
});
