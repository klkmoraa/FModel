---
name: fmodel-cad-workflows
description: Design, implement, or review professional 2D CAD workflows in FModel. Use for commands, canvas interaction, selection, snaps, coordinates, grips, layers, blocks, dimensions, layouts, DXF/DWG behavior, undo, or CAD-specific UI; not for generic web pages, 3D/BIM, or engineering certification.
---

# FModel CAD Workflows

Build CAD behavior that is precise, predictable, reversible, bilingual, and
consistent across the command line, canvas, ribbon, panels, keyboard, pointer,
and touch. The existing FModel contracts and the repository `AGENTS.md` outrank
similar behavior in AutoCAD or any external product.

## Establish the interaction contract

Before a material CAD change, identify the parts below that affect the task.
For a small defect, do this mentally; do not create ceremony that adds no value.

- Entry points: canonical command, aliases, ribbon/palette/panel and shortcut.
- State sequence: prompt, accepted input, keyword/default, preview and completion.
- Selection: preselection versus prompt-time selection, filters and locked items.
- Precision: absolute/relative/polar input, drawing units, zoom-aware hit testing,
  snaps, ortho/polar tracking and degenerate geometry.
- Control keys: Enter/Space, Escape, Backspace/Delete and command repetition.
- Mutation: transaction boundary, partial progress, cancellation, error rollback,
  undo/redo label and stable IDs/references.
- Feedback: cursor hint, rubber-band/preview, selection/snap highlight, status and
  actionable error; every visible string must work in Spanish and English.
- Devices and access: keyboard, mouse/trackpad and touch where the affected flow
  supports them; visible focus and accessible names for DOM controls.
- Persistence/interchange: native-format migration, round trip, unsupported data,
  local-only handling and explicit loss/warning behavior.

If any of these would materially change the requested behavior and the answer is
not present in code, tests or the task, ask for that decision instead of guessing.

## Use FModel's existing contracts

- Define commands with `CommandDef` in `src/commands/`; route interaction through
  `CommandApi` and `CommandRunner`, not one-off UI state machines.
- Keep geometry, coordinates, tolerances and hit testing in domain modules. World
  values never become pixels in the document model.
- Mutate drawings through `CadDocument.transact`, `CommandApi.apply` and
  `Transaction`. Preserve atomic undo, identity and references.
- Follow the current cancellation contract: Escape may retain already completed
  command steps, while an unexpected error aborts the grouped history operation.
  Change that contract only with explicit product intent and regression tests.
- Reuse selection, snap, preview, display-list and worker paths. Do not duplicate
  domain logic in React or special-case one entity in the canvas.
- Treat imported files, clipboard data, launch queues and archives as untrusted.
  Never upload a drawing or use a remote CAD service without explicit approval.
- AutoCAD-like behavior is a compatibility reference, not proof of correctness.
  Do not claim parity unless the exact flow and edge cases were verified.

## Choose the relevant mode

### Command or editing behavior

Inspect `src/commands/types.ts`, `src/commands/runner.ts`, the closest command,
`src/editor/editor.ts` and focused tests. Cover success, keyword/default input,
cancel/error, preview cleanup and one coherent undo/redo step.

### Canvas, selection, snap or grips

Inspect editor, selection, snap, view transforms and render/display code together.
Test more than one zoom, ambiguous candidates, locked/hidden entities, empty space
and touch aperture when relevant. Keep screen-space and world-space math explicit.

### CAD UI or workflow design

Read [references/cad-ux-review.md](references/cad-ux-review.md). Preserve the
professional editor's density and learned workflows; improve hierarchy and access
without turning the product into a generic dashboard or hiding precise controls.

### Native, DXF, DWG or library interchange

Inspect the format contract and compatibility docs first. Test valid, malformed,
unsupported and round-trip cases. Record any lossy mapping visibly; never invent
entities or silently discard document meaning.

### Review or diagnosis

Trace the complete reachable interaction, not only the visible component. Report
the exact state/input that fails, its data or geometry impact and the smallest
safe correction. Do not implement when the user requested diagnosis only.

## Verification

Start with a focused regression test. Run the checks required by the repository
for the affected layer, then exercise the real interaction in a browser when the
behavior is visual, pointer-driven, keyboard-driven or dependent on browser APIs.
For a backlog improvement, record evidence and close it only through
`fix/features/` as specified by the root instructions.
