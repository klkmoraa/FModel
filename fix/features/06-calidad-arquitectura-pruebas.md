# Calidad, arquitectura y pruebas

## TST-001 — Cubrir recorridos críticos en un navegador real

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-18 · **Cierre:** 2026-09-18
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

---

## TST-002 — Medir cobertura y fijar umbrales

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — no se conocen huecos por líneas/ramas
- **Depende de:** —
- **Bloquea:** GEO-001, GEO-002, ARC-001, CMD-001

**Evidencia:** `vitest --coverage` falla porque no está instalado `@vitest/coverage-v8`. El conteo de pruebas no permite saber qué ramas de 43k líneas están sin ejecutar.

**Archivos previstos:**

- Modificar: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, CI
- Crear: política de cobertura en este documento o `docs/testing.md`

**Implementación:**

- [ ] Instalar el proveedor compatible con Vitest 5 y generar reporte texto/LCOV.
- [ ] Registrar línea base por subsistema, excluyendo solo código generado/fixtures justificados.
- [ ] Empezar con umbral que no obligue a pruebas vacías y exigir no retroceder.
- [ ] Definir mínimos más altos para documento, persistencia, formato nativo y geometría.

**Criterios de aceptación:**

- [ ] Cobertura corre local y en CI con configuración idéntica.
- [ ] Todo `/* ignore */` incluye justificación.
- [ ] La tarea publica línea base y meta incremental por categoría.

**Verificación:** `pnpm test:coverage`

---

## CI-001 — Unificar toolchain, lint y verificación local

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — reproducibilidad
- **Depende de:** —
- **Bloquea:** REL-002

**Evidencia:** CI usa pnpm 11 y Pages pnpm 10; `package.json` no declara `packageManager`; `verify` omite `lint`; README mezcla Node 24, `>=22.13` y `>=23.6`. El lint actual deja 24 advertencias.

**Archivos previstos:**

- Modificar: `package.json`, `pnpm-lock.yaml`, workflows, `README.md`
- Modificar: los archivos que originan las 24 advertencias actuales

**Implementación:**

- [ ] Fijar versiones únicas de Node y pnpm en `engines`, `packageManager`, CI y documentación.
- [ ] Incluir lint en `pnpm verify` y ejecutar una sola puerta reproducible.
- [ ] Resolver advertencias existentes y configurar cero advertencias para código nuevo.
- [ ] Añadir `pnpm audit --prod` o revisión equivalente con política documentada.

**Criterios de aceptación:**

- [ ] `corepack`/pnpm selecciona la misma versión local y en ambos workflows.
- [ ] `pnpm verify` reproduce todo lo requerido para integrar/desplegar.
- [ ] Lint termina sin advertencias.

**Verificación:** `pnpm install --frozen-lockfile && pnpm verify`

---

## ARC-001 — Dividir módulos monolíticos con pruebas de caracterización

- [ ] **Estado:** Abierta
- **Prioridad:** P3 — mantenibilidad y revisión segura
- **Depende de:** TST-002
- **Bloquea:** —

**Evidencia:** varios archivos superan 800–1,500 líneas y mezclan familias de comportamiento: `commands/draw.ts`, `commands/modify.ts`, `io/dxf/exportDxf.ts`, `document/types.ts`, `editor/editor.ts`, `commands/blockEditor.ts` y `ui/panels/BlockAuthoringPanel.tsx`.

**Archivos previstos:** se define por lote; no mover más de un subsistema por PR.

**Orden sugerido:**

1. Separar comandos de dibujo por texto/anotación, curvas, áreas y auxiliares.
2. Separar comandos de modificar por transformación, edición de curvas, portapapeles, booleanas y limpieza.
3. Separar tipos documentales por entidad/estilo/layout/recurso manteniendo un barrel estable.
4. Extraer controladores del editor (vista, entrada, selección, bloque) sin trasladar estado a React.
5. Dividir autoría de bloques por parámetro/acción/visibilidad/restricción.
6. Modularizar escritor DXF por tablas, entidades, bloques y objetos.

**Criterios de aceptación:**

- [ ] Cada lote conserva API pública y comportamiento con pruebas antes del movimiento.
- [ ] No se introducen dependencias ascendentes; `check:layers` sigue verde.
- [ ] El objetivo es responsabilidad clara, no un límite de líneas artificial.
- [ ] Cada PR puede revertirse de forma independiente.

**Verificación:** cobertura del subsistema + `pnpm verify`

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
