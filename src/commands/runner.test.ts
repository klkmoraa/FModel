import { describe, expect, it } from 'vitest';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import type { CommandDef } from './types';

describe('CommandRunner cancellation', () => {
  it('prevents an obsolete async command from applying changes after cancellation', async () => {
    const editor = new Editor(createDocument({ title: 'Actual' }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const delayed: CommandDef = {
      name: 'DELAYED_TEST',
      aliases: [],
      category: 'utility',
      label: { es: 'Anterior', en: 'Older' },
      description: { es: 'Anterior', en: 'Older' },
      async run(api) {
        await gate;
        api.apply('DELAYED_TEST', (tx) => tx.setSettings({ title: 'Obsoleto' }));
      },
    };
    const replacement: CommandDef = {
      name: 'REPLACEMENT_TEST',
      aliases: [],
      category: 'utility',
      label: { es: 'Reciente', en: 'Newer' },
      description: { es: 'Reciente', en: 'Newer' },
      run(api) {
        api.apply('REPLACEMENT_TEST', (tx) => tx.setSettings({ title: 'Reciente' }));
      },
    };

    const pending = editor.runner.run(delayed);
    await editor.runner.run(replacement);
    release();
    await pending;

    expect(editor.doc.settings.title).toBe('Reciente');
    expect(editor.doc.history.peekUndo()?.label).toBe('Newer');
    expect(editor.doc.history.inGroup).toBe(false);
  });

  it('does not let an obsolete command clear the preview of its replacement', async () => {
    const editor = new Editor(createDocument());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const delayed: CommandDef = {
      name: 'DELAYED_UI_TEST',
      aliases: [],
      category: 'utility',
      label: { es: 'Anterior', en: 'Older' },
      description: { es: 'Anterior', en: 'Older' },
      readOnly: true,
      async run() {
        await gate;
      },
    };
    const replacement: CommandDef = {
      name: 'REPLACEMENT_UI_TEST',
      aliases: [],
      category: 'utility',
      label: { es: 'Reciente', en: 'Newer' },
      description: { es: 'Reciente', en: 'Newer' },
      readOnly: true,
      async run(api) {
        api.setPreview({ hint: 'preview vigente' });
        await api.getString({ prompt: { es: 'Valor', en: 'Value' } });
      },
    };

    const older = editor.runner.run(delayed);
    const newer = editor.runner.run(replacement);
    expect(editor.runner.pending).not.toBeNull();
    expect(editor.preview?.hint).toBe('preview vigente');

    release();
    await older;

    expect(editor.preview?.hint).toBe('preview vigente');
    editor.runner.cancel();
    await newer;
  });
});
