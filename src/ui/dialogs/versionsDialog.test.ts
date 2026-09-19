// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setServices } from '../../app/services';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import type { Persistence, VersionRecord } from '../../storage/persistence';
import { VersionsDialog } from './VersionsDialog';

// Habilita el entorno act para React 19 en jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('VersionsDialog: diferenciación entre lista vacía y error', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let editor: Editor;
  let versionsMock: ReturnType<typeof vi.fn>;
  let purgeAutoVersionsMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const doc = createDocument({ title: 'Prueba' });
    editor = new Editor(doc);
    editor.setPrefs({ lang: 'es' });

    versionsMock = vi.fn();
    purgeAutoVersionsMock = vi.fn(async () => 2);

    const persistenceMock = {
      health: { status: 'protected', lastSuccessAt: null, lastFailureAt: null, lastError: null, lastOp: null },
      onHealthChange: vi.fn(() => () => undefined),
      versions: versionsMock,
      purgeAutoVersions: purgeAutoVersionsMock,
      saveVersion: vi.fn(),
      deleteVersion: vi.fn(),
      loadVersion: vi.fn(),
    } as unknown as Persistence;

    setServices({
      editor,
      persistence: persistenceMock,
      fileHandle: null,
      openUi: vi.fn(),
      toast: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('diferencia lista vacía de error: muestra mensaje informativo cuando no hay versiones', async () => {
    versionsMock.mockResolvedValueOnce([]);

    await act(async () => {
      root.render(createElement(VersionsDialog, { editor, onClose: vi.fn(), onUi: vi.fn() }));
    });

    expect(container.textContent).toContain('Todavía no hay versiones de este dibujo');
    expect(container.textContent).not.toContain('Error al cargar');
    expect(container.querySelector('button[title*="Limpiar automáticas"]')).toBeNull();
  });

  it('diferencia lista vacía de error: muestra alerta de error y botón de reintentar ante fallo de IndexedDB', async () => {
    versionsMock.mockRejectedValueOnce(new Error('IndexedDB storage quota reached'));

    await act(async () => {
      root.render(createElement(VersionsDialog, { editor, onClose: vi.fn(), onUi: vi.fn() }));
    });

    expect(container.textContent).toContain('Error al cargar el historial de versiones: IndexedDB storage quota reached');
    expect(container.textContent).not.toContain('Todavía no hay versiones de este dibujo');

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Reintentar'));
    expect(retryBtn).toBeDefined();

    // Reintentar y recuperar
    versionsMock.mockResolvedValueOnce([]);
    await act(async () => {
      retryBtn?.click();
    });

    expect(container.textContent).toContain('Todavía no hay versiones de este dibujo');
    expect(container.textContent).not.toContain('Error al cargar el historial');
  });

  it('muestra el botón de purga automática cuando hay versiones automáticas y ejecuta purgeAutoVersions', async () => {
    const autoVer: VersionRecord = {
      id: 'v1',
      documentId: editor.doc.id,
      name: 'Prueba',
      label: 'Auto 1',
      savedAt: Date.now(),
      auto: true,
      entityCount: 1,
      bytes: new Uint8Array(),
    };
    versionsMock.mockResolvedValueOnce([autoVer]);
    vi.stubGlobal('confirm', () => true);

    await act(async () => {
      root.render(createElement(VersionsDialog, { editor, onClose: vi.fn(), onUi: vi.fn() }));
    });

    expect(container.textContent).toContain('Auto 1');
    const purgeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Limpiar automáticas'));
    expect(purgeBtn).toBeDefined();

    versionsMock.mockResolvedValueOnce([]);
    await act(async () => {
      purgeBtn?.click();
    });

    expect(purgeAutoVersionsMock).toHaveBeenCalledWith(0, editor.doc.id);
  });

  it('permite purgar versiones automáticas directamente desde el estado de error de carga', async () => {
    versionsMock.mockRejectedValueOnce(new Error('Quota full'));
    vi.stubGlobal('confirm', () => true);

    await act(async () => {
      root.render(createElement(VersionsDialog, { editor, onClose: vi.fn(), onUi: vi.fn() }));
    });

    expect(container.textContent).toContain('Error al cargar el historial de versiones: Quota full');
    const purgeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Limpiar automáticas'));
    expect(purgeBtn).toBeDefined();

    versionsMock.mockResolvedValueOnce([]);
    await act(async () => {
      purgeBtn?.click();
    });

    expect(purgeAutoVersionsMock).toHaveBeenCalledWith(0, editor.doc.id);
  });

  it('ofrece el botón de purga cuando la salud de almacenamiento está degradada aunque el dibujo actual no tenga automáticas', async () => {
    const manualVer: VersionRecord = {
      id: 'v1',
      documentId: editor.doc.id,
      name: 'Prueba',
      label: 'Manual 1',
      savedAt: Date.now(),
      auto: false,
      entityCount: 1,
      bytes: new Uint8Array(),
    };
    versionsMock.mockResolvedValueOnce([manualVer]);
    // Simular salud degradada
    const degradedPersistence = {
      health: { status: 'degraded', lastSuccessAt: null, lastFailureAt: Date.now(), lastError: { kind: 'quota', name: 'QuotaExceededError', message: 'Quota exceeded', raw: null }, lastOp: 'autosave' },
      onHealthChange: vi.fn(() => () => undefined),
      versions: versionsMock,
      purgeAutoVersions: purgeAutoVersionsMock,
      saveVersion: vi.fn(),
      deleteVersion: vi.fn(),
      loadVersion: vi.fn(),
    } as unknown as Persistence;

    setServices({
      editor,
      persistence: degradedPersistence,
      fileHandle: null,
      openUi: vi.fn(),
      toast: vi.fn(),
    });

    await act(async () => {
      root.render(createElement(VersionsDialog, { editor, onClose: vi.fn(), onUi: vi.fn() }));
    });

    expect(container.textContent).toContain('Manual 1');
    const purgeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Limpiar automáticas'));
    expect(purgeBtn).toBeDefined();
  });
});
