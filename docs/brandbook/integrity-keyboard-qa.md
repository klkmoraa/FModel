# Integridad de archivos y teclado · revisión local

**Fecha:** 2026-11-18 (America/Mexico_City). Base revisada: `0ca16fbe0474fad3f8486cd1bac4f7ddaf6837b0`. El estado vigente de cada tarea está en [el índice de mejoras](../../fix/features/README.md).

## Alcance y decisiones

Se priorizaron riesgos de sobrescritura y falso guardado, exportación de geometría y manejo del teclado. La entrega conserva la arquitectura 2D local, el formato nativo y los tokens de la familia Modelo. No añade dependencias ni servicios de red.

| ID | Defecto comprobado | Resultado del cambio |
|---|---|---|
| DAT-009 | Abrir un dibujo guardado en el navegador conservaba el identificador del archivo físico anterior; QSAVE podía escribir el dibujo nuevo en ese archivo | Se reutiliza la apertura validada que limpia el identificador físico. Un paquete inválido conserva el documento y muestra un aviso ES/EN |
| DAT-010 | Un entero grande como `1e21` se escribía como `1e+21.0`; la reimportación convertía coordenadas en cero. Los valores no finitos se convertían silenciosamente en cero | La notación exponencial permanece válida y los valores no finitos abortan la exportación antes de descargar |
| DAT-011 | Leer, eliminar o marcar una salida limpia podía borrar una advertencia de guardado. Una limpieza de versiones tardía también podía ocultar un fallo posterior | Sólo una escritura completa recupera la protección. El éxito se registra inmediatamente después de esa escritura, antes de la limpieza secundaria |
| UI-016 | La captura de Tab incluía botones con `tabindex=-1` y controles ocultos. El retorno con Shift+Tab dentro de las paletas de color era incorrecto | El modal respeta el orden nativo y sus límites. Cada cuadrícula mantiene una sola entrada de Tab, independiente del color seleccionado |
| UI-017 | Descartar un dibujo enfocaba inicialmente la acción destructiva | La confirmación se declara peligrosa y enfoca Cancelar |
| UI-018 | El editor capturaba Intro y Espacio de confirmaciones independientes | Los eventos de modales y los ya consumidos no llegan a los atajos ni comandos del editor |

El aviso de archivo usa `--fm-danger` y `role="alert"`; el texto puede ajustarse a varias líneas. La confirmación usa la variante de peligro existente. No se introducen colores de marca ni materiales nuevos.

## Pruebas focalizadas

Antes de corregirlos se reprodujeron la sobrescritura del archivo anterior, los números DXF corruptos, la desaparición del aviso de almacenamiento, la carrera durante la limpieza de versiones y el foco destructivo. La revisión en navegador detectó además el recorrido inverso del selector de color y el conflicto de Intro/Espacio con el editor.

La corrida integrada de DAT-009/010/011 y UI-016/017 pasó **126 pruebas en 11 archivos**:

```bash
pnpm vitest run \
  src/io/dxf/tags.test.ts \
  src/io/dxf/exportDxf.test.ts \
  src/io/dxf/dynamicRoundTrip.test.ts \
  src/io/dxf/foreignDxf.test.ts \
  src/storage/persistence.test.ts \
  src/commands/file.test.ts \
  src/ui/dialogs/fileMenu.test.ts \
  src/ui/welcome/welcome.test.ts \
  src/ui/confirmHost.test.ts \
  src/ui/modalFocus.test.ts \
  src/ui/colorPicker.test.ts \
  --maxWorkers=2
```

Se cubren la apertura desde el FileMenu real seguida de QSAVE, el contenido del archivo guardado, la conservación del documento ante corrupción, DXF de ida y vuelta, escrituras y fallos intercalados, filtrado de foco, modales apilados y selección de color separada del foco.

Después se comprobó UI-018 en una corrida separada: `pnpm vitest run src/ui/appModalKeyboard.test.ts --maxWorkers=2`, **5/5 aprobadas**, tras observar cuatro fallos y un caso correcto antes de la corrección. Monta `App`, `ConfirmHost`, `Editor` y `Persistence` reales, aislando las miniaturas que necesitan Canvas. Comprueba Intro, Espacio, Ctrl+S, eventos consumidos y Tab/Escape. La activación nativa del botón se verifica por separado en el navegador; jsdom no la reproduce mediante eventos sintéticos. En total son **131 pruebas distintas en dos corridas**, no una ejecución integrada de 131.

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` | Sin diagnósticos |
| `pnpm lint` | Sin diagnósticos |
| `pnpm check:layers` | 812 importaciones comprobadas |
| `FMODEL_DWG_ENABLED=false pnpm exec vite build` | Compilación pública correcta, 2.352 módulos |
| `pnpm check:public-dist` | 189 archivos; sin lector experimental ni manejador DWG |

Typecheck, lint y compilación pública también pasaron después de añadir UI-018. No se repitieron las 126 pruebas cuyos archivos de producción no volvieron a cambiar.

Vite conserva el aviso `INEFFECTIVE_DYNAMIC_IMPORT` de `polygon-clipping`: también existen importaciones estáticas, por lo que esa dependencia no se separa mediante la importación dinámica de `modify.ts`. La compilación termina correctamente. Esta entrega no acredita una reducción del tamaño inicial ni una mejora de velocidad.

Dos revisiones independientes comprobaron los cambios de integridad y teclado. La segunda encontró la carrera entre limpieza de versiones y un guardado posterior fallido; la regresión parametrizada reproduce los tres métodos afectados. Las revisiones posteriores de esa corrección, del foco móvil por cuadrícula y de UI-018 no encontraron bloqueadores.

## Comprobación manual en navegador

Se usó la vista previa del checkout en Chrome del entorno, con datos sintéticos. Para provocar el error de apertura se prepararon un paquete válido con una línea y un registro inválido de tres bytes. La preparación es una página temporal de QA excluida de Git; no forma parte de la aplicación pública.

| Recorrido | Observación |
|---|---|
| Abrir `Plano de revisión.fmodel` y después el registro dañado, escritorio Día | El aviso aparece, el menú sigue abierto y el título y el lienzo conservan el dibujo con una entidad |
| Aviso de apertura a 390 × 844, Noche | Texto completo en varias líneas. El documento mide 390 px de ancho y 390 px de contenido; el aviso mide 358 px de ancho y de contenido, sin desbordamiento horizontal |
| DIMSTYLE, Tab desde la pestaña Cota | El foco pasa a la primera opción de estilo, sin recorrer pestañas inactivas |
| Cerrar → Shift+Tab → Listo → Tab | El foco permanece dentro del modal y vuelve a Cerrar |
| ACI 1 → flecha derecha → ACI 2 → Shift+Tab | ACI 2 pasa a ser la única entrada de su cuadrícula y Shift+Tab vuelve a PorBloque |
| Tab entre las dos cuadrículas, flechas y retorno inverso | Se conservan ACI 2 y ACI 11 como entradas de sus respectivos grupos. Tab sale al campo Color verdadero |
| Línea de comandos enfocada → DIMSTYLE → Escape | Se cierra el modal y el foco vuelve al mismo textbox de comandos |
| Inicio → Nuevo dibujo con dos entidades sin guardar | El foco inicial está en Cancelar. Cancelar mediante clic conserva las dos entidades y el estado sin guardar |
| Confirmación anterior, activar Cancelar con Intro y, en otra apertura, con Espacio | Ambas teclas cierran la confirmación y conservan el título, las dos entidades y el estado sin guardar |

El ancho de 390 px se comprobó mediante un iframe del mismo origen de **390 × 844**. Es una comprobación de distribución y no emula un dispositivo físico, puntero táctil ni teclado virtual. Las capturas conservan el viewport exterior de 1363 × 936 y su contexto completo.

## Capturas originales

JPEG originales del navegador, sin recorte, retoque ni composición. Se inspeccionaron visualmente y se conservaron los mismos bytes en el repositorio.

| Archivo | Vista |
|---|---|
| [fmodel-integrity-day.jpg](assets/fmodel-integrity-day.jpg) | Aviso de apertura fallida y dibujo conservado, escritorio Día |
| [fmodel-keyboard-night.jpg](assets/fmodel-keyboard-night.jpg) | Administrador de estilos y selector de color, escritorio Noche |
| [fmodel-cancel-default.jpg](assets/fmodel-cancel-default.jpg) | Confirmación de descarte, escritorio Noche; foco inicial verificado mediante DOM |
| [fmodel-integrity-mobile-night.jpg](assets/fmodel-integrity-mobile-night.jpg) | Aviso completo en el iframe de 390 px, Noche |

Huellas SHA-256:

```text
5d2a4137d3260aaea66ac946bf58fd888f7b33ff62f3d56e70e3470a563d554a  fmodel-integrity-day.jpg
3e0eeb179dc035bae3da690b4fbf15800098bb6d96cf690bada8a9ab63858950  fmodel-keyboard-night.jpg
1a51ceb0f0cdbda0094c5b28d5e38f1b15ff216ea59794d436e4367369c8ae15  fmodel-cancel-default.jpg
58f5c19bba5a96a2a37ba6f0003bdd0209e4ef3c5bf34382f11515092e8ae982  fmodel-integrity-mobile-night.jpg
```

## Límites de la evidencia

- `e2e/modalKeyboard.spec.ts` deja preparado el recorrido automatizado. La ejecución local de Playwright no pudo iniciar Chromium por `socket(): Operation not permitted`; los recorridos intentados terminaron antes de interactuar con la aplicación. No se cuentan como pruebas E2E aprobadas. La descarga de los navegadores de Playwright tampoco se completó en este entorno.
- Las acciones manuales de la tabla sí se realizaron en el navegador de la vista previa. No sustituyen una matriz Chromium/WebKit ni una comprobación en Safari, iPhone o Android físicos.
- No se ejecutó la suite completa ni cobertura. Las pruebas se eligieron por los riesgos concretos del cambio, conforme a `AGENTS.md`.
- No se modificó el contrato del formato nativo. La validación general de números no finitos de DAT-005 sigue siendo una tarea distinta de la protección aplicada al escritor DXF.
- UI-019 registra una observación preexistente del alcance de los atajos del lienzo en Inicio fuera de un modal. UI-018 sólo protege los eventos de modales y los que ya fueron consumidos; no se declara resuelta esa política más amplia.
- Esta revisión no resuelve REL-001 ni amplía la superficie pública experimental de DWG.
- El material de esta ficha corresponde a cambios locales revisables; no constituye evidencia de un despliegue o de CI remoto.

## English summary

This local review prioritizes drawing integrity and keyboard behavior. It prevents a browser-stored drawing from retaining the previous physical file handle, rejects invalid DXF numbers, keeps failed-save warnings until a full snapshot is written, and fixes modal Tab order and color-grid focus. Destructive confirmation initially focuses Cancel, and the editor no longer consumes its native keyboard actions. The affected integrated tests passed 126/126, followed by a separate 5/5 App/ConfirmHost regression run; type, lint, public build and layer checks passed. Actual browser observations verified Enter/Space cancellation and Escape focus restoration. Unmodified screenshots are recorded above. The 390 px view is a same-origin iframe layout check, not a physical-device test. The local Playwright browser failed to start, so no automated E2E success is claimed. The broader scope of editor shortcuts on Home is tracked separately in UI-019.
