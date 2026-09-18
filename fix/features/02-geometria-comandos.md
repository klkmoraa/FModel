# Geometría, modelo y comandos CAD

## GEO-001 — Probar invariantes y geometría degenerada

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — precisión del núcleo CAD
- **Depende de:** TST-002
- **Bloquea:** ARC-001 en módulos geométricos

**Evidencia:** el núcleo tiene buena cobertura de ejemplos, pero no existe medición de ramas ni pruebas generativas. Hay rutas sensibles a longitud cero, matrices singulares y divisiones por longitud en `geometry/`, `modify/curveEdit.ts`, `model/kinds/basic.ts` y `constraints/solver.ts`.

**Archivos previstos:**

- Crear: `src/geometry/invariants.test.ts`
- Ampliar: `src/geometry/geometry.test.ts`, `src/modify/modify.test.ts`, `src/constraints/solver.test.ts`
- Modificar solo si una prueba demuestra un defecto: módulos geométricos afectados

**Invariantes mínimas:**

- [ ] Transformar y aplicar la inversa recupera puntos/curvas dentro de tolerancia.
- [ ] Intersección es simétrica y no devuelve coordenadas no finitas.
- [ ] Offset con distancia cero conserva geometría; doble offset compatible vuelve dentro de tolerancia.
- [ ] Split + join conserva longitud y extremos.
- [ ] BBox contiene todos los puntos muestreados de la curva.
- [ ] Solver nunca devuelve `NaN`/`Infinity` y marca conflictos en restricciones incompatibles.

**Criterios de aceptación:**

- [ ] Semillas reproducibles y casos reducidos legibles al fallar.
- [ ] Segmentos de longitud cero, radios casi cero, arcos tangentes, matrices singulares y escalas extremas tienen comportamiento definido.
- [ ] Las tolerancias usan `src/geometry/tolerance.ts`; no se introducen epsilons arbitrarios.

**Verificación:** `pnpm vitest run src/geometry src/modify src/constraints && pnpm verify`

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

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — el catálogo actual comprueba presencia más que recorrido completo
- **Depende de:** TST-001, TST-002
- **Bloquea:** DOC-001

**Evidencia:** `src/app/features.test.ts` y `src/commands/commands.test.ts` validan registro, alias y cableado, pero muchos de los 236 comandos no tienen una prueba de flujo con entradas, cambio documental, undo/redo y cancelación.

**Archivos previstos:**

- Crear: `src/commands/behavior/` con pruebas por categoría
- Modificar: `src/app/features.ts` para enlazar evidencia automatizada si resulta útil
- Modificar: `scripts/features-md.mjs` para exponer nivel de evidencia

**Implementación:**

- [ ] Inventariar comandos por categoría y asignar una prueba de éxito, cancelación y undo cuando muten datos.
- [ ] Priorizar archivo, dibujo básico, modificar, capas, anotación, layouts y salida.
- [ ] Añadir una comprobación que impida marcar una función “Disponible” sin evidencia mínima definida.

**Criterios de aceptación:**

- [ ] Cada función “Disponible” tiene al menos un recorrido verificable de extremo a extremo lógico.
- [ ] Los comandos mutables prueban atomicidad y undo/redo.
- [ ] Los comandos interactivos prueban Esc/cancelación sin cambios residuales.

**Verificación:** `pnpm vitest run src/commands src/app/features.test.ts && pnpm check:features`
