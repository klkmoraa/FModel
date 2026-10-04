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
