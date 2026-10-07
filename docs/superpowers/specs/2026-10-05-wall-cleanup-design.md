# ARC-007 — Limpieza reversible de encuentros de muros
Fecha: 2026-10-05. Continúa el diseño maestro YQARCH con autorización expresa de implementación y pruebas mínimas.

## Resultado e interacción
WALLCLEAN / LIMPIARMUROS selecciona muros nativos compatibles y columnas nativas opcionales, muestra los encuentros T/X limpios y el recorte de caras dentro de columnas, y confirma con Intro o cancela con Esc. Los LINE resultantes son una instantánea editable. Sólo los fragmentos MLINE sustituidos se ocultan; jambas, símbolos y columnas quedan visibles. WALLRESTORE / RESTAURARMUROS permite seleccionar un resultado o usar Todos sin selección para recuperar los originales aunque se hayan borrado los resultados. Restaurar → editar parámetros/huecos → limpiar de nuevo es el flujo explícito; no se promete actualización automática de vecinos ni de rellenos independientes.

## Geometría
Usar el material de los fragmentos actuales, no el recorrido original que rellenaría huecos. Unir polígonos sólo para identificar frontera exterior, dividir las caras/cabeceras originales contra esa frontera, quitar tramos interiores y duplicados coincidentes determinísticamente, conservar propiedades de la entidad contribuyente. Las cabeceras sólo existen cuando el estilo nativo las dibuja. Columnas poligonales: recorte por intersecciones exactas. Columnas circulares: intersección analítica de segmento/círculo, sin teselación dependiente de zoom. No modificar columnas ni recortar símbolos de puertas/ventanas.
No puentear extremos cercanos, convertir líneas sueltas, admitir muros curvos ni generar rellenos. Rechazar un lote sin ningún resultado seleccionable. Máximos: 100 orígenes, 5000 puntos de entrada, 10000 segmentos resultantes y 2000000 operaciones candidatas segmento/borde; rechazar antes del trabajo costoso. TOL/linearTol y validación de finitud incluyendo valores derivados; resultados equivalentes mm/m.

## Conservación y recuperación
Conservar IDs, propiedades y grupos de fuentes. Los grupos de resultados contienen sólo resultados visibles, nunca originales ocultos. Registros versionados acotados en meta de los anclajes guardan identidad propia, identidad de lote, IDs de fuentes/salidas, visibilidad previa y firmas mínimas necesarias; backlinks de salidas incluyen identidad propia y anclaje. Validar referencias recíprocas antes de usarlas; metadatos copiados/importados nunca autorizan borrar u ocultar entidades ajenas. No guardar documentos completos en meta.
Restaurar cambia sólo visibilidad y metadatos propios, nunca sobrescribe geometría/propiedades editadas. Quitar únicamente resultados que aún pertenezcan al lote y coincidan con su geometría registrada; conservar resultados modificados o de propiedad ambigua e informar claramente. Los resultados borrados o desagrupados no bloquean revelar fuentes válidas. Columnas cambiadas/borradas no bloquean recuperación. No eliminar grupos ajenos ni miembros añadidos por el usuario. Rechazar referencias corruptas antes de mutar. Fuentes borradas no se recrean ni se sustituyen por otra entidad con ID reutilizado.
Los lectores/comandos de muro reconocen resultados limpios y fuentes en limpieza, ofreciendo restaurar antes de editar. Los comandos de restauración aceptan fuentes ocultas sólo mediante registros propios validados y respetan espacio activo, locks/capas. Selección y confirmación de limpieza verifican todos los miembros, grupos, capas, estilos, unidades y propiedades; Esc/error no escribe.
Un solo CommandApi.apply por limpieza/restauración. Preview excluye sólo MLINE reemplazados, sin mutación persistente.

## Persistencia y presentación
No cambia el esquema ni versión de formato nativo: meta ya persiste opacamente como en los componentes/muros existentes; validar los registros al usarlos. Guardado nativo conserva recuperación. DXF conserva geometría estándar y declara pérdida de recuperación; retener fuentes invisibles con código 60 es aceptable si no reaparecen como líneas visibles, documentándolo.
Acceso real en comandos, Arquitectura, cinta y paleta, ES/EN, foco/teléfono y tokens actuales. Corregir el hint compartido que atribuye columnas a Eje/Paralelo. Actualizar catálogo, guía, cobertura y backlog con alcance parcial explícito.

## Restricciones globales
- CAD 2D local-first; sin nueva red, dependencia, DWG, backend ni cambio de formato nativo.
- Coordenadas en unidades del dibujo, tolerancias centrales y ninguna geometría no finita.
- Toda mutación por CommandApi.apply/CadDocument.transact; cancelar no deja residuos y cada acción tiene undo/redo.
- Conservar IDs, capas, propietarios, grupos y parámetros nativos; metadatos no confiables se validan antes de usarse.
- Interfaz ES/EN accesible en escritorio/teléfono, Día/Noche y tokens existentes.
- Pruebas mínimas significativas; no repetir suites ya aprobadas sin cambios o fallo concreto. Una puerta transversal completa en CI y una revisión visual real antes del cierre.

## Evidencia mínima
Geometría T/X desigual, junta coincidente, hueco, columna poligonal/circular exacta, unidades y entradas degeneradas/acotadas. Un recorrido comando limpieza/restauración con hueco, IDs, undo/redo y edición posterior; cancelación, stale y recuperación sin resultados; ownership corrupto/copias no afectan terceros. Native roundtrip y DXF visible. Un recorrido real escritorio/teléfono por Día/Noche que compruebe preview/resultado/restauración y capturas originales. No afirmar paridad YQARCH completa.
