# Producción arquitectónica 2D asociativa

El usuario autorizó implementar los cuatro resultados propuestos: cotas automáticas, áreas/materiales, encuentros/rellenos automáticos y hojas desde marcos. Se ejecutan en esta sesión, con verificaciones proporcionales y sin nueva publicación implícita.

## Cotas (ARC-011)

`WALLDIM` / `COTASPLANO` selecciona muros o contornos rectos de habitaciones. Pide separación y altura del texto, previsualiza y confirma con Intro. Genera DIMENSION nativas: cadena por extremos de tramo/jambas y una segunda línea de medida total. Los muros cerrados permiten acotar el contorno interior. La asociación conserva IDs y posición manual de la línea de cota; altas/bajas y undo ocurren con el cambio de origen. No se infiere acotación de curvas, escaleras ni ejes no seleccionados.

## Habitaciones y materiales (ARC-012)

`ROOMDATA` / `DATOSHABITACION` registra nombre, acabado de piso, acabado de muro y altura explícita en un contorno cerrado recto o habitación de muro nativo. Un TEXT asociado muestra nombre y área neta del contorno. `ROOMSCHEDULE` / `CUADROAREAS` y `MATERIALSCHEDULE` / `CUADROMATERIALES` crean TABLE vinculadas al espacio actual. Calculan área de piso, perímetro y superficie bruta de acabado de muro (perímetro × altura), con unidades reales y agrupación por material. La tabla identifica la superficie bruta: no descuenta puertas sin altura disponible. Se rechazan contornos abiertos, curvos o autointersectados; no se inventan huecos interiores. Editar el contorno o sus datos actualiza etiqueta y cuadros.

## Muros automáticos (ARC-013)

`WALLAUTO` / `MUROSAUTO` habilita por espacio una red de muros rectos nativos y columnas nativas: reutiliza limpieza T/X y HATCH Sólido/Rayado. Mantiene fuentes, símbolos y geometría paramétrica; las caras LINE visibles permiten seleccionar la fuente oculta para las operaciones nativas. `WALLMOVE` / `MOVERMURO` y `WALLERASE` / `BORRARMURO` operan el conjunto nativo completo. Añadir/mover/editar/borrar vecinos o huecos recompone encuentros y rellenos dentro de la transacción. Desactivar revela las fuentes y retira únicamente salidas generadas intactas. Salidas editadas se conservan independientes. No mezcla el registro legado de WALLCLEAN; una instantánea anterior debe restaurarse antes de habilitar la red. Los límites previos de limpieza/topología continúan y un error conserva el último resultado con aviso visible.

## Hojas (ARC-014)

`SHEETSET` / `HOJASDESDEMARCOS` toma marcos rectangulares de Modelo. Pide ISO A3/A4, escala física, título de proyecto y nombre de hojas; muestra los marcos elegidos y confirma. Crea en una sola transacción presentaciones nativas, borde, cajetín TEXT y viewport bloqueado con centro del marco y escala exacta. Comprueba que cada marco cabe: no recorta silenciosamente ni sobrescribe hojas anteriores. Nombres y números únicos; máximo 50 hojas. `PUBLISH` existente produce el PDF de varias presentaciones mediante una acción explícita del usuario.

## Arquitectura y conservación

GroupRecord incorpora configuración tipada de cotas/red con versión 1, referencias, correspondencia de claves/IDs y snapshots del contenido generado. RoomData/RoomLabel/RoomSchedule son campos opcionales tipados de entidades. Formato nativo v6: migración v5 conserva asociaciones anteriores y elimina sólo los campos nuevos inexistentes en versiones previas. Validación estructural y reparación de referencias preceden a tocar un dibujo; vínculos rotos conservan contenido visible. Copias independientes desasocian estos campos. Capas, estilos, purga y exportación conocen las referencias nuevas. React sólo presenta los comandos; los reactores del modelo son acotados, idempotentes y transaccionales. Fuente inválida conserva resultado y pide revisión; no impide el cambio del dibujo.

## Verificación

Una regresión focalizada por riesgo real: unidades/contornos degenerados, asociación/altas/bajas/undo, cancelación/persistencia, red editable sin restaurar y hojas/escala/PDF. Tipos, capas y lint por los módulos cambiados; build público y una escena Día/Noche. Sin suite completa ni cobertura. No backend, red nueva en producto, 3D ni ampliación DWG.

## Resultado local — 2026-10-09

Implementado dentro de este alcance. [Guía](../../produccion-arquitectonica.md), [QA y revisión](../../brandbook/architectural-production-qa.md). Hojas editables, sin asociación posterior a los marcos de creación; sus viewports siguen el contenido de Modelo.
