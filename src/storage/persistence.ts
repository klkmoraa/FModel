import type { CadDocument } from '../document/document';
import { newId } from '../document/ids';
import type { Id } from '../document/types';
import { readPackage, toNativeFile, writePackage } from '../io/native';
import type { NativeFile } from '../io/native';
import * as idb from './idb';

export interface StoredDrawing {
  id: Id;
  name: string;
  savedAt: number;
  bytes: Uint8Array;
  size: number;
  /** Orden de captura para impedir que una escritura antigua reemplace una nueva. */
  snapshotOrder?: number;
}

export interface DrawingSnapshot {
  documentId: Id;
  documentVersion: number;
  snapshotOrder: number;
  entityCount: number;
  bytes: Uint8Array;
}

let lastSnapshotOrder = 0;

/** Captura una revisión con orden estable aun si su escritura termina más tarde. */
export function createDrawingSnapshot(doc: CadDocument, bytes = writePackage(doc.data, doc.id)): DrawingSnapshot {
  const timeOrder = Date.now() * 1_000;
  lastSnapshotOrder = Math.max(lastSnapshotOrder + 1, timeOrder);
  return { documentId: doc.id, documentVersion: doc.version, snapshotOrder: lastSnapshotOrder, entityCount: doc.data.entities.size, bytes };
}

export interface VersionRecord {
  id: string;
  documentId: Id;
  name: string;
  label: string;
  savedAt: number;
  auto: boolean;
  entityCount: number;
  bytes: Uint8Array;
}

export interface RecoveryRecord {
  id: string;
  documentId: Id;
  name: string;
  savedAt: number;
  file: NativeFile;
  cleanExit: boolean;
}

/** Estado del dibujo abierto, para reabrirlo tal cual al recargar la página. */
export interface SessionRecord {
  id: string;
  documentId: Id;
  name: string;
  savedAt: number;
  file: NativeFile;
  dirty: boolean;
}

export type StorageErrorKind = 'quota' | 'unavailable' | 'unknown';

export interface ClassifiedStorageError {
  kind: StorageErrorKind;
  name: string;
  message: string;
  raw: unknown;
}

export type PersistenceHealthStatus = 'protected' | 'degraded' | 'unavailable';

export type PersistenceOp =
  | 'autosave'
  | 'saveVersion'
  | 'storeDrawing'
  | 'storeDrawingAndVersion'
  | 'versions'
  | 'deleteVersion'
  | 'drawings'
  | 'deleteDrawing'
  | 'recovery'
  | 'cleanExit'
  | 'session'
  | 'purge';

export interface PersistenceHealth {
  status: PersistenceHealthStatus;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: ClassifiedStorageError | null;
  lastOp: PersistenceOp | null;
}

export type AutosaveResult =
  | { status: 'not-needed' }
  | { status: 'saved'; savedAt: number; versionSaved: boolean }
  | { status: 'failed'; reason: StorageErrorKind; error: ClassifiedStorageError };

const TAB_SESSION_STORAGE_KEY = 'fmodel.tabSessionId';
let volatileTabSessionId: string | null = null;

function sessionRecordId(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      let token = sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
      if (!token || !/^tab[0-9a-z]{11}$/.test(token)) {
        token = newId('tab');
        sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, token);
      }
      return `session:${token}`;
    }
  } catch {
    // Un navegador que bloquee sessionStorage conserva la sesión en esta pestaña mientras siga abierta.
  }
  volatileTabSessionId ??= newId('tab');
  return `session:${volatileTabSessionId}`;
}

/**
 * Clasifica errores de persistencia local (IndexedDB, cuota de almacenamiento,
 * estados bloqueados/inválidos o entornos sin almacenamiento).
 * Compatible con múltiples navegadores y no dependiente únicamente de `instanceof`.
 */
export function classifyStorageError(err: unknown): ClassifiedStorageError {
  const actualErr =
    typeof err === 'object' && err !== null && 'target' in err && typeof (err as { target: unknown }).target === 'object' && (err as { target: { error?: unknown } }).target !== null && 'error' in (err as { target: { error?: unknown } }).target!
      ? (err as { target: { error?: unknown } }).target.error
      : err;

  if (!actualErr) {
    if (typeof indexedDB === 'undefined') {
      return {
        kind: 'unavailable',
        name: 'UnavailableError',
        message: 'IndexedDB no disponible',
        raw: err,
      };
    }
    return {
      kind: 'unknown',
      name: 'UnknownError',
      message: 'Error de almacenamiento desconocido',
      raw: err,
    };
  }
  const name =
    typeof actualErr === 'object' && actualErr !== null && 'name' in actualErr && typeof (actualErr as { name: unknown }).name === 'string'
      ? (actualErr as { name: string }).name
      : '';
  const code =
    typeof actualErr === 'object' && actualErr !== null && 'code' in actualErr && typeof (actualErr as { code: unknown }).code === 'number'
      ? (actualErr as { code: number }).code
      : 0;
  const message =
    typeof actualErr === 'object' && actualErr !== null && 'message' in actualErr && typeof (actualErr as { message: unknown }).message === 'string'
      ? (actualErr as { message: string }).message
      : typeof actualErr === 'string'
        ? actualErr
        : '';

  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014 ||
    /quota/i.test(name) ||
    /quota|storage full|disk full|out of disk|no space left|not enough space|insufficient (?:storage|space|disk)/i.test(message)
  ) {
    return {
      kind: 'quota',
      name: name || 'QuotaExceededError',
      message: message || 'Cuota de almacenamiento excedida',
      raw: err,
    };
  }

  if (
    name === 'InvalidStateError' ||
    name === 'DatabaseClosedError' ||
    name === 'SecurityError' ||
    name === 'NotAllowedError' ||
    /no disponible|not available|disabled|indexeddb.*(?:not supported|disabled|blocked)|security|permission/i.test(message)
  ) {
    return {
      kind: 'unavailable',
      name: name || 'InvalidStateError',
      message: message || 'Almacenamiento no disponible',
      raw: err,
    };
  }

  if (typeof indexedDB === 'undefined') {
    return {
      kind: 'unavailable',
      name: name || 'UnavailableError',
      message: message || 'IndexedDB no disponible',
      raw: err,
    };
  }

  return {
    kind: 'unknown',
    name: name || 'Error',
    message: message || 'Error de almacenamiento',
    raw: err,
  };
}

/**
 * Consulta la estimación de cuota y uso del almacenamiento web cuando la Storage API
 * esté soportada por el navegador.
 */
export async function getStorageEstimate(): Promise<{ quota?: number; usage?: number } | null> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      return await navigator.storage.estimate();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Persistencia local-first: autoguardado en IndexedDB, historial de versiones y
 * recuperación tras cierre inesperado con monitor de salud y gestión de cuota.
 * Nada sale del navegador.
 */
export class Persistence {
  private readonly sessionId = sessionRecordId();
  private readonly recoveryId = this.sessionId.replace(/^session:/, 'current:');
  private timer = 0;
  private lastVersionAt = new Map<Id, number>();
  private unloadHandler = () => void this.markCleanExit();
  private sessionTimer = 0;
  private healthListeners = new Set<(health: PersistenceHealth) => void>();

  private _health: PersistenceHealth = {
    status: typeof indexedDB === 'undefined' ? 'unavailable' : 'protected',
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    lastOp: null,
  };

  constructor(
    private getDoc: () => CadDocument,
    private getName: () => string,
  ) {}

  get health(): PersistenceHealth {
    return { ...this._health };
  }

  onHealthChange(listener: (health: PersistenceHealth) => void): () => void {
    this.healthListeners.add(listener);
    listener(this.health);
    return () => {
      this.healthListeners.delete(listener);
    };
  }

  private recordSuccess(op: PersistenceHealth['lastOp']) {
    this._health = {
      status: 'protected',
      lastSuccessAt: Date.now(),
      lastFailureAt: this._health.lastFailureAt,
      lastError: null,
      lastOp: op,
    };
    this.emitHealth();
  }

  private recordFailure(op: PersistenceHealth['lastOp'], err: unknown): ClassifiedStorageError {
    const classified = classifyStorageError(err);
    this._health = {
      status: classified.kind === 'unavailable' ? 'unavailable' : 'degraded',
      lastSuccessAt: this._health.lastSuccessAt,
      lastFailureAt: Date.now(),
      lastError: classified,
      lastOp: op,
    };
    this.emitHealth();
    return classified;
  }

  private emitHealth() {
    for (const l of this.healthListeners) {
      try {
        l(this.health);
      } catch {
        /* listener error */
      }
    }
  }

  start(autosaveMinutes: number) {
    this.stop();
    window.addEventListener('beforeunload', this.unloadHandler);
    if (autosaveMinutes > 0) this.timer = window.setInterval(() => void this.autosave(), autosaveMinutes * 60_000);
  }

  stop() {
    window.clearInterval(this.timer);
    window.removeEventListener('beforeunload', this.unloadHandler);
  }

  async estimate(): Promise<{ quota?: number; usage?: number } | null> {
    return getStorageEstimate();
  }

  async autosave(): Promise<AutosaveResult> {
    const doc = this.getDoc();
    if (!doc.dirty) return { status: 'not-needed' };
    try {
      const now = Date.now();
      const rec: RecoveryRecord = {
        id: this.recoveryId,
        documentId: doc.id,
        name: this.getName(),
        savedAt: now,
        file: toNativeFile(doc.data, doc.id, { embedAssets: true }),
        cleanExit: false,
      };
      let versionSaved = false;
      // versión automática como máximo cada 10 minutos
      const previousVersionAt = this.lastVersionAt.get(doc.id) ?? 0;
      if (now - previousVersionAt > 10 * 60_000) {
        const bytes = writePackage(doc.data, doc.id);
        const vRec: VersionRecord = {
          id: `${doc.id}:${newId('v')}`,
          documentId: doc.id,
          name: this.getName(),
          label: 'Autoguardado',
          savedAt: now,
          auto: true,
          entityCount: doc.data.entities.size,
          bytes,
        };
        await idb.idbWrite(['recovery', 'versions'], (get) => {
          get('recovery').put(rec);
          get('versions').put(vRec);
        });
        this.lastVersionAt.set(doc.id, now);
        versionSaved = true;

        // conservar como máximo 40 versiones automáticas por documento
        try {
          const all = (await idb.idbAll<VersionRecord>('versions'))
            .filter((v) => v.documentId === doc.id && v.auto)
            .sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
          const toDelete = all.slice(40);
          if (toDelete.length > 0) {
            await idb.idbWrite(['versions'], (get) => {
              const store = get('versions');
              for (const old of toDelete) store.delete(old.id);
            });
          }
        } catch {
          // No invalidar el autoguardado exitoso si la poda secundaria falla
        }
      } else {
        await idb.idbPut('recovery', rec);
      }
      this.recordSuccess('autosave');
      return { status: 'saved', savedAt: now, versionSaved };
    } catch (err) {
      const classified = this.recordFailure('autosave', err);
      return { status: 'failed', reason: classified.kind, error: classified };
    }
  }

  async markCleanExit() {
    try {
      const doc = this.getDoc();
      const cleanExit = !doc.dirty;
      await idb.idbUpdate<RecoveryRecord>('recovery', this.recoveryId, (rec) => rec?.documentId === doc.id ? { ...rec, cleanExit } : undefined);
      this.recordSuccess('cleanExit');
    } catch (err) {
      this.recordFailure('cleanExit', err);
    }
  }

  /** Borrador recuperable si la sesión anterior terminó sin guardar. */
  async pendingRecovery(): Promise<RecoveryRecord | null> {
    try {
      const records = await idb.idbAll<RecoveryRecord>('recovery');
      const rec = records
        .filter((item) => typeof item?.id === 'string' && (item.id === 'current' || item.id.startsWith('current:')) && !item.cleanExit)
        .sort((a, b) => b.savedAt - a.savedAt)[0];
      this.recordSuccess('recovery');
      return rec ?? null;
    } catch (err) {
      this.recordFailure('recovery', err);
      throw err;
    }
  }

  async discardRecovery() {
    try {
      const rec = await this.pendingRecovery();
      if (rec) await idb.idbDelete('recovery', rec.id);
      this.recordSuccess('recovery');
    } catch (err) {
      this.recordFailure('recovery', err);
      throw err;
    }
  }

  /** Programa el guardado de la sesión tras una breve pausa sin cambios. */
  scheduleSession(delayMs = 600) {
    clearTimeout(this.sessionTimer);
    this.sessionTimer = setTimeout(() => {
      this.sessionTimer = 0;
      void this.saveSession();
    }, delayMs) as unknown as number;
  }

  /**
   * Escribe ya la sesión pendiente (al ocultar, cerrar o recargar la página). La
   * transacción se inicia de forma síncrona para que el navegador la complete aunque
   * la página se descargue a continuación.
   */
  async flushSession(): Promise<boolean> {
    if (!this.sessionTimer) return false;
    clearTimeout(this.sessionTimer);
    this.sessionTimer = 0;
    try {
      const pending = idb.idbPutNow('recovery', this.sessionRecord());
      if (pending) {
        await pending;
        this.recordSuccess('session');
        return true;
      }
    } catch (err) {
      this.recordFailure('session', err);
    }
    return this.saveSession();
  }

  private sessionRecord(): SessionRecord {
    const doc = this.getDoc();
    return { id: this.sessionId, documentId: doc.id, name: this.getName(), savedAt: Date.now(), file: toNativeFile(doc.data, doc.id, { embedAssets: true }), dirty: doc.dirty };
  }

  async saveSession(): Promise<boolean> {
    try {
      await idb.idbPut('recovery', this.sessionRecord());
      this.recordSuccess('session');
      return true;
    } catch (err) {
      this.recordFailure('session', err);
      return false;
    }
  }

  async loadSession(): Promise<SessionRecord | null> {
    try {
      const rec = await idb.idbGet<SessionRecord>('recovery', this.sessionId);
      if (rec) return rec;
      const migrated = await idb.idbMove<SessionRecord>('recovery', 'session', this.sessionId);
      return migrated ?? (await idb.idbGet<SessionRecord>('recovery', this.sessionId)) ?? null;
    } catch (err) {
      this.recordFailure('session', err);
      return null;
    }
  }

  /**
   * Guarda de manera atómica el dibujo y su versión en una única transacción multi-store.
   * Acepta una instantánea completa cuando la escritura del archivo empezó antes.
   */
  async storeDrawingAndVersion(
    name: string,
    label: string,
    precomputed?: DrawingSnapshot,
  ): Promise<{ drawing: StoredDrawing; version: VersionRecord }> {
    const snapshot = precomputed ?? (() => {
      const doc = this.getDoc();
      return createDrawingSnapshot(doc);
    })();
    const now = Date.now();
    const drawing: StoredDrawing = { id: snapshot.documentId, name, savedAt: now, bytes: snapshot.bytes, size: snapshot.bytes.length, snapshotOrder: snapshot.snapshotOrder };
    const version: VersionRecord = {
      id: `${snapshot.documentId}:${newId('v')}`,
      documentId: snapshot.documentId,
      name,
      label,
      savedAt: now,
      auto: false,
      entityCount: snapshot.entityCount,
      bytes: snapshot.bytes,
    };
    try {
      await idb.idbWrite(['drawings', 'versions'], (get) => {
        const drawings = get('drawings');
        const current = drawings.get(drawing.id) as IDBRequest<StoredDrawing | undefined>;
        current.onsuccess = () => {
          const storedOrder = current.result?.snapshotOrder;
          if (storedOrder === undefined || storedOrder <= snapshot.snapshotOrder) drawings.put(drawing);
        };
        get('versions').put(version);
      });
      try {
        const all = (await idb.idbAll<VersionRecord>('versions'))
          .filter((v) => v.documentId === snapshot.documentId && v.auto)
          .sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
        const toDelete = all.slice(40);
        if (toDelete.length > 0) {
          await idb.idbWrite(['versions'], (get) => {
            const store = get('versions');
            for (const old of toDelete) store.delete(old.id);
          });
        }
      } catch {
        // No invalidar la operación principal si falla la poda secundaria
      }
      this.recordSuccess('storeDrawingAndVersion');
      return { drawing, version };
    } catch (err) {
      this.recordFailure('storeDrawingAndVersion', err);
      throw err;
    }
  }

  async saveVersion(label: string, auto = false): Promise<VersionRecord> {
    const doc = this.getDoc();
    const bytes = writePackage(doc.data, doc.id);
    const rec: VersionRecord = {
      id: `${doc.id}:${newId('v')}`,
      documentId: doc.id,
      name: this.getName(),
      label,
      savedAt: Date.now(),
      auto,
      entityCount: doc.data.entities.size,
      bytes,
    };
    try {
      await idb.idbPut('versions', rec);
      // conservar como máximo 40 versiones automáticas por documento
      try {
        const all = (await idb.idbAll<VersionRecord>('versions'))
          .filter((v) => v.documentId === doc.id && v.auto)
          .sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
        const toDelete = all.slice(40);
        if (toDelete.length > 0) {
          await idb.idbWrite(['versions'], (get) => {
            const store = get('versions');
            for (const old of toDelete) store.delete(old.id);
          });
        }
      } catch {
        // No invalidar el guardado de versión si la poda secundaria falla
      }
      this.recordSuccess('saveVersion');
      return rec;
    } catch (err) {
      this.recordFailure('saveVersion', err);
      throw err;
    }
  }

  /**
   * Elimina versiones automáticas para liberar espacio en cuota excedida.
   * Nunca elimina versiones manuales. Realiza el borrado en lote de forma atómica.
   * @param keepCount Cantidad de versiones automáticas más recientes a conservar (por defecto 0).
   * @param documentId Opcional: si se especifica, solo purga las de este documento.
   * @returns Cantidad de versiones eliminadas.
   */
  async purgeAutoVersions(keepCount = 0, documentId?: Id): Promise<number> {
    try {
      const all = await idb.idbAll<VersionRecord>('versions');
      const autos = all
        .filter((v) => v.auto && (!documentId || v.documentId === documentId))
        .sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
      const toDelete = autos.slice(keepCount);
      if (toDelete.length > 0) {
        await idb.idbWrite(['versions'], (get) => {
          const store = get('versions');
          for (const old of toDelete) store.delete(old.id);
        });
        this.recordSuccess('purge');
      }
      return toDelete.length;
    } catch (err) {
      this.recordFailure('purge', err);
      throw err;
    }
  }

  async versions(documentId?: Id): Promise<VersionRecord[]> {
    try {
      const all = await idb.idbAll<VersionRecord>('versions');
      this.recordSuccess('versions');
      return all
        .filter((v) => !documentId || v.documentId === documentId)
        .sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    } catch (err) {
      this.recordFailure('versions', err);
      throw err;
    }
  }

  async deleteVersion(id: string) {
    try {
      await idb.idbDelete('versions', id);
      this.recordSuccess('deleteVersion');
    } catch (err) {
      this.recordFailure('deleteVersion', err);
      throw err;
    }
  }

  loadVersion(v: VersionRecord) {
    return readPackage(v.bytes);
  }

  async storeDrawing(name: string): Promise<StoredDrawing> {
    const doc = this.getDoc();
    const bytes = writePackage(doc.data, doc.id);
    const snapshot = createDrawingSnapshot(doc, bytes);
    const rec: StoredDrawing = { id: doc.id, name, savedAt: Date.now(), bytes, size: bytes.length, snapshotOrder: snapshot.snapshotOrder };
    try {
      await idb.idbPut('drawings', rec);
      this.recordSuccess('storeDrawing');
      return rec;
    } catch (err) {
      this.recordFailure('storeDrawing', err);
      throw err;
    }
  }

  async drawings(): Promise<StoredDrawing[]> {
    try {
      const list = await idb.idbAll<StoredDrawing>('drawings');
      this.recordSuccess('drawings');
      return list.sort((a, b) => b.savedAt - a.savedAt);
    } catch (err) {
      this.recordFailure('drawings', err);
      throw err;
    }
  }

  async deleteDrawing(id: Id) {
    try {
      await idb.idbDelete('drawings', id);
      this.recordSuccess('deleteDrawing');
    } catch (err) {
      this.recordFailure('deleteDrawing', err);
      throw err;
    }
  }
}
