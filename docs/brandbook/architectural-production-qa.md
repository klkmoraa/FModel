# Producción arquitectónica · QA / Architectural production · QA

Fecha / Date: 2026-10-09. ARC-011..014, cambios locales sobre `0234bce`.
Registro de la verificación local previa al commit, push a main y publicación
en GitHub Pages autorizados posteriormente por el usuario. / Local verification
record before the subsequently authorized main push and GitHub Pages publication.
El usuario autorizó las cuatro mejoras y verificación mínima. Se usó Superpowers
externo, sin reinstalar skills del repositorio. / Four authorized local
improvements, proportional verification and external Superpowers.

Cotas asociativas, etiquetas/cuadros de habitación, red de encuentros/rellenos
y hojas desde marcos usan comandos y controles nativos ES/EN. La interfaz
hereda tokens, iconos, foco y botones existentes; el papel sigue blanco en ambos
temas. Superficie de acabado de muro explícitamente bruta. / Native bilingual
commands/controls, existing tokens and white paper in both themes; wall finish
quantities are explicitly gross.

## Evidencia ejecutada / Executed evidence

| Comprobación / Check | Resultado / Result |
|---|---|
| `pnpm vitest run src/commands/behavior/architecturalProduction.test.ts src/commands/behavior/rooms.test.ts src/commands/behavior/wallNetwork.test.ts src/commands/behavior/sheetSet.test.ts` | 15 aprobadas / passed; unidades mm/m, cambios/undo, cancelación/error, red editable, salida manual y PDF de 2 páginas. |
| `src/io/architecturalProduction.test.ts` | 2 aprobadas / passed; v6, migración v5, rechazo v7, metadatos dañados y recuperación de fuentes. |
| `src/ui/panels/architecturalProductionAccess.test.ts` | 2 aprobadas / passed; ocho accesos ES/EN desde panel, cinta y paleta. |
| Regresiones afectadas / Affected regressions | Nativo 47, asociaciones de huecos IO 5, ciclo de huecos 20, layout 7 y catálogo 12, aprobadas / passed. |
| Tipos, capas, lint y catálogo / Types, layers, lint and catalog | Aprobados / passed; 792 importaciones en capas. |
| `FMODEL_DWG_ENABLED=false pnpm build` y `pnpm check:public-dist` | Aprobados / passed; 189 archivos inspeccionados, lector DWG excluido. Conserva el aviso previo de importación dinámica de `polygon-clipping`. |
| `pnpm exec playwright test e2e/architecturalProduction.spec.ts --project=chromium` | 1 recorrido aprobado / journey passed, 4.6 s; descarga real mediante Publicar. |

El recorrido crea habitación, puerta y vecino T, cotas, datos y cuadros, activa la
red, cambia ancho 900→1100 y comprueba la cota nativa actualizada. Abre las
herramientas Arquitectura, crea dos hojas A3 a 1:50 y descarga un PDF de dos
páginas con el diálogo Publicar existente. / Real commands create/edit the plan,
update the dimension, open Architecture tools and publish two A3 sheets at 1:50.

La designación utiliza fixtures explícitas `selection.set`/`runner.submitEntity`;
no se afirma selección íntegra por puntero. Se desactiva `showSaveFilePicker`
para comprobar la descarga del navegador. La geometría se crea con comandos,
sin insertar entidades crudas ni cambiar tamaño de cuadros mediante fixture.
Se ajustan tema/idioma y zoom para las capturas. / Selection and browser-download
fixtures are disclosed; geometry and table sizing use actual product commands.

## Originales revisados / Reviewed originals

Se inspeccionaron los seis PNG **originales 1440×1000** a resolución original.
Cotas completas y textos legibles en Día/Noche; sin solapamiento de cabeceras
de cuadro ni controles sobre el cajetín. Los nombres largos de herramientas
usan el truncado existente, con códigos de comando y nombres accesibles.
Se copiaron byte por byte desde
`test-results/architecturalProduction-ar-48aaf-multi-page-PDF-in-Day-Night-chromium/`;
ninguna imagen se editó. / Six raw originals reviewed; no image was edited.

| Captura / Capture | SHA-256 |
|---|---|
| [Plano · Día / Plan · Day](assets/architectural-plan-dia.png) | `4692a5f7002a3f6d9900b7b7ac291a0058996c6971cc573326ca942885093669` |
| [Plano · Noche / Plan · Night](assets/architectural-plan-noche.png) | `d59caf34a3ed4fb8c1f3a9c982f45931531b61f49a5e85593992fed7dd4a6ced` |
| [Hoja · Día / Sheet · Day](assets/architectural-sheet-dia.png) | `8cf485c93e3d3734dfb69631e6b243ed09edc1034b7df6cda2be68e22d6bec11` |
| [Hoja · Noche / Sheet · Night](assets/architectural-sheet-noche.png) | `6912b810b3c165ceccb7f526fc20ea762604c30d016166c9c1d475e786f36ae9` |
| [Herramientas · Día / Tools · Day](assets/architectural-tools-dia.png) | `f9c323b8a5f3810a1eb9deae776d1f66a05549a333e04ad5716981fa9ed614d9` |
| [Herramientas · Noche / Tools · Night](assets/architectural-tools-noche.png) | `877094f0ce24c2ee9db938983763d273a61a47fc8aee4ff75ec614e0a0007333` |

[PDF descargado / Downloaded PDF](assets/architectural-sheets.pdf), **2 páginas**,
SHA-256 `f061d79b4b1106f005cd2a953535695991ae9842ebc26dcded72e86ad8daec4e`.

## Revisión y alcance / Review and scope

Publicación posterior autorizada: la [primera CI](https://github.com/klkmoraa/FModel/actions/runs/37887939988)
pasó 1371 pruebas y falló únicamente por una expectativa antigua del texto de
ayuda en `wallCleanupAccess.test.ts`. Se actualizó la comprobación a la instrucción
vigente de restaurar la limpieza antigua antes de editar, en ES/EN; su prueba
focalizada pasó. / The first publication CI exposed one stale help-text assertion;
the focused bilingual cleanup-access check was updated and passed.

Revisión independiente exigida por executing-plans: corregidos relleno con isla
interior, vínculos de LAYOUT COPY, visibilidad de nuevos fragmentos, snapshots
al fusionar capas y referencias de grupos al borrar muro. Regresiones reprodujeron
los fallos. La revisión final confirmó los cierres y no encontró defectos
importantes pendientes. Ajustes visuales preservan medidas y escala nativa.
/ Independent review reproduced and verified fixes; final review found no
remaining important defects in the delivered scope.

Escritorio Chromium Día/Noche; no se comprobaron teléfono, dispositivos físicos,
Safari o Edge en esta entrega. Se ejecutaron comprobaciones focalizadas, sin
suite completa ni cobertura durante la implementación local.
Las hojas son nativas editables, sin regeneración vinculada al marco. Continúan
pendientes huecos curvos/de esquina e interiores/detalles más amplios; no se
declara paridad completa con YQARCH. / Local desktop Chromium scope, focused
checks only; editable native sheets and broader architectural gaps as described
in the [guide](../produccion-arquitectonica.md).
