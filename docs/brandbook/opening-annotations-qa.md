# Etiquetas y cuadro automáticos · QA / Automatic tags and schedule · QA

Fecha / Date: 2026-10-08. ARC-010, implementación local sobre `main` del PR #7
(`4be7fc8`). Este registro recoge la verificación local anterior al commit/push
autorizado posteriormente por el usuario.

`ETIQUETASHUECOS` / `OPENINGTAGS` comparte agrupación y claves con el cuadro.
Altura ajustable, preview con Intro/Esc, IDs estables, desplazamiento manual,
actualización en la misma transacción y persistencia nativa v5. Los accesos de
Arquitectura usan botones, foco y tokens existentes. / Native Architecture
controls; shared keys, adjustable height, atomic history and native persistence.

Verificación proporcional ejecutada:

- `src/io/openingAnnotations.test.ts`, `src/model/openingAnnotations.test.ts` y
  `src/commands/behavior/openingTags.test.ts`: 15 pruebas, todas aprobadas tras
  corregir los casos de bloques, referencias de recursos y reparación nativa.
- Regresiones existentes de cuadro (5), nativo (47) y acceso ES/EN (2) aprobadas.
- Tipos, capas (749 importaciones), lint focalizado, catálogo y build público
  con `FMODEL_DWG_ENABLED=false`: aprobados. El build conserva el aviso previo
  de importación dinámica ineficaz de `polygon-clipping`.
- `pnpm exec playwright test e2e/openingAnnotations.spec.ts --workers=1`:
  un recorrido Chromium aprobado. Crea muro, puerta, ventana, cuadro y etiquetas;
  cambia ancho 900→1000, deshace/rehace y cancela una nueva preview sin mutación.

La selección utiliza `runner.submitEntity`, como los recorridos arquitectónicos
existentes. Para mostrar plano y cuadro legibles en la misma escena, una fixture
amplía columnas, filas y estilo del cuadro ×20 y ajusta el zoom. Creación y edición
usan comandos reales; no se afirma selección íntegra por puntero. / Entity
selection and table sizing use disclosed fixtures; generation/editing use real commands.

Ambos PNG originales 1280×900 fueron inspeccionados a resolución original:
tabla y P-01/V-01 completos, legibles y sin controles superpuestos en Día/Noche.
Se copiaron byte por byte desde
`test-results/openingAnnotations-linked--a95f1--real-commands-in-Day-Night-chromium/`.
No se editó ninguna imagen. / Both unmodified Day/Night originals were reviewed.

| Captura / Capture | SHA-256 |
|---|---|
| [Día / Day](assets/opening-annotations-dia.png) | `44229bdef8c0801611456d22327420092a802bd7c426562e6cce3ea180cb8b55` |
| [Noche / Night](assets/opening-annotations-noche.png) | `65417b6e47343db43b8f44dad70efd99860f25332a1522b08ba0aefc2df390ad` |

Revisión independiente del código: corregidos los tres hallazgos de copias en
bloques, capa/estilo de etiquetas y reparación de vínculos dependiente del orden.
Las pruebas reprodujeron esos fallos; la segunda revisión no encontró defectos
importantes adicionales. Sólo se ejecutaron comprobaciones focalizadas, sin
suite completa ni cobertura. / Focused checks and reviewed fixes only.

Alcance visual: escritorio Chromium, Día/Noche. No se verificaron teléfono,
dispositivos físicos ni otros navegadores en esta entrega. Copias y DXF conservan
contenido independiente; fuentes dañadas/limpiadas conservan anotaciones y piden
revisión. No acredita cotas, materiales/áreas ni paridad general con YQARCH.
