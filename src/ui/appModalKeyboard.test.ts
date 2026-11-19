// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setServices } from '../app/services';
import { createDocument, entityDefaults } from '../document/defaults';
import type { LineEntity } from '../document/types';
import { Editor } from '../editor/editor';
import { Persistence } from '../storage/persistence';
import { App } from './App';
import { confirmDiscard } from './welcome/actions';

// Las miniaturas requieren Canvas; no intervienen en la ruta de teclado de App.
vi.mock('./welcome/templatePreview', () => ({ useDocumentPreview: () => '', useTemplatePreview: () => '' }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('App: teclado de confirmaciones independientes', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let editor: Editor;

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    window.history.replaceState(null, '', '/?surface=welcome');
    editor = new Editor(createDocument({ title: 'Plano pendiente' }));
    editor.setPrefs({ lang: 'es', theme: 'dia', onboardingDone: true });
    editor.doc.transact('LINE', (tx) => tx.addEntity<LineEntity>({ ...entityDefaults(editor.doc), id: 'linea', order: 0, type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 10 } }));
    setServices({ editor, persistence: new Persistence(() => editor.doc, () => 'Plano pendiente'), fileHandle: null, openUi: vi.fn(), toast: vi.fn() });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(App, { editor })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
  });

  const button = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((element) => element.textContent?.trim() === label)!;
  const press = (target: HTMLElement, key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    act(() => { target.dispatchEvent(event); });
    return event;
  };
  const openDiscard = async () => {
    let answer: Promise<boolean> = Promise.resolve(true);
    await act(async () => { answer = confirmDiscard(editor); });
    return { answer, cancel: button('Cancelar') };
  };

  it.each(['Enter', ' '])('deja %j al botón Cancelar sin enviar entrada al dibujo', async (key) => {
    const data = editor.doc.data;
    const { answer, cancel } = await openDiscard();
    const editorKey = vi.spyOn(editor, 'key');
    expect(document.activeElement).toBe(cancel);

    const event = press(cancel, key);

    expect.soft(event.defaultPrevented).toBe(false);
    expect(editorKey).not.toHaveBeenCalled();
    // jsdom no ejecuta la activación nativa de un botón con teclas sintéticas.
    // Se comprueba la acción del botón aparte, después de dejar la tecla sin consumir.
    await act(async () => cancel.click());
    expect(await answer).toBe(false);
    expect(host.querySelector('[aria-modal="true"]')).toBeNull();
    expect(editor.doc.data).toBe(data);
    expect(editor.doc.dirty).toBe(true);
  });

  it('no ejecuta atajos del dibujo mientras el foco está en la confirmación', async () => {
    const { cancel } = await openDiscard();
    const command = vi.spyOn(editor, 'command');

    const event = press(cancel, 's', { ctrlKey: true });

    expect.soft(event.defaultPrevented).toBe(false);
    expect(command).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cancel);
  });

  it('respeta una tecla ya consumida por otro control fuera del modal', () => {
    const control = host.querySelector<HTMLButtonElement>('.welcome-wordmark')!;
    control.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    const editorKey = vi.spyOn(editor, 'key');

    expect(press(control, 'Enter').defaultPrevented).toBe(true);

    expect(editorKey).not.toHaveBeenCalled();
  });

  it('conserva el ciclo de Tab y la cancelación con Escape dentro del modal', async () => {
    const data = editor.doc.data;
    const { answer } = await openDiscard();
    const editorKey = vi.spyOn(editor, 'key');
    const discard = button('Descartar y continuar');
    const close = host.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Cerrar"]')!;
    discard.focus();

    expect(press(discard, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(press(close, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(discard);
    expect(press(discard, 'Escape').defaultPrevented).toBe(true);
    expect(await answer).toBe(false);
    expect(editorKey).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-modal="true"]')).toBeNull();
    expect(editor.doc.data).toBe(data);
    expect(editor.doc.dirty).toBe(true);
  });
});
