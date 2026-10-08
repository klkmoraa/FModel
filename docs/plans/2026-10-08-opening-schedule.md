# ARC-008 — Cuadro de huecos asociados

Continuación del módulo 5 del diseño YQARCH nativo sobre `main` c60421c6, tras la integración del PR #6. Rama nueva `codex/opening-schedule`; no se reutiliza el PR integrado.

## Contrato

- `OPENINGSCHEDULE` / `CUADROHUECOS`, panel Arquitectura, cinta, paleta y búsqueda nativas ES/EN.
- Recorre los muros asociados del espacio de entrada actual, incluidas capas ocultas/bloqueadas. Valida sus asociaciones y cuenta una sola vez cada hueco; no incluye definiciones de bloque ni otros espacios.
- Agrupa por tipo y ancho numérico exacto; asigna claves P/V/H deterministas para esta tabla. Los tipos corredizo/vacío se muestran como huecos porque el modelo no conserva su uso arquitectónico. No inventa alturas, materiales ni dimensiones ausentes.
- Máximo 100 muros y 1000 huecos. Grupos modificados, incompletos o limpiados se rechazan antes de escribir; los limpiados requieren restauración previa.
- Tabla nativa independiente con estilo propio, tamaño físico adaptado a unidades y ancho de columnas ajustado al contenido. Vista previa evalúa el mismo estilo en un documento aislado; Esc/Intro cancela antes de escribir.
- Una transacción inserta tabla y estilo; un undo/redo conserva las fuentes. Si cambia el documento mientras se coloca, advierte y termina sin insertar ni revertir el cambio intercalado.
- `.fmodel` conserva la tabla editable. DXF aplica la conversión existente a líneas/texto y conserva su aviso. Sin versión nueva de archivo, backend o cambios DWG.
- Es una instantánea: se genera de nuevo tras editar; claves sin etiquetas vinculadas en el plano. No equivale a completar el módulo 5 ni la paridad YQARCH.

## Ejecución y evidencia

1. Registro del comando y cinco pruebas focalizadas; fase inicial falla por comando inexistente.
2. Implementación y acceso en tres superficies; dos pruebas DOM ejercitan botones/teclado reales ES/EN.
3. Verificación focalizada: siete pruebas nuevas, veinte regresiones existentes del ciclo de huecos, tipos, lint de archivos modificados, capas, catálogo y compilación pública sin DWG. Nativo/DXF comprobados en las pruebas del comando.
4. Revisión visual en navegador pendiente: Chromium no se instaló; el archivo descargado por Playwright no era un ZIP válido. No se declara esa comprobación realizada.

Decisión de ejecución: sin agentes ni suite completa/cobertura locales, por petición expresa del usuario de revisión acotada y mínimo de pruebas. El workflow de PR conserva sus verificaciones existentes. Revisión de fuente por el implementador, sin afirmar revisión independiente.

## Pendiente para cerrar ARC-008

Revisar capturas reales Día/Noche y teléfono, y confirmar el resultado de CI del PR. La función queda Experimental y la tarea En curso mientras falte esa evidencia.

## Continuación — ARC-009, exportación CSV

- CI previa de ARC-008 [37828626031](https://github.com/klkmoraa/FModel/actions/runs/37828626031) pasó sobre `06f338cc`; no prueba todavía el CSV ni el recorrido visual nuevo.
- `TABLECSV` / `EXPORTARTABLACSV` exporta la tabla seleccionada, incluso bloqueada, sin cambiar dibujo, historial ni estado de guardado. Usa el guardado/descarga existente y respeta cancelación y error de escritura.
- Exporta texto plano de celdas MTEXT, UTF-8 con BOM, comillas escapadas, separador coma y finales CRLF; celdas combinadas cubiertas vacías. Neutraliza prefijos de fórmula en celdas editadas. Límites: 2002 filas, 200 columnas y 2 millones de caracteres antes de construir la salida.
- Misma acción en Arquitectura, cinta y paleta ES/EN. CSV refleja el contenido actual de la tabla; no recalcula el muro ni elimina texto editado por la persona.
- Seis pruebas focalizadas nuevas de CSV y trece pruebas locales del bloque pasan; tipos y lint focalizado. Dos recorridos nuevos en navegador preparan capturas escritorio/teléfono en Día/Noche y comprueban descarga real; pendientes de CI y revisión original de capturas.
