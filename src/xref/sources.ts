import type { Id } from '../document/types';
import { assertInputBytes, InputLimitError } from '../io/limits';
import { readBrowserFile } from '../storage/fileAccess';
import { idbDelete, idbGet, idbPut } from '../storage/idb';
import type { StoredDrawing } from '../storage/persistence';

/**
 * Acceso a los orígenes de referencias en el navegador. Un navegador no puede abrir rutas
 * arbitrarias: se recuerda el identificador de archivo concedido (File System Access, en
 * IndexedDB) o se usa un dibujo de la biblioteca local. Si no hay acceso, la referencia
 * queda «no encontrada» y puede volver a designarse (XREPATH).
 */
type FileHandleLike = {
  name: string;
  getFile(): Promise<File>;
  queryPermission?: (o: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'read' }) => Promise<PermissionState>;
};

interface HandleRecord {
  id: string;
  handle: FileHandleLike;
  name: string;
}

export const LIBRARY_PREFIX = 'biblioteca:';

const key = (blockId: Id) => `xref:${blockId}`;

export async function rememberXrefHandle(blockId: Id, handle: unknown, name: string) {
  if (!handle) return;
  try {
    await idbPut<HandleRecord>('meta', { id: key(blockId), handle: handle as FileHandleLike, name });
  } catch {
    /* el navegador no permite guardar identificadores: se pedirá el archivo al recargar */
  }
}

export async function forgetXrefHandle(blockId: Id) {
  try {
    await idbDelete('meta', key(blockId));
  } catch {
    /* sin almacenamiento */
  }
}

export interface ResolvedBytes {
  bytes: Uint8Array;
  name: string;
}

/**
 * Lee los bytes actuales de una referencia. `interactive` permite pedir permiso de lectura
 * (necesita un gesto del usuario); sin él solo se usa un permiso ya concedido.
 */
export async function readXrefBytes(blockId: Id, path: string, interactive: boolean): Promise<ResolvedBytes | null> {
  if (path.startsWith(LIBRARY_PREFIX)) {
    const rec = await idbGet<StoredDrawing>('drawings', path.slice(LIBRARY_PREFIX.length)).catch(() => undefined);
    if (!rec || !(rec.bytes instanceof Uint8Array)) return null;
    assertInputBytes(rec.bytes, 'referencia');
    return { bytes: rec.bytes, name: rec.name };
  }
  const rec = await idbGet<HandleRecord>('meta', key(blockId)).catch(() => undefined);
  if (!rec?.handle?.getFile) return null;
  try {
    let state = (await rec.handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (state !== 'granted' && interactive) state = (await rec.handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
    if (state !== 'granted') return null;
    const file = await rec.handle.getFile();
    return { bytes: await readBrowserFile(file), name: file.name };
  } catch (error) {
    if (error instanceof InputLimitError) throw error;
    return null;
  }
}
