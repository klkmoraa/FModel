# Estado de funciones de FModel 2D CAD

> Archivo generado con `node scripts/features-md.mjs` desde `src/app/features.ts`, la misma fuente que la pestaña «Estado de funciones» de la ayuda (F1). No lo edites a mano.

**Disponible**: 40 · **Experimental**: 4 · **Planeado**: 0 · **No comprometido**: 1

- **Disponible**: funciona de extremo a extremo y tiene pruebas.
- **Experimental**: funciona con limitaciones documentadas.
- **Planeado**: no implementado todavía; no hay botones que lo simulen.
- **No comprometido**: fuera de alcance por motivos legales o técnicos.

## Lienzo

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Zoom, encuadre, extensión, zoom a selección y vistas guardadas | Disponible | `ZOOM` `PAN` `VIEW` | La rueda del ratón hace zoom y dos dedos en el panel táctil encuadran: el dispositivo se deduce del propio evento y se puede fijar a mano en Opciones › Visualización. |
| Rejilla, coordenadas, cruz CAD y previsualización | Disponible | `GRIDTOGGLE` `DSETTINGS` |  |
| Selección por ventana, captura, polígono, borde, tipo y capa; ciclo de selección | Disponible | `QSELECT` `SELECTSIMILAR` |  |
| Aislar, ocultar, bloquear y pantalla limpia; paneles acoplables | Disponible | `ISOLATEOBJECTS` `HIDEOBJECTS` `CLEANSCREENON` |  |
| Uso táctil: encuadre, pellizco, pulsación larga, doble pulsación, lupa al situar puntos y barra táctil con Intro, Esc y opciones del comando | Experimental |  | El dedo sitúa el punto con lupa y apertura de referencia ampliada; dos dedos encuadran y solo hacen zoom al separarse de veras. La barra inferior reúne Intro, Esc, las opciones del comando, los modos de precisión y todas las herramientas. Probado con eventos de puntero, no en dispositivos reales; en teléfono el dibujo detallado sigue limitado por el tamaño de pantalla. |

## Precisión

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Coordenadas absolutas, relativas y polares; distancia directa; entrada dinámica | Disponible | `DYNTOGGLE` |  |
| Orto, rastreo polar, referencias a objetos permanentes y temporales, rastreo OTRACK, Tab entre candidatos | Disponible | `ORTHOTOGGLE` `POLARTOGGLE` `OSNAP` `OTRACKTOGGLE` |  |

## Dibujo

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Línea, polilínea, círculo, arco, rectángulo, polígono, elipse, spline, punto, rayo, línea auxiliar, nube de revisión, arandela | Disponible | `LINE` `PLINE` `CIRCLE` `ARC` `RECTANG` `POLYGON` `ELLIPSE` `SPLINE` `POINT` `RAY` `XLINE` `REVCLOUD` `DONUT` |  |
| Sombreado con islas, contorno, región, cobertura, multilínea, dividir y medir | Disponible | `HATCH` `BOUNDARY` `REGION` `WIPEOUT` `MLINE` `DIVIDE` `MEASURE` |  |
| Texto, texto de párrafos, directriz múltiple y tabla | Disponible | `TEXT` `MTEXT` `MLEADER` `TABLE` |  |

## Modificar

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Borrar, desplazar, copiar, girar, escalar, simetría, desfase, recortar, alargar, empalme, chaflán, estirar | Disponible | `ERASE` `MOVE` `COPY` `ROTATE` `SCALE` `MIRROR` `OFFSET` `TRIM` `EXTEND` `FILLET` `CHAMFER` `STRETCH` |  |
| Matrices rectangular, polar y por trayectoria (asociativas) | Disponible | `ARRAYRECT` `ARRAYPOLAR` `ARRAYPATH` |  |
| Juntar, partir, partir en punto, descomponer, editar polilínea, longitud, alinear, invertir, orden de dibujo, grupos, operaciones booleanas | Disponible | `JOIN` `BREAK` `BREAKATPOINT` `EXPLODE` `PEDIT` `LENGTHEN` `ALIGN` `REVERSE` `DRAWORDER` `GROUP` `UNION` |  |

## Capas y propiedades

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Administrador de capas: estados, filtros, aislar, fusionar, congelación por viewport; herencia PorCapa/PorBloque | Disponible | `LAYER` `LAYERSTATE` `LAYISO` `LAYMRG` `VPLAYER` |  |
| Inspector de propiedades con edición por lotes e igualar propiedades | Disponible | `PROPERTIES` `MATCHPROP` |  |

## Anotación

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Estilos de texto, cota, directriz múltiple, tabla y multilínea; lista de escalas | Disponible | `STYLE` `SCALELISTEDIT` |  |
| Cotas lineales, alineadas, angulares, radio, diámetro, arco, coordenada, continuas y de línea base; asociativas | Disponible | `DIMLINEAR` `DIMALIGNED` `DIMANGULAR` `DIMRADIUS` `DIMDIAMETER` `DIMARC` `DIMORDINATE` `DIMCONTINUE` `DIMBASELINE` |  |
| Campos, tolerancias, prefijos/sufijos, unidades alternativas y escala anotativa | Disponible | `FIELD` |  |

## Bloques

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Definiciones, inserción con autoescala, atributos y extracción | Disponible | `BLOCK` `INSERT` `ATTDEF` `ATTEDIT` `DATAEXTRACTION` |  |
| Biblioteca por categorías con etiquetas, importación desde DXF (bloques o dibujo entero) y bibliotecas compartibles .fmodellib | Disponible | `LIBRARYIMPORT` `LIBRARYEXPORT` `WBLOCK` |  |
| Bloques dinámicos: parámetros, acciones, estados de visibilidad, tablas de consulta, fórmulas y variables | Disponible | `BEDIT` `BPARAMETER` `BACTION` `BVSTATE` `BVARIABLE` |  |
| Editor de bloques con prueba, edición en contexto, validación y vista previa en vivo | Disponible | `BEDIT` `BTESTBLOCK` `BCLOSE` |  |
| Restricciones geométricas y dimensionales dentro de bloques, con glifos, cotas de restricción y conflictos en el lienzo | Disponible | `BCONSTRAINT` `BCPARAMETER` | Resolvedor numérico por mínimos cuadrados amortiguados: las restricciones incompatibles se marcan en conflicto en lugar de ignorarse. |

## Paletas

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Paletas de herramientas con categorías, favoritos, búsqueda y arrastrar y soltar | Disponible | `TOOLPALETTES` |  |

## Presentaciones

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Presentaciones, viewports rectangulares, poligonales y de objeto, escala bloqueada, capas por viewport | Disponible | `LAYOUT` `MVIEW` `MSPACE` `PSPACE` `VPSCALE` `VPLOCK` |  |
| Configuración de página, cajetín con campos | Disponible | `PAGESETUP` `TITLEBLOCK` |  |

## Salida

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| PDF vectorial por hoja y publicación multipágina; monocromo y escala de grises; grosores | Disponible | `PLOT` `EXPORTPDF` `PUBLISH` |  |
| SVG en milímetros | Disponible | `EXPORTSVG` |  |

## Intercambio

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Formato nativo versionado .fmodel y JSON de depuración | Disponible | `QSAVE` `SAVEAS` `OPEN` `EXPORTJSON` |  |
| Importación y exportación DXF con informe de conversión | Disponible | `IMPORTDXF` `EXPORTDXF` | Detalle en docs/dxf-compatibilidad.md. Los bloques dinámicos de FModel sobreviven a la ida y vuelta. |
| CSV/JSON de atributos y tablas | Disponible | `DATAEXTRACTION` |  |
| Lectura DWG con LibreDWG (abrir e importar a la biblioteca) | Experimental | `OPEN` `LIBRARYIMPORT` | Probada con DWG de AutoCAD 2000 y 2018 frente a su DXF equivalente. El lector (WebAssembly, ~10 MB) se descarga al primer uso. LibreDWG es GPL-3.0: uso privado; publicar FModel obligaría a revisar la licencia. |
| Bloques dinámicos de AutoCAD desde DXF o DWG: parámetros lineal, de punto, rotación, simetría, visibilidad y punto base con acciones desplazar, estirar, escalar, girar y simetría | Experimental | `OPEN` `IMPORTDXF` `LIBRARYIMPORT` | Formato no documentado: cada tipo se verifica comparando las instancias con la geometría que guarda AutoCAD, con muestras de un único origen (ACadSharp). Consulta, XY, polar, alineación y matrices dinámicas se importan como geometría estática y el informe lo explica. |
| Escritura DWG | No comprometido |  | LibreDWG no escribe DWG de forma fiable y no se simula: exporta DXF. |

## Referencias

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Dibujos referenciados (enlazar/superponer), recarga, descarga, apertura, unión, ruta, detección de ciclos | Disponible | `XATTACH` `XREFMANAGER` `XRELOAD` `XOPEN` `XBIND` `XREPATH` |  |
| Imágenes y calcos PDF con recorte, opacidad, atenuación y bloqueo | Disponible | `IMAGEATTACH` `PDFATTACH` `IMAGECLIP` `IMAGEADJUST` |  |
| Referencias a objetos sobre la geometría de calcos PDF | Disponible |  | Se extraen los trazos vectoriales de la página (no el texto ni las imágenes rasterizadas); las curvas se aproximan con tramos rectos. |

## Calidad

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Auditoría con corrección, informe de salud, limpieza de duplicados y elementos sin uso | Disponible | `AUDIT` `HEALTHREPORT` `OVERKILL` `PURGE` |  |
| Comparación de revisiones | Disponible | `COMPARE` |  |

## Productividad

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Paleta de comandos, alias y atajos configurables, repetir último, favoritos, propiedades rápidas, historial de comandos y ayuda contextual | Disponible | `OPTIONS` `HELP` `QUICKPROPERTIES` `TEXTSCR` |  |
| Autoguardado, recuperación tras cierre y versiones locales | Disponible | `VERSIONS` `RECOVER` |  |
| Español e inglés | Disponible | `OPTIONS` |  |
| Aplicación instalable con uso sin conexión (PWA) y apertura de .fmodel/.dxf desde el sistema | Experimental | `UPDATEAPP` | El service worker precarga toda la versión y está cubierto por pruebas; la instalación y la apertura de archivos dependen del navegador (Safari no abre archivos desde el sistema). |

## Rendimiento

| Función | Estado | Comandos | Notas |
|---|---|---|---|
| Índice espacial, renderizado por lotes con caché de trazados | Disponible |  |  |
| Lectura y exportación DXF y análisis de salud en segundo plano (Web Worker) | Disponible | `OPEN` `EXPORTDXF` `AUDIT` `HEALTHREPORT` | Si el navegador no permite workers se ejecutan en el hilo principal con el mismo resultado. |
