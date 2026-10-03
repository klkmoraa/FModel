# Piezas de construcción · QA de controlador / Construction component QA

**Fecha / Date:** 2026-10-03. **Resultado / Result:** aprobado para ARC-003, limitado a las catorce familias 2D y su catálogo/edición nativos. / Approved for ARC-003 within the fourteen native 2D families and their catalogue/edit flow.

La [CI 37097760918](https://github.com/klkmoraa/FModel/actions/runs/37097760918), job `111131080861`, ejecutó el commit remoto `da9f564185098ab3fce565c622a1c308b85c59a7`, equivalente al árbol local `a6e5a391e6d453ff7d06ee513c6a99964e48693b`. Pasaron tipos, lint, capas, features, cobertura, build, **1100 pruebas en 111 archivos** y **56 recorridos Chromium**, incluidos los seis nuevos de componentes. / The CI run passed those quality checks and all 56 browser journeys, including six component journeys.

El controlador inspeccionó **las 14 capturas PNG originales**, sin alterarlas: ocho de escritorio (mm/m × Día/Noche, catálogo y pieza editada) y seis de teléfono (Día/Noche, campos, acciones y reapertura). Verificó columna editada completa tras encuadre, miniatura nativa, medidas/unidades, foco y contraste; teléfono de 390×844 con campos legibles, acciones de 44 px visibles sin desbordamiento horizontal y reapertura opaca/estable que retiene `650mm`. La hoja permite desplazamiento vertical; las capturas de acciones demuestran los botones en el viewport. / The controller reviewed all original frames, including the settled phone reopen and visible touch actions.

Las aserciones de navegador cubren entrada inválida sin mutación, foco del lienzo, colocación/edición nativas con ID estable, undo/redo, Escape del panel flotante y luego del comando, cierre/colocación/cancelación/reapertura en teléfono y ausencia de autofoco inicial. Las capturas visuales complementan esas aserciones; por sí solas no demuestran geometría o historial. / Browser assertions establish behavior; screenshots establish appearance.

**Fuente / Source:** artefacto CI `11265685074` (1,154,365 bytes), ZIP SHA-256 `d913d1ec3a577eb091e675aa07b1be5dceb86561fdb65679afd002ea148aad8a`. Ocho originales sin editar se conservan aquí; los otros seis están en el artefacto. / Eight unedited originals are retained here; the other six remain in the CI artifact.

| PNG original / Raw PNG | SHA-256 | Copia / Copy |
|---|---|---|
| `components-desktop-m-dia-placed.png` | `cf990e6aa2d16241a50806e6ef5e5f0412d285d6b40a5be5873d7f590ab5f12b` | CI |
| `components-desktop-m-dia.png` | `8ea2515955aaafde4dee06b24fa8e369f7770fe057f15ce6b971955bacdcfaf2` | CI |
| `components-desktop-m-noche-placed.png` | `18bcecc7cee9313d81ec9dae461a54b142b211ca069621d69f799cfe7e2d1726` | CI |
| `components-desktop-m-noche.png` | `ae0bd5b83a4b7cbba83b1f778e3e6f5e30afe8f8d9c4ce29ac0e0c8d3b70ba70` | CI |
| [components-desktop-mm-dia-placed.png](assets/components-desktop-mm-dia-placed.png) | `d4b7a9a4f3a1b59d0a55838153011c17390ab5646b36c2a6b049ea24727884ee` | Brandbook |
| [components-desktop-mm-dia.png](assets/components-desktop-mm-dia.png) | `a33cb8465cce733ae96cc7f0fecc1a5c2348a919cb0b85b8837dcb698926183e` | Brandbook |
| [components-desktop-mm-noche-placed.png](assets/components-desktop-mm-noche-placed.png) | `a0455a0efdfc1eea7a808566b4083709a8357403f6927a046923cb3fed2dd924` | Brandbook |
| [components-desktop-mm-noche.png](assets/components-desktop-mm-noche.png) | `8533ec072095f3a2ea9066e2a54efb28aa81ffcb43e241253e6b37770d7c1457` | Brandbook |
| [components-phone-dia-actions.png](assets/components-phone-dia-actions.png) | `013b88ceb68aecd66cf6096561ebd6c9c288fc44d5cc384a8e76799a0234db87` | Brandbook |
| [components-phone-dia-reopened.png](assets/components-phone-dia-reopened.png) | `940d53788d793b8e385d48fff3be0beb594a64d4bc97f3d2a9427d43244bf441` | Brandbook |
| `components-phone-dia.png` | `4f32a2ccac456fa40e5a6b049e470c00a4ee884dab5501c4e26a4aed43ae5ff5` | CI |
| [components-phone-noche-actions.png](assets/components-phone-noche-actions.png) | `e820d2a858f6df4b6dc5e8de4cd0f2a5d3f16a34757ea02b1c3f2fd282adaf3c` | Brandbook |
| [components-phone-noche-reopened.png](assets/components-phone-noche-reopened.png) | `edd7e0bd5400e854d49dec9d0055c36409d9483108d8b96ed811a2f7505f4380` | Brandbook |
| `components-phone-noche.png` | `da68a2382d54866c8a6adc48099867a1b2f1864b2df3fbdba696a6eb5cea0bc7` | CI |

**Límites / Limits:** no implica paridad general con YQARCH ni implementación del ciclo de vida de huecos asociados (ARC-004). El Escape desde un campo del panel telefónico se resolvió posteriormente en ARC-004; esta ficha conserva sólo la evidencia histórica de ARC-003. El build conservó advertencias preexistentes de `node:module` para libredwg-web y del import dinámico ineficaz de `polygon-clipping`. / Broader parity and opening lifecycle are separate; the field-Escape minor and existing build warnings remain recorded.
