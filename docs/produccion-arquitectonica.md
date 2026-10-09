# Producción arquitectónica 2D / 2D architectural production

Desde Arquitectura → Producción, la paleta Arquitectura o la línea de comandos.
Las vistas previas se confirman con Intro y se cancelan con Esc. Los cambios y
sus actualizaciones vinculadas se deshacen juntos. / Use Architecture →
Production, the Architecture palette or the command line. Enter confirms,
Esc cancels; source changes and their linked updates share one undo step.

| Resultado / Result | Comando ES / EN | Uso / Use |
|---|---|---|
| Cotas / Dimensions | `COTASPLANO` / `WALLDIM` | Selecciona muros o contornos; ajusta separación y altura de texto. / Select walls or contours; set offset and text height. |
| Habitación / Room | `DATOSHABITACION` / `ROOMDATA` | Selecciona contorno cerrado; nombre, acabados y altura. / Select a closed boundary; enter name, finishes and height. |
| Cuadro de áreas / Room schedule | `CUADROAREAS` / `ROOMSCHEDULE` | Coloca el cuadro del espacio actual. / Place the current-space schedule. |
| Cuadro de materiales / Material schedule | `CUADROMATERIALES` / `MATERIALSCHEDULE` | Coloca el resumen de superficies por acabado. / Place the finish-area summary. |
| Red de muros / Wall network | `MUROSAUTO` / `WALLAUTO` | Sólido, Rayado, Sin relleno o Desactivar. / Solid, Hatched, None or Off. |
| Mover muro / Move wall | `MOVERMURO` / `WALLMOVE` | Selecciona muro/cara/símbolo y dos puntos. / Select a wall/face/symbol and two points. |
| Borrar muro / Erase wall | `BORRARMURO` / `WALLERASE` | Selecciona y confirma el conjunto completo. / Select and confirm the complete assembly. |
| Hojas / Sheets | `HOJASDESDEMARCOS` / `SHEETSET` | Selecciona marcos de Modelo; papel, escala, proyecto y nombre. / Select Model frames; paper, scale, project and name. |

## Cotas y habitaciones / Dimensions and rooms

En muros rectos nativos, las cotas separan extremos y jambas; añaden la medida
total cuando hay huecos. Para un muro cerrado se usa su contorno interior.
Mover manualmente la línea de cota conserva su separación al actualizar.
/ Native straight walls produce end/jamb chains and an overall row when needed.
Closed walls use the inner face; manual dimension offsets survive updates.

La habitación admite una polilínea recta cerrada o un muro nativo cerrado.
`ROOMDATA` crea la etiqueta de nombre/área y permite volver a editar los datos.
Los cuadros incluyen todas las habitaciones del espacio actual y cambian al
editar su geometría, nombre, acabados, altura o unidades. Las posiciones
manuales de las etiquetas se conservan. / A room uses a straight closed
polyline or native closed wall. `ROOMDATA` creates its name/area label and edits
its data. Schedules update with geometry, data and drawing units; manual label
offsets are retained.

Área de piso = interior del contorno. Superficie **bruta** de muro = perímetro ×
altura explícita; no descuenta puertas/ventanas ni infiere alturas. Unidades
físicas muestran m²/m; un dibujo sin unidades muestra unidades²/unidades.
No se admiten curvas, contornos cruzados ni islas interiores de habitación.
Máximo 100 habitaciones y 500 vértices por contorno; hasta 100 fuentes y
1000 cotas por lote. / Floor area uses the boundary interior. **Gross** wall
area is perimeter × explicit height, without opening deductions. Physical
units display m²/m; unitless drawings display units²/units. Straight simple
boundaries only, without room islands; at most 100 rooms, 500 vertices per
boundary, 100 dimension sources and 1000 dimensions per batch.

## Encuentros y rellenos / Junctions and fills

Activa `MUROSAUTO` en el espacio de trabajo. Incluye muros rectos compatibles
y columnas nativos, también los vecinos creados después. Las fuentes se
conservan ocultas y las caras visibles permiten insertar huecos o cambiar
espesor con los comandos nativos. Los símbolos mantienen la edición del hueco.
Usa `MOVERMURO` y `BORRARMURO` para trasladar o retirar el conjunto completo.
Los encuentros T/X y rellenos se recomponen automáticamente. / Enable the
current-space network for compatible native straight walls and columns,
including later neighbors. Hidden sources remain editable through generated
faces and opening symbols. Use `WALLMOVE`/`WALLERASE` for complete assemblies;
T/X junctions and fills update automatically.

Desactivar recupera las fuentes y retira las salidas generadas intactas.
Las salidas que editaste se conservan como dibujo independiente. Antes de
activar, restaura cualquier limpieza antigua de `WALLCLEAN`. Máximo 100
fragmentos/columnas y 5000 puntos. Si una fuente o una operación deja de ser
válida, se conserva el último resultado con una marca «Revisar»; corrige la
fuente para actualizar. / Off reveals sources and removes intact generated
outputs, retaining edited outputs as independent geometry. Restore legacy
`WALLCLEAN` first. At most 100 fragments/columns and 5000 points. Invalid
sources retain the last result with a Review mark until corrected.

## Hojas y PDF / Sheets and PDF

1. Dibuja y selecciona marcos rectangulares de Modelo alineados con los ejes.
   / Draw and select axis-aligned rectangular Model frames.
2. Ejecuta `HOJASDESDEMARCOS`: A3/A4 horizontal, escala física (por ejemplo
   `1:50`), título y nombre de hojas. Se comprueba que cada marco cabe completo;
   si no cabe, cambia marco, papel o escala. / Run `SHEETSET`: A3/A4 landscape,
   physical scale, project title and sheet name; every frame must fit entirely.
3. Confirma. Crea hasta 50 presentaciones, borde, cajetín y viewport bloqueado,
   con nombres únicos. Son hojas nativas editables; los marcos no son un vínculo
   de regeneración. El dibujo dentro del viewport sigue al Modelo. / Confirm
   up to 50 native editable layouts with border, title block, locked viewport
   and unique names. Frames are creation inputs; viewport content follows Model.
4. Abre `PUBLISH` / Publicar, elige las presentaciones y descarga el PDF de varias
   páginas. / Open Publish, choose layouts and download a multi-page PDF.

## Guardado / Saving

Guarda en `.fmodel` para conservar asociaciones (formato nativo v6, migración
desde versiones anteriores). Copiar objetos genera contenido independiente.
DXF conserva su representación fija y avisa de la pérdida de automatización;
la recuperación de fuentes ocultas pertenece al formato nativo. / Save as
`.fmodel` to retain associations (native v6 with previous-version migration).
Copies are independent; DXF retains static content with an automation-loss
warning. Hidden-source recovery requires native data.

[Verificación y capturas / QA and captures](brandbook/architectural-production-qa.md).
Este alcance cubre producción 2D con muros rectos; continúan pendientes huecos
curvos/de esquina e interiores/detalles más amplios. / This covers straight-wall
2D production; curved/corner openings and broader interiors/details remain pending.
