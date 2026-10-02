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

Escritorio Día/Noche: los dos recorridos de Arquitectura pasaron en Chromium en la CI del PR #6, con capturas reales de 1280×720 inspeccionadas por el controlador. [Día](assets/architecture-day.png) · [Noche](assets/architecture-night.png). La prueba de teléfono aún espera una ejecución correcta tras ajustar sus localizadores accesibles; la revisión visual completa sigue pendiente. / Desktop Day/Night: both Architecture journeys passed in PR #6 Chromium CI, with genuine 1280×720 screenshots inspected by the controller. Phone execution after the accessible-locator correction and complete visual QA are still pending.
