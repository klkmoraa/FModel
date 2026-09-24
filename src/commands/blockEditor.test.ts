import { beforeAll, describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import type { BlockRecord } from '../document/types';
import { Editor } from '../editor/editor';
import { registerAllCommands } from './index';

beforeAll(() => registerAllCommands());

async function nextTurn() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('block editor commands', () => {
  it('does not leave a lookup table when BPARAMETER is cancelled at the label prompt', async () => {
    const editor = new Editor(createDocument());
    const block: BlockRecord = {
      id: 'blk-command-test',
      name: 'Command test',
      kind: 'normal',
      basePoint: { x: 0, y: 0 },
      description: '',
      units: 'mm',
      explodable: true,
      scaleUniformly: false,
      annotative: false,
      revision: 1,
    };
    editor.doc.transact('seed block', (tx) => tx.add('blocks', block));

    await editor.runner.execute('BEDIT', [block.name]);
    const parameter = editor.runner.execute('BPARAMETER', ['Lookup']);
    expect(editor.runner.pending?.req.kind).toBe('point');
    editor.runner.submitPoint({ x: 2, y: 3 });
    await nextTurn();
    expect(editor.runner.pending?.req.kind).toBe('string');

    editor.runner.cancel();
    await parameter;

    expect(editor.doc.data.blocks.get(block.id)?.dynamic?.lookups ?? []).toEqual([]);
    expect(editor.doc.history.inGroup).toBe(true);
    await editor.runner.execute('BCLOSE', ['Discard']);
  });

  it('rejects non-finite coordinates before adding a dynamic parameter', async () => {
    const editor = new Editor(createDocument());
    const block: BlockRecord = {
      id: 'blk-command-finite-test',
      name: 'Finite test',
      kind: 'normal',
      basePoint: { x: 0, y: 0 },
      description: '',
      units: 'mm',
      explodable: true,
      scaleUniformly: false,
      annotative: false,
      revision: 1,
    };
    editor.doc.transact('seed block', (tx) => tx.add('blocks', block));
    await editor.runner.execute('BEDIT', [block.name]);

    const parameter = editor.runner.execute('BPARAMETER', ['Point']);
    editor.runner.submitText('1e309,0');
    await nextTurn();
    if (editor.runner.pending?.req.kind === 'string') editor.runner.submitText('Position1');
    await parameter;

    expect(editor.doc.data.blocks.get(block.id)?.dynamic?.parameters ?? []).toEqual([]);
    expect(editor.runner.log.some((entry) => entry.kind === 'error' && /coordenadas|coordinates/i.test(entry.text))).toBe(true);
    await editor.runner.execute('BCLOSE', ['Discard']);
  });

  it('rejects a polar array angle that overflows during degree conversion', async () => {
    const editor = new Editor(createDocument());
    const rotation = {
      id: 'prm-rotation-test',
      type: 'rotation' as const,
      name: 'Rotation1',
      label: 'Rotation1',
      showInProperties: true,
      chainActions: false,
      gripCount: 1 as const,
      base: { x: 0, y: 0 },
      radius: 1,
      angle: 0,
      valueSet: { kind: 'none' as const },
    };
    const block: BlockRecord = {
      id: 'blk-command-angle-test',
      name: 'Angle test',
      kind: 'normal',
      basePoint: { x: 0, y: 0 },
      description: '',
      units: 'mm',
      explodable: true,
      scaleUniformly: false,
      annotative: false,
      revision: 1,
      dynamic: { parameters: [rotation], actions: [], constraints: [], lookups: [], variables: [], propertyOrder: [rotation.id] },
    };
    editor.doc.transact('seed block', (tx) => tx.add('blocks', block));
    await editor.runner.execute('BEDIT', [block.name]);

    const action = editor.runner.execute('BACTION', ['Array']);
    await nextTurn();
    expect(editor.runner.pending?.req.kind).toBe('selection');
    editor.runner.submitText('');
    await nextTurn();
    expect(editor.runner.pending?.req.kind).toBe('string');
    editor.runner.submitText('');
    await nextTurn();
    expect(editor.runner.pending?.req.kind).toBe('angle');
    editor.runner.submitText('1e308r');
    await action;

    expect(editor.doc.data.blocks.get(block.id)?.dynamic?.actions ?? []).toEqual([]);
    expect(editor.runner.log.some((entry) => entry.kind === 'error' && /ángulo|angle/i.test(entry.text))).toBe(true);
    await editor.runner.execute('BCLOSE', ['Discard']);
  });
});
