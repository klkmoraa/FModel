# Estado de funciones de FModel 2D CAD

> Archivo generado con `node scripts/features-md.mjs` desde `src/app/features.ts`, la misma fuente que la pestaña «Estado de funciones» de la ayuda (F1). No lo edites a mano.

**Disponible**: 43 · **Experimental**: 4 · **Planeado**: 0 · **No comprometido**: 1

- **Disponible**: funciona de extremo a extremo y tiene pruebas con evidencia vinculada.
- **Experimental**: funciona con limitaciones documentadas y evidencia parcial.
- **Planeado**: no implementado todavía; no hay botones que lo simulen.
- **No comprometido**: fuera de alcance por motivos legales o técnicos.

## Lienzo

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Zoom, encuadre, extensión, zoom a selección y vistas guardadas | Disponible | `ZOOM` `PAN` `VIEW` | `BEH-MANAGEMENT` `E2E-CRITICAL-JOURNEYS` | La rueda del ratón hace zoom y dos dedos en el panel táctil encuadran: el dispositivo se deduce del propio evento y se puede fijar a mano en Opciones › Visualización. |
| Rejilla, coordenadas, cruz CAD y previsualización | Disponible | `GRIDTOGGLE` `DSETTINGS` | `BEH-MANAGEMENT` `RENDER-CANVAS` |  |
| Selección por ventana, captura, polígono, borde, tipo y capa; ciclo de selección | Disponible | `QSELECT` `SELECTSIMILAR` | `BEH-MANAGEMENT` `SPATIAL-INDEX` |  |
| Aislar, ocultar, bloquear y pantalla limpia; paneles acoplables | Disponible | `ISOLATEOBJECTS` `HIDEOBJECTS` `CLEANSCREENON` | `BEH-MANAGEMENT` |  |
| Uso táctil: encuadre, pellizco, pulsación larga, doble pulsación, lupa al situar puntos y barra táctil con Intro, Esc y opciones del comando | Experimental |  | `UI-TOUCH-MATRIX` | El dedo sitúa el punto con lupa y apertura ampliada; dos dedos encuadran y solo hacen zoom al separarse. Máquina de estados desacoplada en TouchGestureController con aislamiento estricto de pointercancel y rechazo de palma (3+ dedos). Probado con simulación y matriz de dispositivos en fix/features/evidence/; en teléfono el dibujo detallado sigue limitado por el tamaño de pantalla. |

## Precisión

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Coordenadas absolutas, relativas y polares; distancia directa; entrada dinámica | Disponible | `DYNTOGGLE` | `BEH-DRAW` `GEO-INVARIANTS` |  |
| Orto, rastreo polar, referencias a objetos permanentes y temporales, rastreo OTRACK, Tab entre candidatos | Disponible | `ORTHOTOGGLE` `POLARTOGGLE` `OSNAP` `OTRACKTOGGLE` | `BEH-DRAW` `GEO-CURVES` |  |

## Dibujo

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Línea, polilínea, círculo, arco, rectángulo, polígono, elipse, spline, punto, rayo, línea auxiliar, nube de revisión, arandela | Disponible | `LINE` `PLINE` `CIRCLE` `ARC` `RECTANG` `POLYGON` `ELLIPSE` `SPLINE` `POINT` `RAY` `XLINE` `REVCLOUD` `DONUT` | `BEH-DRAW` `E2E-CRITICAL-JOURNEYS` |  |
| Sombreado con islas, contorno, región, cobertura, multilínea, dividir y medir | Disponible | `HATCH` `BOUNDARY` `REGION` `WIPEOUT` `MLINE` `DIVIDE` `MEASURE` | `BEH-DRAW` `GEO-CURVES` |  |
| Texto, texto de párrafos, directriz múltiple y tabla | Disponible | `TEXT` `MTEXT` `MLEADER` `TABLE` | `BEH-ANNOTATE` |  |

## Modificar

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Borrar, desplazar, copiar, girar, escalar, simetría, desfase, recortar, alargar, empalme, chaflán, estirar | Disponible | `ERASE` `MOVE` `COPY` `ROTATE` `SCALE` `MIRROR` `OFFSET` `TRIM` `EXTEND` `FILLET` `CHAMFER` `STRETCH` | `BEH-MODIFY` `E2E-CRITICAL-JOURNEYS` |  |
| Matrices rectangular, polar y por trayectoria (asociativas) | Disponible | `ARRAYRECT` `ARRAYPOLAR` `ARRAYPATH` | `BEH-MODIFY` |  |
| Juntar, partir, partir en punto, descomponer, editar polilínea, longitud, alinear, invertir, orden de dibujo, grupos, operaciones booleanas | Disponible | `JOIN` `BREAK` `BREAKATPOINT` `EXPLODE` `PEDIT` `LENGTHEN` `ALIGN` `REVERSE` `DRAWORDER` `GROUP` `UNION` | `BEH-MODIFY` `GEO-INVARIANTS` |  |

## Capas y propiedades

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Administrador de capas: estados, filtros, aislar, fusionar, congelación por viewport; herencia PorCapa/PorBloque | Disponible | `LAYER` `LAYERSTATE` `LAYISO` `LAYMRG` `VPLAYER` | `BEH-MANAGEMENT` |  |
| Inspector de propiedades con edición por lotes e igualar propiedades | Disponible | `PROPERTIES` `MATCHPROP` | `BEH-MANAGEMENT` |  |

## Anotación

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Estilos de texto, cota, directriz múltiple, tabla y multilínea; lista de escalas | Disponible | `STYLE` `SCALELISTEDIT` | `BEH-ANNOTATE` |  |
| Cotas lineales, alineadas, angulares, radio, diámetro, arco, coordenada, continuas y de línea base; asociativas | Disponible | `DIMLINEAR` `DIMALIGNED` `DIMANGULAR` `DIMRADIUS` `DIMDIAMETER` `DIMARC` `DIMORDINATE` `DIMCONTINUE` `DIMBASELINE` | `BEH-ANNOTATE` |  |
| Campos, tolerancias, prefijos/sufijos, unidades alternativas y escala anotativa | Disponible | `FIELD` | `BEH-ANNOTATE` |  |

## Bloques

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Definiciones, inserción con autoescala, atributos y extracción | Disponible | `BLOCK` `INSERT` `ATTDEF` `ATTEDIT` `DATAEXTRACTION` | `BEH-LIBRARY` `IO-CLIPBOARD` |  |
| Biblioteca por categorías con etiquetas, importación desde DXF (bloques o dibujo entero) y bibliotecas compartibles .fmodellib | Disponible | `LIBRARYIMPORT` `LIBRARYEXPORT` `WBLOCK` | `BEH-LIBRARY` |  |
| Hacer estirable cualquier bloque: Ancho y Fondo para alargarlo, acortarlo, ensancharlo o estrecharlo sin deformar lo que no cruza el corte | Disponible | `BESTIRABLE` | `BEH-LIBRARY` |  |
| Biblioteca inicial: 100 bloques de LibreCAD (GPL-2.0) y 12 muebles paramétricos (clósets que añaden hojas, mesa que añade sillas, cama con anchos estándar…) | Disponible | `LIBRARYSTARTER` | `BEH-LIBRARY` |  |
| Biblioteca integrada: 398 bloques CAD 2D en formato nativo de FModel, con unidades y miniaturas | Disponible |  | `BEH-LIBRARY` |  |
| Bloques dinámicos: parámetros, acciones, estados de visibilidad, tablas de consulta, fórmulas y variables | Disponible | `BEDIT` `BPARAMETER` `BACTION` `BVSTATE` `BVARIABLE` | `BEH-LIBRARY` `IO-DXF` |  |
| Editor de bloques con prueba, edición en contexto, validación y vista previa en vivo | Disponible | `BEDIT` `BTESTBLOCK` `BCLOSE` | `BEH-LIBRARY` |  |
| Restricciones geométricas y dimensionales dentro de bloques, con glifos, cotas de restricción y conflictos en el lienzo | Disponible | `BCONSTRAINT` `BCPARAMETER` | `SOLVER-CONSTRAINTS` | Resolvedor numérico por mínimos cuadrados amortiguados: las restricciones incompatibles se marcan en conflicto en lugar de ignorarse. |

## Paletas

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Paletas de herramientas con categorías, favoritos, búsqueda y arrastrar y soltar | Disponible | `TOOLPALETTES` | `BEH-LIBRARY` |  |

## Presentaciones

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Presentaciones, viewports rectangulares, poligonales y de objeto, escala bloqueada, capas por viewport | Disponible | `LAYOUT` `MVIEW` `MSPACE` `PSPACE` `VPSCALE` `VPLOCK` | `E2E-CRITICAL-JOURNEYS` `RENDER-CANVAS` |  |
| Configuración de página, cajetín con campos | Disponible | `PAGESETUP` `TITLEBLOCK` | `E2E-CRITICAL-JOURNEYS` |  |

## Salida

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| PDF vectorial por hoja y publicación multipágina; monocromo y escala de grises; grosores | Disponible | `PLOT` `EXPORTPDF` `PUBLISH` | `RENDER-CANVAS` `E2E-CRITICAL-JOURNEYS` |  |
| SVG en milímetros | Disponible | `EXPORTSVG` | `RENDER-CANVAS` |  |

## Intercambio

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Formato nativo versionado .fmodel y JSON de depuración | Disponible | `QSAVE` `SAVEAS` `OPEN` `EXPORTJSON` | `IO-NATIVE` `E2E-CRITICAL-JOURNEYS` |  |
| Importación y exportación DXF con informe de conversión | Disponible | `IMPORTDXF` `EXPORTDXF` | `IO-DXF` `E2E-CRITICAL-JOURNEYS` | Detalle en docs/dxf-compatibilidad.md. Los bloques dinámicos de FModel sobreviven a la ida y vuelta. |
| CSV/JSON de atributos y tablas | Disponible | `DATAEXTRACTION` | `BEH-MANAGEMENT` |  |
| Lectura experimental de DWG (abrir e importar a la biblioteca) | Experimental | `OPEN` `LIBRARYIMPORT` | `DWG-EXPERIMENTAL` | Probada con DWG de AutoCAD 2000 y 2018 frente a su DXF equivalente. El lector local se carga solo al abrir el primer archivo. |
| Bloques dinámicos de AutoCAD desde DXF o DWG: parámetros lineal, de punto, rotación, simetría, visibilidad y punto base con acciones desplazar, estirar, escalar, girar y simetría | Experimental | `OPEN` `IMPORTDXF` `LIBRARYIMPORT` | `IO-DXF` | Formato no documentado: cada tipo se verifica comparando las instancias con la geometría que guarda AutoCAD, con muestras de un único origen (ACadSharp). Consulta, XY, polar, alineación y matrices dinámicas se importan como geometría estática y el informe lo explica. |
| Escritura DWG | No comprometido |  | — | FModel no escribe DWG: exporta DXF. |

## Referencias

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Dibujos referenciados (enlazar/superponer), recarga, descarga, apertura, unión, ruta, detección de ciclos | Disponible | `XATTACH` `XREFMANAGER` `XRELOAD` `XOPEN` `XBIND` `XREPATH` | `BEH-REFERENCES` |  |
| Imágenes y calcos PDF con recorte, opacidad, atenuación y bloqueo | Disponible | `IMAGEATTACH` `PDFATTACH` `IMAGECLIP` `IMAGEADJUST` | `BEH-REFERENCES` `E2E-CRITICAL-JOURNEYS` |  |
| Referencias a objetos sobre la geometría de calcos PDF | Disponible |  | `BEH-REFERENCES` | Se extraen los trazos vectoriales de la página (no el texto ni las imágenes rasterizadas); las curvas se aproximan con tramos rectos. |

## Calidad

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Auditoría con corrección, informe de salud, limpieza de duplicados y elementos sin uso | Disponible | `AUDIT` `HEALTHREPORT` `OVERKILL` `PURGE` | `BEH-MANAGEMENT` `WORKER-ASYNC` |  |
| Comparación de revisiones | Disponible | `COMPARE` | `BEH-MANAGEMENT` |  |

## Productividad

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Paleta de comandos, alias y atajos configurables, repetir último, favoritos, propiedades rápidas, historial de comandos y ayuda contextual | Disponible | `OPTIONS` `HELP` `QUICKPROPERTIES` `TEXTSCR` | `E2E-CRITICAL-JOURNEYS` `UI-A11Y` |  |
| Autoguardado, recuperación tras cierre y versiones locales | Disponible | `VERSIONS` `RECOVER` | `STORAGE-PERSISTENCE` `E2E-CRITICAL-JOURNEYS` |  |
| Español e inglés | Disponible | `OPTIONS` | `UI-A11Y` |  |
| Aplicación instalable con uso sin conexión (PWA) y apertura de .fmodel/.dxf desde el sistema | Experimental | `UPDATEAPP` | `PWA-SW` `E2E-CRITICAL-JOURNEYS` | El service worker precarga toda la versión y está cubierto por pruebas; la instalación y la apertura de archivos dependen del navegador (Safari no abre archivos desde el sistema). |

## Rendimiento

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Índice espacial, renderizado por lotes con caché de trazados | Disponible |  | `SPATIAL-INDEX` `RENDER-CANVAS` |  |
| Lectura y exportación DXF y análisis de salud en segundo plano (Web Worker) | Disponible | `OPEN` `EXPORTDXF` `AUDIT` `HEALTHREPORT` | `WORKER-ASYNC` | Si el navegador no permite workers se ejecutan en el hilo principal con el mismo resultado. |
