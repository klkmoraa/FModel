# Referencia YQARCH y cobertura de FModel

La matriz [cobertura.csv](cobertura.csv) registra identificadores, resultado requerido, comandos nativos existentes, límite pendiente y evidencia. Es una auditoría funcional estática de la base `ef7e1ac`; las funciones en implementación no se cuentan como disponibles. [baseline.json](baseline.json) conserva procedencia, versión y huella de la fuente.

## Fuente y alcance

Paquete público oficial [YQArch](http://www.yqarch.cn/yqarch.asp), [distribución](http://www.yqarch.cn/mydown/yqarch.rar): versión **6.7.4c (2023-07-24)** según sus notas internas; la portada anuncia 6.7.4. Se inspeccionaron sus catálogos/paneles documentales, sin ejecutar ni descompilar el plugin y sin incorporar su código o dibujos.

Los dos catálogos principales coinciden en **499 entradas**:477 operaciones y22 lanzadores. Hay 123 tokens suplementarios, una referencia de alias,20 acciones de herramientas externas y95 acciones de panel. En conjunto 738 registros documentales; no son 738 capacidades independientes. No se garantiza la enumeración de opciones internas o funciones sin documentación. El manual del autor 6.6.7 se utilizó sólo como explicación histórica, no como catálogo de la versión actual.

Los 126 casos inicialmente pendientes fueron clasificados leyendo solicitudes, selección, mutación y resultados de FModel. Esta clasificación no prueba igualdad de comportamiento con una ejecución real de YQARCH. `native_core` indica que el resultado básico existe; `partial` conserva la automatización/opciones que faltan.

## Estado de la base

| Clasificación | Registros |
|---|---:|
| `navigation` | 22 |
| `native_core` | 114 |
| `partial` | 162 |
| `host_integration` | 62 |
| `missing_specialized` | 355 |
| `portable_2d_gap_host_binding` | 13 |
| `out_of_scope_3d` | 7 |
| `policy_exception` | 3 |

Sólo 2D: las7 entradas explícitas 3D no forman parte de FModel. Las 62 integraciones de anfitrión se evalúan por su resultado útil, sin reproducir instalación/COM/LISP/Windows. Las 13 operaciones de datos ligadas a Office requieren tablas/CSV/portapapeles nativos. Las 3 excepciones de formato conservan las restricciones DWG/KML. Los alzados y secciones 2D sí están incluidos.

## Módulos del catálogo principal

| Módulo | Entradas |
|---|---:|
| `system_workflow` | 25 |
| `walls_openings` | 44 |
| `construction_components` | 53 |
| `architectural_annotations` | 45 |
| `statistics_data` | 27 |
| `text_productivity` | 32 |
| `dimensions` | 48 |
| `curve_processing` | 22 |
| `geometry_productivity` | 42 |
| `drawing_quality` | 18 |
| `blocks_attributes` | 36 |
| `hatch_linetype` | 22 |
| `layers_standards` | 30 |
| `viewports_sheets` | 38 |
| `property_matching` | 17 |

La suma es499incluyendo22 lanzadores. Un módulo puede reunir categorías de origen; la CSV conserva cada fila y su procedencia. Los presets y aliases no se contabilizan como implementaciones distintas.

## Entregas nativas

| Resultado | Estado / evidencia |
|---|---|
| Muros continuos, habitación rectangular, conversión de trazos y huecos con símbolo | Implementados. CI 37022156512:966 pruebas unitarias y50 recorridos de navegador pasan; el alcance original es no asociativo. ARC-002. |
| 14 familias de construcción, variantes y edición paramétrica | Núcleo y catálogo visual disponibles: comandos, geometría, edición, guardado nativo y advertencia DXF. [CI 37097760918](https://github.com/klkmoraa/FModel/actions/runs/37097760918): 1100 pruebas, 56 recorridos Chromium (seis nuevos) y [14 capturas revisadas](../brandbook/components-qa.md); ARC-003 cerrado en este alcance. [Diseño](../superpowers/specs/2026-10-02-construction-components-design.md). No implica paridad general con YQARCH; huecos asociados se acreditan por separado en ARC-004. |
| Huecos asociados y reparación de muro al mover/copiar/editar/reflejar/borrar | Disponible para muros rectos compatibles: comandos nativos, grupos, reparación de hueco anterior, espesor y undo/redo. [CI 37131723475](https://github.com/klkmoraa/FModel/actions/runs/37131723475): 1169 pruebas, 60 recorridos Chromium y [seis capturas originales aprobadas](../brandbook/openings-qa.md). ARC-004 cerrado en este alcance; redes T/X, recorte de columnas y huecos curvos/de esquina siguen pendientes. [Diseño](../superpowers/specs/2026-10-02-opening-lifecycle-design.md). |
| Eje físico y muro paralelo por distancia libre (referencias WWA/WWO) | Disponible para muros rectos compatibles: `WALLAXIS`/`EJEMURO` extrae eje completo; `WALLOFFSET`/`PARALELAMURO` crea un muro independiente vacío con separación real entre caras. Hasta 500/200 vértices; WWA/WWO no son alias registrados. [CI 37169139770](https://github.com/klkmoraa/FModel/actions/runs/37169139770): 1204 pruebas, 64 recorridos Chromium y [seis capturas originales aprobadas](../brandbook/wall-utilities-qa.md). ARC-005 cerrado sólo para estos dos resultados; redes T/X, columnas, líneas sueltas, curvas, huecos de esquina y rellenos permanecen pendientes. No se declara paridad del módulo. [Diseño](../superpowers/specs/2026-10-03-wall-utilities-design.md). |
| Relleno de material de muros y columnas nativas (referencia WWF) | Disponible; ARC-006 cerrado sólo para este resultado. `WALLFILL`/`RELLENARMUROS` crea HATCH independientes Sólido/Rayado por fragmentos actuales y contornos de columnas, con habitaciones/huecos vacíos, propiedades conservadas y undo/redo atómico. Sin asociación futura; WWF no es alias. [Guía y límites](../arquitectura-muros.md#rellenar-material-arc-006-disponible--fill-material-arc-006-available). [CI 37254420973](https://github.com/klkmoraa/FModel/actions/runs/37254420973): 1297 pruebas/124 archivos y 68 recorridos Chromium (cuatro nuevos), con [seis originales aprobados](../brandbook/wall-fill-qa.md). No se declara paridad del módulo ni se recalcula la base histórica. / Independent material snapshots available within this scope; actual CI and all six originals approved. General module parity and historical baseline totals are unchanged. |
| Limpieza explícita T/X y recorte contra columnas (referencia TW) | ARC-007 en curso: `WALLCLEAN`/`WALLRESTORE` implementados como instantáneas LINE reversibles con IDs/grupos/parametría conservados, Todos para salidas borradas/desagrupadas, guardas restaurar→editar→limpiar y acceso real ES/EN. [Guía](../wall-cleanup-guide.md); pendiente CI final y [revisión visual original](../brandbook/wall-cleanup-qa.md). Sin limpieza automática al dibujar/nuevos vecinos, curvas ni huecos de esquina; TW no es alias, sin paridad general ni recuento histórico nuevo. / Explicit reversible snapshots implemented; final CI/raw visual review pending. Automatic/network/curved/corner-hole behavior remains absent. |
| Resto de resultados 2D | Seguir [diseño general](../superpowers/specs/2026-10-02-yqarch-native-design.md), con evidencia por módulo. |

MOVE/COPY/ERASE no sustituyen una operación que repara el muro; una biblioteca no equivale a un generador de escaleras; QDIM no prueba acotación arquitectónica automática; una tabla de atributos no completa los cuadros de materiales/huecos. La implementación y las pruebas determinan disponibilidad, nunca la presencia de un nombre.
