import { EVIDENCE_CATALOG } from '../../audit/evidence.ts';

export interface CommandEvidenceEntry {
  command: string;
  evidenceRef: string;
  testFile: string;
  testName: string;
  testCommand: string;
}

const categoryFor = (ref: string): string => ref.startsWith('BEH-DRAW') ? 'draw'
  : ref.startsWith('BEH-MODIFY') ? 'modify'
    : ref.startsWith('BEH-ANNOTATE') ? 'annotate'
      : ref.startsWith('BEH-MANAGEMENT') ? 'utility'
        : 'domain';

export const COMMAND_EVIDENCE_REGISTRY: Record<string, CommandEvidenceEntry> = Object.fromEntries(
  Object.entries(EVIDENCE_CATALOG).flatMap(([evidenceRef, record]) => (record.commands ?? []).map((command) => [command, {
    command,
    evidenceRef,
    testFile: record.testFile,
    testName: record.testName,
    testCommand: record.testCommand,
    category: categoryFor(evidenceRef),
  }]))
) as Record<string, CommandEvidenceEntry>;

export function getEvidenceForCommand(commandName: string): CommandEvidenceEntry | undefined {
  return COMMAND_EVIDENCE_REGISTRY[commandName.toUpperCase()];
}
