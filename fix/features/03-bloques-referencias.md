# Bloques, biblioteca y referencias externas

## BLK-003 — Integrar una colección ampliada CC0 en formato FModel

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — ampliar la biblioteca local con geometría 2D reutilizable
- **Responsable:** Codex · **Inicio:** 2026-09-18 · **Cierre:** 2026-09-19
- **Depende de:** —
- **Bloquea:** —

**Decisión de producto:** conservar la biblioteca instalada por el usuario y añadir una colección opcional en formato `.fmodellib`. El catálogo público seleccionado se distribuye bajo CC0; su procedencia y la del material GPL-2.0 existente se documentan sin atribuir a FModel autoría ajena.

**Evidencia:**
1. Conversión de 398 bloques DXF CC0 a formato nativo `.fmodellib` ([`public/library/fmodel-cc0.fmodellib`](file:///Users/crismora/Desktop/FModel/public/library/fmodel-cc0.fmodellib)) con miniaturas SVG integradas, categorías estándar y unidades en pulgadas.
2. Procedencia y licencia documentadas en [`public/library/fmodel-cc0-SOURCE.md`](file:///Users/crismora/Desktop/FModel/public/library/fmodel-cc0-SOURCE.md) con SHA-256 verificado.
3. Lógica de instalación en [`src/blocks/cc0Library.ts`](file:///Users/crismora/Desktop/FModel/src/blocks/cc0Library.ts) e interfaces bilingües en [`src/ui/panels/LibraryView.tsx`](file:///Users/crismora/Desktop/FModel/src/ui/panels/LibraryView.tsx) y [`src/ui/welcome/LibraryCatalogView.tsx`](file:///Users/crismora/Desktop/FModel/src/ui/welcome/LibraryCatalogView.tsx) que garantizan que reinstalar no genera duplicados ni reemplaza bloques del usuario.
4. Pruebas automatizadas en [`src/blocks/cc0Library.test.ts`](file:///Users/crismora/Desktop/FModel/src/blocks/cc0Library.test.ts) pasando al 100%.

**Criterios de aceptación:**

- [x] Los DXF seleccionados se convierten a paquetes de bloque nativos con geometría, unidades y categorías verificadas.
- [x] La colección se instala desde un recurso incluido en la aplicación, sin enviar dibujos ni consultar un servicio externo.
- [x] Instalar dos veces no crea duplicados ni reemplaza bloques personalizados.
- [x] La interfaz en español e inglés permite instalarla y consultar su procedencia y licencia.
- [x] La fuente, licencia, fecha y huella del material incorporado quedan registradas.

**Verificación:** `pnpm vitest run src/blocks/cc0Library.test.ts` y `pnpm lint && pnpm verify`.

---

## BLK-001 — Centralizar el remapeo tipado de identificadores

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — corrección y mantenibilidad
- **Depende de:** DAT-003
- **Bloquea:** ARC-001 en bloques/xref

**Evidencia:** `src/blocks/remap.ts` implementa `remapDynamicBlockDef`, `remapDynamicInstanceState` y `remapDynamicState`, con resolución tipada de entidades en parámetros de visibilidad (`visible`), selecciones de acciones (`selection`), rotación polar (`rotateOnly`) y restricciones (`refs[].entityId`). Se eliminaron todas las sustituciones regex `JSON.stringify(...).replace(...)` en `commands/blockEditor.ts`, `blocks/library.ts` y `xref/xref.ts`. Se desacopló y reutilizó en `io/clipboard.ts` y se integró en `io/dxf/dynamicData.ts` para que la codificación y decodificación de handles DXF sólo afecte referencias reales de entidades sin alterar nombres, etiquetas, fórmulas o tablas de consulta.

**Archivos previstos:**

- Crear: `src/blocks/remap.ts`, `src/blocks/remap.test.ts`
- Modificar: `src/commands/blockEditor.ts`, `src/blocks/library.ts`, `src/xref/xref.ts`, `src/io/clipboard.ts`, `src/io/dxf/dynamicData.ts`, `src/io/dxf/dynamicData.test.ts`, `src/xref/xref.test.ts`

**Interfaz a producir:** funciones explícitas para remapear `DynamicBlockDefinition`, entidades, bloques y estilos con mapas separados por dominio.

**Implementación:**

- [x] Caracterizar todos los campos que contienen IDs en parámetros, acciones, restricciones, visibilidad, lookup y variables.
- [x] Escribir casos donde una etiqueta/texto es igual a un ID y debe permanecer intacta.
- [x] Reemplazar las tres sustituciones JSON por el remapeo tipado.
- [x] Usar la misma ruta para biblioteca, xref, Guardar bloque como y portapapeles.

**Criterios de aceptación:**

- [x] Solo cambian campos de referencia documentados.
- [x] Referencias faltantes generan advertencia o error; no quedan silenciosamente rotas.
- [x] La ida y vuelta de bloques dinámicos y xrefs conserva nombres, fórmulas y textos.

**Cierre:** 2026-09-19

**Verificación:** `pnpm vitest run src/blocks src/xref src/io/dxf/dynamicData.test.ts src/io/clipboard.test.ts` (15 suites, 117 pruebas pasando) y `pnpm lint && pnpm verify` (53 archivos de test, 462 pruebas pasando, 0 errores de tipo, capas y features al día, build correcto).

---

## BLK-002 — Validar paquetes de biblioteca antes de instalarlos

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — integridad de la biblioteca local
- **Depende de:** DAT-003, BLK-001
- **Bloquea:** —

**Evidencia:** `src/blocks/libraryArchive.ts` implementa validación profunda de archivos `.fmodellib` antes de escribir en IndexedDB: `validateLibraryCategories` verifica unicidad de IDs de categorías, existencia y validez de padres, ausencia de auto-dependencias y ciclos, y profundidad máxima de 2 niveles; `readLibraryArchive` valida la unicidad de IDs y rutas de manifiesto, rechaza path traversal exigiendo `blocks/<id>.json`, comprueba coherencia estricta entre el manifiesto y el JSON real (`manifest.id === block.id` y `manifest.name === block.name`), y rechaza versiones de manifiesto menores a 1; `validateLibraryBlock` y `validateBlockPackage` verifican metadatos, tags, límites de miniaturas y cadenas, existencia del root, unicidad de IDs en bloques/capas/estilos/entidades, pertenencia de propietarios (`owner`), existencia de capas/tipos de línea/estilos/bloques (`insert`/`array`/`mleader` con bloque), tipos de entidad válidos (`ENTITY_TYPES` compartido con formatos nativos), soporte para cotas/directrices/tablas con estilos CAD estándar (`DIMSTYLE_ISO_ID`, `DIMSTYLE_STANDARD_ID`, `MLEADERSTYLE_STANDARD_ID`, etc.), detección de referencias circulares entre bloques (evitando bucles infinitos), finitud de números (`assertFiniteValues`) y límite de puntos (`assertPointLimits`), y referencias internas válidas en bloques dinámicos acotadas a las entidades del propio bloque. Se reforzó `commitLibrary` en `src/blocks/libraryStore.ts` para validar bloques y categorías antes de ejecutar la transacción atómica IndexedDB y reasignar graciosamente categorías desconocidas pero válidas a «Sin clasificar», garantizando que un archivo inválido nunca deje escritura parcial.

**Archivos previstos:**

- Modificar: `src/blocks/libraryArchive.ts`, `src/blocks/libraryStore.ts`, `src/io/native.ts`, `src/io/validation.ts`
- Ampliar: `src/blocks/libraryArchive.test.ts`, `src/blocks/libraryStore.test.ts`

**Criterios de aceptación:**

- [x] IDs, nombres, rutas de manifiesto, categorías, paquetes y miniaturas se validan antes de cualquier escritura.
- [x] Duplicados dentro del mismo archivo tienen una resolución determinista.
- [x] La instalación completa es atómica: todos los bloques o ninguno.
- [x] Los límites de DAT-003 se aplican a ZIP, miniaturas y número de bloques.

**Cierre:** 2026-09-19

**Verificación:** `pnpm vitest run src/blocks/libraryArchive.test.ts src/blocks/libraryImport.test.ts src/blocks/libraryStore.test.ts` (3 archivos de prueba, 40 pruebas pasando) y `pnpm lint && pnpm verify` (53 suites, 494 pruebas pasando, 0 errores de tipo, capas y features al día, build correcto).

---

## XRF-001 — Verificar portabilidad completa de referencias y recursos

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — archivos compartibles sin recursos huérfanos
- **Responsable:** Antigravity
- **Inicio:** 2026-09-19
- **Cierre:** 2026-09-19
- **Depende de:** DAT-003, BLK-001
- **Bloquea:** —

**Evidencia:**
1. Portabilidad de dibujo anfitrión: La reapertura de `.fmodel` preserva la geometría y el snapshot completo de entidades/recursos sin requerir File System Access handles.
2. Preservación vs Descarga: Separación estricta de `markXrefUnavailable` (origen inaccesible/movido mantiene el snapshot visible con `status: 'not-found' | 'unresolved'`) y `unloadXref` (descarga explícita mediante `XUNLOAD` que vacía el contenido). Incorporación de `repathXref` para redirección programática y recarga.
3. Mapeo de identificadores y aislamiento de dominios: Remapeo completo y discriminado por dominio (`ltMap`, `layerMap`, `textStyleMap`, `dimStyleMap`, `mleaderStyleMap`, `tableStyleMap`, `mlineStyleMap`, `blockMap`, `assetMap`, `idMap`) evitando colisiones cruzadas. Se remapearon referencias internas de estilos y sobreescrituras en cotas, directrices y viewports.
4. Desduplicación de recursos (Assets): Deduplicación estricta por contenido (`dataUrl`, o tupla normalizada `path+mime+size` / `name+mime+size`). Colisiones de ID con contenido distinto generan identificadores únicos limpios.
5. Dependencias circulares indirectas y anidamiento: Detección y bloqueo de ciclos multinivel (A -> B -> C -> A) mediante preservación de `documentId` en metadatos de bloques anidados. Aislamiento de capas y entidades en referencias tipo `overlay`.
6. Bind y Detach seguros: `bindXref` permite unir snapshots válidos aun con origen inaccesible (solo rechaza `unloaded`), convirtiendo prefijos a `$0$` en todos los recursos poseídos. `detachXref` limpia selectivamente capas, tipos de línea, estilos y assets poseídos sin eliminar recursos en uso por el anfitrión o capas activas.

**Archivos modificados:**
- `src/document/types.ts`
- `src/xref/xref.ts`
- `src/commands/references.ts`
- `src/ui/dialogs/ReferencesDialog.tsx`
- `src/xref/xref.test.ts`
- `src/commands/references.test.ts`

**Criterios de aceptación:**

- [x] El `.fmodel` compartido se abre con la misma geometría visible sin depender de handles locales.
- [x] Las rutas/handles son metadatos de recarga y no la única copia del contenido.
- [x] Un recurso faltante produce diagnóstico y placeholder controlado, nunca excepción de render.

**Verificación:** `pnpm vitest run src/xref/xref.test.ts src/commands/references.test.ts src/io/native.test.ts` (3 suites, 36 pruebas pasando) y `pnpm lint && pnpm verify` (54 suites, 505 pruebas pasando, 0 errores en capas y tipos, build de producción exitoso).
