# UI-012 y seis mejoras CAD · candidata de publicación

2026-10-20 · Sol 6.1 xhigh. Preparada desde `f55f0e8a5340bf159483dcd337e6f31dfa086ddf`, aplicando únicamente deltas propios de UI-012 y las seis áreas autorizadas. La carpeta de trabajo local y todos sus cambios anteriores permanecen intactos.

## Alcance publicado

Avisos de comandos e historial por F2/botón; referencias de un solo uso con menú PC/tablet/teléfono; FROM/FRO y M2P/MTP con ocho niveles y Escape por marco; diez filtros de MATCHPROP; formulario UNITS con muestras, precisión 0–8, documento/versión y ruta -UNITS; doble clic/toque que reutiliza los editores ya comprometidos para anotación, polilínea, bloques, hatch y entidades nativas.

Los errores conservan foco y caret. Las referencias pertenecen al comando, sobreviven keywords/none y se suspenden en transparentes; sólo una respuesta geométrica finita consume el override. No se infiere un rechazo semántico posterior de cada comando. Cargar un dibujo invalida marcos y bloqueos. Las coordenadas conservan @/#/* y las transformadas existentes de propietario/viewport; no se implementa SCU configurable.

**Adaptación mínima a HEAD:** habitaciones y etiquetas vinculadas abren ROOMDATA, el editor que ya existe. Los muros/huecos usan sus lifecycle existentes con designación exacta. Una habitación de muro oculto por WALLAUTO usa un miembro visible intacto del mismo origen; ocultación explícita, aislamiento, bloqueos y congelación de viewport siguen impidiendo la edición. No se incorporan ROOMPROPERTIES, room-recognition, nuevos formularios arquitectónicos, colocación dimensionada de bloques ni otras modificaciones ajenas de Claude.

**TST-003:** la prueba original `runner.test.ts` de preview pasa en esta candidata. HEAD no contiene el subsistema room-recognition que causaba el fallo local; su corrección idle/worker queda conservada exclusivamente en la carpeta de trabajo. No se publica ese subsistema para trasladar una corrección que HEAD no necesita.

**Corrección recuperable de publicación:** HEAD también tenía un getter `CommandApi.lastPoint` recursivo cuando el comando activo no tenía punto. Se sustituyó por una lectura léxica del runner, manteniendo el fallback global. Dos regresiones fallaron antes y pasan después; Aceptar una LINE fresca se comprobó con clic real, sin errores ni mutación. Evidencia: `getter-head-preexisting.txt`, `getter-red.log`, `getter-green-final.log` y `getter-browser-results.json`.

## Verificación del árbol exacto

Evidencia cruda: `/tmp/fmodel-publish-20261020/`. No se atribuyen las 1609 pruebas de la carpeta local mixta a esta publicación: la candidata aislada tiene **1430 pruebas en 152 archivos**, todas verdes.

| Puerta | Resultado / evidencia |
|---|---|
| Suite completa | 1430/1430, 152 archivos, exit 0 · `full-suite-getter-final.log` |
| Cobertura completa con v8 | Líneas 67.02 %, statements 63.94 %, ramas 53.62 %, funciones 55.90 %; umbrales aprobados, exit 0 · `coverage-getter-final.log` |
| TypeScript y lint | Ambos exit 0 · `typecheck-getter-final.log`, `lint-getter-final.log` |
| Capas y catálogo | 813 importaciones; 74 funciones y documentación generada al día, exit 0 · `layers-final.log`, `features-final.log` |
| Compilación Pages | Base `/FModel/`, DWG false, exit 0 · `build-getter-final.log`; bundle `index-vOW8sFsx.js` |
| Artefacto público | 189 archivos inspeccionados, sin lector experimental ni file handler DWG, exit 0 · `public-dist-getter-final.log` |
| Recorrido del bundle compilado | PC 1280×800 y teléfono 320×844, Día/Noche; menú, formularios, doble clic/toque, campo real y Shift liberado · `public-visual.log`, `visual-results.json` |
| Accesos reales PC/tablet/móvil | Clic Playwright sin forzar a 1280/800/320; las cuatro acciones móviles caben en tarjeta y miden ≥44 px · `trigger-results.json`, `triggers-final.log` |
| Menú móvil | 17 opciones con texto/badge dentro del botón, ayuda separada y scroll del body · `precision-visual-results.json` |
| UI-012 en bundle público | 8 comprobaciones, 0 errores/externas, historial móvil/caret/F2/Escape/Tab aprobados; exit 0 · `ui012/visual.log`, `ui012/mobile-focus.log` |
| Aceptar sin último punto, bundle final | Clic real móvil, sin errores de consola ni mutación, exit 0 · `getter-browser.log`, `getter-browser-results.json` |
| Revisión independiente | Adaptaciones de selección nativa y pointer-events corregidas con RED→GREEN; re-revisión sin pendientes; getter final revisado por separado |

Axe focalizado se ejecuta con animaciones asentadas. Los contextos de navegador bloquean solicitudes externas. Las salidas RED y el primer fallo de acceso desktop se conservan en el directorio de evidencia. JSDOM avisa de getContext ausente y usa fallback; Chromium comprueba render real. No se instalaron dependencias: se copiaron las ya existentes a la carpeta aislada.

## Originales de la candidata

PC: [precisión Día](assets/six-cad-desktop-dia-precision.png), [MATCHPROP Noche](assets/six-cad-desktop-noche-matchprop.png), [UNITS Día](assets/six-cad-desktop-dia-units.png), [doble clic Noche](assets/six-cad-desktop-noche-doubleclick.png).

Móvil 320 px: [acciones visibles](assets/publication-phone-actions-320.png), [precisión Día](assets/six-cad-phone320-dia-precision.png), [precisión Noche con ayuda desplazada](assets/six-cad-phone320-noche-precision-modifiers.png), [MATCHPROP Día](assets/six-cad-phone320-dia-matchprop.png), [UNITS Noche](assets/six-cad-phone320-noche-units.png), [doble toque Día](assets/six-cad-phone320-dia-doubleclick.png). Acceso de [escritorio](assets/publication-trigger-1280.png) y [tablet](assets/publication-trigger-800.png).

Originales sin editar, regenerados en la integración. No se acredita dispositivo físico, teclado virtual real, lector de pantalla real ni Safari/Edge locales; UI-002 sigue abierta. La CI existente mantiene sus propias puertas de Chromium/WebKit, cobertura y Pages, sin cambiar permisos ni configuración de seguridad.

Superpowers externo, ui-ux-pro-max:design/ui-ux-pro-max y Playwright aplicados; ninguna skill copiada al repositorio. La publicación remota y la comprobación de su URL corresponden al hilo raíz.
