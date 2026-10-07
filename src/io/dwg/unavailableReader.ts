import type { DxfFile } from '../dxf/parser';
import { dwgUnavailableError } from '../../lib/dwgUnavailable';

/** Replaces the experimental reader before the public module graph is bundled. */
export async function readDwgFile(_bytes: Uint8Array, _where: { wasmFile?: string; wasmDir?: string } = {}): Promise<DxfFile> {
  throw dwgUnavailableError();
}
