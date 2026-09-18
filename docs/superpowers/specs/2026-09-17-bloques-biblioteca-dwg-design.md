# Bloques dinámicos portables, biblioteca por categorías y lectura DWG

Fecha: 2026-09-17 · Estado: propuesta para revisión

## Objetivo

Poder **crear** bloques dinámicos (ya existe con `BEDIT`), **traerlos de fuera** —archivos DXF o DWG
descargados de otros sitios, incluidos bloques dinámicos de AutoCAD— y **guardarlos en una
biblioteca por categorías** que se puede exportar e importar como archivo para compartirla.

Uso: FModel es privado y de uso personal. Esa condición permite incluir LibreDWG (GPL-3.0); si
FModel se publicara algún día, esta decisión debe revisarse (ver «Licencia»).

## Fuera de alcance

- Catálogo en línea dentro de la aplicación (requiere servidor y derechos de redistribución).
- Escribir DWG. FModel solo **lee** DWG; exporta DXF.
- Reproducir cualquier parámetro dinámico de AutoCAD: solo los que tienen equivalente en FModel y
  cuyo formato se pueda leer con pruebas reales. El resto se declara en el informe de conversión.

## Descomposición

Cuatro partes independientes, en este orden. Cada una se entrega con pruebas y con su estado
actualizado en `docs/FEATURES.md` y `docs/dxf-compatibilidad.md`.

| Parte | Entrega | Depende de |
|---|---|---|
| 1 | Bloques dinámicos de FModel sobreviven a DXF (ida y vuelta) | — |
| 2 | Biblioteca por categorías en IndexedDB, importación de bloques desde DXF y archivo `.fmodellib` | 1 (para que un DXF de FModel entre dinámico) |
| 3 | Lectura DWG (abrir e importar a la biblioteca) | 2 |
| 4 | Parámetros dinámicos de AutoCAD leídos desde DXF | 2; archivos reales de muestra |

---

## Parte 1 — Ida y vuelta DXF de bloques dinámicos de FModel

**Hoy:** cada estado usado se exporta como bloque estático `Nombre_Vn`; al reimportar se pierde la
definición dinámica.

**Diseño:** se mantiene exactamente lo que ven otros programas (variantes estáticas) y se añaden
datos propios que solo FModel interpreta, con el mecanismo estándar de DXF para datos de aplicación.

- **Definición:** el bloque `Nombre` se sigue escribiendo con su contenido de definición. Un
  diccionario `FMODEL_DYNAMIC_BLOCKS` del diccionario raíz contiene, por bloque dinámico, un
  `XRECORD` con la `DynamicBlockDefinition` en JSON (versión de esquema 1, trozos de ≤ 120
  caracteres) en la que cada ID de entidad se sustituye por `@H:<handle DXF>`.
- **Instancias:** el `INSERT` sigue apuntando a su variante estática `Nombre_Vn` (para otros
  programas) y lleva XDATA `FMODEL` (APPID registrado) con el nombre del bloque base y el
  `DynamicInstanceState` en JSON troceado. Si ese JSON superase el límite de XDATA (16 KB), la
  instancia se exporta solo como variante estática y se avisa.
- **Importación:** si el importador encuentra `FMODEL_DYNAMIC`, reconstruye la definición
  remapeando cada `@H:<handle>` al ID de la entidad importada, apunta cada instancia al bloque base con su estado y descarta
  las variantes `Nombre_Vn` que queden sin uso. Si los datos están dañados o su versión es
  desconocida, conserva las variantes estáticas y lo dice en el informe.
- **Informe:** la fila «Bloque dinámico → bloque estático» pasa a «se conserva en FModel; otros
  programas ven las variantes estáticas».

**Pruebas:** exportar → importar → comparar definición e instancias (valores, visibilidad,
consulta) con las muestras de `blocks/samples.ts`; auditoría con `scripts/audit-dxf.py` (ezdxf
acepta XDATA y XRECORD); archivo con JSON dañado → variantes estáticas y aviso.

---

## Parte 2 — Biblioteca por categorías

### Almacenamiento

- Pasa de `localStorage` (≈5 MB) a IndexedDB: se sube `DB_VERSION` a 2 en `storage/idb.ts` con
  los almacenes `library` (un `LibraryBlock` por registro) y `libraryCategories`.
- Migración automática única desde `fmodel.cad.blocklibrary.v1`; la clave antigua se borra solo
  tras escribir todo con éxito.
- La API de `blocks/library.ts` pasa a ser asíncrona (`loadLibrary(): Promise<…>`). La capa 3
  (`blocks`) puede usar `storage`.

### Modelo

```ts
interface LibraryCategory { id: string; name: string; parent?: string; order: number } // 2 niveles máx.
interface LibraryBlock {
  id; name; categoryId?: string; tags: string[]; description?: string;
  source?: { kind: 'fmodel' | 'dxf' | 'dwg' | 'fmodellib'; file?: string; importedAt: number };
  dynamic: boolean;        // para filtrar y mostrar insignia
  savedAt; thumbnail?; package: BlockPackage;
}
```

**Categorías iniciales** (editables, se crean una vez): Arquitectura › Puertas, Ventanas,
Escaleras · Mobiliario › Oficina, Cocina, Baño, Dormitorio · Estructura › Perfiles, Anclajes ·
Instalaciones › Eléctricas, Sanitarias, Climatización · Urbanismo · Vehículos · Personas ·
Anotación › Cajetines, Símbolos · Sin clasificar.

**Sugerencia de categoría:** tabla de palabras clave ES/EN sobre nombre y descripción del bloque
(«puerta/door» → Puertas, «wc/inodoro/toilet» → Baño…). Solo propone; la persona confirma.

### Importar a la biblioteca (`LIBRARYIMPORT`)

Acepta `.dxf`, `.dwg` (parte 3) y `.fmodellib`. Para DXF/DWG:

1. Se importa el archivo a un documento temporal (no toca el dibujo abierto) con el importador
   existente, que ya produce el informe de conversión.
2. Diálogo de selección con miniatura de cada bloque con nombre (se omiten los anónimos `*…` y los
   de cotas) y, además, la opción **«Todo el espacio modelo como un bloque»** — muchas descargas son
   un dibujo suelto sin bloques. El punto base del bloque del espacio modelo es la esquina inferior
   izquierda de su extensión.
3. Por cada bloque elegido: categoría sugerida, etiquetas, nombre editable; conflicto de nombre →
   sustituir o renombrar.
4. Se empaqueta con `packageBlock` y se guarda. El informe de conversión queda accesible desde el
   bloque de la biblioteca.

### Compartir (`LIBRARYEXPORT` / `.fmodellib`)

ZIP (fflate, ya en dependencias) con `manifest.json` (`format: 'fmodel-library'`, versión 1,
categorías, índice de bloques) y un `blocks/<id>.json` con cada `LibraryBlock`. Se puede exportar
toda la biblioteca, una categoría o una selección. Al importar, las categorías se fusionan por
ruta de nombre y los bloques con nombre repetido se ofrecen para sustituir, renombrar u omitir.

### Interfaz

Se rediseña la pestaña «Biblioteca» de `ui/panels/BlocksPanel.tsx` (se aplicará la guía de diseño
de la marca: color de familia modelo #7657D5 / #A990FF, Space Grotesk / Inter, sombras «clay»):

- Árbol de categorías plegable a la izquierda (en teléfono, selector desplegable arriba), con
  contador por categoría, y la entrada «Todos».
- Rejilla de miniaturas con nombre, insignia «Dinámico» y búsqueda por nombre, etiqueta y
  descripción; filtro «solo dinámicos».
- Acciones por bloque: insertar (arrastrar al lienzo o clic), editar metadatos, mover de categoría,
  quitar. Barra superior: Importar…, Exportar…, Gestionar categorías.
- «Enviar a biblioteca» desde el Editor de bloques y `WBLOCK` abren el mismo diálogo de metadatos.

**Pruebas:** migración desde `localStorage` (con `fake-indexeddb` en vitest); `.fmodellib` ida y
vuelta con un bloque dinámico y bloques anidados; conflicto de nombres; sugerencia de categoría;
importación de un DXF con bloques y de uno solo con espacio modelo (el fixture de ezdxf existente).

---

## Parte 3 — Lectura DWG (Experimental)

- Dependencia `@mlightcad/libredwg-web` (GPL-3.0, WebAssembly ≈11 MB sin comprimir). Se carga con
  `import()` dinámico **solo** al abrir un DWG y se ejecuta en el Web Worker existente
  (`workers/heavyOps.ts`), con el mismo respaldo en hilo principal. El service worker lo precarga
  bajo demanda, no en la instalación inicial.
- **Un solo importador:** se extrae de `importDxfIntoDocument` la función `importDxfFile(doc, dxf: DxfFile, …)`. El DWG se convierte a DXF con el conversor nativo de LibreDWG (`dwg_write_dxf`), que conserva todos los tipos que LibreDWG sabe leer (incluidos los objetos de bloques dinámicos), y se corrigen con `convert()` del mismo DWG los defectos medidos de ese DXF: estado de capas y bloque de las tablas. *(Revisado durante la implementación: un adaptador propio `DwgDatabase → DxfFile` perdía tipos que la conversión tipada de LibreDWG no expone, como las cotas de longitud de arco.)*
- Entradas: `OPEN` acepta `.dwg`; `LIBRARYIMPORT` acepta `.dwg`; el manifiesto de la PWA registra
  la extensión.
- Lo que el adaptador no traduzca se cuenta en el informe como «no admitido en DWG». Los datos
  dinámicos de AutoCAD en DWG **no** se leen en esta parte: el bloque entra con su geometría y el
  informe recomienda convertir a DXF para conservarlos (ver parte 4).
- Estado en `FEATURES.md`: **Experimental**, con la nota de licencia y de versiones probadas.

**Pruebas:** tres DWG reales de AutoCAD 2000/2018 (datos de prueba de LibreDWG) comparados con su
DXF equivalente escrito por AutoCAD (objetos por tipo, capas, bloques, extensión); archivo que no
es DWG o truncado → error explicado, sin cuelgues.

### Licencia

LibreDWG es GPL-3.0. Mientras FModel sea privado y de uso personal no hay obligación. Si se
publica, FModel entero pasaría a distribuirse bajo GPL-3.0 o habría que retirar este módulo. Se
documenta en `docs/arquitectura.md` y en la ayuda de la función.

---

## Parte 4 — Parámetros dinámicos de AutoCAD desde DXF

AutoCAD guarda la lógica dinámica en objetos no documentados oficialmente: el `BLOCK_RECORD` de la
definición tiene un diccionario `ACAD_ENHANCEDBLOCK` con un `AcDbEvalGraph` cuyos nodos son
parámetros (`BLOCKLINEARPARAMETER`, `BLOCKVISIBILITYPARAMETER`, …), acciones y pinzamientos. Cada
instancia es un `INSERT` a un bloque anónimo `*U…` cuya XDATA `AcDbBlockRepBTag` apunta a la
definición.

**Traducción prevista** (solo con equivalente directo en FModel):

| AutoCAD | FModel |
|---|---|
| `BLOCKVISIBILITYPARAMETER` | `visibility` con sus estados y entidades |
| `BLOCKLINEARPARAMETER` + `BLOCKSTRETCHACTION` / `BLOCKMOVEACTION` / `BLOCKSCALEACTION` | `linear` + `stretch` / `move` / `scale`, con conjunto de valores |
| `BLOCKROTATIONPARAMETER` + `BLOCKROTATEACTION` | `rotation` + `rotate` |
| `BLOCKFLIPPARAMETER` + `BLOCKFLIPACTION` | `flip` + `flip` |
| `BLOCKLOOKUPPARAMETER` + `BLOCKLOOKUPACTION` | `lookup` + `lookup` |
| `BLOCKBASEPOINTPARAMETER` | `basepoint` |

Todo lo demás (restricciones paramétricas de AutoCAD, matrices dinámicas, propiedades de tabla de
bloque, polares y XY complejos) queda como geometría estática y aparece en el informe con su causa.

**Instancias:** se apuntan a la definición reconstruida con los valores recuperados de su
representación; si no se pueden leer, se mantiene la geometría del `*U…` como bloque estático
enlazado por nombre y se avisa.

**Resultado:** muestras de ACadSharp (MIT) con un DXF y un DWG de AutoCAD 2018 por tipo; se traducen lineal, punto, rotación, simetría, visibilidad y punto base (verificados contra la geometría `*U`); consulta, XY, polar y alineación quedan estáticos con aviso (la consulta de la muestra usa columnas de punto que la tabla de FModel no representa). *(Actualizado durante la implementación.)*

**Riesgo principal:** el formato se infiere, no está especificado. Esta parte **solo empieza** con
muestras reales: 5–10 DXF de bloques dinámicos habituales (puertas, ventanas, mobiliario con
estados) descargados y guardados como DXF desde AutoCAD o convertidos. Cada tipo de parámetro se
declara «Disponible» solo cuando pasa con al menos dos archivos de orígenes distintos; mientras
tanto la función es **Experimental**.

---

## Arquitectura y capas

| Módulo nuevo o cambiado | Capa | Notas |
|---|---|---|
| `io/dxf/dynamicXdata.ts` | 3 | escribir/leer `FMODEL_DYNAMIC` y XDATA de instancias |
| `io/dxf/acadDynamic.ts` | 3 | parte 4: `AcDbEvalGraph` → `DynamicBlockDefinition` |
| `io/dwg/dwgToDxfFile.ts`, `io/dwg/readDwg.ts` | 3 | adaptador y carga perezosa de LibreDWG |
| `blocks/library.ts`, `blocks/libraryCategories.ts`, `blocks/libraryArchive.ts` | 3 | biblioteca asíncrona, categorías, `.fmodellib` |
| `storage/idb.ts` | 3 | versión 2 de la base |
| `workers/heavyOps.ts` | 4 | operación `readDwg` |
| `commands/blocks.ts` | 5 | `LIBRARYIMPORT`, `LIBRARYEXPORT`; `WBLOCK` usa el diálogo nuevo |
| `ui/panels/BlocksPanel.tsx`, `ui/dialogs/LibraryImportDialog.tsx` | 6 | interfaz |

`pnpm verify` (tipos, capas, estado de funciones, pruebas, compilación) debe pasar al final de
cada parte.

## Errores

- Archivo ilegible, cifrado o de versión no admitida: mensaje ES/EN con la causa y sin cambios en
  la biblioteca.
- Almacenamiento lleno en IndexedDB: se informa y no se guarda a medias (una transacción por
  importación).
- Cualquier dato propio (`FMODEL_DYNAMIC`, `.fmodellib`) con versión futura: se rechaza con
  aviso, nunca se interpreta a ciegas.
