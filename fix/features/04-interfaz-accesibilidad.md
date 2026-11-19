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

## UI-012 — Mostrar errores de comandos y abrir historial accesible

- [x] **Estado:** Cerrada localmente, 2026-10-20
- **Prioridad:** P2
- **Responsable:** Sol 6.1 xhigh · **Inicio:** 2026-10-20
- **Depende de:** UI-001

**Alcance:** aviso compartido PC/teléfono para errores y advertencias del runner, con persistencia hasta descarte o respuesta aceptada/siguiente comando normal. Historial modal accesible por F2 o botón incluso con el teclado móvil cerrado. Conserva el documento, caret, comandos transparentes y mensajes del historial. Inspirado en feedback inline de CADCraft, con chrome y tokens propios.

**Criterios de aceptación:**
- [x] Un error se ve sin abrir historial/teclado y no roba el foco.
- [x] Otra entrada inválida actualiza el aviso; una respuesta válida lo retira.
- [x] Descartar conserva el historial; comandos transparentes no borran aviso/solicitud.
- [x] Historial usable por teclado y a 320 px, Día/Noche y ES/EN.
- [x] Evidencia focalizada y ficha visual local registradas.

**Evidencia:** 14 regresiones nuevas pasan (9 runner + 5 UI); tras corregir un literal L10n de prueba, sus 2 casos asíncronos pasan de nuevo. Typecheck final y lint focalizado exit 0. Chromium local PC 1280×800 y teléfono simulado 320×844 Día/Noche: error visible, corrección, descarte, F2/Escape, solicitud pendiente y foco/caret intactos. Axe focalizado sin violaciones con la hoja asentada; primera medición móvil durante animación conservada en logs. Dos hallazgos P2 de revisión independiente resueltos con RED→GREEN y re-revisión sin pendientes. [Ficha, capturas y límites](../../docs/brandbook/command-feedback-qa.md) · [comparación recuperada y priorización](../../docs/research/2026-10-20-cadcraft-fmodel.md).

**Límites históricos de UI-012:** la prueba preexistente de vista previa `runner.test.ts:74` falla desde antes del cambio y se conserva fuera de alcance. En aquella entrega no se acreditaba la suite completa. La carpeta local mixta pasó 1609/1609; la candidata aislada de publicación pasa 1430/1430 y no contiene el subsistema causante. Véase su ficha QA. Dispositivo físico, teclado virtual y lector de pantalla real siguen pendientes. Sin commit, push ni publicación.

## UI-013 — Menú de referencias de precisión

- [x] **Estado:** Cerrada localmente, 2026-10-20
- **Responsable:** Sol 6.1 xhigh · **Prioridad:** P2

**Alcance y evidencia:** implementación de la propuesta autorizada tras la comparación con CADCraft, con regresiones y revisión fresca independiente. [Ficha común: contratos, pruebas completas, capturas y límites](../../docs/brandbook/six-cad-improvements-qa.md). UI-012 y trabajo previo conservados; sin commit/push/publicación. UI-002 no se cierra.

## UI-014 — Formulario de unidades

- [x] **Estado:** Cerrada localmente, 2026-10-20
- **Responsable:** Sol 6.1 xhigh · **Prioridad:** P2

**Alcance y evidencia:** implementación de la propuesta autorizada tras la comparación con CADCraft, con regresiones y revisión fresca independiente. [Ficha común: contratos, pruebas completas, capturas y límites](../../docs/brandbook/six-cad-improvements-qa.md). UI-012 y trabajo previo conservados; sin commit/push/publicación. UI-002 no se cierra.

## UI-015 — Edición por doble clic

- [x] **Estado:** Cerrada localmente, 2026-10-20
- **Responsable:** Sol 6.1 xhigh · **Prioridad:** P2

**Alcance y evidencia:** implementación de la propuesta autorizada tras la comparación con CADCraft, con regresiones y revisión fresca independiente. [Ficha común: contratos, pruebas completas, capturas y límites](../../docs/brandbook/six-cad-improvements-qa.md). UI-012 y trabajo previo conservados; sin commit/push/publicación. UI-002 no se cierra.

---

## UI-016 — Respetar la navegación por Tab en diálogos

- **Prioridad:** P2 — recorridos de teclado excesivos o desviados a controles no disponibles
- **Responsable:** Codex
- **Registro:** 2026-11-18
- **Estado vigente:** consultar el índice de [README.md](./README.md)

**Falla identificada:** el atrapamiento de foco de los modales seleccionaba todos los botones habilitados, incluidos los de `tabIndex=-1`, y sustituía el comportamiento de cada pulsación de Tab. Esto anulaba el recorrido de pestañas segmentadas y podía convertir las 249 muestras del selector de color en paradas consecutivas. Tampoco excluía correctamente controles bajo antecesores ocultos, inertes o deshabilitados. Al dejar el recorrido interno al navegador apareció otro defecto en el selector: las flechas cambiaban el foco, pero el único `tabIndex=0` seguía en el color seleccionado; Shift+Tab podía volver dentro de la misma cuadrícula en vez de salir de ella.

**Corrección:** `useModalFocusTrap` filtra los controles disponibles y solo interviene en los extremos, cuando el foco está fuera o cuando no hay ninguna parada secuencial. Dentro del diálogo se conserva el recorrido nativo. Sigue respetando Escape consumido por un control, el modal superior y la devolución del foco al cerrar. `ColorPicker` mantiene una parada independiente por cuadrícula y la actualiza al recibir foco: las flechas recorren colores sin confirmarlos, Tab y Shift+Tab pueden salir y volver al último color enfocado, y una reapertura parte del color seleccionado o de una entrada válida por defecto.

**Archivos:** `src/ui/modalFocus.ts`, `src/ui/modalFocus.test.ts`, `src/ui/controls.tsx`, `src/ui/colorPicker.test.ts`, `e2e/modalKeyboard.spec.ts`.

**Criterios de aceptación:**

- [x] El foco inicial y la vuelta entre extremos omiten índices negativos, controles deshabilitados, campos ocultos y contenidos bajo `hidden`, `inert`, `aria-hidden`, `display:none` o visibilidad no disponible.
- [x] El modal no cancela el Tab interior y conserva el orden secuencial, incluidos índices positivos, cuando interviene en sus extremos.
- [x] Los modales apilados conservan Escape y restauran el foco; un control que consume Escape puede mantener abierto su diálogo.
- [x] Cada cuadrícula de color conserva una sola parada de Tab, actualizada por las flechas sin cambiar la selección.
- [x] La confirmación cambia el color y cierra el selector; cerrar sin confirmar no convierte el último foco en una selección.
- [x] Reabrir el selector restablece entradas válidas para colores básicos, ampliados, PorCapa y color verdadero.

**Pruebas focalizadas:** `src/ui/modalFocus.test.ts` contiene 19 casos sobre exclusiones, límites, foco programático y modales apilados; `src/ui/colorPicker.test.ts` contiene 6 sobre foco y selección. La ampliación del selector falló en 3/6 casos antes de corregirse y después pasaron 25/25 entre ambos archivos. Los dos están incluidos en la [verificación conjunta de 126 pruebas](./01-integridad-archivos.md#verificación-conjunta-de-dat-009-a-ui-017).

**Límites de evidencia:** jsdom no ejecuta el desplazamiento nativo de Tab; sus pruebas comprueban cuándo el modal lo permite y qué controles mantienen las paradas. `e2e/modalKeyboard.spec.ts` cubre la secuencia prevista en Estilos: pestaña a contenido, vuelta entre Cerrar y Listo, flechas y recorrido de ida y vuelta entre ambas cuadrículas y Color verdadero, Escape y retorno a la línea de comandos. El ejecutor E2E quedó bloqueado por `EPERM` al abrir el socket y no se declara aprobado. La revisión manual de la vista previa se registra por separado en `docs/brandbook/`; no acredita lectores de pantalla ni dispositivos táctiles físicos y no cierra UI-002.

---

## UI-017 — Cancelar por defecto al descartar cambios

- **Prioridad:** P2 — una confirmación de pérdida de cambios enfocaba la acción destructiva
- **Responsable:** Codex
- **Registro:** 2026-11-18
- **Estado vigente:** consultar el índice de [README.md](./README.md)

**Falla reproducida:** `confirmDiscard`, compartido por las aperturas desde Inicio y los dibujos guardados de Archivo, no marcaba la confirmación como destructiva. `ConfirmHost` enfocaba entonces «Descartar y continuar»; una activación adicional podía confirmar la pérdida de los cambios actuales. Esto contradecía el criterio de foco seguro ya definido en UI-005.

**Corrección:** `confirmDiscard` declara `danger: true` y utiliza el comportamiento existente de `ConfirmHost`: foco inicial en Cancelar y apariencia de peligro en la acción de descarte. El usuario puede confirmar explícitamente si quiere continuar; no se cambian los datos del dibujo al presentar o cancelar la pregunta.

**Archivos:** `src/ui/welcome/actions.ts`, `src/ui/confirmHost.test.ts`.

**Criterios de aceptación:**

- [x] La confirmación de cambios sin guardar enfoca Cancelar al abrirse.
- [x] Hacer clic en Cancelar, la opción inicialmente enfocada, devuelve `false`, conserva el documento y mantiene su estado de cambios pendientes.
- [x] Se conserva el comportamiento existente de las demás confirmaciones, entrada de texto y Escape con diálogos apilados.
- [x] Se reutilizan los textos bilingües, controles y tokens existentes.

**Pruebas focalizadas:** la regresión nueva falló inicialmente porque el foco estaba en «Descartar y continuar». Tras el cambio, `pnpm exec vitest run src/storage/persistence.test.ts src/ui/confirmHost.test.ts --maxWorkers=2` pasó 45/45 pruebas en esa etapa: 41 de persistencia y 4 de confirmación. La [verificación conjunta posterior](./01-integridad-archivos.md#verificación-conjunta-de-dat-009-a-ui-017), que incluye las nuevas carreras de DAT-011, pasó 126/126.

**Límite:** UI-017 corrige el valor inicial seguro de esta confirmación compartida. Su regresión activa Cancelar mediante clic; no acredita la propagación de Intro o Espacio desde la aplicación completa. No altera los comandos de guardado ni sustituye la validación de archivos de DAT-009.

---

## UI-018 — Respetar el teclado de las confirmaciones modales

- **Prioridad:** P2 — Intro, Espacio y atajos podían llegar al editor detrás de una confirmación
- **Responsable:** Codex
- **Registro:** 2026-11-18
- **Estado vigente:** consultar el índice de [README.md](./README.md)

**Falla reproducida:** al iniciar un dibujo desde Inicio con cambios pendientes, Cancelar recibía foco pero Intro y Espacio no lo activaban. El listener global de `App` sólo comprobaba sus estados de diálogo y paleta; `ConfirmHost` mantiene estado independiente. La tecla llegaba a `editor.key`, que podía repetir o continuar comandos y cancelaba la activación nativa del botón. Ctrl+S también podía ejecutar QSAVE detrás de esa confirmación.

**Corrección:** el listener global devuelve el control antes de atajos y comandos si el evento ya está consumido o se origina dentro de `[aria-modal="true"]`. Los botones conservan la activación nativa; Escape y los límites de Tab siguen perteneciendo al modal.

**Archivos:** `src/ui/App.tsx`, `src/ui/appModalKeyboard.test.ts`.

**Criterios de aceptación:**

- [x] Intro y Espacio en Cancelar no se cancelan ni llegan al editor.
- [x] Los atajos del editor no actúan detrás de la confirmación modal.
- [x] Una tecla previamente consumida no se vuelve a procesar.
- [x] Tab, Shift+Tab y Escape mantienen el comportamiento del modal.
- [x] Activar Cancelar conserva el dibujo y sus cambios pendientes.

**Evidencia:** la nueva integración de `App`, `ConfirmHost`, `Editor` y `Persistence` reales falló en cuatro de cinco casos antes de corregirse. `pnpm vitest run src/ui/appModalKeyboard.test.ts --maxWorkers=2` pasó **5/5** y `pnpm typecheck` pasó. jsdom comprueba la propagación y la acción por separado: no simula la activación nativa de un botón por teclado. La revisión manual posterior sí confirmó Intro y Espacio: ambos cierran la confirmación y conservan dos entidades sin guardar. La revisión independiente no encontró bloqueadores. Lint y build público se volvieron a comprobar después del cambio.

**Límites:** no modifica el alcance general de atajos de Inicio fuera de un modal; esa observación se registra en UI-019. [Ficha QA y capturas](../../docs/brandbook/integrity-keyboard-qa.md).

---

## UI-019 — Delimitar los atajos del lienzo en Inicio

- **Prioridad:** P2
- **Registro:** 2026-11-18
- **Estado vigente:** consultar el índice de [README.md](./README.md)

**Observación de revisión:** el listener global de teclado de `App` sigue activo cuando `surface === 'welcome'`. Fuera de los campos de texto y de los modales, botones de Inicio pueden enviar Intro o Espacio a `editor.key`. UI-018 protege las confirmaciones, pero no define qué atajos deben permanecer globales en Inicio.

**Trabajo pendiente:** separar los atajos deliberadamente globales (por ejemplo, la búsqueda) de las teclas propias del lienzo. Añadir una regresión con la aplicación completa para la activación nativa de botones de Inicio y para el regreso al lienzo. Comprobar que no se repiten comandos detrás de Inicio ni se pierden atajos previstos. No implementar una guardia indiscriminada que suprima esos accesos.

**Evidencia actual:** inspección de `App` y `Editor.key`; el defecto de la confirmación relacionado se reprodujo en navegador y está resuelto en UI-018. Esta tarea más amplia no se declara implementada ni verificada.

---

## UI-020 — Claridad y estados del menú Archivo

- **Prioridad:** P2
- **Registro y cierre de implementación:** 2026-11-18
- **Estado vigente:** consultar el índice de [README.md](./README.md)

**Problema:** acciones y dibujos competían en cuatro columnas; los nombres compartían una fila estrecha con la fecha, y eliminar medía 28 px. Durante la consulta se mostraba un falso vacío; los fallos de lectura o eliminación no tenían una respuesta accesible.

**Corrección:** tres grupos adaptables de acciones y una sección separada de archivos, nombres ajustables y fechas localizadas en `<time>`. Eliminar mide 40 px en escritorio y 44 px en ventana estrecha/puntero grueso. La consulta distingue carga, vacío y error con Reintentar; eliminar comunica espera y conserva la fila si falla. Se mantiene la apertura segura de DAT-009.

- [x] Nombres largos y fechas permanecen legibles en Día/Noche y a 320/390 px.
- [x] Carga, resultado vacío y fallo tienen estados diferentes.
- [x] Reintentar recupera una lectura fallida; un rechazo al eliminar no retira la fila.
- [x] Se preservan `confirmDiscard`, validación del paquete y separación del archivo físico anterior.
- [x] Textos ES/EN, controles existentes y capturas originales registrados.

**Evidencia:** 12/12 pruebas de Archivo, ocho regresiones nuevas inicialmente rojas. Revisión independiente sin bloqueadores; DOM real confirma los tamaños y ausencia de desbordamiento. [Ficha de diseño: capturas 01, 07–09 y 15, pruebas y límites](../../docs/brandbook/design-pass-qa.md).

---

## UI-021 — Selector de color legible y accesible

- **Prioridad:** P2
- **Registro y cierre de implementación:** 2026-11-18
- **Estado vigente:** consultar el índice de [README.md](./README.md)

**Problema:** la paleta ampliada tenía objetivos de aproximadamente 8.6 × 9 px; el foco inicial se confundía con selección de rojo y faltaban ACI 250–255. El contenedor podía recortar el selector.

**Corrección:** diálogo en portal con el trap de foco existente, muestras numeradas de 48 px de alto y cinco/seis columnas según el ancho. Selección y foco independientes, rango ACI 1–255 completo, entrada precisa validada y scroll de paleta. A poca altura, el panel también puede desplazarse para alcanzar los controles inferiores.

- [x] PorCapa, PorBloque, color verdadero y valores mezclados no seleccionan falsamente ACI 1.
- [x] Flechas corresponden a las columnas reales; Tab mantiene una parada por cuadrícula sin modificar el dibujo.
- [x] ACI fuera de 1–255 se rechaza; confirmar cierra y devuelve foco al disparador.
- [x] Escape cierra sólo el selector; otro Escape queda al diálogo padre.
- [x] Clic exterior cierra sin modificar el color ni activar el contenedor React.
- [x] Revisión Día/Noche, 320/390 px y altura de 400 px, con objetivos conservados.

**Evidencia:** 16 pruebas del selector y 20 de foco modal; las cinco regresiones App/modal también pasan. El navegador confirma 256 rechazado, 255 aplicado/seleccionado, flechas y Escape en dos pasos. La revisión independiente detectó el desbordamiento vertical de la primera candidata; tras corregirlo, Aplicar queda accesible a 320 × 400. [Ficha y originales 02, 10–14](../../docs/brandbook/design-pass-qa.md). El E2E actualizado se incorpora a los gates existentes; la ficha local no anticipa su resultado remoto.

---

## UI-022 — Estado y legibilidad del dibujo en Inicio

- **Prioridad:** P2
- **Registro y cierre de implementación:** 2026-11-18
- **Estado vigente:** consultar el índice de [README.md](./README.md)

**Problema:** un título largo recortaba «sin guardar» fuera de la tarjeta; etiquetas y contadores usaban un token demasiado tenue para su función.

**Corrección:** el título tiene su propio truncado y el indicador de cambios conserva espacio o pasa a otra línea. El texto funcional utiliza el token secundario existente y los contadores usan cifras tabulares.

- [x] El aviso permanece visible con el título largo a 390 px Noche y 320 px Día.
- [x] Los contadores y el estado del documento conservan sus valores; no cambia la apertura ni el guardado.
- [x] No hay desbordamiento horizontal en la ventana de 320 px.
- [x] Texto funcional con más contraste usando la paleta actual; capturas antes/después registradas.

**Evidencia:** inspección visual y medidas del DOM. El contraste de texto secundario sobre la tarjeta pasa de 2.98:1 a 5.42:1 en Noche y de 3.55:1 a 5.55:1 en Día; estos cálculos no certifican el producto completo. Revisión independiente sin bloqueadores; regresiones existentes de Inicio conservadas. [Ficha y originales 03–06](../../docs/brandbook/design-pass-qa.md). UI-019 permanece abierta.
