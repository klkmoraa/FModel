# Estado de funciones de FModel 2D CAD

> Archivo generado con `node scripts/features-md.mjs` desde `src/app/features.ts`, la misma fuente que la pestaña «Estado de funciones» de la ayuda (F1). No lo edites a mano.

**Disponible**: 3 · **Experimental**: 44 · **Planeado**: 0 · **No comprometido**: 1

- **Disponible**: funciona de extremo a extremo y tiene pruebas con evidencia vinculada.
- **Experimental**: funciona con limitaciones documentadas y evidencia parcial.
- **Planeado**: no implementado todavía; no hay botones que lo simulen.
- **No comprometido**: fuera de alcance por motivos legales o técnicos.

## Lienzo

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Zoom, encuadre, extensión, zoom a selección y vistas guardadas | Experimental | `ZOOM` `PAN` `VIEW` | `BEH-MANAGEMENT` `E2E-CRITICAL-JOURNEYS` | La rueda del ratón hace zoom y dos dedos en el panel táctil encuadran: el dispositivo se deduce del propio evento y se puede fijar a mano en Opciones › Visualización. |
| Rejilla, coordenadas, cruz CAD y previsualización | Experimental | `GRIDTOGGLE` `DSETTINGS` | `BEH-MANAGEMENT` `RENDER-CANVAS` | Evidencia ejecutada pendiente para: GRIDTOGGLE, DSETTINGS. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Selección por ventana, captura, polígono, borde, tipo y capa; ciclo de selección | Experimental | `QSELECT` `SELECTSIMILAR` | `BEH-MANAGEMENT` `SPATIAL-INDEX` | Evidencia ejecutada pendiente para: QSELECT, SELECTSIMILAR. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Aislar, ocultar, bloquear y pantalla limpia; paneles acoplables | Experimental | `ISOLATEOBJECTS` `HIDEOBJECTS` `CLEANSCREENON` | `BEH-MANAGEMENT` | Evidencia ejecutada pendiente para: ISOLATEOBJECTS, HIDEOBJECTS, CLEANSCREENON. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Uso táctil: encuadre, pellizco, pulsación larga, doble pulsación, lupa al situar puntos y barra táctil con Intro, Esc y opciones del comando | Experimental |  | `UI-TOUCH-MATRIX` | El dedo sitúa el punto con lupa y apertura ampliada; dos dedos encuadran y solo hacen zoom al separarse. Máquina de estados desacoplada en TouchGestureController con aislamiento estricto de pointercancel y rechazo de palma (3+ dedos). Probado con simulación y matriz de dispositivos en fix/features/evidence/; en teléfono el dibujo detallado sigue limitado por el tamaño de pantalla. |

## Precisión

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Coordenadas absolutas, relativas y polares; distancia directa; entrada dinámica | Experimental | `DYNTOGGLE` | `BEH-DRAW` `GEO-INVARIANTS` | Evidencia ejecutada pendiente para: DYNTOGGLE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Orto, rastreo polar, referencias a objetos permanentes y temporales, rastreo OTRACK, Tab entre candidatos | Experimental | `ORTHOTOGGLE` `POLARTOGGLE` `OSNAP` `OTRACKTOGGLE` | `BEH-DRAW` `GEO-CURVES` | Evidencia ejecutada pendiente para: ORTHOTOGGLE, POLARTOGGLE, OSNAP, OTRACKTOGGLE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Dibujo

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Línea, polilínea, círculo, arco, rectángulo, polígono, elipse, spline, punto, rayo, línea auxiliar, nube de revisión, arandela | Experimental | `LINE` `PLINE` `CIRCLE` `ARC` `RECTANG` `POLYGON` `ELLIPSE` `SPLINE` `POINT` `RAY` `XLINE` `REVCLOUD` `DONUT` | `BEH-DRAW` `E2E-CRITICAL-JOURNEYS` | Evidencia ejecutada pendiente para: SPLINE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Sombreado con islas, contorno, región, cobertura, multilínea, dividir y medir | Experimental | `HATCH` `BOUNDARY` `REGION` `WIPEOUT` `MLINE` `DIVIDE` `MEASURE` | `BEH-DRAW` `GEO-CURVES` | Evidencia ejecutada pendiente para: HATCH, BOUNDARY, WIPEOUT, MLINE, DIVIDE, MEASURE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Texto, texto de párrafos, directriz múltiple y tabla | Experimental | `TEXT` `MTEXT` `MLEADER` `TABLE` | `BEH-ANNOTATE` | Evidencia ejecutada pendiente para: TABLE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Modificar

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Borrar, desplazar, copiar, girar, escalar, simetría, desfase, recortar, alargar, empalme, chaflán, estirar | Experimental | `ERASE` `MOVE` `COPY` `ROTATE` `SCALE` `MIRROR` `OFFSET` `TRIM` `EXTEND` `FILLET` `CHAMFER` `STRETCH` | `BEH-MODIFY` `E2E-CRITICAL-JOURNEYS` | Evidencia ejecutada pendiente para: OFFSET, TRIM, EXTEND, CHAMFER, STRETCH. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Matrices rectangular, polar y por trayectoria (asociativas) | Experimental | `ARRAYRECT` `ARRAYPOLAR` `ARRAYPATH` | `BEH-MODIFY` | Evidencia ejecutada pendiente para: ARRAYRECT, ARRAYPOLAR, ARRAYPATH. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Juntar, partir, partir en punto, descomponer, editar polilínea, longitud, alinear, invertir, orden de dibujo, grupos, operaciones booleanas | Experimental | `JOIN` `BREAK` `BREAKATPOINT` `EXPLODE` `PEDIT` `LENGTHEN` `ALIGN` `REVERSE` `DRAWORDER` `GROUP` `UNION` | `BEH-MODIFY` `GEO-INVARIANTS` | Evidencia ejecutada pendiente para: JOIN, BREAK, BREAKATPOINT, PEDIT, LENGTHEN, ALIGN, REVERSE, DRAWORDER, GROUP, UNION. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Capas y propiedades

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Administrador de capas: estados, filtros, aislar, fusionar, congelación por viewport; herencia PorCapa/PorBloque | Experimental | `LAYER` `LAYERSTATE` `LAYISO` `LAYMRG` `VPLAYER` | `BEH-MANAGEMENT` | Evidencia ejecutada pendiente para: LAYER, LAYERSTATE, LAYISO, LAYMRG, VPLAYER. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Inspector de propiedades con edición por lotes e igualar propiedades | Experimental | `PROPERTIES` `MATCHPROP` | `BEH-MANAGEMENT` | Evidencia ejecutada pendiente para: PROPERTIES, MATCHPROP. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Anotación

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Estilos de texto, cota, directriz múltiple, tabla y multilínea; lista de escalas | Experimental | `STYLE` `SCALELISTEDIT` | `BEH-ANNOTATE` | Evidencia ejecutada pendiente para: STYLE, SCALELISTEDIT. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Cotas lineales, alineadas, angulares, radio, diámetro, arco, coordenada, continuas y de línea base; asociativas | Experimental | `DIMLINEAR` `DIMALIGNED` `DIMANGULAR` `DIMRADIUS` `DIMDIAMETER` `DIMARC` `DIMORDINATE` `DIMCONTINUE` `DIMBASELINE` | `BEH-ANNOTATE` | Evidencia ejecutada pendiente para: DIMANGULAR, DIMRADIUS, DIMDIAMETER, DIMARC, DIMORDINATE, DIMCONTINUE, DIMBASELINE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Campos, tolerancias, prefijos/sufijos, unidades alternativas y escala anotativa | Experimental | `FIELD` | `BEH-ANNOTATE` | Evidencia ejecutada pendiente para: FIELD. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Bloques

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Definiciones, inserción con autoescala, atributos y extracción | Experimental | `BLOCK` `INSERT` `ATTDEF` `ATTEDIT` `DATAEXTRACTION` | `BEH-LIBRARY` `IO-CLIPBOARD` | Evidencia ejecutada pendiente para: BLOCK, INSERT, ATTDEF, ATTEDIT, DATAEXTRACTION. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Biblioteca por categorías con etiquetas, importación desde DXF (bloques o dibujo entero) y bibliotecas compartibles .fmodellib | Experimental | `LIBRARYIMPORT` `LIBRARYEXPORT` `WBLOCK` | `BEH-LIBRARY` | Evidencia ejecutada pendiente para: LIBRARYIMPORT, LIBRARYEXPORT, WBLOCK. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Hacer estirable cualquier bloque: Ancho y Fondo para alargarlo, acortarlo, ensancharlo o estrecharlo sin deformar lo que no cruza el corte | Experimental | `BESTIRABLE` | `BEH-LIBRARY` | Evidencia ejecutada pendiente para: BESTIRABLE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Biblioteca inicial: 100 bloques de LibreCAD (GPL-2.0) y 12 muebles paramétricos (clósets que añaden hojas, mesa que añade sillas, cama con anchos estándar…) | Experimental | `LIBRARYSTARTER` | `BEH-LIBRARY` | Evidencia ejecutada pendiente para: LIBRARYSTARTER. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Biblioteca integrada: 398 bloques CAD 2D en formato nativo de FModel, con unidades y miniaturas | Disponible |  | `BEH-LIBRARY` |  |
| Bloques dinámicos: parámetros, acciones, estados de visibilidad, tablas de consulta, fórmulas y variables | Experimental | `BEDIT` `BPARAMETER` `BACTION` `BVSTATE` `BVARIABLE` | `BEH-LIBRARY` `IO-DXF` | Evidencia ejecutada pendiente para: BEDIT, BPARAMETER, BACTION, BVSTATE, BVARIABLE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Editor de bloques con prueba, edición en contexto, validación y vista previa en vivo | Experimental | `BEDIT` `BTESTBLOCK` `BCLOSE` | `BEH-LIBRARY` | Evidencia ejecutada pendiente para: BEDIT, BTESTBLOCK, BCLOSE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Restricciones geométricas y dimensionales dentro de bloques, con glifos, cotas de restricción y conflictos en el lienzo | Experimental | `BCONSTRAINT` `BCPARAMETER` | `SOLVER-CONSTRAINTS` | Resolvedor numérico por mínimos cuadrados amortiguados: las restricciones incompatibles se marcan en conflicto en lugar de ignorarse. |

## Paletas

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Paletas de herramientas con categorías, favoritos, búsqueda y arrastrar y soltar | Experimental | `TOOLPALETTES` | `BEH-LIBRARY` | Evidencia ejecutada pendiente para: TOOLPALETTES. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Presentaciones

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Presentaciones, viewports rectangulares, poligonales y de objeto, escala bloqueada, capas por viewport | Experimental | `LAYOUT` `MVIEW` `MSPACE` `PSPACE` `VPSCALE` `VPLOCK` | `E2E-CRITICAL-JOURNEYS` `RENDER-CANVAS` | Evidencia ejecutada pendiente para: LAYOUT, MVIEW, MSPACE, PSPACE, VPSCALE, VPLOCK. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Configuración de página, cajetín con campos | Experimental | `PAGESETUP` `TITLEBLOCK` | `E2E-CRITICAL-JOURNEYS` | Evidencia ejecutada pendiente para: PAGESETUP, TITLEBLOCK. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Salida

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| PDF vectorial por hoja y publicación multipágina; monocromo y escala de grises; grosores | Experimental | `PLOT` `EXPORTPDF` `PUBLISH` | `RENDER-CANVAS` `E2E-CRITICAL-JOURNEYS` | Evidencia ejecutada pendiente para: PLOT, EXPORTPDF, PUBLISH. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| SVG en milímetros | Experimental | `EXPORTSVG` | `RENDER-CANVAS` | Evidencia ejecutada pendiente para: EXPORTSVG. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Intercambio

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Formato nativo versionado .fmodel y JSON de depuración | Experimental | `QSAVE` `SAVEAS` `OPEN` `EXPORTJSON` | `IO-NATIVE` `E2E-CRITICAL-JOURNEYS` | Evidencia ejecutada pendiente para: QSAVE, SAVEAS, OPEN, EXPORTJSON. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Importación y exportación DXF con informe de conversión | Experimental | `IMPORTDXF` `EXPORTDXF` | `IO-DXF` `E2E-CRITICAL-JOURNEYS` | Detalle en docs/dxf-compatibilidad.md. Los bloques dinámicos de FModel sobreviven a la ida y vuelta. |
| CSV/JSON de atributos y tablas | Experimental | `DATAEXTRACTION` | `BEH-MANAGEMENT` | Evidencia ejecutada pendiente para: DATAEXTRACTION. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Lectura experimental de DWG (abrir e importar a la biblioteca) | Experimental | `OPEN` `LIBRARYIMPORT` | `DWG-EXPERIMENTAL` | Probada con DWG de AutoCAD 2000 y 2018 frente a su DXF equivalente. El lector local se carga solo al abrir el primer archivo. |
| Bloques dinámicos de AutoCAD desde DXF o DWG: parámetros lineal, de punto, rotación, simetría, visibilidad y punto base con acciones desplazar, estirar, escalar, girar y simetría | Experimental | `OPEN` `IMPORTDXF` `LIBRARYIMPORT` | `IO-DXF` | Formato no documentado: cada tipo se verifica comparando las instancias con la geometría que guarda AutoCAD, con muestras de un único origen (ACadSharp). Consulta, XY, polar, alineación y matrices dinámicas se importan como geometría estática y el informe lo explica. |
| Escritura DWG | No comprometido |  | — | FModel no escribe DWG: exporta DXF. |

## Referencias

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Dibujos referenciados (enlazar/superponer), recarga, descarga, apertura, unión, ruta, detección de ciclos | Experimental | `XATTACH` `XREFMANAGER` `XRELOAD` `XOPEN` `XBIND` `XREPATH` | `BEH-REFERENCES` | Evidencia ejecutada pendiente para: XATTACH, XREFMANAGER, XRELOAD, XOPEN, XBIND, XREPATH. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Imágenes y calcos PDF con recorte, opacidad, atenuación y bloqueo | Experimental | `IMAGEATTACH` `PDFATTACH` `IMAGECLIP` `IMAGEADJUST` | `BEH-REFERENCES` `E2E-CRITICAL-JOURNEYS` | Evidencia ejecutada pendiente para: IMAGEATTACH, PDFATTACH, IMAGECLIP, IMAGEADJUST. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Referencias a objetos sobre la geometría de calcos PDF | Disponible |  | `BEH-REFERENCES` | Se extraen los trazos vectoriales de la página (no el texto ni las imágenes rasterizadas); las curvas se aproximan con tramos rectos. |

## Calidad

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Auditoría con corrección, informe de salud, limpieza de duplicados y elementos sin uso | Experimental | `AUDIT` `HEALTHREPORT` `OVERKILL` `PURGE` | `BEH-MANAGEMENT` `WORKER-ASYNC` | Evidencia ejecutada pendiente para: HEALTHREPORT, OVERKILL, PURGE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Comparación de revisiones | Experimental | `COMPARE` | `BEH-MANAGEMENT` | Evidencia ejecutada pendiente para: COMPARE. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |

## Productividad

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Paleta de comandos, alias y atajos configurables, repetir último, favoritos, propiedades rápidas, historial de comandos y ayuda contextual | Experimental | `OPTIONS` `HELP` `QUICKPROPERTIES` `TEXTSCR` | `E2E-CRITICAL-JOURNEYS` `UI-A11Y` | Evidencia ejecutada pendiente para: OPTIONS, HELP, QUICKPROPERTIES, TEXTSCR. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Autoguardado, recuperación tras cierre y versiones locales | Experimental | `VERSIONS` `RECOVER` | `STORAGE-PERSISTENCE` `E2E-CRITICAL-JOURNEYS` | Evidencia ejecutada pendiente para: VERSIONS, RECOVER. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Español e inglés | Experimental | `OPTIONS` | `UI-A11Y` | Evidencia ejecutada pendiente para: OPTIONS. La función no se publica como Disponible hasta enlazar cada comando a una prueba real. |
| Aplicación instalable con uso sin conexión (PWA) y apertura de .fmodel/.dxf desde el sistema | Experimental | `UPDATEAPP` | `PWA-SW` `E2E-CRITICAL-JOURNEYS` | El service worker precarga toda la versión y está cubierto por pruebas; la instalación y la apertura de archivos dependen del navegador (Safari no abre archivos desde el sistema). |

## Rendimiento

| Función | Estado | Comandos | Evidencia | Notas |
|---|---|---|---|---|
| Índice espacial, renderizado por lotes con caché de trazados | Disponible |  | `SPATIAL-INDEX` `RENDER-CANVAS` |  |
| Lectura y exportación DXF y análisis de salud en segundo plano (Web Worker) | Experimental | `OPEN` `EXPORTDXF` `AUDIT` `HEALTHREPORT` | `WORKER-ASYNC` | Si el navegador no permite workers se ejecutan en el hilo principal con el mismo resultado. |
