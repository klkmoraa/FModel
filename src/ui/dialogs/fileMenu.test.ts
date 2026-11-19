// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getServices, setServices } from '../../app/services';
import { FILE_COMMANDS } from '../../commands/file';
import type { CommandApi, L10n } from '../../commands/types';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { readPackage, writePackage } from '../../io/native';
import type { FileHandle } from '../../storage/fileAccess';
import type { DrawingSnapshot, Persistence, StoredDrawing } from '../../storage/persistence';
import { ConfirmHost } from '../ConfirmHost';
import { FileMenu } from './FileMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function localFile(name: string) {
  const writes: Blob[] = [];
  const handle: FileHandle = {
    name,
    getFile: async () => new File([], name),
    createWritable: async () => ({
      write: async (data) => {
        if (!(data instanceof Blob)) throw new Error('Expected a native drawing Blob');
        writes.push(data);
      },
      close: async () => undefined,
    }),
  };
  return { handle, writes };
}

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('FileMenu: apertura segura de dibujos guardados', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let editor: Editor;
  let drawing: StoredDrawing;
  let storedDrawings: StoredDrawing[];
  let previousFile: ReturnType<typeof localFile>;
  let onClose: () => void;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    editor = new Editor(createDocument({ title: 'Original' }));
    editor.setPrefs({ lang: 'es' });
    editor.fileName = 'Original';
    editor.ctx.fileName = 'Original.fmodel';
    previousFile = localFile('Original.fmodel');
    onClose = vi.fn();

    const stored = createDocument({ title: 'Guardado' });
    const bytes = writePackage(stored.data, stored.id);
    drawing = { id: stored.id, name: 'Guardado.FMODEL', savedAt: 1, bytes, size: bytes.length };
    storedDrawings = [drawing];
    const persistence = {
      drawings: async () => [...storedDrawings],
      deleteDrawing: async (id: string) => { storedDrawings = storedDrawings.filter((item) => item.id !== id); },
      storeDrawingAndVersion: async (name: string, label: string, snapshot: DrawingSnapshot) => ({
        drawing: { id: snapshot.documentId, name, savedAt: 2, bytes: snapshot.bytes, size: snapshot.bytes.length },
        version: { id: 'version', documentId: snapshot.documentId, name, label, savedAt: 2, auto: false, entityCount: snapshot.entityCount, bytes: snapshot.bytes },
      }),
      markCleanExit: async () => undefined,
    } as unknown as Persistence;
    setServices({ editor, persistence, fileHandle: previousFile.handle, openUi: vi.fn(), toast: vi.fn() });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
    vi.restoreAllMocks();
  });

  const button = (text: string) => {
    const found = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(text));
    expect(found, `button ${text}`).toBeDefined();
    return found!;
  };

  const renderMenu = () => act(async () => {
    root.render(createElement(Fragment, null,
      createElement(FileMenu, { editor, onClose, onUi: vi.fn() }),
      createElement(ConfirmHost, { lang: editor.lang }),
    ));
  });

  it('QSAVE pide un destino nuevo y no escribe sobre el archivo del dibujo anterior', async () => {
    await renderMenu();
    await act(async () => button(drawing.name).click());

    const destination = localFile('Guardado.fmodel');
    const picker = vi.fn(async () => destination.handle);
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: picker });
    const api = { editor, t: (message: L10n) => message.es, info: vi.fn(), warn: vi.fn() } as unknown as CommandApi;
    await FILE_COMMANDS.find((command) => command.name === 'QSAVE')!.run(api);

    expect(previousFile.writes).toHaveLength(0);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Guardado.fmodel' }));
    expect(destination.writes).toHaveLength(1);
    const saved = readPackage(await readBlob(destination.writes[0]));
    expect(saved.documentId).toBe(drawing.id);
    expect(saved.data.settings.title).toBe('Guardado');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sincroniza el nombre visible y el contexto al abrir una extensión en mayúsculas', async () => {
    await renderMenu();
    await act(async () => button(drawing.name).click());

    expect(editor.fileName).toBe('Guardado');
    expect(editor.ctx.fileName).toBe('Guardado.FMODEL');
    expect(getServices().fileHandle).toBeNull();
  });

  it.each(['es', 'en'] as const)('conserva dibujo, historial y destino y muestra el fallo de un archivo dañado (%s)', async (lang) => {
    editor.setPrefs({ lang });
    editor.doc.transact('Edición pendiente', (tx) => tx.setSettings({ title: 'Edición pendiente' }));
    const before = { data: editor.doc.data, id: editor.doc.id, version: editor.doc.version, dirty: editor.doc.dirty };
    drawing.bytes = new Uint8Array([0, 1, 2]);
    drawing.size = drawing.bytes.length;
    await renderMenu();
    await act(async () => button(drawing.name).click());
    await act(async () => button(lang === 'es' ? 'Descartar y continuar' : 'Discard and continue').click());

    expect(editor.doc.data).toBe(before.data);
    expect(editor.doc.id).toBe(before.id);
    expect(editor.doc.version).toBe(before.version);
    expect(editor.doc.dirty).toBe(before.dirty);
    expect(editor.doc.history.canUndo()).toBe(true);
    expect(editor.fileName).toBe('Original');
    expect(editor.ctx.fileName).toBe('Original.fmodel');
    expect(getServices().fileHandle).toBe(previousFile.handle);
    expect(onClose).not.toHaveBeenCalled();
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain(drawing.name);
    expect(alert?.textContent).toContain(lang === 'es' ? 'No se pudo abrir' : 'Could not open');
  });

  it('distingue la consulta pendiente de un resultado vacío', async () => {
    const pending = deferred<StoredDrawing[]>();
    vi.spyOn(getServices().persistence, 'drawings').mockReturnValueOnce(pending.promise);
    await renderMenu();

    expect(container.querySelector('[role="status"]')?.textContent).toContain('Consultando');
    expect(container.textContent).not.toContain('Aún no hay dibujos');

    await act(async () => pending.resolve([]));

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain('Aún no hay dibujos guardados localmente');
  });

  it.each(['es', 'en'] as const)('explica un fallo de lectura y permite reintentar sin anunciar una lista vacía (%s)', async (lang) => {
    editor.setPrefs({ lang });
    vi.spyOn(getServices().persistence, 'drawings').mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    await renderMenu();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(lang === 'es' ? 'No se pudieron consultar' : 'Could not load');
    expect(container.textContent).not.toContain(lang === 'es' ? 'Aún no hay dibujos' : 'No locally stored drawings');

    await act(async () => button(lang === 'es' ? 'Reintentar' : 'Retry').click());

    expect(button(drawing.name)).toBeDefined();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(['es', 'en'] as const)('conserva la fila y el documento si falla la eliminación confirmada (%s)', async (lang) => {
    editor.setPrefs({ lang });
    const before = editor.doc.data;
    vi.spyOn(getServices().persistence, 'deleteDrawing').mockRejectedValueOnce(new Error('Delete failed'));
    await renderMenu();
    const remove = container.querySelector<HTMLButtonElement>(`button[aria-label*="${drawing.name}"]`)!;
    await act(async () => remove.click());
    await act(async () => button(lang === 'es' ? 'Eliminar' : 'Delete').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(lang === 'es' ? 'No se pudo eliminar' : 'Could not delete');
    expect(button(drawing.name)).toBeDefined();
    expect(editor.doc.data).toBe(before);
    expect(getServices().fileHandle).toBe(previousFile.handle);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('informa una eliminación pendiente y retira la fila sólo cuando se completa', async () => {
    const pending = deferred<void>();
    const deleteDrawing = getServices().persistence.deleteDrawing;
    vi.spyOn(getServices().persistence, 'deleteDrawing').mockImplementationOnce(async (id) => {
      await pending.promise;
      await deleteDrawing(id);
    });
    await renderMenu();
    const remove = container.querySelector<HTMLButtonElement>(`button[aria-label*="${drawing.name}"]`)!;
    await act(async () => remove.click());
    await act(async () => button('Eliminar').click());

    expect(button(drawing.name).disabled).toBe(true);
    expect(remove.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Eliminando');

    await act(async () => pending.resolve());

    expect(container.textContent).not.toContain(drawing.name);
    expect(container.textContent).toContain('Aún no hay dibujos guardados localmente');
  });

  it.each([['es', 'ene'], ['en', 'Jan']] as const)('presenta una fecha secundaria legible en el idioma elegido (%s)', async (lang, month) => {
    editor.setPrefs({ lang });
    drawing.savedAt = Date.UTC(2026, 0, 15, 12, 0);
    await renderMenu();

    const time = button(drawing.name).querySelector('time');
    expect(time?.dateTime).toBe('2026-01-15T12:00:00.000Z');
    expect(time?.textContent).toContain(month);
  });
});
