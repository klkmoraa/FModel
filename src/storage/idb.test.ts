import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { idbGet, idbMove, idbPut, idbUpdate, openDb } from './idb';

afterEach(() => vi.restoreAllMocks());

describe('IndexedDB transaction wrapper', () => {
  it('does not report a write as saved when its transaction aborts after request success', async () => {
    await openDb();
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown) {
      const request = originalPut.call(this, value);
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    });

    await expect(idbPut('meta', { id: 'aborted-write', value: 'not committed' })).rejects.toThrow();
    vi.restoreAllMocks();
    await expect(idbGet('meta', 'aborted-write')).resolves.toBeUndefined();
  });

  it('updates a record atomically and rolls back if the replacement aborts', async () => {
    await idbPut('meta', { id: 'atomic-update', value: 'before' });
    await expect(idbUpdate<{ id: string; value: string }>('meta', 'atomic-update', (current) => ({ ...current!, value: 'after' })))
      .resolves.toMatchObject({ value: 'after' });

    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown) {
      const request = originalPut.call(this, value);
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    });

    await expect(idbUpdate<{ id: string; value: string }>('meta', 'atomic-update', (current) => ({ ...current!, value: 'discarded' }))).rejects.toThrow();
    vi.restoreAllMocks();
    await expect(idbGet<{ id: string; value: string }>('meta', 'atomic-update')).resolves.toMatchObject({ value: 'after' });
  });

  it('reopens the database after a versionchange closes the cached connection', async () => {
    const first = await openDb();
    first.onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent);

    const second = await openDb();
    expect(second).not.toBe(first);
    await expect(idbGet('meta', 'missing')).resolves.toBeUndefined();
  });

  it('does not replace a newer target while moving a legacy key', async () => {
    await idbPut('meta', { id: 'legacy-key', value: 'older' });
    await idbPut('meta', { id: 'new-key', value: 'newer' });

    await idbMove<{ id: string; value: string }>('meta', 'legacy-key', 'new-key');

    await expect(idbGet<{ id: string; value: string }>('meta', 'new-key')).resolves.toMatchObject({ value: 'newer' });
  });
});
