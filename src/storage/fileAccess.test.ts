import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile, type FileHandle } from './fileAccess';

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
