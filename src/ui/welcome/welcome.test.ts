import { describe, expect, it, vi } from 'vitest';
import { FILE_COMMANDS } from '../../commands/file';

describe('Pantalla de bienvenida FModel (FS-M01)', () => {
  it('el comando HOME/INICIO está registrado en FILE_COMMANDS y dispara la interfaz de bienvenida', async () => {
    const homeCmd = FILE_COMMANDS.find((c) => c.name === 'HOME');
    expect(homeCmd).toBeDefined();
    expect(homeCmd?.aliases).toContain('INICIO');
    expect(homeCmd?.aliases).toContain('BIENVENIDA');
    expect(homeCmd?.aliases).toContain('START');

    const target = new EventTarget();
    (globalThis as any).window = target;
    (globalThis as any).CustomEvent = class CustomEvent extends Event {
      detail: any;
      constructor(type: string, params: any = {}) {
        super(type, params);
        this.detail = params.detail;
      }
    };

    const handler = vi.fn();
    target.addEventListener('fmodel:ui', handler);
    await homeCmd?.run({} as any);
    expect(handler).toHaveBeenCalled();
    const eventDetail = (handler.mock.calls[0][0] as any).detail;
    expect(eventDetail.ui).toBe('welcome');
    delete (globalThis as any).window;
  });

  it('openStoredDrawing y openTemplate limpian fileHandle y sincronizan ctx.fileName', async () => {
    const { setServices, getServices } = await import('../../app/services');
    const { createDocument } = await import('../../document/defaults');
    const { Editor } = await import('../../editor/editor');
    const { writePackage } = await import('../../io/native');
    const { TEMPLATES_CATALOG } = await import('../../templates');
    const { openStoredDrawing, openTemplate } = await import('./actions');

    const doc = createDocument({ title: 'Origen' });
    const editor = new Editor(doc);
    let currentHandle: any = { name: 'archivo-local.fmodel' };
    setServices({
      editor,
      persistence: {} as any,
      get fileHandle() { return currentHandle; },
      set fileHandle(val) { currentHandle = val; },
      openUi: vi.fn(),
      toast: vi.fn(),
    });

    const bytes = writePackage(doc.data, doc.id);
    openStoredDrawing(editor, {
      id: doc.id,
      name: 'dibujo-guardado.fmodel',
      savedAt: Date.now(),
      bytes,
      size: bytes.length,
    });

    expect(getServices().fileHandle).toBeNull();
    expect(editor.fileName).toBe('dibujo-guardado');
    expect(editor.ctx.fileName).toBe('dibujo-guardado.fmodel');

    currentHandle = { name: 'otro-local.fmodel' };
    openTemplate(editor, TEMPLATES_CATALOG[0]);

    expect(getServices().fileHandle).toBeNull();
    expect(editor.ctx.fileName).toBe(TEMPLATES_CATALOG[0].name[editor.lang]);
  });
});
