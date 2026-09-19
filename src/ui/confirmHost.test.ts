// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askConfirm, askText, ConfirmHost } from './ConfirmHost';
import { Dialog } from './Dialogs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const findButton = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
const pressEscape = () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

describe('ConfirmHost: confirmaciones propias en lugar de diálogos nativos', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('resuelve true al confirmar y false al cancelar', async () => {
    await act(async () => root.render(createElement(ConfirmHost, { lang: 'es' })));

    let answer: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      answer = askConfirm('es', 'Eliminar', '¿Seguro?', { confirmLabel: 'Eliminar' });
    });
    await act(async () => findButton('Eliminar')?.click());
    expect(await answer).toBe(true);

    await act(async () => {
      answer = askConfirm('es', 'Eliminar', '¿Seguro?', { confirmLabel: 'Eliminar' });
    });
    await act(async () => findButton('Cancelar')?.click());
    expect(await answer).toBe(false);
  });

  it('askText devuelve el texto escrito o null al cancelar', async () => {
    await act(async () => root.render(createElement(ConfirmHost, { lang: 'es' })));

    let answer: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      answer = askText('es', 'Nombre', 'Presentación1', { confirmLabel: 'Renombrar' });
    });
    expect((document.querySelector('.dialog input') as HTMLInputElement).value).toBe('Presentación1');
    await act(async () => findButton('Renombrar')?.click());
    expect(await answer).toBe('Presentación1');

    await act(async () => {
      answer = askText('es', 'Nombre', 'x');
    });
    await act(async () => findButton('Cancelar')?.click());
    expect(await answer).toBeNull();
  });

  it('sobre otro diálogo, Escape cierra solo la confirmación', async () => {
    const outerClose = vi.fn();
    await act(async () =>
      root.render(createElement(Fragment, null, createElement(Dialog, { title: 'Versiones', lang: 'es', onClose: outerClose, children: 'contenido' }), createElement(ConfirmHost, { lang: 'es' }))),
    );

    let answer: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      answer = askConfirm('es', 'Restaurar', '¿Restaurar?');
    });
    expect(document.querySelectorAll('.dialog')).toHaveLength(2);

    await act(async () => pressEscape());

    expect(await answer).toBe(false);
    expect(outerClose).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.dialog')).toHaveLength(1);
  });
});
