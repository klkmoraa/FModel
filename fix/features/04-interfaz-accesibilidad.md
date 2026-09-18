# Interfaz, accesibilidad y dispositivos

## UI-001 — Cerrar la brecha de accesibilidad y teclado

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — operación completa sin ratón y semántica accesible
- **Depende de:** TST-001
- **Bloquea:** UI-002

**Evidencia:** existen foco visible, `prefers-reduced-motion` y varios ARIA correctos, pero la UI contiene aproximadamente 215 botones y 236 controles de formulario sin una auditoría automatizada. Hay controles que dependen de placeholder/posición visual y elementos compuestos con `role="button"` que requieren revisar activación, nombre y foco.

**Archivos previstos:**

- Modificar: componentes bajo `src/ui/`
- Crear: `src/ui/accessibility.test.tsx` o suite E2E equivalente
- Modificar: `src/styles/tokens.css`, `src/styles/app.css`

**Implementación:**

- [ ] Ejecutar axe en pantalla principal, menús, paleta, docks y cada diálogo.
- [ ] Dar nombre accesible a botones de icono y asociar label/description a entradas.
- [ ] Implementar contención y retorno de foco en diálogos; Escape cierra solo el nivel superior.
- [ ] Confirmar orden lógico de tabulación y operación de tabs, listas, separadores y paneles.
- [ ] Verificar contraste en temas día/noche, zoom 200 % y reducción de movimiento.

**Criterios de aceptación:**

- [ ] Cero violaciones axe críticas/serias en recorridos acordados.
- [ ] Abrir, dibujar una línea, editar propiedades, guardar y cerrar diálogos es posible solo con teclado.
- [ ] El canvas ofrece instrucciones y estado textual suficiente para tecnologías de asistencia, sin intentar convertir toda la geometría en DOM.
- [ ] No se deshabilita el zoom del usuario sin una justificación probada; revisar `user-scalable=no` en `index.html`.

**Verificación:** `pnpm test:e2e -- accessibility && pnpm verify`

---

## UI-002 — Validar la experiencia táctil en dispositivos reales

- [ ] **Estado:** Abierta
- **Prioridad:** P3 — función marcada Experimental
- **Depende de:** TST-001, UI-001
- **Bloquea:** promoción de táctil a “Disponible”

**Evidencia:** `docs/FEATURES.md` declara que la interacción táctil solo se probó con eventos de puntero, no en dispositivos reales. La implementación combina long press, doble toque, pinch/pan, lupa y barra móvil.

**Archivos previstos:**

- Crear: `fix/features/evidence/ui-002-device-matrix.md` al ejecutar la tarea
- Modificar si falla: `src/ui/CanvasView.tsx`, `src/ui/MobileBar.tsx`, `src/render/loupe.ts`, estilos móviles
- Ampliar: pruebas de `wheelInput`/puntero y E2E

**Matriz mínima:** iPadOS Safari, iPhone Safari, Android Chrome y una tableta Android; orientación vertical/horizontal y al menos dos densidades de pantalla.

**Criterios de aceptación:**

- [ ] Pan de dos dedos no crea puntos ni activa long press.
- [ ] Pinch mantiene estable el punto bajo los dedos y no salta al levantar uno.
- [ ] Lupa no oculta el objetivo y OSNAP se puede confirmar/ciclar.
- [ ] Intro, Esc, opciones del comando y modos de precisión son alcanzables con objetivos táctiles adecuados.
- [ ] El estado en `features.ts` se actualiza solo con evidencia completa.

**Verificación:** pruebas automatizadas de puntero + matriz manual documentada + `pnpm verify`

---

## UI-003 — Estandarizar estados de carga, error y operación larga

- [ ] **Estado:** Abierta
- **Prioridad:** P3 — claridad operativa
- **Depende de:** WRK-001, DAT-004
- **Bloquea:** —

**Evidencia:** importación DWG/DXF, PDF, publicación y biblioteca inicial informan mediante el log de comandos, pero no comparten progreso, cancelación ni recuperación uniforme.

**Archivos previstos:**

- Crear: `src/app/tasks.ts`, `src/ui/TaskStatus.tsx`
- Modificar: comandos de archivo, salida, biblioteca, referencias y auditoría

**Criterios de aceptación:**

- [ ] Operaciones de más de un segundo muestran nombre, estado y opción de cancelar cuando sea seguro.
- [ ] Un error conserva contexto suficiente para reintentar y no deja cambios parciales.
- [ ] Mensajes y acciones están disponibles en español e inglés.
- [ ] No se agregan modales bloqueantes para progreso ordinario.

**Verificación:** pruebas de estado + E2E de cancelar importación/publicación + `pnpm verify`
