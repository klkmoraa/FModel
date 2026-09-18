# CAD UX review rubric

Use this reference for designing or reviewing editor chrome and multi-step CAD
interactions. It is a decision aid, not a demand to imitate another product.

## Workflow quality

- The next valid action is visible from the prompt, cursor feedback or active UI.
- Experts can stay on the keyboard; occasional users can discover the same action
  from labels, tooltips, palette/ribbon or contextual help.
- Typed command, UI action and shortcut reach the same domain behavior.
- Defaults are explicit, Enter is predictable and Escape exits without hidden
  residue. Repetition does not reuse unsafe stale state.
- Preselection and post-selection behave consistently. Locked, hidden, paper/model
  and nested content are distinguished instead of silently accepted.

## Precision and geometry feedback

- Coordinate form and unit are unambiguous; values are never visually rounded and
  then written back as if the rounded value were exact.
- Snap type, candidate and acquisition/tracking state are distinguishable.
- Preview uses the same geometry rules as commit and disappears on cancel/error.
- Hit targets are evaluated in screen space and converted through the view scale;
  stored geometry remains in drawing units.
- Degenerate, zero-length, non-finite and nearly coincident input has a defined,
  tested outcome.

## Reversibility and safety

- A successful user intent is one coherent undo step unless the product explicitly
  exposes intermediate commits.
- Cancellation, validation failure and unexpected error have separate semantics.
- Destructive operations identify their target and offer undo or explicit warning.
- Import/save/export communicates partial support, loss, cancellation and failure;
  a started download is not reported as a confirmed disk write.

## Interface and accessibility

- Canvas focus, dialog focus and command-line focus never steal keys unexpectedly.
- Every DOM control has a name, keyboard path, visible focus and usable contrast.
- Active, selected, disabled, locked, warning and error states do not rely on color
  alone. Motion respects reduced-motion preferences.
- Dense controls keep consistent alignment, numeric typography and hit areas.
- Touch gestures do not make precise mouse/keyboard workflows less predictable.
- Spanish and English labels fit at supported widths and use established terms.

## Compatibility claims

- Compare exact inputs, prompts, defaults, cancellation and resulting geometry.
- Treat AutoCAD conventions as user expectations only where FModel intentionally
  supports them. Document deviations that protect data, accessibility or scope.
- Never claim full DWG/DXF or command compatibility from a single happy-path test.

## Evidence for sign-off

Capture the command or UI path tested, viewport/device, relevant drawing state,
focused automated test, undo/redo result and any known format loss. A screenshot
can prove appearance; it cannot by itself prove geometry, persistence or undo.
