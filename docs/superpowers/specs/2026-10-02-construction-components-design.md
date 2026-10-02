# Componentes arquitectónicos 2D: creación y edición por parámetros

Primer módulo del [objetivo YQARCH nativo](2026-10-02-yqarch-native-design.md). Amplía las herramientas de muros existentes con piezas de construcción y una interfaz para colocarlas sin recordar secuencias de comandos.

## Resultado requerido

Se incorporan 14 familias de componentes, con geometría nativa, medidas adaptadas al documento, vista previa y edición por parámetros:

| Familia / comando | Variantes y parámetros iniciales en mm |
|---|---|
| Columna / `COLUMN` | Rectangular, circular, L, T, cruz; ancho 400, fondo 400, brazo 150; círculo diámetro 400 |
| Retícula / `AXISGRID` | 4 ejes verticales y 3 horizontales, separaciones 4000/4000, margen 500, burbuja 150; letras horizontales y números verticales |
| Escalera en planta / `STAIRPLAN` | Recta, L, U, curva; ancho 1000, huella 280, 16 peldaños, descanso 1000, radio interior 1000, giro 90 grados |
| Escalera en sección / `STAIRSECTION` | Huella 280, contrahuella 170, 16 peldaños, losa 150; peldaños reales y línea inferior de losa |
| Escalera mecánica / `ESCALATOR` | Planta/alzado; ancho 1200, altura 3000, ángulo 30 grados, plataformas de 1000; tramo inclinado derivado de altura/ángulo |
| Elevador / `LIFTPLAN` | Hueco 2200×2200, cabina 1600×1600, puerta 900 y pared 150; entrada abierta y cabina interior |
| Puerta en alzado / `DOORELEVATION` | Una/dos hojas; ancho 900, alto 2100, marco 50, dos hojas de igual ancho cuando se elige doble |
| Puerta en sección / `DOORSECTION` | Alto 2100, pared 200, marco 50, umbral 20; marco y hoja diferenciados |
| Ventana en alzado / `WINDOWELEVATION` | Ancho 1200, alto 1200, marco 50, 2 columnas y 1 fila; paños reales y opción de diagonales de apertura |
| Ventana en sección / `WINDOWSECTION` | Alto 1200, antepecho 900, pared 200, marco 50, vuelo de alféizar 60 |
| Ventana saliente en sección / `BAYWINDOWSECTION` | Fondo 500, alto 1200, antepecho 900, pared 200, losa 150 |
| Muro cortina en alzado / `CURTAINWALL` | Ancho 6000, alto 3000, 5 columnas, 3 filas, montante 50 |
| Mampara en planta / `GLASSPARTITION` | Largo 6000, espesor 80, paneles 1000; dos caras y juntas de panel |
| Barandal / `BANISTER` | Planta/alzado; largo 4000, alto 1000, separación máxima de postes 1000, espesor 40; postes repartidos sin exceder esa separación |

Los conteos admiten enteros de 1 a 200; escaleras requieren al menos 2 peldaños. Radio y medidas deben superar `TOL.LINEAR`. Marcos, brazos y losas deben caber en la geometría que delimitan; cabina y puerta deben caber en el hueco. Ángulos de escalera mecánica: 10–60 grados. Giro de escalera curva: 15–270 grados. El constructor valida antes de emitir geometría y acota la salida a 2000 primitivas. No se aproximan círculos/arcos como polígonos cuando hay entidades nativas equivalentes.

## Contratos de creación y edición

Los comandos aceptan argumentos `clave=valor`: valores dimensionales numéricos pertenecen a las unidades vigentes; valores con `mm`, `cm`, `m` o `in` son físicos y se convierten. Conteos y enums no se convierten. `rotation=90` significa 90 grados; el estado y la geometría guardan radianes. Se rechazan claves desconocidas y parámetros repetidos/incorrectos, sin modificar el documento.

Flujo: inicializar parámetros desde los argumentos y los defaults físicos del documento → punto de inserción con opciones Parámetros/Giro → clic confirma. Parámetros permite elegir un campo y editarlo con las solicitudes de `CommandApi`; Giro solicita ángulo. Intro en el primer punto cancela sin crear nada. Toda la vista previa y el resultado usan el mismo constructor y transformación.

`COMPONENTEDIT` selecciona cualquier miembro de una pieza, carga sus parámetros validados, permite cambiar campos y confirma con Intro. Antes de confirmar, el documento sigue intacto. Un cambio conserva el ID y orden de cada primitiva cuyo rol estable siga existiendo y no altera objetos ajenos. Si falta el grupo, un miembro o la información es inválida, se explica y no se modifica. Un miembro copiado fuera del grupo no debe editar su pieza original.

Cada pieza es un `GroupRecord` nativo con miembros seleccionables. La primera primitiva lleva `meta.fmodelComponent` con versión 1, grupo, tipo, parámetros, punto y giro; los miembros llevan el grupo, el ID del miembro principal y su rol estable. Se utiliza la estructura existente de metadatos, sin versión nueva de `.fmodel`. Los metadatos se comprueban contra grupos, miembros, propietario y roles antes de editar; no se confía en datos importados.

Las primitivas son LINE, ARC, CIRCLE, LWPOLYLINE y TEXT estándar. Heredan capa, espacio, color, tipo/grosor de línea y transparencia actuales; no crean ni alteran estilos del usuario. Texto de ejes/dirección usa el estilo actual. Cambiar el idioma de interfaz no traduce texto ya dibujado. DXF conserva la geometría y los textos; la edición paramétrica sólo se conserva en formato nativo y se documenta esta pérdida en el informe de conversión si corresponde.

## Interfaz

El panel Arquitectura contiene búsqueda, categorías, miniatura vectorial, variante/vista y campos de parámetros con unidad visible. «Colocar» ejecuta el comando con argumentos de la misma validación; «Editar pieza» ejecuta `COMPONENTEDIT`. Errores de formulario se muestran junto al campo y no inician un comando. Los campos derivados se muestran como resultado, no como parámetros independientes contradictorios.

En escritorio el panel es flotante/acoplable siguiendo los paneles existentes. En teléfono utiliza la hoja de paneles y no abre el teclado al entrar. La cinta/paleta muestra las piezas principales, y la búsqueda encuentra sus comandos y alias españoles. No se registran todos los alias YQARCH de manera global; los identificadores de referencia se documentan y se podrán ofrecer como un perfil optativo sin conflictos.

## Pruebas y criterios

- Medidas y cantidad de peldaños/paneles/postes; arcos de escalera curva; abertura de cabina; marco/paños en alzado; sección con altura correcta.
- Defaults equivalentes en mm, m y sin unidad, y argumentos físicos/nativos; entradas no finitas, conteos fraccionarios, marco excesivo y geometría colapsada rechazados.
- Clic crea una pieza agrupada, cancelar/argumento erróneo no deja entidades/grupos/estilos; undo/redo actúa sobre toda la pieza.
- Editar un miembro conserva roles/IDs y propiedades; un grupo incompleto, metadatos importados inválidos y una copia ajena no modifican el original.
- Guardado nativo y DXF de retícula, escalera curva y ventana editada, conservando medidas, curvas y textos.
- Formulario, teclado y colocación reales en Día/Noche y teléfono; `pnpm verify` y revisión de código.
