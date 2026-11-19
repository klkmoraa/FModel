// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorPicker } from './controls';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];

function mount(value: string, onParentClick?: () => void) {
  document.documentElement.dataset.theme = 'dia';
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function ControlledPicker() {
    const [selected, setSelected] = useState(value);
    return h('div', { onClick: onParentClick },
      h(ColorPicker, { value: selected, onChange: setSelected, lang: 'en', ariaLabel: 'Color' }),
      h('output', null, selected),
    );
  }
  act(() => root.render(h(ControlledPicker)));
  cleanups.push(() => { act(() => root.unmount()); host.remove(); });
  const toggle = () => act(() => host.querySelector<HTMLButtonElement>('[aria-label="Color"]')!.click());
  toggle();
  return { host, toggle, popup: () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Select color"]')! };
}

function press(key: string) {
  act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('color picker roving focus', () => {
  it.each([
    ['Basic ACI colors', 4, 5],
    ['Extended ACI colors', 42, 43],
  ])('moves the only Tab stop in %s without committing the focused color', (label, selected, next) => {
    const { host, toggle, popup } = mount(`aci:${selected}`);
    const grid = popup().querySelector<HTMLElement>(`[role="grid"][aria-label="${label}"]`)!;
    const selectedSwatch = grid.querySelector<HTMLElement>(`[data-aci="${selected}"]`)!;
    act(() => selectedSwatch.focus());
    press('ArrowRight');
    const nextSwatch = grid.querySelector<HTMLElement>(`[data-aci="${next}"]`)!;
    expect(document.activeElement).toBe(nextSwatch);
    expect([...grid.querySelectorAll('[tabindex="0"]')]).toEqual([nextSwatch]);
    expect(selectedSwatch.getAttribute('aria-selected')).toBe('true');
    expect(nextSwatch.getAttribute('aria-selected')).toBe('false');
    expect(host.querySelector('output')!.textContent).toBe(`aci:${selected}`);

    press('Enter');
    expect(popup()).toBeNull();
    expect(host.querySelector('output')!.textContent).toBe(`aci:${next}`);
    toggle();
    expect(popup().querySelector(`[data-aci="${next}"]`)!.getAttribute('tabindex')).toBe('0');
  });

  it('resets uncommitted grid focus to the selected color on each opening', () => {
    const { host, toggle, popup } = mount('aci:4');
    act(() => popup().querySelector<HTMLElement>('[data-aci="4"]')!.focus());
    press('ArrowRight');
    toggle();
    toggle();
    expect(host.querySelector('output')!.textContent).toBe('aci:4');
    expect([...popup().querySelectorAll('[role="grid"] [tabindex="0"]')].map((node) => node.getAttribute('data-aci'))).toEqual(['4', '10']);
  });

  it.each(['ByLayer', 'ByBlock', '#7657d5'])('keeps a Tab entry without falsely selecting red for %s', (value) => {
    const { host, popup } = mount(value);
    expect([...popup().querySelectorAll('[role="grid"] [tabindex="0"]')].map((node) => node.getAttribute('data-aci'))).toEqual(['1', '10']);
    expect(popup().querySelectorAll('[role="gridcell"][aria-selected="true"]')).toHaveLength(0);
    expect(host.querySelector('output')!.textContent).toBe(value);
  });

  it('exposes the complete ACI range as labelled cells within rows', () => {
    const { popup } = mount('aci:250');
    const cells = [...popup().querySelectorAll('[role="gridcell"]')];
    expect(cells).toHaveLength(255);
    expect(cells.every((cell) => cell.parentElement?.getAttribute('role') === 'row')).toBe(true);
    expect(cells.every((cell) => cell.getAttribute('aria-label')?.includes(`ACI ${cell.getAttribute('data-aci')}`))).toBe(true);
    expect(popup().querySelector('[data-aci="250"]')!.getAttribute('aria-selected')).toBe('true');
    expect(popup().querySelector('[data-aci="250"]')!.getAttribute('tabindex')).toBe('0');
  });

  it('moves vertically by the visible column count after a narrow resize', () => {
    const { host, popup } = mount('ByBlock');
    act(() => popup().querySelector<HTMLElement>('[data-aci="10"]')!.focus());
    press('ArrowDown');
    expect(document.activeElement?.getAttribute('data-aci')).toBe('16');
    vi.stubGlobal('innerWidth', 320);
    act(() => window.dispatchEvent(new Event('resize')));
    act(() => popup().querySelector<HTMLElement>('[data-aci="10"]')!.focus());
    press('ArrowDown');
    expect(document.activeElement?.getAttribute('data-aci')).toBe('15');
    expect(host.querySelector('output')!.textContent).toBe('ByBlock');
    vi.unstubAllGlobals();
  });

  it.each(['0', '256', '1.5', 'red', ''])('rejects invalid precise ACI %j without changing the color', (value) => {
    const { host, popup } = mount('aci:4');
    const input = popup().querySelector<HTMLInputElement>('[aria-label="ACI number (1–255)"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    press('Enter');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(popup().querySelector('[role="alert"]')!.textContent).toContain('1 to 255');
    expect(host.querySelector('output')!.textContent).toBe('aci:4');
  });

  it('applies a valid precise ACI and returns focus to its trigger', () => {
    const { host, popup } = mount('ByBlock');
    const input = popup().querySelector<HTMLInputElement>('[aria-label="ACI number (1–255)"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '255');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    press('Enter');
    expect(popup()).toBeNull();
    expect(host.querySelector('output')!.textContent).toBe('aci:255');
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Color"]'));
  });

  it('closes with Escape without committing focused colors and restores its trigger', () => {
    const { host, popup } = mount('aci:4');
    act(() => popup().querySelector<HTMLElement>('[data-aci="4"]')!.focus());
    press('ArrowRight');
    press('Escape');
    expect(popup()).toBeNull();
    expect(host.querySelector('output')!.textContent).toBe('aci:4');
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Color"]'));
  });

  it('dismisses an outside click without committing or forwarding it to the parent', () => {
    const parentClick = vi.fn();
    const { host, popup } = mount('ByBlock', parentClick);
    parentClick.mockClear();
    act(() => popup().parentElement!.click());
    expect(popup()).toBeNull();
    expect(host.querySelector('output')!.textContent).toBe('ByBlock');
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Color"]'));
    expect(parentClick).not.toHaveBeenCalled();
  });
});
