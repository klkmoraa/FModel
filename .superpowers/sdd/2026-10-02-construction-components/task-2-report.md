# Task 2 recovery report

Status: SOURCE IMPLEMENTED AND LOCALLY VERIFIED; controller browser/review pending. Branch `codex/architecture-tools`; review base `82de57888cb5ffb772ecc3d3b8c2d569d965ead3`. Controller-only future-opening documentation commit `ee5c14f` is outside Task 2 source. Preserved all 13 restored Task 2 files; no Task 1 reimplementation, push, merge, subagents, local browser or Playwright execution.

## Fresh evidence (2026-10-03)

Prior disconnected-executor claims (1100/94 tests) are not evidence for this source.

- Baseline `pnpm vitest run src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts src/commands/architecturePanel.test.ts`: 3 files / 13 tests passed.
- Fresh panel integration RED: `pnpm vitest run src/ui/panels/architecturePanel.test.ts src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts`: 1 suite failed because the requested ArchitecturePanel module was absent, 2 files / 12 existing tests passed. This is missing-surface evidence, not a claim of six observed behavioral assertion failures.
- After implementation, identical focused command: 3 files / 18 tests passed. Real React DOM + real Editor/CommandRunner tests cover rejected Place/Edit, filtering refusal, exact native width/rotation placement, actual canvas focus, native-rigid-transform miniature, phone no input autofocus, successful phone close/cancel/reopen dimension retention, units and actual document replacement refresh.
- `pnpm typecheck`: exit 0. `pnpm check:layers`: exit 0, 682 imports checked.

## Current implementation

ArchitecturePanel is reachable via PANELS (desktop/floating/phone), actual ToolDeck architecture tools and palette. Optional third PANELS.render callback is passed only by the phone sheet; invoked after successful validation/command invocation. Edit invokes COMPONENTEDIT with no arguments and uses existing prompts. Both invalid actions retain errors and the phone sheet. Placement filtering disables the unavailable chosen family, clearing filters restores its dimensions. Native component reader alone produces selection summaries. All schema fields, including hidden fields, are parsed/validated/submitted. Schema visibility is shared with command pickers. WeakMap editor UI cache preserves form state across unmount while actual doc.id/units changes reset defaults. SVG uses builder primitives and transformComponent at zero insertion with validated rotation; does not mutate the drawing.

## Recovery milestone 1

Local commit `feca0bcceff9d33e1980625860d847b120cb2121`. Immediately reported to controller; controller confirmed durable exact-tree checkpoint at remote `267ef5a97130128a0f7c3499e88a8234016912ba`, tree `b0d6ec07e16a5dd4fdcb4296a229525673a70264`. Milestone command combining form/panel/preferences/entry tests passed 4 files / 19 tests; typecheck/lint/layers/diff-check passed. Controller CI 37081625943 subsequently passed types/lint/layers/features but found 3 old preference fixtures expecting the pre-Architecture arrays; no browser step ran. Its 1094 pass / 3 fail result is checkpoint evidence only.

## Additional RED/GREEN and focused validation

- `pnpm vitest run src/ui/panels/architecturePanel.test.ts`: fresh behavioral RED **1 failed / 8 passed**. After changing units, defaults refreshed but an old `Invalid number: Width` alert remained attached. Resetting the context now clears errors together with fields. Native visibility/picker and corrupt-selection summary tests also passed immediately; they are coverage of integrated behavior, not claimed RED evidence.
- GREEN `pnpm vitest run src/ui/panels/architecturePanel.test.ts src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts src/commands/architecturePanel.test.ts src/commands/behavior/components.test.ts`: **5 files / 82 tests passed**; typecheck passed.
- `pnpm vitest run src/ui/workspaceChrome.test.ts`: **3 failed / 3 passed** because existing old fixture arrays omitted the newly added panel. Updated only required right/floating expectations, not production migration semantics. The new editor/workspaceChrome test still checks preserved choices, adding once, idempotence, and a deliberate pinned panel staying pinned.
- Latest `pnpm vitest run src/ui/workspaceChrome.test.ts src/ui/panels/architecturePanel.test.ts src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts src/commands/architecturePanel.test.ts src/app/features.test.ts`: **6 files / 40 tests passed**.
- `pnpm docs:features` + `pnpm check:features`: **60 features**, current/generated documentation and evidence validated.
- `pnpm typecheck`, `pnpm lint`, `pnpm check:layers`, `git diff --check`: exit 0; **682 imports**, no lint warnings.
- E2E authoring typecheck only: `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck e2e/componentsJourneys.spec.ts`: exit 0. No Playwright command or local browser was run.

## Genuine CI browser journeys authored

`e2e/componentsJourneys.spec.ts`, describe `Construction components: native panel journeys`, enumerates exactly six tests:

1. desktop mm dia: fields, refusal, placement, edit and undo/redo
2. desktop mm noche: fields, refusal, placement, edit and undo/redo
3. desktop m dia: fields, refusal, placement, edit and undo/redo
4. desktop m noche: fields, refusal, placement, edit and undo/redo
5. phone dia: no autofocus/overflow, invalid Place/Edit, close/place/cancel/reopen
6. phone noche: no autofocus/overflow, invalid Place/Edit, close/place/cancel/reopen

Desktop enters through actual ToolDeck Architecture tab, uses named fields/Tab, verifies field errors without runner or mutation, filtering refusal, native placement width/rotation/vertices, actual canvas focus, actual canvas member selection, native edit prompts, unchanged pending geometry, confirmation/stable ID, undo/redo and placement cancellation. Phone uses its actual tools-sheet accessible name, asserts opening does not focus an INPUT and no document/panel overflow, invalid Place/Edit retain the real sheet, valid Place/Edit close it, native placement, cancel and three reopen cycles preserve chosen width. Screenshots are genuine `page.screenshot` outputs once CI runs: `components-desktop-{mm,m}-{dia,noche}.png`, `*-placed.png`, `components-phone-{dia,noche}.png`, `*-reopened.png`. These have **not** executed locally and no success is claimed.

## Files and interfaces

- New `ArchitecturePanel.tsx`, `ComponentMiniature.tsx`, form/panel tests and `e2e/componentsJourneys.spec.ts`.
- Preserved helpers: `componentFormValues`, `validateComponentForm`, `newComponentForm`, `refreshComponentForm`, `assertComponentContext`, `startComponentPlacement` consume Task 1's strict catalogue/parser; UI holds strings and command-angle degrees, domain gets radians/drawing units.
- Shared `ComponentField.visibleWhen?: { key: string; values: readonly string[] }` and `visibleComponentFields` used by UI/placement picker/edit picker. Hidden field values remain retained/validated/submitted.
- `PANELS.render(editor, onUi, onStart?)` callback only supplied by PhoneChrome. Desktop Docks retain standard behavior. Canonical ARCHITECTURE alias registered read-only and actual ribbon/palette entry updated without replacing existing commands.
- workspaceChrome defaults/migration and existing/new preference tests; styles use existing tokens/classes, phone controls minimum 44 px.
- Bilingual guide, src/app/features and src/audit/evidence + generated FEATURES.md, backlog and brandbook ficha updated. ARC-002 closes only its core using already-reviewed CI 37022156512/walls-qa.md; wall feature still explicitly experimental, no broad parity claim. ARC-003 remains open/experimental. Controller-owned architecture-touch.png unchanged and incorporated by reference in brandbook.

## Pending

Controller must rerun genuine remote browser CI and inspect the corrected captures; ARC-003 stays open/experimental until usable visual evidence is approved. No new dependency/network/native format/DWG changes. All drawing writes remain existing native atomic commands.

## Final local gate (2026-10-03)

- Self-review checked the Task 2 brief against the complete local source, staged 13-path diff and actual native entry paths: desktop/phone ToolDeck, floating/phone panel, strict all-field validation, context reset, preview builder, native edit/placement, preference migration, evidence and documentation. Traced the browser journey selectors against existing architecture/touch journeys and the command runner; no concrete source defect was found in review. `git diff --check` and `git diff --cached --check`: exit 0.
- `pnpm verify` on final source: **exit 0**. `pnpm lint` zero warnings; `pnpm typecheck` exit 0; `pnpm check:layers` passed **682 imports**; `pnpm check:features` confirmed generated FEATURES and evidence; `pnpm test` passed **111 files / 1100 tests**; `pnpm build` transformed **2316 modules** and built successfully. Vite emitted `node:module` browser-externalization messages from existing libredwg-web and the existing `polygon-clipping` ineffective dynamic import warning; neither failed the build.
- Browser evidence remains **unexecuted locally**. Six authored Playwright journeys and screenshots still require a passing genuine remote CI plus controller inspection. This local verify does not close ARC-003 or establish visual QA.

## Controller browser CI 37095370558 and fix round 1 (2026-10-03)

- Application-equivalent remote commit `027fe9d` passed 50 preexisting browser journeys plus the local source quality gate (1100 unit tests, types, lint and build), but all six **new** component journeys failed. This is real RED evidence; no new component screenshot or visual pass is claimed. Four desktop variants reached native place, edit, undo and redo, then timed out at the final pending-placement cancellation (`e2e/componentsJourneys.spec.ts` former line 82). Two phone variants reached placement and failed on catalogue reopening (former lines 103/19): Playwright found both recent `Architecture ARCHITECTURE` and canonical `Component catalogue ARCHITECTURE` buttons.
- Desktop root cause from event-flow inspection: Architecture opens as a later-added floating panel (`src/editor/workspaceChrome.ts`); a canvas Escape with `floatingPanel` set takes `src/ui/App.tsx`'s earlier floating-panel dismissal branch and returns before `editor.key('Escape')` can cancel the runner. The prior single-Escape E2E assertion assumed it immediately canceled placement. Existing keyboard precedence remains unchanged. The journey now waits for the native point request, presses Escape, asserts the panel disappears while the point request remains, then presses Escape again and checks the runner stops without changing entities. This retains real keyboard cancellation coverage and makes both Escape effects explicit.
- Phone root cause: the ToolDeck recent-command section includes ARCHITECTURE after the first invocation, so a text-only `.tool-deck__item` filter is ambiguous. The journey now selects the exact canonical accessible name `Component catalogue ARCHITECTURE`, distinguishing it from the recent tile without positional selection or waits.
- After the E2E-only edit, `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck e2e/componentsJourneys.spec.ts`, `pnpm exec oxlint --deny-warnings e2e/componentsJourneys.spec.ts`, `pnpm lint`, `pnpm typecheck` and `git diff --check` all exited 0. No application source changed; the previous full `pnpm verify` passed on that same source. Local Playwright/browser remains prohibited; corrected journey GREEN and captures await controller CI.

## Controller CI 37096606847 visual QA and capture repair (2026-10-03)

- CI job `111127712486` on application-equivalent `e5aac79` (exact local `4b5d109` tree) passed **1100 unit tests and 56 browser journeys**, including all six new component journeys. Thus the round-1 browser fixes are GREEN for behavior; no local Playwright/browser ran.
- Controller inspected the genuine CI screenshot artifact `11264383301`. Both `components-phone-*-reopened.png` images show a nearly transparent, translated BottomSheet mid-entrance; the initial phone Día screenshot also caught that transition. The four desktop `*-placed.png` images show clipped edited columns because the earlier ZOOM Extents framed the pre-edit 600 mm width, before changing it to 800 mm. Native geometry/edit/undo assertions passed, but these frames are unusable as complete visual approval.
- Capture-only E2E correction: every `page.screenshot` now uses Playwright `animations: 'disabled'`, which fast-forwards the finite sheet entrance animation for the captured frame. The phone retains its width/miniature capture and adds `*-actions.png` after scrolling Place fully into view and asserting Place/Edit are fully in the viewport; reopened captures retain the width assertion. After edit, redo and two-Escape cancellation, the desktop journey invokes native `ZOOM` Extents on the current geometry, then native `ZOOM` Out to clear bottom command chrome; it waits for runner idle and asserts all edited vertices project inside safe canvas bounds before `*-placed.png`. No drawing, application CSS, or product behavior changed.
- After the capture-only edit, standalone `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck e2e/componentsJourneys.spec.ts`, targeted `pnpm exec oxlint --deny-warnings e2e/componentsJourneys.spec.ts`, and `git diff --check` exited 0. The updated capture code requires a second controller CI execution and inspection. Passing prior journeys do not retroactively approve the new screenshot frames; ARC-003 remains open/experimental. The unrelated focused field-Escape review minor remains deferred.
