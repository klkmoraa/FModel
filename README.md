# FModel 2D CAD

CAD 2D profesional en el navegador, de la familia FusionStructure. Dibujo técnico preciso para escritorio y tableta en Chrome, Safari y Edge, en español e inglés. Local-first: tus dibujos, versiones y autoguardados se quedan en tu navegador.

> Alcance estrictamente 2D: sin BIM, IFC, sólidos, mallas ni render 3D.

## Qué incluye

- **Dibujo y edición** con geometría real: línea, polilínea, arco, elipse, spline, sombreado con islas, textos, directrices, tablas; recortar, alargar, desfase, empalme, chaflán, estirar, matrices asociativas, juntar, partir, alinear y más.
- **Precisión**: coordenadas absolutas, relativas y polares, distancia directa, entrada dinámica, orto, rastreo polar, referencias a objetos con Tab entre candidatos y rastreo de referencias.
- **Capas, estilos y anotación**: administrador de capas con estados y filtros, estilos de texto, cota, directriz, tabla y multilínea, cotas asociativas, campos y escala anotativa.
- **Bloques dinámicos** con Editor de bloques: parámetros, acciones, estados de visibilidad, tablas de consulta, fórmulas, restricciones, prueba y vista previa en vivo.
- **Presentaciones**: viewports rectangulares, poligonales y de objeto, capas por viewport, configuración de página, cajetín, **PDF vectorial**, publicación multipágina y **SVG**.
- **Referencias externas**: dibujos (enlazar/superponer, con detección de ciclos), imágenes y calcos PDF con recorte, atenuación y referencias a objetos sobre los trazos vectoriales de la página.
- **Intercambio**: formato nativo `.fmodel` versionado, **DXF** de entrada y salida con informe de conversión.
- **Calidad**: auditoría con corrección, informe de salud del dibujo, limpieza de duplicados y elementos sin uso, comparación de revisiones.
- **Productividad**: paleta de comandos, alias y atajos configurables, paletas de herramientas, autoguardado, recuperación y versiones.

El estado real de cada función (Disponible, Experimental, Planeado) está en [docs/FEATURES.md](docs/FEATURES.md) y en la ayuda de la aplicación (F1).

## DWG

La versión pública de GitHub Pages admite `.fmodel`, `.fmodellib` y DXF; no incluye el lector DWG experimental. Convierte DWG a DXF antes de abrirlo. El desarrollo y las pruebas conservan la lectura experimental local, con las limitaciones verificadas y la revisión de distribución pendiente (`REL-001`, ruta B). FModel no escribe DWG. Detalle de lo que DXF conserva, transforma y no admite en [docs/dxf-compatibilidad.md](docs/dxf-compatibilidad.md).

## Desarrollo

Requiere Node 24 y pnpm 11.

```bash
pnpm install
```

```bash
pnpm dev
```

Para comprobar un cambio, ejecuta sólo las pruebas focalizadas necesarias y las
comprobaciones pertinentes de tipos, capas o compilación. `AGENTS.md` define esta
política; la suite completa y la cobertura son opcionales.

| Script | Qué hace |
|---|---|
| `pnpm dev` | servidor de desarrollo |
| `pnpm build` | tipos + compilación de desarrollo/experimental en `dist/` |
| `FMODEL_DWG_ENABLED=false pnpm build` | compilación pública sin lector DWG JS/WASM (Pages) |
| `pnpm check:public-dist` | rechaza referencias al lector DWG y su registro de archivos en todo `dist/`, incluidos mapas y PWA |
| `pnpm test` | pruebas (Vitest) |
| `pnpm lint` | oxlint con cero advertencias |
| `pnpm check:layers` | verifica que las dependencias entre módulos respetan las capas |
| `pnpm docs:features` | regenera `docs/FEATURES.md` desde `src/app/features.ts` |
| `pnpm verify` | lint, tipos, capas, documentación al día, pruebas y compilación |

Auditoría opcional de la salida DXF con [ezdxf](https://ezdxf.mozman.at/):

```bash
FMODEL_DXF_OUT=/tmp/fmodel.dxf pnpm vitest run src/io/dxf && python scripts/audit-dxf.py /tmp/fmodel.dxf
```

**Muros 2D / 2D walls.** Arquitectura ofrece `WALL`/`MURO`, `WALLRECT`/`HABITACION`, conversión de líneas y huecos nativos editables con puerta o ventana. Espesor inicial 150 mm; presets físicos 100/150/200 mm. Etiquetas P/V/H y cuadro de huecos vinculados. / Architecture offers continuous walls, closed rooms, straight-line conversion and editable native openings, with linked P/V/H tags and schedules. Initial thickness 150 mm; physical 100/150/200 mm presets. [Guía / Guide](docs/arquitectura-muros.md).

**Producción arquitectónica / Architectural production.** Cotas automáticas, habitaciones y cuadros de áreas/acabados, encuentros/rellenos asociados y hojas A3/A4 desde marcos a escala con PDF multipágina. Superficie de muro bruta, sin deducciones inferidas. / Live dimensions, rooms and floor/finish schedules, automatic junctions/fills and scaled A3/A4 sheets from frames with multi-page PDF. Wall quantities are gross, without inferred deductions. [Uso y alcance / Usage and scope](docs/produccion-arquitectonica.md).

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Muros y huecos / Walls and openings](docs/arquitectura-muros.md)
- [Producción arquitectónica / Architectural production](docs/produccion-arquitectonica.md)
- [Tolerancias geométricas](docs/tolerancias.md)
- [Compatibilidad DXF](docs/dxf-compatibilidad.md)
- [Estado de funciones](docs/FEATURES.md)

---

**English.** FModel 2D CAD is a professional, local-first 2D CAD web app (Chrome, Safari, Edge; Spanish and English) with precision drafting, dynamic blocks, layouts with vector PDF/SVG output, external references, DXF import/export with conversion reports, audit tools and version comparison. Public GitHub Pages excludes the experimental DWG reader; convert DWG to DXF. Development and tests retain experimental local reading. FModel does not write DWG; distribution/legal review remains open (REL-001, route B). Run `pnpm install && pnpm dev`; see `docs/` for architecture, tolerances, DXF compatibility and feature status.
