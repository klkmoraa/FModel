import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Box, FileCode, LayoutTemplate, SearchX } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import { TEMPLATES_CATALOG, type TemplateDefinition } from '../../templates';
import type { StoredDrawing } from '../../storage/persistence';
import type { LibraryBlock } from '../../blocks/library';
import { loadLibrary } from '../../blocks/libraryStore';
import { getServices } from '../../app/services';
import { tr } from '../controls';
import { confirmDiscard, insertBlock, openStoredDrawing, openTemplate } from './actions';
import { useTemplatePreview } from './templatePreview';
import { searchWelcome } from './welcomeSearch';
import type { WelcomeView } from './WelcomeScreen';

const PER_GROUP = 4;

interface SearchResultsProps {
  editor: Editor;
  dark: boolean;
  query: string;
  onOpenWorkspace: () => void;
  /** Abre la vista completa conservando la consulta. */
  onSeeAll: (view: WelcomeView) => void;
}

export function SearchResults({ editor, dark, query, onOpenWorkspace, onSeeAll }: SearchResultsProps) {
  const lang = editor.lang;
  const [drawings, setDrawings] = useState<StoredDrawing[]>([]);
  const [blocks, setBlocks] = useState<LibraryBlock[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getServices()
      .persistence.drawings()
      .then(setDrawings)
      .catch(() => setDrawings([]));
    void loadLibrary()
      .then(setBlocks)
      .catch(() => setBlocks([]));
  }, []);

  const results = useMemo(
    () => searchWelcome(query, lang, { drawings, templates: TEMPLATES_CATALOG, blocks }),
    [query, lang, drawings, blocks],
  );

  const run = async (action: () => void, needsDiscard: boolean) => {
    if (needsDiscard && !(await confirmDiscard(editor))) return;
    try {
      action();
      onOpenWorkspace();
    } catch {
      setError(tr(lang, 'No se pudo abrir este elemento. El archivo puede estar dañado.', 'Could not open this item. The file may be damaged.'));
    }
  };

  if (results.total === 0) {
    return (
      <section className="welcome-results welcome-results--empty" aria-live="polite">
        <SearchX size={36} aria-hidden="true" />
        <h2>{tr(lang, `Sin resultados para «${query.trim()}»`, `No results for “${query.trim()}”`)}</h2>
        <p>{tr(lang, 'Prueba con otra palabra: nombre del dibujo, formato (A3, 1:50) o tipo de bloque.', 'Try another word: drawing name, format (A3, 1:50) or block type.')}</p>
      </section>
    );
  }

  return (
    <section className="welcome-results" aria-live="polite" aria-label={tr(lang, 'Resultados de búsqueda', 'Search results')}>
      <p className="welcome-results__summary">
        {tr(lang, `${results.total} resultados`, `${results.total} results`)}
      </p>
      {error && (
        <p className="welcome-results__error" role="alert">
          {error}
        </p>
      )}

      {results.drawings.length > 0 && (
        <Group
          title={tr(lang, 'Mis dibujos', 'My drawings')}
          count={results.drawings.length}
          seeAll={tr(lang, 'Ver todos', 'See all')}
          onSeeAll={() => onSeeAll('drawings')}
        >
          {results.drawings.slice(0, PER_GROUP).map((d) => (
            <ResultRow
              key={d.id}
              icon={<FileCode size={18} />}
              title={d.name}
              meta={new Date(d.savedAt).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
              onClick={() => run(() => openStoredDrawing(editor, d), true)}
            />
          ))}
        </Group>
      )}

      {results.templates.length > 0 && (
        <Group
          title={tr(lang, 'Plantillas', 'Templates')}
          count={results.templates.length}
          seeAll={tr(lang, 'Ver todas', 'See all')}
          onSeeAll={() => onSeeAll('templates')}
        >
          {results.templates.slice(0, PER_GROUP).map((t: TemplateDefinition) => (
            <ResultRow
              key={t.id}
              icon={<TemplateThumb tpl={t} dark={dark} />}
              title={t.name[lang]}
              meta={`${t.badge[lang]} · ${t.format}`}
              onClick={() => run(() => openTemplate(editor, t), true)}
            />
          ))}
        </Group>
      )}

      {results.blocks.length > 0 && (
        <Group
          title={tr(lang, 'Bloques', 'Blocks')}
          count={results.blocks.length}
          seeAll={tr(lang, 'Ver todos', 'See all')}
          onSeeAll={() => onSeeAll('library')}
        >
          {results.blocks.slice(0, PER_GROUP).map((b) => (
            <ResultRow
              key={b.id}
              icon={<Box size={18} />}
              thumb={b.thumbnail}
              thumbKind="block"
              title={b.name}
              meta={b.dynamic ? tr(lang, 'Bloque dinámico · insertar', 'Dynamic block · insert') : tr(lang, 'Insertar en el dibujo', 'Insert into drawing')}
              onClick={() => run(() => insertBlock(editor, b), false)}
            />
          ))}
        </Group>
      )}
    </section>
  );
}

function Group({
  title,
  count,
  seeAll,
  onSeeAll,
  children,
}: {
  title: string;
  count: number;
  seeAll: string;
  onSeeAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="welcome-results__group">
      <header>
        <h3>
          {title} <span>{count}</span>
        </h3>
        {count > PER_GROUP && (
          <button type="button" className="fmodel-section__link" onClick={onSeeAll}>
            <span>{seeAll}</span>
            <ArrowRight size={14} />
          </button>
        )}
      </header>
      <div className="welcome-results__list">{children}</div>
    </div>
  );
}

function ResultRow({
  icon,
  thumb,
  thumbKind,
  title,
  meta,
  onClick,
}: {
  icon: React.ReactNode;
  thumb?: string;
  /** 'block': trazo negro sobre transparente, se invierte en tema noche */
  thumbKind?: 'block';
  title: string;
  meta: string;
  onClick: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <button type="button" className="welcome-result" onClick={onClick}>
      <span className="welcome-result__media" aria-hidden="true">
        {thumb && !thumbFailed ? <img src={thumb} alt="" data-kind={thumbKind} draggable={false} onError={() => setThumbFailed(true)} /> : icon}
      </span>
      <span className="welcome-result__text">
        <strong title={title}>{title}</strong>
        <small>{meta}</small>
      </span>
      <ArrowRight size={14} className="welcome-result__go" aria-hidden="true" />
    </button>
  );
}

function TemplateThumb({ tpl, dark }: { tpl: TemplateDefinition; dark: boolean }) {
  const src = useTemplatePreview(tpl, dark);
  return src ? <img src={src} alt="" draggable={false} /> : <LayoutTemplate size={18} />;
}
