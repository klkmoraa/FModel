import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { aliasesFor, searchCommands } from '../commands/registry';
import type { Editor } from '../editor/editor';
import { useEditorEvents } from './hooks';

export interface CommandLineHandle {
  focus(initial?: string): void;
  hasFocus(): boolean;
}

export const CommandLine = forwardRef<CommandLineHandle, { editor: Editor; onDismiss?: () => void }>(function CommandLine({ editor, onDismiss }, ref) {
  useEditorEvents(editor, ['command', 'prefs']);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [histIdx, setHistIdx] = useState(-1);
  // en el teléfono el historial tapa el lienzo y la barra táctil ya muestra la petición en curso
  const [showLog, setShowLog] = useState(() => typeof matchMedia === 'undefined' || !matchMedia('(max-width: 820px)').matches);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const lang = editor.lang;
  const pending = editor.runner.pending;
  const prompt = pending ? editor.runner.promptText(pending.req) : '';
  const multiline = pending?.req.kind === 'string' && pending.req.multiline;

  useImperativeHandle(ref, () => ({
    focus(initial?: string) {
      inputRef.current?.focus();
      if (initial !== undefined) setText((t) => t + initial);
    },
    hasFocus: () => document.activeElement === inputRef.current,
  }));

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [editor.runner.log.length]);

  useEffect(() => {
    const toggle = () => setShowLog((v) => !v);
    window.addEventListener('fmodel:cmdlog', toggle);
    return () => window.removeEventListener('fmodel:cmdlog', toggle);
  }, []);

  const suggestions = useMemo(() => {
    if (pending || !text.trim() || text.includes(' ')) return [];
    return searchCommands(text, lang, 7);
  }, [text, pending, lang]);

  useEffect(() => setActive(0), [text]);

  const submit = (value: string) => {
    const typed = value;
    setText('');
    setHistIdx(-1);
    if (!pending && suggestions.length && typed.trim() && !suggestions.some((s) => s.name === typed.trim().toUpperCase() || aliasesFor(s.name).includes(typed.trim().toUpperCase()))) {
      editor.command(suggestions[active].name);
      return;
    }
    editor.runner.submitText(typed, { cursorPoint: editor.hover.resolved?.p ?? editor.hover.world, dynamicRelative: editor.prefs.dynamicInput.on && editor.prefs.dynamicInput.relative });
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || (e.key === ' ' && !(pending?.req.kind === 'string' && pending.req.allowSpaces))) {
      e.preventDefault();
      if (!text && pending?.req.kind === 'selection') {
        editor.key('Enter');
        return;
      }
      submit(text);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (text) setText('');
      else editor.key('Escape');
      inputRef.current?.blur();
      onDismiss?.();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length) setText(suggestions[active].name);
      else editor.key('Tab', { shift: e.shiftKey });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length) setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
      else {
        const h = editor.runner.history;
        const i = Math.min(h.length - 1, histIdx + 1);
        if (i >= 0) {
          setHistIdx(i);
          setText(h[i]);
        }
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length) setActive((a) => (a + 1) % suggestions.length);
      else {
        const i = histIdx - 1;
        setHistIdx(Math.max(-1, i));
        setText(i >= 0 ? editor.runner.history[i] : '');
      }
    }
  };

  const recentLog = editor.runner.log.slice(-40);

  return (
    <div className="cmdline">
      {showLog && (
        <div className="cmdline__log" ref={logRef} aria-live="polite">
          {recentLog.map((l, i) => (
            <div key={`${l.at}-${i}`} className={`log--${l.kind}`}>
              {l.kind === 'command' ? `» ${l.text}` : l.text}
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        {suggestions.length > 0 && (
          <div className="cmdline__suggest" role="listbox">
            {suggestions.map((s, i) => (
              <button
                key={s.name}
                className={`suggest-item${i === active ? ' is-active' : ''}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setText('');
                  editor.command(s.name);
                }}
              >
                <code>{s.name}</code>
                <span>{s.label[lang]}</span>
                <small>{aliasesFor(s.name).slice(0, 3).join(' · ')}</small>
              </button>
            ))}
          </div>
        )}
        <div className="cmdline__bar">
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setShowLog((s) => !s)} title={lang === 'es' ? 'Historial de comandos' : 'Command history'} aria-pressed={showLog}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={showLog ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
            </svg>
          </button>
          {pending ? (
            <span className="cmdline__prompt" title={prompt}>
              <b>{editor.runner.active?.def.name}</b> {prompt.replace(/\s*\[[^\]]*\]/, '')}
            </span>
          ) : null}
          {pending?.req.keywords?.length ? (
            <span className="cmdline__kw">
              {pending.req.keywords.map((k) => (
                <button key={k.key} className="kw-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.runner.submitKeyword(k.key)}>
                  {k.label[lang]}
                </button>
              ))}
            </span>
          ) : null}
          {multiline ? (
            <MultilineInput editor={editor} />
          ) : (
            <input
              ref={inputRef}
              className="cmdline__input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              onBlur={() => onDismiss?.()}
              placeholder={pending ? '' : lang === 'es' ? 'Escribe un comando (L, C, TR…) o pulsa Ctrl+K' : 'Type a command (L, C, TR…) or press Ctrl+K'}
              aria-label={lang === 'es' ? 'Línea de comandos' : 'Command line'}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
});

function MultilineInput({ editor }: { editor: Editor }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'flex-end' }}>
      <textarea
        ref={ref}
        className="input"
        style={{ height: 64, padding: 6, fontFamily: 'var(--fs-font-ui)', resize: 'vertical' }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            editor.runner.submitText(value);
          }
          if (e.key === 'Escape') editor.key('Escape');
          e.stopPropagation();
        }}
        placeholder={editor.lang === 'es' ? 'Texto… (Ctrl+Intro para aceptar)' : 'Text… (Ctrl+Enter to accept)'}
      />
      <button className="btn btn--accent btn--sm" onClick={() => editor.runner.submitText(value)}>
        OK
      </button>
    </div>
  );
}
