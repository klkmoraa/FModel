# Componentes de construcción 2D / 2D construction components

## Español

Los comandos crean piezas agrupadas de geometría nativa. Abre `ARCHITECTURE` / `ARQUITECTURA` desde la línea de comandos, Arquitectura › Catálogo de piezas o la paleta Arquitectura. En teléfono aparece la hoja de paneles; en escritorio, el panel flotante que puedes fijar. El núcleo de las catorce familias y su panel está disponible y tiene [QA visual Día/Noche/teléfono](brandbook/components-qa.md). Los muros y sus huecos existentes conservan sus propios comandos.

Busca por nombre o comando y filtra la categoría; elige una de las catorce familias. Cada campo muestra las unidades del dibujo, grados o cantidades. La miniatura utiliza el constructor y giro nativos sin escribir en el dibujo. Colocar valida todos los campos, incluidos los ocultos, y abre el punto de inserción del comando canónico. Una pieza filtrada no puede colocarse. Las medidas elegidas sobreviven a la colocación y al cierre/reapertura de la hoja; un dibujo nuevo/cargado con otro ID o un cambio de unidades restaura los defaults.

La variante controla los campos efectivos: columna circular usa diámetro; otras usan ancho/fondo y L/T/cruz añaden brazo. Escalera curva usa radio interior/giro/cantidad; huella pertenece a tramos rectos/L/U y descanso a L/U. Barandal en planta oculta alto. Los valores inactivos se conservan, validan y guardan para cambiar de variante; los selectores interactivos usan la misma regla declarativa.

Editar pieza abre `COMPONENTEDIT` sin argumentos: los campos del panel configuran la **colocación**, y los cambios de una pieza existente se solicitan mediante sus prompts nativos. Los errores de campo y de medidas incompatibles aparecen en el panel sin iniciar un comando. En teléfono, una acción válida cierra la hoja para usar el lienzo; una acción inválida la conserva abierta. Abrir la hoja no enfoca un campo ni levanta el teclado. La invocación válida devuelve el foco al lienzo.

| Comando / alias español | Campos (variantes y vistas en inglés) |
|---|---|
| `COLUMN` / `COLUMNA` | `variant=rectangular/circular/l/t/cross`, width, depth, arm, diameter |
| `AXISGRID` / `RETICULA` | columns, rows, spacingX, spacingY, margin, bubble |
| `STAIRPLAN` / `ESCALERAPLANTA` | `variant=straight/l/u/curved`, width, tread, steps, landing, innerRadius, turn |
| `STAIRSECTION` / `ESCALERASECCION` | tread, rise, steps, slab |
| `ESCALATOR` / `ESCALERAMECANICA` | `view=plan/elevation`, width, height, angle, platform |
| `LIFTPLAN` / `ELEVADOR` | width, depth, cabinWidth, cabinDepth, door, wall |
| `DOORELEVATION` / `PUERTAALZADO` | `variant=single/double`, width, height, frame |
| `DOORSECTION` / `PUERTASECCION` | height, wall, frame, threshold |
| `WINDOWELEVATION` / `VENTANAALZADO` | width, height, frame, columns, rows, `opening=true/false` |
| `WINDOWSECTION` / `VENTANASECCION` | height, sill, wall, frame, projection |
| `BAYWINDOWSECTION` / `VENTANASALIENTE` | depth, height, sill, wall, slab |
| `CURTAINWALL` / `MUROCORTINA` | width, height, columns, rows, mullion |
| `GLASSPARTITION` / `MAMPARA` | length, thickness, panel |
| `BANISTER` / `BARANDAL` | `view=plan/elevation`, length, height, spacing, thickness |

Escribe `clave=valor` después del comando: `COLUMN width=800 depth=60cm rotation=90`, `STAIRPLAN variant=curved innerRadius=1m turn=90` o `WINDOWELEVATION width=2.4m opening=true`. Las claves no distinguen mayúsculas. Se rechazan claves desconocidas/repetidas, expresiones, unidades en conteos/ángulos, valores no finitos y medidas que no caben. `rotation`, `turn` y `angle` se introducen en grados; el modelo guarda radianes.

Números dimensionales sin sufijo usan las unidades del dibujo; `mm`, `cm`, `m` e `in` son medidas físicas. Los defaults se convierten cada vez desde mm: columna 400×400, retícula 4×3 a 4000, escalera de 16 peldaños con huella 280, ventana 1200×1200. Así, la columna inicial mide 0.4×0.4 en un documento en metros; sin unidad mide 400×400 unidades. Todos los defaults están definidos en el catálogo, con campos/etiquetas/unidades explícitos. Conteos de 1 a 200; escaleras mínimo 2; ángulo de mecánica 10–60° y giro curvo 15–270°.

Antes del clic, Parámetros permite elegir y cambiar un campo; Giro cambia el ángulo. La vista previa utiliza el mismo constructor y transformación que la pieza final. Intro en el punto inicial o Esc cancela sin crear objetos, grupos ni estilos. El clic crea un grupo seleccionable en un único paso de deshacer/rehacer; entidades y texto heredan las propiedades y el estilo actuales.

`COMPONENTEDIT` / `EDITARPIEZA`: selecciona cualquier miembro, cambia un campo o Giro y confirma con Intro. La vista previa no modifica el dibujo. Esc cancela. Los roles supervivientes conservan IDs, orden y propiedades; no se modifica geometría ajena. Si se alteró manualmente la geometría, falta algún miembro/grupo, hay una copia fuera del grupo o los metadatos son inválidos, la edición paramétrica se rechaza. Los objetos siguen disponibles para edición CAD general.

El formato `.fmodel` conserva parámetros, grupos, roles y geometría sin nueva versión. DXF conserva LINE/ARC/CIRCLE/LWPOLYLINE/TEXT y textos, pero pierde los parámetros; el informe de conversión registra `FMODELCOMPONENT`. Reimportar DXF no recupera `COMPONENTEDIT`. No se amplía DWG ni se afirman otras funciones de YQARCH.

## English

The command/field table above is shared in both languages; canonical argument keys and enum values remain unchanged. These fourteen commands create selectable native groups. Open `ARCHITECTURE` / `ARQUITECTURA` from the command line, Architecture › Component catalogue, the Architecture palette or the phone panel sheet. The desktop panel can float or be pinned. The fourteen-family core and panel are available with [Day/Night/phone visual QA](brandbook/components-qa.md).

Search by name/command, filter a category and select a family. Fields show drawing units, degrees or counts. The miniature uses the native builder and rigid rotation without document writes. Place validates every field, including inactive values, and starts the canonical insertion command. Filtered-out components cannot be placed. Chosen dimensions persist after placement and sheet close/reopen; a different document ID or unit change refreshes defaults.

Variant controls effective fields: circular columns use diameter; other columns use width/depth and L/T/cross add arm. Curved stairs use inner radius/turn/count, straight/L/U flights use tread, and L/U use landing. Plan banisters hide height. Inactive values remain saved and validated for a future variant; interactive command pickers consume the same declarative rule.

Edit component invokes `COMPONENTEDIT` without arguments. Panel fields configure **placement**; existing-component edits use native command prompts. Invalid Place/Edit keeps errors visible and does not start a command. Valid actions close the phone sheet and restore canvas focus. Opening the phone panel never automatically focuses an input or raises the keyboard.

Use named literal arguments, for example `COLUMN width=800 depth=60cm rotation=90`. Bare dimensional numbers use drawing units; mm/cm/m/in suffixes are physical lengths. Defaults convert freshly from millimetres for each document; a 400 mm column is 0.4 drawing units in metres and 400 units in unitless drawings. Counts are integers from 1 to 200, stairs require at least 2 steps, escalator angles range from 10 to 60 degrees and curved flight turns from 15 to 270 degrees. Command angles use degrees; native state uses radians. Unknown/duplicate keys, expressions, nonfinite values and impossible layouts are rejected.

At the insertion prompt, Parameters changes a catalogue field and Rotation changes the angle. Preview and commit use the same geometry builder. Click confirms one atomic undo/redo operation; initial Enter or Escape cancels without entities, groups or styles. Standard properties, owner and current text style are inherited.

`COMPONENTEDIT` selects any component member, previews changes, and confirms all changes with Enter. Escape cancels without changing the drawing. Surviving roles preserve IDs, order and individual properties. Incomplete groups, foreign copies, changed geometry and corrupt metadata are rejected before mutation. Ordinary CAD editing remains available.

Native `.fmodel` preserves all parameters and groups without a format migration. DXF preserves standard shapes, native curves and text, but loses parametric editing; the conversion report records `FMODELCOMPONENT`. Reimported DXF cannot restore native component editing. DWG support and other YQARCH modules are outside this change.
