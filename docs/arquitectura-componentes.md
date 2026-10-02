# Componentes de construcción 2D / 2D construction components

## Español

Los comandos crean piezas agrupadas de geometría nativa. El panel de parámetros y su revisión visual están pendientes; el estado sigue siendo experimental. Los muros y sus huecos existentes conservan sus propios comandos.

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

The command/field table above is shared in both languages; canonical argument keys and enum values remain unchanged. These fourteen commands create selectable native groups. The parameter panel and real desktop/phone visual QA are pending, so the feature remains experimental.

Use named literal arguments, for example `COLUMN width=800 depth=60cm rotation=90`. Bare dimensional numbers use drawing units; mm/cm/m/in suffixes are physical lengths. Defaults convert freshly from millimetres for each document; a 400 mm column is 0.4 drawing units in metres and 400 units in unitless drawings. Counts are integers from 1 to 200, stairs require at least 2 steps, escalator angles range from 10 to 60 degrees and curved flight turns from 15 to 270 degrees. Command angles use degrees; native state uses radians. Unknown/duplicate keys, expressions, nonfinite values and impossible layouts are rejected.

At the insertion prompt, Parameters changes a catalogue field and Rotation changes the angle. Preview and commit use the same geometry builder. Click confirms one atomic undo/redo operation; initial Enter or Escape cancels without entities, groups or styles. Standard properties, owner and current text style are inherited.

`COMPONENTEDIT` selects any component member, previews changes, and confirms all changes with Enter. Escape cancels without changing the drawing. Surviving roles preserve IDs, order and individual properties. Incomplete groups, foreign copies, changed geometry and corrupt metadata are rejected before mutation. Ordinary CAD editing remains available.

Native `.fmodel` preserves all parameters and groups without a format migration. DXF preserves standard shapes, native curves and text, but loses parametric editing; the conversion report records `FMODELCOMPONENT`. Reimported DXF cannot restore native component editing. DWG support and other YQARCH modules are outside this change.
