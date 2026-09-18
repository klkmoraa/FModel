import { Download, FolderPlus, Pencil, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LibraryBlock } from '../../blocks/library';
import { insertLibraryBlock } from '../../blocks/library';
import type { LibraryCategory } from '../../blocks/libraryCategories';
import { categoryPath, categoryTree, descendantIds, UNCLASSIFIED } from '../../blocks/libraryCategories';
import { commitLibrary, loadCategories, loadLibrary, onLibraryChanged } from '../../blocks/libraryStore';
import { newId } from '../../document/ids';
import type { Editor } from '../../editor/editor';
import { useMediaQuery } from '../hooks';
import { tr } from '../controls';

const ALL = '*all';

/** Biblioteca de bloques: árbol de categorías, búsqueda, rejilla con miniaturas y edición. */
export function LibraryView({ editor, query }: { editor: Editor; query: string }) {
  const lang = editor.lang;
  const narrow = useMediaQuery('(max-width: 720px)');
  const [items, setItems] = useState<LibraryBlock[]>([]);
  const [cats, setCats] = useState<LibraryCategory[]>([]);
  const [current, setCurrent] = useState(ALL);
  const [onlyDynamic, setOnlyDynamic] = useState(false);
  const [editing, setEditing] = useState<LibraryBlock | null>(null);
  const [manage, setManage] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    Promise.all([loadLibrary(), loadCategories()])
      .then(([b, c]) => (setItems(b), setCats(c), setError('')))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  useEffect(() => (refresh(), onLibraryChanged(refresh)), [refresh]);

  const tree = useMemo(() => categoryTree(cats), [cats]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of items) {
      m.set(b.categoryId, (m.get(b.categoryId) ?? 0) + 1);
      const parent = cats.find((c) => c.id === b.categoryId)?.parent;
      if (parent) m.set(parent, (m.get(parent) ?? 0) + 1);
    }
    return m;
  }, [items, cats]);
  const inCat = current === ALL ? null : descendantIds(cats, current);
  const q = query.trim().toLowerCase();
  const shown = items.filter((b) => (!inCat || inCat.has(b.categoryId)) && (!onlyDynamic || b.dynamic) && (!q || `${b.name} ${b.tags.join(' ')} ${b.description ?? ''}`.toLowerCase().includes(q)));

  const insert = (b: LibraryBlock) => {
    try {
      const name = insertLibraryBlock(editor.doc, b);
      editor.command('INSERT', [name]);
    } catch (err) {
      editor.runner.message('error', { es: String(err instanceof Error ? err.message : err), en: String(err instanceof Error ? err.message : err) });
    }
  };

  const catLabel = (c: LibraryCategory, child: boolean) => `${child ? '  ' : ''}${c.name} (${counts.get(c.id) ?? 0})`;

  return (
    <div className={`libview${narrow ? ' libview--narrow' : ''}`}>
      <div className="libview__bar">
        <button className="btn btn--sm" onClick={() => editor.command('LIBRARYIMPORT')} title={tr(lang, 'Importar DXF o .fmodellib', 'Import DXF or .fmodellib')}>
          <Upload size={13} /> {tr(lang, 'Importar', 'Import')}
        </button>
        <button className="btn btn--sm" onClick={() => editor.command('LIBRARYEXPORT', current === ALL ? [] : [current])} disabled={!shown.length} title={tr(lang, 'Exportar a .fmodellib', 'Export to .fmodellib')}>
          <Download size={13} /> {current === ALL ? tr(lang, 'Exportar', 'Export') : tr(lang, 'Exportar categoría', 'Export category')}
        </button>
        <button className={`btn btn--sm${manage ? ' btn--accent' : ''}`} onClick={() => setManage((m) => !m)}>
          <FolderPlus size={13} /> {tr(lang, 'Categorías', 'Categories')}
        </button>
        <label className="libview__toggle">
          <input type="checkbox" checked={onlyDynamic} onChange={(e) => setOnlyDynamic(e.target.checked)} /> {tr(lang, 'Solo dinámicos', 'Dynamic only')}
        </label>
      </div>
      {error && <div className="empty" style={{ color: 'var(--fm-danger)' }}>{error}</div>}
      {manage && <CategoryManager lang={lang} cats={cats} onDone={() => setManage(false)} />}
      <div className="libview__body">
        {narrow ? (
          <select className="select" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label={tr(lang, 'Categoría', 'Category')}>
            <option value={ALL}>{tr(lang, `Todos (${items.length})`, `All (${items.length})`)}</option>
            {tree.flatMap((n) => [
              <option key={n.cat.id} value={n.cat.id}>{catLabel(n.cat, false)}</option>,
              ...n.children.map((c) => <option key={c.id} value={c.id}>{catLabel(c, true)}</option>),
            ])}
          </select>
        ) : (
          <nav className="libtree" aria-label={tr(lang, 'Categorías', 'Categories')}>
            <button className={`libtree__item${current === ALL ? ' is-active' : ''}`} onClick={() => setCurrent(ALL)}>
              <span>{tr(lang, 'Todos', 'All')}</span>
              <span className="libtree__count">{items.length}</span>
            </button>
            {tree.map((n) => (
              <div key={n.cat.id}>
                <button className={`libtree__item${current === n.cat.id ? ' is-active' : ''}`} onClick={() => setCurrent(n.cat.id)}>
                  <span>{n.cat.name}</span>
                  <span className="libtree__count">{counts.get(n.cat.id) ?? 0}</span>
                </button>
                {n.children.map((c) => (
                  <button key={c.id} className={`libtree__item libtree__item--child${current === c.id ? ' is-active' : ''}`} onClick={() => setCurrent(c.id)}>
                    <span>{c.name}</span>
                    <span className="libtree__count">{counts.get(c.id) ?? 0}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
        <div className="libgrid">
          {shown.map((b) => (
            <div key={b.id} className="libcard" title={`${b.name}\n${categoryPath(cats, b.categoryId)}${b.tags.length ? `\n#${b.tags.join(' #')}` : ''}`}>
              <button className="libcard__thumb" onClick={() => insert(b)} aria-label={tr(lang, `Insertar ${b.name}`, `Insert ${b.name}`)}>
                {b.thumbnail ? <img src={b.thumbnail} width={64} height={64} alt="" draggable={false} /> : null}
                {b.dynamic && <span className="libbadge libcard__badge">◆</span>}
              </button>
              <div className="libcard__name">{b.name}</div>
              <div className="libcard__meta">
                <span>{categoryPath(cats, b.categoryId)}</span>
                <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setEditing(b)} title={tr(lang, 'Editar', 'Edit')}>
                  <Pencil size={12} />
                </button>
                <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => void commitLibrary({ remove: [b.id] })} title={tr(lang, 'Quitar de la biblioteca', 'Remove from library')}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {!shown.length && (
            <div className="empty">
              {items.length
                ? tr(lang, 'Ningún bloque coincide con el filtro.', 'No block matches the filter.')
                : tr(lang, 'La biblioteca está vacía. Importa un DXF o un .fmodellib, o envía un bloque del dibujo con WBLOCK.', 'The library is empty. Import a DXF or .fmodellib, or send a drawing block with WBLOCK.')}
            </div>
          )}
        </div>
      </div>
      {editing && <BlockEditor lang={lang} item={editing} tree={tree} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BlockEditor({ lang, item, tree, onClose }: { lang: 'es' | 'en'; item: LibraryBlock; tree: ReturnType<typeof categoryTree>; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [tags, setTags] = useState(item.tags.join(', '));
  const save = async () => {
    await commitLibrary({ put: [{ ...item, name: name.trim() || item.name, categoryId, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }] });
    onClose();
  };
  return (
    <div className="libedit" role="group" aria-label={tr(lang, 'Editar bloque de la biblioteca', 'Edit library block')}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={tr(lang, 'Nombre', 'Name')} />
      <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={tr(lang, 'Categoría', 'Category')}>
        {tree.flatMap((n) => [<option key={n.cat.id} value={n.cat.id}>{n.cat.name}</option>, ...n.children.map((c) => <option key={c.id} value={c.id}>{`${n.cat.name} › ${c.name}`}</option>)])}
      </select>
      <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={tr(lang, 'Etiquetas, separadas por comas', 'Tags, comma separated')} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn--sm" onClick={onClose}>{tr(lang, 'Cancelar', 'Cancel')}</button>
        <button className="btn btn--sm btn--primary" onClick={() => void save()}>{tr(lang, 'Guardar', 'Save')}</button>
      </div>
    </div>
  );
}

function CategoryManager({ lang, cats, onDone }: { lang: 'es' | 'en'; cats: LibraryCategory[]; onDone: () => void }) {
  const tree = categoryTree(cats);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const order = cats.filter((c) => (c.parent ?? '') === parent).length;
    await commitLibrary({ categories: [parent ? { id: newId('cat'), name: n, parent, order } : { id: newId('cat'), name: n, order }] });
    setName('');
  };
  const rename = (c: LibraryCategory) => {
    const n = window.prompt(tr(lang, 'Nuevo nombre', 'New name'), c.name)?.trim();
    if (n) void commitLibrary({ categories: [{ ...c, name: n }] });
  };
  const remove = (c: LibraryCategory) => {
    if (window.confirm(tr(lang, `¿Borrar «${c.name}»? Sus bloques pasan a «Sin clasificar».`, `Delete "${c.name}"? Its blocks move to "Unclassified".`))) void commitLibrary({ removeCategories: [c.id] });
  };
  return (
    <div className="libedit">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 120 }} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && void add())} placeholder={tr(lang, 'Nueva categoría', 'New category')} />
        <select className="select" value={parent} onChange={(e) => setParent(e.target.value)} aria-label={tr(lang, 'Dentro de', 'Inside')}>
          <option value="">{tr(lang, '(nivel principal)', '(top level)')}</option>
          {tree.map((n) => <option key={n.cat.id} value={n.cat.id}>{n.cat.name}</option>)}
        </select>
        <button className="btn btn--sm btn--primary" onClick={() => void add()}>{tr(lang, 'Añadir', 'Add')}</button>
        <button className="btn btn--sm" onClick={onDone}>{tr(lang, 'Listo', 'Done')}</button>
      </div>
      <div className="list" style={{ maxHeight: 180, overflow: 'auto' }}>
        {tree.flatMap((n) => [n.cat, ...n.children]).map((c) => (
          <div key={c.id} className="list-row" style={{ paddingLeft: c.parent ? 20 : 8 }}>
            <span style={{ flex: 1 }}>{c.name}</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => rename(c)} title={tr(lang, 'Renombrar', 'Rename')}><Pencil size={12} /></button>
            {c.id !== UNCLASSIFIED && <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => remove(c)} title={tr(lang, 'Borrar', 'Delete')}><Trash2 size={12} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
