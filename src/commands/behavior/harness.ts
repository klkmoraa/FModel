import { createDocument } from '../../document/defaults';
import type { Entity, Id } from '../../document/types';
import { Editor } from '../../editor/editor';
import type { Vec2 } from '../../geometry/vec';
import { registerAllCommands } from '../index';
import { findCommand } from '../registry';

export interface DocSnapshot {
  entityCount: number;
  entityIds: Set<Id>;
  entities: Map<Id, Entity>;
  layerCount: number;
  layerIds: Set<Id>;
  dirty: boolean;
  activeTransaction: boolean;
  historyInGroup: boolean;
}

export interface CommandRunResult {
  ok: boolean;
  errors: string[];
  logs: string[];
  durationMs: number;
}

export class CommandHarness {
  editor: Editor;

  constructor(editor?: Editor) {
    registerAllCommands();
    this.editor = editor ?? new Editor(createDocument());
  }

  get doc() {
    return this.editor.doc;
  }

  get runner() {
    return this.editor.runner;
  }

  snapshot(): DocSnapshot {
    return {
      entityCount: this.doc.data.entities.size,
      entityIds: new Set(this.doc.data.entities.keys()),
      entities: new Map(this.doc.data.entities),
      layerCount: this.doc.data.layers.size,
      layerIds: new Set(this.doc.data.layers.keys()),
      dirty: this.doc.dirty,
      activeTransaction: !!this.doc.activeTransaction,
      historyInGroup: this.doc.history.inGroup,
    };
  }

  diff(before: DocSnapshot, after: DocSnapshot) {
    const addedIds: Id[] = [];
    const removedIds: Id[] = [];
    const modifiedIds: Id[] = [];

    for (const [id, entity] of after.entities) {
      if (!before.entities.has(id)) {
        addedIds.push(id);
      } else if (before.entities.get(id) !== entity) {
        modifiedIds.push(id);
      }
    }
    for (const id of before.entities.keys()) {
      if (!after.entities.has(id)) {
        removedIds.push(id);
      }
    }

    return {
      addedIds,
      removedIds,
      modifiedIds,
      netEntityChange: after.entityCount - before.entityCount,
      layerCountChange: after.layerCount - before.layerCount,
      dirtyChanged: before.dirty !== after.dirty,
    };
  }

  async run(name: string, inputs: (string | Vec2)[] = [], args?: string[]): Promise<CommandRunResult> {
    const start = performance.now();
    const logStart = this.runner.log.length;
    await this.runner.script(name, inputs, args);
    const durationMs = performance.now() - start;
    const newLogs = this.runner.log.slice(logStart);
    const errors = newLogs.filter((l) => l.kind === 'error').map((l) => l.text);
    return {
      ok: errors.length === 0,
      errors,
      logs: newLogs.map((l) => l.text),
      durationMs,
    };
  }

  select(...ids: Id[]) {
    this.editor.selection.set(ids);
  }

  clearSelection() {
    this.editor.selection.clear();
  }

  undo() {
    return this.doc.undo();
  }

  redo() {
    return this.doc.redo();
  }

  reset() {
    this.editor = new Editor(createDocument());
  }

  commandExists(name: string): boolean {
    return !!findCommand(name);
  }
}
