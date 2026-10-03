# FModel · Sistema de diseño

Brandbook de la familia de FModel, derivado del brandbook global de FusionStructure.
Abre `index.html` en el navegador: siete fichas (sistema, logos, Día y Noche,
componentes reales, interfaces, herramientas y auditoría).

- `logos/`: marca de FModel — la ménsula con la franja en el color de su familia (Día, Noche e icono de app).
- `assets/`: capturas de la app en Día y Noche (mesa, Inicio ya pintado, teléfono y tableta; se regeneran cuando cambia la interfaz).
- Lienzo editable (Claude Design): https://claude.ai/artifact/65qLu26K96pfCTxiMG1yu7

El código manda: si `src/` y este documento discrepan, se corrige el documento.

## Receta de botones y campos (mesa)

Fuente: `src/styles/tokens.css` (sombras `--shadow-*`) y `src/styles/app.css`.

| Pieza | Clase | Material |
|---|---|---|
| Primario | `.btn--primary` | morado de Modelo, texto `--fs-interaction-ink`, relieve `--shadow-raised` |
| Secundario | `.btn` | superficie elevada `--shadow-chip` → `--shadow-raised` al pasar → `--shadow-inset` al pulsar |
| Peligro | `.btn--danger` | secundario con canto rojo y punto rojo (sin punto si lleva icono) |
| Fantasma | `.btn--ghost` | plano; sólo en barras densas |
| Interruptor | `.btn[aria-pressed]` | anillo `--shadow-selected` |
| Segmentado | `<Segmented>` / `.seg` | pista hundida, opción activa elevada con anillo morado; flechas, Inicio y Fin |
| Campo | `.input`, `.select` | hundido `--shadow-field`; al enfocar sube a la superficie con `--shadow-focus` |

## Teléfono y tableta

- **Teléfono** (`PHONE_QUERY` en `src/ui/layoutMode.ts`: ≤ 640 px, o táctil con ≤ 500 px de alto): `.app--phone`. Dock flotante (`.precision-dock--phone`), tarjeta de comando o selección (`.phone-card`) y hojas inferiores (`.sheet`) para paneles, precisión, menú y herramientas.
- **Tableta** (`TOUCH_QUERY`, puntero grueso con más espacio): la mesa de escritorio con objetivos táctiles, zoom flotante y Aceptar en el dock.
- La materia es la misma que en escritorio: nada de barras propias del móvil.
- **Orientación**: el teléfono se usa en vertical. Girado, `RotatePrompt` propone volver a vertical sin bloquear (WCAG 1.3.4); «Seguir en horizontal» se recuerda en la sesión.



## Arquitectura / Architecture (ARC-002)

La familia Arquitectura está en el mismo `ToolDeck` de escritorio/tableta y en la hoja de herramientas del teléfono, generada por `RIBBON`. Muro también aparece en Inicio. Grupos: Muros (Muro/Habitación/Convertir), Huecos (Puerta/Ventana) y Espesores (100/150/200 mm). La paleta Arquitectura comparte comandos y argumentos con estos accesos.

Architecture uses the same desktop/tablet ToolDeck and phone tools sheet generated from RIBBON. Wall is also in Home. Groups: Walls, Openings and Thicknesses. The Architecture palette shares these commands and arguments.

Iconos `wall`, `room`, `door`, `window`: caja 24×24, trazo nativo, `currentColor`; sin nuevos colores ni material. Botones, foco, objetivos táctiles y tema Día/Noche heredan los componentes existentes. / Icons use the existing 24×24 box, stroke and currentColor; buttons, focus, touch targets and Day/Night themes inherit existing components.

Escritorio Día/Noche y teléfono aprobados en [CI 37022156512](https://github.com/klkmoraa/FModel/actions/runs/37022156512): 50/50 Chromium E2E y capturas reales inspeccionadas por el controlador. [Día](assets/architecture-day.png) · [Noche](assets/architecture-night.png) · [Teléfono 390×844](assets/architecture-touch.png). El teléfono muestra todas las herramientas de muros/huecos/presets sin desbordamiento horizontal y prueba preset de 100 mm/cancelación. Cierra el núcleo de ARC-002; no acredita otros módulos de YQARCH. / Desktop Day/Night and phone passed in that CI; genuine 1280×720 and 390×844 captures were reviewed. Phone wall/opening/preset tools fit without horizontal overflow and the 100 mm preset/cancel journey passes. This closes the ARC-002 core only.

## Piezas de construcción / Construction components (ARC-003)

`ARCHITECTURE` / `ARQUITECTURA` abre el catálogo nativo desde ToolDeck, paleta o paneles del teléfono. Catorce familias, búsqueda/categoría, campos con unidades y miniatura SVG desde primitivas/transformación nativas. Usa `.input`, `.btn`, foco y tokens existentes; teléfono con objetivos mínimos de 44 px. Los colores de la UI proceden de `tokens.css`; no se tiñe el papel técnico. / The native catalogue uses existing controls/tokens, unit-labelled fields and a builder-based SVG miniature, with 44 px phone targets.

Colocar valida todos los campos; Editar pieza inicia las solicitudes nativas de `COMPONENTEDIT`. Los errores son texto visible con `role=alert` y `aria-invalid`; la hoja no se cierra ante entradas inválidas. Una acción válida cierra la hoja y enfoca el lienzo. Abrirla no enfoca un input. Cerrar/reabrir conserva las medidas; cambiar dibujo/unidades refresca defaults. / Invalid actions retain the sheet and visible field errors. Valid actions close it and focus the canvas. Opening never focuses an input; close/reopen retains dimensions while document/unit changes reset defaults.

**Evidencia visual aprobada.** [CI 37097760918](https://github.com/klkmoraa/FModel/actions/runs/37097760918): 1100/1100 pruebas y 56/56 recorridos Chromium, incluidos seis de componentes (mm/m × Día/Noche y teléfono × Día/Noche). El controlador revisó las 14 capturas originales; [ficha QA con huellas](components-qa.md). Ocho originales sin editar: escritorio mm [Día catálogo](assets/components-desktop-mm-dia.png) · [Día editada](assets/components-desktop-mm-dia-placed.png) · [Noche catálogo](assets/components-desktop-mm-noche.png) · [Noche editada](assets/components-desktop-mm-noche-placed.png); teléfono [Día acciones](assets/components-phone-dia-actions.png) · [Día reapertura](assets/components-phone-dia-reopened.png) · [Noche acciones](assets/components-phone-noche-actions.png) · [Noche reapertura](assets/components-phone-noche-reopened.png). La columna editada cabe completa; la hoja telefónica se reabre opaca y conserva `650mm`, con acciones legibles sin desbordamiento. Cierra ARC-003 para estas catorce familias; no supone paridad general con YQARCH. / Genuine Day/Night desktop and phone captures were approved; the scope is the fourteen native 2D families.

## Huecos asociados / Associated openings (ARC-004)

Los accesos Mover, Copiar, Editar, Reflejar, Borrar hueco y Espesor de muro usan los controles existentes de Arquitectura en ToolDeck, paleta y panel, con tokens Día/Noche, foco y objetivos táctiles. La vista previa recompone el muro y oculta temporalmente sólo los miembros sustituidos. / Native commands share Architecture controls and render-only replacement previews.

**Evidencia visual aprobada:** [CI 37131723475](https://github.com/klkmoraa/FModel/actions/runs/37131723475), 1169 pruebas y 60 recorridos Chromium (cuatro nuevos de huecos). El controlador inspeccionó las [seis capturas originales y sus huellas SHA-256](openings-qa.md): escritorio [Día geometría](assets/openings-desktop-dia-geometry.png) · [Noche geometría](assets/openings-desktop-noche-geometry.png); teléfono [Día geometría](assets/openings-phone-dia-geometry.png) · [Día acciones](assets/openings-phone-dia-actions.png) · [Noche geometría](assets/openings-phone-noche-geometry.png) · [Noche acciones](assets/openings-phone-noche-actions.png). La pared completa y el hueco reparado caben en las capturas de geometría; la hoja telefónica desplaza sus seis acciones al viewport para la captura de controles. / All six raw Day/Night desktop/phone frames were reviewed; action views intentionally scroll to the controls, with complete geometry shown separately.

ARC-004 cierra sólo huecos asociados de muros rectos compatibles y espesor. Redes T/X, recorte de columnas y huecos curvos/de esquina siguen fuera de este alcance; no se afirma paridad general con YQARCH. / The approved scope is compatible straight-wall openings and thickness only.
