### Task 2: Recuperar rayados nativos al importar DXF

**Files:** Modify src/io/dxf/importDxf.ts and scoped src/io/dxf/importDxf.test.ts / exportDxf.test.ts as needed. Create focused src/io/dxf/userHatchPattern.ts and userHatchPattern.test.ts if helper separation improves clarity. Read parser.ts R/DxfRecord pair contracts and exporter writeHatch; no native-format/model/HATCH command change.

**Interfaces:** Consumes raw DXF HATCH pattern families after78, actual writeHatch tags, HatchPatternRef/Vec2 and central tolerances. Produces corrected existing importDxfIntoDocument behavior for representable simple/double userHATCH: effective spacing/origin/angle/double, canonicalscale1. Existing import/export public API unchanged.

- [ ] Write observed RED real roundtrip: rectangular HATCH user spacing100,angleπ/4,scale1,doublefalse,origin(1250,2300), and doubletrue samefields. Export/reimport realdoc; assert exact origin/effectivespacing/angle/double, actual world segments via hatchSegments agree, contours/properties retained. Current spacing1/origin0 must fail. Add mspacing0.1,UTMorigin(1000000,2000000),rotated30degrees; actualphase/separation preserved, notflags only.
- [ ] Write RED untrusted_family_loss: incompatible extra family,dashed,mismatched origins,nonperpendicularoffset,truncatedcount,nonfinitefields never invent supportedrayado/NaN. Keep validcontours as solid with explicit ImportReport transformed/warning loss reason, preserve unrelated validentity. Predefined/SOLID unchanged. Declaredcounts bounded, only representablesingle/orthogonaldouble simplefamilies.
- [ ] Implement scoped parser of actual raw53/43/44/45/46/79/49 families after78, no first-tag assumptions. Recover perpendicularspacing/commonorigin from actual drawing offsets, anglesradians,doubleverifiedcentraltolerance,canonicalscale1. Unsupportedfallbacksolid plusvisible lossreport through existing transformed/warningflow; contoursunchanged,noduplicatewarnings. No broaderrefactor/newdeps.
- [ ] Run covering userpattern/import/export/native tests plus type/lint/layers/diff check. Record exactREDGREEN/commands/counts/normalization/losslimits in own task-2-report.md. Commit scopedsource/tests/report, selfreview thenFINALDONE/freeze. No repeatedfullsuite absentconcern; no localbrowser/subagents. Freshtaskreview/fixloop beforeTask3integration.


## Binding global constraints

- FModel sigue siendo CAD 2D local-first, sin backend, telemetría ni peticiones nuevas de red desde la aplicación.
- Toda geometría pertenece a las unidades del dibujo. Defaults y presets físicos se convierten con UNIT_TO_MM; documentos sin unidad usan los mismos valores numéricos explícitos.
- Todas las modificaciones pasan por CommandApi.apply/CadDocument.transact. Cancelar una operación pendiente no crea entidades, estilos ni registros; una operación terminada tiene undo/redo coherente.
- Las entidades y grupos nativos, propiedades, capas, espacios e IDs estables se conservan. No se amplía DWG ni se cambia el formato nativo para introducir un componente.
- Las geometrías, metadatos y parámetros importados se validan antes de utilizarlos. Ningún constructor admite valores no finitos, medidas colapsadas ni cantidades que bloqueen la interfaz.
- Interfaz y ayuda en español e inglés; teclado, foco visible, teléfono y Día/Noche; colores y materia de los tokens existentes.
- El código y las pruebas determinan el estado de una función. No se declara equivalencia funcional por tener un alias o por poder dibujar manualmente el resultado.



## Local execution recovery
Local executor is available again. Work only in /workspace/scratch/aff4fe700e24/FModel, isolated branch codex/wall-fill-dxf; local BASE c973c13a074b8b20e6260b07ef96375a4efc821d. Remote source BASE remains 07f5861000b7d31836668eee3778bf6a755bc3e8; source geometry identical, checkpoint docs recovered without reset. Prior remote writer is absent and no Task2 source was delivered to branch. Do not repeat completed Task1. Read AGENTS.md and .agents/skills/fmodel-cad-workflows/SKILL.md.
Use local observed TDD, starting with actual export/reimport regression spacing/origin; show intended assertion RED before implementation, then all malformed/phase regressions GREEN. You may commit isolated local source/tests/report. NEVER push/update_ref/PR/merge/deploy; root delivers immutable source to GitHub and actual CI. No local browser execution; no subagents. Do not repeatedly run full suite; covering IO/HATCH tests, types/lint/layers plus necessary repo checks suffice; root actual CI full suite.
Own report .superpowers/sdd/2026-10-04-wall-fill/task-2-report.md: status, exact commands/outputs RED/GREEN, commit range, scope, self-review, concerns. Preserve source props/contours and unrelated valid entities. Final DONE freezes source. No helper signature or pair-type guesses: inspect existing contracts.

