/** Límites para entradas externas; permiten planos grandes sin descomprimir ZIPs hostiles. */
export const INPUT_LIMITS = {
  maxCompressedBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 128 * 1024 * 1024,
  maxZipEntries: 1_000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxEntities: 250_000,
  maxBlocks: 25_000,
  maxAssets: 10_000,
  maxPointsPerEntity: 100_000,
} as const;

export class InputLimitError extends Error {}

const u16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

export function assertInputBytes(bytes: Uint8Array, label = 'archivo') {
  if (bytes.byteLength > INPUT_LIMITS.maxCompressedBytes) throw new InputLimitError(`El ${label} es demasiado grande. / The ${label} is too large.`);
}

/** Verifica el directorio central ZIP antes de que fflate asigne la salida descomprimida. */
export function assertZipLimits(bytes: Uint8Array, label = 'paquete') {
  assertInputBytes(bytes, label);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0 || end + 22 > bytes.length) throw new InputLimitError(`El ${label} ZIP está dañado. / The ${label} ZIP is damaged.`);
  const entries = u16(bytes, end + 10);
  const directorySize = u32(bytes, end + 12);
  let offset = u32(bytes, end + 16);
  if (entries > INPUT_LIMITS.maxZipEntries || directorySize > bytes.length || offset + directorySize > bytes.length) throw new InputLimitError(`El ${label} es demasiado grande o está dañado. / The ${label} is too large or damaged.`);
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || u32(bytes, offset) !== 0x02014b50) throw new InputLimitError(`El ${label} ZIP está dañado. / The ${label} ZIP is damaged.`);
    const compressed = u32(bytes, offset + 20);
    const expanded = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    total += expanded;
    if (compressed > INPUT_LIMITS.maxCompressedBytes || expanded > INPUT_LIMITS.maxEntryBytes || total > INPUT_LIMITS.maxExpandedBytes) throw new InputLimitError(`El ${label} es demasiado grande. / The ${label} is too large.`);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}
