# Inicio, Archivo y color · pasada de diseño

**Fecha:** 2026-11-18 · **Alcance:** UI-020, UI-021 y UI-022. Esta ficha amplía la [revisión de integridad y teclado](integrity-keyboard-qa.md); conserva DAT-009/010/011 y UI-016/017/018.

## Resultado y alcance

La pasada mejora tres recorridos existentes: identificar el dibujo activo en Inicio, encontrar un dibujo guardado en Archivo y elegir un color desde el administrador de estilos. Se conservan los tokens, tipografías, iconos, materiales y morado de FModel, los textos ES/EN y el funcionamiento local. No añade dependencias ni servicios externos.

El controlador inspeccionó los originales de esta ejecución y comprobó los controles reales en Chrome. Dos revisiones independientes examinaron el código; una detectó un desbordamiento a poca altura, reproducido y corregido antes del cierre. Las aprobaciones de esta ficha corresponden únicamente al alcance comprobado; no representan una aprobación del propietario ni una auditoría completa del producto.

## Hallazgos y decisiones

| Prioridad | Lugar | Antes | Después | Motivo y evidencia |
|---|---|---|---|---|
| P2 | Archivo: dibujos guardados | Nombre y fecha completa competían en una fila estrecha; eliminar medía 28 × 28 px | Sección propia debajo de las acciones, nombre con ajuste de palabras, fecha localizada en `<time>`, eliminar de 40 × 40 px en escritorio y 44 × 44 px a 320/390 px | Facilita distinguir archivos y pulsar la acción correcta. Capturas 01, 07–09 y 15; medidas DOM reales |
| P2 | Archivo: consulta y eliminación | Se anunciaba vacío mientras cargaba; los rechazos de lectura/eliminación no se presentaban | Carga, vacío y error separados, Reintentar, estado Eliminando y conservación de la fila si falla | Evita comunicar un estado falso del almacenamiento. Ocho regresiones nuevas fallaron antes y pasaron después |
| P2 | Selector de color: tamaño y significado | Muestras básicas de 22 × 22 px y ampliadas de aproximadamente 8.6 × 9 px; PorBloque anunciaba ACI 1 seleccionado | Muestras de 48 px de alto, número visible y nombre accesible, selección real separada del foco; 5 columnas a 320 px y 6 a 390 px/escritorio | Permite identificar y elegir colores con precisión. Capturas 02, 10–12 y 14; Tab/flechas no modifican el color |
| P2 | Selector de color: rango y teclado | Paleta ampliada terminaba en ACI 249 y no había entrada precisa | ACI 1–255 completo, campo validado, portal con foco propio y Escape en dos pasos | ACI 256 se rechaza; 255 se aplica y queda seleccionado al reabrir. Primer Escape vuelve al disparador; segundo, al comando |
| P2 | Selector de color: poca altura | En la primera candidata a 320 × 400, Aplicar terminaba en y425.59 fuera del viewport | El diálogo ofrece scroll cuando su contenido mínimo no cabe; tras enfocar ACI, Aplicar termina en y378.59 | La revisión independiente encontró el caso; el controlador lo reprodujo y verificó la corrección. Captura 13 |
| P2 | Inspector de capas: densidad | El disparador de color de 44 px elevaba el inspector inicial a 434.69 px, por encima de su contrato de 430 px | Disparador de 40 px en escritorio y 44 px en ventana estrecha/puntero grueso; muestras de 48 px intactas | Detectado por el E2E existente; se corrige el control compartido y se conserva el límite de la prueba |
| P2 | Inicio: estado del dibujo | Un nombre largo recortaba por completo «sin guardar» a 390 px | Se trunca sólo el título; el estado conserva espacio propio y puede ocupar otra línea a 320 px | Evita esconder un estado de datos importante. Capturas 04–06 |
| P2 | Inicio: texto secundario | Etiqueta, contadores y descripciones funcionales usaban el token más tenue | Usan el token secundario existente; contadores con cifras tabulares | Contraste calculado con los colores renderizados: Noche 2.98:1 → 5.42:1 y Día 3.55:1 → 5.55:1 sobre la tarjeta. No es una certificación global de contraste |

### Cobertura de los criterios de diseño

| Categoría | Aplicación |
|---|---|
| Tipografía | Jerarquía entre nombre y fecha, ajuste de nombres largos, cifras tabulares, texto funcional con más contraste |
| Superficies | Tokens y materiales actuales, radios coherentes, agrupación de acciones y archivos, selector fuera del recorte de su contenedor |
| Iconos | Lucide existente y `currentColor`; botones con nombre accesible, iconos decorativos ocultos al árbol accesible |
| Animación | No se añaden animaciones a estos flujos frecuentes de CAD |
| Rendimiento | Sin nuevas dependencias ni otra solución de estilos; Archivo conserva el límite de doce dibujos; no se afirma una mejora de rendimiento medida |

Se descartó sustituir el morado o las tipografías de FModel por otra identidad, ampliar globalmente todos los controles del lienzo y añadir animaciones decorativas. Estas opciones no resolvían los defectos observados y extendían innecesariamente el alcance.

## Recorridos comprobados en el navegador

1. **Inicio:** abrir un dibujo de ejemplo con nombre largo y dejar dos entidades con cambios pendientes. A 390 px, antes el indicador quedaba fuera del contenedor (su inicio estaba en x992.88); después queda dentro de la tarjeta. A 320 px en Día pasa a su propia línea, con el documento sin desbordamiento horizontal. Los datos son sintéticos de QA.
2. **Archivo:** abrir el menú desde el lienzo, comprobar los tres grupos y la lista separada en Día/Noche, y llevar foco con Tab al botón Eliminar sin activarlo. A 320 px, el documento mide 320 px de ancho, el contenido del menú 273 px y las acciones de eliminar 44 × 44 px. Se muestran nombres largos completos con fecha debajo. La consulta fallida, el reintento y la eliminación pendiente/fallida se verifican mediante pruebas controladas, no mediante fallos reales del navegador en estas capturas.
3. **Color:** ejecutar DIMSTYLE y abrir el color de línea. PorBloque recibe foco y es la única selección heredada. Tab entra a ACI 1, flecha abajo llega a 7 en seis columnas y Tab pasa a ACI 10 sin cambiar el valor. ACI 256 presenta error; 255 confirma, cierra y aparece seleccionado al reabrir. Escape cierra sólo el selector y devuelve foco al disparador; el segundo Escape cierra Estilos y vuelve a la línea de comandos.

En escritorio, la paleta mide 360 × 563.39 px; las muestras básicas miden aproximadamente 52.33 × 48 px. A 320 × 844, el panel mide 304 × 563.39 px, las básicas 52.39 × 48 px y las ampliadas 49.39 × 48 px. A 390 px hay seis columnas y no se desborda el documento. La paleta ampliada se desplaza dentro del panel. A 320 × 400 el panel ocupa y8–392 y su scroll permite alcanzar los controles inferiores; no se simula un teclado virtual físico.

## Verificación local

```sh
pnpm vitest run src/ui/dialogs/fileMenu.test.ts src/ui/colorPicker.test.ts src/ui/modalFocus.test.ts src/ui/appModalKeyboard.test.ts src/ui/confirmHost.test.ts src/ui/welcome/welcome.test.ts --maxWorkers=2
pnpm lint
pnpm check:layers
FMODEL_DWG_ENABLED=false pnpm build
pnpm check:public-dist
pnpm check:features
git diff --check
```

- **59/59 pruebas** de interfaz en seis archivos: Archivo 12, color 16, foco modal 20, App/modal 5, confirmaciones 4 e Inicio 2.
- TypeScript y lint correctos; arquitectura por capas: **812 importaciones** revisadas.
- Build público: **2354 módulos** transformados. El control del artefacto inspeccionó **189 archivos**, sin lector experimental ni manejador DWG.
- El primer intento de compilación usó una variable que no controla DWG; el guard del artefacto lo rechazó. Se repitió con `FMODEL_DWG_ENABLED=false`, la configuración real de los workflows, y pasó. No se alteraron esos guards.
- Continúa el aviso preexistente `INEFFECTIVE_DYNAMIC_IMPORT` de `polygon-clipping`; no se atribuye a esta pasada una reducción del bundle.
- Las comprobaciones de documentación y espacios se registran con el cierre de esta candidata. Las ejecuciones remotas completas y su resultado pertenecen al PR asociado; esta ficha no las da por ejecutadas anticipadamente.

La [ficha anterior](integrity-keyboard-qa.md) conserva los resultados históricos de integridad (126 pruebas conjuntas y cinco posteriores de App/modal). La pasada actual amplía las regresiones del selector y Archivo. `e2e/modalKeyboard.spec.ts` se actualiza para el portal y Escape anidado; el ejecutor local de Playwright no pudo iniciar el navegador por la restricción de sockets ya documentada, por lo que aquí no se afirma un E2E automatizado aprobado. GitHub Actions mantiene sus gates existentes.

### Primera ejecución remota y corrección del inspector

[CI 44464362338](https://github.com/klkmoraa/FModel/actions/runs/44464362338), sobre `872b19c`, pasó **1502 pruebas en 157 archivos**, cobertura y build público. En Chromium pasaron **79 de 80 recorridos**, incluido el nuevo de Tab/Escape. El único fallo, repetido en sus tres intentos, fue `brandbookVisual.spec.ts`: el inspector de capas medía 434.6875 px frente al máximo existente de 430 px.

La investigación encontró que el nuevo `min-height: 44px` del disparador de color dominaba el `height: 26px` de las dos filas iniciales de capas. Se ajusta sólo el disparador a 40 px en escritorio y se conservan 44 px para ventanas de hasta 640 px o puntero grueso. Las muestras y acciones interiores no cambian. No se modifica el assert, sus reintentos ni el workflow. La revisión visual independiente de la corrección midió ambos disparadores a 40 px. En el mismo Chrome de 1363 × 936, el inspector en inglés mide **423.6875 px**, dentro del límite de 430 px. En español mide **438.6875 px**: Blanco/Negro hace que la tabla exceda 2 px de ancho y aparezca una barra horizontal nativa de 15 px. En inglés, White/Black cabe y esa barra desaparece. Las capturas 16/17 documentan esa diferencia; no se presenta el valor español como una medida del escenario inglés del CI. El resultado de la candidata posterior queda registrado en el [PR #8](https://github.com/klkmoraa/FModel/pull/8).

## Originales de esta ejecución

Todos los archivos siguientes son JPEG de **1363 × 936**, copiados byte a byte desde el navegador, sin recorte, retoque ni composición. En las vistas estrechas, el área de FModel es un iframe de 320/390 px, rodeado por el marco gris del fixture. Los selectores «Ancho/Alto de prueba» pertenecen al fixture ignorado por Git, no a la aplicación.

| Captura | Evidencia |
|---|---|
| [01 · Archivo antes, Noche](assets/fmodel-design-01-file-before-night.jpg) | Distribución previa de acciones y dibujos |
| [02 · Color antes, Noche](assets/fmodel-design-02-color-before-night.jpg) | Paleta comprimida anterior |
| [03 · Inicio antes, Noche](assets/fmodel-design-03-home-before-night.jpg) | Texto secundario previo |
| [04 · Nombre largo antes, 390 px](assets/fmodel-design-04-home-long-before-mobile.jpg) | Indicador de cambios completamente recortado |
| [05 · Nombre largo después, 390 px Noche](assets/fmodel-design-05-home-long-after-mobile-night.jpg) | Indicador visible junto al título |
| [06 · Nombre largo después, 320 px Día](assets/fmodel-design-06-home-long-after-320-day.jpg) | Indicador en otra línea y contadores legibles |
| [07 · Archivo después, Día](assets/fmodel-design-07-file-after-day.jpg) | Acciones y archivos separados |
| [08 · Archivo después, Noche](assets/fmodel-design-08-file-after-night.jpg) | Mismo sistema de materiales y jerarquía |
| [09 · Archivo después, 320 px Día](assets/fmodel-design-09-file-after-320-day.jpg) | Nombre completo y foco visible en eliminar |
| [10 · Color después, Noche](assets/fmodel-design-10-color-after-night.jpg) | PorBloque seleccionado y paleta legible |
| [11 · Color después, 320 px Día](assets/fmodel-design-11-color-after-320-day.jpg) | Cinco columnas y controles dentro de la ventana |
| [12 · Color después, 390 px Noche](assets/fmodel-design-12-color-after-390-night.jpg) | Seis columnas en ventana estrecha |
| [13 · Color después, 320 × 400 Noche](assets/fmodel-design-13-color-after-320x400-night.jpg) | ACI y Aplicar accesibles después de desplazar el panel |
| [14 · Color después, Día](assets/fmodel-design-14-color-after-day.jpg) | ACI 255 seleccionado y extremo completo de la paleta |
| [15 · Archivo después, 390 px Noche](assets/fmodel-design-15-file-after-390-night.jpg) | Lista adaptable y objetivo de eliminar con foco |
| [16 · Capas después, Día ES](assets/fmodel-design-16-layers-after-day.jpg) | Disparadores de 40 px, inspector en español con barra horizontal nativa |
| [17 · Capas después, Día EN](assets/fmodel-design-17-layers-after-day-en.jpg) | Inspector en inglés de 423.69 px sin barra horizontal |

## Límites y pendientes

Esta pasada no cierra UI-002 (dispositivos físicos) ni UI-019 (alcance general de atajos del lienzo en Inicio). No comprueba lectores de pantalla reales, todos los estados de todos los diálogos, teclado virtual ni navegadores adicionales mediante estas capturas. El scroll a 400 px es una prueba de distribución; no equivale a probar un teléfono o su teclado. Tampoco cierra DAT-005, los trabajos generales de rendimiento ni la distribución experimental de DWG.

## English summary

This scoped pass improves Home document status, File menu hierarchy/loading/error handling, and color selection. It preserves FModel tokens and local-first behavior. The color picker now offers the complete ACI 1–255 range, readable targets, truthful selection, independent modal focus, nested Escape handling, and a scroll fallback for short viewports. Long titles no longer hide the unsaved badge. The controller inspected the raw screenshots, measured actual layouts, and verified keyboard behavior in Chrome. All 59 focused UI tests passed; type/lint/layer checks and the DWG-free public build passed. The evidence distinguishes browser observations from controlled unit tests and does not claim physical-device, screen-reader or locally automated E2E validation. Remote CI results are recorded by the associated pull request.

## SHA-256 de los originales

```text
4a5a072f655d677d3d42aa45ae7420abd1605509ea29dadb22d01905706a999b  fmodel-design-01-file-before-night.jpg
e0474be2822dd28d6601e1bb4d148ce6d078c7385b7dbc59b3f5708c8a0e3dcc  fmodel-design-02-color-before-night.jpg
f41c62b47bc4847dfe36e2e6ad9b79ee5d950f5c81414908904b0a90bedfbb1b  fmodel-design-03-home-before-night.jpg
ddcd96ada28a5937c7f8f59660ade85511dfc49c46af140f1c970ec2392d817b  fmodel-design-04-home-long-before-mobile.jpg
f376a152098075ffe7bd5c76d4832e183d815ddb7a7e7833a1ad2379d9fc1a61  fmodel-design-05-home-long-after-mobile-night.jpg
7c5603b79e7ebef2e018005d687ddf985a6613577b335620724a3c83d4e78248  fmodel-design-06-home-long-after-320-day.jpg
5a5e47126630652edccc80d6123ce92efe44242d28543317ab705d40092eaf41  fmodel-design-07-file-after-day.jpg
1da36ee681109689da636efeb9f4b7833efb23e210ac8c6d5d7b7707d6db069e  fmodel-design-08-file-after-night.jpg
88c361e6957e51f0c55b1fdfa57e6b76efef7d5eae894341652802cef7590d32  fmodel-design-09-file-after-320-day.jpg
e9085c123631459d3ba0b364ee8c435cc5d3d2a907f7f8a603127f3c94ff30bc  fmodel-design-10-color-after-night.jpg
e38d06c64abfdb021e572ecef27f9a9ac8ce47b9ca15f5e6837b2f1d6e6d4468  fmodel-design-11-color-after-320-day.jpg
3de699a0da4c357dd3fae96107a9e3b5bf545c421818d3360f91469c86fd119b  fmodel-design-12-color-after-390-night.jpg
37410ebd0fc6005236def4cbe764948754cbc78b1378a5cdb1d2d6550f45e0c9  fmodel-design-13-color-after-320x400-night.jpg
50e96da6c26759b0fdae78eaaf276ba2a54e3650b4290fb8e9ed087eef08ce30  fmodel-design-14-color-after-day.jpg
5fe975094065242ac63fa41dc37db28fb94397281a56501d0bbaf1a1fbbd5833  fmodel-design-15-file-after-390-night.jpg
0a935de2726961a3719284c9b75712871461b149dff460903b0b7c52a6dfdf15  fmodel-design-16-layers-after-day.jpg
c5664a4803779861834d2ddaf2054842e9434f04776198275d1b939b419fe3ba  fmodel-design-17-layers-after-day-en.jpg
```
