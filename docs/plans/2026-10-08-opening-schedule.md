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
4. Chromium local no pudo instalarse (ZIP inválido); los recorridos se ejecutaron en CI. La revisión visual final está registrada debajo.

Decisión de ejecución: sin agentes ni suite completa/cobertura locales, por petición expresa del usuario de revisión acotada y mínimo de pruebas. El workflow de PR conserva sus verificaciones existentes. Revisión de fuente por el implementador, sin afirmar revisión independiente.

## Cierre acotado de ARC-008/009

[CI 37834084772](https://github.com/klkmoraa/FModel/actions/runs/37834084772) pasó sobre `e8dd4ee59517e82465ba5f17a1b862ddd23a64d3`. Dos recorridos nuevos y cuatro capturas originales escritorio/teléfono Día/Noche revisadas en la [ficha QA](../brandbook/opening-schedule-qa.md). Ambas tareas están cerradas y disponibles en su alcance de instantáneas y CSV. El commit posterior registra evidencia, guía y estado; no modifica comandos/render/recorridos. PR #7 listo para revisión, sin integrar ni desplegar.

## Continuación — ARC-009, exportación CSV

- CI previa de ARC-008 [37828626031](https://github.com/klkmoraa/FModel/actions/runs/37828626031) pasó sobre `06f338cc`; no prueba todavía el CSV ni el recorrido visual nuevo.
- `TABLECSV` / `EXPORTARTABLACSV` exporta la tabla seleccionada, incluso bloqueada, sin cambiar dibujo, historial ni estado de guardado. Usa el guardado/descarga existente y respeta cancelación y error de escritura.
- Exporta texto plano de celdas MTEXT, UTF-8 con BOM, comillas escapadas, separador coma y finales CRLF; celdas combinadas cubiertas vacías. Neutraliza prefijos de fórmula en celdas editadas. Límites: 2002 filas, 200 columnas y 2 millones de caracteres antes de construir la salida.
- Misma acción en Arquitectura, cinta y paleta ES/EN. CSV refleja el contenido actual de la tabla; no recalcula el muro ni elimina texto editado por la persona.
- Seis pruebas focalizadas nuevas de CSV y trece pruebas locales del bloque pasan; tipos y lint focalizado. Dos recorridos nuevos en navegador comprueban descarga real; CI aprobada y cuatro originales escritorio/teléfono Día/Noche revisados.
