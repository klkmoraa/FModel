import { afterEach, describe, expect, it, vi } from 'vitest';
import { INPUT_LIMITS, InputLimitError } from '../io/limits';
import { openFile, saveFile, type FileHandle } from './fileAccess';

const blob = new Blob(['FModel']);
const accept = { 'application/x-fmodel': ['.fmodel'] };

function handle(name = 'plano.fmodel'): FileHandle {
  return {
    name,
    createWritable: vi.fn(async () => ({ write: vi.fn(async () => undefined), close: vi.fn(async () => undefined) })),
    getFile: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('openFile', () => {
  it('rechaza por File.size antes de reservar el ArrayBuffer', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const selected = handle('enorme.fmodel');
    (selected.getFile as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'enorme.fmodel', size: INPUT_LIMITS.maxCompressedBytes + 1, arrayBuffer });
    vi.stubGlobal('window', { showOpenFilePicker: vi.fn(async () => [selected]) });

    await expect(openFile(accept, 'FModel')).rejects.toBeInstanceOf(InputLimitError);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('propaga fallos al leer el archivo del selector clásico', async () => {
    const failure = new Error('file read failed');
    const input: {
      type: string;
      accept: string;
      files: { name: string; arrayBuffer: () => Promise<ArrayBuffer> }[];
      onchange?: () => Promise<void>;
      oncancel?: () => void;
      click: ReturnType<typeof vi.fn>;
    } = { type: '', accept: '', files: [{ name: 'plano.fmodel', arrayBuffer: vi.fn(async () => { throw failure; }) }], click: vi.fn() };
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { createElement: vi.fn(() => input) });

    const opening = openFile(accept, 'FModel');
    await input.onchange?.().catch(() => undefined);
    const result = await Promise.race([
      opening.then(() => 'resolved', () => 'rejected'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 0)),
    ]);

    expect(result).toBe('rejected');
    await expect(opening).rejects.toBe(failure);
  });
});

describe('saveFile', () => {
  it('devuelve el handle cuando el selector acepta y termina la escritura', async () => {
    const selected = handle('aceptado.fmodel');
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => selected) });

    await expect(saveFile(blob, 'plano.fmodel', accept, 'FModel')).resolves.toEqual({ kind: 'saved-to-handle', handle: selected });
    expect(selected.createWritable).toHaveBeenCalledOnce();
  });

  it('distingue la cancelación del selector', async () => {
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); }) });

    await expect(saveFile(blob, 'plano.fmodel', accept, 'FModel')).resolves.toEqual({ kind: 'cancelled' });
  });

  it('escribe en el handle existente sin abrir un selector', async () => {
    const existing = handle();
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn() });

    await expect(saveFile(blob, 'plano.fmodel', accept, 'FModel', existing)).resolves.toEqual({ kind: 'saved-to-handle', handle: existing });
    expect(existing.createWritable).toHaveBeenCalledOnce();
    expect((window as unknown as { showSaveFilePicker: ReturnType<typeof vi.fn> }).showSaveFilePicker).not.toHaveBeenCalled();
  });

  it('serializa dos escrituras al mismo handle para que gane la más reciente', async () => {
    const existing = handle();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const events: string[] = [];
    (existing.createWritable as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        write: vi.fn(async () => { events.push('write-old'); await firstGate; }),
        close: vi.fn(async () => { events.push('close-old'); }),
      })
      .mockResolvedValueOnce({
        write: vi.fn(async () => { events.push('write-new'); }),
        close: vi.fn(async () => { events.push('close-new'); }),
      });

    const older = saveFile(new Blob(['old']), 'plano.fmodel', accept, 'FModel', existing);
    await vi.waitFor(() => expect(events).toContain('write-old'));
    const newer = saveFile(new Blob(['new']), 'plano.fmodel', accept, 'FModel', existing);
    await Promise.resolve();
    expect(existing.createWritable).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.all([older, newer]);
    expect(events).toEqual(['write-old', 'close-old', 'write-new', 'close-new']);
  });

  it('cuenta la descarga fallback como éxito', async () => {
    const click = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: vi.fn(() => ({ click, remove: vi.fn() })) });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.stubGlobal('setTimeout', vi.fn());

    await expect(saveFile(blob, 'plano.fmodel', accept, 'FModel')).resolves.toEqual({ kind: 'download-started' });
    expect(click).toHaveBeenCalledOnce();
  });

  it('propaga los fallos reales de write()', async () => {
    const selected = handle();
    const write = vi.fn(async () => {
      throw new DOMException('write aborted', 'AbortError');
    });
    (selected.createWritable as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ write, close: vi.fn(async () => undefined) });
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn(async () => selected) });

    await expect(saveFile(blob, 'plano.fmodel', accept, 'FModel')).rejects.toThrow('write aborted');
    expect(write).toHaveBeenCalledOnce();
  });
});
