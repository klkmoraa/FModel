# Task 2 — reversible native cleanup and restoration

Date: 2026-10-07. Repository `/workspace/scratch/aff4fe700e24/FModel`, branch `codex/wall-fill-dxf`. Clean starting HEAD: `1714694f67c3c33fee031deaf86c6d9e57709d7f`.

Source/test/documentation commit: **`511b1b0cf1ef915535c6720625dded246f84dc72`** (`feat: add reversible native wall cleanup and recovery`). This report is a following report-only commit; no source behavior changes in the report commit. Task 1 geometry was consumed unchanged, without repeating its completed tests.

## Implemented

- `WALLCLEAN`/`LIMPIARMUROS`: native selection/deduplication, cheap batch bounds, validated actual MLINE fragment faces and native column outlines, render-only replacement preview, Enter confirmation, Esc cancellation, stale source/group/layer/style/property/unit checks and one atomic apply. Only MLINE is hidden; symbols, columns and source groups/IDs/properties/parameters remain.
- `WALLRESTORE`/`RESTAURARMUROS`: preselected outputs or Select; All/Todos recovers erased/ungrouped outputs. Every hidden fragment has its own v1 anchor so deleting a different original does not strand surviving fragments. Strict selfId/batchId/reciprocal source and output references, bounded records, schema/finite snapshot validation at use. No native format bump.
- Restoration reveals existing current native geometry/properties by visibility and owned meta only. Missing sources are never recreated. Only owned unchanged output LINEs are removed; modified/ambiguous output entities and added/foreign group members survive. Edited owned outputs are detached only where active owner/layer/lock policy permits. Mutated sources/output deletions respect active owner, layer visibility and locks; edited foreign outputs do not block valid source recovery.
- Restore-first guard in native wall readers reaches axis/parallel, openings/thickness and fill; wall conversion also rejects cleanup outputs before converting. Actionable ES/EN guidance specifies Restore → edit → clean, and All when outputs are absent.
- Registered commands and ES/EN ribbon/command-deck, palette and Architecture actions use existing tokens/keyboard/focus/touch paths. The shared hint now correctly restricts Axis/Parallel to walls while Fill/Clean accept native columns.
- Native recovery roundtrip and corrupt opaque meta rejection at use. DXF retains standard LINE geometry and invisible source geometry via code 60, with explicit `.fmodel` recovery-loss warning; no DWG changes.
- Generated feature catalogue, executable evidence entries, concise guide, relevant `yq_wall`/`yq_trim_fix_wall` partial coverage rows and in-progress backlog/QA. Historical CI counts/provenance remain unchanged.

## Controller clarification incorporated

The controller explicitly ruled that unchanged source geometry/style is not required to reveal a still-owned native source: generic group MOVE followed by save/reopen has no Undo history and must not strand originals. Final code restores current geometry/properties, checks reciprocal identities/types, and warns that a generically moved/edited native parametric group can need its normal repair/Undo before editing parameters. The grouped IO fixture checks moved sources, saved/reopened without history, recovered with edited geometry/color and original IDs/groups/native metadata. No old source geometry is written over edits.

## Exact verification commands and results

| Command | Result |
|---|---|
| `pnpm vitest run src/commands/behavior/wallCleanup.test.ts src/io/wallCleanup.test.ts src/ui/panels/wallCleanupAccess.test.ts` | Exit 0: **6 tests, 3 files passed**; final covering run 2026-10-07 06:22:28 UTC, 3.41s. Four grouped runner cases, one grouped native/DXF fixture, one grouped ES/EN real UI access case. |
| `pnpm typecheck` | Exit 0, final run after correcting readonly selection typing. |
| `pnpm lint` | Exit 0, final run after replacing one test's unused ternary expression with if/else. |
| `pnpm check:layers` | Exit 0: **709 imports checked**. |
| `pnpm docs:features` | Exit 0: generated `docs/FEATURES.md`, **64 features**. |
| `pnpm check:features` | Exit 0: generated catalogue current, linked evidence valid. |
| `pnpm exec playwright test e2e/wallCleanup.spec.ts --list` | Exit 0: **4 Chromium journeys** discovered, desktop/phone × Day/Night. Discovery only; no browser installed/launched. |
| `git diff --check` / `git diff --cached --check` | Exit 0 before source commit. |

Earlier focused runner/IO run exposed a test-only comparison against the pre-undo document version; comparison was changed to the actual pre-restoration state. Initial lint/typecheck diagnostics above were corrected and their failing checks rerun successfully. No full suite, coverage, build or local browser was run, as instructed. No subagents were spawned. No push/deployment/remote writes were attempted.

## Remaining evidence and concerns

- **ARC-007 remains in progress / experimental.** Controller still needs fresh source review, actual final-SHA transversal GitHub CI and inspection/provenance of all six raw PNGs. `docs/brandbook/wall-cleanup-qa.md` lists expected geometry/control captures without claiming evidence already exists. New E2E file has trace disabled to bound artifacts.
- Explicit snapshots do not automatically clean while drawing, update new neighbors/fills, repair a live wall network, support curves/loose lines/corner openings or establish general YQARCH parity; TW is not an alias.
- Generic native group edits can invalidate preexisting parametric geometry relationships; cleanup recovery safely reveals current entities and warns, rather than inventing parameter transformations or silently overwriting geometry.
- Push/Pages and any REL-001 distribution decision belong to the controller. That publication decision did not block this implementation. Existing build warnings/licensing surface were not changed or exercised locally.

No concrete implementation blocker remains for controller review/CI.

## Fix round 1/5 — current source owner and geometry

FIXBASE: `cab143db8b98e0e6b163e83eca4d8e187ac47f18`. Read `task-2-review.md` fully and addressed its two Important findings only.

The strict model reader now requires each existing current MLINE's owner to match its validated stored owner; the command's current active-owner/layer/lock checks remain. Recovery also validates current finite coordinates, positive finite scale/linetype scale, finite order/lineweight, valid transparency/closed/justification, and finite native face/style-expanded geometry before preview or any writes. Valid current geometry/style edits remain permitted and old source geometry/properties are never written back.

One grouped runner/model regression transfers a source and activates the transferred owner, and injects NaN coordinates, an infinite scalar and unrepresentable finite geometry. Each case rejects pure preparation, direct transactional recovery and the native restoration command while preserving all entity geometry/meta/visibility, outputs, groups, history and dirty state. Direct transaction rollback emits the existing version notification; runner rejection does not advance the document version. The existing saved/reopened moved-source fixture still passes.

Verification for this fix:

- `pnpm vitest run src/commands/behavior/wallCleanup.test.ts src/io/wallCleanup.test.ts`: exit 0, **6 tests / 2 files**, final run 2026-10-07 06:32:52 UTC, 2.13s. Initial new assertion incorrectly included the document's existing rollback notification in its no-write comparison; corrected only that assertion and reran the focused command successfully.
- `pnpm typecheck`: exit 0.
- `pnpm lint && pnpm check:layers`: exit 0, **710 imports** checked.
- `git diff --check`: exit 0.

No whole suite, Task 1 tests, browser, build, source beyond the two findings, remote writes, deployment or subagents. ARC-007 remains in progress pending controller re-review, exact-tree push, actual transversal GitHub CI and the six original PNG inspections. No new implementation blocker identified.
