# Componentes arquitectónicos nativos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Crear y editar las 14 familias de componentes del módulo de construcción con geometría nativa y una interfaz de parámetros.

**Architecture:** Constructores puros producen primitivas con roles estables. Un catálogo define campos/defaults; una capa de modelo conserva grupos y metadatos; comandos y panel usan los mismos parámetros y la misma validación. Geometría, documento y UI conservan la dirección de capas existente.

**Tech Stack:** TypeScript, React 19, Vitest, Playwright y entidades nativas de FModel. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-02-construction-components-design.md`; contexto general `docs/superpowers/specs/2026-10-02-yqarch-native-design.md`.

## Global Constraints

- FModel sigue siendo CAD 2D local-first, sin backend, telemetría ni peticiones nuevas de red desde la aplicación.
- Toda geometría pertenece a las unidades del dibujo. Defaults y presets físicos se convierten con `UNIT_TO_MM`; documentos sin unidad usan los mismos valores numéricos explícitos.
- Todas las modificaciones pasan por `CommandApi.apply`/`CadDocument.transact`. Cancelar una operación pendiente no crea entidades, estilos ni registros; una operación terminada tiene undo/redo coherente.
- Las entidades y grupos nativos, propiedades, capas, espacios e IDs estables se conservan. No se amplía DWG ni se cambia el formato nativo para introducir un componente.
- Las geometrías, metadatos y parámetros importados se validan antes de utilizarlos. Ningún constructor admite valores no finitos, medidas colapsadas ni cantidades que bloqueen la interfaz.
- Interfaz y ayuda en español e inglés; teclado, foco visible, teléfono y Día/Noche; colores y materia de los tokens existentes.
- El código y las pruebas determinan el estado de una función. No se declara equivalencia funcional por tener un alias o por poder dibujar manualmente el resultado.

## Review Focus

- Una copia aislada de un miembro no debe editar la pieza de origen; Task 1 comprueba pertenencia al grupo antes de leer/editar.
- Cambiar de documento mm→m no debe reutilizar valores viejos; Task 1 prueba defaults y argumentos con ambos documentos.
- Parámetros importados enormes o corruptos no deben generar miles de entidades ni mutar parcialmente; Task 1 comprueba límite y rechazo antes de aplicar.
- Editar un número de peldaños conserva IDs de roles supervivientes y propiedades de miembros; Task 1 prueba aumentar/disminuir y undo.
- Panel/hoja móvil no ocupa más ancho que el viewport ni abre teclado al entrar; Task 2 prueba acceso y campos en navegador.

## Task 1: Constructores, comandos y edición paramétrica nativa

**Files:** Create `src/geometry/architecture/types.ts`, `components.ts`, `circulation.ts`, `facades.ts` and focused geometry tests; create `src/app/componentCatalog.ts`, `src/model/componentAssembly.ts`, `src/commands/components.ts`, behavior and native/DXF tests. Modify command registration, feature/evidence catalogue and backlog. Keep modules focused; split helpers by responsibility rather than grow one large file.

**Requirements:** Read the complete component spec first: its table supplies all 14 families, canonical commands, variants, fields, exact defaults, bounds, placement/editing sequence, group/metadata contract and tests. Implement all rows. Do not implement other master-design modules in this task. No UI panel yet.

**Interfaces:**

- Produce `ComponentKind` (14 family keys), `ComponentParameters = Record<string, number | string | boolean>` and a discriminated `ComponentPrimitive` union with stable `key` plus line/arc/circle/polyline/text geometry, in `src/geometry/architecture/types.ts`.
- Produce `buildComponent(kind: ComponentKind, parameters: ComponentParameters): ComponentPrimitive[]`; its input is in drawing units, fully populated and validated, with the 2000-primitive bound. Preview and commit call this exact function.
- Produce `COMPONENT_CATALOG` and `componentDefaults(kind: ComponentKind, units: DrawingUnits): ComponentParameters` in `src/app/componentCatalog.ts`. Entries expose `kind`, `command`, localized label, localized category, schema fields (key/label/type/min/max/choices/unit), and physical defaults; consumers do not infer fields from geometry code. Use the actual drawing-unit type or `DocumentSettings['units']` from the repo.
- Produce `parseComponentArguments(kind, units, args): { parameters: ComponentParameters; rotation: number }` with strict named arguments as the spec defines. Rotation is radians in the result. No dynamic evaluation of parameter strings.
- Produce model functions to create/update/read a native assembly from a `Transaction`/`CadDocument`, standard properties and validated primitives/state. Full signatures live beside the implementation and are documented in the report for Task 2; consumers must not duplicate metadata parsing. Preserve IDs by primitive key.
- Export `COMPONENT_COMMANDS: CommandDef[]` containing all canonical constructors and `COMPONENTEDIT`; registration includes the array. Spanish aliases are unique and do not override existing commands. Every constructor accepts the same named-argument contract and exposes meaningful bilingual help.

- [ ] Write failing geometry tests: rectangular/L/T/cross/circular columns; grid4×3 labels; all stair variants16 treads and proper arc radii; section top rise16×170; escalator horizontal span3000/tan30°; cabin fits/open doorway; all listed elevation/section/partition/railing families; partition6000/1000 panels and railing max1000 spacing. Assert coordinates/counts/bounds and actual shapes, not just nonempty arrays.
- [ ] Run focused new tests and confirm missing implementation failures.
- [ ] Implement pure builders and shared validators. Use `TOL`, native curves and stable role keys. Assert impossible layouts reject before returning primitives.
- [ ] Write failing behavior tests using the actual runner: each command can construct the specified family; mm/m/unitless defaults; physical and numeric arguments; initial cancel/error without mutation; one undo/redo; editable groups, stable roles/IDs, corrupt metadata, foreign clone and incomplete group rejection.
- [ ] Implement catalogue, argument parsing, native assemblies and commands. Native group records use actual `members`, `name`, `description`, `selectable`; no hidden anchor or schema expansion. Geometry conversion preserves native property contracts. Every mutation is a single apply after validation.
- [ ] Write/run native/DXF round-trip tests for grid text, curved stair and edited window. Record parametric-information loss in DXF honestly.
- [ ] Add ARC-003 to backlog as in progress, catalogue/evidence/guide and generated FEATURES. Keep status experimental pending final browser QA. Run focused tests, typecheck, lint, layers, feature checks; report commands/results and limits.
- [ ] Self-review and commit only task files locally. No push, merge or subagents. Save full report in the plan workspace; return status, commit(s), test summary and concerns.

## Task 2: Arquitectura visual y parámetros accesibles

**Files:** Create `src/ui/panels/ArchitecturePanel.tsx`, `src/ui/panels/architectureForm.ts` and focused `architectureForm.test.ts`, plus `e2e/componentsJourneys.spec.ts`; modify `src/ui/Docks.tsx`, `src/editor/workspaceChrome.ts`, `src/ui/phone/PhoneChrome.tsx`, styles, `src/ui/ribbonConfig.ts`/palettes and docs/brandbook. Use Task 1's actual catalogue/argument/assembly interfaces from its report.

**Interfaces:** Consume catalogue/defaults/builders and validated assembly reader; invoke canonical commands via `editor.command(name, args)`. Add workspace panel ID `architecture` as a later-added floating panel with safe preferences migration. Register `ARCHITECTURE`/`ARQUITECTURA` as a read-only panel-opening command without redefining existing commands. Pure UI helpers `componentFormValues(kind, units)` convert catalogue defaults to field strings (angles in degrees), and `validateComponentForm(kind, units, values, rotationText)` delegates to strict Task1 parser, returns validated args/parameters/rotation or field-key errors. The active form context is actual `editor.doc.id`, drawing units and kind, not every document version: placement must not reset all fields. A new/load document or units change resets the form before invocation. `PANELS.render` may accept an optional third onStart callback: ArchitecturePanel calls it only after a valid command invocation; phone PanelSheet passes onClose so the sheet closes for canvas placement/edit, desktop omits it.

- [ ] Write failing UI logic tests for finite numeric values, enums, metre defaults, same command args, stale document reset and invalid-input refusal; panel preference normalization must preserve existing choices while adding the panel once. Concrete tests (import actual Task1 types/helpers from report):
```ts
const fields = componentFormValues('column', 'm');
expect(fields.width).toBe('0.4');
const result = validateComponentForm('column', 'm', {...fields,width:'600mm'}, '90');
expect(parseComponentArguments('column','m',result.args).parameters.width).toBe(0.6);
expect(result.rotation).toBeCloseTo(Math.PI/2);
expect(() => validateComponentForm('column','m',{...fields,width:'Infinity'},'0')).toThrow();
```
Also window frame impossible→errors attached to affected fields, angles display degrees, counts untouched, document-id/units context change resets once while entity placement preserves chosen values. Run `pnpm vitest run src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts`, record RED from absent helper/panel.
- [ ] Implement search/category/component selection, localized schema fields with visible units, SVG miniature from builder primitives, «Colocar» and «Editar pieza». Use existing controls/tokens. If filtering fields by variant, add optional declarative visibility metadata to the shared schema/types rather than React geometry rules: column diameter only circular, width/depth only other variants, arm only L/T/cross; stair landing only L/U, tread only straight/L/U, radius/turn only curved; railing height only elevation. Retain all parameters in the validated state/args, including hidden defaults. A shared catalogue visibility helper is consumed by form and interactive command field selection. Named-argument values for inactive fields remain saved for a future variant; help makes that behavior clear. Curved steps are defined by radii, turn and count, so do not present the straight-flight tread as an effective curved-flight control. Field errors do not start the runner. Preview miniature never mutates a drawing. Do not duplicate domain validation in React.
- [ ] Make the panel reachable from actual ToolDeck/architecture tab, palettes and phone panel sheet, with canonical commands and keyboard focus. Phone opening does not focus an input automatically. Valid Place/Edit closes the phone sheet; malformed fields keep it open with visible errors and never start a command. Make this a real-browser assertion. Keep root-owned architecture-touch.png and incorporate its wall QA evidence in brandbook; core ARC-002 may close using the stored successful CI37022156512 evidence, independently of ARC-003.
- [ ] Add real-browser journeys for mm and m placement/edit/undo, keyboard fields, Día/Noche screenshots, phone opening/no overflow/component placement/cancel. Reuse actual accessible control names rather than assuming desktop names on phone.
- [ ] Update guide, catalogue/evidence, backlog and brandbook ficha. Controller captures/reviews genuine screenshots; close ARC-003 only after final browser evidence and complete verify.
- [ ] Run focused tests plus `pnpm verify`, self-review, commit locally and report. No push, merge or subagents.
