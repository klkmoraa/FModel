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

---

## UI-004 — Sistema de botones y campos arcilla en la mesa

- [x] **Estado:** Cerrada (pendiente de commit: el usuario aún no lo ha pedido)
- **Prioridad:** P2 — coherencia con el brandbook de la familia Modelo
- **Responsable:** Claude · **Inicio:** 2026-10-01 · **Cierre:** 2026-10-01
- **Depende de:** UI-001
- **Bloquea:** UI-005

**Problema:** el Inicio usa la materia arcilla del brandbook (superficie elevada, pista hundida, píldora activa, primario morado), pero en la mesa `.btn` era plano, `.btn--primary` era negro, los campos eran planos, las pestañas y filtros eran parches sueltos con `btn--accent` y `TaskStatus` pintaba con colores propios fuera de `tokens.css`.

**Evidencia:**
1. `src/styles/tokens.css`: `--shadow-field` y `--shadow-focus`. `src/styles/app.css`: receta única de botón (secundario elevado → raised al pasar → inset al pulsar; primario morado; peligro con canto y punto rojos, sin punto si lleva icono; fantasma sólo en barras densas; interruptor con `aria-pressed`), `.btn-group`, `.seg`, campos hundidos con anillo de foco, `accent-color` morado en casillas y radios, chips y acciones móviles con relieve, objetivos táctiles de 36–40 px con `pointer: coarse`.
2. `src/ui/controls.tsx` + `src/ui/segmented.ts`: componente `Segmented` (pestañas o radio) con roving tabindex y flechas/Inicio/Fin; sustituye a los grupos ad hoc de Opciones, Estilos, Parámetros, Ayuda (pestañas y filtro de estado), Informe de salud, Configurar página, Bloques y Paletas. `btn--accent` ya sólo se usa para acciones.
3. `src/ui/TaskStatus.tsx`: sin estilos en línea ni colores propios; usa tokens, barra de progreso y la animación `fm-spin` (antes `spin` no existía y el indicador no giraba).
4. Contraste AA: texto secundario de la mesa pasa de `--ink-muted` (3,5:1) a `--ink-secondary` (modos apagados de la barra de estado, cabeceras de tabla, pistas, búsqueda de la barra superior, textos en línea de los diálogos). Los modos apagados quedan «en tinta 2» como pide el brandbook.
5. Brandbook: capturas `docs/brandbook/assets/*` regeneradas en Día y Noche (el Inicio ya pinta su cuerpo), mocks de barra superior y bienvenida, filas de consistencia y auditoría, y receta de botones en `docs/brandbook/README.md`.

**Archivos principales:** `src/styles/tokens.css`, `src/styles/app.css`, `src/ui/controls.tsx`, `src/ui/segmented.ts`, `src/ui/segmented.test.ts`, `src/ui/TaskStatus.tsx`, `src/ui/dialogs/*`, `src/ui/panels/*`, `docs/brandbook/`.

**Criterios de aceptación:**

- [x] Primario en morado de Modelo con texto `--fs-interaction-ink`; secundario elevado; peligro con canto y punto rojo; fantasma sólo en barras densas.
- [x] Campos, selects y áreas de texto hundidos; casillas y radios con el acento de Modelo.
- [x] Un único control segmentado (pista hundida + píldora elevada) para pestañas y filtros, con teclado (flechas, Inicio, Fin).
- [x] Ningún color propio en `src/ui` fuera de `src/styles/tokens.css`, salvo datos del dibujo, el selector de color verdadero y el `theme-color` del navegador.
- [x] Día y Noche revisados en panel, diálogo, paleta y barra de estado; contraste AA.

**Verificación:** `pnpm verify` (lint, tipos, capas, features, 933 pruebas Vitest y build) sin errores; `playwright test` en Chromium: 37/37, con pruebas nuevas de primario/secundario/campo en Día y Noche, teclado del segmentado y axe `critical`/`serious` en lienzo vacío, barra superior, barra de estado, paneles Capas y Paletas y diálogos Opciones, Ayuda y Estilos, en Día y Noche. Entorno con Node 22 (el proyecto pide ≥ 24): sólo avisa. Revisión visual por capturas en 1440, 860 y 390 px.

---

## UI-005 — Mejorar la experiencia de uso sección por sección

- [x] **Estado:** Cerrada (pendiente de commit: el usuario aún no lo ha pedido)
- **Prioridad:** P2 — descubrimiento y claridad en el flujo principal
- **Responsable:** Claude · **Inicio:** 2026-10-01 · **Cierre:** 2026-10-01
- **Depende de:** UI-004
- **Bloquea:** —

**Evidencia por sección:**
1. **Barra superior** (`App.tsx`): botón Guardar (Ctrl+S) con punto de cambios pendientes; el idioma muestra el destino del cambio, igual que el Inicio; «Archivo» rotulado con icono propio (antes un icono igual al del panel Propiedades).
2. **Barra de estado** (`StatusBar.tsx`): cada interruptor dice qué hace, su atajo y si está activado; iconos con nombre accesible en lugar de glifos (⚙, ⤢, ⚠️, ◐).
3. **Capas** (`LayersPanel.tsx`): acciones agrupadas con icono y explicación de por qué están deshabilitadas, filtro y estados sin recortes, tabla con columnas básicas/todas, nombre fijo al desplazar, capas apagadas atenuadas, nombre accesible en cada control y selección completa al renombrar.
4. **Paletas y Bloques**: estados vacíos que explican la causa y ofrecen la acción; acciones de ficha visibles sin cursor y con nombre; comandos favoritos con su nombre.
5. **Biblioteca de herramientas**: la fila de pestañas ya no se recorta; la hoja móvil abre en «Inicio» en lugar de la primera familia.
6. **Paleta de comandos**: la opción activa por teclado siempre queda a la vista, atrapa el foco y lo devuelve, oculta comandos internos (`_GRIP`…), muestra ayuda de teclas y favoritos con estrella de 28 px.
7. **Diálogos**: el foco inicial va al contenido y no a «Cerrar»; las confirmaciones destructivas empiezan en «Cancelar»; etiquetas de campo hasta dos líneas (antes truncadas); tablas de Ayuda e informes sin desbordar; `src/ui/fieldLabels.ts` vincula etiquetas y controles sin nombre (Opciones tenía selects y casillas anónimos).
8. **Lienzo vacío** (`EmptyCanvasHint.tsx`): tarjeta con atajos de dibujo, «Abrir archivo…» y pistas de teclado; desaparece con el primer objeto o un comando en curso. *Retirada en UI-008.*
9. **Menú Archivo**: borrar un dibujo guardado usa un icono con nombre en lugar de «×».

**Criterios de aceptación:**

- [x] Cada control con icono tiene nombre accesible y descripción con atajo cuando existe.
- [x] Ninguna etiqueta truncada sin título ni alternativa; ninguna tabla desborda su diálogo.
- [x] El lienzo vacío explica cómo empezar sin tapar el dibujo y desaparece con el primer objeto.
- [x] En confirmaciones destructivas el foco inicial está en «Cancelar».
- [x] Textos nuevos en español e inglés.

**Verificación:** las mismas puertas que UI-004; recorrido manual con Playwright (crear capa, renombrar, ocultar, hacer actual, guardar estado, abrir la paleta con 14 flechas, abrir Archivo) sin errores de consola. Pendiente fuera de alcance: validación táctil en dispositivos reales (sigue en UI-002).

---

## UI-006 — Unificar la mesa en teléfono y tableta con la de escritorio

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — el móvil parecía otra aplicación y el teléfono en horizontal heredaba la mesa de escritorio rota
- **Responsable:** Claude · **Inicio:** 2026-10-01 · **Cierre:** 2026-10-01
- **Depende de:** UI-004, UI-005
- **Relación:** UI-002 sigue abierta para la validación en dispositivos físicos.

**Problema:** en ≤ 820 px la mesa cambiaba a tres filas de barras inferiores (contexto, chips, herramientas) que no existen en escritorio; con un comando activo mostraba además una línea de comando vacía. En un teléfono en horizontal (844 × 390) se aplicaba la mesa de escritorio completa: pista, línea de comando y dock superpuestos y barra de estado sin espacio. La tableta en vertical recibía la barra del teléfono y en horizontal no tenía zoom táctil ni forma de aceptar sin teclado.

**Evidencia:**
1. `src/ui/layoutMode.ts`: `PHONE_QUERY` (≤ 640 px, o táctil con ≤ 500 px de alto) y `TOUCH_QUERY`; `App.tsx` marca `.app--phone` / `.app--touch`. La tableta (768 px en vertical incluida) usa la mesa de escritorio.
2. `src/ui/phone/PhoneChrome.tsx`: `PhoneDock` (dock flotante con la clase y el material del de escritorio, favoritos deslizables, precisión con número de modos activos, paneles), `PhoneContext` (tarjeta de comando con orden, solicitud, opciones, coordenadas, Escribir, Cancelar y Aceptar; tarjeta de selección con Mover, Copiar, Girar, Escala, Simetría, Desfase, Propiedades y Borrar), `PrecisionSheet`, `PanelSheet` (un selector segmentado para todos los paneles) y `AppMenuSheet` (Archivo, buscar, escribir comando, opciones, ayuda, Inicio, tema e idioma).
3. `src/ui/phone/BottomSheet.tsx`: hoja inferior con asidero que se arrastra para cerrar, nombre accesible, Cerrar y Escape; modal con foco atrapado para el menú.
4. `src/ui/PrecisionDeck.tsx`: `ToolDeck` exportado como bandeja (escritorio/tableta) u hoja (teléfono), con estrella de favorito en táctil; en táctil el dock añade Aceptar junto a Cancelar.
5. `src/ui/precisionModes.ts`: una lista de modos para la barra de estado y la hoja táctil.
6. `src/ui/TouchHud.tsx`: zoom táctil como una sola pieza de arcilla (arriba a la derecha en el teléfono, a media altura a la izquierda en la tableta).
7. La línea de comando del teléfono aparece arriba (el teclado del sistema tapa la mitad inferior) y usa la solicitud como texto de ayuda. El Inicio del teléfono vuelve a mostrar «Abrir lienzo».
8. Se retiran `MobileBar`, la hoja de herramientas propia, los chips y las hojas de paneles acoplados del móvil.
9. Brandbook: sección «Teléfono y tableta» con `assets/movil-dia.png`, `assets/movil-noche.png` y `assets/tableta-dia.png`; `docs/FEATURES.md` regenerado con la descripción táctil nueva.

**Criterios de aceptación:**

- [x] El teléfono usa las mismas piezas que el escritorio: dock flotante de arcilla, tarjeta de comando sobre el dock, paneles y biblioteca de herramientas como hojas inferiores.
- [x] Con un comando activo, el teléfono muestra orden, solicitud, opciones, coordenadas y Aceptar/Cancelar; con selección, acciones rápidas de edición.
- [x] Los modos de precisión, los paneles y el menú de la app son hojas táctiles con nombre accesible y cierre por botón, gesto y Escape.
- [x] Teléfono en horizontal y tableta en vertical sin desbordes ni superposiciones; la tableta conserva la mesa de escritorio con objetivos táctiles, zoom y Aceptar.
- [x] Día y Noche revisados en 390 × 844, 844 × 390, 768 × 1024 y 1180 × 820; textos en español e inglés.

**Verificación:** `pnpm verify` (lint, tipos, capas, features, 933 pruebas Vitest y build) sin errores. `playwright test` en Chromium: 46/46. `e2e/touchLayouts.spec.ts` (9 pruebas nuevas, con táctil emulado) cubre:
- dock del teléfono;
- herramienta desde la hoja y tarjeta con Aceptar/Cancelar;
- dibujar con toques y borrar desde la tarjeta de selección;
- hojas de paneles, precisión y menú;
- teclado arriba con la solicitud como ayuda;
- axe sin `critical`/`serious` en Día y Noche;
- teléfono en horizontal con tarjeta y dock lado a lado;
- tableta con zoom y Aceptar.

`brandbookVisual` actualiza el contrato de 390 px y 768 px. Entorno con Node 22 (el proyecto pide ≥ 24): sólo avisa. Falta la prueba en dispositivos físicos (UI-002).

---

## UI-007 — Priorizar el uso vertical del teléfono

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — decisión de producto: en el teléfono FModel se usa en vertical
- **Responsable:** Claude · **Inicio:** 2026-10-01 · **Cierre:** 2026-10-01
- **Depende de:** UI-006

**Decisión:** el teléfono se diseña y se usa en vertical. Con el teléfono girado se propone volver a vertical, pero no se bloquea la orientación: WCAG 1.3.4 (AA) no permite restringirla salvo que sea esencial, y el bloqueo del manifiesto afectaría también a las tabletas.

**Evidencia:**
1. `src/ui/layoutMode.ts`: `PHONE_LANDSCAPE_QUERY` (táctil, ≤ 500 px de alto y apaisado). Una tableta apaisada no la cumple.
2. `src/ui/RotatePrompt.tsx`: aviso modal «Gira el teléfono a vertical» en el Inicio y en la mesa, con foco atrapado y teclas aisladas de la mesa. «Seguir en horizontal» lo descarta y se recuerda en la sesión (`sessionStorage`); sin almacenamiento vale para la vista actual. Al volver a vertical desaparece solo.
3. Quien siga en horizontal conserva la mesa adaptada de UI-006 (tarjeta y dock lado a lado).

**Criterios de aceptación:**

- [x] En el teléfono girado se pide girar a vertical, con el foco en la alternativa y nombre accesible.
- [x] El aviso no impide seguir en horizontal y no reaparece en la misma sesión.
- [x] El vertical y las tabletas (en vertical y en horizontal) no reciben el aviso.
- [x] Día y Noche revisados; textos en español e inglés; sin violaciones axe `critical`/`serious`.

**Verificación:** `e2e/touchLayouts.spec.ts` añade «propone girar a vertical sin imponerlo y recuerda la elección en la sesión» y «la tableta apaisada no recibe el aviso». La prueba de horizontal descarta antes el aviso. Puertas: `pnpm verify` y `playwright test` en Chromium.

## UI-008 — Retirar la tarjeta «Lienzo vacío» de la mesa

- [x] **Estado:** Cerrada
- **Prioridad:** P3 — petición de uso: la tarjeta tapaba el centro del lienzo y estorbaba, sobre todo en el teléfono
- **Responsable:** Claude · **Inicio:** 2026-10-01 · **Cierre:** 2026-10-01
- **Depende de:** UI-005

**Evidencia:** se elimina `src/ui/EmptyCanvasHint.tsx`, su montaje en `App.tsx` y los estilos `.canvas-hint`. El lienzo vacío queda despejado en escritorio, tableta y teléfono; el dock, la paleta de comandos y la bienvenida siguen explicando cómo empezar.

**Criterios de aceptación:**

- [x] Ninguna tarjeta aparece sobre el lienzo vacío.
- [x] Las pruebas e2e dejan de depender de la tarjeta; capturas del brandbook regeneradas.

**Verificación:** `pnpm verify` y `playwright test` en Chromium.
