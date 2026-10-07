# Task 1 geometry report

## Scope and exports

`src/geometry/wallUtilities.ts` exports `wallCenterAxis(path: WallPath): { vertices: Vec2[]; closed: boolean }`, `parallelWall(path: WallPath, clearance: number, side: 1 | -1, thickness = path.scale): WallPath`, and `WallUtilityError(code: string)` with bilingual `messageI18n`. The axis accepts at most 500 vertices and the parallel constructor at most 200. The functions use native `wallFaces`, return independent arrays, validate physical faces, rings, caps, global boundary distances and material containment. Error categories are `path`, `limit`, `measure`, `side`, `collapse`, `separation`; unknown exceptions propagate.

## Observed RED → GREEN

- `pnpm vitest run src/geometry/wallUtilities.test.ts`: exit 1, missing `./wallUtilities` module (setup RED, zero tests collected).
- After minimal exported stubs: same command exit 1, 7 tests failed with actual behavior mismatches. For example, top axis expected `[-75,-75]`, received `[0,0]`; straight parallel expected `scale:300` and `y:1225`, received `scale:150` and `y:0`.
- The first implementation run had 4 passed, 3 failed; the latter failures exposed a test matcher misuse (`toThrow` does not accept predicate). Replacing it with explicit error assertions gave 6 passed, 1 failed. U width 800 failed as `collapse` because the constructed faces collapse before an intact target can undergo global separation comparison; adjusted that test's error classification while preserving rejection.
- `pnpm vitest run src/geometry/wallUtilities.test.ts`: exit 0, 7 passed after the correction.
- `pnpm vitest run src/geometry/wallUtilities.test.ts src/geometry/walls.test.ts`: exit 0, 2 files and 15 tests passed after the midpoint sampling refinement. The final run after extra zero-contact, outward/CW room, return-overlap and pathological miter assertions also passed 15/15.

## Checks and review

- `pnpm typecheck`: exit 0 (`tsc --noEmit`).
- `pnpm lint`: exit 0 (`oxlint --deny-warnings src`).
- `pnpm check:layers`: exit 0 (689 imports checked).
- `git diff --check`: exit 0.
- Self-review: no other source modules edited; input vertices are not mutated; pairwise work occurs only after limits and basic validation; zero gap permits touching material boundaries. Both material rings of a closed wall are checked for crossings and nesting, then each candidate is checked against the other wall's boundary segments and interior samples. The native miter algorithm is reused, and polygon containment uses the existing geometry primitives. Test fixtures cover 1e6 coordinate translation, diagonal/vertical/reversed paths, L and CCW/CW rooms, the 800-wide U return, a return with overlapping generated material, and malformed/crossing/collinear inputs. No unresolved concern found in these fixtures; a full suite was not run because this task explicitly limits verification to focused geometry and listed checks.

## Commits

Checkpoint commit: `475157e` (`Add physical wall axes and clear-distance geometry`). Final report/test refinements are committed separately; see task branch log for the report refresh commit.

## Controller review round 1 (2026-10-04)

Read `task-1-review.md` and reproduced both important findings before edits. The malformed-input regression initially failed with `TypeError: Cannot read properties of null` rather than `WallUtilityError`. The finite U return with a `1e155` horizontal leg, `1e145` source thickness, `1e146` return width, `1e145` clearance and `3e145` target thickness was accepted; a long noncorresponding boundary pair makes the existing squared projection unsafe. The initial 3e145-wide return was itself geometrically collapsed, so the regression was corrected to 1e146 to isolate numerical acceptance rather than weakening the rejection criterion. Focused RED after those tests: 2 failed / 7 passed (raw TypeError and expected `range` rejection absent).

Input validation now checks each array index, including holes, and each vertex's own numeric finite `x` and `y` data properties before coordinate reads. This covers `null`, `undefined`, primitive, inherited fields, string coordinates and sparse arrays; each now gives bilingual `WallUtilityError('path')`. Focused intermediate run: 1 failed / 8 passed, with only the extreme-coordinate regression still RED.

The geometry constructor now rejects source coordinates, source scale, clearance, target thickness, temporary offset scale and generated face coordinates above `Math.sqrt(Number.MAX_VALUE) / 32` using bilingual `WallUtilityError('range')`. For accepted inputs and faces, pairwise point/segment differences are at most twice the bound; squared dot products and the sum of two cross products stay finite with a wide safety margin. No numerical comparisons proceed when generated faces exceed the bound. The finite extreme-return regression now rejects before global pairwise work; the ordinary 1e6 translation case remains accepted. The final focused suite also asserts exact face-to-face contact along both legs of an L at zero gap.

Final GREEN and checks: `pnpm vitest run src/geometry/wallUtilities.test.ts src/geometry/walls.test.ts` exit 0, 2 files / 18 tests passed; `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm check:layers` exit 0 (689 imports); `git diff --check` exit 0. The original closed-room collapse and concentric inward/outward valid cases remain tested. There is no separate negative fixture proving source/target closed-ring material containment without boundary intersection; the report claims an implementation check, not independent test proof of that particular topology. No full suite or browser was run under this scoped fix brief.

Fix commit: see the task branch log after this report update.
