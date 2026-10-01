import { Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { aliasesFor, searchCommands } from '../commands/registry';
import type { Editor } from '../editor/editor';
import { CadIcon, hasCadIcon } from './icons';
import { useEditorEvents } from './hooks';
import { useModalFocusTrap } from './modalFocus';

export function CommandPalette({ editor, onClose, onRun }: { editor: Editor; onClose: () => void; onRun: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [favoriteNames, setFavoriteNames] = useState(() => editor.prefs.favorites);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lang = editor.lang;
  useModalFocusTrap(dialogRef, onClose);
  useEditorEvents(editor, ['prefs']);
  useEffect(() => setFavoriteNames(editor.prefs.favorites), [editor, editor.prefs.favorites]);
  useEffect(() => inputRef.current?.focus(), []);
  const results = useMemo(() => {
    if (!q.trim()) {
      const favs = editor.prefs.favorites;
      // los comandos internos (_GRIP, _OPENLAUNCHED…) no son para el usuario: no aparecen como sugerencia
      const recent = editor.runner.history.filter((n) => !n.startsWith('_'));
      const names = [...new Set([...recent.slice(0, 6), ...favs])];
      const all = searchCommands('', lang, 400);
      const picked = names.map((n) => all.find((c) => c.name === n)).filter(Boolean) as typeof all;
      return [...picked, ...all.filter((c) => !names.includes(c.name))].slice(0, 60);
    }
    return searchCommands(q, lang, 60);
  }, [q, lang, editor]);
  useEffect(() => setActive(0), [q]);
  // la opción activa por teclado siempre queda a la vista
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.palette__item.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);
  const run = (name: string) => {
    onClose();
    onRun(name);
  };
  const favs = new Set(favoriteNames);
  const toggleFavorite = (name: string) => {
    const next = favs.has(name) ? favoriteNames.filter((f) => f !== name) : [...favoriteNames, name];
    setFavoriteNames(next);
    editor.setPrefs({ favorites: next });
  };
  return (
    <div
      className="veil"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div ref={dialogRef} className="palette" role="dialog" aria-modal="true" aria-label={lang === 'es' ? 'Paleta de comandos' : 'Command palette'} tabIndex={-1}>
        <input
          ref={inputRef}
          className="palette__input"
          name="command-search"
          aria-label={lang === 'es' ? 'Buscar comandos' : 'Search commands'}
          aria-controls="command-palette-results"
          autoComplete="off"
          spellCheck={false}
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
        />
        <span className="sr-only" role="status" aria-live="polite">
          {results[active] ? (lang === 'es' ? `Seleccionado: ${results[active].label.es}` : `Selected: ${results[active].label.en}`) : ''}
        </span>
        <ul id="command-palette-results" ref={listRef} className="palette__list">
          {results.map((c, i) => (
            <li key={c.name} className={`palette__item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)}>
              <button type="button" className="palette__command" onClick={() => run(c.name)}>
                <CadIcon name={c.icon && hasCadIcon(c.icon) ? c.icon : 'properties'} size={18} />
                <span style={{ minWidth: 0 }}>
                  <strong>{c.label[lang]}</strong>
                  <small>{c.description[lang]}</small>
                </span>
              </button>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code>{[c.name, ...aliasesFor(c.name).slice(0, 2)].join(' · ')}</code>
                <button
                  type="button"
                  className={`icon-btn palette__star${favs.has(c.name) ? ' is-active' : ''}`}
                  title={favs.has(c.name) ? (lang === 'es' ? 'Quitar de favoritos' : 'Remove from favorites') : lang === 'es' ? 'Añadir a favoritos' : 'Add to favorites'}
                  aria-label={lang === 'es' ? `Marcar ${c.name} como favorito` : `Mark ${c.name} as favorite`}
                  aria-pressed={favs.has(c.name)}
                  onClick={() => toggleFavorite(c.name)}
                >
                  <Star size={15} />
                </button>
              </span>
            </li>
          ))}
          {!results.length && <li className="empty">{lang === 'es' ? `Sin coincidencias para «${q}». Prueba con el nombre en inglés, un alias o lo que quieres hacer.` : `No matches for "${q}". Try the command name, an alias or what you want to do.`}</li>}
        </ul>
        <div className="palette__foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> {lang === 'es' ? 'navegar' : 'navigate'}</span>
          <span><kbd>Intro</kbd> {lang === 'es' ? 'ejecutar' : 'run'}</span>
          <span><kbd>Esc</kbd> {lang === 'es' ? 'cerrar' : 'close'}</span>
        </div>
      </div>
    </div>
  );
}
