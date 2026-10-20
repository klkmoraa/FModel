# Seis mejoras CAD · Implementation Plan

> **For agentic workers:** ejecutar con superpowers:executing-plans en este hilo (Sol 6.1 xhigh); parent coordina revisión fresca. AGENTS y autorización humana prevalecen: sin commits, ramas, worktrees, publicación ni cambios ajenos.

**Goal:** completar las seis áreas autorizadas, conservando UI-012 y el árbol local.
**Architecture:** comandos transaccionales existentes, solicitudes de entrada con marcos acotados para precisión, React como presentación y validación estricta de formularios. Mantener local-first 2D, modelo y formato nativos.
**Tech Stack:** TypeScript/React/Vite/Vitest, Dialog/foco y tokens propios.
**Spec:** alcance concreto validado en la delegación del 2026-10-20 (usuario «hazlo» sobre las seis propuestas).

## Global Constraints

- Baseline de 894 archivos antes de editar, copias de textos y hashes en `/tmp/fmodel-sixareas-20261020/`.
- Conservar UI-012, arquitectura, datos, undo/redo, textos ES/EN, Día/Noche, foco y objetivos de 44 px.
- Ninguna red nueva, 3D, ampliación DWG, instalación, commit/push o despliegue.
- Por solicitud explícita: al final `pnpm test` completo sin filtros, `pnpm typecheck`, `pnpm lint`; capas/catálogo cuando corresponda y visual PC/móvil relevante.

## Review Focus

- Sesión de reconocimiento idle no posee preview de otros comandos; cancelar reconocimiento real sigue liberando worker y su preview.
- Modificadores anidables hasta 8 niveles; Escape cancela un marco, luego el comando. Puntos intermedios no cambian lastPoint; rechazos no consumen override ni producen NaN/Infinity.
- FROM usa desplazamiento relativo por defecto y `#` absoluto; M2P/MTP entrega media finita. Clics siguen screenToOwner (propietario/viewport; sin SCU configurable); comandos transparentes y cambios de solicitud conservan el contexto correcto.
- MATCHPROP sólo toca destinos editables del propietario actual y flags seleccionados; cancelar Settings conserva origen y dibujo.
- UNITS no escala geometría; valores enumerados/precisiones 0–8 y documento/versión vigentes. Doble clic respeta viewports, busy, visibilidad, bloqueo, referencias externas y entidades nativas.

## Task 1 · Corregir propiedad de preview (TST-003)

Files: `src/editor/roomRecognitionSession.ts`, su test y prueba existente `runner.test.ts:74`.
- [x] Reproducir runner y cancelación real de reconocimiento.
- [x] Hacer cancelación idle idempotente y añadir regresión de preview ajeno.
- [x] Verificar ese bloque focalizado y registrar evidencia.

## Task 2 · Menú y overrides de precisión (UI-013)

Files: runner/editor/view, catálogo de precisión, CanvasView/App/Dialogs/tarjetas PC-móvil y PointPrecisionDialog.
- [x] Catálogo común para los snaps existentes; END/MID/CEN/INT/PER/TAN/NEA… funcionan durante solicitudes de puntos.
- [x] Overrides sólo para el siguiente punto aceptado, sin cambiar preferencias; los rechazos no consumen.
- [x] Shift+clic derecho y botón accesible compartido abren opciones; cerrar no designa punto ni cancela el comando.
- [x] Regresiones y UI teclado/touch.

## Task 3 · FROM y M2P/MTP (CMD-003)

Files: marcos de entrada propios en comandos, runner/editor y pruebas de precisión.
- [x] Guardar/restaurar PendingInput y previews; máximo 8 niveles y cancelación por marco.
- [x] FROM referencia y offset relativo, M2P dos puntos; anidamiento y aliases bilingües.
- [x] Puntos finitos, @/#/polar, lastPoint, SCU/viewport y sin mutar dibujo hasta respuesta real.

## Task 4 · Settings de MATCHPROP (CMD-002)

Files: modify, contrato de settings y diálogo con test.
- [x] Usar `api.request` sólo aquí para preservar keyword de selección; no cambiar getSelection global.
- [x] Diez flags existentes con borrador cancelable y envelope JSON versión 1 acotado; token de solicitud/documento.
- [x] Validar destinos/capas/propietario y conservar una operación undo por comando; regresar a destinos después de Settings.

## Task 5 · Formulario UNITS (UI-014)

Files: comando units/utility/registry, UnitsDialog y pruebas.
- [x] Ruta UI por UNITS, CLI por -UNITS/headless y JSON validado para aplicar.
- [x] Unidades, formato y precisión lineal/angular con muestras del formateador existente.
- [x] Token documento/versión, cancel sin mutaciones, undo y sin reescalar entidades.

## Task 6 · Edición por doble clic (UI-015)

Files: editor/dispatch y pruebas.
- [x] Prioridad layout/viewports y rechazo durante comando activo.
- [x] Anotación→TEXTEDIT, polilínea→PEDIT, bloque normal→BEDIT; hatch→inspector útil existente o editor si falta.
- [x] Edición nativa antes del despacho genérico; bloquear xrefs, entidades ocultas/bloqueadas y espacios ajenos.
- [x] Pruebas de destino exacto, cancelación y undo, doble toque y visual PC/móvil.

## Cierre

- [x] Suite completa, tipos, lint, capas/catálogo pertinentes.
- [x] Recorridos y capturas PC/móvil Día/Noche; axe asentado y revisión fresca del parent.
- [x] Backlog, comparación/QA, patch contra nuevo baseline y verificación de preservación ajena.
