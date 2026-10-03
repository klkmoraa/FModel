# Ejes y paralelas de muro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtener ejes físicos completos y crear muros paralelos por separación libre entre caras, con dos comandos nativos sencillos.

**Architecture:** Constructores puros conocen caras e ingletes; readWallSource resuelve fuente independiente/asociada sin cortes. Comandos atómicos consumen esa geometría para preview y commit; UI presenta los mismos comandos y resultados estándar se guardan sin nuevos metadatos.

**Tech Stack:** TypeScript, entidades FModel, Vitest, Chromium/Playwright remoto; sin dependencias nuevas.

**Spec:** docs/superpowers/specs/2026-10-03-wall-utilities-design.md; intención global docs/superpowers/specs/2026-10-02-yqarch-native-design.md.

## Global Constraints

- FModel sigue siendo CAD 2D local-first, sin backend, telemetría ni peticiones nuevas de red desde la aplicación.
- Toda geometría pertenece a las unidades del dibujo. Defaults y presets físicos se convierten con UNIT_TO_MM; documentos sin unidad usan los mismos valores numéricos explícitos.
- Todas las modificaciones pasan por CommandApi.apply/CadDocument.transact. Cancelar una operación pendiente no crea entidades, estilos ni registros; una operación terminada tiene undo/redo coherente.
- Las entidades y grupos nativos, propiedades, capas, espacios e IDs estables se conservan. No se amplía DWG ni se cambia el formato nativo para introducir un componente.
- Las geometrías, metadatos y parámetros importados se validan antes de utilizarlos. Ningún constructor admite valores no finitos, medidas colapsadas ni cantidades que bloqueen la interfaz.
- Interfaz y ayuda en español e inglés; teclado, foco visible, teléfono y Día/Noche; colores y materia de los tokens existentes.
- El código y las pruebas determinan el estado de una función. No se declara equivalencia funcional por tener un alias o por poder dibujar manualmente el resultado.

## Review Focus

- Justificación top/bottom: extraer el eje de referencia en lugar del punto medio físico daría cotas falsas; Task1 fija los tres resultados.
- Retorno cercano/caras cruzadas o colineales: medir sólo caras correspondientes puede aparentar distancia válida; Task1 exige rechazo global con pruebas de material solapado y cero sin solape.
- Origen cambia mientras hay prompts: copiar una fuente obsoleta o capa bloqueada debe fallar antes de apply; Task2 prueba cambios intercalados de propietario, capa, geometría, estilo y asociación.
- Copiar tags de muro desde símbolo/ancla: nuevos objetos quedarían propietarios inválidos; Task2 verifica metadata limpia, originales exactos y uso posterior de WALLDOOR.
- Teléfono: viewport pequeño no implica hasTouch y capturar con hoja animando oculta el dibujo; Task2 usa contextos móviles reales y captura completa/asentada.

---

## Task 1: Geometría física de ejes y separación libre

**Files:** Create src/geometry/wallUtilities.ts and src/geometry/wallUtilities.test.ts. Reuse src/geometry/walls.ts, intersect.ts, polyline.ts, curves.ts, tolerance.ts without unrelated changes. No model/command/UI/catalogue mutation in this task.

**Interfaces:**
- Consumes WallPath from walls.ts and wallFaces(path):Vec2[][], native TOL/linearTol and existing geometry primitives.
- Produces wallCenterAxis(path:WallPath):{vertices:Vec2[],closed:boolean}; parallelWall(path:WallPath,clearance:number,side:1|-1,thickness?:number):WallPath; WallUtilityError(code:string) with messageI18n:{es:string,en:string}. Default thickness path.scale. Immutable inputs/outputs, 500 axis /200 parallel vertex limits.

- [ ] Write meaningful assertion tests before implementation. Exact straight fixture:
```ts
const source={vertices:[{x:0,y:0},{x:6000,y:0}],closed:false,scale:150,justification:'zero' as const};
expect(wallCenterAxis(source)).toEqual({vertices:[{x:0,y:0},{x:6000,y:0}],closed:false});
expect(wallCenterAxis({...source,justification:'top'}).vertices.map(p=>p.y)).toEqual([-75,-75]);
expect(wallCenterAxis({...source,justification:'bottom'}).vertices.map(p=>p.y)).toEqual([75,75]);
const copy=parallelWall(source,1000,1,300);
expect(copy).toEqual({...source,scale:300,justification:'zero',vertices:[{x:0,y:1225},{x:6000,y:1225}]});
expect(wallFaces(copy)[1][0].y-wallFaces(source)[0][0].y).toBe(1000);
expect(parallelWall(source,0,1,300).vertices[0].y).toBe(225);
```
Also side -1 →y -1225, top →new center1150, bottom →1300, reversed and diagonal paths (rotate fixture and compare), coordinate translation around1e6, no input mutation and independent returned arrays.
- [ ] Run pnpm vitest run src/geometry/wallUtilities.test.ts; record actual RED. A missing module is setup RED; preserve an actual failing behavior assertion before implementing the relevant behavior.
- [ ] Implement validated physical center and unilateral miter shift; reuse wallFaces rather than generic offsetPolyline that may return arcs/chains. Validate source, output and global separation; cap work before pairwise operations. Specific error codes and messages; unexpected errors propagate.
- [ ] Test L source (0,0),(6000,0),(6000,4000), scale150: left clearance1000/thickness300 yields (0,1225),(4775,1225),(4775,4000). Closed CCW6000×4000 same offset yields inset corners (1225,1225),(4775,1225),(4775,2775),(1225,2775). Geometry remains straight and same order/orientation. Test full real face distances, not only returned center formula.
- [ ] Reject inward room collapse, U return width800 with clearance1000/thickness300, crossing/bowtie/nonadjacent collinear overlap, pathological ingletes/reversal, nonfinite/negative gap, invalid side/thickness/vertex limits. Zero allows material-boundary contact and forbids area overlap. Ensure global segments/caps and closed material rings cannot overlap through containment without edge crossing.
- [ ] Run focused geometry tests plus pnpm typecheck, pnpm lint, pnpm check:layers, git diff --check. Record commands/output/real REDGREEN and exact exports in task-1-report.md, self-review and commit only task source/tests/report. No full suite/browser/push/subagents.

## Task 2: Comandos, acceso visual y conservación nativa

**Files:** Create src/commands/wallUtilities.ts, src/commands/behavior/wallUtilities.test.ts, src/io/wallUtilities.test.ts, e2e/wallUtilities.spec.ts. Modify src/commands/architecture.ts, src/ui/ribbonConfig.ts, src/ui/paletteData.ts, src/ui/panels/ToolPalettesPanel.tsx and ArchitecturePanel.tsx with their focused tests as needed. Update src/app/features.ts, src/audit/evidence.ts, src/commands/behavior/evidence.ts, docs/FEATURES.md via generator, docs/arquitectura-muros.md, docs/yqarch/README.md, fix/features README/category and docs/brandbook evidence. Discover existing IO helper contracts by rg before reuse; no format implementation change.

**Interfaces:**
- Consumes approvedTask1 wallCenterAxis/parallelWall/WallUtilityError; readWallSource(doc,memberId):{source:WallAssemblySource,anchorId:Id,assembly:WallAssembly|null}; physicalSize(api,mm); CommandApi and native insertion/property helpers.
- Produces WALL_UTILITIES:CommandDef[] containing WALLAXIS alias EJEMURO, WALLOFFSET alias PARALELAMURO. Register once by architecture.ts existing ARCHITECTURE_COMMANDS array consumer; index.ts unchanged. No default WWA/WWO alias overrides. Standard lwpolyline / independent mline output; no new association/schema.

- [ ] Write runner RED for extraction from independent and associated member through complete source; axis centers for alljustifications, original entities/groups/styles byte-equivalent, new ID/order and layer/owner/properties, metadata excludes wall identities. One atomic undo/redo. Write RED for parallel positive/zero clear gap, thickness override, both sides, associated source cut retained and empty copy later accepts WALLDOOR. mm/m/unitless default1000 physical conversion verified.
- [ ] Implement flows exactly as spec: WALLAXIS entity→preview→keyword Intro. WALLOFFSET entity→distance1000mmdefault→point with Left/Right keywords→confirmationkeywords Gap/Thickness/Left/Right; nested distance inputs. Typed values in drawing units. Side point uses nearest physicalcenter segment, rejects axis-tolerance ambiguity, noSnap/noOrtho; previews adjoin original and use same builder. No document/style/group writes before final Intro.
- [ ] Stage-by-stage cancellation compares entities/styles/groups/history/version/dirty and cleared preview. Invalid source/limits/gap/collinear/group/lockedmember rejects with ES/EN actionable error. Interleave owner/layer/geometry/style/association changes after selection and before confirmation; reread all source/members/current anchor properties and compare original snapshot before apply, no writes on mismatch. Test every scope via actual CommandHarness and real doc. Catch only domain error classes.
- [ ] Native roundtrip standard axis/copy preserves physical geometry/properties and original association. DXF roundtrip retains center/real face distance; new objects require no additional warning, existing associated source still reports existing loss. No native version bump or DWG surface.
- [ ] Add actual bilingual Architecture ribbon/palette/panel actions Eje de muro/Wall axis and Muro paralelo/Parallel wall; existing tokens, accessiblebuttons and onStart closes phone sheet/focuses canvas. UI tests route real commands and Escape/current visible fields. No duplicate geometry in React. Add catalogue/evidence records truthful experimental untilcontrollerproof; create ARC-005 en curso, limits from spec explicit. Generate FEATURES, update guide/YQ delivery scoped row.
- [ ] Write four Chromium journeys in isolated desktop/true-mobile touchcontexts390×844, Día/Noche. Create source with opening, extract full axis and parallel emptywall, assert worldgeometry/physicalgap, original source/members unchanged, native preview and undo/redo/cancel. Sample actual rendered scene/overlay at calibrated line/face coordinates with grid off, quantitative contrast/alpha; frame all geometry clear of controls with native zoom, wait stable canvas and sheet animations. Six raw geometry/actions captures similaropening pattern, no synthetic/generated screenshots. Discovery only locally; controller runs actual GitHubActions and views originals.
- [ ] Run covering tests/types/lint/layers/features plus pnpm verify once before final source commit; no localbrowser. Report exactcommands/counts/REDGREEN and baselinewarnings. Commit source/report with ARC005stillinprogress. Root whole-task spec/quality review and fixloop precedes final browser/evidenceclosure. After actualCI+controllercaptureapproval originalwriter finalizes docs/assets/catalogue/backlog in separate evidencediff. No push/merge/subagents.
