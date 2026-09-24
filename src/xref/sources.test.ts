import { describe, expect, it, vi } from 'vitest';
import { INPUT_LIMITS, InputLimitError } from '../io/limits';
import { rememberXrefHandle, readXrefBytes } from './sources';

const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../storage/idb', () => ({
  idbPut: vi.fn(async (_store: string, value: { id: string }) => { records.set(value.id, value); }),
  idbGet: vi.fn(async (_store: string, id: string) => records.get(id)),
  idbDelete: vi.fn(async (_store: string, id: string) => { records.delete(id); }),
}));

describe('orígenes de referencias externas', () => {
  it('rechaza un archivo sobredimensionado antes de reservar su ArrayBuffer', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const handle = {
      name: 'xref-enorme.fmodel',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      getFile: vi.fn(async () => ({
        name: 'xref-enorme.fmodel',
        size: INPUT_LIMITS.maxCompressedBytes + 1,
        arrayBuffer,
      } as unknown as File)),
    };
    await rememberXrefHandle('xref-limite', handle, handle.name);

    await expect(readXrefBytes('xref-limite', handle.name, false)).rejects.toBeInstanceOf(InputLimitError);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
