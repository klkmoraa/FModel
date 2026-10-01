# FModel · Sistema de diseño

Brandbook de la familia de FModel, derivado del brandbook global de FusionStructure.
Abre `index.html` en el navegador: siete fichas (sistema, logos, Día y Noche,
componentes reales, interfaces, herramientas y auditoría).

- `logos/`: marca de FModel — la ménsula con la franja en el color de su familia (Día, Noche e icono de app).
- `assets/`: capturas de la app en Día y Noche (mesa con la pista de lienzo vacío e Inicio ya pintado; se regeneran cuando cambia la interfaz).
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

