// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAllCommands } from '../commands';
import type { CommandDef } from '../commands/types';
import { createDocument } from '../document/defaults';
import { Editor } from '../editor/editor';
import { CommandFeedback } from './CommandFeedback';
import { CommandLine } from './CommandLine';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: ReturnType<typeof createRoot>; host: HTMLElement; editor: Editor }[] = [];

function mount(lang: 'es' | 'en' = 'en', onDismiss?: () => void) {
  registerAllCommands();
  const editor = new Editor(createDocument());
  editor.setPrefs({ lang });
  const host = document.createElement('div');
  host.className = 'app app--phone';
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement('div', { className: 'stage__canvas stage__canvas--nocmd' },
    createElement(CommandLine, { editor, compact: true, onDismiss }), createElement(CommandFeedback, { editor }))));
  mounted.push({ root, host, editor });
  return { editor, host, input: host.querySelector('input')! };
}

afterEach(async () => {
  for (const { root, host, editor } of mounted.splice(0)) {
    await act(async () => { editor.runner.cancelAll(); root.unmount(); });
    host.remove();
  }
});

const numericCommand: CommandDef = {
  name: 'FEEDBACK_UI_TEST', aliases: [], category: 'utility', readOnly: true,
  label: { es: 'Valor', en: 'Value' }, description: { es: 'Valor', en: 'Value' },
  async run(api) { await api.getNumber({ prompt: { es: 'Valor', en: 'Value' }, min: 1 }); },
};

describe('visible command recovery', () => {
  it('announces errors without moving focus/caret and retains them until a valid answer', async () => {
    const { editor, host, input } = mount();
    let running!: Promise<void>;
    await act(async () => { running = editor.runner.run(numericCommand); });
    input.focus();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'draft');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.setSelectionRange(2, 2);
    await act(async () => editor.runner.submitText('0'));
    const firstAlert = host.querySelector('[role="alert"]');
    expect(firstAlert?.textContent).toContain('Value must be ≥ 1');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    await act(async () => editor.runner.message('info', 'Keep waiting'));
    expect(host.querySelector('[role="alert"]')).toBe(firstAlert);
    await act(async () => editor.runner.submitText('0'));
    expect(host.querySelector('[role="alert"]')).not.toBe(firstAlert);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Value must be ≥ 1');
    await act(async () => { editor.runner.submitText('2'); await running; });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('dismisses an aviso accessibly while keeping its log and allows the same message again', async () => {
    const { editor, host, input } = mount('es');
    input.focus();
    await act(async () => editor.runner.message('warn', { es: 'Revisa el dibujo', en: 'Check drawing' }));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Revisa el dibujo');
    const dismiss = host.querySelector<HTMLButtonElement>('[aria-label="Descartar aviso"]')!;
    expect(dismiss).not.toBeNull();
    dismiss.focus();
    await act(async () => dismiss.click());
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(editor.runner.log.some((entry) => entry.text === 'Revisa el dibujo')).toBe(true);
    await act(async () => editor.runner.message('warn', 'Revisa el dibujo'));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Revisa el dibujo');
  });

  it('opens history from the notice with a pending command and Escape returns focus without answering it', async () => {
    const { editor, host } = mount();
    let running!: Promise<void>;
    await act(async () => { running = editor.runner.run(numericCommand); editor.runner.submitText('0'); });
    const pending = editor.runner.pending;
    const feedback = editor.runner.feedback;
    const history = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'View history')!;
    expect(history).toBeDefined();
    history.focus();
    await act(async () => history.click());
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog?.getAttribute('aria-label')).toBe('Command history');
    expect(dialog?.textContent).toContain('Value must be ≥ 1');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(history);
    expect(editor.runner.pending).toBe(pending);
    expect(editor.runner.feedback).toBe(feedback);
    await act(async () => { editor.runner.submitText('2'); await running; });
  });

  it('shares the F2 event and command-line history button, supports empty history and F2 closes it', async () => {
    const { host, input } = mount('es');
    input.focus();
    await act(async () => window.dispatchEvent(new CustomEvent('fmodel:cmdlog')));
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Historial de comandos');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Todavía no hay comandos');
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(input);
    const history = host.querySelector<HTMLButtonElement>('[title="Historial de comandos"]')!;
    await act(async () => history.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('retains the phone command line while focus moves to its history button or history dialog', async () => {
    const onDismiss = vi.fn();
    const { host, input } = mount('es', onDismiss);
    input.focus();
    const history = host.querySelector<HTMLButtonElement>('[title="Historial de comandos"]')!;
    history.focus();
    expect(onDismiss).not.toHaveBeenCalled();
    input.focus();
    await act(async () => window.dispatchEvent(new CustomEvent('fmodel:cmdlog')));
    expect(host.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.activeElement).toBe(input);
    expect(onDismiss).not.toHaveBeenCalled();
  });

});
