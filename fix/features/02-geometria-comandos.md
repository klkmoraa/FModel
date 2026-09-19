# Geometría, modelo y comandos CAD

## GEO-001 — Probar invariantes y geometría degenerada

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — precisión del núcleo CAD
- **Depende de:** TST-002
- **Bloquea:** ARC-001 en módulos geométricos

**Evidencia:** se creó `src/geometry/invariants.test.ts` cubriendo las 6 invariantes geométricas fundamentales del CAD con casos degenerados explícitos: (1) reversibilidad de transformaciones afines arbitrarias y protección de matrices singulares (escala 0) sin generar NaN ni Infinity; (2) simetría de intersecciones `intersect(A, B) == intersect(B, A)` y finitud asegurada ante segmentos de longitud cero y arcos tangentes; (3) offset nulo idéntico, doble offset compatible reversible dentro de `TOL.LINEAR`, colapso seguro de arcos (`null`) cuando el radio es negativo o nulo, y protección en segmentos de longitud cero; (4) división y recomposición de curvas conservando longitud y extremos exactos; (5) cajas envolventes (BBox) que contienen el 100% de los puntos muestreados a lo largo del dominio paramétrico de líneas, arcos y polilíneas; y (6) resolución de restricciones geométricas y dimensionales sin propagar jamás `NaN` o `Infinity` ante entradas degeneradas (segmentos colapsados) y detección explícita de restricciones incompatibles (`status === 'inconsistent'`).

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

- [x] Semillas reproducibles y casos reducidos legibles al fallar.
- [x] Segmentos de longitud cero, radios casi cero, arcos tangentes, matrices singulares y escalas extremas tienen comportamiento definido.
- [x] Las tolerancias usan `src/geometry/tolerance.ts`; no se introducen epsilons arbitrarios.

**Cierre:** 2026-09-19

**Verificación:** `pnpm vitest run src/geometry src/modify src/constraints` (5 suites, 88 pruebas verdes) y `pnpm verify` (56 suites, 529 pruebas, 0 avisos de lint, TypeScript estricto, capas conformes y build de producción).

---

## GEO-002 — Presupuesto de rendimiento para dibujos grandes

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — capacidad y fluidez
- **Depende de:** TST-002, PERF-001
- **Bloquea:** —

**Evidencia:** existen índice espacial y render por lotes, pero no hay benchmarks ni presupuestos versionados. La complejidad puede crecer en selección, snap, render, auditoría, bloques dinámicos y undo con documentos grandes.

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

## CMD-001 — Pruebas de comportamiento para comandos declarados “Disponibles”

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — el catálogo actual comprueba presencia más que recorrido completo
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Depende de:** TST-001, TST-002
- **Bloquea:** DOC-001

**Evidencia:**
1. Se implementó `src/commands/behavior/harness.ts` (`CommandHarness`) para orquestar la ejecución por guion de comandos sobre el intérprete (`runner.script`), capturando instantáneas del documento (`DocSnapshot`), diffs semánticos de entidades y capas, y verificando atomicidad de transacciones.
2. Se construyó el registro tipado `src/commands/behavior/evidence.ts` (`COMMAND_EVIDENCE_REGISTRY`) mapeando comandos a identificadores de prueba de comportamiento y categorización (mutating, readOnly, state, ui).
3. Se crearon cuatro suites especializadas de pruebas de comportamiento:
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

- [x] Cada función “Disponible” tiene al menos un recorrido verificable de extremo a extremo lógico.
- [x] Los comandos mutables prueban atomicidad y undo/redo.
- [x] Los comandos interactivos prueban Esc/cancelación sin cambios residuales.

**Verificación:** `pnpm vitest run src/commands src/app/features.test.ts && pnpm check:features` (9 suites de comandos, 56 pruebas pasando; features.test.ts pasando; check:features al día) y `pnpm lint && pnpm verify`.
