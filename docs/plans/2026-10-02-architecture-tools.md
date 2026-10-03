# Herramientas de arquitectura 2D (ARC-002)

Petición: facilitar el dibujo de planos en FModel con herramientas arquitectónicas de muros, inspiradas en el flujo de trazado CAD. El usuario autoriza mejorar el repositorio con libertad. El resultado se entrega en una rama de GitHub con un PR revisable.

## Global Constraints

- FModel sigue siendo CAD 2D local-first. Sin servidor, nuevas peticiones de red, BIM ni 3D.
- Reutilizar entidades nativas existentes, referencias estables, capas y `CommandApi`; toda operación modifica mediante transacciones y tiene undo/redo atómico.
- Todo texto visible funciona en español e inglés. Mantener Día/Noche y tokens de marca.
- Conservar dibujos, formatos nativos, DXF, comandos y herramientas existentes. No cambiar el formato nativo ni ampliar DWG.
- Geometría finita, medidas positivas y tolerancias de `src/geometry/tolerance.ts`. Previsualización y resultado usan las mismas reglas.
- Trabajar en la rama `codex/architecture-tools`. El controlador gestiona push/PR; el implementador puede hacer commits locales, nunca push ni merge. No crear subagentes dentro del implementador o revisor.

## Task 1: Muros y huecos con herramientas accesibles

Implementar una familia de comandos en `src/commands/architecture.ts`, registrarla en `src/commands/index.ts` sin cambiar la fachada `DRAW_COMMANDS`. La geometría pura puede vivir en `src/geometry/walls.ts`; ajustes de unidades o modelo en módulos apropiados descendentes.

### Muros

- `WALL` (alias `MURO`): recorrido continuo mediante puntos, espesor configurable, justificación centro/izquierda/derecha, deshacer último vértice y cerrar recorrido; Enter termina; Esc cancela la parte pendiente siguiendo el contrato actual del runner. Vista previa de ambas caras y esquinas unidas en los vértices del mismo recorrido.
- `WALLRECT` (alias `HABITACION`): dos esquinas generan los cuatro muros en un solo objeto cerrado, con vista previa. Las medidas del rectángulo corresponden al eje o cara de referencia elegido; explicarlo en la ayuda.
- `WALLCONVERT` (alias `CONVERTIRMURO`): convertir líneas y polilíneas rectas seleccionadas a muros. Usar preselección, respetar capas/espacio y propiedades fuente. Conservar los trazos originales por defecto, opción explícita reemplazar. Rechazar polilíneas con bulges no nulos y recorridos degenerados antes de modificar; no aproximar curvas silenciosamente.
- Representar cada muro como `MLineEntity` con estilo propio de dos caras en offsets ±0.5 y tapas rectas; el espesor es `scale`. Reutilizar un estilo equivalente sin sobrescribir estilos del usuario ni usar el estilo actual arbitrario. No modificar el estilo Standard.
- Espesor inicial equivalente a 150 mm según unidades del dibujo, también 0.15 m; valores físicos de huecos también se convierten a las unidades del dibujo. Documentos sin unidad usan valores numéricos explícitos. No heredar valores de un dibujo con otras unidades.
- Opciones iniciales tienen valores por defecto explícitos; un botón inicia un comando con los mismos datos y reglas que escribirlo. Admitir argumentos de comando para presets de 100, 150 y 200 mm, expresados físicamente y convertidos a las unidades vigentes.
- Evitar recorridos con segmentos colapsados, inversión de 180° y esquinas que produzcan geometría no finita o ingletes desproporcionados. No cambiar de forma general toda multilínea del proyecto para conseguirlo.
- Una unión se refiere a esquinas del mismo recorrido. No prometer unión automática entre objetos de muro independientes.

### Puertas y ventanas

- `WALLDOOR` (alias `PUERTA`) y `WALLWINDOW` (alias `VENTANA`): seleccionar un muro compatible, localizar el hueco sobre el segmento recto más cercano al clic, elegir ancho y ubicación con preview. Proyección sobre el eje sin depender del zoom.
- Default puerta 900 mm y ventana 1200 mm. Permitir cambiar ancho; elegir lado de apertura de puerta mediante punto y opción de cambiar bisagra. El símbolo de puerta incluye hoja y arco real de 90°; ventana incluye jambas y líneas de marco.
- Crear un hueco geométrico real: dividir la multilínea en recorridos a ambos lados del hueco (incluido recorrido originalmente cerrado), conservar estilo, espesor, justificación, espacio y propiedades. No cubrir líneas con wipeout ni dibujar un símbolo sobre un muro intacto.
- El hueco completo debe caber en el tramo sin invadir esquinas. Un hueco fuera de tramo, cercano a una esquina, de ancho inválido o sobre multilínea incompatible produce explicación y no altera el dibujo.
- Antes de confirmar no modificar ni crear estilos; cancelación no deja huecos/símbolos/estilos nuevos. Al confirmar, muro dividido y símbolo constituyen una sola operación deshacible. Símbolos son geometría 2D estándar y no prometen asociatividad posterior con el muro.

### Acceso y documentación

- Añadir pestaña de cinta `Arquitectura / Architecture`, acceso a Muro visible también en Inicio y paleta Arquitectura con los comandos y presets 100/150/200 mm.
- Iconos claros para muro, habitación, puerta y ventana con los patrones existentes. Todas las entradas terminan en los mismos comandos.
- Ayuda bilingüe específica que indique orden de entrada, opciones, unidades, alcance y límites (muros rectos, esquinas del recorrido, huecos no asociativos).
- Catálogo `src/app/features.ts`, evidencia en `src/audit/evidence.ts`, `docs/FEATURES.md` generado, README breve y guía `docs/arquitectura-muros.md`. Crear backlog `ARC-002` en `fix/features/02-geometria-comandos.md`, enlazar desde README del backlog; marcar en curso hasta evidencia final del controlador. Ficha de marca: documentar la pestaña; capturas las genera el controlador al final.

### Pruebas

- Pruebas de geometría: segmento horizontal/vertical/rotado; cada justificación; vértices duplicados, inversión y entradas no finitas; abertura en muro abierto de varios segmentos y cerrado preserva caras y elimina sólo el tramo solicitado; abertura próxima a esquinas rechazada.
- Pruebas de comportamiento con runner: comandos accesibles y aliases únicos; muros continuos/cerrar/undo interno; habitación; conversión conserva/reemplaza; rechazo de curvas; colocación puerta/ventana, cancelación antes de confirmar, error sin mutación, undo/redo como paso único; defaults en mm y m.
- Guardado/apertura nativa y exportación/importación DXF de un plano de muros y huecos: no perder tapas ni símbolos. Si el exportador existente omite tapas de MLINE al descomponer, corregir ese caso mediante prueba focalizada y documentar el mapeo real.
- Registrar evidencia verificable por los scripts de catálogo; ejecutar suites focalizadas, `pnpm typecheck`, `pnpm check:layers`, `pnpm check:features` y lint. El controlador ejecuta `pnpm verify` y navegador real después de revisión.

### Reporte

Autorrevisar el diff y guardar informe con alcance, decisiones, comandos ejecutados y resultados, limitaciones y commits. Responder sólo DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, commits, una línea de pruebas y dudas. No hacer push ni desplegar.
