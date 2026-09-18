# Auditoría base — 2026-09-18

## Alcance revisado

- 381 archivos versionados; 217 fuentes TypeScript/TSX y aproximadamente 43,083 líneas en `src/`.
- Subsistemas: geometría, documento/historial, modelo, comandos, bloques dinámicos, restricciones, DXF/DWG, referencias externas, salida PDF/SVG, persistencia, workers, renderizado, UI y PWA.
- Configuración y entrega: `package.json`, `tsconfig.json`, `vite.config.ts`, GitHub Actions, manifiesto PWA y documentación técnica/funcional.
- Búsqueda estática de rutas de archivo, JSON/ZIP, IndexedDB, `localStorage`, portapapeles, workers, temporizadores, `fetch`, service worker, APIs de navegador y supresiones de lint.
- Dependencias de producción auditadas con `pnpm audit --prod`.

## Estado comprobado

| Verificación | Resultado |
|---|---|
| TypeScript estricto | Pasa |
| Arquitectura por capas | Pasa; 477 importaciones revisadas |
| Catálogo generado de funciones | Al día |
| Vitest | 42 archivos, 316 pruebas, todas pasan |
| Build de producción | Pasa; 2,226 módulos transformados |
| Auditoría de dependencias de producción | 0 vulnerabilidades conocidas |
| Lint | Pasa con 24 advertencias |
| Cobertura | No disponible: falta `@vitest/coverage-v8` |

Los comandos se ejecutaron con Node 24.19.0 y pnpm 11.19.0. El shell inicial no tenía Node en `PATH`; se utilizó el runtime incluido en el entorno de Codex. Esto no se contabiliza como defecto del repositorio.

## Métricas que justifican el backlog

- Bundle inicial: `dist/assets/index-*.js` ≈ 1,178 KB sin comprimir / 368 KB gzip.
- Lector DWG: WebAssembly ≈ 9.96 MB, publicado en `dist/assets/`.
- Source maps públicos: ≈ 8.6 MB en total; el mapa principal mide ≈ 3.9 MB.
- Biblioteca inicial: 100 DXF, ≈ 3.8 MB en `public/library/`.
- Archivos especialmente grandes: `commands/draw.ts` 1,548 líneas, `io/dxf/exportDxf.ts` 1,418, `commands/modify.ts` 1,246, `document/types.ts` 1,056 y `editor/editor.ts` 992.
- UI: 46 archivos; solo hay pruebas unitarias directas para `dropOnCanvas` y `wheelInput`, aunque algunas pruebas de comandos verifican cableado.

## Hallazgos confirmados de mayor impacto

1. `saveFile()` devuelve `null` tanto cuando el fallback descarga correctamente como cuando el usuario cancela `showSaveFilePicker()`. `commands/file.ts` interpreta ambos casos como éxito, limpia `doc.dirty` y anuncia que se guardó. Esto puede permitir cerrar y perder cambios tras cancelar Guardar como.
2. El portapapeles serializa solo entidades. Al pegar en otro dibujo no incluye definiciones de bloque, estilos, recursos de imagen/PDF ni otras dependencias; normaliza únicamente la capa. Puede producir referencias rotas.
3. `.fmodel`, `.fmodellib` y el portapapeles se convierten desde JSON/ZIP con validación estructural mínima y sin límites de tamaño, conteo o expansión. Un archivo dañado puede fallar tarde; uno hostil puede agotar memoria en el cliente.
4. El paquete `@mlightcad/libredwg-web` declara licencia GPL-3.0 y su WASM se publica en `dist`; a la vez, la propia documentación dice que FModel es privado y que publicar obliga a tomar una decisión de licencia. El workflow despliega automáticamente desde `main`.
5. El hash de versión del service worker se calcula con nombres de archivo, no con el contenido de archivos públicos. Un cambio aislado en `manifest.webmanifest`, iconos o biblioteca con el mismo nombre puede conservar la misma caché.
6. El workflow de Pages compila y despliega sin depender del job completo de CI; una entrega puede avanzar aunque lint, pruebas, arquitectura o documentación fallen en el workflow paralelo.
7. README, ayuda y onboarding dicen que DWG no se admite, mientras comandos, manifiesto, catálogo y arquitectura sí lo ofrecen como experimental.

## Lo que ya está bien y debe conservarse

- TypeScript estricto y separación explícita de capas.
- Documento transaccional con undo/redo, rollback y reactores.
- Pruebas amplias de geometría, bloques dinámicos, DXF/DWG, persistencia y salida vectorial.
- Carga diferida de PDF, DXF pesado y LibreDWG.
- Aplicación local-first sin backend ni telemetría implícita.
- Formato nativo versionado con migraciones y pruebas de ida y vuelta.
- Auditoría de dependencias sin vulnerabilidades conocidas al momento de esta revisión.

## Limitaciones de esta auditoría

- No se ejecutó cobertura porque el adaptador V8 no está instalado; `TST-002` lo resuelve.
- No hay suite E2E instalada, por lo que selector de archivos, descargas, PWA, teclado, IndexedDB real y gestos se revisaron por código, no mediante navegador automatizado.
- La tarea `REL-001` requiere una decisión de producto/licencia y, si corresponde, revisión jurídica. Esta auditoría identifica el conflicto; no emite asesoría legal.
