/** Envoltorio mínimo de IndexedDB (sin dependencias). */
const DB_NAME = 'fmodel-2dcad';
const DB_VERSION = 2;
export const STORES = ['drawings', 'versions', 'recovery', 'meta', 'library', 'libraryCategories'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;
let openedDb: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      openedDb = db;
      const release = () => {
        if (openedDb !== db) return;
        openedDb = null;
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        release();
      };
      db.onclose = release;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  dbPromise = opening;
  void opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });
  return opening;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let result: T;
        req.onsuccess = () => { result = req.result; };
        req.onerror = () => reject(req.error ?? new Error('Petición IndexedDB fallida'));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error('Transacción IndexedDB fallida'));
        t.onabort = () => reject(t.error ?? new Error('Transacción IndexedDB cancelada'));
      }),
  );
}

export const idbPut = <T extends { id: string }>(store: StoreName, value: T) => tx(store, 'readwrite', (s) => s.put(value));
export const idbGet = <T>(store: StoreName, id: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
export const idbDelete = (store: StoreName, id: string) => tx(store, 'readwrite', (s) => s.delete(id));
export const idbAll = <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);

/** Lee y reemplaza un registro dentro de la misma transacción de escritura. */
export function idbUpdate<T extends { id: string }>(store: StoreName, id: string, update: (current: T | undefined) => T | undefined): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(store, 'readwrite');
        const objectStore = transaction.objectStore(store);
        const request = objectStore.get(id) as IDBRequest<T | undefined>;
        let result: T | undefined;
        request.onsuccess = () => {
          try {
            result = update(request.result);
            if (result !== undefined) objectStore.put(result);
          } catch (err) {
            transaction.abort();
            reject(err);
          }
        };
        request.onerror = () => reject(request.error ?? new Error('Lectura IndexedDB fallida'));
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error ?? new Error('Transacción IndexedDB fallida'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Transacción IndexedDB cancelada'));
      }),
  );
}

/** Reclama una clave heredada y la mueve de forma atómica a una clave nueva. */
export function idbMove<T extends { id: string }>(store: StoreName, fromId: string, toId: string): Promise<T | undefined> {
  return openDb().then(
    (db) => new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(store, 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(fromId) as IDBRequest<T | undefined>;
      let moved: T | undefined;
      request.onsuccess = () => {
        const legacy = request.result;
        if (!legacy) return;
        const target = objectStore.get(toId) as IDBRequest<T | undefined>;
        target.onsuccess = () => {
          if (target.result) return;
          moved = { ...legacy, id: toId };
          objectStore.put(moved);
          objectStore.delete(fromId);
        };
      };
      request.onerror = () => reject(request.error ?? new Error('Lectura IndexedDB fallida'));
      transaction.oncomplete = () => resolve(moved);
      transaction.onerror = () => reject(transaction.error ?? new Error('Transacción IndexedDB fallida'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Transacción IndexedDB cancelada'));
    }),
  );
}

/**
 * Escritura que empieza en el mismo instante (sin esperar a una promesa) si la base ya
 * está abierta: al cerrar o recargar la página no queda tiempo para microtareas.
 * Devuelve null si no pudo iniciarse; la promesa solo se cumple al confirmar la transacción.
 */
export function idbPutNow<T extends { id: string }>(store: StoreName, value: T): Promise<void> | null {
  if (!openedDb) return null;
  try {
    const t = openedDb.transaction(store, 'readwrite');
    return new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error('Transacción IndexedDB fallida'));
      t.onabort = () => reject(t.error ?? new Error('Transacción IndexedDB cancelada'));
      try {
        const request = t.objectStore(store).put(value);
        request.onerror = () => reject(request.error ?? new Error('Petición IndexedDB fallida'));
        t.commit?.();
      } catch (err) {
        try { t.abort(); } catch { /* la transacción ya terminó */ }
        reject(err);
      }
    });
  } catch {
    return null;
  }
}

/** Varias escrituras en una sola transacción: o se guardan todas o ninguna. */
export function idbWrite(stores: StoreName[], fn: (get: (s: StoreName) => IDBObjectStore) => void): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(stores, 'readwrite');
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error('Transacción cancelada'));
        try {
          fn((s) => t.objectStore(s));
        } catch (err) {
          t.abort();
          reject(err);
        }
      }),
  );
}
