# CADCraft → FModel: comparación recuperada y primer avance

Fecha: 2026-10-20. Continuación por Sol 6.1 con razonamiento xhigh del análisis que dejó Claude. Referencia leída, sin ejecutar código o scripts de terceros: [`storytold/cadcraft`, commit `e86eacf094fefda1cdb6ba5137a336f29deb5d99`](https://github.com/storytold/cadcraft/tree/e86eacf094fefda1cdb6ba5137a336f29deb5d99). La revisión compara comportamientos concretos, sin adoptar porcentajes de paridad publicados por el proyecto.

## Qué se recuperó

El workflow `cadcraft-vs-fmodel-gap-analysis` terminó 15 mapas: 7 lectores de CADCraft y 8 de FModel. Sus 4 proponentes y 3 jueces fallaron; no dejaron propuestas puntuadas ni un ranking aprobado. Se reutilizaron los mapas terminados, sin relanzar sus lecturas. La priorización de abajo es una decisión nueva de esta continuación, contrastada en el código de las candidatas principales.

| Mapa | CADCraft | FModel |
|---|---:|---:|
| Línea de comandos y entrada | 46 | 56 |
| Precisión y selección | 58 | 58 |
| Dibujo y modificación | 60 | 67 |
| Anotación, bloques y capas | 62 | 61 |
| Mesa e interfaz | 46 | 51 |
| Presentaciones, archivos y robustez | 57 | 51 |
| Automatización e idiomas | 38 | — |
| Producción arquitectónica | — | 58 |
| Convenciones de implementación | — | 22 |
| Total de observaciones de los mapas | 367 | 424 |

Son 791 observaciones con estados presentes/parciales/ausentes, con solapamientos; no son 791 funciones implementadas ni una prueba de paridad. El respaldo local íntegro de los mapas recuperados está en `/tmp/fmodel-cadcraft-maps-20261020.json` y la evidencia de esta entrega en `/tmp/fmodel-ui012-20261020/`.

## Qué conviene conservar

FModel ya tiene coordenadas absolutas/relativas/polares, distancia directa, opciones de prompt pulsables, búsqueda y alias bilingües, modos de precisión compartidos entre PC y teléfono, transacciones e historial y producción arquitectónica propia. Los cambios existentes de muros, huecos, bloques con medidas y reconocimiento de habitaciones estaban antes de esta continuación; esta entrega no se los atribuye.

La mesa de CADCraft muestra líneas recientes encima del campo y un historial ampliado por F2 ([implementación](https://github.com/storytold/cadcraft/blob/e86eacf094fefda1cdb6ba5137a336f29deb5d99/crates/ui-egui/src/cmdline.rs#L393), [historial expandido](https://github.com/storytold/cadcraft/blob/e86eacf094fefda1cdb6ba5137a336f29deb5d99/crates/ui-egui/src/cmdline.rs#L623)). Esa visibilidad permite entender un rechazo sin buscar una ventana oculta. FModel guardaba los errores en el runner, pero sólo los pintaba al desplegar el log; el CSS del teléfono ocultaba además todo ese log.

Se tomó el principio de feedback visible. FModel conserva su campo HTML con caret, selección y pegado, su marca y su interfaz móvil. No se copió código de CADCraft ni se añadió un backend, red, 3D o superficie DWG.

## Priorización ejecutada tras la autorización «hazlo»

La continuación local completó las seis áreas propuestas, conservando UI-012 y todos los cambios previos. Para publicación se preparó una candidata aislada desde HEAD: [separación y QA](../brandbook/publication-integration-qa.md). La referencia externa se leyó en el clone local del SHA indicado arriba, sin ejecutar su código. El modelo de marcos de FROM/M2P se contrastó con [pointmod.rs](https://github.com/storytold/cadcraft/blob/e86eacf094fefda1cdb6ba5137a336f29deb5d99/crates/engine/src/pointmod.rs).

| Área | Resultado local verificable |
|---|---|
| TST-003 · Preview | Fix idle/worker conservado localmente. HEAD no contiene room-recognition; su prueba original de preview pasa sin incorporar ese subsistema. |
| UI-013 · Referencias | Menú PC/teléfono, Mayús+clic derecho y referencias temporales del comando. MID/GCE de paleta, keywords, transparentes y adquisición EXT/PAR cubiertos. |
| CMD-003 · FROM/M2P/MTP | Marcos anidados hasta 8; Escape restaura el paso, puntos intermedios no cambian lastPoint, coordenadas finitas y viewport girado/escalado. Cargar otro dibujo, incluso mismo ID, invalida solicitudes y bloqueos. |
| CMD-002 · MATCHPROP | Diez filtros existentes, Todas/Ninguna, cancelación que conserva origen y destinos editables del propietario actual. |
| UI-014 · UNITS | Formulario con muestras y validación 0–8; sesión documento/versión, undo, geometría intacta y -UNITS/headless conservados. |
| UI-015 · Doble clic | Editores nativos antes de genéricos, anotación/polilínea/bloque y hatch editable en inspector. Viewports y comandos activos respetados; arbitraje con grips y doble toque. |

Los overrides se consumen al aceptar una respuesta geométrica finita del InputRequest; keywords/none y rechazos de parser conservan la referencia. No se infiere si cada comando después rechaza semánticamente un segmento. No existe SCU configurable en FModel: se conservan #/* y transformadas reales de propietario/viewport. No se añadió red, backend, 3D ni alcance DWG.

[QA, originales y evidencias de las seis áreas](../brandbook/six-cad-improvements-qa.md). Las fichas del backlog y el catálogo de funciones separan implementación local de acreditación física: UI-002 sigue abierta.

## Resultado concreto

UI-012 muestra el último error/aviso sin abrir teclado ni historial. Un rechazo nuevo reemplaza el anterior y se anuncia; información ordinaria o comandos transparentes no lo borran. Se retira al descartar, responder correctamente al comando emisor o iniciar otro comando normal. La atribución sigue al emisor incluso cuando publica un aviso asíncrono debajo de ZOOM. F2 y los botones comparten un historial modal con las últimas 500 entradas, Escape, foco atrapado y retorno al origen.

[QA, capturas y límites](../brandbook/command-feedback-qa.md). Revisión fresca de código de Sol 6.1 xhigh: dos hallazgos corregidos y re-revisión sin pendientes. No hay commit, push ni publicación de esta entrega. La validación completa posterior se registra en la ficha de las seis áreas.
