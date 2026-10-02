# Muros y huecos 2D / 2D walls and openings

## Español

En Herramientas → Arquitectura (también en la hoja de herramientas del teléfono), abre Muro, Habitación, Convertir a muro, Puerta o Ventana. Muro también está en Inicio y la paleta Arquitectura incluye los mismos comandos y presets. Todos los accesos ejecutan los comandos registrados.

| Comando / alias | Orden de entrada |
|---|---|
| `WALL` / `MURO` | Punto inicial; Espesor (`E`/`T`) o Justificación (`J`) antes del primer punto. Puntos siguientes; desHacer (`H`/`U`) retira el último vértice; Cerrar (`C`) cierra desde tres vértices; Intro termina. |
| `WALLRECT` / `HABITACION` | Mismas opciones iniciales; dos esquinas opuestas crean un único muro cerrado. |
| `WALLCONVERT` / `CONVERTIRMURO` | Preselección o selección de líneas/polilíneas rectas. Espesor, Justificación, Reemplazar (`R`) o Conservar (`C`/`K`); Intro confirma. Conserva originales por defecto. |
| `WALLDOOR` / `PUERTA` | Selecciona muro cerca del tramo. Punto central del hueco o Ancho (`A`/`W`); punto del lado de apertura; Bisagra (`B`/`H`) alterna extremo; Ubicación (`U`/`L`) cambia centro; Intro confirma. |
| `WALLWINDOW` / `VENTANA` | Selecciona muro; centro o Ancho; otro punto recoloca centro, Ubicación cambia centro; Intro confirma. |

Espesor inicial: 150 mm, convertido a las unidades vigentes (0.15 m). `WALL 100mm`, `WALL 150mm`, `WALL 200mm` y los botones de presets expresan medidas físicas. Las entradas de Espesor/Ancho son numéricas en unidades del dibujo; defaults de puerta 900 mm y ventana 1200 mm. Sin unidad se usan explícitamente 150/900/1200 unidades numéricas; un preset 100mm equivale a 100 unidades sin unidad. Los valores no se heredan de otro dibujo.

Justificación indica la referencia siguiendo el sentido del recorrido: Centro = eje, Izquierda = cara izquierda, Derecha = cara derecha. Las medidas de Habitación corresponden a ese eje o cara elegida; el recorrido va desde la primera esquina en horizontal a la segunda x, luego vertical a la segunda esquina y vuelve. Al invertir las esquinas, cambia el sentido y por tanto qué cara es izquierda/derecha.

Los muros son multilíneas nativas (`MLineEntity`) con dos offsets ±0.5, espesor como escala y tapas rectas. Se reutiliza un estilo equivalente; si hace falta se crea uno con nombre libre, sin modificar Standard ni sobrescribir estilos del usuario. Vista previa y confirmación validan las mismas caras e ingletes. Se rechazan puntos repetidos, tramos colapsados, inversión de 180°, ingletes superiores al límite 8 y caras que se colapsan.

Las esquinas unidas son las del mismo recorrido. No hay unión automática entre objetos independientes. Conversión conserva espacio, capa y propiedades fuente; Reemplazar conserva también el ID original; rechaza bulges y suavizados, sin aproximar curvas.

Un hueco se proyecta sobre el eje del tramo recto más cercano al clic, en unidades del dibujo y sin depender del zoom. Debe caber completamente dentro del tramo y fuera de sus esquinas e ingletes. No se ajusta silenciosamente a los extremos. Antes de Intro no se cambia el muro ni se crean estilos; Esc elimina la previsualización. Al confirmar se abre físicamente el muro: dos recorridos para un muro abierto, uno abierto alrededor del perímetro para uno cerrado. El primer recorrido conserva el ID del muro. Hoja y arco real de 90° para puerta; jambas y dos líneas de marco para ventana. Símbolos y huecos no tienen asociatividad posterior: mover uno no modifica automáticamente el otro.

Cada comando completo es un paso de deshacer/rehacer. Esc en WALL conserva los tramos ya completados, según el contrato del runner; cancelar antes del segundo punto no deja muro ni estilo. Un error inesperado o validación fallida revierte el grupo completo. En Habitación, conversión y huecos, la operación sólo se aplica al confirmar.

`.fmodel` conserva entidades, estilos y símbolos sin versión nueva. DXF descompone MLINE en líneas, incluidas tapas rectas; hoja/marco/jambas son LINE y arco de puerta ARC. Los estilos y la identidad del muro no se conservan como MLINE en DXF; el informe indica la descomposición. No se amplía DWG.

## English

Open Tools → Architecture (also in the phone tools sheet) or the Architecture palette. Wall is also in Home. All entries run the same registered commands.

| Command / alias | Input order |
|---|---|
| `WALL` / `MURO` | Start point; Thickness (`T`/`E`) and Justification (`J`) before the first point. Next points; Undo (`U`/`H`) removes last vertex; Close (`C`) closes from three vertices; Enter finishes. |
| `WALLRECT` / `HABITACION` | Same initial options; two opposite corners create one closed wall. |
| `WALLCONVERT` / `CONVERTIRMURO` | Preselection or selection of lines/straight polylines. Thickness, Justification, Replace (`R`) or Keep (`K`/`C`); Enter confirms. Keeps originals by default. |
| `WALLDOOR` / `PUERTA` | Select wall near segment. Opening center or Width (`W`/`A`); point on opening side; Hinge (`H`/`B`) swaps end; Location (`L`/`U`) changes center; Enter confirms. |
| `WALLWINDOW` / `VENTANA` | Select wall; center or Width; another point repositions center, Location changes center; Enter confirms. |

Initial thickness is 150 mm, converted to current drawing units (0.15 m). `WALL 100mm`, `WALL 150mm`, `WALL 200mm` and preset buttons express physical sizes. Thickness/Width input is numeric in drawing units; door/window defaults are 900/1200 mm. Unitless drawings explicitly use 150/900/1200 numeric units; a 100mm preset means 100 unitless units. Values never carry over from another drawing.

Justification follows path direction: Center references the axis, Left the left face, Right the right face. Room dimensions refer to that chosen axis or face; path runs horizontally from the first corner to the second x, vertically to the second corner, then returns. Swapping corners changes direction and the meaning of left/right.

Walls use native MLineEntity with two offsets ±0.5, thickness as scale and straight caps. Equivalent styles are reused; otherwise a free name is created, without changing Standard or overwriting user styles. Preview and commit validate the same faces and miters. Duplicate vertices, collapsed segments, 180° reversals, miters beyond limit 8 and collapsed faces are rejected. Joined corners belong to the same path; independent walls do not join automatically. Conversion preserves owner space, layer and source properties; Replace also preserves the original ID, and rejects bulges/smoothing without approximating curves.

Openings project onto the axis of the segment nearest the click, in drawing units independent of zoom. The whole width must fit clear of corners and miters; it is never silently clamped. No wall/style mutation occurs before Enter; Esc clears preview. Confirmation splits an open wall into two paths, or opens a closed wall into one perimeter path. The first path keeps the original wall ID. Door symbols use a leaf and real 90° arc; windows use jambs and two frame lines. Openings and symbols are not associative: moving one does not automatically update the other.

Each completed command is one undo/redo step. Esc during WALL retains completed segments under the runner contract; cancel before the second point leaves no wall/style. Errors roll back the whole command group. Room, conversion and openings mutate only on confirmation.

Native .fmodel preserves walls, styles and symbols with no format version change. DXF decomposes MLINE into lines including straight caps; leaves/frames/jambs are LINE and door swings ARC. Wall style/identity does not survive as MLINE in DXF; the export report describes decomposition. DWG scope is unchanged.

## Evidencia / Evidence

`src/geometry/walls.test.ts`, `src/commands/behavior/architecture.test.ts`, `src/io/architecture.test.ts`. ARC-002 remains in progress pending final controller review and visual QA.
