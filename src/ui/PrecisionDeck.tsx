import { Command, LayoutGrid, MousePointer2, Search, Star, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findCommand, searchCommands } from '../commands/registry';
import type { Editor } from '../editor/editor';
import { uniqueFavoriteCommands } from '../editor/workspaceChrome';
import { CadIcon, hasCadIcon } from './icons';
import { useEditorEvents } from './hooks';
import { RIBBON, type RibbonGroup, type RibbonTool } from './ribbonConfig';

export function toolsForRibbonTab(tabId: string): RibbonGroup[] {
  const tab = RIBBON.find((candidate) => candidate.id === tabId)
    ?? RIBBON.find((candidate) => candidate.id === 'home')
    ?? RIBBON[0];
  const seen = new Set<string>();
  return tab.groups
    .map((group) => ({
      ...group,
      tools: group.tools.filter((tool) => {
        const key = `${tool.cmd}:${tool.args?.join(',') ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((group) => group.tools.length > 0);
}

const PANEL_ACTIONS = [
  { id: 'palettes', icon: 'palettes', es: 'Paletas', en: 'Palettes' },
  { id: 'properties', icon: 'properties', es: 'Propiedades', en: 'Properties' },
  { id: 'layers', icon: 'layers', es: 'Capas', en: 'Layers' },
  { id: 'blocks', icon: 'block', es: 'Bloques', en: 'Blocks' },
] as const;

function ribbonTool(commandName: string): RibbonTool | undefined {
  const normalized = commandName.toUpperCase();
  for (const tab of RIBBON) {
    for (const group of tab.groups) {
      const tool = group.tools.find((candidate) => candidate.cmd.toUpperCase() === normalized && !candidate.args?.length);
      if (tool) return tool;
    }
  }
}

export function PrecisionDeck({
  editor,
  open,
  onOpenChange,
  onUi,
  onRun,
  onOpenPalette,
  activePanel,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUi: (ui: string) => void;
  onRun: (name: string, args?: string[]) => void;
  onOpenPalette: () => void;
  activePanel?: string | null;
}) {
  useEditorEvents(editor, ['command', 'prefs', 'selection']);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const lang = editor.lang;
  const activeCommand = editor.runner.active?.def;
  const selected = editor.selection.size;
  const favorites = uniqueFavoriteCommands(editor.prefs.favorites).map((name) => ({ name, tool: ribbonTool(name), command: findCommand(name) }));
  const pending = editor.runner.pending;
  const promptText = pending ? editor.runner.promptText(pending.req).replace(/\s*\[[^\]]*\]/, '') : '';

  const closeDeck = useCallback((restoreFocus = true) => {
    onOpenChange(false);
    if (restoreFocus) requestAnimationFrame(() => launcherRef.current?.focus());
  }, [onOpenChange]);

  const run = (name: string, args?: string[]) => {
    onOpenChange(false);
    onRun(name, args);
  };

  return (
    <div className="precision-deck-shell">
      {open && <ToolDeck editor={editor} onClose={closeDeck} onRun={run} />}
      <nav className="precision-dock" aria-label={lang === 'es' ? 'Herramientas de precisión' : 'Precision tools'}>
        <div className={`precision-dock__context${activeCommand ? ' is-command-active' : ' is-selection-active'}`}>
          {activeCommand ? <Command size={16} /> : <MousePointer2 size={16} />}
          <span role="status" aria-live="polite">
            <strong>{activeCommand ? activeCommand.label[lang] : lang === 'es' ? 'Seleccionar' : 'Select'}</strong>
            <small>
              {activeCommand
                ? promptText || activeCommand.name
                : selected
                  ? lang === 'es'
                    ? `${selected} seleccionado${selected === 1 ? '' : 's'}`
                    : `${selected} selected`
                  : lang === 'es'
                    ? 'Listo'
                    : 'Ready'}
            </small>
          </span>
          {activeCommand && (
            <button type="button" onClick={() => editor.key('Escape')} aria-label={lang === 'es' ? 'Cancelar comando' : 'Cancel command'} title="Esc">
              <X size={15} />
            </button>
          )}
        </div>

        <span className="precision-dock__separator" aria-hidden="true" />
        <button
          type="button"
          ref={launcherRef}
          className={`precision-dock__launcher${open ? ' is-active' : ''}`}
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls="precision-tool-deck"
          aria-label={lang === 'es' ? 'Abrir todas las herramientas' : 'Open all tools'}
          title={lang === 'es' ? 'Todas las herramientas' : 'All tools'}
        >
          <LayoutGrid size={18} />
          <span>{lang === 'es' ? 'Herramientas' : 'Tools'}</span>
        </button>

        <span className="precision-dock__separator" aria-hidden="true" />
        <div className="precision-dock__favorites" aria-label={lang === 'es' ? 'Herramientas favoritas' : 'Favorite tools'}>
          {favorites.map(({ name, tool, command }) => (
            <button
              type="button"
              key={name}
              className={`precision-dock__tool${activeCommand?.name === command?.name ? ' is-active' : ''}`}
              onClick={() => run(name)}
              title={`${command?.label[lang] ?? tool?.label[lang] ?? name} · ${name}`}
              aria-label={command?.label[lang] ?? tool?.label[lang] ?? name}
            >
              <CadIcon name={tool?.icon ?? command?.icon ?? 'properties'} size={18} />
            </button>
          ))}
        </div>

        <span className="precision-dock__separator" aria-hidden="true" />
        <div className="precision-dock__panels" aria-label={lang === 'es' ? 'Paneles' : 'Panels'}>
          {PANEL_ACTIONS.map((panel) => (
            <button
              type="button"
              key={panel.id}
              className={`precision-dock__tool${activePanel === panel.id ? ' is-active' : ''}`}
              onClick={(event) => {
                event.currentTarget.focus();
                onUi(`panel:${panel.id}`);
              }}
              title={panel[lang]}
              aria-label={panel[lang]}
              aria-pressed={activePanel === panel.id}
            >
              <CadIcon name={panel.icon} size={18} />
            </button>
          ))}
        </div>
        <button type="button" className="precision-dock__tool" onClick={onOpenPalette} title={lang === 'es' ? 'Buscar comandos (Ctrl+K)' : 'Search commands (Ctrl+K)'} aria-label={lang === 'es' ? 'Buscar comandos' : 'Search commands'}>
          <Search size={18} />
        </button>
      </nav>
    </div>
  );
}

function ToolDeck({ editor, onClose, onRun }: { editor: Editor; onClose: (restoreFocus?: boolean) => void; onRun: (name: string, args?: string[]) => void }) {
  const [tab, setTab] = useState('home');
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lang = editor.lang;
  const groups = useMemo(() => toolsForRibbonTab(tab), [tab]);
  const results = useMemo(() => (query.trim() ? searchCommands(query, lang, 40) : []), [query, lang]);
  const recent = useMemo(
    () =>
      uniqueFavoriteCommands(editor.runner.history)
        .map((name) => findCommand(name))
        .filter((command): command is NonNullable<typeof command> => !!command),
    [editor.runner.history],
  );

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.precision-deck-shell')) onClose(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const toggleFavorite = (name: string) => {
    const current = editor.prefs.favorites;
    editor.setPrefs({ favorites: current.includes(name) ? current.filter((favorite) => favorite !== name) : [...current, name] });
  };

  return (
    <div ref={rootRef} id="precision-tool-deck" className="tool-deck" role="dialog" aria-modal="false" aria-label={lang === 'es' ? 'Biblioteca de herramientas' : 'Tool library'}>
      <div className="tool-deck__head">
        <div className="tool-deck__search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={lang === 'es' ? 'Buscar herramienta o comando…' : 'Search tool or command…'}
            aria-label={lang === 'es' ? 'Buscar herramienta' : 'Search tool'}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Ctrl K</kbd>
        </div>
        <button type="button" className="icon-btn" onClick={() => onClose()} aria-label={lang === 'es' ? 'Cerrar herramientas' : 'Close tools'}>
          <X size={17} />
        </button>
      </div>

      {!query.trim() && (
        <div className="tool-deck__tabs" role="tablist" aria-label={lang === 'es' ? 'Familias de herramientas' : 'Tool families'}>
          {RIBBON.map((item) => (
            <button type="button" key={item.id} role="tab" aria-selected={tab === item.id} aria-controls="tool-deck-body" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>
              {item.label[lang]}
            </button>
          ))}
        </div>
      )}

      <div id="tool-deck-body" className="tool-deck__body" role="tabpanel">
        {query.trim() ? (
          <div className="tool-deck__results">
            {results.map((command) => (
              <div key={command.name} className="tool-deck__result">
                <button type="button" className="tool-deck__result-main" onClick={() => onRun(command.name)}>
                  <CadIcon name={command.icon && hasCadIcon(command.icon) ? command.icon : 'properties'} size={18} />
                  <span>
                    <strong>{command.label[lang]}</strong>
                    <small>{command.description[lang]}</small>
                  </span>
                  <code>{command.name}</code>
                </button>
                <button
                  type="button"
                  className={`tool-deck__favorite${editor.prefs.favorites.includes(command.name) ? ' is-active' : ''}`}
                  onClick={() => toggleFavorite(command.name)}
                  aria-pressed={editor.prefs.favorites.includes(command.name)}
                  aria-label={lang === 'es' ? `Cambiar favorito ${command.label.es}` : `Toggle favorite ${command.label.en}`}
                >
                  <Star size={15} />
                </button>
              </div>
            ))}
            {!results.length && <p className="tool-deck__empty">{lang === 'es' ? `Sin resultados para «${query}».` : `No results for “${query}”.`}</p>}
          </div>
        ) : (
          <>
            {recent.length > 0 && (
              <section className="tool-deck__group">
                <h3>{lang === 'es' ? 'Recientes' : 'Recent'}</h3>
                <div className="tool-deck__grid">
                  {recent.map((command) => (
                    <button type="button" key={`recent:${command.name}`} className="tool-deck__item" onClick={() => onRun(command.name)}>
                      <CadIcon name={command.icon && hasCadIcon(command.icon) ? command.icon : 'properties'} size={19} />
                      <span>{command.label[lang]}</span>
                      <code>{command.name}</code>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {groups.map((group) => (
              <section className="tool-deck__group" key={`${tab}-${group.label.en}`}>
                <h3>{group.label[lang]}</h3>
                <div className="tool-deck__grid">
                  {group.tools.map((tool) => (
                    <button type="button" key={`${tool.cmd}:${tool.args?.join(',') ?? ''}`} className="tool-deck__item" onClick={() => onRun(tool.cmd, tool.args)}>
                      <CadIcon name={tool.icon} size={19} />
                      <span>{tool.label[lang]}</span>
                      <code>{tool.cmd}</code>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
