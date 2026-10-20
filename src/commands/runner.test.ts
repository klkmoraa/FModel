import { describe, expect, it, vi } from 'vitest';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import type { CommandDef } from './types';
import { LINE } from './draw/curves';

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


describe('CommandRunner visible feedback', () => {
  const numberCommand: CommandDef = {
    name: 'FEEDBACK_NUMBER_TEST', aliases: [], category: 'utility', readOnly: true,
    label: { es: 'Número', en: 'Number' }, description: { es: 'Número', en: 'Number' },
    async run(api) { await api.getNumber({ prompt: { es: 'Valor', en: 'Value' }, min: 1 }); },
  };

  it('retains rejected input until a valid response and replaces repeated errors by identity', async () => {
    const editor = new Editor(createDocument());
    const running = editor.runner.run(numberCommand);
    editor.runner.submitText('0');
    const first = editor.runner.feedback;
    expect(first?.kind).toBe('error');
    expect(first?.text).toContain('1');
    editor.runner.message('info', 'Still waiting');
    expect(editor.runner.feedback).toBe(first);
    editor.runner.submitText('0');
    expect(editor.runner.feedback?.text).toBe(first?.text);
    expect(editor.runner.feedback).not.toBe(first);
    editor.runner.submitText('2');
    await running;
    expect(editor.runner.feedback).toBeNull();
    expect(editor.doc.version).toBe(0);
  });

  it('keeps feedback through transparent commands and clears it when starting a normal command', async () => {
    const editor = new Editor(createDocument());
    editor.runner.message('warn', 'Check the drawing');
    const warning = editor.runner.feedback;
    expect(warning?.kind).toBe('warn');
    await editor.runner.run({ ...numberCommand, name: 'FEEDBACK_TRANSPARENT_TEST', transparent: true, run() {} });
    expect(editor.runner.feedback).toBe(warning);
    await editor.runner.run({ ...numberCommand, name: 'FEEDBACK_NEXT_TEST', run() {} });
    expect(editor.runner.feedback).toBeNull();
  });

  it('dismisses only the current notice without deleting its history or a newer error', () => {
    const editor = new Editor(createDocument());
    editor.runner.message('error', 'First problem');
    const first = editor.runner.feedback!;
    editor.runner.message('error', 'Second problem');
    const second = editor.runner.feedback!;
    expect(second?.text).toBe('Second problem');
    editor.runner.dismissFeedback(first);
    expect(editor.runner.feedback).toBe(second);
    editor.runner.dismissFeedback(second);
    expect(editor.runner.feedback).toBeNull();
    expect(editor.runner.log.map((entry) => entry.text)).toEqual(['First problem', 'Second problem']);
  });

  it('clears feedback after an entity response even when no input is echoed', async () => {
    const editor = new Editor(createDocument());
    const running = editor.runner.run({ ...numberCommand, async run(api) { await api.getEntity({ prompt: { es: 'Objeto', en: 'Object' } }); } });
    editor.runner.message('warn', 'Pick an object');
    expect(editor.runner.feedback?.kind).toBe('warn');
    editor.runner.submitEntity('picked-id', { x: 1, y: 2 });
    await running;
    expect(editor.runner.feedback).toBeNull();
  });

  it('clears feedback when the first valid distance point establishes a base', async () => {
    const editor = new Editor(createDocument());
    const running = editor.runner.run({ ...numberCommand, async run(api) { await api.getDistance({ prompt: { es: 'Distancia', en: 'Distance' } }); } });
    editor.runner.submitText('bad-distance');
    expect(editor.runner.feedback?.kind).toBe('error');
    editor.runner.submitPoint({ x: 0, y: 0 });
    expect(editor.runner.feedback).toBeNull();
    expect(editor.runner.pending?.req.kind).toBe('distance');
    editor.runner.submitPoint({ x: 10, y: 0 });
    await running;
  });

  it('does not clear the underlying notice when a transparent command accepts its own input', async () => {
    const editor = new Editor(createDocument());
    const underlying = editor.runner.run(numberCommand);
    editor.runner.submitText('0');
    const notice = editor.runner.feedback;
    const transparent = editor.runner.run({ ...numberCommand, name: 'FEEDBACK_NESTED_TEST', transparent: true });
    editor.runner.submitText('2');
    await transparent;
    expect(editor.runner.feedback).toBe(notice);
    editor.runner.submitText('3');
    await underlying;
    expect(editor.runner.feedback).toBeNull();
  });

  it('keeps stable notice identities when the bounded history discards old entries', () => {
    const editor = new Editor(createDocument());
    editor.runner.message('error', 'Same error');
    const first = editor.runner.feedback!;
    for (let i = 0; i < 501; i++) editor.runner.message('info', 'Background info');
    expect(editor.runner.log).toHaveLength(500);
    expect(editor.runner.feedback).toBe(first);
    editor.runner.message('error', 'Same error');
    expect(editor.runner.feedback?.id).toBeGreaterThan(first.id);
    expect(editor.runner.feedback?.text).toBe(first.text);
  });


  it.each(['warn', 'error'] as const)('attributes async %s to its originating command below a transparent command', async (kind) => {
    const editor = new Editor(createDocument());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const lower = editor.runner.run({ ...numberCommand, name: 'FEEDBACK_ASYNC_TEST', async run(api) {
        await gate;
        if (kind === 'error') throw new Error('Async problem');
        api.warn({ es: 'Problema asíncrono', en: 'Async problem' });
      } });
      const transparent = editor.runner.run({ ...numberCommand, name: 'FEEDBACK_ZOOM_TEST', transparent: true });
      release();
      await lower;
      const notice = editor.runner.feedback;
      expect(notice?.kind).toBe(kind);
      editor.runner.submitText('2');
      await transparent;
      expect(editor.runner.feedback).toBe(notice);
    } finally { silence.mockRestore(); }
  });

});

describe('CommandRunner last point fallback', () => {
  it('accepts Enter/Accept on fresh LINE without a last point or stack overflow', async () => {
    const editor = new Editor(createDocument()), version = editor.doc.version;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const done = editor.runner.run(LINE);
      expect(editor.runner.pending?.req.kind).toBe('point'); editor.runner.submitText(''); await done;
      expect(editor.runner.busy).toBe(false); expect(editor.runner.feedback).toBeNull();
      expect(editor.doc.data.entities.size).toBe(0); expect(editor.doc.version).toBe(version);
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
  });
  it('reads the global runner point when this active command has no point yet', async () => {
    const editor = new Editor(createDocument()); let observed: { x: number; y: number } | null | undefined;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const done = editor.runner.run({ name: 'LAST_POINT_FALLBACK_TEST', aliases: [], category: 'utility', readOnly: true,
        label: { es: 'Punto', en: 'Point' }, description: { es: 'Punto', en: 'Point' }, async run(api) {
          await api.getString({ prompt: { es: 'Continuar', en: 'Continue' } }); observed = api.lastPoint;
        } });
      editor.runner.lastPoint = { x: 6, y: 7 }; editor.runner.submitText(''); await done;
      expect(observed).toEqual({ x: 6, y: 7 }); expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
  });
});
