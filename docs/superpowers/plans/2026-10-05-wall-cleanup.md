# Wall junction cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Limpiar encuentros T/X y recortar muros contra columnas con restauración nativa.
**Architecture:** Núcleo puro de segmentos visibles; instantánea LINE con originales ocultos y recuperación validada. Comandos nativos compartidos por toda la UI.
**Tech Stack:** TypeScript, polygon-clipping existente, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-05-wall-cleanup-design.md

## Global Constraints
- CAD 2D local-first; sin nueva red, dependencia, DWG, backend ni cambio de formato nativo.
- Coordenadas en unidades del dibujo, tolerancias centrales y ninguna geometría no finita.
- Toda mutación por CommandApi.apply/CadDocument.transact; cancelar no deja residuos y cada acción tiene undo/redo.
- Conservar IDs, capas, propietarios, grupos y parámetros nativos; metadatos no confiables se validan antes de usarse.
- Interfaz ES/EN accesible en escritorio/teléfono, Día/Noche y tokens existentes.
- Pruebas mínimas significativas; no repetir suites ya aprobadas sin cambios o fallo concreto. Una puerta transversal completa en CI y una revisión visual real antes del cierre.

## Review Focus
1. Caras coincidentes y muros de espesores distintos: una sola frontera sin líneas internas; Task 1.
2. Coordenadas trasladadas grandes y cambio mm/m: geometría finita y equivalente; Task 1.
3. Borrar/desagrupar/modificar resultados: restaurar no pierde originales ni borra ediciones ajenas; Task 2.
4. Metadatos copiados/corruptos y locks durante preview: rechazo sin mutación o recuperación conservadora explícita; Task 2.
5. Huecos y símbolos nativos: no cerrar vacíos y edición paramétrica intacta tras restaurar; Tasks 1/2.

---

### Task 1: Núcleo geométrico de caras limpias
**Files:** crear src/geometry/wallCleanup.ts y src/geometry/wallCleanup.test.ts; reutilizar wallFill.ts/walls.ts sin cambiar contratos.
**Interfaces:**
- Consume WallPath y Vec2 existentes.
- Produce export type CleanupWall = { key: string; path: WallPath; startCap: boolean; endCap: boolean }; export type CleanupColumn = { kind: 'polygon'; vertices: Vec2[] } | { kind: 'circle'; center: Vec2; radius: number }; export type CleanupSegment = { sourceKey: string; start: Vec2; end: Vec2 }; export function cleanWallFaces(walls: readonly CleanupWall[], columns: readonly CleanupColumn[]): CleanupSegment[]; export class WallCleanupError extends Error con mensaje ES/EN.
- sourceKey asigna cada segmento a un fragmento nativo para heredar propiedades. Caps corresponden a estilos existentes. Límites exactos y geometría del Spec vinculantes.
- [x] Añadir pruebas focalizadas: T horizontal (0,0)→(6000,0), espesor 300; vertical (3000,0)→(3000,3000), espesor 200; desaparece cara y=150 entre x=2900..3100. X extiende vertical a y=-3000, desaparecen ambas caras horizontales en ese intervalo; no duplicados. Variante top/bottom desigual.
- [x] Añadir casos agrupados de caras coincidentes, fragmentos con hueco 900 intacto, columna rectangular y círculo centro(3000,0) radio500: cortes de cara y=150 en x=3000±sqrt(500²−150²); geometría equivalente escalada 0.001 y trasladada a UTM; no finitos/colapsos/budgets rechazan.
- [x] Ejecutar sólo archivo nuevo para rojo significativo, implementar cleanWallFaces con validación previa, unión de material/frontera y recorte analítico manteniendo propiedades mediante sourceKey.
- [x] Ejecutar archivo focalizado y pnpm typecheck, registrar resultados exactos y commit. No suite completa ni navegador en esta tarea.

### Task 2: Comandos reversibles, persistencia y acceso
**Files:** crear src/model/wallCleanup.ts, src/commands/wallCleanup.ts, src/commands/behavior/wallCleanup.test.ts, src/io/wallCleanup.test.ts, e2e/wallCleanup.spec.ts; modificar src/commands/architecture.ts, src/model/wallAssembly.ts (guardas accionables sin debilitar validación), src/commands/wallFill.ts/wallUtilities.ts/architectureOpenings.ts según guardas comunes; src/ui/panels/ArchitecturePanel.tsx, src/ui/ribbonConfig.ts, src/ui/panels/ToolPalettesPanel.tsx, src/io/dxf/exportDxf.ts; src/app/features.ts y docs/FEATURES.md generado, docs/arquitectura-muros.md, docs/dxf-compatibilidad.md, docs/yqarch/cobertura.csv/README.md, fix/features/README.md/02-geometria-comandos.md, docs/brandbook/wall-cleanup-qa.md tras evidencia.
**Interfaces:**
- Consume cleanWallFaces y sus tipos de Task 1, readWallSource/readComponentAssembly, CommandApi.apply/getSelection/setPreview, Transaction.
- Produce WALL_CLEANUP_COMMANDS con WALLCLEAN/LIMPIARMUROS y WALLRESTORE/RESTAURARMUROS. WALLCLEAN selección → preview → Intro; WALLRESTORE selección de salida o keyword All/Todos para recuperar sin salidas → preview → Intro. Esc siempre cancela pendiente.
- Modelo expone lector estricto de registros y operaciones transaccionales create/restore; nombres internos a criterio del implementador, evitando dependencias hacia arriba.
- Registros meta version1 con selfId/batchId y referencias recíprocas; snapshot mínimo de geometría de salidas sólo para conservar ediciones. No bump de formato. Originales quedan en sus grupos; resultados tienen grupo sólo de resultados.
- [x] Añadir pruebas del runner/modelo: T+columna+wall assembly con hueco se limpia en un undo, sólo MLINE se oculta, símbolos/columnas intactos; restore devuelve fuentes mismos IDs/grupos y permite WALLTHICKNESS/OPENINGEDIT; undo/redo de ambas operaciones.
- [x] Añadir pruebas agrupadas cancel/stale (incluido cambio capa/unidades); erase/ungroup all outputs y restore All; conservar salida modificada; tag copiado o referencias ajenas no borran terceros; corrupción rechaza sin mutación. No tests espejo de implementación.
- [x] Implementar modelo/selección/preview/confirmación/recuperación del Spec y límites del lote antes de trabajo. Registrar y dar acceso UI ES/EN con foco nativo; corregir hint de Eje/Paralelo. Mantener ayuda explícita instantánea y restaurar→editar→limpiar.
- [x] Añadir roundtrip nativo con limpieza/restauración y metadata dañada rechazada al uso; DXF sólo líneas visibles limpias, fuentes conservadas invisibles y aviso de pérdida recuperación. Reutilizar fixtures y tests de formato futuro existentes sin duplicarlos.
- [x] Añadir un recorrido Playwright parametrizado escritorio/teléfono Día/Noche con accesos reales, geometría observable, preview/cancel y cleanup/restore/undo; guardar capturas originales. No instalar/ejecutar navegador local; controller ejecuta CI de GitHub y revisa imágenes.
- [x] Ejecutar únicamente tests nuevos y typecheck/lint/check:layers/check:features; discovery Playwright sólo comprueba registro. Actualizar docs de comportamiento con estado en curso hasta evidencia CI, commit y reporte.
- [x] Controller obtiene una puerta CI transversal real del SHA final y revisión visual. Implementador añade sólo evidencia/capturas originales aprobadas y cierre ARC-007, con checks de documentación. Sin repetir suite producto para cambios de evidencia.

Evidence closure 2026-10-07: controller-approved source CI 37628277682 and six raw originals are recorded in `docs/brandbook/wall-cleanup-qa.md`. Final evidence-tree CI and actual publication remain controller gates.
