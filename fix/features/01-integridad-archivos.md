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
