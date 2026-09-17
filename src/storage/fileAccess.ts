/**
 * Abrir y guardar archivos. Usa File System Access API (Chrome/Edge) para guardar en
 * el mismo archivo; en Safari/Firefox recurre a descarga y selector clásico.
 */
type Handle = { name: string; createWritable(): Promise<{ write(d: Blob | BufferSource | string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File> };

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

export async function openFile(accept: Record<string, string[]>, description: string): Promise<OpenedFile | null> {
  const w = window as unknown as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: [{ description, accept }], multiple: false });
      const file = await handle.getFile();
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle };
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = Object.values(accept).flat().join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function saveFile(data: Blob, suggestedName: string, accept: Record<string, string[]>, description: string, existing?: Handle | null): Promise<Handle | null> {
  const w = window as unknown as PickerWindow;
  if (existing) {
    const writable = await existing.createWritable();
    await writable.write(data);
    await writable.close();
    return existing;
  }
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName, types: [{ description, accept }] });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return handle;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null;
      throw err;
    }
  }
  downloadBlob(data, suggestedName);
  return null;
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
