# Compatibilidad DXF de FModel 2D CAD

FModel lee y escribe DXF ASCII. El formato nativo sigue siendo `.fmodel` (versionado, sin pérdidas); DXF es el formato de intercambio. Cada importación y exportación genera un **informe de conversión** visible en la aplicación (y descargable como texto) con tres listas: conservado, transformado y no admitido. Nada se descarta en silencio.

- **Exportación:** DXF R2010 (`AC1024`), codificación UTF-8, unidades según `$INSUNITS`.
- **Importación:** DXF R12 a R2018. Los archivos anteriores a R2007 se decodifican con su `$DWGCODEPAGE` (Windows-1252 por defecto); R2007+ como UTF-8. DXF binario no se admite.
- **Validación:** la prueba automática (`src/io/dxf/exportDxf.test.ts`) comprueba estructura, handles únicos y la ida y vuelta de tipos, capas, bloques, atributos y viewports. El mismo dibujo de prueba se audita con `ezdxf` mediante `scripts/audit-dxf.py` (lectura estricta, recuperación y `audit()`): resultado actual sin errores ni correcciones.

## DWG

FModel **no lee ni escribe DWG** y no simula compatibilidad. No existe hoy una solución que sea a la vez legal para distribuir en una aplicación web y fiable en escritura:

- Las bibliotecas de Open Design Alliance requieren licencia comercial de pago.
- LibreDWG (GPL) tiene escritura incompleta y no es apta para producción.

Para intercambiar con DWG, convierte a DXF con la herramienta de tu programa CAD o con un conversor dedicado, y abre el DXF en FModel.

## Exportación (FModel → DXF)

### Se conserva

| FModel | DXF | Notas |
|---|---|---|
| Línea, rayo, línea auxiliar | `LINE`, `RAY`, `XLINE` | |
| Círculo, arco, elipse (y arcos elípticos) | `CIRCLE`, `ARC`, `ELLIPSE` | |
| Punto | `POINT` | `$PDMODE`/`$PDSIZE` en la cabecera |
| Polilínea (bulges, anchos) | `LWPOLYLINE` | anchos constantes y por vértice |
| Spline (control/ajuste, racional) | `SPLINE` | nudos, pesos y puntos de ajuste |
| Texto (alineaciones, ancho, oblicuidad) | `TEXT` | |
| Texto de párrafos | `MTEXT` | negrita/cursiva como `{\f…|b1|i1;…}`; fondo de máscara |
| Sombreado predefinido, de usuario y sólido; islas | `HATCH` | se escriben las líneas de definición del patrón |
| Sombreado degradado | `HATCH` (gradiente) | dos colores, ángulo y centrado |
| Directriz | `LEADER` | |
| Cota lineal, alineada, angular (2 líneas y 3 puntos), radio, diámetro, coordenada | `DIMENSION` + bloque `*D` | el bloque guarda la representación exacta de FModel |
| Bloques, puntos base, descripción, unidades, explotable, escala uniforme | `BLOCK_RECORD` + `BLOCK` | |
| Referencias a bloque y MINSERT | `INSERT` | filas, columnas y espaciado |
| Definiciones y valores de atributo | `ATTDEF`, `ATTRIB` | posición, altura, rotación, invisibles/constantes/verificar/predefinidos |
| Cobertura | `WIPEOUT` | con `WIPEOUTVARIABLES` |
| Presentaciones y configuración de página | `LAYOUT` | papel, márgenes, orientación, área, escala, centrado, desfase, grosores, estilo monocromo/grises |
| Viewports rectangulares y poligonales | `VIEWPORT` | escala, centro de vista, giro, bloqueo, activado, congelación de capas por viewport, contorno de recorte |
| Capas | `LAYER` | nombre, color ACI/verdadero, tipo de línea, grosor, trazable, activada, inutilizada, bloqueada, inutilizada en nuevos viewports, transparencia (`AcCmTransparency`), descripción |
| Tipos de línea | `LTYPE` | patrón en unidades de dibujo |
| Estilos de texto | `STYLE` | altura, factor de anchura, oblicuidad |
| Estilos de cota | `DIMSTYLE` | tamaños, holguras, precisión, separador, prefijo/sufijo, tolerancias, unidades alternativas, colores y grosores |
| Propiedades de objeto | códigos 8, 6, 62/420, 370, 440, 48, 60 | capa, tipo de línea, color, grosor, transparencia, escala de tipo de línea, visibilidad |
| Grupos | `GROUP` | con reactores persistentes en los miembros |
| Orden de dibujo | orden de escritura | |

### Se transforma

| FModel | Resultado en DXF | Motivo |
|---|---|---|
| Bloque dinámico (cada estado usado) | bloque estático `Nombre_Vn` | DXF no representa parámetros, acciones ni restricciones de FModel |
| Matriz asociativa | objetos individuales | sin equivalente asociativo portable |
| Multilínea | líneas y arcos | los estilos `MLINE` no se conservan |
| Tabla | líneas y textos | `ACAD_TABLE` no se genera |
| Directriz múltiple | líneas, rellenos y textos | `MULTILEADER` requiere datos de contexto propietarios |
| Región | `LWPOLYLINE` cerradas | `REGION` requiere datos ACIS |
| Polilínea ajustada / spline (PEDIT) | `LWPOLYLINE` con la curva aproximada (tolerancia 0,001) | |
| Cota de longitud de arco | geometría descompuesta | `ARC_DIMENSION` no se genera |
| Imagen | `IMAGE` + `IMAGEDEF` con el nombre original | DXF solo guarda la ruta: guarda la imagen junto al DXF |
| Campos | texto con su valor actual | |
| Geometría de construcción | geometría normal | DXF no tiene ese concepto |
| Referencia externa | bloque incrustado con su contenido cargado | |
| Fuentes web (Inter, IBM Plex…) | `arial.ttf`, `cour.ttf` o `times.ttf` en `STYLE` | |
| Flechas abierta, punto, cerrada vacía, integral en estilos | cerrada rellena en `DIMSTYLE` | la geometría de cada cota exportada conserva su flecha real |
| Sobrescrituras de color/tipo/grosor por viewport | no se escriben | sí se conserva la congelación por viewport |
| Asociatividad de cotas | cotas con la geometría actual | |
| Color de fondo de sombreado | no se escribe | el patrón sí |

### No se admite

| FModel | Motivo |
|---|---|
| Calco PDF | la escala depende del programa de destino: vuelve a adjuntarlo allí |
| Imagen sin dimensiones en píxeles | no puede calcularse el tamaño de píxel |

## Importación (DXF → FModel)

### Se conserva

`LINE`, `POINT`, `CIRCLE`, `ARC`, `ELLIPSE`, `LWPOLYLINE`, `POLYLINE` 2D, `SPLINE`, `TEXT`, `MTEXT`, `INSERT` con `ATTRIB`, `ATTDEF`, `HATCH` (patrón, sólido, islas), `XLINE`, `RAY`, `DIMENSION` (lineal, alineada, angular, radio, diámetro, coordenada), `LEADER`, `VIEWPORT` de presentación, `LAYOUT`, capas, tipos de línea, estilos de texto y de cota (incluidas flechas `DIMBLK`), bloques y unidades (`$INSUNITS`).

### Se transforma

| DXF | Resultado | Motivo |
|---|---|---|
| `ELLIPSE` con extrusión −Z | proyectada al plano XY | |
| `POLYLINE` 3D | proyectada a 2D | alcance 2D |
| `SPLINE` sin vértices de control válidos | reconstruida por puntos de ajuste | |
| `SOLID`, `TRACE` | sombreado sólido | |
| `3DFACE` | 4 líneas 2D | |
| `MULTILEADER` | directriz con el estilo actual | sustituciones de estilo no conservadas |
| `WIPEOUT` | contorno recalculado en coordenadas de dibujo | |
| `MLINE` | estilo sustituido por el actual | |
| `ACAD_TABLE` | bloque con su representación gráfica | no editable como tabla |

### No se admite

| DXF | Motivo |
|---|---|
| Mallas poligonales y policaras (`POLYLINE` 3D con malla) | fuera del alcance 2D |
| `3DSOLID`, `REGION`, `BODY`, `SURFACE`, `MESH` | geometría ACIS/3D |
| `IMAGE` | DXF solo guarda la ruta: vuelve a enlazarla con IMAGEATTACH |
| `VIEWPORT` en mosaico del espacio modelo | configuración de pantalla, no de dibujo |
| `OLE2FRAME`, `ACAD_PROXY_ENTITY` | objetos propietarios |
| Cotas de tipo desconocido, sombreados con contorno ilegible, inserciones de bloques inexistentes | se listan en el informe con su causa |
