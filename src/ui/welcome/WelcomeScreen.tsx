import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Folder,
  Home,
  LayoutTemplate,
  Moon,
  Play,
  Search,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { BrandMark } from '../icons';
import { FModelHome } from './FModelHome';
import { TemplatesView } from './TemplatesView';
import { DrawingsView } from './DrawingsView';
import { LibraryCatalogView } from './LibraryCatalogView';
import { ImportCenterView } from './ImportCenterView';
import { SearchResults } from './SearchResults';
import { confirmDiscard, createBlankDrawing } from './actions';
import { tr } from '../controls';
import './welcome.css';

export type WelcomeView = 'home' | 'drawings' | 'templates' | 'library' | 'import';

interface WelcomeScreenProps {
  editor: Editor;
  dark: boolean;
  onOpenWorkspace: () => void;
}

export function WelcomeScreen({ editor, dark, onOpenWorkspace }: WelcomeScreenProps) {
  const lang = editor.lang;
  const [view, setView] = useState<WelcomeView>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const homeRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // «/» enfoca el buscador desde cualquier parte de la pantalla de inicio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (next: WelcomeView, keepQuery = false) => {
    setView(next);
    if (!keepQuery) setSearchQuery('');
    homeRef.current?.scrollTo({ top: 0 });
  };

  const handleCreateBlank = async () => {
    if (!(await confirmDiscard(editor))) return;
    createBlankDrawing(editor);
    onOpenWorkspace();
  };

  const navItems: Array<{ id: WelcomeView; label: string; icon: typeof Home }> = [
    { id: 'home', label: tr(lang, 'Inicio', 'Home'), icon: Home },
    { id: 'drawings', label: tr(lang, 'Dibujos', 'Drawings'), icon: Folder },
    { id: 'templates', label: tr(lang, 'Plantillas', 'Templates'), icon: LayoutTemplate },
    { id: 'library', label: tr(lang, 'Biblioteca', 'Library'), icon: BookOpen },
    { id: 'import', label: tr(lang, 'Importar', 'Import'), icon: Upload },
  ];

  // Escritorio: control segmentado en la consola. Móvil: barra de pestañas inferior (nivel «hoja»).
  const renderNav = (variant: 'console' | 'tabbar') => (
    <nav
      className={`welcome-nav welcome-nav--${variant}`}
      aria-label={tr(lang, 'Navegación de FModel', 'FModel navigation')}
    >
      {navItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`welcome-nav-item${view === id ? ' is-active' : ''}`}
          aria-current={view === id ? 'page' : undefined}
          title={label}
          onClick={() => navigate(id)}
        >
          <Icon size={variant === 'tabbar' ? 20 : 16} aria-hidden="true" />
          <span className="welcome-nav-item__label">{label}</span>
        </button>
      ))}
    </nav>
  );

  const searchPlaceholder: Record<WelcomeView, string> = {
    home: tr(lang, 'Buscar dibujos, plantillas o bloques…', 'Search drawings, templates or blocks…'),
    drawings: tr(lang, 'Buscar en mis dibujos…', 'Search my drawings…'),
    templates: tr(lang, 'Buscar plantillas…', 'Search templates…'),
    library: tr(lang, 'Buscar bloques y símbolos…', 'Search blocks and symbols…'),
    import: tr(lang, 'Buscar dibujos, plantillas o bloques…', 'Search drawings, templates or blocks…'),
  };
  // Inicio e Importar no tienen lista propia: la consulta muestra resultados globales.
  const showGlobalResults = (view === 'home' || view === 'import') && searchQuery.trim() !== '';

  const searchBox = (
    <div className="welcome-search" role="search">
      <Search size={16} aria-hidden="true" />
      <input
        ref={searchRef}
        type="search"
        value={searchQuery}
        aria-label={tr(lang, 'Buscar', 'Search')}
        placeholder={searchPlaceholder[view]}
        onChange={(e) => setSearchQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (searchQuery) setSearchQuery('');
            else e.currentTarget.blur();
          }
        }}
      />
      {searchQuery ? (
        <button
          type="button"
          aria-label={tr(lang, 'Limpiar búsqueda', 'Clear search')}
          onClick={() => {
            setSearchQuery('');
            searchRef.current?.focus();
          }}
        >
          <X size={15} />
        </button>
      ) : (
        <kbd title={tr(lang, 'Pulsa / para buscar', 'Press / to search')}>/</kbd>
      )}
    </div>
  );

  return (
    <main ref={homeRef} className="welcome-screen" data-testid="fmodel-welcome">
      <header className="welcome-console">
        <button
          type="button"
          className="welcome-wordmark"
          onClick={() => navigate('home')}
          aria-label={tr(lang, 'Volver al inicio', 'Back to home')}
        >
          <BrandMark size={28} />
          <span className="welcome-wordmark__text">
            <strong>FModel</strong>
            <span>2D CAD</span>
          </span>
        </button>

        {renderNav('console')}

        <div className="welcome-console__search">{searchBox}</div>

        <div className="welcome-topline-actions">
          <button
            type="button"
            className="welcome-theme-toggle"
            title={dark ? tr(lang, 'Cambiar a tema día', 'Switch to day theme') : tr(lang, 'Cambiar a tema noche', 'Switch to night theme')}
            aria-label={dark ? tr(lang, 'Cambiar a tema día', 'Switch to day theme') : tr(lang, 'Cambiar a tema noche', 'Switch to night theme')}
            onClick={() => editor.setPrefs({ theme: dark ? 'dia' : 'noche' })}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            type="button"
            className="welcome-lang-toggle"
            title={tr(lang, 'Switch to English', 'Cambiar a español')}
            aria-label={tr(lang, 'Switch to English', 'Cambiar a español')}
            onClick={() => editor.setPrefs({ lang: lang === 'es' ? 'en' : 'es' })}
          >
            {lang === 'es' ? 'EN' : 'ES'}
          </button>

          <button
            type="button"
            className="welcome-workspace-btn"
            onClick={onOpenWorkspace}
            title={tr(lang, 'Ir al lienzo de dibujo activo', 'Go to active drawing canvas')}
          >
            <Play size={15} fill="currentColor" aria-hidden="true" />
            <span>{tr(lang, 'Abrir lienzo', 'Open canvas')}</span>
          </button>

        </div>
      </header>

      <div className="welcome-main">
        <div className="welcome-content">
          {showGlobalResults ? (
            <SearchResults
              editor={editor}
              dark={dark}
              query={searchQuery}
              onOpenWorkspace={onOpenWorkspace}
              onSeeAll={(next) => navigate(next, true)}
            />
          ) : (
            <>
              {view === 'home' && (
                <FModelHome
                  editor={editor}
                  dark={dark}
                  onContinue={onOpenWorkspace}
                  onCreateBlank={handleCreateBlank}
                  onOpenTemplates={() => navigate('templates')}
                  onOpenDrawings={() => navigate('drawings')}
                  onOpenLibrary={() => navigate('library')}
                  onOpenImport={() => navigate('import')}
                />
              )}
              {view === 'drawings' && (
                <DrawingsView
                  editor={editor}
                  dark={dark}
                  onOpenWorkspace={onOpenWorkspace}
                  onCreateBlank={handleCreateBlank}
                  searchFilter={searchQuery}
                />
              )}
              {view === 'templates' && (
                <TemplatesView editor={editor} dark={dark} onOpenWorkspace={onOpenWorkspace} searchFilter={searchQuery} />
              )}
              {view === 'library' && (
                <LibraryCatalogView editor={editor} onOpenWorkspace={onOpenWorkspace} searchFilter={searchQuery} />
              )}
              {view === 'import' && <ImportCenterView editor={editor} onOpenWorkspace={onOpenWorkspace} />}
            </>
          )}
        </div>
      </div>

      {renderNav('tabbar')}
    </main>
  );
}
