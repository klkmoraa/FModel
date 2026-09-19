import type { LibreDwg } from '@mlightcad/libredwg-web';
import { decodeDxfBytes } from '../dxf/importDxf';
import type { DxfFile } from '../dxf/parser';
import { parseDxf } from '../dxf/parser';
import { applyDwgFixes } from './dwgToDxf';

/**
 * Lee un DWG con el conversor WebAssembly integrado: escribe un DXF, que pasa
 * por el mismo analizador e importador que cualquier DXF, y se corrigen las capas y las tablas
 * con los datos leídos del propio DWG (`applyDwgFixes`). La biblioteca se carga solo al abrir un
 * DWG y se reutiliza. En el navegador se pasa la URL del `.wasm` compilado (`wasmFile`); en
 * Node, la carpeta que lo contiene (`wasmDir`).
 */
let instance: Promise<LibreDwg> | null = null;

function libredwg(where: { wasmFile?: string; wasmDir?: string }): Promise<LibreDwg> {
  instance ??= import('@mlightcad/libredwg-web').then(({ LibreDwg }) =>
    // El runtime pide «<carpeta>/libredwg-web.wasm»: con «?» tras la URL exacta del archivo
    // compilado (con hash), el nombre que añade queda como parámetro inofensivo.
    LibreDwg.create(where.wasmFile ? `${where.wasmFile}?` : where.wasmDir),
  );
  instance.catch(() => (instance = null));
  return instance;
}

export async function readDwgFile(bytes: Uint8Array, where: { wasmFile?: string; wasmDir?: string }): Promise<DxfFile> {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 6));
  if (!/^AC10\d\d$/.test(head)) throw new Error('El archivo no es un DWG. / Not a DWG file.');
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  const lib = await libredwg(where);
  const buffer = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  let text: Uint8Array | null;
  try {
    text = lib.dwg_write_dxf(buffer());
  } catch (err) {
    throw new Error(`El lector DWG no pudo leer el archivo (${err instanceof Error ? err.message : String(err)}). / The DWG reader could not read the file.`);
  }
  if (!text?.length) throw new Error('El lector DWG no pudo leer el archivo: versión no admitida o archivo dañado. / The DWG reader could not read the file: unsupported version or damaged file.');
  const dxf = parseDxf(decodeDxfBytes(text));
  const dwg = lib.dwg_read_data(buffer(), Dwg_File_Type.DWG);
  if (dwg) {
    try {
      applyDwgFixes(dxf, lib.convert(dwg));
    } finally {
      lib.dwg_free(dwg);
    }
  }
  return dxf;
}
