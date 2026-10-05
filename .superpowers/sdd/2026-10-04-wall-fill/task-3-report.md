# Task 3 — native architectural material fill

Status: source implementation DONE and frozen at `8bef015`; ARC-006 remains in progress. Browser journeys and six original captures require root's actual CI and review before evidence closure.

## Local TDD so far

- `pnpm vitest run src/commands/behavior/wallFill.test.ts`: initial valid RED 29 failed / 13 passed (42 total), after correcting the fixture's `hingeEnd` to its actual boolean contract. Failures included missing command/preview/material behavior. The passes on rejection cases are not claimed as meaningful RED. First attempt also exposed fixture errors and is not the valid RED.
- Core GREEN: same command, 42 passed / 1 file. Fixture preview-option assertions now await the actual next keyword request instead of sampling the old preview during resolution.
- UI RED: `pnpm vitest run src/ui/panels/architecturePanel.test.ts src/ui/panels/wallFillAccess.test.ts`: 4 failed / 11 passed, two files, on missing bilingual panel actions and missing WALLFILL ribbon tool (after correcting the observed export name to RIBBON).
- I/O contract test initially exposed existing DXF hexadecimal color normalization and omission of irrelevant solid-pattern origins. Expectations compare color semantically and assert recovered origin for the actual user-pattern path. No I/O production/API/format changes made in this task. Native exact IDs/properties/associations and bulged circle loops are asserted.
- `pnpm typecheck`: passed after correcting ComponentError's actual `l10n` contract and readonly preselection typing.

## Scope / concerns

Independent standard HATCH snapshots; current validated associated mline fragments only; native column `outline` world geometry; exact circular semicircle bulges; source IDs/groups/properties untouched. One final transaction. Batch and rayado bounds run before preview/generation, with actionable bilingual errors. No generic HATCH/native format/DWG expansion or dependencies.

Carried limitation: prior wall-utilities review deferred a dedicated negative non-crossing closed-ring material-containment test. Producer semantics are unchanged; no concrete defect was found here.

No local browser launched (the failed launch attempt is disclosed below). No push, update_ref, PR, merge, deployment, reset or clean.


## Integration milestone

- Source milestone `165f729` and report checkpoint `1cc5a0a` committed before integration checks. Root's progress ledger was excluded.
- Additional observed RED: `pnpm vitest run src/commands/behavior/wallFill.test.ts -t 'independent source user-group'`: 1 failed / 42 skipped; a user-group change otherwise allowed a stale independent source to apply. Confirmation signatures now also include every group touching source members. Metadata cleaning clones only retained keys rather than repeatedly cloning identity/assembly records.
- Combined scoped GREEN: `pnpm vitest run src/commands/behavior/wallFill.test.ts src/io/wallFill.test.ts src/ui/panels/architecturePanel.test.ts src/ui/panels/wallFillAccess.test.ts src/geometry/wallFill.test.ts src/app/features.test.ts`: 75 passed / 6 files (44 runner cases, 1 IO, 15 UI, producer/catalogue remainder). Actual ribbon and palette controls run the native flow in both languages; panel closes phone sheet, restores RAF canvas focus and Escape cancels. Unexpected source errors preserve their original identity at the runner, with no writes.
- `pnpm docs:features`: generated 63 feature rows; ARC-006 experimental and in progress, with BEH/GEO/IO/UI/E2E references. `src/commands/behavior/evidence.ts` already derives its registry from the evidence catalogue, so no duplicate edit is necessary.
- `pnpm lint`, `pnpm check:layers` (702 imports), `pnpm check:features`: passed before final integration verification.

## Browser discovery and limitation (no local evidence)

The invocation `pnpm test:e2e -- e2e/wallFill.spec.ts --list` was a verification mistake: the output printed `playwright test -- e2e/wallFill.spec.ts --list` but ran 68 tests instead of listing. All 68 launch attempts failed immediately because `/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` is absent. **Zero browser launched, zero actual local journeys and no usable screenshots.** The failed attempt is not evidence and is disclosed to root. No browser installation or fallback was attempted.

Corrected explicit discovery: `node node_modules/@playwright/test/cli.js test e2e/wallFill.spec.ts --list` exited 0 and listed exactly four Chromium journeys in one file, without a webserver/browser. The four authored journeys use native All selection with all associated members and column, exact cut wall/circle material area, additive HATCH preview and empty void patches, atomic undo/redo, fresh user hatching after removing the entire solid batch, actual line/gap scene and overlay pixels at 400mm spacing, nested cancellation and phone panel action/focus. Six raw PNG capture paths cover desktop/phone geometry and phone actions in Day/Night. Root must run actual CI and inspect originals before ARC-006 closure.


## Final verification and source handoff

- `pnpm verify` ran once after milestone `8bef015` and exited 0: lint, TypeScript, layer boundaries (**702 imports**), feature catalogue, **1296 tests / 124 files**, and production build (**2324 transformed modules**). No failing tests omitted. Baseline was 1247 tests / 121 files; this task adds 49 cases across three new files and the existing panel suite.
- Build retained the baseline warnings: LibreDWG `node:module` browser externalization (twice) and polygon-clipping's ineffective dynamic import (modify.ts dynamic vs newmark.ts static). No build dependency, DWG surface or chunking change was made.
- `git diff --check`: passed. Final local working changes outside own committed work are root's `.superpowers/sdd/2026-10-04-wall-fill/progress.md`, excluded throughout.
- Coherent commits: `165f729` (native source/runner/IO/UI), `1cc5a0a` (TDD checkpoint), `8bef015` (source stale user-group correction, actual access controls, journeys and provisional catalogue/docs). This final report-only commit does not change verified product source.

## Self-review

Reviewed the complete Task 3 diff from BASE `802d250c5185badcadda5891ceb35e9648661586`, including all milestones. Confirmed one architecture registration/alias, unchanged command index and public IO API/native format, all domain-error classes using their discovered actual fields, whole-batch validation and one final apply, no source identity/group/style/property mutation, clean cloned loops/properties and new HATCH identity/order. Associated material comes only from validated current mline fragments; all five native column outlines remain world geometry and circular loops remain exact. Batch limits precede large previews; rayado preflight matches projected family ranges, aggregates lines/edges/work and rejects unsafe indices/density with bilingual actionable feedback. Native All/preselection and empty selection, stale units/parameters/member/group/layer/style/property cases, cancellation stages and one-step undo/redo have focused runner coverage.

React only starts the native flow through real bilingual ribbon/palette/panel controls. Docs/catalogue say experimental/in progress and explain independent snapshots/refill/default physical units. Historical feature/backlog/YQ baselines were not re-counted or overwritten. Browser journeys are authored, discovered and **not locally executed**; no screenshot approval is claimed. Root's fresh full-task spec/quality review, actual CI with 68 journeys, and six original PNG approvals remain required. After those gates, original writer may perform evidence-only asset/provenance/catalogue/backlog closure and fresh scoped evidence review. Carried prior producer coverage Minor remains disclosed; no new source concerns identified in self-review.

## Fix round 1 — checkpoint (I1 complete in source, B1 diagnosis pending)

Fresh fix review base: `a2a5b0539181cb1d430f7356877004dcbeaa0e51`; starting controller-only HEAD `d6d4c34` leaves product source unchanged. Actual CI `37245375500` / job `111562107860` passed 1296 tests / 124 files and 66 browser journeys, but both new phone themes failed the rayado preview pixel predicate. No original capture is approved; ARC-006 remains open.

I1: `e2e/wallFill.spec.ts` now runs an independent temporary native open 6000×300 wall with an Empty 900 opening before the required fixture. Before selection confirmation, native All is asserted to select four distinct member IDs sharing one anchor, including two distinct mline fragments and two jambs. Preview/commit must contain exactly two HATCH, material area 1530000, one history step, and unchanged source entities/groups/styles. Undo fill, opening and wall restores the empty entity/group/style maps before creating the mandated closed 6000×4000 room/Empty 900/circular 600 column and its original quantitative proofs and capture paths.

Covering nonbrowser check: `pnpm vitest run src/commands/behavior/wallFill.test.ts -t 'native All selects'` passed 1 test / 44 skipped. The first fixture attempt failed on an incorrect assumed two-member count; inspecting the actual opening builder showed that Empty still has two jambs plus two open-wall fragments. The corrected test uses four members, two fragments. This fixture correction is not claimed as a feature RED. Actual browser execution remains root-owned and pending. Explicit discovery `node node_modules/@playwright/test/cli.js test e2e/wallFill.spec.ts --list` passed, four journeys / one file, without launching a browser.

B1: failure log reviewed; no pixel thresholds, proofs, sleeps or retries changed. Requested original phone traces/error contexts/failure PNGs and raw geometry captures from root for probe/view/canvas diagnosis before any correction. No guessed cause is claimed in this checkpoint.

## Fix round 1 — diagnostic source freeze

Root and original reviewer corrected and withdrew I1's original premise: `symbolsFor` adds both jambs even for Empty openings, so the original closed fixture selected three same-wall members and one circular column. The additional explicit two-fragment native-All scenario in `5a9ee1b` remains as stronger regression coverage. Its full scoped command `pnpm vitest run src/commands/behavior/wallFill.test.ts src/io/wallFill.test.ts src/ui/panels/wallFillAccess.test.ts src/ui/panels/architecturePanel.test.ts` passed **61 tests / 4 files**.

B1 root cause is still unknown. Root reported the original artifact as 49,538,959 bytes (above the download tool's 32 MiB cap), and the authorized direct signed URL returned HTTP 403. No original PNG or trace was materialized, inspected or hashed. This checkpoint gathers evidence for the next actual CI run; it does not claim to fix B1 or approve any image.

Diagnostic changes are confined to `e2e/wallFill.spec.ts`: file-scoped `test.use({ trace: 'off' })` bounds this file's artifact while leaving the global Playwright configuration unchanged. `pixels` retains the exact scene contrast and overlay alpha calculations, every original world probe, rounded intrinsic canvas coordinates and 5×5 patches. It also returns view center/scale/size, device pixel ratio, host/canvas rectangles and intrinsic dimensions, plus each world/screen/pixel/patch mapping. On a rayado poll failure, `hatchedPixels` logs only the last sample under `WALL_FILL_PIXEL_DIAGNOSTIC`, attaches the overlay canvas's original intrinsic PNG with its transparency, and rethrows the original assertion error. Both scene and overlay calls pass the existing `testInfo`. No product code, thresholds, geometry, retry, sleep, workflow, dependency or capture paths changed.

Local verification: the first explicit discovery rejected `trace` inside `describe` because it forces a new worker; moving it to top-level in this same test file followed Playwright's actual error guidance. Re-running `node node_modules/@playwright/test/cli.js test e2e/wallFill.spec.ts --list` exited 0 with **4 journeys / 1 file**. `pnpm lint` and `git diff --check` exited 0. Discovery launched no browser; lint checks `src` only. Self-review compared the diagnostic diff to `5a9ee1b` and confirmed unchanged pixel formulas/predicates and raw, unmodified overlay attachment. Source is frozen for root's actual CI evidence collection; B1 and six original capture approvals remain pending, ARC-006 stays in progress.

## Snapshot recovery

The environment returned to clean `d6d4c34`; commits `5a9ee1b` and `ddaf00e` and their source trees were absent. Read-only `git fsck --full --no-reflogs --unreachable` found no recoverable authored source. The original writer restored the E2E and above report text from retained tool context. `git hash-object e2e/wallFill.spec.ts` returned `716e6460b9913f0f0f1cd956bbeee55088440988`, matching the retained `ddaf00e` diff's new blob prefix `716e646`. The covering runner test was reconstructed to the same native-All/source-preservation/one-batch-undo/temporary-cleanup contract; its former exact text was unavailable, so byte-for-byte identity is not claimed for that test. This is recovery of the already authorized diagnostics, not a B1 fix.

Recovery verification: explicit Playwright CLI discovery passed **4 journeys / 1 file**, without a browser. The focused native-All runner command passed **1 / 44 skipped**; the same four-file scoped command passed **61 tests / 4 files**. `pnpm lint`, `pnpm typecheck` and `git diff --check` exited 0. Root owns ledger/review/brief recovery and delivery. No original image approval or B1 cause/fix is claimed.

## Fix round 1 — B1 evidence and measurement correction

Actual diagnostic CI `37253528375` passed **1297 tests / 124 files** and **66 browser journeys**, with the same two phone-theme rayado overlay failures. The independent native-All temporary scenario succeeded in all four wall-fill journeys. The materialized artifact is 2,857,299 bytes; independently computed ZIP SHA-256 `1fed77b27f19605e9299f03bc197edefa81a94741121519a20963d90631a90cb` matches the provider/root value. Diagnosis read the six actual samples in `ci-37253528375-pixel-diagnostics.json` and independently viewed/read both original raw overlay PNGs in `/workspace/scratch/aff4fe700e24/qa-wall-fill-diagnostic/playwright-report/data`:

- `c09a75af33c5f7721df5b1646658a13028a39c54.png`, SHA-256 `e2cb57e7582de181dba921016237ca817cbc9f3c1d602dbac2eaf91be699f471`.
- `f1f7a8318c289dcdaf0b12449a2e401f04cc03e1.png`, SHA-256 `d8fd15531087daec644324757cbaf6fd204a9579ce7f35a7ba837f480854c2c2`.

Root cause: the test's fixed 5×5 gap neighborhood reaches the nearby central hatch line at the phone view scale. Both themes have scale `0.024877899877899876`, DPR 1, intrinsic canvas 390×794. The unchanged column-gap world point `(1186.8629150101524, 1413.1370849898476)` maps to screen `(149.89295713471535, 411.59991684167505)`, rounded pixel `(150,412)`. Its old patch spans x148–152/y410–414: 24 pixels have alpha 0 and the sole bottom-right pixel `(152,414)` has alpha 227. The center and all nine pixels in the centered 3×3 patch x149–151/y411–413 are alpha 0. The actual overlay shows genuine clipped hatch lines and empty room/opening; no image modification was used.

Minimal correction in `e2e/wallFill.spec.ts`'s `pixels`: only `wallGap` and `columnGap` use radius 1 (3×3), uniformly across desktop/phone, Day/Night, scene/overlay. Line, solid, opening and room probes retain radius 2 (5×5). Coordinate diagnostics now report the actual patch radius. World points, 400mm spacing, max scene-contrast/overlay-alpha formulas, `>30` line and `<10` gap/void thresholds, independent fixture, material area, undo/cancel proofs, product source and six capture paths remain unchanged. No conditional phone exception, lowered threshold, deleted proof, sleep or retry was added.

Offline covering check: a `python`/Pillow read-only sampling command read both original PNG alpha channels, used the recorded rounded centers, applied the unchanged six-part predicate, and asserted old 5×5 gaps **false** / new 3×3 gaps **true** on each image. Before/after values are wallLine191→191, columnLine227→227, wallGap0→0, columnGap227→0, hole0→0 and room0→0. The command also asserted center alpha0, 3×3 alpha extrema `(0,0)` and 5×5 extrema `(0,227)`; exited 0. This is offline evidence for the test measurement correction, not browser GREEN after the correction. The initial exploratory Pillow `getdata` calls emitted its deprecation warning; the final covering command used `getextrema` and emitted no warning.

Local commands after the correction: `node node_modules/@playwright/test/cli.js test e2e/wallFill.spec.ts --list` exited 0 (**4 journeys / 1 file**); `pnpm lint`, `pnpm typecheck` and `git diff --check` exited 0; `pnpm vitest run src/commands/behavior/wallFill.test.ts src/io/wallFill.test.ts src/ui/panels/wallFillAccess.test.ts src/ui/panels/architecturePanel.test.ts` exited 0 (**61 tests / 4 files**). No local browser launched. Self-review verified both pixel samplers and diagnostic mappings use the same gap radius, background center remains index12 of a 5×5 sample, and the rayado predicate itself is unchanged. Source is frozen for root's fresh scoped review and actual CI. Browser GREEN and all six original screenshot approvals remain pending; ARC-006 remains experimental/in progress.
