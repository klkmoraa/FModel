# Task 2 — DXF user HATCH recovery

Status: DONE, scoped implementation and self-review complete; source frozen after FINAL DONE. Fresh independent review and actual CI are the root's next gate.

Branch: `codex/wall-fill-dxf`.
Source/test commit: `2b28cf2e45b96900fd9d48659b8fcd6710ac1c05`.
Exact source/test range: `c973c13a074b8b20e6260b07ef96375a4efc821d..2b28cf2e45b96900fd9d48659b8fcd6710ac1c05`.
This report is committed separately as a documentation-only follow-up; final delivery HEAD is supplied in FINAL DONE. Remote source BASE remains `07f5861000b7d31836668eee3778bf6a755bc3e8`.

## Scope and behavior

Changed only `src/io/dxf/importDxf.ts`, added `userHatchPattern.ts` and its tests, and extended scoped import/export tests. Existing import/export API, exporter implementation, Task 1 geometry, native model/format, commands and DWG source remain unchanged. No dependencies, browser, subagents, push, update_ref, PR, merge or deployment.

Root cause: `convertHatch` used group 41 both as spacing and scale, and unconditionally assigned origin `(0,0)`, ignoring the families emitted by `writeHatch`.

Recovery reads actual ordered raw families after group 78, using the inspected `Pair = [number,string]` contract. It validates required 53/43/44/45/46/79 fields without `R.num`'s nonfinite-to-default substitution; rejects nonzero dash counts and undeclared 49 data. It bounds family work to one or two families before looping. Effective perpendicular spacing comes from world offsets, origin from the common family origin, angle from the first actual family, and double from verified orthogonal equal-spacing/common-origin families. Scale is canonical 1 and angle normalizes to `[0,2π)`. All geometry comparisons use central `TOL`, `linearTol` and `nearEqual`.

Unsupported/truncated/nonfinite families preserve valid contours and object properties as SOLID with a bilingual `transformed['HATCH (patrón de usuario)']` reason and warning. Transformation counts every entity; identical warnings are deduplicated. Loss is recorded only after the entity is successfully added. Predefined/SOLID conversion behavior is retained. Existing drawing objects retain their IDs and properties, and unrelated valid imported LINE geometry survives malformed HATCH input.

Limits: only continuous single or orthogonal double families with perpendicular noncollapsed offsets, equal spacing and common origins are recovered. Dashed/additional/incompatible families are intentionally lossy. Header scale/angle/double metadata does not override actual family geometry. Exporter/native scale behavior outside the specified scale-1 round trips is outside this change.

## Observed TDD and verification

All commands below ran in `/workspace/scratch/aff4fe700e24/FModel` on 2026-10-04. Counts are actual Vitest output, not estimates.

| Command | Observed result |
|---|---|
| `pnpm vitest run src/io/dxf/exportDxf.test.ts -t 'round-trips user hatch'` before production edits | RED, exit 1: 3 failed, 4 skipped. mm simple/double expected spacing 100, received 1; m/UTM expected 0.1, received 1. |
| `pnpm vitest run src/io/dxf/importDxf.test.ts -t 'user HATCH family recovery'` before production edits | RED, exit 1: 21 failed, 2 passed, 21 skipped. Header metadata overrode family geometry; all 20 malformed cases invented USER rather than explicit SOLID loss. Predefined/SOLID unchanged cases already passed. |
| `pnpm vitest run src/io/dxf/importDxf.test.ts src/io/dxf/exportDxf.test.ts` after implementation | Initial verification exposed 2 fixture assertions from existing DXF 12-decimal rounding of `100/3`; rectangle phase changed to exact `spacing/4`, preserving nonzero phase. No exporter change. Subsequent GREEN: 2 files, 51 tests. |
| `pnpm vitest run src/io/dxf src/io/native.test.ts src/io/wallAssembly.test.ts src/io/wallUtilities.test.ts src/model/hatchPatterns.test.ts src/geometry/boundary.test.ts` | GREEN: 11 files, 143 tests. `src/model/hatchPatterns.test.ts` does not exist; Vitest selected the actual existing files. Removed that nonexistent filter in subsequent commands. |
| `pnpm vitest run src/io/dxf src/io/native.test.ts src/io/wallAssembly.test.ts src/io/wallUtilities.test.ts src/geometry/boundary.test.ts` after duplicate-warning test | GREEN: 11 files, 144 tests. |
| Baseline mutation script below, with origin assertion first | RED, exit 1: 3 failed, 4 skipped. Actual origin `(0,0)` instead of `(1250,2300)` or `(1000000,2000000)`. Corrected source restored in `finally`. |
| `pnpm vitest run src/io/dxf/exportDxf.test.ts src/io/dxf/importDxf.test.ts src/io/dxf/userHatchPattern.test.ts` after restoration | GREEN: 3 files, 64 tests. |
| `pnpm vitest run src/io/dxf src/io/native.test.ts src/io/wallAssembly.test.ts src/io/wallUtilities.test.ts src/geometry/boundary.test.ts` after existing-object identity coverage, final source | GREEN, exit 0: 11 files, 145 tests; duration 2.43s. |
| `pnpm typecheck` | Exit 0, `tsc --noEmit`; repeated after final test addition. |
| `pnpm lint` | First run found one test-only `no-useless-spread`; removed the unnecessary spread. Final runs exit 0, `oxlint --deny-warnings src`. |
| `pnpm check:layers` | Exit 0: 695 imports reviewed, architecture correct. |
| `pnpm check:features` | Exit 0: FEATURES current with validated evidence. |
| `git diff --check` and `git diff --cached --check` | Exit 0, no output. |

Exact baseline mutation command:

```bash
python - <<'PY'
from pathlib import Path
import subprocess
p=Path('src/io/dxf/importDxf.ts')
current=p.read_bytes()
try:
    p.write_bytes(subprocess.check_output(['git', 'show', 'c973c13a074b8b20e6260b07ef96375a4efc821d:src/io/dxf/importDxf.ts']))
    result=subprocess.run(['pnpm', 'vitest', 'run', 'src/io/dxf/exportDxf.test.ts', '-t', 'round-trips user hatch'])
finally:
    p.write_bytes(current)
raise SystemExit(result.returncode)
PY
```

The three real document export/reimport tests verify spacing 100, angle π/4, origin `(1250,2300)` for simple and double, plus meters spacing 0.1, angle π/6 and UTM origin `(1000000,2000000)`. They assert contours, properties, canonical scale, actual nonempty world segments/endpoints via `hatchSegments`, and absence of loss reports. Twenty malformed integration cases cover extra families, dash data, mismatched origins, unequal spacing, nonorthogonal double, nonperpendicular/collapsed offsets, truncation, missing fields, undeclared family/dash data, empty/fractional/huge/nonfinite counts, and nonfinite angle/origin/offset/dash count. Twelve helper cases verify signed-offset/angle normalization, opposite orthogonal directions, relative UTM origin tolerance, angular/spacing/collapse tolerance boundaries, and each of six nonfinite family fields.

## Self-review and concerns

Reviewed the complete staged source/test diff against the brief, parser pair types, actual exporter tags, `HatchPatternRef`, hatch segment generation and central tolerances. Confirmed raw family coordinates are already rotated/scaled, no second transform is applied, malformed declared counts cannot drive unbounded loops, only supported families become USER, and contour/property conversion stays on the existing transaction path. Confirmed new loss reporting occurs after successful add and does not duplicate warnings.

No known blocking concern in the scoped implementation. Full suite, build, browser/manual visual verification and `pnpm verify` were not run here because delegation explicitly reserves full actual CI to the root and forbids local browser execution. Root-owned `progress.md` changes were neither staged nor committed.
