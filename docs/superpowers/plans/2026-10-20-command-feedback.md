# UI-012 · Feedback visible de comandos — Implementation Plan

> **For agentic workers:** Usar superpowers:executing-plans; implementación nativa por Sol 6.1 xhigh y revisión fresca coordinada por el parent. AGENTS.md prevalece: sin commits, ramas, worktrees ni suites completas.

**Goal:** Hacer visibles errores/advertencias sin abrir teclado o historial, y ofrecer un historial accesible en escritorio y teléfono.
**Architecture:** Estado efímero explícito del CommandRunner; componente React compartido para aviso e historial modal. Ningún cambio al documento, transacciones, formato, red o DWG.
**Tech Stack:** TypeScript, React 19, Vitest/jsdom, estilos con tokens existentes y Dialog/foco compartidos.
**Spec:** Descripción pequeña validada en la delegación de 2026-10-20: aviso persistente hasta descarte, entrada aceptada o siguiente comando no transparente; rechazo nuevo reemplaza el aviso; historial/F2 usable a 320 px; ES/EN, Día/Noche y foco/caret conservados.

## Global Constraints

- Conservar todos los cambios anteriores: baseline y hashes en `/tmp/fmodel-ui012-20261020` antes de editar.
- Sin temporizador de borrado ni inferir aceptación por hora/longitud del log.
- Las solicitudes, información y comandos transparentes no borran el aviso.
- El historial conserva los errores descartados y no cancela el comando pendiente.
- Acciones táctiles de 44 px, texto legible y tokens existentes; ningún acceso remoto nuevo.

## Review Focus

- Entidad/selección aceptada sin eco: limpiar por resolución real, no por texto del log.
- Errores idénticos consecutivos y log limitado a 500: identidad explícita, anuncio nuevo.
- F2/precisión transparentes: conservar el aviso y solicitud pendiente.
- Cierre por Escape: historial devuelve el foco; no cancela ni envía entradas al dibujo.
- Teléfono con teclado cerrado y 320 px: aviso/historial visibles sin desbordamiento.

## Task 1: Feedback y recuperación

**Files:** `src/commands/runner.ts`, `runner.test.ts`; `src/ui/CommandFeedback.tsx`, `CommandFeedback.test.ts`, `CommandLine.tsx`, `App.tsx`; `src/styles/commandFeedback.css`.
**Interfaces:** `CommandRunner.feedback: CommandLogEntry | null`; `dismissFeedback(entry: CommandLogEntry): void`; `CommandFeedback({editor})` observa eventos command/prefs. `fmodel:cmdlog` sigue siendo el evento de historial.

- [x] Escribir y observar fallo de regresiones de runner para retención/reemplazo, transparentes, descarte seguro y respuesta aceptada sin eco.
- [x] Implementar estado efímero; limpiar en resolución/base válida o inicio no transparente.
- [x] Comprobar UI con error real, foco/caret, descarte/reemplazo y modal por botón/F2 sin cancelar comando.
- [x] Montar aviso separado de la línea móvil oculta y mover historial a Dialog responsive existente.
- [x] Ejecutar sólo runner/UI focalizados, typecheck y lint de los archivos cambiados.
- [x] Recorrido/capturas reales PC y teléfono 320 px Día/Noche; verificar límites, accesibilidad y consola.
- [x] Actualizar backlog, ficha/capturas y análisis comparativo; entregar patch relativo al baseline a revisión fresca.

## Rulings

- Se trabaja sobre el árbol existente por petición explícita de continuar y conservar sus cambios; no se crean commits ni ramas (AGENTS.md).
- El estado requiere runner: seleccionar entidad puede resolver sin eco y transparentes generan log sin resolver la solicitud anterior. Deducir estado del log no cumple la persistencia solicitada.
- El historial usa el Dialog existente para que F2 y su botón funcionen también cuando el CSS esconde la línea móvil.

## Resultado

Implementado y revisado. Evidencia y limitaciones: `docs/brandbook/command-feedback-qa.md`. Dos hallazgos de revisión (foco móvil y emisor asíncrono debajo de transparente) corregidos con regresiones. Fallo anterior de vista previa separado y preservado; no se ejecutó suite completa ni build. Sin commit/push/publicación.
