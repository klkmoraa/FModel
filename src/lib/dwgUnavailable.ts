export const DWG_UNAVAILABLE = {
  es: 'DWG no está disponible en esta versión pública. Convierte el archivo a DXF y vuelve a abrirlo.',
  en: 'DWG is unavailable in this public build. Convert the file to DXF and open it again.',
};

export function dwgUnavailableError(): Error {
  return new Error(`${DWG_UNAVAILABLE.es} / ${DWG_UNAVAILABLE.en}`);
}
