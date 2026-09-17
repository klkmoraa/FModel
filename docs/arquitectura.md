# Arquitectura de FModel 2D CAD

Aplicación web (Vite + React 19 + TypeScript) sin servidor: todo el cálculo, el guardado y la exportación ocurren en el navegador. React solo dibuja la interfaz; el modelo, los comandos y el renderizado no dependen de React.

## Capas

La dependencia entre módulos es estrictamente descendente y la verifica `pnpm check:layers` (`scripts/check-layers.mjs`) en cada ejecución de CI. Las importaciones `import type` no cuentan como dependencia.

| Capa | Módulos | Responsabilidad |
|---|---|---|
| 0 | `geometry`, `lib`, `view` | vectores, matrices, curvas (línea, arco, elipse, spline NURBS, polilínea con bulges), intersecciones analíticas y numéricas, desfase, empalme, contornos con islas, expresiones, transformación mundo ↔ pantalla |
| 1 | `document`, `history` | registros inmutables en `Map`, transacciones con antes/después, historial agrupable, reactores al confirmar |
| 2 | `model`, `spatial`, `constraints`, `layers`, `annotation` | comportamiento de cada tipo de entidad, índice espacial R-tree por espacio, resolvedor de restricciones, operaciones de capas, asociatividad de cotas |
| 3 | `selection`, `snap`, `blocks`, `modify`, `audit`, `io`, `storage`, `xref`, `app` | designación, referencias a objetos y rastreo, bloques dinámicos, edición geométrica, auditoría y comparación, formatos (nativo, DXF), IndexedDB y archivos, referencias externas, localizador de servicios y catálogo de funciones |
| 4 | `render`, `output`, `workers` | dibujo Canvas por lotes, capa de ayudas, salida vectorial PDF/SVG, operaciones pesadas en segundo plano |
| 5 | `commands`, `editor` | registro y ejecución de comandos, estado interactivo del editor |
| 6 | `ui`, `pwa`, `main` | componentes React, paneles, diálogos, service worker y arranque |

## Documento y transacciones

- **Contrato** (`document/types.ts`): coordenadas siempre en unidades de dibujo; referencias por ID estable (renombrar una capa o un bloque no toca las entidades); cada entidad lleva propietario (`*model`, ID de presentación o de bloque), capa, color, tipo y escala de línea, grosor, transparencia, visibilidad, bloqueo y clave de orden de dibujo.
- **Transacciones** (`document/document.ts`): los cambios se aplican al instante y se registran como pares antes/después; si la función lanza, se revierten. Las transacciones anidadas se integran en la activa.
- **Historial** (`history/history.ts`): una transacción confirmada es un paso de deshacer. Los comandos abren un grupo, así que un comando entero se deshace en un paso. Los grupos anidan: la sesión del Editor de bloques es un grupo externo (descartar la revierte entera) y dentro cada comando sigue siendo un paso. El encuadre continuo dentro de un viewport se fusiona en un paso por gesto.
- **Reactores**: al confirmar, las cotas asociativas recalculan sus puntos dentro de la misma transacción, por lo que deshacer revierte geometría y cota a la vez.
- **Identidad**: el documento conserva su ID al guardar y abrir; lo usan las versiones, la recuperación y la detección de referencias circulares.

## Entidades

Cada tipo registra un `EntityKind` (`model/registry.ts`) con: curvas, caja, lista de visualización independiente del backend, transformación afín, puntos de referencia, pinzamientos y su edición, contorno, prueba de relleno, descomposición, longitud y área. Añadir un tipo no requiere tocar el renderizador ni los comandos genéricos (mover, copiar, girar, escalar, simetría, estirar, igualar propiedades).

Las inserciones de bloque no duplican geometría: la lista de visualización contiene un elemento `block` con matriz y el renderizador reutiliza la evaluación cacheada de la definición (por variante en bloques dinámicos).

## Bloques dinámicos

`blocks/dynamic.ts` evalúa una definición para el estado de una instancia en este orden: tablas de consulta → valores de parámetros (con conjuntos de valores y fórmulas) → acciones ordenadas para respetar el encadenamiento → resolución de restricciones → filtro del estado de visibilidad. El resultado se cachea por revisión de la definición y estado de la instancia. Los pinzamientos dinámicos se generan desde los parámetros y su arrastre se traduce a valores de parámetro.

## Comandos

- **Registro** (`commands/registry.ts`): nombre, alias de fábrica y del usuario, categoría, textos bilingües.
- **Ejecución** (`commands/runner.ts`): cada comando es una función asíncrona que pide datos tipados (punto, distancia, ángulo, número, texto, palabra clave, designación, objeto) con vista previa, validación y cancelación con Esc; los errores explican la causa en español e inglés.
- Los mismos comandos sirven a la línea de comandos, la cinta, las paletas (`runner.script`) y los diálogos, de modo que no hay dos implementaciones de una misma acción.

## Precisión

`snap/snapEngine.ts` resuelve el punto del cursor en cadena: entrada escrita (absoluta, relativa, polar) → referencias a objetos permanentes o temporales (con Tab entre candidatos) → rastreo de referencias (adquisición por pausa) → rastreo polar u orto → rejilla. Las tolerancias en píxeles se convierten a unidades de dibujo con el zoom actual; ver `docs/tolerancias.md`.

## Renderizado

- `render/traverse.ts` recorre entidades visibles del espacio, resuelve herencia PorCapa/PorBloque y la capa 0 dentro de bloques, sobrescrituras por viewport y estilo de trazado (color, monocromo, grises).
- `render/canvasSink.ts` agrupa trazos consecutivos del mismo estilo en un único `Path2D` y cachea los trazados de cada lista de visualización.
- La escena base solo se redibuja con cambios de documento o vista; cursor, referencias, pinzamientos, vista previa, comparación de revisiones y capa de autoría de bloques van en un canvas superpuesto.
- `render/loupe.ts` dibuja la lupa táctil sobre el canvas superpuesto: amplía la escena y la superposición ya trazadas alrededor del dedo y las desplaza para que no las tape la mano; mientras está activa, la apertura de referencia se duplica.
- `render/pdfGeometry.ts` extrae los trazos vectoriales de una página PDF (lista de operadores de pdf.js, con su pila de matrices) al cuadrado unidad del calco y los indexa en una rejilla. `EvalContext.pdfGeometry` publica ese índice; los tipos de entidad pueden ofrecer `snapPointsNear`/`curvesNear` para que el motor de referencias solo consulte la geometría cercana al cursor.

## Salida y formatos

- **Nativo** (`io/native.ts`): `fmodel-2dcad` versionado con migraciones; paquete ZIP (`document.json` + recursos) o JSON.
- **PDF/SVG** (`output/`): un sumidero vectorial común convierte arcos y elipses en Bézier cúbicas exactas bajo cualquier transformación afín, traduce grosores y patrones a milímetros y aplica recortes de viewport; backends SVG (unidades en mm) y PDF (pdf-lib, cargado solo al exportar). La vista previa del diálogo de trazado es el mismo SVG que se exporta.
- **DXF** (`io/dxf/`): importador propio con informe de conversión y escritor R2010 auditado con ezdxf (`scripts/audit-dxf.py`); ver `docs/dxf-compatibilidad.md`.
- **Referencias externas** (`xref/`): el contenido referenciado se copia en una definición `xref` (el dibujo se comparte sin archivos sueltos) y se actualiza al recargar desde el identificador de archivo recordado o la biblioteca local.

## Segundo plano y uso sin conexión

- `workers/heavyOps.ts` define operaciones sin estado compartido (exportar DXF, leer DXF, analizar la salud del dibujo) que reciben y devuelven datos serializables; `workers/client.ts` las ejecuta en un Web Worker y, si el navegador no lo permite, en el hilo principal con idéntico resultado.
- `pwa/`: el service worker se genera en la compilación con la lista exacta de archivos de la versión (precarga completa, navegación sin conexión, caché primero para recursos) y las versiones nuevas esperan a que el usuario las aplique (`UPDATEAPP`), de modo que nunca se mezclan dos versiones con un dibujo abierto. El manifiesto declara la apertura de `.fmodel` y `.dxf` desde el sistema.

## Persistencia local

`storage/persistence.ts` guarda en IndexedDB el autoguardado para recuperación tras cierre inesperado, versiones (automáticas y manuales) y la biblioteca de dibujos. `storage/fileAccess.ts` usa File System Access (Chrome, Edge) para guardar sobre el mismo archivo y recurre a descarga y selector clásico en Safari y Firefox.

## Pruebas

Vitest cubre geometría, contornos, modelo, edición, asociatividad, autoría de bloques e historial, salida vectorial, DXF (estructura e ida y vuelta), referencias externas, auditoría y comparación, y el cableado de la interfaz (cada comando citado en la cinta, los atajos y la matriz de funciones existe; no hay alias duplicados).
