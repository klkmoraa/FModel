# Task 1 — native material loops

Status: DONE. Base: `db2c379bb375991fddeae8093b55cb6888e0f6e3`.

Created `src/geometry/wallFill.ts` and `src/geometry/wallFill.test.ts`. Public exports: `MaterialLoop`, `WallFillError`, `wallFillLoops(path: WallPath): MaterialLoop[]`, `polygonFillLoop(vertices: ReadonlyArray<Vec2>): MaterialLoop`, `circleFillLoop(center: Vec2, radius: number): MaterialLoop`.

The tests cover the open 6000×300 band (1,800,000), CW/CCW 6000×4000 closed wall (outer 27,090,000 and inner 21,090,000; material 6,000,000), top/bottom faces, mitered L/diagonal faces, independent arrays, four column outlines (240,000/100,000/100,000/100,000), exact two-bulge circle (90,000π), translations/rotation, and malformed/bounded input. The wall producer remains the validation authority; its domain errors propagate.

TDD evidence: initial RED missing module, then API-stub RED with all three named tests failing for the expected empty behavior; GREEN 3/3 after implementing the functions. Focused geometry command `pnpm vitest run src/geometry/wallFill.test.ts src/geometry/wallUtilities.test.ts src/geometry/walls.test.ts`: 3 files, 21 tests passed. Full `pnpm test`: 120 files, 1207 tests passed. `pnpm typecheck`, `pnpm lint`, `pnpm check:layers`, and `git diff --check`: exit 0. Lint initially caught and then passed after removal of one unused import.

Scope limits: no model/HATCH construction, command, metadata, persistence round trip or browser behavior belongs to this task. The circles retain exact native bulges; no tessellation occurs here. The downstream HATCH parity and writer integration need Task 2 checks. No changes to `wallUtilities.ts` or producer semantics.
