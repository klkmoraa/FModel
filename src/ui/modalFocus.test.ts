// @vitest-environment jsdom
import { act, createElement as h, useRef, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorPicker } from './controls';
import { useModalFocusTrap } from './modalFocus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];

function Modal({ children, onClose, returnFocusRef }: { children: ReactNode; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocusTrap(ref, onClose, returnFocusRef);
  return h('div', { ref, role: 'dialog', 'aria-modal': true, tabIndex: -1 }, children);
}

function mount(children: ReactNode, returnFocusRef?: RefObject<HTMLElement | null>) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  act(() => root.render(h(Modal, { onClose: close, returnFocusRef, children })));
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    act(() => root.unmount());
    host.remove();
  };
  cleanups.push(unmount);
  return { dialog: host.querySelector<HTMLElement>('[role="dialog"]')!, close, unmount };
}

function markup(html: string) {
  return h('div', { dangerouslySetInnerHTML: { __html: html } });
}

function key(key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  act(() => { document.activeElement!.dispatchEvent(event); });
  return event;
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.replaceChildren();
  delete document.documentElement.dataset.theme;
});

describe('modal keyboard focus', () => {
  it('lets native Tab leave a color grid after arrow navigation', () => {
    document.documentElement.dataset.theme = 'dia';
    const { dialog } = mount(h('div', null,
      h(ColorPicker, { value: 'aci:1', onChange: vi.fn(), lang: 'en', ariaLabel: 'Color' }),
      h('button', { id: 'after-color' }, 'Continue'),
    ));
    act(() => dialog.querySelector<HTMLButtonElement>('[aria-label="Color"]')!.click());
    const colors = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Select color"]')!;
    act(() => colors.querySelector<HTMLElement>('[data-aci="1"]')!.focus());
    key('ArrowRight');
    const swatch = colors.querySelector<HTMLElement>('[data-aci="2"]')!;
    expect(document.activeElement).toBe(swatch);
    expect(swatch.tabIndex).toBe(0);

    // jsdom has no native Tab navigation: the browser journey checks the destination.
    // The trap must not cancel it or substitute the next non-tabbable color.
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(swatch);
  });

  it('traps a portalled color picker above its parent and closes one surface per Escape', () => {
    document.documentElement.dataset.theme = 'dia';
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { dialog, close, unmount } = mount(h('div', null,
      h(ColorPicker, { value: 'ByBlock', onChange: vi.fn(), lang: 'en', ariaLabel: 'Color' }),
      h('button', null, 'Continue'),
    ));
    const trigger = dialog.querySelector<HTMLButtonElement>('[aria-label="Color"]')!;
    act(() => trigger.click());
    const colors = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Select color"]')!;
    expect(dialog.contains(colors)).toBe(false);
    expect(colors.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(colors.querySelector('[data-inherited="ByBlock"]'));
    act(() => colors.querySelector<HTMLInputElement>('input[type="color"]')!.focus());
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(colors.querySelector('button'));
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(colors.querySelector('input[type="color"]'));
    expect(close).not.toHaveBeenCalled();

    expect(key('Escape').defaultPrevented).toBe(true);
    expect(colors.isConnected).toBe(false);
    expect(dialog.isConnected).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    key('Escape');
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it.each([
    ['tabindex -1', '<button tabindex="-1">Omitted</button>'],
    ['tabindex below -1', '<button tabindex="-2">Omitted</button>'],
    ['disabled with tabindex', '<button disabled tabindex="0">Omitted</button>'],
    ['disabled fieldset', '<fieldset disabled><input aria-label="Omitted"></fieldset>'],
    ['hidden ancestor', '<div hidden><button>Omitted</button></div>'],
    ['inert ancestor', '<div inert><button>Omitted</button></div>'],
    ['aria-hidden ancestor', '<div aria-hidden="true"><button>Omitted</button></div>'],
    ['display none ancestor', '<div style="display:none"><button>Omitted</button></div>'],
    ['visibility hidden ancestor', '<div style="visibility:hidden"><button>Omitted</button></div>'],
    ['visibility collapse', '<button style="visibility:collapse">Omitted</button>'],
    ['hidden input with tabindex', '<input type="hidden" tabindex="0">'],
  ])('excludes %s when choosing initial focus and wrapping', (_name, omitted) => {
    const { dialog } = mount(markup(`
      <header class="dialog__head"><button id="close">Close</button></header>
      ${omitted}
      <input id="content" aria-label="Name">
      <button id="apply">Apply</button>
      ${omitted}
    `));
    expect(document.activeElement).toBe(dialog.querySelector('#content'));
    dialog.querySelector<HTMLElement>('#apply')!.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('#close'));
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('#apply'));
  });

  it('ignores hidden autofocus and initially focuses usable content instead of the header', () => {
    const { dialog } = mount(markup(`
      <header class="dialog__head"><button>Close</button></header>
      <div hidden><input autofocus aria-label="Hidden"></div>
      <input id="content" aria-label="Name">
    `));
    expect(document.activeElement).toBe(dialog.querySelector('#content'));
  });

  it('wraps only at the ends and leaves ordinary forward and backward Tab to the browser', () => {
    const { dialog } = mount(markup('<button id="first">First</button><input id="middle"><button id="last">Last</button>'));
    dialog.querySelector<HTMLElement>('#middle')!.focus();
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(key('Tab', true).defaultPrevented).toBe(false);
    dialog.querySelector<HTMLElement>('#last')!.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('#first'));
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('#last'));
  });

  it('uses sequential tabindex order when wrapping and entering from outside', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const { dialog } = mount(markup('<button id="last">Default</button><button tabindex="2">Second</button><button id="first" tabindex="1">First</button>'));
    dialog.querySelector<HTMLElement>('#last')!.focus();
    key('Tab');
    expect(document.activeElement).toBe(dialog.querySelector('#first'));
    key('Tab', true);
    expect(document.activeElement).toBe(dialog.querySelector('#last'));
    outside.focus();
    key('Tab');
    expect(document.activeElement).toBe(dialog.querySelector('#first'));
  });

  it('keeps programmatically focused elements at the edges inside the modal', () => {
    const { dialog } = mount(markup('<button id="before" tabindex="-1">Before</button><input id="field"><button id="after" tabindex="-1">After</button>'));
    dialog.querySelector<HTMLElement>('#after')!.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('#field'));
    dialog.querySelector<HTMLElement>('#before')!.focus();
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('#field'));
  });

  it('focuses the dialog itself when no sequential tab stops exist', () => {
    const { dialog } = mount(markup('<button tabindex="-1">Arrow-only action</button><input disabled>'));
    expect(document.activeElement).toBe(dialog);
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
  });

  it('preserves topmost Escape handling and returns focus through stacked modals', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const lower = mount(markup('<input id="lower">'));
    const lowerField = lower.dialog.querySelector<HTMLElement>('#lower');
    expect(document.activeElement).toBe(lowerField);
    const upper = mount(markup('<button>Confirm</button>'));
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(upper.close).toHaveBeenCalledOnce();
    expect(lower.close).not.toHaveBeenCalled();
    upper.unmount();
    expect(document.activeElement).toBe(lowerField);
    key('Escape');
    expect(lower.close).toHaveBeenCalledOnce();
    lower.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('lets an Escape-consuming control keep the modal open and honors an explicit return target', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const { close, unmount } = mount(markup('<input data-modal-escape="consume">'), { current: opener });
    expect(key('Escape').defaultPrevented).toBe(false);
    expect(close).not.toHaveBeenCalled();
    unmount();
    expect(document.activeElement).toBe(opener);
  });
});
