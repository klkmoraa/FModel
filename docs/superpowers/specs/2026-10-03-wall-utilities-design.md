# Ejes físicos y muros paralelos por distancia libre

## Intención y referencia

El usuario quiere dibujar arquitectura con menos pasos e incorporar los resultados útiles de YQARCH nativamente; concede libertad total de diseño y mantiene la ejecución con «continúa». Este subproyecto desarrolla otra parte del módulo de muros. La documentación del paquete oficial 6.7.4c registra yq_wall2axis/WWA (obtener el eje central físico) y yq_wall_cdoffset/WWO (desplazar por distancia libre). Fuente documental: sys/shortcut_6.7.4c.yqs, sys/yqshortcut.txt y sys/yqpanel.txt, referenciadas en docs/yqarch/cobertura.csv; la ayuda extraída del paquete conserva esas descripciones. No se ejecuta ni reutiliza código del plugin.

Es una integración arquitectónica pequeña: geometría pura, comandos nativos, acceso visual y persistencia. Se elige construir encima de wallFaces y readWallSource porque conocen justificación, espesor y fuente sin cortes. OFFSET genérico mide respecto de una curva y puede producir arcos o múltiples cadenas, por lo que no garantiza distancia libre de muro. Inferir dos líneas independientes ampliaría el problema a reconocimiento/topología; se reserva para otro subproyecto.

## Requisitos globales

- FModel sigue siendo CAD 2D local-first, sin backend, telemetría ni peticiones nuevas de red desde la aplicación.
- Toda geometría pertenece a las unidades del dibujo. Defaults y presets físicos se convierten con UNIT_TO_MM; documentos sin unidad usan los mismos valores numéricos explícitos.
- Todas las modificaciones pasan por CommandApi.apply/CadDocument.transact. Cancelar una operación pendiente no crea entidades, estilos ni registros; una operación terminada tiene undo/redo coherente.
- Las entidades y grupos nativos, propiedades, capas, espacios e IDs estables se conservan. No se amplía DWG ni se cambia el formato nativo para introducir un componente.
- Las geometrías, metadatos y parámetros importados se validan antes de utilizarlos. Ningún constructor admite valores no finitos, medidas colapsadas ni cantidades que bloqueen la interfaz.
- Interfaz y ayuda en español e inglés; teclado, foco visible, teléfono y Día/Noche; colores y materia de los tokens existentes.
- El código y las pruebas determinan el estado de una función. No se declara equivalencia funcional por tener un alias o por poder dibujar manualmente el resultado.

## Geometría y límites

wallCenterAxis(path:WallPath): {vertices:Vec2[],closed:boolean} devuelve el punto medio de las dos caras en cada vértice, incluyendo ingletes. No es necesariamente path.vertices: las justificaciones top/bottom desplazan la referencia. Admite recorridos rectos abiertos/cerrados hasta 500 vértices, valida caras y no modifica ni comparte arrays de entrada.

parallelWall(path:WallPath, clearance:number, side:1|-1, thickness:number=path.scale):WallPath produce un muro nuevo vacío, centrado (justification zero), abierto/cerrado como la fuente. Hasta 200 vértices; clearance finito >=0 y thickness finito positivo. El eje físico se desplaza hacia la izquierda/derecha del sentido del recorrido una distancia clearance+(path.scale+thickness)/2; respeta ingletes y orientación original. El resultado usa caras rectas nativas, sin aproximar esquinas con arcos. Los muros origen/destino y sus caras no pueden cruzarse, colapsar ni tener autointersecciones o solapes no adyacentes. Se rechazan retornos cercanos que incumplan la separación libre global, no sólo los pares de segmentos correspondientes. Cero permite contacto de caras, nunca interior material solapado. Reutilizar wallFaces para desplazar una cara unilateral evita duplicar la construcción de ingletes; validar también contornos, distancias mínimas entre segmentos y pertenencia al material cuando se necesite. Tolerancias TOL/linearTol de coordenadas mundo.

WallUtilityError(code:string) da mensajeI18n es/en específico y accionable para recorrido inválido, límite, medidas, colapso o separación imposible. No ocultar errores inesperados. Métodos son puros y sin imports hacia capas superiores.

## Comandos e interacción

WALLAXIS/EJEMURO: selecciona muro independiente compatible o cualquier miembro de ensamblaje asociado válido, obtiene fuente sin cortes, muestra polilínea central y pide Intro para crear. Esc descarta. Se crea una lwpolyline estándar con bulges cero, ancho cero, closed correspondiente; el muro y sus huecos se conservan. No se crea relación paramétrica futura.

WALLOFFSET/PARALELAMURO: selecciona origen, pide distancia libre (default 1000 mm convertido; sin unidad 1000), pide punto para elegir lado con keywords Izquierda/Left y Derecha/Right, muestra muro paralelo y solicita Intro. En confirmación permite Distancia/Gap, Espesor/Thickness, Izquierda/Left y Derecha/Right; cada cambio regenera preview con el mismo constructor. Espesor inicial igual al origen. Un punto sobre el eje no elige lado arbitrariamente; informa error y no escribe. Selección de lado usa el segmento central físico más cercano (desempate primer segmento), sin ortho ni snap que distorsione la elección.

Ambos comandos usan readWallSource validado, aceptan fragmento o símbolo de un ensamblaje íntegro, rechazan grupos incompletos/alterados/legados incompatibles. Verifican propietario inputOwner y editabilidad/visibilidad de todos los miembros al seleccionar y justo antes de apply. Releen y comparan fuente completa, asociación y propiedades utilizadas: si el origen cambió durante prompts, rechazan sin escribir. El resultado hereda capa, propietario y propiedades gráficas del ancla actual; copia metadata libre pero elimina fmodelWallAssembly/fmodelWallMember y cualquier identidad paramétrica específica. IDs/orden nuevos, ningún cambio al grupo origen. WALLOFFSET conserva estilo compatible del origen, no crea estilos. Se prohíbe clonar los huecos y sus tags al nuevo muro: el resultado es un muro paralelo vacío y la ayuda lo indica explícitamente. Es compatible con WALLDOOR/WALLWINDOW posteriores.

Preview aditivo estándar, no hideIds ni mutación; cleanup en Esc/error. Un apply y un paso undo/redo con valores exactos. No se registran aliases WWA/WWO automáticamente: referencias documentales permanecen en matriz y ayuda para no sobrescribir aliases ajenos. Canonicales y españoles sí se registran una vez mediante ARCHITECTURE_COMMANDS.

## Acceso y evidencia

Dos acciones ES/EN en cinta Arquitectura, paleta y panel Arquitectura, agrupadas como herramientas de muro. El panel usa onStart existente para cerrar hoja de teléfono y devolver foco al lienzo. Nombres accesibles, tamaños táctiles y tokens vigentes. UI no implementa geometría ni otro flujo de mutación.

Pruebas de dominio fijan eje físico para zero/top/bottom, horizontal/vertical/diagonal, esquina L y habitación cerrada; separación real con espesor destino distinto; izquierda/derecha y orientación invertida; cero; colapso interior, retornos cercanos, autointersecciones, colineal solapado, no finitos y límites, invariancia trasladada/rotada y coordenadas grandes. Comandos cubren entidad/miembro, mm/m/sin unidad, cada etapa cancelable, mal grupo/capa/owner y cambio intercalado, preview sin historial, original intacto y undo/redo. Guardado nativo y DXF mantienen eje/distancia real; no hay nueva pérdida de parámetros en los nuevos objetos estándar.

Recorridos Chromium reales Día/Noche × escritorio/teléfono táctil crean muro con hueco, extraen eje completo y crean paralelo vacío, comprueban distancia entre caras y resultado renderizado, preview/undo/redo/cancelación y acceso visual. Capturas originales completas y hojas asentadas; aprobación visual del controlador antes de cerrar backlog nuevo ARC-005. pnpm verify para integración transversal; ninguna ejecución local de navegador (el controlador usa GitHub Actions autorizado).

## Alcance pendiente

No cierra módulo 2 ni paridad completa con YQARCH: faltan redes T/X, columnas, ejes inferidos de líneas sueltas, curvas, huecos de esquina y rellenos. No cambia ARC-004 ni el historial de la matriz base. ARC-005 se cierra sólo por estos dos resultados verificables.
