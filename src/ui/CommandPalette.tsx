import { useEffect, useMemo, useRef, useState } from 'react';
import { aliasesFor, searchCommands } from '../commands/registry';
import type { Editor } from '../editor/editor';
import { CadIcon, hasCadIcon } from './icons';

export function CommandPalette({ editor, onClose, onRun }: { editor: Editor; onClose: () => void; onRun: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lang = editor.lang;
  useEffect(() => inputRef.current?.focus(), []);
  const results = useMemo(() => {
    if (!q.trim()) {
      const favs = editor.prefs.favorites;
      const recent = editor.runner.history;
      const names = [...new Set([...recent.slice(0, 6), ...favs])];
      const all = searchCommands('', lang, 400);
      const picked = names.map((n) => all.find((c) => c.name === n)).filter(Boolean) as typeof all;
      return [...picked, ...all.filter((c) => !names.includes(c.name))].slice(0, 60);
    }
    return searchCommands(q, lang, 60);
  }, [q, lang, editor]);
  useEffect(() => setActive(0), [q]);
  const run = (name: string) => {
    onClose();
    onRun(name);
  };
  const favs = new Set(editor.prefs.favorites);
  return (
    <div className="veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={lang === 'es' ? 'Paleta de comandos' : 'Command palette'}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder={lang === 'es' ? 'Busca comandos por nombre, alias o lo que quieres hacer…' : 'Search commands by name, alias or what you want to do…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && results[active]) run(results[active].name);
            else if (e.key === 'Escape') onClose();
            e.stopPropagation();
          }}
          aria-activedescendant={results[active] ? `cmd-${results[active].name}` : undefined}
        />
        <div className="palette__list" role="listbox">
          {results.map((c, i) => (
            <button key={c.name} id={`cmd-${c.name}`} role="option" aria-selected={i === active} className={`palette__item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => run(c.name)}>
              <CadIcon name={c.icon && hasCadIcon(c.icon) ? c.icon : 'properties'} size={18} />
              <span style={{ minWidth: 0 }}>
                <strong>{c.label[lang]}</strong>
                <small>{c.description[lang]}</small>
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code>{[c.name, ...aliasesFor(c.name).slice(0, 2)].join(' · ')}</code>
                <span
                  role="button"
                  tabIndex={-1}
                  title={lang === 'es' ? 'Favorito' : 'Favorite'}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = favs.has(c.name) ? editor.prefs.favorites.filter((f) => f !== c.name) : [...editor.prefs.favorites, c.name];
                    editor.setPrefs({ favorites: next });
                  }}
                  style={{ color: favs.has(c.name) ? 'var(--fs-signal-attention)' : 'var(--ink-faint)' }}
                >
                  ★
                </span>
              </span>
            </button>
          ))}
          {!results.length && <div className="empty">{lang === 'es' ? `Sin coincidencias para «${q}».` : `No matches for "${q}".`}</div>}
        </div>
      </div>
    </div>
  );
}
