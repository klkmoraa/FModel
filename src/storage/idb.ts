/** Envoltorio mínimo de IndexedDB (sin dependencias). */
const DB_NAME = 'fmodel-2dcad';
const DB_VERSION = 1;
export const STORES = ['drawings', 'versions', 'recovery', 'meta'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbPut = <T extends { id: string }>(store: StoreName, value: T) => tx(store, 'readwrite', (s) => s.put(value));
export const idbGet = <T>(store: StoreName, id: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
export const idbDelete = (store: StoreName, id: string) => tx(store, 'readwrite', (s) => s.delete(id));
export const idbAll = <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
