# Precision Deck Workspace Implementation Plan

> Original implementation outline. The checkboxes below record proposed steps, not the remaining work; see the verified implementation status before using them.

**Goal:** Replace the permanent desktop ribbon and always-visible side docks with the approved Precision Deck, tool library, and floating/pinnable panels while preserving every CAD command path.

**Architecture:** Keep `Editor`, `CommandRunner`, `RIBBON`, and the existing panel components as sources of truth. Add a small presentation model plus focused React components for the dock, tool deck, and panel surfaces; `App` only coordinates which surface is open. CSS changes restyle the shell without changing Canvas rendering or document behavior.

**Tech Stack:** React 19, TypeScript 5.9 strict, Vite 8, Vitest 5, Playwright, existing CSS token system, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-20-precision-deck-workspace-design.md`

**Implementation status (2026-09-20):** Core redesign implemented inline. The shipped structure uses `src/ui/PrecisionDeck.tsx` for the dock and anchored Tool Deck, reuses the `Docks.tsx` panel registry for floating/pinned surfaces, and keeps preference normalization in `src/editor/workspaceChrome.ts` to preserve the layer boundary. Tool Deck, floating panel, and command palette are mutually exclusive. Verified with `pnpm verify` (67 files, 598 tests) and 18 Chromium E2E tests. A dedicated performance trace and WebKit run remain optional follow-up evidence; no hardware-specific 120 fps guarantee is claimed.

## Global Constraints

- Strictly 2D; no BIM, IFC, 3D, backend, accounts, telemetry, or new network calls.
- Visible copy remains bilingual through existing `tr`, `L`, or `{ es, en }` contracts.
- Theme is automatic by default; active commands use `#7657D5` by day and `#A990FF` by night, never red.
- Existing commands, aliases, shortcuts, precision, selection, undo/redo, file formats, and Canvas rendering remain unchanged.
- Chrome animations use only `transform` and `opacity`, last 140–180 ms, and stop under `prefers-reduced-motion`.
- No new production dependency.
- Do not create commits, branches, pushes, or PRs without an explicit user request.

---

### Task 1: Workspace presentation model and preference migration

**Files:**
- Create: `src/ui/workspaceChrome.ts`
- Create: `src/ui/workspaceChrome.test.ts`
- Modify: `src/editor/preferences.ts`

**Interfaces:**
- Produces `WorkspacePanelId`, `WorkspaceSurface`, `panelPresentation`, `setPanelFloating`, `toolForCommand`, and `uniqueFavoriteCommands`.
- Extends `Preferences.panels` with `version: 2`; version 1/absent preferences migrate existing panels to floating presentation.

- [ ] **Step 1: Add failing tests** for legacy preference migration, invalid panel IDs, favorite deduplication, ribbon lookup, and pin/unpin immutability.
- [ ] **Step 2: Run** `pnpm vitest run src/ui/workspaceChrome.test.ts` and confirm failures reference missing exports.
- [ ] **Step 3: Implement exact types and pure helpers**:

```ts
export type WorkspacePanelId = 'properties' | 'layers' | 'blocks' | 'palettes' | 'authoring';
export type WorkspaceSurface = { kind: 'tools'; tabId: string } | { kind: 'panel'; panelId: WorkspacePanelId } | null;
export function uniqueFavoriteCommands(names: string[], limit = 6): string[];
export function toolForCommand(command: string): RibbonTool | undefined;
export function setPanelFloating(panels: Preferences['panels'], panelId: WorkspacePanelId, floating: boolean): Preferences['panels'];
```

- [ ] **Step 4: Normalize preferences** so malformed arrays fall back safely and legacy `panels` become `{ ...defaults, version: 2, floating: ['palettes','properties','layers','blocks'] }`.
- [ ] **Step 5: Re-run focused tests and `pnpm typecheck`**; both must pass.

### Task 2: Precision Dock and Tool Deck

**Files:**
- Create: `src/ui/PrecisionDock.tsx`
- Create: `src/ui/ToolDeck.tsx`
- Create: `src/ui/precisionDeck.test.tsx`
- Modify: `src/ui/icons.tsx` only if an existing icon cannot represent the approved control.

**Interfaces:**
- `PrecisionDock({ editor, surface, onSurfaceChange, onOpenPanel })` renders stable context, up to six favorites, and family launchers.
- `ToolDeck({ editor, tabId, onTabChange, onRun, onClose })` derives all tools from `RIBBON` and command metadata.

- [ ] **Step 1: Add jsdom tests** using `createRoot`/`act` that assert the dock labels reposo, active command, and selection count; active command uses `is-command-active`, not a danger class.
- [ ] **Step 2: Add tests** that Tool Deck renders bilingual tab/group labels, toggles favorites through `editor.setPrefs`, runs the canonical command once, closes on Escape, and restores focus.
- [ ] **Step 3: Run** `pnpm vitest run src/ui/precisionDeck.test.tsx` and confirm failures.
- [ ] **Step 4: Implement `PrecisionDock`** with semantic buttons, `aria-label`, `aria-pressed`, tooltips containing command/alias, stable zones, and existing `CadIcon`/`findCommand` paths.
- [ ] **Step 5: Implement `ToolDeck`** with tablist, groups, recent commands, search via `searchCommands`, favorite stars, click-outside close, Escape close, and opener focus restoration.
- [ ] **Step 6: Re-run focused tests and `pnpm typecheck`**; both must pass.

### Task 3: Floating and pinnable panel surfaces

**Files:**
- Create: `src/ui/PanelLaunchers.tsx`
- Modify: `src/ui/Docks.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/precisionDeck.test.tsx`

**Interfaces:**
- `PanelLaunchers({ editor, activePanel, onOpen, onClose, onPin })` renders edge launchers and exactly one floating panel.
- `Docks` renders only panels not listed in `prefs.panels.floating` and exposes an unpin action.

- [ ] **Step 1: Add failing tests** for one floating panel at a time, close, pin, unpin, `aria-selected`, and opener focus restoration.
- [ ] **Step 2: Run the focused test** and confirm the new behavior is absent.
- [ ] **Step 3: Extract/export the panel registry types** from `Docks.tsx` without changing the existing panel implementations.
- [ ] **Step 4: Implement `PanelLaunchers`** with semantic buttons, an `aside` floating surface, close and pin buttons, and bilingual labels.
- [ ] **Step 5: Filter pinned docks and implement unpin** by updating `Preferences.panels.floating`; preserve resize, side move, and keyboard separator behavior.
- [ ] **Step 6: Re-run focused tests and `pnpm typecheck`**.

### Task 4: Integrate the Precision Deck shell

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/CommandLine.tsx`
- Modify: `src/ui/StatusBar.tsx`
- Modify: `src/ui/Ribbon.tsx`

**Interfaces:**
- `App` owns one `WorkspaceSurface`; opening tools closes floating panels and opening a panel closes tools.
- `CommandLine` keeps the same ref/input contract and adds compact presentation classes only.
- `Ribbon` remains as a compatibility/catalog wrapper but is no longer mounted permanently on desktop.

- [ ] **Step 1: Add E2E expectations** for absence of the permanent ribbon, visible Precision Dock, opening Tool Deck, running LINE, active violet context, and floating/pinned Properties.
- [ ] **Step 2: Build once to verify the new E2E assertions fail** against the existing shell.
- [ ] **Step 3: Replace permanent `<Ribbon>` composition** with `<PrecisionDock>`, `<ToolDeck>`, and `<PanelLaunchers>` while keeping mobile routing and clean-screen behavior.
- [ ] **Step 4: Route `panel:*` events** to floating launchers when configured and to existing pinned docks otherwise; do not cancel an active command.
- [ ] **Step 5: Add compact CommandLine presentation** using its current prompt, keywords, exact input, history, and submission logic.
- [ ] **Step 6: Compact StatusBar visually** without removing coordinates, units, scale, snap modes, storage health, task state, or fullscreen.
- [ ] **Step 7: Run focused Vitest, `pnpm typecheck`, and the edited Playwright specs**.

### Task 5: Visual system, responsive behavior, and motion

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/app.css`
- Modify: `src/ui/MobileBar.tsx`
- Modify: `e2e/brandbookVisual.spec.ts`

**Interfaces:**
- Adds `--fm-dock-h`, `--fm-chrome-motion`, and semantic surface tokens derived from existing neutrals/accent.
- Desktop breakpoint remains above 820 px; mobile retains the existing touch command semantics.

- [ ] **Step 1: Update visual E2E assertions** for wide/compact/mobile layouts, no horizontal overflow, automatic theme, violet active state, minimum stage size, and reduced motion.
- [ ] **Step 2: Restyle the shell** to topbar + canvas + statusbar, floating dock, anchored deck, edge launchers, floating panel, and pinned dock.
- [ ] **Step 3: Use explicit transitions** for `opacity` and `transform`; remove layout animations and ensure all overlays use `overscroll-behavior: contain`.
- [ ] **Step 4: Adapt `MobileBar`** so the same contextual/favorite/family language becomes a bottom sheet without shrinking touch targets below 40 px or changing command semantics.
- [ ] **Step 5: Run Playwright visual/layout tests** at 390×844, 768×1024, 1280×800, and 1440×900.

### Task 6: Accessibility, performance, and full verification

**Files:**
- Modify: `e2e/criticalJourneys.spec.ts`
- Modify: `e2e/brandbookVisual.spec.ts`
- Modify: implementation files only for issues found by the audit.

**Interfaces:**
- No new public product interface; this task proves the completed shell.

- [ ] **Step 1: Extend critical journey E2E** to cover keyboard-only Tool Deck, favorite toggle, panel pin/unpin, focus restoration, active command Enter/Escape, and touch fallback.
- [ ] **Step 2: Run axe** over `.app` with Tool Deck and floating Properties open; serious/critical violations must be empty.
- [ ] **Step 3: Audit touched UI files** against the current Web Interface Guidelines: aria labels, visible focus, semantic buttons, reduced motion, no `transition: all`, labeled inputs, safe-area handling, and long bilingual labels.
- [ ] **Step 4: Capture a browser trace** opening/closing the Tool Deck and verify no UI-generated task exceeds 50 ms and Canvas does not re-render from dock hover.
- [ ] **Step 5: Run focused tests**, then `pnpm lint && pnpm verify`, then the relevant Playwright specs in Chromium; run WebKit when the installed browser is available.
- [ ] **Step 6: Run** `git diff --check`, inspect `git status --short`, and review every touched diff. Do not commit or push.
