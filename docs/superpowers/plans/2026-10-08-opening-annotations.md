# Etiquetas y cuadro de huecos automáticos — plan de implementación

> **Para agentes:** usar Superpowers externo `executing-plans` (ejecución en esta sesión) o `subagent-driven-development`, según el método que el usuario elija. Las instrucciones del usuario y `AGENTS.md` prevalecen: sólo verificaciones mínimas necesarias; sin commit, push o rama salvo petición expresa.

**Objetivo:** mantener P/V/H del plano y filas/cantidades del cuadro sincronizados con los huecos asociados, con un solo paso deshacible.

**Arquitectura:** agrupación compartida en el modelo y reactor instalado por el editor. Asociaciones opcionales tipadas de TABLE/TEXT; archivo nativo v5, v4 migra sin inventar vínculos. El reactor sólo responde a cambios pertinentes y termina cuando las anotaciones ya coinciden.

**Stack:** React 19, TypeScript, CadDocument/Transaction y Vitest existentes; sin dependencias nuevas.

**Diseño aprobado:** [2026-10-08-opening-annotations-design.md](../specs/2026-10-08-opening-annotations-design.md).

## Condiciones comunes

- Mantener CAD 2D local; sin red, backend ni ampliación DWG.
- Conservar agrupación actual por tipo/ancho, claves P/V/H, todos los muros asociados del propietario, deduplicación, máximo 100 muros y 1000 huecos.
- Altura inicial de etiquetas: 100 mm físicos, 0.1 m o 100 unidades sin unidad.
- Los cuadros existentes permanecen estáticos hasta vinculación explícita.
- Fuente dañada/limpiada o exceso de límites: conservar anotación y mostrar «Revisar huecos / Review openings». Undo/redo incluye la actualización.
- No suite completa, cobertura ni obligación de `pnpm verify`.

## Riesgos que deben comprobarse

1. Añadir un ancho menor renumera grupos: tabla y etiquetas deben usar las mismas claves.
2. Mover manualmente una etiqueta y después su hueco: conservar el desplazamiento y el ID.
3. Borrar la última abertura o el cuadro: no dejar referencias inexistentes ni recrear el cuadro.
4. Limpiar/dañar/restaurar fuente: no bloquear ni perder la edición; señalar y recuperar el resultado.
5. Copiar o pegar una anotación: conservar lo visible y desvincular la copia.

## Tarea 1 — Datos de asociación y nativo v5

**Archivos:** `src/document/types.ts`, nuevo `src/document/openingAnnotations.ts`, `src/io/validation.ts`, `src/io/native.ts`, nuevo `src/io/openingAnnotations.test.ts`.

**Interfaz:** `TableEntity.openingSchedule?: OpeningScheduleLink`, `TextEntity.openingTag?: OpeningTagLink` y `detachOpeningAnnotation<E extends Entity>(entity: E): E`. `OpeningScheduleLink` registra versión 1, idioma ES/EN, configuración opcional de etiquetas (altura, estilo y capa) y estado actual/revisar. `OpeningTagLink` registra versión 1, IDs de cuadro y ancla, ID de hueco y punto base previo para preservar desplazamiento manual.

- [x] Añadir una prueba focalizada de ida/vuelta de los vínculos, migración v4 independiente, versión futura y forma inválida. Fallará antes de crear los campos.
- [x] Implementar los tipos y el helper puro de desvinculación en la capa documento.
- [x] Validar forma, versión, idioma y medidas finitas positivas al aceptar entidades. El lector comprueba propietarios/referencias; un vínculo roto se desvincula con aviso conservando tabla/texto, sin aceptar IDs inexistentes.
- [x] Subir `FORMAT_VERSION` a 5 y migrar v4 conservando sus entidades independientes. El escritor y lector usan la misma validación de asociaciones.
- [x] Ejecutar `pnpm vitest run src/io/openingAnnotations.test.ts`; todas las pruebas deben pasar.

## Tarea 2 — Agrupación y reactor transaccional

**Archivos:** nuevo `src/model/openingAnnotations.ts`, `src/editor/editor.ts`, nuevo `src/model/openingAnnotations.test.ts`.

**Interfaces:** `collectOpeningAnnotations(doc: CadDocument, owner: Id): OpeningAnnotationSnapshot`, `openingScheduleCells(snapshot: OpeningAnnotationSnapshot, lang: 'es' | 'en', units: DrawingUnits): TableCell[][]`, `openingTagPosition(opening: OpeningAnnotationPlacement, height: number): Vec2`, `synchronizeOpeningAnnotations(tx: Transaction, tableId: Id): void`, `installOpeningAnnotations(doc: CadDocument): () => void`. Snapshot contiene filas `{type,width,count,code}` y huecos `OpeningAnnotationPlacement` con `{anchorId,openingId,code,center,normal,faceOffset,side,rotation}`; el helper de posición usa la altura para separar el texto de la cara.

- [x] Probar edición/alta/baja de huecos, correspondencia de claves tras renumerar y undo/redo; probar desplazamiento manual, borrar última abertura/cuadro y fuente dañada/restaurada.
- [x] Extraer el recuento de `OPENINGSCHEDULE` al colector compartido, validando cada muro una vez. Calcular etiqueta con recorrido/offset del hueco y cara física del muro; situarla al lado contrario de la hoja y normalizar rotación para lectura.
- [x] Generar celdas bilingües con la ordenación actual. Preservar posición, rotación, estilo y anchos de tabla; ajustar sólo contenido y número de filas.
- [x] Sincronizar etiquetas por cuadro/ancla/hueco: IDs estables, crear altas, retirar bajas y conservar desplazamiento desde el punto base anterior. Borrar cuadro desvincula sus textos.
- [x] Instalar reactor idempotente que responde a entidades de muro/grupos/estilos de muro, unidades, vínculos nuevos o borrados y ajustes de etiquetas. No recalcular por cambios ajenos ni emitir escrituras idénticas. Fuente inválida conserva contenido y añade el aviso; restauración válida quita el aviso. Referencias ausentes se retiran o desvinculan sin perder texto válido.
- [x] Ejecutar `pnpm vitest run src/model/openingAnnotations.test.ts`; todas las pruebas deben pasar.

## Tarea 3 — Comandos y copias independientes

**Archivos:** `src/commands/openingSchedule.ts`, nuevo `src/commands/openingTags.ts`, `src/commands/index.ts`, `src/editor/editor.ts`, `src/commands/helpers.ts`, `src/io/clipboard.ts`, `src/blocks/library.ts`, `src/io/dxf/exportDxf.ts`, nuevo `src/commands/behavior/openingTags.test.ts`, pruebas del nativo de la tarea 1.

- [x] Probar selección de cuadro, altura, confirmación, cancelación sin mutación y repetir sin duplicados. Probar vinculación explícita de cuadro anterior, copia y pegado independientes.
- [x] Adaptar `OPENINGSCHEDULE` al snapshot compartido y crear `openingSchedule` al confirmar; conservar preview aislado y chequeo de versión/propietario vigente.
- [x] Implementar `OPENINGTAGS` / `ETIQUETASHUECOS`: seleccionar TABLE editable de cuatro columnas en espacio actual, pedir altura positiva finita con default físico y mostrar preview en documento aislado. Advertir que vincular/regenerar reemplaza las celdas. Intro confirma configuración y sincronización en un `api.apply`; Esc y contexto cambiado descartan todo.
- [x] Aplicar `detachOpeningAnnotation` en rutas de COPY/MIRROR con copia, arrays independientes, pegado y copias de biblioteca; MOVE del original conserva su asociación. No desvincular etiquetas recién creadas por el comando/reactor.
- [x] Añadir aviso bilingüe de pérdida de asociación al exportar DXF; conservar salida TABLE/TEXT existente.
- [x] Ejecutar `pnpm vitest run src/commands/behavior/openingTags.test.ts src/commands/behavior/openingSchedule.test.ts src/io/openingAnnotations.test.ts`; todas las pruebas deben pasar.

## Tarea 4 — Acceso, escena y documentación

**Archivos:** `src/ui/panels/ArchitecturePanel.tsx`, `src/ui/ribbonConfig.ts`, `src/ui/panels/ToolPalettesPanel.tsx`, `src/ui/panels/openingScheduleAccess.test.ts`, `src/app/features.ts`, `src/audit/evidence.ts`, `docs/arquitectura-muros.md`, `docs/dxf-compatibilidad.md`, `docs/brandbook/`, `docs/yqarch/README.md`, `fix/features/README.md`, `fix/features/02-geometria-comandos.md`.

- [x] Registrar ARC-010 en curso con fecha 2026-10-08 para etiquetas y cuadro automáticos; ARC-008/009 siguen como entregas históricas.
- [x] Añadir acceso ES/EN junto a Cuadro de huecos en panel, cinta y paleta; ampliar la prueba existente de acceso para comprobar que empieza el comando y Esc lo cancela.
- [x] Actualizar ayuda, guía de uso, límites y catálogo con evidencia focalizada real. Generar `docs/FEATURES.md` usando `pnpm docs:features`.
- [x] Ejecutar la prueba focalizada de acceso, `pnpm typecheck`, `pnpm check:layers`, lint de archivos cambiados y `pnpm check:features`. Compilar una vez para ejercer la escena; no ampliar al resto de suites si pasan.
- [x] Revisar una escena real con puerta, ventana, etiquetas y cuadro en Día/Noche; editar un hueco y observar actualización y undo. Guardar capturas originales y actualizar ficha de brandbook.
- [x] Revisar el diff por pérdida de dibujos, IDs/referencias, no finitos, reactores convergentes y edición/copia. Cerrar ARC-010 sólo con evidencia ejecutada; dejar los cambios locales sin commit/push.

## Revisión del plan

La asociación/nativo se concentra en tarea 1; agrupación, posición, altas/bajas y
undo en tarea 2; interacción/cancelación/copias/intercambio en tarea 3; acceso,
escena y registro en tarea 4. Los cinco riesgos anteriores tienen comprobación
focalizada en sus tareas. No quedan dependencias nuevas ni trabajo de otros
módulos de YQARCH. Diseño y ejecución aprobados por el usuario; implementado en esta sesión.
Revisión independiente y correcciones de bloques, recursos de etiquetas y
reparación nativa completadas. Evidencia: [ficha QA](../../brandbook/opening-annotations-qa.md).
Verificación completada en local; el usuario autorizó después commit y push.
