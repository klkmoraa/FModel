// URL del WebAssembly de LibreDWG en la compilación: el paquete no exporta su .wasm, así que se
// enlaza por ruta y Vite lo emite como recurso (también dentro del Web Worker).
export default new URL('../../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm', import.meta.url).href;
