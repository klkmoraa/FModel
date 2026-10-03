# Task 2 recovery report

Status: IMPLEMENTING. Branch `codex/architecture-tools`; review base `82de57888cb5ffb772ecc3d3b8c2d569d965ead3`. Controller-only future-opening documentation commit `ee5c14f` is outside Task 2 source. Preserved all 13 restored Task 2 files; no Task 1 reimplementation, push, merge, subagents, local browser or Playwright execution.

## Fresh evidence (2026-10-03)

Prior disconnected-executor claims (1100/94 tests) are not evidence for this source.

- Baseline `pnpm vitest run src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts src/commands/architecturePanel.test.ts`: 3 files / 13 tests passed.
- Fresh panel integration RED: `pnpm vitest run src/ui/panels/architecturePanel.test.ts src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts`: 1 suite failed because the requested ArchitecturePanel module was absent, 2 files / 12 existing tests passed. This is missing-surface evidence, not a claim of six observed behavioral assertion failures.
- After implementation, identical focused command: 3 files / 18 tests passed. Real React DOM + real Editor/CommandRunner tests cover rejected Place/Edit, filtering refusal, exact native width/rotation placement, actual canvas focus, native-rigid-transform miniature, phone no input autofocus, successful phone close/cancel/reopen dimension retention, units and actual document replacement refresh.
- `pnpm typecheck`: exit 0. `pnpm check:layers`: exit 0, 682 imports checked.

## Current implementation

ArchitecturePanel is reachable via PANELS (desktop/floating/phone), actual ToolDeck architecture tools and palette. Optional third PANELS.render callback is passed only by the phone sheet; invoked after successful validation/command invocation. Edit invokes COMPONENTEDIT with no arguments and uses existing prompts. Both invalid actions retain errors and the phone sheet. Placement filtering disables the unavailable chosen family, clearing filters restores its dimensions. Native component reader alone produces selection summaries. All schema fields, including hidden fields, are parsed/validated/submitted. Schema visibility is shared with command pickers. WeakMap editor UI cache preserves form state across unmount while actual doc.id/units changes reset defaults. SVG uses builder primitives and transformComponent at zero insertion with validated rotation; does not mutate the drawing.

## Pending

Author six genuine CI browser journeys (mm/m × Day/Night, phone × Day/Night), guide/catalogue/backlog/brandbook updates, full verify once after final source, final self-review and commit. Controller must run genuine remote browser CI and inspect captures; ARC-003 stays open/experimental until that evidence exists. Existing wall QA in walls-qa.md authorizes ARC-002 closure. Root-owned architecture-touch.png remains unchanged.
