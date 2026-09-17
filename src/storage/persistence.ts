import type { CadDocument } from '../document/document';
import { newId } from '../document/ids';
import type { Id } from '../document/types';
import { readPackage, toNativeFile, writePackage } from '../io/native';
import type { NativeFile } from '../io/native';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';

export interface StoredDrawing {
  id: Id;
  name: string;
  savedAt: number;
  bytes: Uint8Array;
  size: number;
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
  id: 'current';
  documentId: Id;
  name: string;
  savedAt: number;
  file: NativeFile;
  cleanExit: boolean;
}

/**
 * Persistencia local-first: autoguardado en IndexedDB, historial de versiones y
 * recuperación tras cierre inesperado. Nada sale del navegador.
 */
export class Persistence {
  private timer = 0;
  private lastVersionAt = 0;
  private unloadHandler = () => void this.markCleanExit();

  constructor(
    private getDoc: () => CadDocument,
    private getName: () => string,
  ) {}

  start(autosaveMinutes: number) {
    this.stop();
    if (autosaveMinutes <= 0) return;
    this.timer = window.setInterval(() => void this.autosave(), autosaveMinutes * 60_000);
    window.addEventListener('beforeunload', this.unloadHandler);
  }

  stop() {
    window.clearInterval(this.timer);
    window.removeEventListener('beforeunload', this.unloadHandler);
  }

  async autosave(): Promise<boolean> {
    const doc = this.getDoc();
    if (!doc.dirty) return false;
    try {
      const rec: RecoveryRecord = { id: 'current', documentId: doc.id, name: this.getName(), savedAt: Date.now(), file: toNativeFile(doc.data, doc.id, { embedAssets: true }), cleanExit: false };
      await idbPut('recovery', rec);
      // versión automática como máximo cada 10 minutos
      if (Date.now() - this.lastVersionAt > 10 * 60_000) {
        await this.saveVersion('Autoguardado', true);
        this.lastVersionAt = Date.now();
      }
      return true;
    } catch (err) {
      console.warn('autosave', err);
      return false;
    }
  }

  async markCleanExit() {
    try {
      const rec = await idbGet<RecoveryRecord>('recovery', 'current');
      if (rec) await idbPut('recovery', { ...rec, cleanExit: !this.getDoc().dirty });
    } catch {
      /* sin IndexedDB */
    }
  }

  /** Borrador recuperable si la sesión anterior terminó sin guardar. */
  async pendingRecovery(): Promise<RecoveryRecord | null> {
    try {
      const rec = await idbGet<RecoveryRecord>('recovery', 'current');
      return rec && !rec.cleanExit ? rec : null;
    } catch {
      return null;
    }
  }

  async discardRecovery() {
    try {
      await idbDelete('recovery', 'current');
    } catch {
      /* sin IndexedDB */
    }
  }

  async saveVersion(label: string, auto = false): Promise<VersionRecord> {
    const doc = this.getDoc();
    const bytes = writePackage(doc.data, doc.id);
    const rec: VersionRecord = { id: `${doc.id}:${newId('v')}`, documentId: doc.id, name: this.getName(), label, savedAt: Date.now(), auto, entityCount: doc.data.entities.size, bytes };
    await idbPut('versions', rec);
    // conservar como máximo 40 versiones automáticas por documento
    const all = (await idbAll<VersionRecord>('versions')).filter((v) => v.documentId === doc.id && v.auto).sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    for (const old of all.slice(40)) await idbDelete('versions', old.id);
    return rec;
  }

  async versions(documentId?: Id): Promise<VersionRecord[]> {
    try {
      const all = await idbAll<VersionRecord>('versions');
      // desempate por identificador: dos guardados en el mismo milisegundo se listan siempre igual
      return all.filter((v) => !documentId || v.documentId === documentId).sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    } catch {
      return [];
    }
  }

  async deleteVersion(id: string) {
    await idbDelete('versions', id);
  }

  loadVersion(v: VersionRecord) {
    return readPackage(v.bytes);
  }

  async storeDrawing(name: string): Promise<StoredDrawing> {
    const doc = this.getDoc();
    const bytes = writePackage(doc.data, doc.id);
    const rec: StoredDrawing = { id: doc.id, name, savedAt: Date.now(), bytes, size: bytes.length };
    await idbPut('drawings', rec);
    return rec;
  }

  async drawings(): Promise<StoredDrawing[]> {
    try {
      return (await idbAll<StoredDrawing>('drawings')).sort((a, b) => b.savedAt - a.savedAt);
    } catch {
      return [];
    }
  }

  async deleteDrawing(id: Id) {
    await idbDelete('drawings', id);
  }
}
