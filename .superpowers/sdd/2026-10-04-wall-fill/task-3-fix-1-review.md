# Task 3 fix round 1 — scoped spec and quality re-review

Reviewed BASE `a2a5b0539181cb1d430f7356877004dcbeaa0e51` → HEAD `98c26da23172078231665abce6ce262899195762` using the supplied five-commit package `review-a2a5b05..98c26da.diff`. Scope: B1's measurement correction and breakage introduced by the fix/recovery/metadata changes, including the new temporary native-All regression. Requirements were read first, followed by the final fix reports, corrected original review and fix brief. I1 is formally withdrawn; this review does not reopen its disproved premise.

## B1 — ADDRESSED in the reviewed correction

`e2e/wallFill.spec.ts:73-88` changes only the two gap neighborhoods from radius 2 to radius 1. Scene and overlay use the same per-probe radius, and `:96` reports that same radius in the coordinate diagnostics. Every original world probe, rounding rule, 400mm pattern spacing and maximum contrast/alpha calculation is retained. `:114` retains both line thresholds `>30`, both gap thresholds `<10` and both void thresholds `<10`; solid, line, opening and room patches remain 5×5. This is an evidence-supported measurement correction, not an unsupported reduction of the acceptance thresholds.

The primary six diagnostic samples in `.superpowers/sdd/2026-10-04-wall-fill/ci-37253528375-pixel-diagnostics.json:3,421,839,1257,1675,2093` all report the same overlay results: wall line 191, column line 227, wall gap 0, column gap 227, hole 0 and room 0. They isolate the failed conjunct to the column gap. Both themes have DPR 1, 390×794 intrinsic canvases and scale `0.024877899877899876`; the unchanged column-gap point maps to rounded pixel `(150,412)` and the recorded old patch is x148–152/y410–414 (`:374`, `:1628`).

I independently viewed both unmodified original transparent overlays and read their alpha channels:

- `c09a75af33c5f7721df5b1646658a13028a39c54.png`: 390×794 RGBA, SHA-256 `e2cb57e7582de181dba921016237ca817cbc9f3c1d602dbac2eaf91be699f471`.
- `f1f7a8318c289dcdaf0b12449a2e401f04cc03e1.png`: 390×794 RGBA, SHA-256 `d8fd15531087daec644324757cbaf6fd204a9579ce7f35a7ba837f480854c2c2`.

On each original, the old column-gap patch has 24 transparent pixels and a single alpha-227 corner pixel `(152,414)` belonging to the adjacent hatch line. The centered 3×3 patch x149–151/y411–413 is entirely transparent. Reading all six probe patches directly yields old→new maxima: wallLine 191→191, columnLine 227→227, wallGap 0→0, columnGap 227→0, hole 0→0, room 0→0. The originals visibly contain clipped wall and column hatching with empty room/opening. These observations support the recorded root cause and do not depend on the implementer's offline-check claim.

The narrower gap neighborhood still tests actual between-line pixels at the intended unchanged world position. A solid fill would fail that transparent-gap assertion; absent hatching would fail the retained line assertions. `e2e/wallFill.spec.ts:206-211` still undoes the entire solid batch, verifies zero HATCH and empty scene/overlay material probes, then creates fresh user-pattern preview and checks overlay followed by committed scene. Both void probes retain their original patches and thresholds. Therefore the fix preserves the real line/gap and void proof without solid foreground making it vacuous.

**Limit:** ADDRESSED here means the correction is justified and correctly implemented. It is not a claim that post-correction Chromium has passed. Diagnostic CI `37253528375` predates the correction and still has the two phone failures. Fresh actual CI and all six final original-capture approvals remain root-owned gates.

## Strengths and introduced-change checks

- `e2e/wallFill.spec.ts:108-123`: bounded failure diagnostics preserve the last quantitative sample, attach the original intrinsic overlay PNG without compositing and rethrow the original assertion error even if attachment fails. File-scoped trace disabling at `:4` implements the authorized artifact-size workaround without changing global Playwright configuration or adding retries/sleeps.
- `e2e/wallFill.spec.ts:131-158`: the new temporary open wall uses a real Empty 900 opening. Native All is checked before confirmation against four distinct IDs sharing one origin, including two mline fragments. Exactly two preview/committed HATCH, material area 1530000, one history step, preserved source entities/groups/styles and undo restoration are asserted. Three undos remove fill, opening and wall before the required closed-room/circle fixture starts at `:172-173`. This adds coverage; it does not repair withdrawn I1.
- `src/commands/behavior/wallFill.test.ts:30-50`: the covering runner regression follows the same native selection/confirmation/history path and restores the initial entity/group/style maps. It checks the complete preview state equals the source snapshot before committing. No production command or history implementation changes are introduced.
- The required geometry, original source/property assertions, atomic solid undo/redo, phone action/focus/cancel flow, nested option cancellation and six capture paths are retained. All four diagnostic journeys passed the added temporary scenario before reaching the original pixel checks, as recorded in `ci-37253528375-summary.md:4`.
- Recovery and metadata distinguish reconstructed test text, the withdrawn review error, failed CI, direct original-image evidence, offline evidence and still-pending final gates. The final fix report at `task-3-report.md:76-89` does not present offline sampling as actual browser GREEN.

## New issues

### Critical

None found in the reviewed fix scope.

### Important

None found in the reviewed fix scope.

### Minor

None introduced by this package that warrants a new finding.

## Declined to judge / carried observations

- Original command, geometry producer and IO behavior beyond the fix diff: already reviewed; no production change or specific new contrary evidence in this package warrants a broad re-review.
- Original M1, the shared Architecture panel hint implying columns work with wall-only Axis/Parallel: unchanged and deferred to whole-master final review.
- Original M2, baseline LibreDWG/polygon-clipping build warnings: unchanged and disclosed; not introduced by this fix.
- Producer negative non-crossing closed-ring material-containment test coverage: unchanged carried limitation, not a new fix defect.
- Post-correction full Chromium results, committed phone scene pixels and all six final raw captures: require fresh actual CI and root inspection; diagnostic overlay evidence alone cannot approve those gates.

## Spec compliance and quality verdict

**Spec compliance: compliant within the reviewed fix scope.** The requirement is real rendered line/gap contrast and empty voids, not a mandated 5×5 gap footprint. The change corrects that footprint using actual diagnostic evidence while retaining probes, geometry, thresholds and fresh-hatching isolation. The diff changes only tests and review/evidence metadata; it introduces no application network, unit conversion, production mutation, native IDs/groups/properties, format/DWG, imported-input validation or bilingual/theme/focus change. The existing binding constraints remain intact in this scope.

**Quality: approved for progression to root's actual CI and original-capture gates.** B1's measurement correction is ADDRESSED, with no new Critical/Important/Minor breakage found. ARC-006 must remain experimental/in progress until those gates pass; this report does not approve merge or evidence closure.

Read-only review except this report. The supplied diff was inspected in bounded chunks, with truncated output recovered; no replacement git diff was derived. Primary JSON and raw PNG evidence were read directly. No tests, browser, full suite, source/index/HEAD or branch mutations were performed. The implementer's reported 61 tests / 4 files, types/lint/diff checks, four-test CLI discovery and offline predicate check were assessed against the changes without rerunning satisfied checks.
