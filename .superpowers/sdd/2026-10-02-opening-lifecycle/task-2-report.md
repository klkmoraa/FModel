# Task 2 implementation report (in progress)

## Preview checkpoint `dd3dc4d`

Implemented render-only replacement exclusion through Editor preview setter, traversal, viewport and highlight paths. Scene invalidation fires when the bounded exclusion set changes; replacement entities with matching IDs remain drawn by the preview path. User visibility, picking, document version and output traversal remain independent.

TDD RED: `pnpm vitest run src/render/openingPreview.test.ts` exited 1, expected zero original scene entities but received one. GREEN: same command exited 0, 1/1. `pnpm typecheck` exited 0 after integration. `git diff --check` exited 0. Browser not launched locally per task constraint. Command/UI work and final verification pending.

## Command/UI/documentation checkpoint

`openingLifecycle.ts` implements six native commands and reuses the approved pure builder/model transaction APIs; `architectureOpenings.ts` preserves the old `openingSymbols` export and registers WALLDOOR/WALLWINDOW exactly once through `ARCHITECTURE_COMMANDS`. Changes cover explicit symbol-only opening selection, associated wall-member selection, every-member editability, current-space checks, projected source path, transaction-only apply, dimensions in drawing units, preview replacement, and cancellation. Ribbon/ToolDeck, palette and ArchitecturePanel provide bilingual native actions; field Escape bubbles to phone sheet.

RED: `pnpm vitest run src/commands/behavior/openingLifecycle.test.ts` exited 1 with three failures because WALLDOOR produced no assembly. After implementation and test interaction correction, GREEN focused `pnpm vitest run src/commands/behavior/openingLifecycle.test.ts src/commands/behavior/architecture.test.ts src/ui/panels/architecturePanel.test.ts src/render/openingPreview.test.ts src/model/wallAssembly.test.ts src/io/wallAssembly.test.ts` exited 0: 6 files, 68/68 tests. UI RED `pnpm vitest run src/ui/panels/architecturePanel.test.ts` exited 1: Escape from a focused field left the phone dialog open; GREEN 10/10. Existing ARC-002 tests passed 23/23.

`pnpm lint`, `pnpm typecheck`, `pnpm check:features`, `git diff --check` each exited 0. `pnpm docs:features` generated `docs/FEATURES.md`; its initial evidence-marker failure was corrected to actual geometry/interchange suite names. No local browser execution. `e2e/openingLifecycle.spec.ts` is authored for controller remote execution with quantitative geometry/preview assertions and Day/Night/phone captures. Final `pnpm verify` remains to run once after source is complete.
