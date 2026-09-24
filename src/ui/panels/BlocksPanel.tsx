import { BookmarkPlus, MoveHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { blockUsage, isInsertableBlock } from '../../blocks/blockOps';
import type { Editor } from '../../editor/editor';
import { blockThumbnail } from '../../render/thumbnail';
import { LibraryView } from './LibraryView';
import { useEditorEvents, useMediaQuery } from '../hooks';
import { tr } from '../controls';

import { DND_MIME } from '../dnd';

export function BlocksPanel({ editor, onUi }: { editor: Editor; onUi: (ui: string, cmd?: string) => void }) {
  useEditorEvents(editor, ['doc']);
  const lang = editor.lang;
  const doc = editor.doc;
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = editor.prefs.theme === 'noche' || (editor.prefs.theme === 'system' && systemDark);
  const [tab, setTab] = useState<'current' | 'favorites' | 'library'>('current');
  const [q, setQ] = useState('');
  const usage = useMemo(() => blockUsage(doc), [doc.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocks = [...doc.data.blocks.values()]
    .filter(isInsertableBlock)
    .filter((b) => (tab === 'favorites' ? b.favorite : true))
    .filter((b) => !q || `${b.name} ${b.description} ${b.category ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const insert = (name: string) => editor.command('INSERT', [name]);

  return (
    <div className="panel panel--blocks">
      <div className="panel__head">
        <div className="panel-tabs" role="tablist">
          {(['current', 'favorites', 'library'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`btn btn--sm${tab === t ? ' btn--accent' : ''}`} onClick={() => setTab(t)}>
              {t === 'current' ? tr(lang, 'Dibujo', 'Drawing') : t === 'favorites' ? tr(lang, 'Favoritos', 'Favorites') : tr(lang, 'Biblioteca', 'Library')}
            </button>
          ))}
        </div>
      </div>
      <input className="input" placeholder={tr(lang, 'Buscar bloques…', 'Search blocks…')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="panel-actions">
        <button className="btn btn--sm" onClick={() => editor.command('BLOCK')}>
          {tr(lang, 'Crear bloque', 'Create block')}
        </button>
        <button className="btn btn--sm" onClick={() => editor.command('DYNBLOCKSAMPLES')}>
          {tr(lang, 'Ejemplos dinámicos', 'Dynamic samples')}
        </button>
        <button className="btn btn--sm" onClick={() => onUi('attribute-extraction')}>
          {tr(lang, 'Extraer atributos', 'Extract attributes')}
        </button>
      </div>
      {tab !== 'library' ? (
        <div className="block-grid">
          {blocks.map((b) => {
            const thumb = blockThumbnail(editor, b.id, 96, dark);
            return (
              <div
                key={b.id}
                className="block-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: 'block', name: b.name }))}
                title={`${b.name}\n${b.description}`}
              >
                <button className="block-card__preview" onClick={() => insert(b.name)} aria-label={tr(lang, `Insertar ${b.name}`, `Insert ${b.name}`)}>
                  {thumb && <img src={thumb} width={72} height={72} alt="" draggable={false} />}
                </button>
                <div className="block-card__name">{b.name}</div>
                <div className="block-card__meta">
                  <span className="eyebrow">
                    {b.dynamic ? '◆ ' : ''}×{usage.get(b.id) ?? 0}
                  </span>
                  <button className={`icon-btn${b.favorite ? ' is-favorite' : ''}`} onClick={() => doc.transact('BLOCK FAVORITE', (tx) => tx.update('blocks', b.id, { favorite: !b.favorite }))} title={tr(lang, 'Favorito', 'Favorite')}>
                    <Star size={12} />
                  </button>
                  {!b.dynamic && (
                    <button className="icon-btn" onClick={() => editor.command('BESTIRABLE', [b.name])} title={tr(lang, 'Hacer estirable (Ancho y Fondo)', 'Make stretchable (Width and Depth)')}>
                      <MoveHorizontal size={12} />
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => editor.command('WBLOCK', [b.name])} title={tr(lang, 'Enviar a la biblioteca', 'Send to library')}>
                    <BookmarkPlus size={12} />
                  </button>
                  <button className="icon-btn" onClick={() => editor.command('BEDIT', [b.name])} title={tr(lang, 'Editar definición', 'Edit definition')}>
                    <Pencil size={12} />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={!!usage.get(b.id)}
                    onClick={() => doc.transact('BLOCK DELETE', (tx) => {
                      for (const e of doc.entitiesOf(b.id)) tx.removeEntity(e.id);
                      tx.remove('blocks', b.id);
                    })}
                    title={usage.get(b.id) ? tr(lang, 'En uso: no se puede eliminar', 'In use: cannot delete') : tr(lang, 'Eliminar definición', 'Delete definition')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {!blocks.length && <div className="empty">{tab === 'favorites' ? tr(lang, 'Marca bloques con ★ para verlos aquí.', 'Star blocks to see them here.') : tr(lang, 'Todavía no hay bloques. Crea uno con BLOCK o inserta los ejemplos dinámicos.', 'No blocks yet. Create one with BLOCK or insert the dynamic samples.')}</div>}
        </div>
      ) : (
        <LibraryView editor={editor} query={q} />
      )}
    </div>
  );
}
