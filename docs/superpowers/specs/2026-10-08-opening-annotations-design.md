# Etiquetas y cuadro de huecos con actualización automática

Fecha: 2026-10-08. Diseño aprobado por el usuario en este chat. Continuación del PR #7.

## Resultado solicitado

El plano muestra P-01, V-01 y las demás claves del cuadro. Al añadir, copiar,
mover, editar, reflejar o borrar un hueco asociado, se actualizan las etiquetas
y las filas/cantidades del cuadro en la misma operación deshacible.

## Flujo

- `OPENINGSCHEDULE` / `CUADROHUECOS` crea un cuadro vinculado al espacio actual.
  Conserva la colocación y vista previa existentes.
- `OPENINGTAGS` / `ETIQUETASHUECOS`, accesible desde Arquitectura, cinta y paleta,
  selecciona el cuadro y pide altura del texto (100 mm físicos por defecto,
  0.1 en dibujos en metros). Muestra una vista previa y confirma con Intro;
  Esc descarta todo. Puede vincular explícitamente un cuadro anterior de cuatro
  columnas; el comando avisa que regenerará su contenido a partir de los huecos.
- Las claves conservan la agrupación actual por tipo y ancho: P para puertas
  sencilla/doble, V para ventana fija y H para corredizos/vacíos ambiguos.
  Una agrupación compartida determina las filas y todos los textos.
- Cada etiqueta se coloca al centro longitudinal del hueco, separada de la cara
  del muro y alineada para poder leerla. Se puede mover y cambiar su apariencia;
  el desplazamiento manual se conserva al mover el hueco. La clave pertenece
  al cuadro y se recalcula cuando cambian los grupos por tipo/ancho.
- Repetir Etiquetas actualiza el conjunto del cuadro sin duplicarlo. Los cuadros
  existentes siguen estáticos hasta que el usuario los vincula con este comando.

## Asociación y actualización

Un reactor del modelo actualiza la tabla y sus textos dentro de la transacción
que cambió los huecos. Así undo/redo restaura a la vez fuente y anotaciones.
Conserva los IDs de tabla y etiquetas supervivientes, el lugar y la rotación de
la tabla, su estilo y sus anchos de columna. Ajusta sus filas al nuevo recuento.
El contenido generado se actualiza aunque se haya editado manualmente una clave.

Se conservan las reglas de recuento de PR #7: espacio actual, capas ocultas o
bloqueadas incluidas, deduplicación por muro, máximo 100 muros y 1000 huecos.
Se crean etiquetas para nuevos huecos y se retiran las del hueco borrado.
Si se borra el cuadro, los textos supervivientes quedan independientes.

Si la fuente está dañada, excede límites o está temporalmente limpiada, se
conserva el resultado anterior y el cuadro muestra «Revisar huecos / Review
openings». Al restaurar una fuente válida se recalcula. Una asociación inválida
no convierte un fallo de anotación en pérdida de la edición del dibujo.

## Archivo e intercambio

La asociación se representa con datos opcionales tipados en TABLE/TEXT y se
valida antes de aceptar archivos. El nativo pasa de v4 a v5 con migración de
archivos anteriores que conserva sus cuadros y textos independientes.
Versiones futuras se rechazan. Guardar y reabrir conserva la actualización.

DXF conserva tabla y textos mediante las rutas existentes y avisa de la pérdida
de asociación. Las copias independientes y el portapapeles se desvinculan para
evitar referencias al cuadro/muro original; conservan su contenido visible.
No se amplía DWG ni se añade red, backend o funcionalidad 3D.

## Verificación mínima

Pruebas focalizadas para correspondencia de claves, edición y altas/bajas,
undo/redo, cancelación, persistencia/migración y asociación dañada. Se comprueba
el acceso del comando y una escena real en Día/Noche. Tipos y capas por cambiar
modelo, comandos y archivo; no suite completa ni cobertura.

La actualización se limita a estos cuadros y etiquetas: cotas arquitectónicas,
materiales/áreas, interiores, detalles, huecos curvos/de esquina y demás
automatizaciones de YQARCH siguen fuera de esta entrega.
