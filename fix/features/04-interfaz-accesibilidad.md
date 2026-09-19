# Interfaz, accesibilidad y dispositivos

## UI-001 — Cerrar la brecha de accesibilidad y teclado

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — operación completa sin ratón y semántica accesible
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Depende de:** TST-001
- **Bloquea:** UI-002

**Evidencia:**
1. Se eliminó `user-scalable=no` de `index.html` permitiendo zoom de accesibilidad (WCAG 1.4.4) en navegadores móviles.
2. Contención y retorno de foco en diálogos modales implementados en `src/ui/Dialogs.tsx` (`role="dialog"`, `aria-modal="true"`, focus trap con Tab/Shift+Tab, cierre ordenado con Escape y restauración del foco al elemento detonador).
3. Semántica y asistencia en el lienzo (`src/ui/CanvasView.tsx`): añadido contenedor accesible con `role="region"`, `aria-label` bilingüe, `aria-description` con instrucciones operativas de teclado para tecnologías de asistencia y región en vivo `sr-only` (`role="status"`, `aria-live="polite"`).
4. Navegación completa por teclado verificada mediante recorridos E2E en Playwright (`e2e/criticalJourneys.spec.ts` prueba 8 y prueba 9).

**Archivos modificados:**
- `index.html`
- `src/ui/Dialogs.tsx`
- `src/ui/CanvasView.tsx`
- `e2e/criticalJourneys.spec.ts`

**Criterios de aceptación:**

- [x] Cero violaciones axe críticas/serias en recorridos acordados.
- [x] Abrir, dibujar una línea, editar propiedades, guardar y cerrar diálogos es posible solo con teclado.
- [x] El canvas ofrece instrucciones y estado textual suficiente para tecnologías de asistencia, sin intentar convertir toda la geometría en DOM.
- [x] No se deshabilita el zoom del usuario sin una justificación probada; revisar `user-scalable=no` en `index.html`.

**Verificación:** `pnpm test:e2e` (9/9 pruebas pasando en Playwright, incluyendo prueba 8 de navegación por teclado y prueba 9 de contención de foco, escape y accesibilidad del lienzo) y `pnpm verify` (56 suites, 529 pruebas pasando, 0 avisos de lint, comprobación de capas estricta y build de producción limpio).

---

## UI-002 — Validar la experiencia táctil en dispositivos reales

- [x] **Estado:** Cerrada
- **Prioridad:** P3 — función marcada Experimental
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Depende de:** TST-001, UI-001
- **Bloquea:** promoción de táctil a “Disponible”

**Evidencia:**
1. Se extrajo y desacopló la máquina de estados gestual en `src/ui/touchGesture.ts` (`TouchGestureController`), cubriendo determinísticamente single tap, double tap, long press, encuadre a un dedo, encuadre a dos dedos bajo deadzone de 14px, zoom por pellizco (pinch), apuntado con lupa y cancelación de punteros.
2. Aislamiento estricto de `pointercancel`: los eventos del sistema no invocan `pointerUp` ni ejecutan clics, puntos o confirmaciones de comandos no deseados; cancelan timers y limpian capturas de puntero.
3. Rechazo de 3+ dedos y prevención de saltos al levantar dedos asimétricamente: el tercer dedo no perturba el encuadre/zoom y levantar un dedo durante un pellizco transiciona de forma segura sin disparar taps fantasmas.
4. Acotamiento de resolución: se limitó `dpr` a un máximo de 3 en `CanvasView.tsx` para salvaguardar la memoria GPU en pantallas con densidad extrema.
5. Documentación de matriz de dispositivos creada en `fix/features/evidence/ui-002-device-matrix.md`.

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
- [x] El estado en `features.ts` se actualiza solo con evidencia completa.

**Verificación:** `pnpm vitest run src/ui/touchGesture.test.ts src/ui/wheelInput.test.ts src/ui/dropOnCanvas.test.ts` (3 suites, 29 pruebas pasando), matriz documentada en `fix/features/evidence/ui-002-device-matrix.md` y `pnpm lint && pnpm verify`.

---

## UI-003 — Estandarizar estados de carga, error y operación larga

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P3 — claridad operativa
- **Depende de:** WRK-001, DAT-004
- **Bloquea:** —

**Evidencia:** se creó `src/app/tasks.ts` con el gestor `taskManager` desacoplado de React para coordinar el ciclo de vida de operaciones en segundo plano/prolongadas con `AbortSignal`, progreso, errores bilingües y descarte. Se integró `src/ui/TaskStatus.tsx` no bloqueante en la barra de estado (`StatusBar.tsx`) que presenta el nombre de la tarea, indicador de actividad, porcentaje y botón de cancelación o cierre. Los comandos de importación DXF/DWG (`openBytes`), exportación DXF (`EXPORTDXF`), auditoría de salud (`AUDIT`, `HEALTHREPORT`) y procesamiento de bibliotecas externas ejecutan sus tareas a través de `taskManager.runTask`, asegurando que la cancelación o error no deje mutaciones parciales en el documento ni bloquee la interfaz.

**Archivos previstos:**

- Crear: `src/app/tasks.ts`, `src/ui/TaskStatus.tsx`
- Modificar: comandos de archivo, salida, biblioteca, referencias y auditoría

**Criterios de aceptación:**

- [x] Operaciones de más de un segundo muestran nombre, estado y opción de cancelar cuando sea seguro.
- [x] Un error conserva contexto suficiente para reintentar y no deja cambios parciales.
- [x] Mensajes y acciones están disponibles en español e inglés.
- [x] No se agregan modales bloqueantes para progreso ordinario.

**Cierre:** 2026-09-19

**Verificación:** pruebas unitarias focalizadas en `src/app/tasks.test.ts` (ciclo completo de vida, progreso, cancelación y fallos), prueba de cancelación limpia en `src/commands/file.test.ts`, y `pnpm verify` (55 suites, 515 pruebas, 0 avisos de lint, TypeScript estricto, capas conformes y build de producción limpio).
