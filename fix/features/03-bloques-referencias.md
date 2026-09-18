# Bloques, biblioteca y referencias externas

## BLK-001 — Centralizar el remapeo tipado de identificadores

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — corrección y mantenibilidad
- **Depende de:** DAT-003
- **Bloquea:** ARC-001 en bloques/xref

**Evidencia:** `commands/blockEditor.ts`, `blocks/library.ts` y `xref/xref.ts` remapean referencias internas mediante `JSON.stringify(...).replace(...)`. Ese mecanismo visita cualquier string, puede cambiar texto que coincida accidentalmente con un ID y replica lógica en tres lugares. `io/dxf/dynamicData.ts` ya contiene un recorrido recursivo genérico, pero tampoco expresa qué campos son referencias.

**Archivos previstos:**

- Crear: `src/blocks/remap.ts`, `src/blocks/remap.test.ts`
- Modificar: `src/commands/blockEditor.ts`, `src/blocks/library.ts`, `src/xref/xref.ts`, `src/io/dxf/dynamicData.ts`

**Interfaz a producir:** funciones explícitas para remapear `DynamicBlockDefinition`, entidades, bloques y estilos con mapas separados por dominio.

**Implementación:**

- [ ] Caracterizar todos los campos que contienen IDs en parámetros, acciones, restricciones, visibilidad, lookup y variables.
- [ ] Escribir casos donde una etiqueta/texto es igual a un ID y debe permanecer intacta.
- [ ] Reemplazar las tres sustituciones JSON por el remapeo tipado.
- [ ] Usar la misma ruta para biblioteca, xref, Guardar bloque como y portapapeles.

**Criterios de aceptación:**

- [ ] Solo cambian campos de referencia documentados.
- [ ] Referencias faltantes generan advertencia o error; no quedan silenciosamente rotas.
- [ ] La ida y vuelta de bloques dinámicos y xrefs conserva nombres, fórmulas y textos.

**Verificación:** `pnpm vitest run src/blocks src/xref src/io/dxf/dynamicData.test.ts && pnpm verify`

---

## BLK-002 — Validar paquetes de biblioteca antes de instalarlos

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — integridad de la biblioteca local
- **Depende de:** DAT-003, BLK-001
- **Bloquea:** —

**Evidencia:** `src/blocks/libraryArchive.ts:28-44` confía en `manifest.categories`, `manifest.blocks` y el JSON de cada bloque tras comprobar solo formato y versión. La importación puede escribir registros inválidos a IndexedDB.

**Archivos previstos:**

- Modificar: `src/blocks/libraryArchive.ts`, `src/blocks/libraryImport.ts`, `src/blocks/libraryStore.ts`
- Ampliar: `src/blocks/libraryArchive.test.ts`, `src/blocks/libraryImport.test.ts`, `src/blocks/libraryStore.test.ts`

**Criterios de aceptación:**

- [ ] IDs, nombres, rutas de manifiesto, categorías, paquetes y miniaturas se validan antes de cualquier escritura.
- [ ] Duplicados dentro del mismo archivo tienen una resolución determinista.
- [ ] La instalación completa es atómica: todos los bloques o ninguno.
- [ ] Los límites de DAT-003 se aplican a ZIP, miniaturas y número de bloques.

**Verificación:** `pnpm vitest run src/blocks/libraryArchive.test.ts src/blocks/libraryImport.test.ts src/blocks/libraryStore.test.ts`

---

## XRF-001 — Verificar portabilidad completa de referencias y recursos

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — archivos compartibles sin recursos huérfanos
- **Depende de:** DAT-003, BLK-001
- **Bloquea:** —

**Evidencia:** xref cuenta con pruebas de ciclos y remapeo, pero falta una matriz de archivos reales que combine xref anidada, bloque dinámico, estilos, imagen/PDF y rutas no disponibles después de guardar/abrir.

**Archivos previstos:**

- Ampliar: `src/xref/xref.test.ts`, `src/io/native.test.ts`
- Modificar si una prueba demuestra fallo: `src/xref/xref.ts`, `src/xref/sources.ts`, `src/io/native.ts`

**Escenarios obligatorios:** enlazar vs superponer, ciclo indirecto, recarga sin permiso, archivo movido, bind, asset incrustado, xref con bloque anidado y reapertura del `.fmodel` en un origen sin handles previos.

**Criterios de aceptación:**

- [ ] El `.fmodel` compartido se abre con la misma geometría visible sin depender de handles locales.
- [ ] Las rutas/handles son metadatos de recarga y no la única copia del contenido.
- [ ] Un recurso faltante produce diagnóstico y placeholder controlado, nunca excepción de render.

**Verificación:** `pnpm vitest run src/xref/xref.test.ts src/io/native.test.ts && pnpm verify`
