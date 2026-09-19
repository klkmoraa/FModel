# Interfaz, accesibilidad y dispositivos

## UI-001 — Cerrar la brecha de accesibilidad y teclado

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — operación completa sin ratón y semántica accesible
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Depende de:** TST-001
- **Bloquea:** UI-002

**Evidencia:**
1. Se eliminó `user-scalable=no` de `index.html`, permitiendo zoom de accesibilidad (WCAG 1.4.4) en navegadores móviles.
2. `src/ui/Dialogs.tsx` conserva `role="dialog"`, `aria-modal="true"`, focus trap con Tab/Shift+Tab, Escape y restauración del foco.
3. `src/ui/CanvasView.tsx` expone región, nombre bilingüe, instrucciones de teclado y estado de objetos para tecnologías de asistencia.
4. `CommandPalette` usa un botón real para favoritos sin pseudo-botón anidado; los favoritos se pueden alternar con teclado.
5. Los separadores de docks son `role="separator"`, enfocables y redimensionables con flechas/Home/End; el selector de color usa grid y roving tabindex.
6. `e2e/criticalJourneys.spec.ts` integra `@axe-core/playwright` y valida las superficies observables de workspace/importación.

**Archivos modificados:**
- `index.html`
- `src/ui/Dialogs.tsx`
- `src/ui/CanvasView.tsx`
- `e2e/criticalJourneys.spec.ts`

**Criterios de aceptación:**

- [x] Cero violaciones axe críticas/serias en recorridos acordados.
- [x] Abrir la paleta, alternar favoritos, redimensionar docks, dibujar una línea, guardar y cancelar diálogos es posible solo con teclado.
- [x] El canvas ofrece instrucciones y estado textual suficiente para tecnologías de asistencia, sin intentar convertir toda la geometría en DOM.
- [x] No se deshabilita el zoom del usuario sin una justificación probada; revisar `user-scalable=no` en `index.html`.

**Verificación:** `pnpm test:e2e` (5/5 recorridos Chromium, incluidos favoritos, resize de docks y axe; 0 violaciones `critical`/`serious` en `.canvas-host` y `.welcome-import`) y las puertas locales completas de lint, tipos, capas, features, Vitest, cobertura y build.

---

## UI-002 — Validar la experiencia táctil en dispositivos reales

- [ ] **Estado:** Abierta
- **Prioridad:** P3 — función marcada Experimental
- **Responsable:** Codex · **Inicio:** 2026-09-19
- **Depende de:** TST-001, UI-001
- **Bloquea:** promoción de táctil a “Disponible”

**Evidencia parcial:**
1. `src/ui/touchGesture.ts` mantiene cobertura determinista de taps, long press, pan, pinch, lupa y cancelación de punteros.
2. `src/ui/CanvasView.tsx` usa una única `effectiveDpr()` para resize del canvas, render y lupa, con tope 3.
3. La matriz de `fix/features/evidence/ui-002-device-matrix.md` documenta únicamente las pruebas automatizadas disponibles.
4. No se han ejecutado ni verificado dispositivos físicos en esta tarea; por tanto, no se promociona el estado táctil ni se cierra UI-002.

**Archivos modificados:**
- `src/ui/touchGesture.ts`
- `src/ui/touchGesture.test.ts`
- `src/ui/CanvasView.tsx`
- `src/editor/editor.ts`
- `src/app/features.ts`
- `docs/FEATURES.md`
- `fix/features/evidence/ui-002-device-matrix.md`

**Criterios de aceptación:**

- [x] Pan de dos dedos no crea puntos ni activa long press.
- [x] Pinch mantiene estable el punto bajo los dedos y no salta al levantar uno.
- [x] Lupa no oculta el objetivo y OSNAP se puede confirmar/ciclar.
- [x] Intro, Esc, opciones del comando y modos de precisión son alcanzables con objetivos táctiles adecuados.
- [ ] El estado en `features.ts` se actualiza solo con evidencia completa de dispositivos reales.

**Verificación:** pruebas unitarias de gestos/DPR y `pnpm test:e2e` en Chromium; evidencia física pendiente. UI-002 permanece abierta.

---

## UI-003 — Estandarizar estados de carga, error y operación larga

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P3 — claridad operativa
- **Depende de:** WRK-001, DAT-004
- **Bloquea:** —

**Evidencia:** `src/app/tasks.ts` coordina operaciones largas con `AbortSignal`, progreso, errores bilingües y descarte. Las tareas fallidas seguras exponen una acción de reintento que conserva el contexto hasta la acción del usuario; las tareas fallidas o canceladas no desaparecen automáticamente. La UI no bloqueante de `src/ui/TaskStatus.tsx` presenta estado, porcentaje, cancelación, reintento y cierre. Importación/exportación, auditoría y biblioteca usan el gestor con reintento donde la operación es segura.

**Archivos previstos:**

- Crear: `src/app/tasks.ts`, `src/ui/TaskStatus.tsx`
- Modificar: comandos de archivo, salida, biblioteca, referencias y auditoría

**Criterios de aceptación:**

- [x] Operaciones de más de un segundo muestran nombre, estado y opción de cancelar cuando sea seguro.
- [x] Un error conserva contexto suficiente para reintentar y no deja cambios parciales.
- [x] Mensajes y acciones están disponibles en español e inglés.
- [x] No se agregan modales bloqueantes para progreso ordinario.

**Cierre:** 2026-09-19

**Verificación:** `src/app/tasks.test.ts` cubre ciclo, progreso, cancelación, fallo y reintento; las puertas locales completas pasan con 63 archivos y 582 pruebas Vitest.
