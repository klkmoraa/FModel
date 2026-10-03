# Muros y huecos 2D / 2D walls and openings

## Español

En Herramientas → Arquitectura (también en la hoja de herramientas del teléfono), abre Muro, Habitación, Convertir a muro, Puerta o Ventana. Muro también está en Inicio y la paleta Arquitectura incluye los mismos comandos y presets. Todos los accesos ejecutan los comandos registrados.

| Comando / alias | Orden de entrada |
|---|---|
| `WALL` / `MURO` | Punto inicial; Espesor (`E`/`T`) o Justificación (`J`) antes del primer punto. Puntos siguientes; desHacer (`H`/`U`) retira el último vértice; Cerrar (`C`) cierra desde tres vértices; Intro termina. |
| `WALLRECT` / `HABITACION` | Mismas opciones iniciales; dos esquinas opuestas crean un único muro cerrado. |
| `WALLCONVERT` / `CONVERTIRMURO` | Preselección o selección de líneas/polilíneas rectas. Espesor, Justificación, Reemplazar (`R`) o Conservar (`C`/`K`); Intro confirma. Conserva originales por defecto. |
| `WALLDOOR` / `PUERTA` | Selecciona muro cerca del tramo. Punto central del hueco o Ancho (`A`/`W`); punto central; Ancho/Tipo/Lado/Bisagra antes de Intro. |
| `WALLWINDOW` / `VENTANA` | Selecciona muro; centro o Ancho; otro punto recoloca centro, Tipo cambia símbolo; Intro confirma. |

Espesor inicial: 150 mm, convertido a las unidades vigentes (0.15 m). `WALL 100mm`, `WALL 150mm`, `WALL 200mm` y los botones de presets expresan medidas físicas. Las entradas de Espesor/Ancho son numéricas en unidades del dibujo; defaults de puerta 900 mm y ventana 1200 mm. Sin unidad se usan explícitamente 150/900/1200 unidades numéricas; un preset 100mm equivale a 100 unidades sin unidad. Los valores no se heredan de otro dibujo.

Justificación indica la referencia siguiendo el sentido del recorrido: Centro = eje, Izquierda = cara izquierda, Derecha = cara derecha. Las medidas de Habitación corresponden a ese eje o cara elegida; el recorrido va desde la primera esquina en horizontal a la segunda x, luego vertical a la segunda esquina y vuelve. Al invertir las esquinas, cambia el sentido y por tanto qué cara es izquierda/derecha.

Los muros son multilíneas nativas (`MLineEntity`) con dos offsets ±0.5, espesor como escala y tapas rectas. Se reutiliza un estilo equivalente; si hace falta se crea uno con nombre libre, sin modificar Standard ni sobrescribir estilos del usuario. Vista previa y confirmación validan las mismas caras e ingletes. Se rechazan puntos repetidos, tramos colapsados, inversión de 180°, ingletes superiores al límite 8 y caras que se colapsan.

Las esquinas unidas son las del mismo recorrido. No hay unión automática entre objetos independientes. Conversión conserva espacio, capa y propiedades fuente; Reemplazar conserva también el ID original; rechaza bulges y suavizados, sin aproximar curvas.

Un hueco se proyecta sobre el eje del tramo recto más cercano al clic, en unidades del dibujo y sin depender del zoom. Debe caber completamente dentro del tramo y fuera de sus esquinas e ingletes. No se ajusta silenciosamente a los extremos. Antes de Intro no se cambia el muro ni se crean estilos; Esc elimina la previsualización. Al confirmar se abre físicamente el muro: dos recorridos para un muro abierto, uno abierto alrededor del perímetro para uno cerrado. El primer recorrido conserva el ID del muro. Hoja y arco real de 90° para puerta; jambas y dos líneas de marco para ventana. Los símbolos pertenecen a un grupo nativo: mover, editar o borrar un hueco recompone el muro y conserva los demás.

Cada comando completo es un paso de deshacer/rehacer. Esc en WALL conserva los tramos ya completados, según el contrato del runner; cancelar antes del segundo punto no deja muro ni estilo. Un error inesperado o validación fallida revierte el grupo completo. En Habitación, conversión y huecos, la operación sólo se aplica al confirmar.

`.fmodel` conserva entidades, estilos y símbolos sin versión nueva. DXF descompone MLINE en líneas, incluidas tapas rectas; hoja/marco/jambas son LINE y arco de puerta ARC. Los estilos y la identidad del muro no se conservan como MLINE en DXF; el informe indica la descomposición. No se amplía DWG.

## English

Open Tools → Architecture (also in the phone tools sheet) or the Architecture palette. Wall is also in Home. All entries run the same registered commands.

| Command / alias | Input order |
|---|---|
| `WALL` / `MURO` | Start point; Thickness (`T`/`E`) and Justification (`J`) before the first point. Next points; Undo (`U`/`H`) removes last vertex; Close (`C`) closes from three vertices; Enter finishes. |
| `WALLRECT` / `HABITACION` | Same initial options; two opposite corners create one closed wall. |
| `WALLCONVERT` / `CONVERTIRMURO` | Preselection or selection of lines/straight polylines. Thickness, Justification, Replace (`R`) or Keep (`K`/`C`); Enter confirms. Keeps originals by default. |
| `WALLDOOR` / `PUERTA` | Select wall near segment. Opening center or Width (`W`/`A`); center point; Width/Type/Side/Hinge before Enter. |
| `WALLWINDOW` / `VENTANA` | Select wall; center or Width; another point repositions center, Type changes symbol; Enter confirms. |

Initial thickness is 150 mm, converted to current drawing units (0.15 m). `WALL 100mm`, `WALL 150mm`, `WALL 200mm` and preset buttons express physical sizes. Thickness/Width input is numeric in drawing units; door/window defaults are 900/1200 mm. Unitless drawings explicitly use 150/900/1200 numeric units; a 100mm preset means 100 unitless units. Values never carry over from another drawing.

Justification follows path direction: Center references the axis, Left the left face, Right the right face. Room dimensions refer to that chosen axis or face; path runs horizontally from the first corner to the second x, vertically to the second corner, then returns. Swapping corners changes direction and the meaning of left/right.

Walls use native MLineEntity with two offsets ±0.5, thickness as scale and straight caps. Equivalent styles are reused; otherwise a free name is created, without changing Standard or overwriting user styles. Preview and commit validate the same faces and miters. Duplicate vertices, collapsed segments, 180° reversals, miters beyond limit 8 and collapsed faces are rejected. Joined corners belong to the same path; independent walls do not join automatically. Conversion preserves owner space, layer and source properties; Replace also preserves the original ID, and rejects bulges/smoothing without approximating curves.

Openings project onto the axis of the segment nearest the click, in drawing units independent of zoom. The whole width must fit clear of corners and miters; it is never silently clamped. No wall/style mutation occurs before Enter; Esc clears preview. Confirmation splits an open wall into two paths, or opens a closed wall into one perimeter path. The first path keeps the original wall ID. Door symbols use a leaf and real 90° arc; windows use jambs and two frame lines. Symbols belong to a native group: moving, editing or deleting an opening rebuilds the wall and preserves other openings.

Each completed command is one undo/redo step. Esc during WALL retains completed segments under the runner contract; cancel before the second point leaves no wall/style. Errors roll back the whole command group. Room, conversion and openings mutate only on confirmation.

Native .fmodel preserves walls, styles and symbols with no format version change. DXF decomposes MLINE into lines including straight caps; leaves/frames/jambs are LINE and door swings ARC. Wall style/identity does not survive as MLINE in DXF; the export report describes decomposition. DWG scope is unchanged.

## Evidencia / Evidence

`src/geometry/walls.test.ts`, `src/commands/behavior/architecture.test.ts`, `src/io/architecture.test.ts`. ARC-002 core was approved in CI 37022156512; ARC-004 associated straight-wall lifecycle was approved in CI 37131723475 with six controller-reviewed captures.

## Ciclo asociado ARC-004 / Associated opening lifecycle

Los huecos creados ahora conservan el recorrido completo del muro, un grupo nativo y roles por hueco. La selección de jamba, hoja, arco o marco identifica un hueco explícito; un fragmento de muro sirve para añadir huecos o cambiar espesor, pero nunca elige uno de varios huecos. Todos los miembros deben pertenecer al espacio editable, ser visibles y estar desbloqueados. Los grupos legados incompletos no se convierten por inferencia. / New openings retain the complete wall source, native group and per-opening roles. Jamb, leaf, arc or frame selects an explicit opening. A wall fragment can add openings or change thickness but never guesses which opening to edit. Every member must be in the editable space, visible and unlocked. Incomplete legacy groups are not inferred.

| Comando / alias | Entradas / Inputs |
|---|---|
| `OPENINGMOVE` / `MOVERHUECO` | Símbolo/jamba, nuevo centro en el mismo muro, Intro. Repara el hueco anterior. / Symbol/jamb, new center on the same wall, Enter; repairs old gap. |
| `OPENINGCOPY` / `COPIARHUECO` | Símbolo/jamba, muro destino (admite el mismo), nuevo centro, Intro. / Symbol/jamb, destination wall (same allowed), center, Enter. |
| `OPENINGEDIT` / `EDITARHUECO` | Símbolo/jamba, Ancho/Tipo/Lado/Bisagra, Intro. / Symbol/jamb, Width/Type/Side/Hinge, Enter. |
| `OPENINGMIRROR` / `REFLEJARHUECO` | Símbolo/jamba, Eje (lado), Centro (bisagra), Ambos, Intro. / Symbol/jamb, Axis (side), Center (hinge), Both, Enter. |
| `OPENINGDELETE` / `BORRARHUECO` | Símbolo/jamba, Intro; el último restaura recorrido, ID y propiedades. / Symbol/jamb, Enter; last deletion restores source path, ID and properties. |
| `WALLTHICKNESS` / `ESPESORMURO` | Muro o miembro asociado, espesor positivo en unidades del dibujo, Intro. / Wall or associated member, positive thickness in drawing units, Enter. |

Puerta/ventana admiten Ancho/Tipo y puerta Lado/Bisagra antes de confirmar. Tipos: sencilla, doble, corredera, fija, vacío. Vista previa y confirmación reconstruyen la misma geometría sin escribir hasta Intro; Esc en cualquier fase descarta la operación pendiente. Máximo 500 vértices, 200 huecos y 2000 primitivas; segmentos rectos compatibles ±0.5, sin redes T/X, recorte de columnas, curvas o huecos de esquina. `.fmodel` conserva asociación/IDs sin cambio de versión; DXF exporta fragmentos y símbolos pero pierde la asociación editable con advertencia. / Door/window allow Width/Type and door Side/Hinge before confirmation. Types: single, double, sliding, fixed, empty. Preview and confirmation rebuild the same geometry without writing before Enter; Esc at any stage discards pending edits. Limits: 500 vertices, 200 openings, 2000 primitives on compatible straight ±0.5 walls. No T/X network or curved/corner openings. Native files retain association/IDs without format bump; DXF exports physical geometry but warns of lost editable association.

ARC-002 acreditó el núcleo previo; ARC-004 está cerrado para muros rectos compatibles tras [CI 37131723475](https://github.com/klkmoraa/FModel/actions/runs/37131723475) y [seis capturas revisadas](brandbook/openings-qa.md). Redes T/X, recorte de columnas y huecos curvos/de esquina siguen pendientes. / ARC-004 is closed for compatible straight walls after CI and six reviewed captures; networks, column trimming and curved/corner gaps remain outstanding.
