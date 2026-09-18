# Bloques estirables, biblioteca inicial y muebles paramétricos

Fecha: 2026-09-18 · Estado: aprobado por el usuario en el chat

## Objetivo

Que cualquier bloque (descargado o propio) pueda alargarse, acortarse, ensancharse o estrecharse
como un bloque dinámico —un mueble, un clóset—, y dar al usuario una biblioteca inicial de unos
100 bloques reales y un juego de muebles paramétricos propios.

## 1. «Hacer estirable» (`BESTIRABLE`)

Para un bloque sin parámetros dinámicos, añade:

- **Ancho**: parámetro lineal horizontal bajo el bloque (de `minX` a `maxX`), con acción de
  estirar cuyo marco cubre desde la *línea de corte* hasta más allá del borde derecho.
- **Fondo** (o **Alto**, si el bloque es un alzado): parámetro lineal vertical a la izquierda, con
  estiramiento del lado superior.
- **Línea de corte**: entre el 35 % y el 65 % de la dimensión, la posición que cruzan menos
  entidades (por su caja). Lo que queda entero a un lado del corte se traslada sin deformarse;
  solo se estira lo que lo cruza (contornos, encimeras, barras).
- **Conjunto de valores**: mínimo 30 %, máximo 400 % de la medida original; incremento «redondo»
  según las unidades del bloque (mm → 10, cm → 1, m → 0,01, sin unidades → 1 % redondeado a
  1/2/5·10ⁿ).
- Un bloque que ya es dinámico no se toca (error explicado).

Accesos: comando (acepta el nombre como argumento), botón en cada bloque del panel Dibujo, acción
«Hacer estirable» en las tarjetas de la biblioteca, y casilla «Estirable» por bloque en el
diálogo de importación (marcada por defecto en la categoría Mobiliario).

## 2. Biblioteca inicial (LibreCAD)

- 100 DXF de la biblioteca de piezas de LibreCAD (GPLv2, `librecad/support/library/plan`):
  29 muebles/equipamiento, 4 puertas, 33 vegetación, 34 símbolos de aire/agua. Se sirven desde
  `public/library/librecad/` con un `index.json` (archivo, nombre en español, categoría, unidades
  reales, estirable) y un README con licencia y origen.
- Unidades corregidas en el manifiesto: vegetación en metros, puertas en centímetros, símbolos
  sin unidades.
- Comando `LIBRARYSTARTER` («Instalar biblioteca inicial»): descarga el manifiesto y los DXF,
  importa cada uno como bloque (espacio modelo), lo hace estirable si procede, y lo guarda en una
  sola transacción. Es idempotente (omite los nombres ya presentes). Botón en la barra y en el
  estado vacío de la biblioteca.
- `public/library/` no entra en la precarga del service worker (se cachea al usarse).

## 3. Muebles paramétricos propios (planta, mm)

Doce bloques construidos por código con parámetros y acciones nativas de FModel, en la categoría
Mobiliario: clóset de correderas (las hojas de 600 se añaden al alargar: matriz sobre el ancho,
incremento 600), clóset batiente (hojas de 500), estantería, escritorio, cama (ancho por lista
900/1050/1350/1500/1800, largo 1900–2200), mesa de comedor (sillas que se añaden cada 600 a ambos
lados), sofá, módulo bajo de cocina, módulo alto de cocina, encimera, tocador y mesita de noche.
Se instalan junto con la biblioteca inicial.

## Pruebas

- `makeStretchable`: al fijar Ancho = 2 × original, la caja evaluada mide 2 × de ancho y el mismo
  fondo; las entidades enteras a la izquierda del corte no cambian; ídem con Fondo; conjunto de
  valores aplicado; bloque dinámico → error.
- Los 100 DXF del manifiesto se importan y generan un bloque cada uno (prueba sobre los archivos
  reales); las unidades del manifiesto se aplican.
- Muebles: cada uno se evalúa sin avisos; el clóset de correderas pasa de 2 a 3 hojas al ir de
  1200 a 1800; la mesa gana sillas al alargarse.
- Navegador: instalar la biblioteca inicial, insertar el armario y estirarlo por su pinzamiento.

## Fuera de alcance

Deformaciones no lineales (escalar solo un subconjunto, radios que se adaptan) y alzados
paramétricos.
