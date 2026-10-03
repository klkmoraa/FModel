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
| 14 familias de construcción, variantes y edición paramétrica | Núcleo y catálogo visual disponibles: comandos, geometría, edición, guardado nativo y advertencia DXF. [CI 37097760918](https://github.com/klkmoraa/FModel/actions/runs/37097760918): 1100 pruebas, 56 recorridos Chromium (seis nuevos) y [14 capturas revisadas](../brandbook/components-qa.md); ARC-003 cerrado en este alcance. [Diseño](../superpowers/specs/2026-10-02-construction-components-design.md). No implica paridad general con YQARCH ni implementación de huecos asociados ARC-004. |
| Huecos asociados y reparación de muro al mover/copiar/editar/reflejar/borrar | Especificado en [diseño](../superpowers/specs/2026-10-02-opening-lifecycle-design.md); aún no implementado. ARC-004. |
| Resto de resultados 2D | Seguir [diseño general](../superpowers/specs/2026-10-02-yqarch-native-design.md), con evidencia por módulo. |

MOVE/COPY/ERASE no sustituyen una operación que repara el muro; una biblioteca no equivale a un generador de escaleras; QDIM no prueba acotación arquitectónica automática; una tabla de atributos no completa los cuadros de materiales/huecos. La implementación y las pruebas determinan disponibilidad, nunca la presencia de un nombre.
