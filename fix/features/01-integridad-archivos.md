# Integridad de datos, archivos e intercambio

## DAT-001 — Distinguir guardado, descarga y cancelación

- [>] **Estado:** En curso
- **Responsable:** Codex · **Inicio:** 2026-09-18
- **Prioridad:** P1 — riesgo de pérdida de trabajo
- **Depende de:** —
- **Bloquea:** DAT-004, TST-001

**Evidencia:** `src/storage/fileAccess.ts:46-68` devuelve `Handle | null`; `null` representa tanto una descarga fallback completada como la cancelación del selector. `src/commands/file.ts:91-105` limpia `doc.dirty` y anuncia éxito aun cuando `showSaveFilePicker` fue cancelado.

**Archivos previstos:**

- Modificar: `src/storage/fileAccess.ts`
- Modificar: `src/commands/file.ts`, `src/commands/output.ts`, `src/commands/library.ts`
- Crear: `src/storage/fileAccess.test.ts`
- Modificar: pruebas de comandos/archivos necesarias para cubrir QSAVE y SAVEAS

**Implementación:**

- [ ] Definir un resultado discriminado: `saved-to-handle`, `download-started` o `cancelled`.
- [ ] Hacer que todos los consumidores traten `cancelled` como salida sin efectos ni mensaje de éxito.
- [ ] Limpiar `doc.dirty`, crear versión local y marcar salida limpia solo después de `saved-to-handle` o `download-started`.
- [ ] Conservar el handle anterior si Guardar como se cancela.
- [ ] Probar selector aceptado, selector cancelado, escritura sobre handle existente y fallback de descarga.

**Criterios de aceptación:**

- [ ] Cancelar QSAVE/SAVEAS mantiene `doc.dirty === true`.
- [ ] Cancelar no crea una versión “Guardado manual” ni muestra “Guardado”.
- [ ] Safari/Firefox siguen contabilizando el fallback de descarga como éxito.
- [ ] Fallar al escribir propaga un error visible y conserva el estado sucio.

**Verificación:** `pnpm vitest run src/storage/fileAccess.test.ts src/commands/commands.test.ts && pnpm verify`

---

## DAT-002 — Hacer portable el portapapeles entre dibujos

- [ ] **Estado:** Abierta
- **Prioridad:** P1 — referencias rotas y pérdida semántica
- **Depende de:** DAT-003
- **Bloquea:** TST-001

**Evidencia:** `src/commands/modify.ts:1139-1189` copia solo `Entity[]` y, al pegar, repara únicamente la capa. Inserciones, matrices, imágenes/PDF, estilos de texto/cota/directriz/tabla/multilínea y definiciones anidadas pueden apuntar a IDs que no existen en el destino.

**Archivos previstos:**

- Crear: `src/io/clipboard.ts`
- Crear: `src/io/clipboard.test.ts`
- Modificar: `src/commands/modify.ts`
- Reutilizar/extraer: lógica de dependencias de `src/blocks/library.ts` y `src/xref/xref.ts`

**Interfaz a producir:** `ClipboardPackage` versionado con entidades, bloques transitivos, estilos, linetypes y assets necesarios; `pasteClipboardPackage(doc, package, owner, point)` devuelve IDs insertados y advertencias.

**Implementación:**

- [ ] Escribir pruebas fallidas para bloque anidado, imagen, texto con estilo propio, cota y matriz asociativa entre dos documentos.
- [ ] Construir el cierre transitivo de dependencias sin incluir registros no usados.
- [ ] Remapear IDs con funciones tipadas y resolver colisiones por nombre/contenido.
- [ ] Mantener compatibilidad de lectura con el formato actual `fmodel-clip` o emitir un mensaje claro.
- [ ] Seleccionar los objetos recién pegados y presentar advertencias de conversiones.

**Criterios de aceptación:**

- [ ] Ninguna entidad pegada conserva referencias a registros inexistentes.
- [ ] Pegar dos veces no duplica estilos/definiciones equivalentes de forma innecesaria.
- [ ] Los recursos binarios requeridos viajan con el paquete.
- [ ] Entradas alteradas o incompletas se rechazan sin cambiar el dibujo.

**Verificación:** `pnpm vitest run src/io/clipboard.test.ts && pnpm verify`

---

## DAT-003 — Validar archivos y aplicar límites de recursos

- [>] **Estado:** En curso
- **Responsable:** Codex · **Inicio:** 2026-09-18
- **Prioridad:** P1 — robustez y denegación de servicio local
- **Depende de:** —
- **Bloquea:** DAT-002, BLK-001, WRK-001

**Evidencia:** `src/io/native.ts:62-100` comprueba formato/versión/ID de registros, pero no valida `collections`, `documentId`, discriminantes, números finitos ni referencias. `readPackage()` y `readLibraryArchive()` usan `unzipSync` sin límites. No existen topes de bytes, entradas, expansión, entidades o assets.

**Archivos previstos:**

- Crear: `src/io/validation.ts`, `src/io/limits.ts`
- Modificar: `src/io/native.ts`, `src/blocks/libraryArchive.ts`, `src/commands/file.ts`, `src/commands/library.ts`, `src/commands/references.ts`
- Crear/expandir: `src/io/native.test.ts`, `src/blocks/libraryArchive.test.ts`

**Implementación:**

- [ ] Definir límites explícitos y documentados para tamaño comprimido, tamaño expandido, número de entradas, entidades, bloques, puntos y assets.
- [ ] Validar la envoltura antes de migrar y cada registro crítico antes de construir `Map`.
- [ ] Rechazar `NaN`, `Infinity`, IDs vacíos/duplicados y referencias obligatorias imposibles.
- [ ] Convertir fallos a errores bilingües que indiquen formato dañado, incompatible o demasiado grande.
- [ ] Añadir corpus de archivos truncados, ZIP con expansión excesiva simulada y JSON con tipos incorrectos.

**Criterios de aceptación:**

- [ ] Ninguna entrada no confiable alcanza render/geometría sin validación básica.
- [ ] El rechazo ocurre antes de sustituir o mutar el documento abierto.
- [ ] Los límites permiten archivos legítimos grandes y están centralizados, no dispersos.
- [ ] Las pruebas miden que el rechazo sea acotado en tiempo/memoria.

**Verificación:** `pnpm vitest run src/io/native.test.ts src/blocks/libraryArchive.test.ts && pnpm verify`

---

## DAT-004 — Informar fallos de persistencia y cuota

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — autoguardado/versiones pueden fallar silenciosamente
- **Depende de:** DAT-001
- **Bloquea:** —

**Evidencia:** `src/storage/persistence.ts` devuelve `false` y solo escribe en consola cuando falla el autoguardado. `src/commands/file.ts:101-103` descarta fallos de biblioteca local y versión con `.catch(() => undefined)`.

**Archivos previstos:**

- Modificar: `src/storage/persistence.ts`, `src/commands/file.ts`, `src/app/services.ts`
- Modificar: `src/ui/dialogs/VersionsDialog.tsx`
- Ampliar: `src/storage/persistence.test.ts`

**Implementación:**

- [ ] Modelar resultados `ok`, `quota-exceeded`, `unavailable` y `unknown-error`.
- [ ] Mostrar una notificación persistente si el autoguardado deja de proteger el dibujo.
- [ ] Diferenciar “archivo guardado” de “copia/versiones locales no guardadas”.
- [ ] Añadir una acción para limpiar versiones automáticas o descargar una copia cuando no haya cuota.

**Criterios de aceptación:**

- [ ] El usuario nunca recibe confirmación completa si falló una parte declarada del guardado.
- [ ] Un fallo repetido no inunda la UI; el estado de protección permanece visible.
- [ ] Las pruebas cubren `QuotaExceededError`, IndexedDB ausente y recuperación posterior.

**Verificación:** `pnpm vitest run src/storage/persistence.test.ts && pnpm verify`
