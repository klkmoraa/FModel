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

FModel no lee ni escribe DWG y no simula compatibilidad: no hay una solución legal y fiable para una aplicación web. Intercambia mediante DXF. Detalle de lo que DXF conserva, transforma y no admite en [docs/dxf-compatibilidad.md](docs/dxf-compatibilidad.md).

## Desarrollo

Requiere Node 24 (≥ 22.13 para la aplicación; ≥ 23.6 para generar la documentación de funciones) y pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm verify
```

| Script | Qué hace |
|---|---|
| `pnpm dev` | servidor de desarrollo |
| `pnpm build` | tipos + compilación de producción en `dist/` |
| `pnpm test` | pruebas (Vitest) |
| `pnpm lint` | oxlint |
| `pnpm check:layers` | verifica que las dependencias entre módulos respetan las capas |
| `pnpm docs:features` | regenera `docs/FEATURES.md` desde `src/app/features.ts` |
| `pnpm verify` | tipos, capas, documentación al día, pruebas y compilación |

Auditoría opcional de la salida DXF con [ezdxf](https://ezdxf.mozman.at/):

```bash
FMODEL_DXF_OUT=/tmp/fmodel.dxf pnpm vitest run src/io/dxf && python scripts/audit-dxf.py /tmp/fmodel.dxf
```

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Tolerancias geométricas](docs/tolerancias.md)
- [Compatibilidad DXF](docs/dxf-compatibilidad.md)
- [Estado de funciones](docs/FEATURES.md)

---

**English.** FModel 2D CAD is a professional, local-first 2D CAD web app (Chrome, Safari, Edge; Spanish and English) with precision drafting, dynamic blocks, layouts with vector PDF/SVG output, external references, DXF import/export with conversion reports, audit tools and version comparison. DWG is not supported. Run `pnpm install && pnpm dev`; see `docs/` for architecture, tolerances, DXF compatibility and feature status.
