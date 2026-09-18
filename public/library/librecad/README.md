# Biblioteca inicial (LibreCAD)

100 bloques DXF de la biblioteca de piezas de [LibreCAD](https://github.com/LibreCAD/LibreCAD)
(`librecad/support/library/plan`: `architect`, `doors`, `vegetation` y parte de `air_water`),
distribuidos bajo **GPL-2.0** como el resto de LibreCAD. Se descargaron el 2026-09-18 sin modificar.

`index.json` asigna a cada archivo un nombre en español, una categoría de la biblioteca de FModel,
sus unidades reales (los archivos de vegetación dicen «mm» pero están en metros; las puertas no
declaran unidades y están en centímetros) y si se instala como bloque estirable. El comando
`LIBRARYSTARTER` los instala en la biblioteca.
