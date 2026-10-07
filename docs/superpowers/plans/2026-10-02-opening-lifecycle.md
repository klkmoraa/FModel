# Huecos asociados y reparación de muros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Mover/copiar/editar/reflejar/borrar huecos nativos reparando su muro, y cambiar espesor sin perder huecos.

**Architecture:** Un constructor puro recorta todos los intervalos de una fuente MLINE. Un ensamblaje nativo valida y conserva grupo/roles; comandos comparten el mismo resultado para preview y commit. Exclusión temporal de render mejora la vista previa sin mutación del documento.

**Tech Stack:** TypeScript, Vitest, Playwright y entidades/grupos FModel; sin nuevas dependencias.

**Spec:** docs/superpowers/specs/2026-10-02-opening-lifecycle-design.md y docs/superpowers/specs/2026-10-02-yqarch-native-design.md.

## Global Constraints

- FModel sigue siendo CAD 2D local-first, sin backend, telemetría ni peticiones nuevas de red desde la aplicación.
- Toda geometría pertenece a las unidades del dibujo. Defaults y presets físicos se convierten con `UNIT_TO_MM`; documentos sin unidad usan los mismos valores numéricos explícitos.
- Todas las modificaciones pasan por `CommandApi.apply`/`CadDocument.transact`. Cancelar una operación pendiente no crea entidades, estilos ni registros; una operación terminada tiene undo/redo coherente.
- Las entidades y grupos nativos, propiedades, capas, espacios e IDs estables se conservan. No se amplía DWG ni se cambia el formato nativo para introducir un componente.
- Las geometrías, metadatos y parámetros importados se validan antes de utilizarlos. Ningún constructor admite valores no finitos, medidas colapsadas ni cantidades que bloqueen la interfaz.
- Interfaz y ayuda en español e inglés; teclado, foco visible, teléfono y Día/Noche; colores y materia de los tokens existentes.
- El código y las pruebas determinan el estado de una función. No se declara equivalencia funcional por tener un alias o por poder dibujar manualmente el resultado.

## Review Focus

- Borrar el último hueco debe recuperar muro original cerrado/abierto, mismo ID/orden/propiedades.
- Dos huecos y edición de uno no recrean IDs ni cambian propiedades del otro.
- Grupo importado incompleto, roles duplicados, clone o geometría manualmente alterada deben fallar antes de mutar.
- Al desaparecer un rol, sus pertenencias en otros grupos se reconcilian en la misma transacción; grupos vacíos, propiedades y orden superviviente permanecen intactos y deshacibles.
- Preview oculta sólo IDs declarados y los restaura incluso Esc/error; document.version/historial no cambian durante preview.
- No solapar intervalos ni llenar un hueco de otro, incluso diferentes segmentos de una habitación cerrada.

## Task 1: Geometría de múltiples huecos y ensamblaje nativo validado

**Files:** Create src/geometry/wallOpenings.ts and wallOpenings.test.ts; src/model/wallAssembly.ts and focused tests (split validation/helpers into wallAssemblyValidation.ts if needed); src/io/wallAssembly.test.ts. Modify DXF export warning only where needed. No commands/UI yet.

**Interfaces:**
- geometry WallOpeningSpec: {id:string, segment:number, offset:number, width:number, type:'single'|'double'|'sliding'|'fixed'|'empty', side:1|-1, hingeEnd:boolean}; measures in drawing units.
- buildWallAssembly(path:WallPath, openings:WallOpeningSpec[]): {fragments:Array<{key:string,vertices:Vec2[],closed:boolean}>,symbols:Array<stable-key line/arc symbol with openingId>}. Exact exported symbol union declared in same module; no command/model imports into geometry.
- model readWallAssembly(doc:CadDocument, memberId:Id) returns validated source/group/anchor/roles/openings, rejects foreign/incomplete/manuallychanged metadata; readWallOpening resolves only an explicit openingId member. Model create/update functions accept transaction+validatedsource+openings, preserve surviving roles IDs/properties; report exact signatures for Task2.

- [ ] Write tests BEFORE builders/model. Example geometric target:
```ts
const path={vertices:[{x:0,y:0},{x:10000,y:0}],closed:false,scale:150,justification:'zero' as const};
const cut=(id:string,offset:number)=>({id,segment:0,offset,width:900,type:'single' as const,side:1 as const,hingeEnd:false});
const g=buildWallAssembly(path,[cut('a',2000),cut('b',7000)]);
expect(g.fragments.map(f=>f.vertices.map(p=>p.x))).toEqual([[0,1550],[2450,6550],[7450,10000]]);
```
Also closed6000×4000 cuts different segments, double radius450 quarter arcs, width edit, overlap/contact/corners/nonfinite/limits rejection and no-opening exactoriginal.
- [ ] Run pnpm vitest run src/geometry/wallOpenings.test.ts; expected RED because builder unavailable, record actual output.
- [ ] Implement validated ordered interval cuts on full source paths, stable fragment/symbol roles, all5types. Reject impossible outputs before returning. Use wallFaces/linearTol and native arcs.
- [ ] Write/run RED model tests: two openings then movea keeps b symbol IDs/properties; deletinglast returns originalclosed ID; corrupted group/roles/source/count/clone/manualgeometry/owner cannot mutate. Use real CadDocument transactions.
- [ ] Implement model create/update/read with nativegroups/metadata, all editability validated by command consumer. Store complete source, boundedversion1 metadata and exactmember ownership; no hiddenanchor/no format bump. Preserve unrelatedmeta.
- [ ] Cover removed-role membership in additional native groups, including mixed and empty groups: filter only deleted IDs, retain group properties and surviving order, undo/redo exact membership, and native reopening without broken-group repairs. Reuse the established component-assembly reconciliation pattern instead of introducing a global document reactor.
- [ ] Native roundtrip preserves source/association/editability; DXF roundtrip physicalmeasurements/quarterarcs remain and real report warns loss. No ownership guess for legacy unassociatedsymbols. Run focused tests plus types/lint/layers/fulltests once.
- [ ] Self-review commit taskfiles only, report actualAPIs/REDGREEN/checks/concerns to own taskreport. No push/merge/subagents.

## Task 2: Comandos, acceso visual y preview sin superponer original

**Files:** Modify src/commands/architectureOpenings.ts preserving oldexports; create src/commands/openingLifecycle.ts and focused command helpers/test; modify src/commands/index.ts, src/ui/ribbonConfig.ts, palettes, ArchitecturePanel. Modify src/commands/types.ts, src/editor/editor.ts, src/render/traverse.ts/sceneRenderer.ts and focused previewtests. Create e2e/openingLifecycle.spec.ts; update feature/evidence/catalogue/backlog ARC-004 and brandbook.

**Interfaces:** consume approvedTask1 actualmodel/builder exports. Register existing WALLDOOR/WALLWINDOW once and six new commands per spec: OPENINGMOVE, OPENINGCOPY, OPENINGEDIT, OPENINGMIRROR, OPENINGDELETE, WALLTHICKNESS (Spanishaliases specified). PreviewSpec.hideIds?:Id[] excludes only pending edit members from onscreenrender, never fileoutputs/document mutation.

- [ ] Runner RED tests create2doors samewall, moveoldcenter→newcenter, editwidth/type, mirrorEje/Centro/Ambos, copytosame/otherwall, deleteone/last and thickness; compare realgeometry/IDs/properties/history. Everyinputstagecancel and badmetadata/lockedmembers rejectwithoutchanges. Defaultsmm/m/unitless900/1200physicallysame.
- [ ] Implement canonicalcommands viaCommandApi getEntity/point/distance/keyword and atomicapply. Preview wholehost reconstruction using samebuilder. No ambiguous fragment→randomopening choice; selectjamb/leaf/frame or explain. Existingaliases/presets retained.
- [ ] Preview RED: setreplacementhideIds hidesoriginalscene/renderhighlight and activeviewportcontent while snapshot/version/history unchanged; clearing/cancel/error restore. Implement boundedset handling, sceneinvalidations onlywhenhideIDschange, ephemeraltraverseexclusion distinctfromuserhidden. Direct cursor preview assignment must use consistentsetter. Export/print remains unchanged.
- [ ] ActualToolDeck/palette/panel andphone accessnewactions ES/EN existingtokens; helpstates exactlimits and incompletelegacyassociation. No syntheticbutton or independentReactmutationflow.
- [ ] Realbrowserjourney createsroom/twohuecos, movesone withvisibleoldgaphealed, undo/redo and deletes/undo; DayNight/phone outputcaptures. Addquantitativeassertions on sourceparams and renderedgeometry, not onlytext.
- [ ] Docs guide+DXF loss+features/evidence generatedFEATURES+backlogARC004inprogress. Run focusedchecks andpnpmverify once beforecommit; report actualresults andbrowserdiscovery ifexecutioncontrollerremote. Controller captures/reviews CIevidence beforeclosingbacklog.
- [ ] Selfreview, localcommit taskfiles, fullreport. No push/merge/subagents.
