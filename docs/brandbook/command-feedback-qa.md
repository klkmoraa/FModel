# UI-012 · Avisos de comandos e historial / Command notices and history

2026-10-20 · Sol 6.1 xhigh · cambios locales, sin publicación.

## Comportamiento

Los errores y advertencias del runner aparecen en un aviso independiente del teclado, con recuperación y acceso a Historial. Los errores usan `role=alert`; los avisos, `role=status`. La llegada del aviso conserva foco y selección del texto. Otra entrada inválida actualiza el aviso y su identidad; la información ordinaria no lo borra. Descartar o aceptar una respuesta válida lo retira, conservando las entradas del historial. El siguiente comando normal también lo limpia. Los comandos transparentes respetan el aviso del emisor, incluso cuando llega de forma asíncrona.

Command errors and warnings appear independently of the keyboard, with history access and no focus change. New invalid input updates the notice; valid input, dismissal or the next normal command clears it. Transparent commands retain the originating command's notice. Dismissal keeps the log.

F2, el botón de la línea y «Ver historial / View history» abren el mismo Dialog de lectura. Tab permanece dentro; Escape o F2 cierran sin responder/cancelar el comando pendiente. En teléfono, la línea se conserva visible cuando el foco pasa a su botón o al historial y recupera el caret al cerrar. Los controles del aviso miden al menos 44×44 px. Colores, superficies, foco y tipografía proceden de los tokens existentes; no se modifica el papel técnico.

## Verificación proporcional

| Comprobación | Resultado y evidencia local cruda |
|---|---|
| Regresiones runner/UI | 14 nuevas pasan: 9 de runner y 5 de interfaz (`review-green.log`, exit 0). Se excluyeron expresamente las dos pruebas anteriores con el filtro `visible|recovery`. |
| Ajuste final de tipos en una prueba | El contrato `api.warn` requiere L10n. Se corrigió el literal bilingüe de la prueba asíncrona y se repitieron sus 2 casos: `type-fix-tests.log`, 2 pasan, exit 0. Fallo anterior conservado en `typecheck-review-red.log`. |
| TypeScript final | `pnpm typecheck`: exit 0 (`typecheck-final.log`). |
| Lint focalizado | Oxlint de los seis archivos TS/TSX modificados/nuevos: exit 0 (`lint-final.log`). |
| Escritorio 1280×800 | Aviso Día, historial Noche, caret [2,4] intacto; escribir en historial no llega al comando, F2 conserva solicitud y aviso, punto válido retira error. Registro de comprobaciones exitosas en `visual-results.json` (ese archivo conserva además el primer fallo de medición móvil descrito abajo). |
| Teléfono 320×844, Día/Noche | Aviso visible con teclado cerrado, sin desbordamiento horizontal; historial legible y accesible, descarte conserva el log: `visual-phone-results.json`, exit 0. |
| Teléfono con línea abierta | Clic de su botón, F2/Escape, Tab, input visible, selección [2,4] y misma solicitud pendiente: `mobile-focus-results.json`, exit 0; el fallo reproducido antes del arreglo está en `mobile-blur-red.log`. |
| Axe focalizado | Sin violaciones en aviso Día PC/móvil e historial Noche PC. Historial móvil Noche asentado: 0 violaciones (`visual-phone-results.json`). La primera medición durante la entrada animada señaló contraste; se conserva en `visual-results.json` y se repitió tras esperar `animation.finished`, sin cambio CSS. |
| Consola/red del recorrido | 0 errores de página/consola y 0 solicitudes externas en los contextos temporales. |
| Revisión independiente | Dos P2 (blur móvil y emisor asíncrono) fijados con regresiones RED→GREEN; re-revisión sin pendientes de este cambio. |

Evidencia cruda y patch de esta entrega: `/tmp/fmodel-ui012-20261020/`. Las pruebas se ejecutaron con la instalación local existente, sin suite completa, build ni nuevas dependencias. El CLI de Playwright no estaba en caché offline; el recorrido usó la librería/Chromium ya instalada y scripts temporales, sin crear una suite E2E nueva.

**Fallo previo fuera de alcance:** antes de modificar el runner productivo, la prueba existente `src/commands/runner.test.ts:74`, «does not let an obsolete command clear the preview of its replacement», esperaba `preview vigente` y recibió `undefined`. Consta en `runner-red.log` y se mantiene sin alterar. UI-012 no declara aprobada la suite completa.

**Estado de publicación (2026-10-20):** los 1609 casos corresponden a la carpeta local mixta. La candidata aislada desde HEAD pasa 1430/1430 pruebas en 152 archivos, incluida la prueba original de preview; no contiene room-recognition ni necesita trasladar su fix local. [QA y evidencia del árbol exacto](six-cad-improvements-qa.md).

## Originales sin editar

- PC Día: [aviso](assets/command-feedback-desktop-day-notice.png).
- PC Noche: [historial](assets/command-feedback-desktop-night-history.png).
- Teléfono 320 px Día: [teclado cerrado](assets/command-feedback-phone320-day-notice.png), [línea abierta y caret restaurado](assets/command-feedback-phone320-day-keyboard.png).
- Teléfono 320 px Noche: [aviso](assets/command-feedback-phone320-night-notice.png), [historial](assets/command-feedback-phone320-night-history.png).

Las capturas son de contextos temporales de Chromium con un dibujo de prueba local. El texto histórico conserva el idioma en que se emitió, aunque después se cambie el idioma de la interfaz. La revisión acredita viewports simulados y semántica/foco/axe; no acredita dispositivo físico, teclado virtual real, lector de pantalla real ni Safari/Edge. UI-002 continúa abierta.
