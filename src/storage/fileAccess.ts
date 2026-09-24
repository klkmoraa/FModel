/**
 * Abrir y guardar archivos. Usa File System Access API (Chrome/Edge) para guardar en
 * el mismo archivo; en Safari/Firefox recurre a descarga y selector clásico.
 */
import { INPUT_LIMITS, InputLimitError } from '../io/limits';

type Handle = { name: string; createWritable(): Promise<{ write(d: Blob | BufferSource | string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File> };
const pendingWrites = new WeakMap<Handle, Promise<void>>();

interface PickerWindow {
  showOpenFilePicker?: (o: unknown) => Promise<Handle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<Handle>;
}

export const supportsFileSystemAccess = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window;

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
  handle?: Handle;
}

/** Resultado explícito de guardar: descargar es éxito, cancelar no produce efectos. */
export type SaveFileResult =
  | { kind: 'saved-to-handle'; handle: Handle }
  | { kind: 'download-started' }
  | { kind: 'cancelled' };

export async function readBrowserFile(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>, maxBytes = INPUT_LIMITS.maxCompressedBytes): Promise<Uint8Array> {
  if (Number.isFinite(file.size) && file.size > maxBytes) {
    throw new InputLimitError(`El archivo «${file.name}» es demasiado grande. / File "${file.name}" is too large.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new InputLimitError(`El archivo «${file.name}» es demasiado grande. / File "${file.name}" is too large.`);
  }
  return bytes;
}

export async function openFile(accept: Record<string, string[]>, description: string, maxBytes = INPUT_LIMITS.maxCompressedBytes): Promise<OpenedFile | null> {
  const w = window as unknown as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: [{ description, accept }], multiple: false });
      const file = await handle.getFile();
      return { name: file.name, bytes: await readBrowserFile(file, maxBytes), handle };
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = Object.values(accept).flat().join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve({ name: file.name, bytes: await readBrowserFile(file, maxBytes) });
      } catch (err) {
        reject(err);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function saveFile(data: Blob, suggestedName: string, accept: Record<string, string[]>, description: string, existing?: Handle | null): Promise<SaveFileResult> {
  if (existing) {
    await writeToHandle(existing, data);
    return { kind: 'saved-to-handle', handle: existing };
  }
  const w = window as unknown as PickerWindow;
  if (w.showSaveFilePicker) {
    let handle: Handle;
    try {
      handle = await w.showSaveFilePicker({ suggestedName, types: [{ description, accept }] });
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return { kind: 'cancelled' };
      throw err;
    }
    await writeToHandle(handle, data);
    return { kind: 'saved-to-handle', handle };
  }
  downloadBlob(data, suggestedName);
  return { kind: 'download-started' };
}

/** Conserva el orden de las escrituras concurrentes al mismo archivo. */
async function writeToHandle(handle: Handle, data: Blob): Promise<void> {
  const previous = pendingWrites.get(handle);
  const write = (previous ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  });
  pendingWrites.set(handle, write);
  try {
    await write;
  } finally {
    if (pendingWrites.get(handle) === write) pendingWrites.delete(handle);
  }
}

export function downloadBlob(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type FileHandle = Handle;
