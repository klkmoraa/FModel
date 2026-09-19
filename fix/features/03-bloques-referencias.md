# Bloques, biblioteca y referencias externas

## BLK-003 — Integrar una colección ampliada CC0 en formato FModel

- [>] **Estado:** En curso
- **Prioridad:** P2 — ampliar la biblioteca local con geometría 2D reutilizable
- **Responsable:** Codex · **Inicio:** 2026-09-18
- **Depende de:** —
- **Bloquea:** —

**Decisión de producto:** conservar la biblioteca instalada por el usuario y añadir una colección opcional en formato `.fmodellib`. El catálogo público seleccionado se distribuye bajo CC0; su procedencia y la del material GPL-2.0 existente se documentan sin atribuir a FModel autoría ajena.

**Evidencia parcial:**
1. Existe la colección local de 398 bloques CC0 en `public/library/fmodel-cc0.fmodellib`, con procedencia y licencia documentadas.
2. La instalación es bajo demanda, se valida y no consulta un servicio externo; el service worker no la incluye en el precache.
3. `scripts/build-cc0-library.mjs` fija reloj y aleatoriedad para una generación reproducible.
4. La generación reproducible de extremo a extremo no se volvió a ejecutar en esta corrección porque el archivo fuente DXF/miniaturas de entrada no está disponible en el checkout; no se inventa esa evidencia.

**Criterios de aceptación:**

- [x] Los DXF seleccionados se convierten a paquetes de bloque nativos con geometría, unidades y categorías verificadas.
- [x] La colección se instala desde un recurso incluido en la aplicación, sin enviar dibujos ni consultar un servicio externo.
- [x] Instalar dos veces no crea duplicados ni reemplaza bloques personalizados.
- [x] La interfaz en español e inglés permite instalarla y consultar su procedencia y licencia.
- [ ] La generación reproducible se ejecuta desde las fuentes declaradas y produce el artefacto esperado sin timestamps variables.

**Verificación:** suite de biblioteca, inspección de `dist/sw.js` sin entradas `library/` y puertas locales pasan; BLK-003 permanece abierta hasta repetir la generación desde sus fuentes.

---

## BLK-001 — Centralizar el remapeo tipado de identificadores

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — corrección y mantenibilidad
- **Depende de:** DAT-003
- **Bloquea:** ARC-001 en bloques/xref

**Evidencia:** `src/blocks/remap.ts` implementa remapeo tipado de entidades, acciones, visibilidad y restricciones. Con `missingPolicy: 'omit'` elimina referencias y constraints inválidas sin producir `entityId: ''`; cada omisión agrega un `RemapWarning` tipado con contexto. La misma ruta se usa en biblioteca, xref, Guardar bloque como, portapapeles y datos dinámicos DXF.

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
- [x] Referencias faltantes generan advertencia tipada o error; con `omit` no quedan cadenas vacías ni constraints sin referencias válidas.
- [x] La ida y vuelta de bloques dinámicos y xrefs conserva nombres, fórmulas y textos.

**Cierre:** 2026-09-19

**Verificación:** `src/blocks/remap.test.ts` (18 pruebas focalizadas) y la suite completa (63 archivos/582 pruebas) pasan.

---

## BLK-002 — Validar paquetes de biblioteca antes de instalarlos

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — integridad de la biblioteca local
- **Depende de:** DAT-003, BLK-001
- **Bloquea:** —

**Evidencia:** además de la validación profunda y transacción atómica de `.fmodellib`, las miniaturas se restringen a data URLs de PNG/JPEG/WebP/GIF/SVG permitido, con longitud acotada y sanitización/rechazo de SVG activo, remoto o externo. La migración legacy de localStorage también descarta miniaturas remotas o inseguras; un paquete local no abre rutas de red.

**Archivos previstos:**

- Modificar: `src/blocks/libraryArchive.ts`, `src/blocks/libraryStore.ts`, `src/io/native.ts`, `src/io/validation.ts`
- Ampliar: `src/blocks/libraryArchive.test.ts`, `src/blocks/libraryStore.test.ts`

**Criterios de aceptación:**

- [x] IDs, nombres, rutas de manifiesto, categorías, paquetes y miniaturas se validan antes de cualquier escritura.
- [x] Duplicados dentro del mismo archivo tienen una resolución determinista.
- [x] La instalación completa es atómica: todos los bloques o ninguno.
- [x] Los límites de DAT-003 se aplican a ZIP, miniaturas y número de bloques.

**Cierre:** 2026-09-19

**Verificación:** `src/blocks/libraryArchive.test.ts` incluye rechazo de URLs remotas, SVG con script y referencias externas; la suite completa (63 archivos/582 pruebas) pasa.

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
