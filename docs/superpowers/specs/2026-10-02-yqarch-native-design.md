# Arquitectura y producción CAD nativas con referencia YQARCH

## Objetivo y autorización

El usuario pide incorporar las funciones de YQARCH de forma nativa en FModel y simplificar el trabajo de planos. Su petición anterior concede libertad de diseño e implementación y la instrucción «continúa» mantiene esa autorización. Se conservan los muros ya implementados. Los cambios se revisan y prueban en `codex/architecture-tools` y se entregan mediante el PR existente.

La referencia es el paquete oficial **YQArch 6.7.4c, 2023-07-24**, obtenido de `http://www.yqarch.cn/mydown/yqarch.rar`. La página oficial sigue anunciando 6.7.4. Los archivos documentales de ese paquete describen 499 entradas principales en 22 grupos y paneles suplementarios. Una entrada de menú, un preset y un comando de geometría no son tres capacidades distintas. El inventario debe conservar esa distinción y las referencias documentales.

## Requisitos globales

- FModel sigue siendo CAD 2D local-first, sin backend, telemetría ni peticiones nuevas de red desde la aplicación.
- Toda geometría pertenece a las unidades del dibujo. Defaults y presets físicos se convierten con `UNIT_TO_MM`; documentos sin unidad usan los mismos valores numéricos explícitos.
- Todas las modificaciones pasan por `CommandApi.apply`/`CadDocument.transact`. Cancelar una operación pendiente no crea entidades, estilos ni registros; una operación terminada tiene undo/redo coherente.
- Las entidades y grupos nativos, propiedades, capas, espacios e IDs estables se conservan. No se amplía DWG ni se cambia el formato nativo para introducir un componente.
- Las geometrías, metadatos y parámetros importados se validan antes de utilizarlos. Ningún constructor admite valores no finitos, medidas colapsadas ni cantidades que bloqueen la interfaz.
- Interfaz y ayuda en español e inglés; teclado, foco visible, teléfono y Día/Noche; colores y materia de los tokens existentes.
- El código y las pruebas determinan el estado de una función. No se declara equivalencia funcional por tener un alias o por poder dibujar manualmente el resultado.

## Producto e interacción

Un espacio de herramientas de Arquitectura organiza crear, editar, anotar y medir. Los nombres visibles describen acciones: Muro, Habitación, Columna, Escalera, Puerta, Ventana, Cotas del plano, Cuadro de huecos y Detalle constructivo. La búsqueda encuentra esos nombres y las referencias/alias YQARCH sin sobrescribir alias de FModel o del usuario.

Los componentes paramétricos tienen un formulario de medidas, variante y vista; ofrecen una miniatura vectorial y una acción «Colocar». Esa acción usa el mismo comando nativo que el teclado. En el lienzo se muestra la geometría real antes del clic, con opciones Parámetros y Giro. Las piezas creadas se editan por parámetros y también siguen siendo geometría CAD estándar exportable.

Las herramientas generales existentes se reutilizan cuando cumplen el resultado documentado. Las automatizaciones especializadas tienen lógica propia: mover una puerta incluye reparar y volver a cortar su muro; acotar un plano distingue ejes, huecos y límites; un cuadro de materiales calcula cantidades y unidades. Los estados incompletos quedan documentados, sin botones que simulen operaciones.

## Módulos de implementación

Cada módulo tiene una especificación/plan propio, pruebas y un resultado utilizable. La matriz de cobertura conserva cada identificador documental, resultado nativo, evidencia y limitación; se actualiza al terminar cada módulo.

1. **Componentes de construcción:** columnas, ejes y retículas, escaleras rectas y curvas, secciones, elevadores, escaleras mecánicas, puertas/ventanas en alzado y sección, fachadas y barandales; parámetros editables y acceso visual.
2. **Muros y ciclo de huecos:** uniones T/X y columnas, espesores, ejes, distancias libres y relleno; huecos rectos/curvos/esquina, tipos de puerta/ventana, mover/copiar/reflejar/reemplazar/eliminar reparando el muro.
3. **Interiores y detalles:** distribución de sanitarios/mobiliario, armarios y cortinas, alzados interiores; capas de materiales, perfiles, bastidores, aislamiento, tuberías, juntas, placas, agujeros y subdivisiones.
4. **Anotación y acotación de arquitectura:** ejes numerados, cotas coordinadas de habitaciones/huecos/escaleras, niveles, coordenadas, pendientes, cortes, índices y títulos; división/fusión y reparación de cotas.
5. **Estadística y producción de datos:** numeración, cuadros de huecos/materiales/coordenadas, áreas, reparto y peso por densidad; tablas nativas y CSV/portapapeles para los resultados que YQARCH transporta mediante Office.
6. **Texto y operaciones numéricas:** diccionarios locales, formato/contenido por lotes, incrementos, sustitución, expresiones, dividir/unir/reordenar texto, texto sobre curvas y listas de distancias.
7. **Geometría y modificación:** simplificación, contornos, aproximaciones explícitas, normales, envolventes; pares de líneas, cortes múltiples y detalles; transformaciones por objeto, colocación en puntos, diagnóstico y corrección de dibujo.
8. **Estándares y hojas:** bloques/atributos, autoría de patrones y tipos de línea, capas por lotes e intercambio de estándares, pinceles semánticos; viewports coordinados, hojas desde marcos, catálogos, ensamblaje y salida.
9. **Disposición especializada:** vegetación y paisajismo, luminarias, circuitos, conexiones y subdivisión de imágenes.

Los 126 elementos inicialmente sin conclusión ya fueron clasificados por flujo real en la [matriz de cobertura](../../yqarch/README.md), con evidencia de la base ef7e1ac. La clasificación estática no establece equivalencia probada: cada módulo debe aportar pruebas del resultado y conservar las limitaciones pendientes.

## Límites de la referencia

Instalar/desinstalar AutoCAD, cargar LISP/PGP, abrir carpetas del sistema y lanzar otros plugins son integraciones del anfitrión. Sus resultados útiles se expresan mediante herramientas nativas de FModel cuando corresponda. Las funciones explícitas de Z, extrusión, 3DFACE y Google Earth 3D permanecen fuera del CAD 2D; DWG mantiene su restricción de licencia. Los alzados y secciones 2D sí forman parte del objetivo.

No se incluyen programas compilados, código propietario, dibujos ni bibliotecas del paquete de referencia. Se implementa el comportamiento con las primitivas y contratos de FModel.

## Verificación y entrega

La verificación se elige por cambio y riesgo concreto, con sólo las pruebas mínimas necesarias según `AGENTS.md`. No se exige una matriz fija, suite completa, cobertura ni `pnpm verify`. El catálogo y el backlog registran únicamente las comprobaciones realmente realizadas sobre el código final.

La entrega final indica cobertura verificada y excepciones. La existencia del inventario de referencia no significa que todas las capacidades ya estén implementadas.
