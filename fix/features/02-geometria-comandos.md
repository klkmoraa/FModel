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

- [>] **Estado: En curso** — 2026-10-04. Implementación nativa y pruebas locales; falta revisión de código, CI real y aprobación del controlador sobre originales de Chromium Día/Noche/escritorio/teléfono.
- **Alcance:** `WALLAXIS`/`EJEMURO` extrae el eje físico completo como polilínea independiente; `WALLOFFSET`/`PARALELAMURO` crea un muro paralelo vacío por distancia libre entre caras, con espesor y lado ajustables. El muro origen y sus huecos asociados permanecen intactos. No se registran WWA/WWO como alias.
- **Límites:** recorridos rectos compatibles de dos caras ±0.5; hasta 500 vértices para eje y 200 para paralelo. Sin redes T/X, ejes inferidos de líneas sueltas, curvas, recorte de columnas, huecos de esquina ni rellenos. No se amplía DWG. `.fmodel` conserva entidades/grupos y DXF conserva geometría estándar; la asociación de huecos del origen sigue perdiéndose con la advertencia existente.
- **Evidencia provisional:** pruebas `src/geometry/wallUtilities.test.ts`, `src/commands/behavior/wallUtilities.test.ts`, `src/io/wallUtilities.test.ts`, `src/ui/panels/architecturePanel.test.ts`; recorrido `e2e/wallUtilities.spec.ts` pendiente de CI y revisión visual. Catálogo GEO/BEH/IO/UI/E2E-WALL-UTILITIES.
- **Guía:** [Muros](../../docs/arquitectura-muros.md), [diseño](../../docs/superpowers/specs/2026-10-03-wall-utilities-design.md).
