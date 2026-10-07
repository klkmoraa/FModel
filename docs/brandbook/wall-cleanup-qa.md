# Limpieza de muros · QA / Wall cleanup · QA

ARC-007 cerrado el 2026-10-07 sólo para instantáneas explícitas reversibles de encuentros T/X y recorte contra columnas nativas. / ARC-007 closed on 2026-10-07 only for explicit reversible T/X junction and native-column face-cleanup snapshots.

## Procedencia / Provenance

[CI 37628277682](https://github.com/klkmoraa/FModel/actions/runs/37628277682), [job 112815606193](https://github.com/klkmoraa/FModel/actions/runs/37628277682/job/112815606193), completed success on source `ac8e21efde9cfe7865108c4a25b32340847aad92`; exact local source `dce61241a99618ce2c7e70770698a33b8fbf93a4`, tree `8632c32210986f5762558273eab869669129afeb`. Controller supplied and approved this source-tree equivalence and completed job evidence on 2026-10-07. This document closes evidence after that tested source; controller owns the final evidence-tree CI and deployment.

Normal and coverage runs each passed **1325 tests / 131 files**; all static gates, public build, **189-file public dist guard** and **73 Chromium journeys** passed. Ordinary tests completed in 24.86s and coverage in 45.58s with unchanged thresholds. The completed job logs individually include all four cleanup journeys and the publicFormats smoke.

Artifact `11485921171`, `playwright-report`, **2330891 bytes**; ZIP SHA-256 and reported artifact digest both `7195adc7c1ab957025bb8e2eef1bc5e0c0256a817752e2db841dfdf87e2dd272`. Controller safely extracted 42 entries. The six PNGs below were copied byte for byte from the four `wallCleanup-Wall-cleanup-r-{06291,09a9f,a2ef7,eb099}-preview-cancel-restore-undo-chromium` directories; dimensions and SHA-256 were checked locally after copying.

## Originales aprobados / Approved originals

Controller viewed all six at original resolution and approved them on 2026-10-07. Geometry shows the clear T outer boundary, removed internal junction/column overlaps, retained column and open 900 gap. Desktop Day/Night 1280×720 and phone Day/Night 390×844 fit unobstructed. Both phone action sheets have readable hints, native Clean/Restore controls and no horizontal clipping.

| Original filename / linked raw image | Dimensions | SHA-256 | Approval |
|---|---|---|---|
| [wall-cleanup-desktop-dia-geometry.png](assets/wall-cleanup-desktop-dia-geometry.png) | 1280×720 | `268e7610d1833f717633c90d2529ff6d37433d520b139cf70d75a2b90fbac63c` | Controller approved 2026-10-07 |
| [wall-cleanup-desktop-noche-geometry.png](assets/wall-cleanup-desktop-noche-geometry.png) | 1280×720 | `8092ee5f34272bc0b932edba5867a7d06b584208128798c315299f566948865d` | Controller approved 2026-10-07 |
| [wall-cleanup-phone-dia-actions.png](assets/wall-cleanup-phone-dia-actions.png) | 390×844 | `eb8656bbb61aa994b7abf2b5c565b9b0e7e97c35cc2a6ce0fd79c0560edf3e92` | Controller approved 2026-10-07 |
| [wall-cleanup-phone-dia-geometry.png](assets/wall-cleanup-phone-dia-geometry.png) | 390×844 | `3921895d2b2957849255ca28eeeda68b890b2ba4c0a5f52d60e60e6b86145d7c` | Controller approved 2026-10-07 |
| [wall-cleanup-phone-noche-actions.png](assets/wall-cleanup-phone-noche-actions.png) | 390×844 | `558ea4320849255cb26e064bb72b14a09438eca2afac3f12eadabd126bde8094` | Controller approved 2026-10-07 |
| [wall-cleanup-phone-noche-geometry.png](assets/wall-cleanup-phone-noche-geometry.png) | 390×844 | `4d4e02c92149dbd61641888d6a4f5d02a70fa45f1bf0fc40a89579e6d0758dd7` | Controller approved 2026-10-07 |

## Comportamiento y límites / Behavior and limits

`e2e/wallCleanup.spec.ts` covers desktop/touch-phone × Day/Night with real command-deck and Architecture access. Completed journeys prove preview without mutation, cancel, cleanup/restore, stable IDs/groups, undo/redo and native phone close/focus; pixel assertions prove removed internal faces/column overlaps, retained exterior and empty 900 gap. Screenshots alone do not establish history, cancel or focus. Grouped unit/integration evidence covers ownership validation, conservative recovery, native roundtrip and DXF warnings.

Sources and edited outputs survive conservative recovery; All recovers even after erased/ungrouped outputs. Restore → edit → clean is explicit. Native preserves recovery without a format bump; DXF retains invisible sources (60) and warns of recovery loss. No automatic networks/new-neighbor repair, curved walls, corner openings, loose-line inference or general YQARCH parity. Other master modules remain pending.

[Public native/DXF artifact QA](public-formats-qa.md) records route B evidence; actual Pages publication remains a controller gate.
