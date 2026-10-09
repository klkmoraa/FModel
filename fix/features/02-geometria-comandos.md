# Geometría, modelo y comandos CAD

## GEO-001 — Probar invariantes y geometría degenerada

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — precisión del núcleo CAD
- **Depende de:** TST-002
- **Bloquea:** ARC-001 en módulos geométricos

**Evidencia:** `src/geometry/invariants.test.ts` cubre las 6 invariantes geométricas fundamentales del CAD con casos degenerados explícitos y deterministas: (1) reversibilidad de transformaciones afines arbitrarias y protección de matrices singulares (escala 0) sin generar NaN ni Infinity; (2) simetría de intersecciones `intersect(A, B) == intersect(B, A)` y finitud asegurada ante segmentos de longitud cero y arcos tangentes; (3) offset nulo idéntico, doble offset compatible reversible dentro de `TOL.LINEAR`, colapso seguro de arcos (`null`) cuando el radio es negativo o nulo, y protección en segmentos de longitud cero; (4) división y recomposición de curvas conservando longitud y extremos exactos; (5) cajas envolventes (BBox) que contienen el 100% de los puntos muestreados a lo largo del dominio paramétrico de líneas, arcos y polilíneas; y (6) resolución de restricciones geométricas y dimensionales sin propagar jamás `NaN` o `Infinity` ante entradas degeneradas (segmentos colapsados) y detección explícita de restricciones incompatibles (`status === 'inconsistent'`). No se afirma cobertura property-based ni generación aleatoria: los casos son ejemplos fijos reducidos.

**Archivos previstos:**

- Crear: `src/geometry/invariants.test.ts`
- Ampliar: `src/geometry/geometry.test.ts`, `src/modify/modify.test.ts`, `src/constraints/solver.test.ts`
- Modificar solo si una prueba demuestra un defecto: módulos geométricos afectados

**Invariantes mínimas:**

- [x] Transformar y aplicar la inversa recupera puntos/curvas dentro de tolerancia.
- [x] Intersección es simétrica y no devuelve coordenadas no finitas.
- [x] Offset con distancia cero conserva geometría; doble offset compatible vuelve dentro de tolerancia.
- [x] Split + join conserva longitud y extremos.
- [x] BBox contiene todos los puntos muestreados de la curva.
- [x] Solver nunca devuelve `NaN`/`Infinity` y marca conflictos en restricciones incompatibles.

**Criterios de aceptación:**

- [x] Casos deterministas y reducidos legibles al fallar; no se declara property-based testing porque no forma parte de esta suite.
- [x] Segmentos de longitud cero, radios casi cero, arcos tangentes, matrices singulares y escalas extremas tienen comportamiento definido.
- [x] Los invariantes y defaults públicos de geometría usan `src/geometry/tolerance.ts`; las constantes numéricas internas restantes son específicas del algoritmo y no se presentan como tolerancias de contrato.

**Cierre:** 2026-09-19

**Verificación:** pruebas focalizadas de geometría, restricciones e invariantes (45 pruebas seleccionadas) y las puertas locales completas pasan; no se declara property-based testing.

---

## GEO-002 — Presupuesto de rendimiento para dibujos grandes

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — capacidad y fluidez
- **Depende de:** TST-002, PERF-001
- **Bloquea:** —

**Evidencia:** existen índice espacial y render por lotes, pero no hay benchmarks ni presupuestos versionados. La complejidad puede crecer en selección, snap, render, auditoría, bloques dinámicos y undo con documentos grandes.

**Avance 2026-09-23:** `DIVIDE`, `MEASURE` y la conversión de objeto de `REVCLOUD` reutilizan perfiles de longitud de spline/elipse y localizan cada marca mediante búsqueda binaria. `src/geometry/geometry.test.ts` pasó 53/53, `src/commands/behavior/draw.test.ts` pasó 23/23 y `pnpm typecheck` pasó. Aún faltan benchmarks y presupuestos versionados.

**Avance 2026-09-23:** `ARRAYPATH` limita a 100.000 las muestras de curva durante el teselado adaptativo; al exceder el tope falla antes de mover las entidades fuente. `arrayTransforms` precalcula las longitudes de los segmentos y recorre la ruta con un cursor. `src/model/kinds/insert.bounds.test.ts` pasó 6/6 y `pnpm typecheck` pasó. Los benchmarks y presupuestos siguen pendientes.

**Archivos previstos:**

- Crear: `src/perf/fixtures.ts`, `src/perf/core.bench.ts`
- Modificar: `package.json`, `.github/workflows/ci.yml`
- Modificar solo al demostrar cuellos: `src/spatial/spatialIndex.ts`, `src/snap/snapEngine.ts`, `src/render/*`, `src/audit/*`

**Escenarios:** 10k/50k/100k entidades simples, bloques anidados, hatch complejo, selección de ventana, zoom/pan, OSNAP, undo masivo, importación/exportación y reporte de salud.

**Criterios de aceptación:**

- [ ] Benchmarks deterministas guardan mediana y memoria aproximada.
- [ ] Se fijan presupuestos por operación y se documenta el hardware de referencia.
- [ ] CI detecta regresiones grandes sin fallar por ruido menor.
- [ ] Los resultados distinguen tiempo de cálculo, serialización de worker y render.

**Verificación:** `pnpm perf` y `pnpm verify`

---

## GEO-003 — Seleccionar líneas infinitas con cualquier magnitud de dirección

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-23
- **Cierre:** 2026-09-23 · commit `d0981f9`
- **Prioridad:** P2 — selección por captura incorrecta
- **Depende de:** GEO-001
- **Bloquea:** —

**Evidencia:** `selectInBox` aproximaba rayos y líneas infinitas con un segmento de longitud `1e9 * dirección`. El formato permite cualquier vector finito no nulo, por lo que una `XLINE` con dirección `(1e-12, 0)` se representaba con solo 0,001 unidades y no se seleccionaba al cruzar una ventana en `x=100`. La regresión falló antes del cambio y pasó después.

**Implementación:**

- [x] Resolver el cruce con una caja mediante intervalos sobre la dirección normalizada, respetando el sentido de los rayos.
- [x] Añadir regresión de selección de ventana para una `XLINE` con vector pequeño.

**Criterios de aceptación:**

- [x] Una línea infinita seleccionable cruza cajas lejanas sin depender de la magnitud almacenada en su vector de dirección.
- [x] Puerta general de cierre del backlog: `pnpm verify`.

**Evidencia de cierre:** la prueba falló antes del cambio (`[]` no incluía la XLINE) y `src/selection/selection.test.ts` pasó 12/12 después. `pnpm verify` pasó tras integrar `origin/main`: lint, tipos, capas (600 importaciones), catálogo, build y 851/851 pruebas.

---

## CMD-001 — Pruebas de comportamiento para comandos declarados “Disponibles”

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — el catálogo actual comprueba presencia más que recorrido completo
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Depende de:** TST-001, TST-002
- **Bloquea:** DOC-001

**Evidencia:**
1. `src/commands/behavior/harness.ts` (`CommandHarness`) ejecuta guiones sobre el intérprete y verifica snapshots, diffs semánticos y atomicidad.
2. `src/commands/behavior/evidence.ts` genera `COMMAND_EVIDENCE_REGISTRY` desde `src/audit/evidence.ts`; cada entrada conserva referencia, archivo, nombre y comando ejecutable.
3. Las suites especializadas cubren dibujo, modificación, anotación y gestión; `src/commands/draw.facade.test.ts` fija además la API pública de la fachada modular.
4. `src/app/features.test.ts` y `scripts/features-md.mjs` fallan si un comando declarado `available` no tiene un registro cuyo archivo, marcador y comando ejecutable existan.
   - `src/commands/behavior/draw.test.ts`: LINE, PLINE, CIRCLE, ARC, RECTANG, POINT, RAY, XLINE, POLYGON, ELLIPSE, con cobertura de creación, undo/redo atómico y cancelación sin residuos.
   - `src/commands/behavior/modify.test.ts`: ERASE, OOPS, MOVE, COPY, ROTATE, SCALE, MIRROR, FILLET, EXPLODE.
   - `src/commands/behavior/annotate.test.ts`: TEXT, MTEXT, DIMLINEAR, DIMALIGNED, MLEADER.
   - `src/commands/behavior/management.test.ts`: DIST, AREA, ID, LAYON, LAYOFF, AUDIT y recuperación ante comandos desconocidos.

**Archivos creados/modificados:**
- `src/commands/behavior/harness.ts`
- `src/commands/behavior/evidence.ts`
- `src/commands/behavior/draw.test.ts`
- `src/commands/behavior/modify.test.ts`
- `src/commands/behavior/annotate.test.ts`
- `src/commands/behavior/management.test.ts`

**Criterios de aceptación:**

- [x] Cada función “Disponible” tiene al menos una evidencia catalogada y ejecutable; los comandos mutables mantienen pruebas de comportamiento.
- [x] Los comandos mutables prueban atomicidad y undo/redo.
- [x] Los comandos interactivos prueban Esc/cancelación sin cambios residuales.

**Verificación:** `pnpm vitest run src/commands src/app/features.test.ts`, `pnpm check:features` y la suite completa (63 archivos/582 pruebas) pasan.


## ARC-002 — Muros y huecos arquitectónicos 2D

- [x] **Estado: Cerrado (núcleo 2D)** — 2026-10-03; responsable: Codex. CI real y capturas revisadas por el controlador: [ejecución 37022156512](https://github.com/klkmoraa/FModel/actions/runs/37022156512), 50/50 Chromium E2E y 966 pruebas; escritorio Día/Noche 1280×720 y teléfono 390×844 con preset/cancelación sin desbordamiento. Evidencia conservada en `walls-qa.md`; no supone paridad amplia con YQARCH.
- **Prioridad:** P2. ID ARC-002 para conservar ARC-001 histórico (división de módulos, categoría calidad).
- **Alcance:** WALL/MURO, WALLRECT/HABITACION, WALLCONVERT/CONVERTIRMURO, WALLDOOR/PUERTA y WALLWINDOW/VENTANA; pestaña y paleta Arquitectura, presets físicos y ayuda bilingüe.
- **Contrato:** entidades MLINE nativas de dos caras y tapas rectas; hueco geométrico con símbolos estándar; CommandApi y undo/redo atómico; sin nueva versión de archivo ni red.
- **Evidencia automática:** `src/geometry/walls.test.ts`, `src/commands/behavior/architecture.test.ts`, `src/io/architecture.test.ts`, catálogo BEH-ARCHITECTURE/GEO-WALLS/IO-ARCHITECTURE.
- **Guía:** [Muros y huecos](../../docs/arquitectura-muros.md). [Plan](../../docs/plans/2026-10-02-architecture-tools.md).
- **Cierre:** tipos/lint/capas/catálogo/pruebas/cobertura/build y navegador de esa CI aprobados; capturas reales de muros y ficha de marca actualizadas. Huecos no asociativos y demás límites documentados permanecen explícitos.

## ARC-003 — Componentes de construcción 2D y edición paramétrica

- [x] **Estado: Cerrado (14 familias 2D)** — inicio 2026-10-02; cierre 2026-10-03; responsable: Codex. Núcleo nativo y panel Arquitectura verificados; [CI 37097760918](https://github.com/klkmoraa/FModel/actions/runs/37097760918), 1100/1100 pruebas y 56/56 recorridos Chromium, incluidas seis rutas de componentes y 14 capturas Día/Noche/escritorio/teléfono revisadas por el controlador. [Ficha QA](../../docs/brandbook/components-qa.md). No implica paridad general con YQARCH ni el ciclo de vida de huecos asociados.
- **Prioridad:** P2. Alcance: las 14 familias de la especificación de construcción, comandos canónicos y `COMPONENTEDIT`; sin cambiar el formato nativo ni ampliar DWG.
- **Contrato:** constructores puros con curvas nativas, roles estables y máximo 2000 primitivas; argumentos dimensionales nativos/físicos, radianes internos y grados en comandos; grupos seleccionables y validación de pertenencia/metadatos antes de editar. Una confirmación corresponde a un paso de undo/redo.
- **Evidencia:** BEH-COMPONENTS, GEO-COMPONENTS, IO-COMPONENTS, UI-COMPONENTS y E2E-COMPONENTS; suites de catálogo/modelo adicionales. Seis recorridos reales (mm/m × Día/Noche; teléfono × Día/Noche) y 14 capturas originales aprobadas. Retícula, escalera curva y ventana editada sobreviven a formato nativo/DXF; DXF pierde parámetros y lo indica en el informe.
- **Guía:** [Componentes](../../docs/arquitectura-componentes.md). [Especificación](../../docs/superpowers/specs/2026-10-02-construction-components-design.md).
- **Cierre:** completado para las catorce familias 2D y su edición/panel nativos; no se amplía DWG ni se afirma paridad de otros módulos.

## ARC-004 — Ciclo de huecos asociados y espesor de muro

- [x] **Estado: Cerrado (muros rectos compatibles)** — 2026-10-03; [CI 37131723475](https://github.com/klkmoraa/FModel/actions/runs/37131723475): 1169/1169 pruebas y 60/60 recorridos Chromium, incluidos cuatro nuevos con píxeles de escena/overlay, y [seis capturas originales aprobadas](../../docs/brandbook/openings-qa.md).
- **Prioridad:** P2; dependencia ARC-002. `WALLDOOR`/`WALLWINDOW` generan grupos nativos asociados; `OPENINGMOVE`, `OPENINGCOPY`, `OPENINGEDIT`, `OPENINGMIRROR`, `OPENINGDELETE`, `WALLTHICKNESS` y alias españoles son comandos atómicos con vista previa de sustitución.
- **Límites:** sólo muros compatibles de dos caras ±0.5 y segmentos rectos. No redes T/X, recorte de columnas, curvas o huecos en esquinas; máximos de 500 vértices, 200 huecos y 2000 primitivas. El DXF pierde la asociación editable; no se infieren grupos legados incompletos.
- **Evidencia:** `src/geometry/wallOpenings.test.ts`, `src/model/wallAssembly.test.ts`, `src/commands/behavior/openingLifecycle.test.ts`, `src/render/openingPreview.test.ts`, `src/io/wallAssembly.test.ts`, `src/ui/panels/architecturePanel.test.ts`; recorrido `e2e/openingLifecycle.spec.ts` aprobado en CI real Día/Noche/escritorio/teléfono y seis capturas revisadas. Catálogo BEH/GEO/IO/UI/E2E-OPENINGS.
- **Guía:** [Muros y huecos](../../docs/arquitectura-muros.md), [diseño](../../docs/superpowers/specs/2026-10-02-opening-lifecycle-design.md).

## ARC-005 — Eje físico y muro paralelo por distancia libre

- [x] **Estado: Cerrado (dos resultados en muros rectos compatibles)** — 2026-10-04. [CI 37169139770](https://github.com/klkmoraa/FModel/actions/runs/37169139770): 1204 pruebas/119 archivos y 64 recorridos Chromium, incluidos cuatro de ARC-005 con aserciones de geometría, píxeles reales y foco telefónico; [seis originales aprobados](../../docs/brandbook/wall-utilities-qa.md) Día/Noche/escritorio/teléfono.
- **Alcance:** `WALLAXIS`/`EJEMURO` extrae el eje físico completo como polilínea independiente; `WALLOFFSET`/`PARALELAMURO` crea un muro paralelo vacío por distancia libre entre caras, con espesor y lado ajustables. El muro origen y sus huecos asociados permanecen intactos. No se registran WWA/WWO como alias.
- **Límites:** recorridos rectos compatibles de dos caras ±0.5; hasta 500 vértices para eje y 200 para paralelo. Sin redes T/X, ejes inferidos de líneas sueltas, curvas, recorte de columnas, huecos de esquina ni rellenos. No se amplía DWG. `.fmodel` conserva entidades/grupos y DXF conserva geometría estándar; la asociación de huecos del origen sigue perdiéndose con la advertencia existente.
- **Evidencia:** pruebas `src/geometry/wallUtilities.test.ts`, `src/commands/behavior/wallUtilities.test.ts`, `src/io/wallUtilities.test.ts`, `src/ui/panels/architecturePanel.test.ts`; `e2e/wallUtilities.spec.ts` aprobado en CI real con foco y píxeles de escena/overlay, seis originales y hashes revisados. Catálogo GEO/BEH/IO/UI/E2E-WALL-UTILITIES. Permanece un Minor del productor: sin regresión negativa separada de contención de anillo cerrado sin cruce; el código sí comprueba la condición.
- **Guía:** [Muros](../../docs/arquitectura-muros.md), [diseño](../../docs/superpowers/specs/2026-10-03-wall-utilities-design.md).


## ARC-006 — Relleno de material de muros y columnas nativas

- [x] **Estado: Cerrado (rellenos independientes)** — 2026-10-05. Fuente congelada en `9f556c1011d20e3232aba1ae7e80fcd066903335`, revisión fuente/spec/calidad aprobada; [CI 37254420973](https://github.com/klkmoraa/FModel/actions/runs/37254420973), job `111588362981`: **1297 pruebas/124 archivos y 68 recorridos Chromium**, incluidos cuatro nuevos escritorio/teléfono táctil × Día/Noche; [seis PNG originales aprobados con procedencia y SHA-256](../../docs/brandbook/wall-fill-qa.md).
- **Alcance:** `WALLFILL`/`RELLENARMUROS`; snapshots HATCH estándar Sólido/Rayado por fragmentos de muros compatibles y contornos mundiales de las cinco variantes de columna nativa. Deduplicación por origen, huecos/habitaciones vacíos, propiedades gráficas heredadas sin tags de identidad ni asociación futura; una confirmación/undo. WWF no es alias.
- **Límites:** máximo 100 orígenes, 5000 puntos de origen, 10000 vértices y 1000 HATCH; Rayado hasta 12000 líneas proyectadas, 10000 aristas teseladas y 2000000 productos línea×arista sumados. Defaults físicos 100 mm (0.1 m; sin unidad 100), ángulo 45°. Lote íntegro validado antes de escribir; Esc y cambios intercalados descartan. Sin relleno de símbolos, entidades sueltas, otros componentes, redes T/X ni ampliación de DWG/formato nativo.
- **Evidencia ejecutada:** catálogo BEH/GEO/IO/UI/E2E-WALL-FILL; geometría de material y runner, nativo/DXF con patrón de usuario real y círculo bulge, acciones bilingües y teléfono. Los cuatro recorridos de `e2e/wallFill.spec.ts` comprueban material `5730000 + 90000π`, deduplicación de varios miembros del mismo origen, invariantes de fuente, píxeles cuantitativos Sólido/Rayado y vacíos, foco telefónico, undo/redo y cancelación. El rayado se verifica después de retirar todo el Sólido; las seis capturas muestran geometría sólida y acciones, con revisión original del controlador.
- **Guía:** [Muros y relleno independiente](../../docs/arquitectura-muros.md). Se conservan el Minor previo de cobertura de contención de anillo cerrado sin cruce y el texto compartido del panel que atribuye columnas a Eje/Paralelo (éstos siguen siendo sólo para muros), diferidos a revisión final del plan maestro; las advertencias previas de build permanecen documentadas. Sin cambios en el productor aprobado. El cierre acredita sólo este resultado, no paridad general YQARCH ni cierre del plan maestro.


## ARC-007 — Limpieza reversible de encuentros de muros

- [x] **Estado: Cerrada** — alcance aceptado el 2026-10-07, Codex.
- **Alcance:** WALLCLEAN/WALLRESTORE: caras limpias en T/X y recorte contra columnas nativas, instantánea con recuperación de originales para editar. No actualización automática ni muros curvos.
- **Aceptación:** [CI 37628277682](https://github.com/klkmoraa/FModel/actions/runs/37628277682): 1325 pruebas/131 archivos en ejecución normal y cobertura, puertas estáticas, build público/guard de 189 archivos y 73 recorridos Chromium; los cuatro nuevos escritorio/teléfono Día/Noche pasaron. [Seis PNG originales y procedencia aprobados](../../docs/brandbook/wall-cleanup-qa.md). Fuente remota `ac8e21efde9cfe7865108c4a25b32340847aad92`, equivalente exacta a `dce61241a99618ce2c7e70770698a33b8fbf93a4`, árbol `8632c32210986f5762558273eab869669129afeb`.
- **Diseño:** [Limpieza reversible](../../docs/superpowers/specs/2026-10-05-wall-cleanup-design.md).
- **Resultado:** comandos reversibles, registros propios recíprocos por fragmento, recuperación Todos aunque se borren/desagrupen salidas, persistencia nativa y aviso DXF, guardas restaurar→editar→limpiar y acceso real ES/EN en cinta/paleta/Arquitectura. Se conservan fuentes editadas y salidas modificadas/ambiguas; no se sobrescriben ediciones. CI prueba preview/cancel/cleanup/restore/undo y foco nativo en teléfono. Sin paridad general YQARCH: redes automáticas/nuevos vecinos, curvas, huecos de esquina, líneas sueltas y demás módulos maestros siguen pendientes.
- **Publicación:** ruta B delegada de REL-001 excluye el lector DWG experimental del artefacto público real; nativo/DXF públicos, lector por defecto conservado en desarrollo y sin cambio de licencia. [QA de artefacto y smoke público](../../docs/brandbook/public-formats-qa.md). Cierre profesional/legal completo de REL-001 pendiente. Publicación de Pages pendiente hasta confirmación del controlador, que conserva la puerta CI del árbol final.

## ARC-008 — Cuadro de huecos asociados

- [x] **Estado: Cerrado (tabla independiente por tipo/ancho)** — 2026-10-08; Codex, sin agentes por petición del usuario.
- **Alcance implementado:** `OPENINGSCHEDULE` / `CUADROHUECOS`; tabla editable por tipo/ancho/cantidad del espacio actual, claves P/V/H y medidas en unidades del dibujo. Muros asociados validados y deduplicados; máximo 100 muros/1000 huecos. Panel, cinta y paleta ES/EN; preview sin mutación, cancelación, snapshot vigente y undo/redo atómico de tabla/estilo.
- **Evidencia local:** siete pruebas nuevas de comando e interfaz, veinte regresiones existentes del ciclo de huecos; nativo/DXF, tipos, lint focalizado, capas, catálogo y compilación pública sin DWG. No se ejecutaron suite completa ni cobertura locales por petición del usuario.
- **Evidencia visual:** [CI 37834084772](https://github.com/klkmoraa/FModel/actions/runs/37834084772) pasó; [cuatro originales revisados](../../docs/brandbook/opening-schedule-qa.md), escritorio/teléfono Día/Noche. Chromium se ejecutó en CI; no localmente. Disponible en este alcance. Sin alturas inferidas, actualización automática, bloques ni clasificación de huecos corredizos como puerta/ventana.
- **Diseño y registro:** [ARC-008](../../docs/plans/2026-10-08-opening-schedule.md). No cierra el módulo maestro de estadísticas ni paridad YQARCH.

## ARC-009 — Exportar cuadros y tablas a CSV

- [x] **Estado: Cerrado (CSV de tablas nativas)** — 2026-10-08; Codex, sin agentes.
- **Alcance:** `TABLECSV` / `EXPORTARTABLACSV`; CSV del texto actual de cualquier tabla nativa mediante guardado/descarga existente. UTF-8/BOM, comillas/saltos escapados, celdas cubiertas vacías y prefijos de fórmula neutralizados. Máximo 2002 filas, 200 columnas y 2 millones de caracteres. No modifica el dibujo ni recalcula huecos.
- **Evidencia local:** seis pruebas nuevas de CSV (salida, texto, límites, éxito/cancelación/error real de escritura); las trece pruebas focalizadas del bloque pasan. Acceso ES/EN desde panel/cinta/paleta ampliado; tipos/lint/capas/catálogo/build público focalizados.
- **Evidencia visual y descarga:** [CI 37834084772](https://github.com/klkmoraa/FModel/actions/runs/37834084772), dos recorridos nuevos aprobados y [cuatro capturas originales revisadas](../../docs/brandbook/opening-schedule-qa.md), escritorio/teléfono Día/Noche. Disponible en este alcance.
- **CI previa:** [37828626031](https://github.com/klkmoraa/FModel/actions/runs/37828626031) pasó para ARC-008 en `06f338cc`; no se atribuye al CSV nuevo.
- **Diseño y registro:** [Cuadro y CSV](../../docs/plans/2026-10-08-opening-schedule.md). Continúa el módulo 5; no lo declara completo.

## ARC-010 — Etiquetas y cuadro de huecos automáticos

- [x] **Estado: Cerrado** — 2026-10-08; Codex.
- **Alcance aprobado:** etiquetas P/V/H por hueco y cuadro vinculado por tipo/ancho/cantidad, actualizados en una transacción; guardar/reabrir en nativo v5; copias independientes y DXF conservan contenido visible.
- **Diseño/plan:** `docs/superpowers/specs/2026-10-08-opening-annotations-design.md`, `docs/superpowers/plans/2026-10-08-opening-annotations.md`.
- **Evidencia:** 15 pruebas de asociaciones/comando, 5 de cuadro, 47 de nativo y 2 de acceso aprobadas; tipos, lint focalizado, capas, catálogo y build público aprobados. Un recorrido real Chromium de actualización/undo/cancelación y capturas Día/Noche inspeccionadas: `docs/brandbook/opening-annotations-qa.md`. Revisión independiente, con correcciones de bloques, capas/estilos y reparación nativa. Sin suite completa ni cobertura. Commit y push autorizados posteriormente por el usuario.
