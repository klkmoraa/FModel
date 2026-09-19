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
