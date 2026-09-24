# Integridad de datos, archivos e intercambio

## DAT-001 — Distinguir guardado, descarga y cancelación

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-18 · **Cierre:** 2026-09-18
- **Prioridad:** P1 — riesgo de pérdida de trabajo
- **Depende de:** —
- **Bloquea:** DAT-004, TST-001

**Evidencia:** `src/storage/fileAccess.ts` devuelve un resultado discriminado (`saved-to-handle`, `download-started` o `cancelled`); los comandos de archivo conservan el estado sucio y no anuncian éxito cuando se cancela.

**Archivos previstos:**

- Modificar: `src/storage/fileAccess.ts`
- Modificar: `src/commands/file.ts`, `src/commands/output.ts`, `src/commands/library.ts`
- Crear: `src/storage/fileAccess.test.ts`
- Modificar: pruebas de comandos/archivos necesarias para cubrir QSAVE y SAVEAS

**Implementación:**

- [x] Definir un resultado discriminado: `saved-to-handle`, `download-started` o `cancelled`.
- [x] Hacer que todos los consumidores traten `cancelled` como salida sin efectos ni mensaje de éxito.
- [x] Limpiar `doc.dirty`, crear versión local y marcar salida limpia solo después de `saved-to-handle` o `download-started`.
- [x] Conservar el handle anterior si Guardar como se cancela.
- [x] Probar selector aceptado, selector cancelado, escritura sobre handle existente y fallback de descarga.

**Criterios de aceptación:**

- [x] Cancelar QSAVE/SAVEAS mantiene `doc.dirty === true`.
- [x] Cancelar no crea una versión “Guardado manual” ni muestra “Guardado”.
- [x] Safari/Firefox siguen contabilizando el fallback de descarga como éxito.
- [x] Fallar al escribir propaga un error visible y conserva el estado sucio.

**Cierre:** 2026-09-18 · commit/PR `9bba64f`

**Verificación:** `pnpm vitest run src/storage/fileAccess.test.ts src/commands/file.test.ts src/io/native.test.ts src/blocks/libraryArchive.test.ts` (33 pruebas focalizadas) y `pnpm lint && pnpm verify` (49 archivos, 377 pruebas, build correcto; lint sin errores, con avisos preexistentes).

---

## DAT-002 — Hacer portable el portapapeles entre dibujos

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-18 · **Cierre:** 2026-09-18
- **Reapertura:** 2026-09-18 · **Responsable:** Codex · **Cierre de seguimiento:** 2026-09-18
- **Prioridad:** P1 — referencias rotas y pérdida semántica
- **Depende de:** DAT-003
- **Bloquea:** TST-001

**Evidencia:** `src/io/clipboard.ts` implementa `ClipboardPackage` v2 con cierre transitivo de bloques anidados, capas, tipos de línea, estilos de texto/cota/directriz/tabla/multilínea y recursos binarios (`AssetRecord` con `dataUrl`); `pasteClipboardPackage` remapea identificadores, reutiliza definiciones idénticas evitando duplicados al pegar varias veces, resuelve colisiones de nombres y limpia referencias huérfanas en cotas y sombreados; `src/commands/modify.ts` selecciona los objetos insertados y emite avisos si hay incidencias.

**Archivos previstos:**

- Crear: `src/io/clipboard.ts`
- Crear: `src/io/clipboard.test.ts`
- Modificar: `src/commands/modify.ts`
- Reutilizar/extraer: lógica de dependencias de `src/blocks/library.ts` y `src/xref/xref.ts`

**Interfaz a producir:** `ClipboardPackage` versionado con entidades, bloques transitivos, estilos, linetypes y assets necesarios; `pasteClipboardPackage(doc, package, owner, point)` devuelve IDs insertados y advertencias.

**Implementación:**

- [x] Escribir pruebas fallidas para bloque anidado, imagen, texto con estilo propio, cota y matriz asociativa entre dos documentos.
- [x] Construir el cierre transitivo de dependencias sin incluir registros no usados.
- [x] Remapear IDs con funciones tipadas y resolver colisiones por nombre/contenido.
- [x] Mantener compatibilidad de lectura con el formato actual `fmodel-clip` o emitir un mensaje claro.
- [x] Seleccionar los objetos recién pegados y presentar advertencias de conversiones.

**Criterios de aceptación:**

- [x] Ninguna entidad pegada conserva referencias a registros inexistentes.
- [x] Pegar dos veces no duplica estilos/definiciones equivalentes de forma innecesaria.
- [x] Los recursos binarios requeridos viajan con el paquete.
- [x] Entradas alteradas o incompletas se rechazan sin cambiar el dibujo.

**Cierre:** 2026-09-18

**Verificación:** `pnpm vitest run src/io/clipboard.test.ts` (11 pruebas focalizadas, incluyendo resolución de colisiones geométricas disímiles, remapeo de entidades dinámicas y rechazo de no finitos) y `pnpm lint && pnpm verify` (50 archivos, 391 pruebas, capas correctas, typecheck estricto y build limpio sin avisos).

**Seguimiento 2026-09-18:** commit `96321a3`. La equivalencia compara las referencias asociativas después del mapeo biyectivo de entidades y respeta `propertyOrder`. Tres regresiones fallaron antes del cambio y luego pasaron; `pnpm vitest run src/io/clipboard.test.ts` cerró con 23 pruebas y `pnpm lint && pnpm verify` con 50 archivos/404 pruebas, capas, documentación, tipos y build correctos (avisos de lint preexistentes).

**Seguimiento de auditoría 2026-09-19:** PR #2. La reapertura detectó cuatro huecos reproducibles: assets embebidos distintos con igual nombre+tamaño se deduplicaban incorrectamente; los viewports no transportaban/remapeaban `frozenLayers` ni `layerOverrides`; los overrides de cota/directriz podían conservar `textStyle`/`blockId` del origen; y `InsertEntity.dynamic.values` conservaba IDs de parámetros del origen al reutilizar un bloque dinámico equivalente. La primera fase roja confirmó 4 fallos de 29 pruebas de clipboard (409/413 globales). La revisión del diff descubrió además que tablas CAD con el mismo nombre y contenido distinto se fusionaban por nombre y que repetir una colisión de bloque creaba `Nombre (3)` en vez de reutilizar el `Nombre (2)` equivalente; una segunda fase roja confirmó ambos fallos (412/414). El cierre final remapea las referencias restantes, deduplica assets por contenido, usa mapa biyectivo de parámetros dinámicos y resuelve linetypes/estilos/capas/bloques por equivalencia canónica dentro de su familia de nombres. CI #45 cerró `src/io/clipboard.test.ts` 30/30, suite 414/414, typecheck, lint (0 errores; avisos preexistentes), capas, features, build y 8/8 E2E en verde.

---

## DAT-003 — Validar archivos y aplicar límites de recursos

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-18 · **Cierre:** 2026-09-18
- **Prioridad:** P1 — robustez y denegación de servicio local
- **Depende de:** —
- **Bloquea:** DAT-002, BLK-001, WRK-001

**Evidencia:** `src/io/limits.ts` centraliza límites de bytes comprimidos/expandidos, entradas ZIP, entidades, bloques, assets y puntos; `src/io/native.ts`, `src/blocks/libraryArchive.ts` y los comandos validan entradas antes de extraer, migrar o reemplazar el documento.

**Archivos previstos:**

- Crear: `src/io/validation.ts`, `src/io/limits.ts`
- Modificar: `src/io/native.ts`, `src/blocks/libraryArchive.ts`, `src/commands/file.ts`, `src/commands/library.ts`, `src/commands/references.ts`
- Crear/expandir: `src/io/native.test.ts`, `src/blocks/libraryArchive.test.ts`

**Implementación:**

- [x] Definir límites explícitos y documentados para tamaño comprimido, tamaño expandido, número de entradas, entidades, bloques, puntos y assets.
- [x] Validar la envoltura antes de migrar y cada registro crítico antes de construir `Map`.
- [x] Rechazar `NaN`, `Infinity`, IDs vacíos/duplicados y referencias obligatorias imposibles.
- [x] Convertir fallos a errores bilingües que indiquen formato dañado, incompatible o demasiado grande.
- [x] Añadir corpus de archivos truncados, ZIP con expansión excesiva simulada y JSON con tipos incorrectos.

**Criterios de aceptación:**

- [x] Ninguna entrada no confiable alcanza render/geometría sin validación básica.
- [x] El rechazo ocurre antes de sustituir o mutar el documento abierto.
- [x] Los límites permiten archivos legítimos grandes y están centralizados, no dispersos.
- [x] Las pruebas miden que el rechazo sea acotado en tiempo/memoria.

**Cierre:** 2026-09-18 · commit/PR `9bba64f`

**Verificación:** `pnpm vitest run src/storage/fileAccess.test.ts src/commands/file.test.ts src/io/native.test.ts src/blocks/libraryArchive.test.ts` (33 pruebas focalizadas, incluidos ZIP truncado, expansión declarada y tipos incorrectos) y `pnpm lint && pnpm verify` (49 archivos, 377 pruebas, build correcto; lint sin errores, con avisos preexistentes).

---

## DAT-004 — Informar fallos de persistencia y cuota

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity
- **Inicio:** 2026-09-18
- **Prioridad:** P2 — autoguardado/versiones pueden fallar silenciosamente
- **Depende de:** DAT-001
- **Bloquea:** —

**Evidencia inicial:** `src/storage/persistence.ts` devolvía `false` indistintamente por no-op o fallo de IndexedDB y silenciaba errores con `console.warn`. `src/commands/file.ts` descartaba fallos de almacenamiento local con `.catch(() => undefined)` reportando éxito completo aunque la copia local fallase. `VersionsDialog.tsx` silenciaba errores de lectura como si fuera una lista vacía y no ofrecía acción para liberar cuota.

**Archivos previstos:**

- Modificar: `src/storage/persistence.ts`, `src/commands/file.ts`, `src/commands/utility.ts`, `src/styles/app.css`, `src/ui/StatusBar.tsx`, `src/ui/MobileBar.tsx`, `src/ui/dialogs/VersionsDialog.tsx`, `src/main.tsx`
- Ampliar/crear: `src/storage/persistence.test.ts`, `src/commands/file.test.ts`, `src/ui/dialogs/versionsDialog.test.ts`

**Implementación:**

- [x] Modelar resultados `not-needed`, `saved` y `failed` discriminados con clasificación tipada de errores (`classifyStorageError`: `quota`, `unavailable`, `unknown`) detectando errores de disco lleno y `NotAllowedError`.
- [x] Introducir `PersistenceHealth` independiente de React con estados `protected`, `degraded`, `unavailable`, marcas temporales, operaciones granulares y notificación deduplicada.
- [x] Mostrar indicador de estado persistente en la barra de estado (`StatusBar`) y en la barra móvil (`MobileBar`) ante degradación o falta de almacenamiento local con acceso al diálogo de versiones.
- [x] Diferenciar “archivo guardado” de “copia/versiones locales no guardadas”; `save()` mantiene `dirty=false` tras guardar en disco/descarga y emite advertencia explicativa sobre el fallo de la copia local.
- [x] Conectar la operación atómica multi-store `storeDrawingAndVersion` en `save()` con reutilización de bytes precomputados para eliminar serializaciones redundantes, más método de purga controlada `purgeAutoVersions` atómico por lotes que no borra versiones manuales ni transiciona salud en vano.
- [x] Adaptar `VersionsDialog` para diferenciar explícitamente errores de almacenamiento de listas vacías, con botón de reintento y acción para purgar versiones automáticas disponible tanto en el diálogo principal como en el estado de error de carga.
- [x] Controlar errores de persistencia en `RECOVER` evitando mensajes engañosos de "no hay borradores" ante fallos de lectura en IndexedDB.

**Criterios de aceptación:**

- [x] El usuario nunca recibe confirmación completa si falló una parte declarada del guardado.
- [x] Un fallo repetido no inunda la UI; el estado de protección permanece visible en la barra de estado y en móviles, y las advertencias se deduplican.
- [x] Las pruebas cubren `QuotaExceededError`, IndexedDB ausente, fallos transitorios con recuperación posterior y preservación estricta de versiones manuales.
- [x] La suite existente de recovery, versiones, comandos de archivo y recorridos críticos E2E sigue pasando.

**Cierre:** 2026-09-19 · commit `DAT-004`

**Evidencia:**
- `pnpm vitest run src/storage/persistence.test.ts src/commands/file.test.ts src/ui/dialogs/versionsDialog.test.ts`: 3 archivos, 43 pruebas pasando (23 en persistence, 15 en file, 5 en versionsDialog).
- `pnpm test`: 52 archivos de prueba, 447 pruebas pasando en 4.12s.
- `pnpm lint`: 0 errores (30 advertencias preexistentes en otros subsistemas).
- `pnpm check:layers`: 544 importaciones revisadas, arquitectura por capas íntegra.
- `pnpm check:features`: documentación al día.
- `pnpm build`: compilación de producción exitosa en 1.67s.
- `pnpm test:e2e`: 8/8 recorridos críticos en navegador real Chromium pasando en 4.4s.

---

## DAT-005 — Validar la geometría derivada representable

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — una entidad con campos finitos puede producir geometría derivada no finita
- **Depende de:** DAT-003
- **Bloquea:** —

**Evidencia:** un círculo con centro `y=1e308` y radio `1e308` cumple la validación de campos primitivos, pero `circleKind.bbox` devuelve `maxY=Infinity`. La prueba en `src/spatial/spatialIndex.test.ts` reproduce el caso; el índice espacial ya conserva la entidad como candidata sin introducir esa caja en RBush. Los campos y `LIST` muestran `####` para medidas derivadas no finitas; impresión y miniaturas omiten la caja inválida al calcular extensiones. Las pruebas en `src/model/model.test.ts`, `src/commands/behavior/management.test.ts`, `src/output/output.test.ts` y `src/render/thumbnail.test.ts` reproducen esas rutas. La impresión y miniatura ajustan una línea de extremos opuestos enormes sin desbordar; la impresión rechaza una escala manual cuya matriz no es finita y la miniatura limita la escala de un objeto puntual extremo. `MVIEW Ajustar` calcula escala positiva para extremos opuestos; el comando rechaza un ancho derivado infinito antes de crear el viewport y las proporciones inválidas no se aceptan, comprobado en `src/commands/layout.test.ts`. `ARRAYRECT` conserva un punto base finito para coordenadas grandes y rechaza cajas o espaciados derivados no representables antes de modificar la fuente, comprobado en `src/commands/behavior/modify.test.ts`. El caché de bloques, las inserciones y las matrices asociativas devuelven una caja ilimitada cuando su extensión derivada no se puede representar; la regresión en `src/model/kinds/insert.bounds.test.ts` confirma que el índice espacial conserva esas entidades como candidatas y que el cálculo de extensiones de impresión omite sus cajas. SVG/PDF rechazan ahora comandos vectoriales no finitos antes de producir un archivo; la regresión en `src/output/output.test.ts` reprodujo un SVG con `NaN` e `Infinity`. El portapapeles rechaza antes de mutar un desplazamiento que vuelve no finitos los extremos de una línea, comprobado en `src/io/clipboard.test.ts`. Otros consumidores aún requieren una política coherente. Estas protecciones parciales no demuestran que todas las rutas de render y exportación de entidades extremas sean seguras.

La salida vectorial también valida los números derivados de estilos, textos e imágenes antes de llamar a SVG/PDF. `src/output/output.test.ts` reproduce un texto exportado con `translate(Infinity …)` y una matriz de imagen no finita, y comprueba el rechazo temprano. También rechaza un barrido de arco que exigiría más de 4.096 segmentos Bézier antes de reservarlos; la regresión falló antes y la suite focalizada pasó 14/14. La teselación geométrica común aplica ahora su límite de 4.096 incluso si el radio es menor que la tolerancia y devuelve una lista vacía ante parámetros o puntos derivados no finitos; `src/geometry/geometry.test.ts` reprodujo el exceso y el desbordamiento desde datos finitos, y pasó 39/39. En pantalla, `src/render/canvasSink.test.ts` comprueba que `Path2D`, texto, imágenes, sus recortes, bloques transformados y marcadores de punto no reciben valores desbordados; cubre sumas derivadas para el texto simplificado y las esquinas de imágenes. Una máscara de fondo no representable se omite sin perder el texto. `src/render/sceneRenderer.test.ts` y `src/render/traverse.test.ts` verifican la restauración del estado si falla un trazo dentro de un viewport o bloque. Los calcos PDF ya omiten segmentos no finitos y limitan segmentos y comandos incluso dentro de una sola operación de trazado; `src/render/pdfGeometry.test.ts` reprodujo ambas rutas y pasó 10/10 pruebas focalizadas. Sigue pendiente verificar las demás clases de entidad extrema y demostrar los criterios completos de DAT-005.

**Archivos previstos:** `src/model/kinds/*`, `src/model/context.ts`, `src/io/validation.ts` y pruebas focalizadas de importación, transformación, render y extensiones, según la solución elegida.

Una línea con extremos finitos opuestos de magnitud `1e308` devolvía `NaN` al consultar sus puntos porque la resta de extremos desbordaba incluso con parámetro cero. `curvePoint` usa una combinación ponderada cuando esa resta no cabe en el rango; la regresión fue roja antes del cambio y la suite geométrica focalizada pasó 40/40. DAT-005 sigue abierta.

La proyección del punto más cercano sobre líneas largas también desbordaba al elevar su longitud al cuadrado, con parámetros `NaN` que impedían calcular bien la distancia de selección. Usa desplazamientos escalados antes del producto; la regresión falló con una línea de longitud `1e200` y otra con extremos opuestos de magnitud `1e308`. La suite geométrica focalizada pasó 41/41; falta la cobertura completa de DAT-005.

La tangente de líneas y polilíneas con extremos finitos opuestos podía normalizar un desplazamiento infinito y devolver `NaN`, afectando consumidores como alineación de bloques y snaps. Usa el desplazamiento escalado para obtener una dirección finita y conserva la tolerancia previa para tramos diminutos. La regresión fue roja antes del cambio; la suite focalizada pasó 42/42. DAT-005 sigue abierta.

La evaluación de puntos de una curva poligonal repetía la resta desbordada que ya se había corregido para líneas. Ambas curvas comparten ahora la interpolación segura; la regresión con extremos finitos `±1e308` fue roja antes y la suite geométrica pasó 43/43 después. DAT-005 continúa abierta para otras clases y consumidores.

La normalización compartida convertía en dirección cero un vector con componentes finitas `(1.5e308, 1.5e308)` porque su longitud derivada desbordaba. Escala primero los componentes, conservando la tolerancia geométrica para vectores pequeños; la regresión fue roja antes y la suite geométrica pasó 44/44 después. DAT-005 permanece abierta.

`RAY` y `XLINE` por dos puntos finitos extremos restaban coordenadas opuestas antes de normalizar y guardaban direcciones `NaN`. Ambas rutas usan ahora la tangente estable de línea y omiten puntos dentro de la tolerancia; la regresión fue roja antes, comprueba dirección, ausencia de entidad degenerada y undo/redo, y la suite focalizada de dibujo pasó 16/16. DAT-005 sigue abierta para otras rutas.

`XLINE Bisect` mantenía la resta directa y podía guardar una dirección `NaN` con lados finitos extremos. La vista previa y el comando usan ahora la dirección estable y rechazan un primer lado degenerado antes de mutar; la regresión fue roja y comprueba resultado, error y undo/redo. La suite de dibujo pasó 17/17 en esa etapa.

El desfase de `XLINE` reveló otra proyección desbordada en `nearestCurve`: no reconocía una línea de extremos `±1e308` aunque estuviera designada. Reutiliza ahora la distancia geométrica estable; el desfase usa la tangente estable y determina el lado desde el punto más cercano, evitando productos `Infinity × 0`. La regresión fue roja antes de cada corrección y verifica ambos lados, direcciones finitas y undo/redo; la suite de dibujo pasó 18/18. DAT-005 sigue abierta.

El operador geométrico `offsetCurve` aún normalizaba directamente los extremos de líneas y polilíneas finitas `±1e308`, generando vértices `NaN`. Ambas ramas usan ahora la tangente estable y conservan el caso degenerado existente. La regresión fue roja para línea y polilínea; las suites focalizadas de geometría e invariantes pasaron 59/59. DAT-005 permanece abierta para otras curvas y consumidores.

Una elipse con campos finitos y teselación derivada no representable dejaba cero muestras; `offsetCurve` llamaba entonces a `samePoint(undefined, undefined)` y lanzaba una excepción. Devuelve `null` sin mutar en ese caso. También rechaza resultados no finitos de líneas, polilíneas, rayos, líneas infinitas y radios de arco antes de devolverlos. Las regresiones fueron rojas y las suites focalizadas de geometría e invariantes pasaron 61/61. DAT-005 continúa abierta para más clases y recorridos del editor.

La elección del lado de `OFFSET` normalizaba la derivada no finita de una línea con extremos diagonales `±1e308` y elegía el lado derecho para un punto que estaba a la izquierda. `sideOfCurve` utiliza la tangente estable en líneas y curvas poligonales; la regresión fue roja antes y comprueba ambos lados. Las suites focalizadas de geometría e invariantes pasaron 62/62. DAT-005 sigue abierta.

Un punto finito fuera de una línea horizontal extrema aún generaba un desplazamiento derivado infinito; el producto cruzado multiplicaba ese desplazamiento por una tangente vertical cero y elegía el lado incorrecto por `NaN`. La regresión fue roja antes del ajuste local y geometría e invariantes pasaron 62/62 después, junto con `pnpm typecheck`. DAT-005 permanece abierta.

Una línea diagonal lejana reveló `Infinity - Infinity` en el mismo cálculo de lado, pese a tener coordenadas finitas. La orientación se recalcula con coordenadas escaladas solo cuando el resultado directo es `NaN`; la regresión fue roja para el lado izquierdo y después pasaron 48/48 pruebas de geometría y `pnpm typecheck`. DAT-005 sigue abierta.

`offsetPolyline` todavía entregaba una polilínea parcial si un tramo lineal desbordaba y otro podía desplazarse. Ahora cancela el resultado completo ante un tramo no representable y mantiene la eliminación local de arcos colapsados. La regresión fue roja antes; pasaron 49/49 pruebas de geometría y `pnpm typecheck` después. DAT-005 continúa abierta.

Una polilínea válida con menos de dos vértices provocaba `TypeError` al ejecutar `offsetEntity` porque no había tramo para elegir el lado. Devuelve un resultado vacío antes de calcularlo. La regresión fue roja y pasaron 27/27 pruebas focalizadas de `src/modify/modify.test.ts` y `pnpm typecheck`. DAT-005 continúa abierta para los demás casos de geometría derivada.

`REVCLOUD` podía superar el límite de vértices con entradas finitas y reservar una cantidad no acotada de muestras al convertir un objeto. Ahora comprueba el presupuesto antes de iterar o reservar, omite vistas previas no representables y rechaza sin mutación el resultado excesivo; la regresión fue roja para 100.001 vértices y las 21/21 pruebas focalizadas de dibujo pasaron después, incluida la conversión válida de un objeto, junto con tipos, lint y capas. DAT-005 permanece abierta para los demás generadores y consumidores.

`MEASURE` podía recibir distancia cero mediante dos clics y quedar en un bucle que no avanzaba; una distancia muy pequeña también podía generar más marcas que el límite del dibujo. Valida longitud, distancia y presupuesto antes de construir marcas, y rechaza puntos derivados no representables antes de aplicar cambios. La prueba focalizada comprobó dos clics coincidentes, una distancia normal y el exceso sin mutación; dibujo pasó 22/22 y `pnpm typecheck` pasó. DAT-005 sigue abierta.

`ARRAYRECT` aceptaba hasta 25 millones de instancias y los archivos nativos podían conservar cantidades enteras sin máximo; modelar o renderizar una matriz así podía bloquear la interfaz. Un límite compartido de 250.000 acota instancias, objetos fuente y tramos de ruta en comandos, archivos/portapapeles, grips, guardado y expansión del modelo. `ARRAYPATH` ya no tesela polilíneas antes de guardarlas como trayectoria. Las pruebas focalizadas de `src/commands/behavior/modify.test.ts`, `src/io/native.test.ts` y `src/model/kinds/insert.bounds.test.ts` pasaron 66/66; las suites nativa y de portapapeles pasaron después 81/81, junto con `pnpm typecheck` y `pnpm check:layers` (595 importaciones). DAT-005 permanece abierta.

**Criterios de aceptación:**

- [ ] Definir una regla explícita para operaciones derivadas fuera del rango representable sin limitar arbitrariamente dibujos válidos.
- [ ] Las rutas de entrada y comandos mutables rechazan el resultado inválido de forma atómica y bilingüe, o los consumidores admiten una representación acotada con semántica comprobada.
- [ ] Extensiones, selección, render, miniaturas y copia no reciben `NaN`/`Infinity` inesperados de entidades con campos finitos.
- [ ] Probar al menos círculo, inserción con escala extrema y desbordamiento en un solo eje, con éxito, error y undo/redo cuando corresponda.

**Verificación prevista:** pruebas focalizadas de las rutas afectadas y `pnpm verify`.

---

## DAT-006 — Acotar entidades y puntos durante la importación DXF

- [x] **Estado:** Cerrada
- **Responsable:** Codex
- **Cierre:** 2026-09-23
- **Prioridad:** P2 — un DXF permitido por tamaño puede crear más entidades o vértices que los límites del documento
- **Depende de:** DAT-003
- **Bloquea:** —

**Evidencia inicial:** `IMPORTDXF` pasaba el texto a `parseDxf` y después a `importDxfIntoDocument` en el hilo principal. El parser construía todos los registros y el importador no aplicaba `INPUT_LIMITS.maxEntities` ni `maxPointsPerEntity` antes de convertir; un archivo inferior a 64 MiB podía contener más de 250.000 entidades o una polilínea de más de 100.000 puntos. Los caminos `readDxf` y `readDwg` también aceptaban la estructura intermedia sin esos límites.

**Archivos previstos:** `src/io/dxf/parser.ts`, `src/io/dxf/importDxf.ts`, `src/io/dxf/importDxf.test.ts`, pruebas de worker/fallback donde corresponda.

**Criterios de aceptación:**

- [x] Limitar registros, entidades y puntos antes de reservar o convertir cantidades excesivas.
- [x] Aplicar la misma protección al DXF textual y a la estructura DXF procedente de DWG.
- [x] Rechazar con error bilingüe y sin mutar el dibujo abierto; conservar el documento anterior también al usar reemplazo.
- [x] Cubrir los umbrales y la atomicidad con pruebas focalizadas y pasar `pnpm verify`.

**Evidencia de cierre:** `tokenize` recorre líneas sin duplicar todo el texto y limita bytes y pares; el parser limita registros, bloques, entidades y puntos durante la construcción. `importDxfFile` aplica los mismos límites a la estructura intermedia de DWG antes de `replaceData` y calcula las cuatro líneas de cada `3DFACE` antes de convertir. Los contadores declarados de `HATCH` se contrastan con sus pares y su conversión se detiene al agotar los datos. `src/io/dxf/importDxf.test.ts` comprueba los límites de entidades, 100.000/100.001 puntos, vértices de `POLYLINE`, expansión de `3DFACE`, conteos de `HATCH`, error bilingüe y conservación del dibujo al reemplazar. Las 8 suites DXF/DWG pasaron 59/59 pruebas; `pnpm verify` pasó 809/809 pruebas en 90 archivos, lint, tipos, capas, catálogo y build. El recorrido visible de importación/exportación DXF pasó en Chromium y WebKit después del build (2/2).

---

## DAT-007 — Mantener coherentes los límites del escritor y lector nativos

- [x] **Estado:** Cerrada
- **Responsable:** Codex
- **Cierre:** 2026-09-23
- **Prioridad:** P2 — QSAVE podía escribir un paquete nativo que luego el lector rechazaba
- **Depende de:** DAT-003
- **Bloquea:** —

**Criterios de aceptación:**

- [x] El escritor rechaza colecciones por encima de los mismos topes que usa el lector, antes de serializar.
- [x] Un documento con más de 10.000 recursos no produce un archivo `.fmodel` que no pueda reabrirse.

**Evidencia de cierre:** `toNativeFile` aplica los límites de colección que también usa `fromNativeFile`; la prueba crea 10.001 recursos y comprueba el rechazo antes de serializar. Las pruebas focalizadas de comandos, formato nativo y matrices asociativas pasaron 66/66; `pnpm typecheck` y `git diff --check` pasaron.

---

## DAT-008 — Rechazar bibliotecas grandes antes de serializar sus bloques

- [x] **Estado:** Cerrada
- **Responsable:** Codex
- **Cierre:** 2026-09-23
- **Prioridad:** P2 — exportar más bloques que entradas ZIP permitidas serializaba todo antes de rechazarlo
- **Depende de:** DAT-003
- **Bloquea:** —

**Criterios de aceptación:**

- [x] Comprobar el total de entradas antes de validar y serializar cada bloque.
- [x] Mantener el error bilingüe de biblioteca demasiado grande.

**Evidencia de cierre:** `writeLibraryArchive` comprueba `1 + blocks.length` antes de recorrer los bloques. La suite existente `src/blocks/libraryArchive.test.ts`, incluido el umbral de entradas ZIP, pasó 34/34 pruebas; `pnpm typecheck` pasó.
