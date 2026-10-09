# Plan de producción arquitectónica 2D

Especificación: ../specs/2026-10-09-architectural-production-design.md.
Ejecutar en esta sesión con Superpowers externo. El usuario autorizó los cuatro resultados; las elecciones rutinarias se documentan y se implementan sin otra ronda de permiso. AGENTS y verificación mínima prevalecen. Conservar docs/research; no commit/push nuevo sin petición.

## Tarea 1 — Contratos y cotas (ARC-011)

- [x] Registrar ARC-011..014; sólo la tarea actual en curso.
- [x] Tipar automatización de grupos y datos/etiquetas/cuadros de habitación. Validar forma y referencias, migración nativa v6, copias independientes, purga/capas y aviso DXF.
- [x] Escribir y ejecutar primero regresión de WALLDIM: fuentes/huecos, unidades, cancelación, IDs, actualización y undo. Implementar cadena/total, offsets manuales y fuentes inválidas.
- [x] Instalar reactor, registrar comando y verificar únicamente sus pruebas y formato afectados.

## Tarea 2 — Habitaciones y cuadros (ARC-012)

- [x] Probar área/perímetro/altura en mm/m, rechazo de contorno degenerado, edición de nombre/material/geometría, etiqueta/agrupación, cancelación y persistencia.
- [x] Implementar ROOMDATA y tablas de área/material, snapshot compartido por propietario, actualización/undo y separación manual de texto.

## Tarea 3 — Encuentros y rellenos vivos (ARC-013)

- [x] Probar red T/X con huecos: alta/baja/edición nativa de hueco sin restaurar, cambio de vecino, cancelación, undo, salida editada preservada, desactivar y persistencia.
- [x] Implementar red acotada reutilizando cleanWallFaces/wallFillLoops/columnas. Resolver selección LINE→fuente y permitir fuentes ocultas únicamente si hay asociación válida. Reactores convergentes; errores preservan contenido y muestran revisión.

## Tarea 4 — Producción de hojas (ARC-014)

- [x] Probar marcos/escala en mm/m, hojas únicas, viewport bloqueado, cancelación/error sin cambios, undo y publicación de varias páginas.
- [x] Implementar SHEETSET con entidades/layouts/page setup nativos, confirmación y comprobación de encaje; reutilizar PUBLISH.

## Tarea 5 — Acceso y cierre

- [x] Panel, cinta y paleta ES/EN; ayuda coherente con alcance real. Catálogo y docs generadas; backlog sólo cierra con evidencia.
- [x] Tipos, capas, lint focalizado, build público y recorrido real Día/Noche; corregir sólo fallos observados. Capturas originales y ficha de brandbook.
- [x] Revisión final independiente exigida por executing-plans; corregir hallazgos importantes con regresión focalizada. Conservar decisiones/evidencia en docs, limpiar sólo scratch propio y entregar cambios locales.

## Cierre — 2026-10-09

Las cuatro tareas y el acceso están terminados localmente. La [guía](../../produccion-arquitectonica.md) describe el comportamiento y límites; la [ficha QA](../../brandbook/architectural-production-qa.md) conserva pruebas ejecutadas, revisión independiente, seis originales Día/Noche y PDF descargado de dos páginas. No suite completa, cobertura ni nuevo commit/push/publicación. El scratch propio se elimina después de transferir evidencia; `docs/research/` ajeno se conserva.

Petición posterior del usuario: commit y push a `main`, con publicación en GitHub Pages mediante el workflow existente. Se conserva fuera del commit `docs/research/`, ajeno a esta implementación.
