# Calidad, arquitectura y pruebas

## TST-001 — Cubrir recorridos críticos en un navegador real

- [>] **Estado:** En curso
- **Responsable:** Codex · **Inicio:** 2026-09-18
- **Prioridad:** P1 — los fallos de integración más peligrosos hoy no se ejecutan
- **Depende de:** DAT-001, DAT-002, DAT-003
- **Bloquea:** UI-001, UI-002, CMD-001

**Evidencia:** `e2e/criticalJourneys.spec.ts` contiene cinco recorridos black-box en Chromium: crear/dibujar/undo/redo/guardar/reabrir con selección de archivo, importar/exportar DXF con archivo real, cancelar Guardar como y observar el aviso de cambios, favoritos y resize de docks por teclado, y auditoría axe de las superficies observables. No usa `window.fmodel`, `doc.transact()`, `page.evaluate()` ni APIs internas del modelo.

**Archivos previstos:**

- Crear: `e2e/`, `playwright.config.ts`
- Modificar: `package.json`, `.github/workflows/ci.yml`
- Añadir fixtures mínimos generados por código, no binarios grandes duplicados

**Recorridos verificados en esta corrección:**

- [x] Crear → dibujar → undo/redo → guardar → reabrir.
- [x] Cancelar Guardar como con cambios y comprobar aviso al cerrar/nuevo.
- [ ] Copiar bloque/imagen/texto entre dibujos y reabrir el resultado (pendiente de journey black-box dedicado).
- [x] Importar/exportar DXF y mostrar informe.
- [ ] Crear layout → vista previa → PDF/SVG (pendiente de journey black-box dedicado).
- [ ] Autoguardado → simular cierre no limpio → recuperar (pendiente de journey black-box dedicado).
- [ ] Actualización de service worker sin perder dibujo abierto (pendiente de journey black-box dedicado).
- [x] Navegación principal solo con teclado.

**Criterios de aceptación:**

- [x] Chromium estable corre en cada PR; WebKit se ejecuta en main mediante el workflow.
- [x] Las pruebas no dependen de sleeps arbitrarios ni de diálogos nativos imposibles de controlar.
- [x] Capturas/trazas se conservan solo al fallar.
- [x] Los recorridos P1 forman parte de la puerta de despliegue.

**Verificación:** `pnpm test:e2e` (5/5 pruebas Chromium, sin APIs internas ni sleeps arbitrarios); las puertas locales de lint, tipos, capas, features, Vitest, cobertura y build pasan. Los cuatro journeys históricos aún no implementados mantienen TST-001 abierta para no inventar evidencia.

La evidencia histórica de otros recorridos no se reutiliza como cierre: esta tarea permanece en curso hasta implementar y ejecutar de nuevo los journeys pendientes mediante UI observable.

---

## TST-002 — Medir cobertura y fijar umbrales

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — no se conocen huecos por líneas/ramas
- **Depende de:** —
- **Bloquea:** GEO-001, GEO-002, ARC-001, CMD-001

**Evidencia:** Se instaló `@vitest/coverage-v8`, se configuró texto y LCOV (`coverage/lcov.info`), y CI ejecuta `pnpm test:coverage`. `vite.config.ts` conserva umbrales globales y umbrales específicos para Documento, Persistencia, Geometría y `src/io/native*`, de modo que el formato nativo también bloquea regresiones.

**Archivos previstos:**

- Modificar: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, CI
- Crear: política de cobertura en este documento o `docs/testing.md`

**Implementación:**

- [x] Instalar el proveedor compatible con Vitest 5 y generar reporte texto/LCOV.
- [x] Registrar línea base por subsistema, excluyendo solo código generado/fixtures justificados.
- [x] Empezar con umbral que no obligue a pruebas vacías y exigir no retroceder.
- [x] Definir mínimos más altos para documento, persistencia, formato nativo y geometría.

**Criterios de aceptación:**

- [x] Cobertura corre local y en CI con configuración idéntica.
- [x] Todo `/* ignore */` incluye justificación.
- [x] La tarea publica línea base y meta incremental por categoría.

**Cierre:** 2026-09-19

**Verificación:** `pnpm test:coverage` (63 archivos y 582 pruebas, superando todos los umbrales y generando `coverage/lcov.info`) y CI incluye el mismo comando.

---

## CI-001 — Unificar toolchain, lint y verificación local

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity
- **Inicio:** 2026-09-19
- **Cierre:** 2026-09-19
- **Prioridad:** P2 — reproducibilidad
- **Depende de:** —
- **Bloquea:** REL-002

**Evidencia:** Node 24 se declara en `package.json` y setup-node. `package.json` con `packageManager: pnpm@11.25.0` es la única fuente de versión de pnpm: `ci.yml` y `deploy-pages.yml` usan `pnpm/action-setup@v4` sin una versión duplicada. CI ejecuta lint, tipos, capas, features, suite, cobertura, build y E2E; `pnpm verify` integra la puerta local.

**Archivos modificados:**
- `package.json`
- `.github/workflows/deploy-pages.yml`
- `README.md`
- `src/commands/modify.ts`, `src/geometry/spline.ts`, `src/geometry/linalg.ts`, `src/constraints/solver.ts`, `src/model/dimension.ts`, `src/layers/layerOps.ts`, `src/commands/draw.ts`, `src/document/colors.ts`, `src/ui/DynamicInput.tsx`, `src/commands/runner.ts`, `src/xref/xref.ts`, `src/blocks/blockOps.ts`, `src/blocks/dynamic.ts`, `src/blocks/dynamicProperties.ts`, `src/io/clipboard.ts`, `scripts/build-cc0-library.mjs`, `src/commands/file.test.ts`

**Criterios de aceptación:**

- [x] `packageManager` selecciona la misma versión local y ambos workflows no duplican la versión de pnpm.
- [x] `pnpm verify` reproduce todo lo requerido para integrar/desplegar incluyendo lint.
- [x] Lint termina sin advertencias con `--deny-warnings`.

**Cierre:** 2026-09-19

**Verificación:** puertas locales completas ejecutadas: lint, typecheck, layers, features, test (63 archivos/582 pruebas), coverage, build y E2E; todos pasan.

---

## ARC-001 — Dividir módulos monolíticos con pruebas de caracterización

- [x] **Estado:** Cerrada
- **Prioridad:** P3 — mantenibilidad y revisión segura
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Depende de:** TST-002
- **Bloquea:** —

**Evidencia:**
1. Descomposición por responsabilidades del subsistema monolítico `src/commands/draw.ts` (1,548 líneas) en submódulos especializados de alta cohesión sin cambiar contratos ni dependencias de capa:
   - `src/commands/draw/curves.ts`: Comandos de curvas y geometría básica (`LINE`, `PLINE`, `CIRCLE`, `ARC`, `RECTANG`, `POLYGON`, `ELLIPSE`, `SPLINE`, `DONUT`) y helper de vértices paramétricos de rectángulo (`rectangleVertices`).
   - `src/commands/draw/construction.ts`: Comandos de construcción y división geométrica (`POINT`, `RAY`, `XLINE`, `REVCLOUD`, `DIVIDE`, `MEASURE`) y helper de abombamiento de nubes (`revcloudVertices`).
   - `src/commands/draw/annotation.ts`: Comandos de texto y tablas (`TEXT`, `MTEXT`, `MLEADER`, `TABLE`).
   - `src/commands/draw/areas.ts`: Comandos de delimitación y relleno (`MLINE`, `WIPEOUT`, `HATCH`, `BOUNDARY`, `REGION`) y helpers de contornos (`closedLoopOf`, `hatchDefaults`).
   - `src/commands/draw/shared.ts`: Utilidades geométricas compartidas entre familias (`nearestCurve`, `arcEntityFrom`).
   - `src/commands/draw.ts`: Fachada modular que preserva 100% de la API pública existente (`DRAW_COMMANDS`, `nearestCurve`, `rectangleVertices`, `revcloudVertices`, `closedLoopOf`, `hatchDefaults` y comandos individuales), garantizando compatibilidad total con consumidores externos (`src/commands/index.ts`, `src/ui/panels/ToolPalettesPanel.tsx`, `src/ui/panels/propertyDefs.ts`).
2. Pruebas de caracterización fortalecidas en `src/commands/behavior/draw.test.ts` con cobertura de `LINE`, `PLINE`, `CIRCLE`, `ARC`, `RECTANG`, `POINT`, `RAY`, `XLINE`, `POLYGON`, `ELLIPSE`, `DONUT`, `REVCLOUD`, y `REGION`. Las 10 pruebas de caracterización pasan al 100%.
3. `src/commands/draw.facade.test.ts` fija la API pública de la fachada (`DRAW_COMMANDS`, categorías, comandos y helpers) y pasa junto con la suite completa.

**Archivos creados/modificados:**
- Creados: `src/commands/draw/curves.ts`, `src/commands/draw/construction.ts`, `src/commands/draw/annotation.ts`, `src/commands/draw/areas.ts`, `src/commands/draw/shared.ts`
- Modificados: `src/commands/draw.ts`, `src/commands/behavior/draw.test.ts`, `src/commands/behavior/harness.ts`, `src/commands/behavior/management.test.ts`, `src/blocks/cc0Library.test.ts`, `src/workers/client.test.ts`

**Criterios de aceptación:**

- [x] Cada lote conserva API pública y comportamiento con pruebas antes del movimiento.
- [x] No se introducen dependencias ascendentes; `check:layers` sigue verde.
- [x] El objetivo es responsabilidad clara, no un límite de líneas artificial.
- [x] Cada PR puede revertirse de forma independiente.

**Verificación:** lint, typecheck, layers, features, test (63 archivos/582 pruebas), coverage, build y `pnpm test:e2e` (5/5) pasan; la API pública queda cubierta por la prueba de caracterización.

---

## SEC-001 — Retirar superficies de depuración de producción

- [ ] **Estado:** Abierta
- **Prioridad:** P3 — endurecimiento de entrega
- **Depende de:** REL-002
- **Bloquea:** —

**Evidencia:** `src/main.tsx:59-60` expone `{ editor, doc }` como `globalThis.fmodel` en todos los builds. Los source maps completos también se publican; su política se cubre en PERF-002.

**Archivos previstos:**

- Modificar: `src/main.tsx`, `vite.config.ts`
- Crear: prueba de build/smoke que confirme ausencia en producción

**Criterios de aceptación:**

- [ ] La API global existe solo en desarrollo o detrás de un flag de diagnóstico explícito.
- [ ] Producción no permite mutar el documento desde una interfaz global no documentada.
- [ ] Las herramientas de desarrollo siguen disponibles localmente.

**Verificación:** `pnpm build`, buscar `globalThis.fmodel` en `dist`, y smoke E2E
