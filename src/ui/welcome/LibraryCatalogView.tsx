import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Box, Download, FolderInput, Plus } from 'lucide-react';
import type { Editor } from '../../editor/editor';
import type { LibraryBlock } from '../../blocks/library';
import { descendantIds, type LibraryCategory } from '../../blocks/libraryCategories';
import { loadCategories, loadLibrary } from '../../blocks/libraryStore';
import { tr } from '../controls';
import { InlineAlert } from './InlineAlert';
import { insertBlock } from './actions';
import { matchesQuery } from './welcomeSearch';

const PAGE = 48;

interface LibraryCatalogViewProps {
  editor: Editor;
  onOpenWorkspace: () => void;
  searchFilter?: string;
}

export function LibraryCatalogView({ editor, onOpenWorkspace, searchFilter = '' }: LibraryCatalogViewProps) {
  const lang = editor.lang;
  const [blocks, setBlocks] = useState<LibraryBlock[]>([]);
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [selected, setSelected] = useState<string>('*all');
  const [onlyDynamic, setOnlyDynamic] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadLibrary(), loadCategories()])
      .then(([b, c]) => {
        setBlocks(b);
        setCategories(c);
      })
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false));
  }, []);

  // Solo categorías principales con bloques (contando sus subcategorías)
  const groups = useMemo(() => {
    return categories
      .filter((c) => !c.parent)
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const ids = descendantIds(categories, c.id);
        return { cat: c, ids, count: blocks.filter((b) => ids.has(b.categoryId)).length };
      })
      .filter((g) => g.count > 0);
  }, [categories, blocks]);

  const selectedIds = groups.find((g) => g.cat.id === selected)?.ids;
  const filtered = blocks.filter(
    (b) =>
      (!selectedIds || selectedIds.has(b.categoryId)) &&
      (!onlyDynamic || b.dynamic) &&
      matchesQuery(searchFilter, [b.name, b.description, ...b.tags]),
  );
  const dynamicCount = blocks.filter((b) => b.dynamic).length;

  // Al cambiar de filtro se vuelve a la primera página
  useEffect(() => setLimit(PAGE), [selected, onlyDynamic, searchFilter]);

  const handleInsert = (block: LibraryBlock) => {
    try {
      insertBlock(editor, block);
      onOpenWorkspace();
    } catch {
      setFailed(block.name);
    }
  };

  const runCommand = (cmd: string) => {
    editor.command(cmd);
    onOpenWorkspace();
  };

  if (loading) return <div className="welcome-loading">{tr(lang, 'Cargando la biblioteca…', 'Loading the library…')}</div>;

  if (!blocks.length) {
    return (
      <section className="welcome-view welcome-library" aria-label={tr(lang, 'Biblioteca de bloques', 'Block library')}>
        <LibraryHead lang={lang} total={0} dynamic={0} onImport={() => runCommand('LIBRARYIMPORT')} />
        <div className="welcome-empty">
          <BookOpen size={40} className="welcome-empty__icon" aria-hidden="true" />
          <h3>{tr(lang, 'Tu biblioteca está vacía', 'Your library is empty')}</h3>
          <p>
            {tr(
              lang,
              'Instala la biblioteca inicial —100 bloques de LibreCAD (GPL-2.0) y 12 muebles paramétricos de FModel— o importa tus propios bloques desde un DXF, DWG o .fmodellib.',
              'Install the starter library —100 LibreCAD blocks (GPL-2.0) and 12 FModel parametric furniture pieces— or import your own blocks from a DXF, DWG or .fmodellib.',
            )}
          </p>
          <div className="welcome-empty__actions">
            <button type="button" className="welcome-action-btn welcome-action-btn--primary" onClick={() => runCommand('LIBRARYSTARTER')}>
              <Download size={16} aria-hidden="true" />
              <span>{tr(lang, 'Instalar biblioteca inicial', 'Install starter library')}</span>
            </button>
            <button type="button" className="welcome-action-btn" onClick={() => runCommand('LIBRARYIMPORT')}>
              <FolderInput size={16} aria-hidden="true" />
              <span>{tr(lang, 'Importar bloques', 'Import blocks')}</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="welcome-view welcome-library" aria-label={tr(lang, 'Biblioteca de bloques', 'Block library')}>
      <LibraryHead lang={lang} total={blocks.length} dynamic={dynamicCount} onImport={() => runCommand('LIBRARYIMPORT')} />

      <div className="welcome-filters">
        <div className="welcome-categories" role="tablist" aria-label={tr(lang, 'Categorías', 'Categories')}>
          <button type="button" role="tab" aria-selected={selected === '*all'} className={`welcome-cat-btn${selected === '*all' ? ' is-active' : ''}`} onClick={() => setSelected('*all')}>
            {tr(lang, 'Todos', 'All')} <span className="fmodel-count">{blocks.length}</span>
          </button>
          {groups.map(({ cat, count }) => (
            <button key={cat.id} type="button" role="tab" aria-selected={selected === cat.id} className={`welcome-cat-btn${selected === cat.id ? ' is-active' : ''}`} onClick={() => setSelected(cat.id)}>
              {cat.name} <span className="fmodel-count">{count}</span>
            </button>
          ))}
        </div>
        {dynamicCount > 0 && (
          <label className="welcome-toggle">
            <input type="checkbox" checked={onlyDynamic} onChange={(e) => setOnlyDynamic(e.currentTarget.checked)} />
            <span className="welcome-toggle__track" aria-hidden="true" />
            <span>{tr(lang, 'Solo dinámicos', 'Dynamic only')}</span>
          </label>
        )}
      </div>

      {failed && (
        <InlineAlert lang={lang} onClose={() => setFailed(null)}>
          {tr(lang, `No se pudo insertar «${failed}»: el bloque guardado está dañado. El dibujo no se ha modificado.`, `Could not insert “${failed}”: the stored block is damaged. The drawing was not changed.`)}
        </InlineAlert>
      )}

      {filtered.length > 0 ? (
        <>
          <p className="welcome-results__summary">
            {filtered.length > limit
              ? tr(lang, `${limit} de ${filtered.length} bloques`, `${limit} of ${filtered.length} blocks`)
              : tr(lang, `${filtered.length} bloques`, `${filtered.length} blocks`)}
          </p>
          <div className="welcome-library__grid">
            {filtered.slice(0, limit).map((b) => (
              <button key={b.id} type="button" className="welcome-block-card" onClick={() => handleInsert(b)} title={b.description || b.name}>
                <span className="welcome-block-card__preview">
                  {b.thumbnail ? <img src={b.thumbnail} alt="" className="welcome-block-card__thumb" draggable={false} /> : <Box size={28} className="welcome-block-card__placeholder" aria-hidden="true" />}
                  {b.dynamic && <span className="welcome-block-card__tag">{tr(lang, 'Dinámico', 'Dynamic')}</span>}
                </span>
                <span className="welcome-block-card__info">
                  <span className="welcome-block-card__title">{b.name}</span>
                  <span className="welcome-block-card__insert">
                    <Plus size={13} aria-hidden="true" />
                    {tr(lang, 'Insertar', 'Insert')}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {filtered.length > limit && (
            <button type="button" className="fmodel-more" onClick={() => setLimit((l) => l + PAGE)}>
              <span>{tr(lang, `Mostrar ${Math.min(PAGE, filtered.length - limit)} más`, `Show ${Math.min(PAGE, filtered.length - limit)} more`)}</span>
            </button>
          )}
        </>
      ) : (
        <div className="welcome-empty">
          <BookOpen size={40} className="welcome-empty__icon" aria-hidden="true" />
          <h3>{tr(lang, 'Ningún bloque coincide', 'No matching blocks')}</h3>
          <p>{tr(lang, 'Prueba con otro término o quita algún filtro.', 'Try another term or clear a filter.')}</p>
        </div>
      )}
    </section>
  );
}

function LibraryHead({ lang, total, dynamic, onImport }: { lang: 'es' | 'en'; total: number; dynamic: number; onImport: () => void }) {
  return (
    <header className="welcome-view__head">
      <div>
        <h2>{tr(lang, 'Biblioteca de bloques', 'Block library')}</h2>
        <p>
          {total
            ? tr(lang, `${total} bloques guardados en este navegador, ${dynamic} de ellos dinámicos. Pulsa uno para colocarlo en el lienzo.`, `${total} blocks saved in this browser, ${dynamic} of them dynamic. Click one to place it on the canvas.`)
            : tr(lang, 'Bloques reutilizables guardados en este navegador.', 'Reusable blocks saved in this browser.')}
        </p>
      </div>
      <div className="welcome-empty__actions">
        <button type="button" className="welcome-action-btn" onClick={onImport}>
          <FolderInput size={16} aria-hidden="true" />
          <span>{tr(lang, 'Importar bloques', 'Import blocks')}</span>
        </button>
      </div>
    </header>
  );
}
