/**
 * Evidencia ejecutable del producto. Cada entrada apunta a un archivo de prueba real,
 * a un marcador que debe existir en ese archivo y al comando que la CI ejecuta.
 * No es una lista de etiquetas: el script de documentación y Vitest verifican sus rutas.
 */
export interface EvidenceRecord {
  kind: 'unit' | 'integration' | 'e2e' | 'manual';
  testFile: string;
  testName: string;
  testCommand: string;
  commands?: string[];
}

export const EVIDENCE_CATALOG: Record<string, EvidenceRecord> = {
  'IO-TABLE-CSV': {
    kind: 'unit', testFile: 'src/io/tableCsv.test.ts', testName: 'exports UTF-8 Excel CSV', testCommand: 'pnpm vitest run src/io/tableCsv.test.ts',
  },
  'BEH-TABLE-CSV': {
    kind: 'unit', testFile: 'src/commands/behavior/tableCsv.test.ts', testName: 'exports the actual selected table', testCommand: 'pnpm vitest run src/commands/behavior/tableCsv.test.ts', commands: ['TABLECSV'],
  },
  'E2E-OPENING-SCHEDULE': {
    kind: 'e2e', testFile: 'e2e/openingSchedule.spec.ts', testName: 'opening schedule real placement and CSV in Day/Night', testCommand: 'pnpm exec playwright test e2e/openingSchedule.spec.ts',
  },
  'UI-OPENING-SCHEDULE': {
    kind: 'integration', testFile: 'src/ui/panels/openingScheduleAccess.test.ts', testName: 'opening schedule native access',
    testCommand: 'pnpm vitest run src/ui/panels/openingScheduleAccess.test.ts', commands: ['OPENINGSCHEDULE', 'TABLECSV'],
  },
  'BEH-OPENING-SCHEDULE': {
    kind: 'unit', testFile: 'src/commands/behavior/openingSchedule.test.ts', testName: 'opening schedule groups once per assembly',
    testCommand: 'pnpm vitest run src/commands/behavior/openingSchedule.test.ts', commands: ['OPENINGSCHEDULE'],
  },
  'BEH-WALL-CLEANUP': {
    kind: 'unit', testFile: 'src/commands/behavior/wallCleanup.test.ts', testName: 'previews a T + native column + door wall',
    testCommand: 'pnpm vitest run src/commands/behavior/wallCleanup.test.ts', commands: ['WALLCLEAN', 'WALLRESTORE'],
  },
  'GEO-WALL-CLEANUP': {
    kind: 'unit', testFile: 'src/geometry/wallCleanup.test.ts', testName: 'native wall face cleanup',
    testCommand: 'pnpm vitest run src/geometry/wallCleanup.test.ts',
  },
  'IO-WALL-CLEANUP': {
    kind: 'integration', testFile: 'src/io/wallCleanup.test.ts', testName: 'native roundtrip retains recovery',
    testCommand: 'pnpm vitest run src/io/wallCleanup.test.ts',
  },
  'UI-WALL-CLEANUP': {
    kind: 'integration', testFile: 'src/ui/panels/wallCleanupAccess.test.ts', testName: 'cleanup and restore native access in ES/EN',
    testCommand: 'pnpm vitest run src/ui/panels/wallCleanupAccess.test.ts',
  },
  'E2E-WALL-CLEANUP': {
    kind: 'e2e', testFile: 'e2e/wallCleanup.spec.ts', testName: 'Wall cleanup: reversible native snapshots and real access',
    testCommand: 'pnpm exec playwright test e2e/wallCleanup.spec.ts',
  },
  'BEH-WALL-FILL': {
    kind: 'unit', testFile: 'src/commands/behavior/wallFill.test.ts', testName: 'selected_material_and_dedup',
    testCommand: 'pnpm vitest run src/commands/behavior/wallFill.test.ts', commands: ['WALLFILL'],
  },
  'GEO-WALL-FILL': {
    kind: 'unit', testFile: 'src/geometry/wallFill.test.ts', testName: 'native material fill geometry',
    testCommand: 'pnpm vitest run src/geometry/wallFill.test.ts',
  },
  'IO-WALL-FILL': {
    kind: 'integration', testFile: 'src/io/wallFill.test.ts', testName: 'wall fill native and DXF roundtrip',
    testCommand: 'pnpm vitest run src/io/wallFill.test.ts',
  },
  'UI-WALL-FILL': {
    kind: 'integration', testFile: 'src/ui/panels/architecturePanel.test.ts', testName: 'wall fill action routes the native flow',
    testCommand: 'pnpm vitest run src/ui/panels/architecturePanel.test.ts src/ui/panels/wallFillAccess.test.ts',
  },
  'E2E-WALL-FILL': {
    kind: 'e2e', testFile: 'e2e/wallFill.spec.ts', testName: 'Architectural wall fill: material snapshots and native controls',
    testCommand: 'pnpm exec playwright test e2e/wallFill.spec.ts',
  },

  'BEH-WALL-UTILITIES': {
    kind: 'unit', testFile: 'src/commands/behavior/wallUtilities.test.ts', testName: 'extracts a full physical axis',
    testCommand: 'pnpm vitest run src/commands/behavior/wallUtilities.test.ts', commands: ['WALLAXIS', 'WALLOFFSET'],
  },
  'GEO-WALL-UTILITIES': {
    kind: 'unit', testFile: 'src/geometry/wallUtilities.test.ts', testName: 'physical wall axis',
    testCommand: 'pnpm vitest run src/geometry/wallUtilities.test.ts',
  },
  'IO-WALL-UTILITIES': {
    kind: 'integration', testFile: 'src/io/wallUtilities.test.ts', testName: 'wall utilities retain native standard geometry',
    testCommand: 'pnpm vitest run src/io/wallUtilities.test.ts',
  },
  'UI-WALL-UTILITIES': {
    kind: 'integration', testFile: 'src/ui/panels/architecturePanel.test.ts', testName: 'wall utility actions route through native prompts',
    testCommand: 'pnpm vitest run src/ui/panels/architecturePanel.test.ts',
  },
  'E2E-WALL-UTILITIES': {
    kind: 'e2e', testFile: 'e2e/wallUtilities.spec.ts', testName: 'Wall utilities: physical axis and clear gap',
    testCommand: 'pnpm test:e2e -- e2e/wallUtilities.spec.ts',
  },
  'BEH-OPENINGS': {
    kind: 'unit', testFile: 'src/commands/behavior/openingLifecycle.test.ts', testName: 'two doors, move repairs old gap',
    testCommand: 'pnpm vitest run src/commands/behavior/openingLifecycle.test.ts',
    commands: ['OPENINGMOVE', 'OPENINGCOPY', 'OPENINGEDIT', 'OPENINGMIRROR', 'OPENINGDELETE', 'WALLTHICKNESS'],
  },
  'GEO-OPENINGS': {
    kind: 'unit', testFile: 'src/geometry/wallOpenings.test.ts', testName: 'wall opening geometry',
    testCommand: 'pnpm vitest run src/geometry/wallOpenings.test.ts',
  },
  'IO-OPENINGS': {
    kind: 'integration', testFile: 'src/io/wallAssembly.test.ts', testName: 'wall assembly interchange',
    testCommand: 'pnpm vitest run src/io/wallAssembly.test.ts',
  },
  'UI-OPENINGS': {
    kind: 'integration', testFile: 'src/ui/panels/architecturePanel.test.ts', testName: 'opening lifecycle actions start native commands',
    testCommand: 'pnpm vitest run src/ui/panels/architecturePanel.test.ts src/render/openingPreview.test.ts',
  },
  'E2E-OPENINGS': {
    kind: 'e2e', testFile: 'e2e/openingLifecycle.spec.ts', testName: 'Associated opening lifecycle: room geometry and controls',
    testCommand: 'pnpm test:e2e -- e2e/openingLifecycle.spec.ts',
  },
  'UI-COMPONENTS': {
    kind: 'integration', testFile: 'src/ui/panels/architecturePanel.test.ts', testName: 'invalid Place/Edit retains fields and errors without starting the real runner',
    testCommand: 'pnpm vitest run src/ui/panels/architecturePanel.test.ts src/ui/panels/architectureForm.test.ts src/editor/workspaceChrome.test.ts src/commands/architecturePanel.test.ts',
    commands: ['ARCHITECTURE'],
  },
  'E2E-COMPONENTS': {
    kind: 'e2e', testFile: 'e2e/componentsJourneys.spec.ts', testName: 'Construction components: native panel journeys',
    testCommand: 'pnpm test:e2e -- e2e/componentsJourneys.spec.ts',
  },
  'BEH-COMPONENTS': {
    kind: 'unit', testFile: 'src/commands/behavior/components.test.ts', testName: 'construction command behavior',
    testCommand: 'pnpm vitest run src/commands/behavior/components.test.ts',
    commands: ['COLUMN', 'AXISGRID', 'STAIRPLAN', 'STAIRSECTION', 'ESCALATOR', 'LIFTPLAN', 'DOORELEVATION', 'DOORSECTION', 'WINDOWELEVATION', 'WINDOWSECTION', 'BAYWINDOWSECTION', 'CURTAINWALL', 'GLASSPARTITION', 'BANISTER', 'COMPONENTEDIT'],
  },
  'GEO-COMPONENTS': {
    kind: 'unit', testFile: 'src/geometry/architecture/components.test.ts', testName: 'construction geometry',
    testCommand: 'pnpm vitest run src/geometry/architecture/components.test.ts',
  },
  'IO-COMPONENTS': {
    kind: 'integration', testFile: 'src/io/components.test.ts', testName: 'component native and DXF round trip',
    testCommand: 'pnpm vitest run src/io/components.test.ts',
  },
  'BEH-ARCHITECTURE': {
    kind: 'unit', testFile: 'src/commands/behavior/architecture.test.ts',
    testName: 'Comportamiento de Comandos — Arquitectura (ARC-002)',
    testCommand: 'pnpm vitest run src/commands/behavior/architecture.test.ts',
    commands: ['WALL', 'WALLRECT', 'WALLCONVERT', 'WALLDOOR', 'WALLWINDOW'],
  },
  'GEO-WALLS': {
    kind: 'unit', testFile: 'src/geometry/walls.test.ts', testName: 'wall geometry',
    testCommand: 'pnpm vitest run src/geometry/walls.test.ts',
  },
  'IO-ARCHITECTURE': {
    kind: 'integration', testFile: 'src/io/architecture.test.ts', testName: 'architecture native and DXF round trip',
    testCommand: 'pnpm vitest run src/io/architecture.test.ts',
  },
  'E2E-CRITICAL-JOURNEYS': {
    kind: 'e2e',
    testFile: 'e2e/criticalJourneys.spec.ts',
    testName: 'Recorridos críticos E2E',
    testCommand: 'pnpm test:e2e',
  },
  'BEH-DRAW': {
    kind: 'unit',
    testFile: 'src/commands/behavior/draw.test.ts',
    testName: 'Comportamiento de Comandos — Dibujo',
    testCommand: 'pnpm vitest run src/commands/behavior/draw.test.ts',
    commands: ['LINE', 'PLINE', 'CIRCLE', 'ARC', 'RECTANG', 'POINT', 'RAY', 'XLINE', 'POLYGON', 'ELLIPSE', 'DONUT', 'REVCLOUD', 'REGION'],
  },
  'BEH-MODIFY': {
    kind: 'unit',
    testFile: 'src/commands/behavior/modify.test.ts',
    testName: 'Comportamiento de Comandos — Modificación',
    testCommand: 'pnpm vitest run src/commands/behavior/modify.test.ts',
    commands: ['ERASE', 'OOPS', 'MOVE', 'COPY', 'ROTATE', 'SCALE', 'MIRROR', 'FILLET', 'EXPLODE'],
  },
  'BEH-ANNOTATE': {
    kind: 'unit',
    testFile: 'src/commands/behavior/annotate.test.ts',
    testName: 'Comportamiento de Comandos — Anotación',
    testCommand: 'pnpm vitest run src/commands/behavior/annotate.test.ts',
    commands: ['TEXT', 'MTEXT', 'DIMLINEAR', 'DIMALIGNED', 'MLEADER'],
  },
  'BEH-MANAGEMENT': {
    kind: 'unit',
    testFile: 'src/commands/behavior/management.test.ts',
    testName: 'Comportamiento de Comandos — Gestión',
    testCommand: 'pnpm vitest run src/commands/behavior/management.test.ts',
    commands: ['DIST', 'AREA', 'ID', 'LAYON', 'LAYOFF', 'LAYTHW', 'LAYFRZ', 'AUDIT'],
  },
  'BEH-REFERENCES': {
    kind: 'unit',
    testFile: 'src/xref/xref.test.ts',
    testName: 'external references',
    testCommand: 'pnpm vitest run src/xref/xref.test.ts',
  },
  'BEH-LIBRARY': {
    kind: 'unit',
    testFile: 'src/blocks/libraryArchive.test.ts',
    testName: 'archivo .fmodellib',
    testCommand: 'pnpm vitest run src/blocks/libraryArchive.test.ts',
  },
  'BEH-FILE': {
    kind: 'integration',
    testFile: 'src/storage/fileAccess.test.ts',
    testName: 'saveFile',
    testCommand: 'pnpm vitest run src/storage/fileAccess.test.ts',
  },
  'GEO-INVARIANTS': {
    kind: 'unit',
    testFile: 'src/geometry/invariants.test.ts',
    testName: 'Invariantes geométricas y entradas degeneradas',
    testCommand: 'pnpm vitest run src/geometry/invariants.test.ts',
  },
  'GEO-CURVES': {
    kind: 'unit',
    testFile: 'src/geometry/geometry.test.ts',
    testName: 'curves',
    testCommand: 'pnpm vitest run src/geometry/geometry.test.ts',
  },
  'SOLVER-CONSTRAINTS': {
    kind: 'unit',
    testFile: 'src/constraints/solver.test.ts',
    testName: 'restricciones geométricas',
    testCommand: 'pnpm vitest run src/constraints/solver.test.ts',
  },
  'BEH-PRODUCTION': {
    kind: 'unit',
    testFile: 'src/commands/behavior/production.test.ts',
    testName: 'Comportamiento de Comandos — Producción de planos',
    testCommand: 'pnpm vitest run src/commands/behavior/production.test.ts',
    commands: ['QDIM', 'DIMSPACE', 'DIMBREAK', 'CENTERMARK', 'CENTERLINE', 'BLEND', 'COPYTOLAYER', 'LAYWALK', 'TXT2MTXT', 'TEXTALIGN', 'MASSPROP', 'COPYBASE', 'PASTEORIG', 'PASTEBLOCK'],
  },
  'GEO-MASSPROP': {
    kind: 'unit',
    testFile: 'src/geometry/massprops.test.ts',
    testName: 'propiedades de masa (MASSPROP)',
    testCommand: 'pnpm vitest run src/geometry/massprops.test.ts',
  },
  'GEO-BLEND': {
    kind: 'unit',
    testFile: 'src/geometry/blend.test.ts',
    testName: 'curvas de enlace (BLEND)',
    testCommand: 'pnpm vitest run src/geometry/blend.test.ts',
  },
  'ANNOT-LAYOUT': {
    kind: 'unit',
    testFile: 'src/annotation/dimLayout.test.ts',
    testName: 'cotas rápidas',
    testCommand: 'pnpm vitest run src/annotation/dimLayout.test.ts',
  },
  'PARAMETRIC-MODEL': {
    kind: 'unit',
    testFile: 'src/constraints/drawing.test.ts',
    testName: 'reactor de restricciones',
    testCommand: 'pnpm vitest run src/constraints/drawing.test.ts',
  },
  'BEH-PARAMETRIC': {
    kind: 'unit',
    testFile: 'src/commands/behavior/constraints.test.ts',
    testName: 'Comportamiento de Comandos — Diseño paramétrico',
    testCommand: 'pnpm vitest run src/commands/behavior/constraints.test.ts',
    commands: ['GEOMCONSTRAINT', 'GCPARALLEL', 'GCCOINCIDENT', 'GCHORIZONTAL', 'GCFIX', 'DIMCONSTRAINT', 'AUTOCONSTRAIN', 'DELCONSTRAINT', 'CONSTRAINTBAR', 'CONSTRAINTINFER', 'PARAMEDIT'],
  },
  'IO-CLIPBOARD': {
    kind: 'integration',
    testFile: 'src/io/clipboard.test.ts',
    testName: 'portapapeles portable',
    testCommand: 'pnpm vitest run src/io/clipboard.test.ts',
  },
  'IO-DXF': {
    kind: 'integration',
    testFile: 'src/io/dxf/importDxf.test.ts',
    testName: 'importación de DXF',
    testCommand: 'pnpm vitest run src/io/dxf/importDxf.test.ts',
  },
  'IO-NATIVE': {
    kind: 'integration',
    testFile: 'src/io/native.test.ts',
    testName: 'formato nativo',
    testCommand: 'pnpm vitest run src/io/native.test.ts',
  },
  'STORAGE-PERSISTENCE': {
    kind: 'integration',
    testFile: 'src/storage/persistence.test.ts',
    testName: 'operación atómica dibujo + versión',
    testCommand: 'pnpm vitest run src/storage/persistence.test.ts',
  },
  'WORKER-ASYNC': {
    kind: 'integration',
    testFile: 'src/workers/client.test.ts',
    testName: 'heavy operations client',
    testCommand: 'pnpm vitest run src/workers/client.test.ts',
  },
  'RENDER-CANVAS': {
    kind: 'unit',
    testFile: 'src/output/output.test.ts',
    testName: 'vector output',
    testCommand: 'pnpm vitest run src/output/output.test.ts',
  },
  'SPATIAL-INDEX': {
    kind: 'unit',
    testFile: 'src/selection/selection.test.ts',
    testName: 'índice espacial',
    testCommand: 'pnpm vitest run src/selection/selection.test.ts',
  },
  'UI-TOUCH-MATRIX': {
    kind: 'integration',
    testFile: 'src/ui/touchGesture.test.ts',
    testName: 'TouchGestureController (UI-002)',
    testCommand: 'pnpm vitest run src/ui/touchGesture.test.ts',
  },
  'UI-A11Y': {
    kind: 'e2e',
    testFile: 'e2e/criticalJourneys.spec.ts',
    testName: 'Recorridos críticos E2E',
    testCommand: 'pnpm test:e2e',
  },
  'PWA-SW': {
    kind: 'integration',
    testFile: 'src/pwa/serviceWorker.test.ts',
    testName: 'service worker',
    testCommand: 'pnpm vitest run src/pwa/serviceWorker.test.ts',
  },
  'DWG-EXPERIMENTAL': {
    kind: 'integration',
    testFile: 'src/io/dwg/readDwg.test.ts',
    testName: 'DWG',
    testCommand: 'pnpm vitest run src/io/dwg/readDwg.test.ts',
  },
};

export function getEvidence(ref: string): EvidenceRecord | undefined {
  return EVIDENCE_CATALOG[ref];
}

export function evidenceCommands(command: string): string[] {
  return Object.values(EVIDENCE_CATALOG)
    .filter((record) => record.commands?.includes(command.toUpperCase()))
    .map((record) => record.testFile);
}
