# Calidad, arquitectura y pruebas

## TST-001 — Cubrir recorridos críticos en un navegador real

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-18 · **Cierre:** 2026-09-18
- **Reapertura:** 2026-09-18 · **Responsable:** Codex · **Cierre de seguimiento:** 2026-09-18
- **Prioridad:** P1 — los fallos de integración más peligrosos hoy no se ejecutan
- **Depende de:** DAT-001, DAT-002, DAT-003
- **Bloquea:** UI-001, UI-002, CMD-001

**Evidencia:** las 316 pruebas unitarias se ejecutaban en Node sin suite E2E. Se implementó Playwright con 8 recorridos críticos en navegador real cubriendo selector/descarga de archivos, IndexedDB real, portapapeles cross-drawing, canvas, teclado, service worker y layouts/plot.

**Archivos previstos:**

- Crear: `e2e/`, `playwright.config.ts`
- Modificar: `package.json`, `.github/workflows/ci.yml`
- Añadir fixtures mínimos generados por código, no binarios grandes duplicados

**Recorridos obligatorios:**

- [x] Crear → dibujar → undo/redo → guardar → reabrir.
- [x] Cancelar Guardar como con cambios y comprobar aviso al cerrar/nuevo.
- [x] Copiar bloque/imagen/texto entre dibujos y reabrir el resultado.
- [x] Importar/exportar DXF y mostrar informe.
- [x] Crear layout → vista previa → PDF/SVG.
- [x] Autoguardado → simular cierre no limpio → recuperar.
- [x] Actualización de service worker sin perder dibujo abierto.
- [x] Navegación principal solo con teclado.

**Criterios de aceptación:**

- [x] Chromium estable corre en cada PR; WebKit se ejecuta al menos en main o job programado.
- [x] Las pruebas no dependen de sleeps arbitrarios ni de diálogos nativos imposibles de controlar.
- [x] Capturas/trazas se conservan solo al fallar.
- [x] Los recorridos P1 forman parte de la puerta de despliegue.

**Verificación:** `pnpm test:e2e && pnpm lint && pnpm verify` (8 pruebas en navegador real pasan en 3.6s, cubriendo roundtrip completo de bloque, imagen con asset y texto, además de protección de dibujo sucio ante UPDATEAPP y soporte de WebKit para CI).

**Seguimiento 2026-09-18:** commit `929fe7b`. `UPDATEAPP` cancela la recarga y muestra un aviso bilingüe cuando el autoguardado devuelve `false`. El E2E falló primero porque ejecutaba el callback y luego pasó tras reconstruir `dist`; Chromium y WebKit cerraron 16/16, y `pnpm lint && pnpm verify` pasó con 50 archivos/404 pruebas, capas, documentación, tipos y build correctos (avisos de lint preexistentes).

---

## TST-002 — Medir cobertura y fijar umbrales

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — no se conocen huecos por líneas/ramas
- **Depende de:** —
- **Bloquea:** GEO-001, GEO-002, ARC-001, CMD-001

**Evidencia:** Se instaló `@vitest/coverage-v8` compatible con Vitest 5.0.1, se configuró la generación de informes texto y LCOV (`coverage/lcov.info`) en `vite.config.ts`, y se creó el script `pnpm test:coverage`. Se excluyeron de forma justificada archivos de pruebas, tipos `.d.ts`, CSS y el entrypoint de React del DOM (`main.tsx`). Se documentó la línea base completa por subsistema y la política de umbrales en `docs/testing.md`. Se fijaron umbrales globales mínimos (48% líneas, 45% sentencias, 34% ramas, 34% funciones) y umbrales específicos más estrictos para subsistemas críticos: Documento (>= 85% líneas, 80% sentencias), Persistencia (>= 70% líneas, 70% sentencias) y Geometría (>= 65% líneas, 65% sentencias).

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

**Verificación:** `pnpm test:coverage` (ejecuta 55 suites y 515 pruebas, superando todos los umbrales configurados y generando LCOV) y `pnpm verify` (55 suites, 515 pruebas, 0 advertencias de lint, TypeScript estricto, capas conformes y build de producción).

---

## CI-001 — Unificar toolchain, lint y verificación local

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity
- **Inicio:** 2026-09-19
- **Cierre:** 2026-09-19
- **Prioridad:** P2 — reproducibilidad
- **Depende de:** —
- **Bloquea:** REL-002

**Evidencia:** Se unificó la toolchain en Node 24 (`package.json`, `README.md`, `ci.yml`, `deploy-pages.yml`) y pnpm 11 (`packageManager: pnpm@11.25.0`, `ci.yml` y `deploy-pages.yml`). Se eliminaron todas las advertencias de Oxlint en el código de producción y scripts (0 warnings, 0 errors). Se configuró `oxlint --deny-warnings src` en `pnpm lint` para bloquear advertencias nuevas en local y CI. Se integró `pnpm lint` directamente en `pnpm verify` como puerta única y reproducible.

**Archivos modificados:**
- `package.json`
- `.github/workflows/deploy-pages.yml`
- `README.md`
- `src/commands/modify.ts`, `src/geometry/spline.ts`, `src/geometry/linalg.ts`, `src/constraints/solver.ts`, `src/model/dimension.ts`, `src/layers/layerOps.ts`, `src/commands/draw.ts`, `src/document/colors.ts`, `src/ui/DynamicInput.tsx`, `src/commands/runner.ts`, `src/xref/xref.ts`, `src/blocks/blockOps.ts`, `src/blocks/dynamic.ts`, `src/blocks/dynamicProperties.ts`, `src/io/clipboard.ts`, `scripts/build-cc0-library.mjs`, `src/commands/file.test.ts`

**Criterios de aceptación:**

- [x] `corepack`/pnpm selecciona la misma versión local y en ambos workflows (pnpm 11).
- [x] `pnpm verify` reproduce todo lo requerido para integrar/desplegar incluyendo lint.
- [x] Lint termina sin advertencias con `--deny-warnings`.

**Cierre:** 2026-09-19

**Verificación:** `pnpm lint && pnpm verify` (0 warnings, 0 errors en oxlint, tsc estricto sin errores, 552 importaciones en capas, features al día, 54 archivos / 505 pruebas vitest pasando, build de producción exitoso).

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
3. Verificación exhaustiva: `pnpm lint` (0 warnings, 0 errors con `--deny-warnings`), `pnpm check:layers` (567 importaciones válidas sin violaciones de capa), `pnpm check:features` (docs sincronizados), `pnpm test` (61 archivos / 571 pruebas vitest pasando), `pnpm build` (build de producción completado en ~1.5s), y `pnpm test:e2e` (9/9 recorridos críticos de Playwright pasando).

**Archivos creados/modificados:**
- Creados: `src/commands/draw/curves.ts`, `src/commands/draw/construction.ts`, `src/commands/draw/annotation.ts`, `src/commands/draw/areas.ts`, `src/commands/draw/shared.ts`
- Modificados: `src/commands/draw.ts`, `src/commands/behavior/draw.test.ts`, `src/commands/behavior/harness.ts`, `src/commands/behavior/management.test.ts`, `src/blocks/cc0Library.test.ts`, `src/workers/client.test.ts`

**Criterios de aceptación:**

- [x] Cada lote conserva API pública y comportamiento con pruebas antes del movimiento.
- [x] No se introducen dependencias ascendentes; `check:layers` sigue verde.
- [x] El objetivo es responsabilidad clara, no un límite de líneas artificial.
- [x] Cada PR puede revertirse de forma independiente.

**Verificación:** `pnpm lint && pnpm verify && pnpm test:e2e` (0 advertencias oxlint, 567 importaciones de capas correctas, 61/61 suites vitest con 571 pruebas pasando, build en 1.58s, 9/9 recorridos E2E Playwright pasando).

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
