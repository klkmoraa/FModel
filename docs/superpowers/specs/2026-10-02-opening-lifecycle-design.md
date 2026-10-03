# Huecos asociados: editar la puerta y reparar el muro

Módulo siguiente del diseño YQARCH nativo. La edición especializada debe conservar un muro completo como origen y reconstruir sus huecos dentro de una sola transacción. Se amplían los comandos WALLDOOR/WALLWINDOW existentes, sin duplicar sus nombres ni cambiar los muros independientes que no se utilizan.

## Resultado

Un hueco conserva su muro, segmento, distancia sobre el eje, ancho, tipo y orientación. Moverlo rellena su ubicación anterior y corta la nueva; copiarlo deja el original y crea otro corte; cambiar ancho/tipo o bisagra reconstruye el símbolo; borrarlo cierra el corte. Varios huecos pueden compartir un mismo recorrido abierto o cerrado. El último borrado recupera exactamente el recorrido original, su ID y propiedades.

Este subproyecto cubre muros de tramos rectos compatibles con el estilo actual de dos caras ±0.5. No declara las uniones T/X ni huecos curvos/de esquina implementados: tienen otro módulo. Las variantes de planta son puerta de una hoja, dos hojas iguales, corredera, ventana fija y hueco sin símbolo.

## Geometría y validación

Cada abertura tiene ID estable, segmento entero, offset (distancia positiva hasta el centro desde el vértice inicial del segmento), ancho, tipo, side=±1 e hingeEnd booleano. Se calcula sobre el eje original, usando los límites de caras de wallFaces para despejar esquinas. Se ordenan los intervalos por recorrido y se rechazan solapamientos o contactos dentro de linearTol. Nunca se ajusta un valor imposible silenciosamente. Hasta 200 aberturas, 2000 primitivas de salida y recorridos de hasta 500 vértices.

Un constructor puro recibe el WallPath original y todas las aberturas, devuelve los recorridos MLINE abiertos restantes y primitivas de símbolos con roles estables. Una puerta simple tiene dos jambas, hoja y arco real90°. Una doble tiene dos hojas/arcos de radio ancho/2; una corredera tiene dos hojas paralelas en el espesor con marca de dirección; ventana fija conserva dos líneas interiores y jambas; un hueco sólo jambas. Radios positivos, puntos finitos y medidas mayores que TOL.LINEAR. No se aproximan arcos con líneas.

En recorrido cerrado, el constructor enlaza por el camino original entre un extremo de hueco y el siguiente; el corte no deja líneas de cierre atravesándolo. En abierto, incluye tramos de ambos extremos y entre huecos. Si no hay aberturas, el resultado vuelve a ser exactamente el original (incluido closed).

## Modelo nativo

Un grupo seleccionable contiene todos los fragmentos MLINE y símbolos de una misma fuente. El primer MLINE conserva el ID/orden del muro original y es el miembro principal. Sus metadatos fmodelWallAssembly versión1 guardan fuente completa (vertices/closed/scale/justification/style y owner), groupId y aberturas. Los miembros guardan fmodelWallMember con groupId, anchorId, role y openingId opcional. No hay ancla oculta ni versión nueva del formato.

Los roles supervivientes conservan ID, orden y propiedades individuales. Añadir una abertura no recrea símbolos de otra. Quitar la última elimina el grupo y únicamente estos metadatos propios, conservando otros metadatos del muro. La fuente no incorpora IDs arbitrarios a eliminar. Si desaparece un rol, su ID se elimina de las pertenencias de otros grupos nativos dentro de la misma transacción: se conservan los registros de esos grupos, incluso vacíos, sus propiedades y el orden de los miembros supervivientes. Deshacer restaura las pertenencias originales; guardar y reabrir no requiere repararlas.

Fuente original significa el recorrido completo sin cortes vigente, no una copia histórica inmutable: WALLTHICKNESS actualiza su escala. Borrar el último hueco conserva ese nuevo espesor y las propiedades vigentes del miembro principal.

El lector valida esquema, límites, propietario, estilos, pertenencia exacta al grupo, roles únicos y geometría actual equivalente al constructor. Una copia individual fuera del grupo o una pieza modificada manualmente se rechaza antes de tocar nada; el mensaje explica que el grupo está incompleto/modificado. Nunca se reconstruye sobre geometría ajena. Los cambios de propiedades no invalidan geometría y se preservan. Todas las entidades afectadas deben ser editables (capas visibles/desbloqueadas y propietario vigente).

Los símbolos antiguos sin asociación permanecen geometría estándar; no se adivina su muro. Un MLINE compatible independiente se convierte en asociado al crear su primer hueco. Guardado .fmodel conserva asociación; DXF conserva geometría/textos y pierde asociación con advertencia bilingüe real en el informe.

## Comandos y secuencia

| Comando | Flujo |
|---|---|
| WALLDOOR / PUERTA, WALLWINDOW / VENTANA | Selección de muro o fragmento asociado; centro proyectado sobre la fuente; Ancho, Tipo y para puerta lado/Bisagra; Intro confirma. Conserva los defaults físicos900/1200mm y Esc sin cambios. |
| OPENINGMOVE / MOVERHUECO | Seleccionar símbolo/jamba de hueco; punto de centro sobre el mismo muro; vista previa rellena/corta; Intro confirma. |
| OPENINGCOPY / COPIARHUECO | Seleccionar hueco; seleccionar muro destino (puede ser el mismo); centro nuevo; Intro confirma. Copia parámetros y conserva el original. |
| OPENINGEDIT / EDITARHUECO | Seleccionar hueco; opciones Ancho, Tipo, Lado, Bisagra; Intro confirma todos los cambios juntos. |
| OPENINGMIRROR / REFLEJARHUECO | Seleccionar hueco; Eje cambia lado de apertura, Centro cambia bisagra, Ambos cambia ambos; vista previa e Intro. |
| OPENINGDELETE / BORRARHUECO | Seleccionar hueco; vista previa del muro reparado; Intro confirma, Esc cancela. |
| WALLTHICKNESS / ESPESORMURO | Seleccionar MLINE compatible/fragmento asociado; espesor positivo en unidades dibujo; reconstruir todas las caras y símbolos; Intro confirma. |

Seleccionar un fragmento para edición de hueco sólo es válido si contiene metadatos de openingId inequívoco; de lo contrario pedir seleccionar una jamba/hoja/marco. La selección de muros sí admite cualquier fragmento del grupo. No debe tomar todo el grupo y elegir una puerta al azar.

Todas las solicitudes usan CommandApi, preview y commit comparten el constructor. PreviewSpec incorpora hideIds opcional: el render omite temporalmente sólo esos IDs y los muestra al limpiar/cancelar, sin cambiar visibilidad o geometría del documento. La invalidación de escena se activa cuando cambia ese conjunto; los viewports y resaltados respetan esta exclusión temporal y los exportadores no la heredan. Las vistas previas no cambian el documento ni generan registros. Un fallo de geometría/argumentos o cancelación en cualquier solicitud pendiente no deja cambios; cada resultado usa un apply y un undo/redo. Medidas pertenecen al documento; defaults físicos convierten UNIT_TO_MM como muros actuales.

## Acceso y pruebas

Cinta/paleta Arquitectura agrupa las seis acciones de edición con nombres visibles y ayuda ES/EN; panel de componentes puede mostrar un bloque Huecos con acciones reales. Móvil usa mismos comandos y cancelación de la tarjeta existente, sin máquina de estados React independiente.

Pruebas de geometría: pared abierta10000 con huecos900 en2000 y7000; habitación cerrada6000×4000 con cortes en dos segmentos; cambio de ancho; doble90°; solapamiento/contacto, esquinas, NaN,200-límite. Pruebas runner: crear dos huecos, mover/editar/reflejar/copiar mismo y otro muro, borrar uno y último, espesor con reconstrucción; IDs/properties de roles intactos; unundo/redo por operación, cancelación cada fase, capas bloqueadas y metadatos/grupo/clone corruptos sin mutación. Guardado nativo tras edición y DXF con geometría exacta/advertencia. Navegador: habitación→dos huecos→mover→deshacer→borrar→deshacer en Día/Noche/teléfono y captura real. Backlog nuevo ARC-004, sólo cerrar tras verify y evidencia navegador.
